import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FLASHCARDS_ROOT, resolvePath, shellQuote } from './paths.js';
import { buildContextManifest, buildSubjectContextManifest } from './context.js';
import {
    discardIsolatedRun,
    finishIsolatedRun,
    isolatedResultPath,
    prepareIsolatedRun,
    recordIsolatedInvocation
} from './isolation.js';
import { markFullBuilt, markPilotBuilt, requireFullBuildApproval } from './pilot.js';
import { stabilizeDeck, validateDeck } from './validation.js';

function auditTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function configuredModel() {
    if (process.env.FLASHCARDS_CODEX_MODEL) return process.env.FLASHCARDS_CODEX_MODEL;
    const configPath = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
    if (!existsSync(configPath)) return undefined;
    return /^model\s*=\s*"([^"]+)"/m.exec(readFileSync(configPath, 'utf8'))?.[1];
}

function codexVersion() {
    const result = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') throw new Error('Codex CLI is not installed or not available on PATH.');
    if (result.status !== 0) throw new Error(`Unable to inspect Codex: ${(result.stderr || result.stdout).trim()}`);
    return result.stdout.trim();
}

function requireSafeAuditWorktree(deckPath, allowDirty) {
    const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: deckPath,
        encoding: 'utf8'
    });
    if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
        throw new Error('An editing audit requires the deck to be a Git repository. Use --report-only for inspection.');
    }
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: deckPath, encoding: 'utf8' });
    if (status.status !== 0) throw new Error(`Unable to inspect the deck worktree: ${status.stderr.trim()}`);
    if (!allowDirty && status.stdout.trim()) {
        throw new Error('The deck has uncommitted changes. Commit them first or pass --allow-dirty intentionally.');
    }
}

function chapterNameForOrder(deckPath, chapterNumber) {
    const prefix = `${String(chapterNumber).padStart(2, '0')}_`;
    const chapterName = readdirSync(path.join(deckPath, 'flashcards'))
        .filter(name => /^\d{2}_.+\.md$/.test(name))
        .find(name => name.startsWith(prefix));
    if (!chapterName) throw new Error(`No ordered chapter ${chapterNumber} exists in ${deckPath}.`);
    return chapterName;
}

function chapterAuditName(chapterName) {
    return `${chapterName.replace(/\.md$/, '')}-cold-start.md`;
}

function deckModeInstruction(mode, buildScope, reportOnly, chapterNumber, chapterName) {
    if (mode === 'build' && buildScope === 'pilot') {
        return 'Research and design the curriculum, but AUTHOR ONLY THE FIRST ORDERED CHAPTER as a novice-first pilot. If no ordered chapter exists, design the chapter map and create the first chapter. Do not author, delete, or modify cards in later chapters. Complete the pilot dependency ledger and write .flashcards/audits/pilot-cold-start.md with a front-by-front audit. Include the exact lines "cold_start_status: pass" and "unresolved_dependencies: 0" only when no unexplained dependency remains, then stop for human approval.';
    }
    if (mode === 'build' && buildScope === 'chapter') {
        const auditName = chapterAuditName(chapterName);
        return `AUTHOR ONLY ORDERED CHAPTER ${chapterNumber} (${chapterName}). Treat the scheduled cards in chapters 1 through ${chapterNumber - 1} as the only established subject prerequisites, together with the declared learner contract. Do not author, delete, inspect for scaffolding, or modify later chapters, and do not modify earlier chapter cards or figures. Complete a chapter-boundary dependency ledger and write .flashcards/audits/${auditName} with a front-by-front audit. Include the exact lines "cold_start_status: pass" and "unresolved_dependencies: 0" only when no unexplained dependency remains.`;
    }
    if (mode === 'build') {
        return 'Build the approved curriculum chapter by chapter. Repeat the dependency scan across every chapter boundary and write .flashcards/audits/full-cold-start.md. Include the exact lines "cold_start_status: pass" and "unresolved_dependencies: 0" only when no unexplained dependency remains.';
    }
    if (reportOnly) return 'Audit the entire deck and write no files. Return a prioritized, evidence-backed report.';
    return 'Audit and improve the entire deck, working chapter by chapter while preserving review history.';
}

export function resetChapterForRegeneration(deckPath, chapterNumber) {
    const chapterName = chapterNameForOrder(deckPath, chapterNumber);
    const flashcardsPath = path.join(deckPath, 'flashcards');
    const chapterPath = path.join(flashcardsPath, chapterName);
    const markdown = readFileSync(chapterPath, 'utf8');
    const frontmatter = /^\+\+\+\n[\s\S]*?\n\+\+\+\n/.exec(markdown)?.[0];
    if (!frontmatter) throw new Error(`Fresh chapter regeneration requires TOML frontmatter: ${chapterPath}`);
    writeFileSync(
        chapterPath,
        `${frontmatter}\n<!-- Fresh isolated chapter-${chapterNumber} regeneration: author cards from the declared context. -->\n`
    );

    const figurePath = path.join(deckPath, 'figures', chapterName.replace(/\.md$/, ''));
    rmSync(figurePath, { recursive: true, force: true });
    mkdirSync(figurePath, { recursive: true });
    writeFileSync(path.join(figurePath, '.gitkeep'), '');
    return { chapterName, chapterPath, figurePath };
}

export function resetPilotForRegeneration(deckPath) {
    return resetChapterForRegeneration(deckPath, 1);
}

function buildDeckPrompt({
    mode,
    targetPath,
    subject,
    contextFiles,
    skillPath,
    preflightPath,
    reportOnly,
    buildScope,
    chapterNumber,
    chapterName,
    freshChapter,
    freshPilot,
    extraInstructions,
    isolated
}) {
    return [
        `Use $manage-flashcard-decks in ${mode} mode. Read the complete skill at ${skillPath} before acting.`,
        `Target deck: ${targetPath}`,
        `Subject: ${subject}`,
        isolated
            ? 'This is an isolated fresh-agent run. Use only the target workspace, the ordered staged context below, and sources you deliberately find through live web research.'
            : `Read-only flashcards application and standards: ${FLASHCARDS_ROOT}`,
        preflightPath ? `Machine-readable preflight report: ${preflightPath}` : null,
        'Read every present file in this ordered context manifest completely before acting:',
        ...contextFiles.map((file, index) => `${index + 1}. [${file.role}] ${file.path}`),
        deckModeInstruction(mode, buildScope, reportOnly, chapterNumber, chapterName),
        freshChapter
            ? `Chapter ${chapterNumber} (${chapterName}) was intentionally blanked inside this temporary workspace. Design and author it from the declared learner model, the scheduled prerequisites in earlier chapters, standards, domain guide, and current research; do not reconstruct or recover the previous implementation from outside the workspace.`
            : null,
        freshPilot
            ? 'The pilot chapter was intentionally blanked inside this temporary workspace. Design and author it from the declared learner model, standards, domain guide, and current research; do not reconstruct or recover the previous pilot from outside the workspace. Work only on chapter 1, its figures, the deck planning documents, and the pilot audit.'
            : null,
        'Before large-scale authoring, complete a chapter design ledger covering retrieval targets, card-form choices, problem progression, authentic representations, and included or intentionally omitted figure opportunities.',
        'Treat all unconfirmed domain knowledge as unseen. Build a concept-dependency ledger and perform the cold-start scan without reading each answer until that front\'s dependencies are recorded.',
        'The application schedules only Q:/A:, C:, and P:/S: blocks. Headings, lesson prose, tables, equations, and figures outside those blocks are ignored by the parser and cannot satisfy initial-learning prerequisites; embed a minimal teaching bridge on a scheduled front or establish it in an earlier scheduled card.',
        'Never use terminology, symbols, representations, or examples from a later chapter to scaffold an earlier chapter unless a minimal explicit bridge establishes them first.',
        'Do not optimize for a type distribution or figure count. Zero clozes may be correct; visually rich chapters may need several figures. Do not treat one figure per chapter as a target or cap.',
        'Before handoff, reconcile and report planned versus actual card-type, problem, and figure inventories by chapter, investigating unexplained omissions.',
        'Do not load deprecated compatibility guides or unrelated subject encyclopedias unless the user explicitly asks.',
        isolated
            ? 'Do not inspect files outside this workspace. Do not modify .agents/, .flashcards/context/, or AGENTS.override.md.'
            : 'Do not edit the flashcards application repository; make deck and subject changes only in the target workspaces.',
        'Do not commit, push, create a remote repository, or deploy.',
        extraInstructions ? `Additional user instructions: ${extraInstructions}` : null
    ].filter(Boolean).join('\n');
}

function buildSubjectPrompt({ subject, targetPath, contextFiles, skillPath, guideExists, extraInstructions, isolated }) {
    return [
        `Use $manage-flashcard-decks to design the ${subject} subject workspace. Read the complete skill at ${skillPath} before acting.`,
        `Target subject workspace: ${targetPath}`,
        isolated
            ? 'This is an isolated fresh-agent run. Use only the target workspace, the ordered staged context below, and sources you deliberately find through live web research.'
            : `Read-only flashcards application and standards: ${FLASHCARDS_ROOT}`,
        'Read every present file in this ordered context manifest completely before acting:',
        ...contextFiles.map((file, index) => `${index + 1}. [${file.role}] ${file.path}`),
        'Research authoritative curriculum frameworks and the current structure of the field. Complete SUBJECT_BRIEF.md and ROADMAP.md as an explicit, prerequisite-aware proposal. Treat unconfirmed learner knowledge as unseen and mark genuinely personal decisions for user confirmation rather than inventing them.',
        guideExists
            ? 'Use the supplied reusable domain guide; do not duplicate it into the subject workspace.'
            : 'No reusable domain guide exists. Create DOMAIN_GUIDE.md in the subject workspace. It must cover durable domain-specific authoring judgment, breadth and subfield balance, representations, misconceptions, evidence authorities, and accuracy checks without copying the universal standards.',
        'Do not create a deck or author cards in this run. Do not commit, push, create a remote repository, or deploy.',
        isolated ? 'Do not inspect files outside this workspace. Do not modify .agents/, .flashcards/context/, or AGENTS.override.md.' : null,
        extraInstructions ? `Additional user instructions: ${extraInstructions}` : null
    ].filter(Boolean).join('\n');
}

function buildCodexInvocation({
    workspacePath,
    prompt,
    reportOnly = false,
    model,
    reasoningEffort = 'high',
    nonInteractive = false,
    isolated = true,
    resultPath
}) {
    const resolvedModel = model || configuredModel();
    const args = [
        '--search',
        '--sandbox', reportOnly ? 'read-only' : 'workspace-write',
        '--cd', workspacePath
    ];
    if (resolvedModel) args.push('--model', resolvedModel);
    if (isolated) {
        args.push(
            '-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
            '-c', 'personality="none"',
            '-c', 'features.memories=false',
            '-c', 'features.multi_agent=false',
            'exec',
            '--ephemeral',
            '--ignore-user-config',
            '--ignore-rules',
            '--json'
        );
        if (resultPath) args.push('--output-last-message', resultPath);
        args.push(prompt);
    } else if (nonInteractive) {
        args.push('exec', prompt);
    } else {
        args.push(prompt);
    }
    return { command: 'codex', args, prompt, workspacePath, model: resolvedModel, reasoningEffort, isolated };
}

export function buildAgentInvocation({
    mode,
    deckPath: inputPath,
    nonInteractive = false,
    reportOnly = false,
    model,
    reasoningEffort = 'high',
    extraInstructions,
    preflightPath,
    buildScope = 'pilot',
    chapterNumber,
    freshChapter = false,
    freshPilot = false,
    isolated = true
}) {
    const deckPath = resolvePath(inputPath);
    const contextManifest = buildContextManifest({ deckPath, mode, preflightPath });
    const missingRequired = contextManifest.files.filter(file => file.required && !file.exists);
    if (missingRequired.length) {
        throw new Error(`Missing required authoring context: ${missingRequired.map(file => file.path).join(', ')}`);
    }
    const contextFiles = contextManifest.files.filter(file => file.exists);
    const chapterName = buildScope === 'chapter' ? chapterNameForOrder(deckPath, chapterNumber) : undefined;
    const prompt = buildDeckPrompt({
        mode,
        targetPath: deckPath,
        subject: contextManifest.subject,
        contextFiles,
        skillPath: path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
        preflightPath,
        reportOnly,
        buildScope,
        chapterNumber,
        chapterName,
        freshChapter,
        freshPilot,
        extraInstructions,
        isolated
    });
    const invocation = buildCodexInvocation({
        workspacePath: deckPath,
        prompt,
        reportOnly,
        model,
        reasoningEffort,
        nonInteractive,
        isolated
    });
    return { ...invocation, deckPath, subjectRoot: contextManifest.subjectRoot, contextManifest };
}

export function buildSubjectAgentInvocation({
    subjectPath: inputPath,
    model,
    reasoningEffort = 'high',
    extraInstructions,
    nonInteractive = false,
    isolated = true
}) {
    const subjectPath = resolvePath(inputPath);
    const contextManifest = buildSubjectContextManifest({ subjectPath });
    const missingRequired = contextManifest.files.filter(file => file.required && !file.exists);
    if (missingRequired.length) {
        throw new Error(`Missing required subject context: ${missingRequired.map(file => file.path).join(', ')}`);
    }
    const contextFiles = contextManifest.files.filter(file => file.exists);
    const prompt = buildSubjectPrompt({
        subject: contextManifest.subject,
        targetPath: subjectPath,
        contextFiles,
        skillPath: path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
        guideExists: existsSync(contextManifest.guide.path),
        extraInstructions,
        isolated
    });
    const invocation = buildCodexInvocation({
        workspacePath: subjectPath,
        prompt,
        model,
        reasoningEffort,
        nonInteractive,
        isolated
    });
    return { ...invocation, subjectPath, contextManifest };
}

export function formatInvocation(invocation) {
    return [invocation.command, ...invocation.args].map(shellQuote).join(' ');
}

function runPreparedInvocation(prepared, invocation, { reportOnly, metadata, allowedPaths }) {
    recordIsolatedInvocation(prepared, { prompt: invocation.prompt, invocation, metadata });
    const result = spawnSync(invocation.command, invocation.args, { stdio: 'inherit' });
    if (result.error) throw new Error(`Unable to launch Codex: ${result.error.message}`);
    if (result.status !== 0) return { status: result.status, runPath: prepared.runPath };
    const finished = finishIsolatedRun(prepared, { applyChanges: !reportOnly, allowedPaths });
    return { status: 0, ...finished };
}

export function runSubjectAgent({
    subjectPath: inputPath,
    model,
    reasoningEffort = 'high',
    extraInstructions,
    dryRun = false,
    isolated = true,
    nonInteractive = false
}) {
    const subjectPath = resolvePath(inputPath);
    const preview = buildSubjectAgentInvocation({
        subjectPath,
        model,
        reasoningEffort,
        extraInstructions,
        isolated,
        nonInteractive
    });
    if (dryRun) return { invocation: preview, status: 0, dryRun: true };
    const version = codexVersion();
    if (!isolated) {
        const result = spawnSync(preview.command, preview.args, { stdio: 'inherit' });
        if (result.error) throw new Error(`Unable to launch Codex: ${result.error.message}`);
        return { invocation: preview, status: result.status };
    }

    const prepared = prepareIsolatedRun({
        sourcePath: subjectPath,
        contextFiles: preview.contextManifest.files,
        label: 'subject-create',
        includeTopLevel: ['AGENTS.md', 'ROADMAP.md', 'SUBJECT_BRIEF.md', 'DOMAIN_GUIDE.md']
    });
    try {
        const prompt = buildSubjectPrompt({
            subject: preview.contextManifest.subject,
            targetPath: prepared.workspacePath,
            contextFiles: prepared.stagedContext,
            skillPath: path.join(prepared.workspacePath, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
            guideExists: existsSync(preview.contextManifest.guide.path),
            extraInstructions,
            isolated: true
        });
        const invocation = buildCodexInvocation({
            workspacePath: prepared.workspacePath,
            prompt,
            model,
            reasoningEffort,
            isolated: true,
            resultPath: isolatedResultPath(prepared)
        });
        const result = runPreparedInvocation(prepared, invocation, {
            reportOnly: false,
            metadata: { operation: 'subject-create', codexVersion: version, model: invocation.model, reasoningEffort }
        });
        return { invocation, ...result };
    } finally {
        discardIsolatedRun(prepared);
    }
}

export function runDeckAgent({
    mode,
    deckPath: inputPath,
    nonInteractive = false,
    reportOnly = false,
    model,
    reasoningEffort = 'high',
    extraInstructions,
    dryRun = false,
    allowDirty = false,
    buildScope = 'pilot',
    chapterNumber,
    freshChapter = false,
    freshPilot = false,
    isolated = true
}) {
    const deckPath = resolvePath(inputPath);
    let preflightPath;

    if (freshPilot && buildScope === 'full') throw new Error('--fresh-pilot cannot be combined with --full.');
    if (freshChapter && buildScope !== 'chapter') throw new Error('--fresh-chapter requires a chapter build.');
    if (buildScope === 'chapter' && !chapterNumber) throw new Error('A chapter build requires --chapter.');
    if (freshPilot && !isolated) throw new Error('--fresh-pilot requires the default isolated run.');
    if (freshChapter && !isolated) throw new Error('--fresh-chapter requires the default isolated run.');
    if (mode === 'build' && buildScope === 'full') requireFullBuildApproval(deckPath);
    if (mode === 'build' && buildScope === 'chapter') requireFullBuildApproval(deckPath);

    if (!dryRun && !reportOnly) {
        if (mode === 'audit') requireSafeAuditWorktree(deckPath, allowDirty);
        const stabilized = stabilizeDeck(deckPath);
        if (stabilized.status !== 0) throw new Error('Unable to add stable card IDs before agent editing.');
    }

    if (mode === 'audit' && !dryRun) {
        preflightPath = reportOnly
            ? path.join(os.tmpdir(), 'flashcards-audits', `${auditTimestamp()}-preflight.json`)
            : path.join(deckPath, '.flashcards', 'audits', `${auditTimestamp()}-preflight.json`);
        mkdirSync(path.dirname(preflightPath), { recursive: true });
        const validation = validateDeck(deckPath, { outputPath: preflightPath, quiet: true });
        if (validation.status !== 0) {
            console.warn('Preflight validation found hard failures; the audit must report or resolve them before handoff.');
        }
    }

    const preview = buildAgentInvocation({
        mode,
        deckPath,
        nonInteractive,
        reportOnly,
        model,
        reasoningEffort,
        extraInstructions,
        preflightPath,
        buildScope,
        chapterNumber,
        freshChapter,
        freshPilot,
        isolated
    });
    if (dryRun) return { invocation: preview, status: 0, dryRun: true };

    const version = codexVersion();
    let result;
    if (isolated) {
        const chapterName = buildScope === 'chapter' ? chapterNameForOrder(deckPath, chapterNumber) : undefined;
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: preview.contextManifest.files,
            label: chapterName ? `${mode}-${chapterName.replace(/\.md$/, '')}` : `${mode}-${buildScope}`
        });
        try {
            if (mode === 'build' && buildScope === 'pilot' && freshPilot) {
                resetPilotForRegeneration(prepared.workspacePath);
            }
            if (mode === 'build' && buildScope === 'chapter' && freshChapter) {
                resetChapterForRegeneration(prepared.workspacePath, chapterNumber);
            }
            const localPreflight = preflightPath
                ? prepared.stagedContext.find(file => file.source === preflightPath)?.path
                : undefined;
            const prompt = buildDeckPrompt({
                mode,
                targetPath: prepared.workspacePath,
                subject: preview.contextManifest.subject,
                contextFiles: prepared.stagedContext,
                skillPath: path.join(prepared.workspacePath, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
                preflightPath: localPreflight,
                reportOnly,
                buildScope,
                chapterNumber,
                chapterName,
                freshChapter,
                freshPilot,
                extraInstructions,
                isolated: true
            });
            const invocation = buildCodexInvocation({
                workspacePath: prepared.workspacePath,
                prompt,
                reportOnly,
                model,
                reasoningEffort,
                isolated: true,
                resultPath: isolatedResultPath(prepared)
            });
            const allowedPaths = buildScope === 'chapter' ? [
                path.join('flashcards', chapterName),
                path.join('figures', chapterName.replace(/\.md$/, '')),
                path.join('.flashcards', 'audits', chapterAuditName(chapterName)),
                'README.md',
                'CARD_README.md'
            ] : undefined;
            result = runPreparedInvocation(prepared, invocation, {
                reportOnly,
                allowedPaths,
                metadata: {
                    operation: mode,
                    buildScope,
                    chapterNumber,
                    chapterName,
                    freshChapter,
                    freshPilot,
                    reportOnly,
                    codexVersion: version,
                    model: invocation.model,
                    reasoningEffort
                }
            });
            result.invocation = invocation;
        } finally {
            discardIsolatedRun(prepared);
        }
    } else {
        const launched = spawnSync(preview.command, preview.args, { stdio: 'inherit' });
        if (launched.error) throw new Error(`Unable to launch Codex: ${launched.error.message}`);
        result = { invocation: preview, status: launched.status };
    }

    if (result.status !== 0) return result;
    if (result.runPath) console.log(`Isolated run record: ${result.runPath}`);

    if (!reportOnly) {
        const validation = validateDeck(deckPath, { quiet: true });
        if (validation.status !== 0) {
            throw new Error('Codex finished, but postflight validation failed. Review the errors above before committing.');
        }
        const identities = stabilizeDeck(deckPath, { check: true });
        if (identities.status !== 0) {
            throw new Error('Codex finished, but one or more cards are missing stable IDs.');
        }
        if (mode === 'build') {
            if (buildScope === 'full') markFullBuilt(deckPath);
            else if (buildScope === 'pilot') markPilotBuilt(deckPath);
        }
    }
    return result;
}

export function codexDoctor() {
    const version = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    const login = spawnSync('codex', ['login', 'status'], { encoding: 'utf8' });
    const requiredFiles = [
        path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
        path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'references', 'cold-start-workflow.md'),
        path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'CARD_STANDARD.md'),
        path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'AUTHORING_PLAYBOOK.md'),
        path.join(FLASHCARDS_ROOT, 'scripts', 'validate-notes.js')
    ];
    const missingFiles = requiredFiles.filter(file => !existsSync(file));
    return {
        installed: !version.error && version.status === 0,
        version: version.stdout?.trim() || '',
        authenticated: !login.error && login.status === 0,
        authStatus: `${login.stdout || ''}${login.stderr || ''}`.trim(),
        configuredModel: configuredModel() || 'Codex default',
        missingFiles
    };
}

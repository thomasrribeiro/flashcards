import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FLASHCARDS_ROOT, resolvePath, shellQuote } from './paths.js';
import { buildContextManifest, buildSubjectContextManifest } from './context.js';
import { resolveGlobalCurriculum } from './global-curriculum.js';
import {
    discardIsolatedRun,
    finishIsolatedRun,
    isolatedResultPath,
    prepareIsolatedRun,
    recordIsolatedInvocation
} from './isolation.js';
import { markFullBuilt, markPilotBuilt, requireFullBuildApproval } from './pilot.js';
import {
    constrainWorkspaceToChapter,
    formatPrerequisiteGraph,
    resolveChapterClosure,
    stageExternalPrerequisites
} from './prerequisites.js';
import {
    DECK_GRANULARITY_RANGES,
    resolveSubjectCurriculum,
    validateSubjectExtension,
    validateSubjectRoadmap
} from './subject-curriculum.js';
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

function configuredAuthCredentialsStore() {
    if (process.env.FLASHCARDS_CODEX_AUTH_CREDENTIALS_STORE) {
        return process.env.FLASHCARDS_CODEX_AUTH_CREDENTIALS_STORE;
    }
    const configPath = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
    if (!existsSync(configPath)) return undefined;
    return /^cli_auth_credentials_store\s*=\s*"([^"]+)"/m.exec(readFileSync(configPath, 'utf8'))?.[1];
}

function isClaudeModel(model) {
    return /^(?:fable|opus|sonnet|haiku|claude-)/.test(model || '');
}

function agentVersion(model) {
    const command = isClaudeModel(model) ? 'claude' : 'codex';
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') {
        throw new Error(`${command === 'claude' ? 'Claude Code' : 'Codex CLI'} is not installed or not available on PATH.`);
    }
    if (result.status !== 0) {
        throw new Error(`Unable to inspect ${command}: ${(result.stderr || result.stdout).trim()}`);
    }
    return isClaudeModel(model)
        ? `${model} via ${result.stdout.trim()} (Claude Code)`
        : result.stdout.trim();
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

function deckModeInstruction(mode, buildScope, reportOnly, chapterNumber, chapterName, prerequisiteResolution) {
    if (mode === 'build' && buildScope === 'pilot') {
        return 'Research and design the curriculum, but AUTHOR ONLY THE FIRST ORDERED CHAPTER as a novice-first pilot. If no ordered chapter exists, design the chapter map and create the first chapter. Do not author, delete, or modify cards in later chapters. Complete the pilot dependency ledger and write .flashcards/audits/pilot-cold-start.md with a front-by-front audit. Include the exact lines "cold_start_status: pass" and "unresolved_dependencies: 0" only when no unexplained dependency remains, then stop for human approval.';
    }
    if (mode === 'build' && buildScope === 'chapter') {
        const auditName = chapterAuditName(chapterName);
        const local = prerequisiteResolution.localChapterIds.length
            ? prerequisiteResolution.localChapterIds.join(', ')
            : 'none';
        const external = prerequisiteResolution.externalDeckIds.length
            ? prerequisiteResolution.externalDeckIds.join(', ')
            : 'none';
        const tools = prerequisiteResolution.assumedTools.length
            ? prerequisiteResolution.assumedTools.join(', ')
            : 'none';
        return `AUTHOR ONLY ORDERED CHAPTER ${chapterNumber} (${chapterName}). Treat only the scheduled cards in the resolved local prerequisite closure (${local}), the staged external deck closure (${external}), and the explicitly assumed tools (${tools}) as established inbound knowledge. Earlier order alone is not permission to assume an unlisted chapter when explicit edges are present. Do not author, delete, inspect for scaffolding, or modify unavailable/later chapters, and do not modify prerequisite cards or figures. Complete a chapter-boundary dependency ledger and write .flashcards/audits/${auditName} with a front-by-front audit. Include the exact lines "cold_start_status: pass" and "unresolved_dependencies: 0" only when no unexplained dependency remains.`;
    }
    if (mode === 'build') {
        return 'Human pilot approval explicitly authorizes the complete deck. Build every chapter in the approved curriculum chapter by chapter, creating any planned chapter files and figure directories that are not yet present in the workspace; an absent later chapter is work to author, not a reason to stop. Preserve the approved pilot unless a dependency repair is necessary. Repeat the dependency scan across every chapter boundary and write .flashcards/audits/full-cold-start.md. Include the exact lines "cold_start_status: pass" and "unresolved_dependencies: 0" only when no unexplained dependency remains.';
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
    isolated,
    prerequisiteGraph,
    prerequisiteResolution
}) {
    return [
        `Use $manage-flashcard-decks in ${mode} mode. Read the complete skill at ${skillPath} before acting.`,
        `Target deck: ${targetPath}`,
        `Subject: ${subject}`,
        isolated
            ? 'This is an isolated fresh-agent run. Use only the target workspace, the ordered staged context below, and sources you deliberately find through live web research.'
            : `Read-only flashcards application and standards: ${FLASHCARDS_ROOT}`,
        preflightPath ? `Machine-readable preflight report: ${preflightPath}` : null,
        prerequisiteGraph ? `Machine-resolved prerequisite graph:\n${formatPrerequisiteGraph(prerequisiteGraph, {
            chapter: prerequisiteResolution?.chapter?.order
        })}` : null,
        isolated && prerequisiteGraph
            ? 'Read .flashcards/prerequisites/graph.json and the applicable scheduled cards in the available local/external prerequisite closure before authoring. Chapters outside the resolved local closure are absent from bounded chapter workspaces.'
            : null,
        isolated && prerequisiteResolution
            ? 'Do not add an inbound prerequisite that was not present when this sandbox was resolved. Record the proposed edge as unresolved and stop rather than assuming unavailable knowledge; rerun after the metadata is updated and validated.'
            : null,
        'Read every present file in this ordered context manifest completely before acting:',
        ...contextFiles.map((file, index) => `${index + 1}. [${file.role}] ${file.path}`),
        deckModeInstruction(mode, buildScope, reportOnly, chapterNumber, chapterName, prerequisiteResolution),
        freshChapter
            ? `Chapter ${chapterNumber} (${chapterName}) was intentionally blanked inside this temporary workspace. Design and author it from the declared learner model, the machine-resolved prerequisite closure, standards, domain guide, and current research; do not reconstruct or recover the previous implementation from outside the workspace.`
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
            ? 'Do not inspect files outside this workspace. Use workspace-relative paths for edits so operating-system path aliases cannot be mistaken for out-of-workspace writes. Do not modify .agents/, .flashcards/context/, .flashcards/prerequisites/, or AGENTS.override.md.'
            : 'Do not edit the flashcards application repository; make deck and subject changes only in the target workspaces.',
        'Do not commit, push, create a remote repository, or deploy.',
        extraInstructions ? `Additional user instructions: ${extraInstructions}` : null
    ].filter(Boolean).join('\n');
}

function buildSubjectPrompt({
    operation,
    subject,
    targetPath,
    contextFiles,
    skillPath,
    guideExists,
    destination,
    deckGranularity,
    focus,
    extraInstructions,
    isolated
}) {
    const chapterRange = DECK_GRANULARITY_RANGES[deckGranularity];
    return [
        `Use $manage-flashcard-decks to design the ${subject} subject workspace. Read the complete skill at ${skillPath} before acting.`,
        `Target subject workspace: ${targetPath}`,
        `Requested curriculum destination: ${destination}.`,
        `Requested focus branches: ${focus.length ? focus.join(', ') : 'none specified'}.`,
        `Required deck granularity: ${deckGranularity}${chapterRange ? `, with ${chapterRange[0]}-${chapterRange[1]} estimated chapters per coherent deck` : ''}.`,
        isolated
            ? 'This is an isolated fresh-agent run. Use only the target workspace, the ordered staged context below, and sources you deliberately find through live web research.'
            : `Read-only flashcards application and standards: ${FLASHCARDS_ROOT}`,
        'Read every present file in this ordered context manifest completely before acting:',
        ...contextFiles.map((file, index) => `${index + 1}. [${file.role}] ${file.path}`),
        'Follow the supplied subject curriculum workflow. Research authoritative curriculum frameworks and the current structure of the field, map material domains before naming decks, and stress-test every proposed deck for coherence and false prerequisites.',
        'Complete SUBJECT_BRIEF.md and ROADMAP.md for the requested destination and granularity. Treat unconfirmed learner knowledge as unseen and mark genuinely personal decisions for user confirmation rather than inventing them.',
        operation === 'extend'
            ? 'Extend the existing curriculum rather than regenerating it. Preserve every valid existing deck id, level, status, and prerequisite edge; approved or active entries are especially immutable. Tiers may change because they express priority for the new destination. Add the requested advanced route and only the bridge decks it honestly requires; document any necessary correction to existing metadata.'
            : 'Design a layered curriculum that can grow across learning levels. Destination controls the current route, not who is permitted to learn the subject and not the permanent ceiling of the roadmap.',
        'Treat the generated cross-subject curriculum catalog as the authoritative list of reusable external deck capabilities. When another subject already supplies a genuinely required capability, reference it as `subject/deck` instead of duplicating a broad bridge deck. Keep a subject-specific bridge only when contextual transfer itself requires teaching, and explain that decision in ROADMAP.md. Use `recommended_after` for useful preparation that is not logically required. Never invent an external reference absent from the catalog.',
        'Audit maturity transitions explicitly. For every graduate or research-specialization deck, list the technical and representational capabilities its first chapter may assume and verify that the direct prerequisite closure actually establishes them. Do not jump from an undergraduate survey directly into literature-facing work when an advanced theory, mathematics, experimental, or research-method layer is missing. A level jump may be retained only when the roadmap explains why the complete prerequisite closure is sufficient.',
        'Create or update subject.toml as the synchronized executable curriculum using schema_version = 3. Include destination, focus, deck_granularity, deck tier, deck level, hard prerequisites, recommended_after, estimated_chapters, status, description, and a complete [[coverage]] matrix. Keep level separate from tier: level describes assumed maturity; tier describes priority for this destination. Local references may use `deck`; cross-subject references must use `subject/deck`. Use only direct, minimal prerequisite references. Coverage rows assign only decks owned by this subject. The local and global validators will reject malformed metadata, oversized or undersized deck estimates, missing coverage, false reference types, later-level hard prerequisites, redundant hard edges, cycles, missing references, and duplicate ids or orders.',
        guideExists
            ? 'Use the supplied reusable domain guide; do not duplicate it into the subject workspace.'
            : 'No reusable domain guide exists. Create DOMAIN_GUIDE.md in the subject workspace. It must cover durable domain-specific authoring judgment, breadth and subfield balance, representations, misconceptions, evidence authorities, and accuracy checks without copying the universal standards.',
        'Do not create a deck or author cards in this run. Do not commit, push, create a remote repository, or deploy.',
        isolated ? 'Do not inspect files outside this workspace. Use workspace-relative paths for edits so operating-system path aliases cannot be mistaken for out-of-workspace writes. Do not modify .agents/, .flashcards/context/, or AGENTS.override.md.' : null,
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
    if (isClaudeModel(resolvedModel)) {
        return {
            command: 'claude',
            args: [
                '--print',
                '--model', resolvedModel,
                '--effort', reasoningEffort,
                '--permission-mode', reportOnly ? 'dontAsk' : 'bypassPermissions',
                ...(reportOnly ? [] : ['--dangerously-skip-permissions']),
                '--safe-mode',
                '--no-session-persistence',
                '--output-format', 'stream-json',
                '--verbose',
                '--prompt-suggestions', 'false',
                prompt
            ],
            prompt,
            workspacePath,
            model: resolvedModel,
            reasoningEffort,
            isolated,
            provider: 'claude-code'
        };
    }
    const authCredentialsStore = configuredAuthCredentialsStore();
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
            '-c', 'features.multi_agent=false'
        );
        if (authCredentialsStore) {
            args.push('-c', `cli_auth_credentials_store=${JSON.stringify(authCredentialsStore)}`);
        }
        args.push(
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
    return {
        command: 'codex',
        args,
        prompt,
        workspacePath,
        model: resolvedModel,
        reasoningEffort,
        isolated,
        provider: 'codex'
    };
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
    const contextManifest = buildContextManifest({ deckPath, mode, preflightPath, chapterNumber });
    const missingRequired = contextManifest.files.filter(file => file.required && !file.exists);
    if (missingRequired.length) {
        throw new Error(`Missing required authoring context: ${missingRequired.map(file => file.path).join(', ')}`);
    }
    if (mode === 'build' && contextManifest.prerequisiteGraph.errors.length) {
        throw new Error(`Invalid prerequisite graph:\n- ${contextManifest.prerequisiteGraph.errors.join('\n- ')}`);
    }
    const contextFiles = contextManifest.files.filter(file => file.exists);
    const chapterName = buildScope === 'chapter' ? chapterNameForOrder(deckPath, chapterNumber) : undefined;
    const prerequisiteResolution = mode === 'build' && buildScope === 'chapter'
        ? resolveChapterClosure(contextManifest.prerequisiteGraph, chapterNumber)
        : mode === 'build' && buildScope === 'pilot' && contextManifest.prerequisiteGraph.chapters.length
            ? resolveChapterClosure(contextManifest.prerequisiteGraph, 1)
            : undefined;
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
        isolated,
        prerequisiteGraph: contextManifest.prerequisiteGraph,
        prerequisiteResolution
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
    return {
        ...invocation,
        deckPath,
        subjectRoot: contextManifest.subjectRoot,
        contextManifest,
        prerequisiteResolution
    };
}

export function buildSubjectAgentInvocation({
    subjectPath: inputPath,
    model,
    reasoningEffort = 'high',
    operation = 'create',
    destination = 'whole-field',
    deckGranularity = 'course',
    focus = [],
    extraInstructions,
    nonInteractive = false,
    isolated = true
}) {
    if (!['create', 'extend'].includes(operation)) {
        throw new Error(`Unsupported subject agent operation: ${operation}`);
    }
    const subjectPath = resolvePath(inputPath);
    const contextManifest = buildSubjectContextManifest({ subjectPath });
    if (contextManifest.globalCurriculum.errors.length) {
        throw new Error(
            `Cannot start subject agent while the established external curriculum is invalid:\n- ${
                contextManifest.globalCurriculum.errors.join('\n- ')
            }`
        );
    }
    const missingRequired = contextManifest.files.filter(file => file.required && !file.exists);
    if (missingRequired.length) {
        throw new Error(`Missing required subject context: ${missingRequired.map(file => file.path).join(', ')}`);
    }
    const contextFiles = contextManifest.files.filter(file => file.exists);
    const prompt = buildSubjectPrompt({
        operation,
        subject: contextManifest.subject,
        targetPath: subjectPath,
        contextFiles,
        skillPath: path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
        guideExists: existsSync(contextManifest.guide.path),
        destination,
        deckGranularity,
        focus,
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

function runPreparedInvocation(prepared, invocation, {
    reportOnly,
    metadata,
    allowedPaths,
    replacePaths,
    validateWorkspace,
    recoverOnFailure
}) {
    recordIsolatedInvocation(prepared, { prompt: invocation.prompt, invocation, metadata });
    const result = spawnSync(invocation.command, invocation.args, {
        cwd: prepared.workspacePath,
        stdio: 'inherit'
    });
    if (result.error) throw new Error(`Unable to launch Codex: ${result.error.message}`);
    if (result.status !== 0) {
        if (recoverOnFailure) {
            try {
                recoverOnFailure(prepared.workspacePath);
                const recovered = finishIsolatedRun(prepared, {
                    applyChanges: !reportOnly,
                    allowedPaths,
                    replacePaths
                });
                return { status: 0, recoveredAfterProviderFailure: true, ...recovered };
            } catch (recoveryError) {
                console.warn(`Provider failed and the workspace was not complete enough to recover: ${recoveryError.message}`);
            }
        }
        const preserved = finishIsolatedRun(prepared, {
            applyChanges: false,
            allowedPaths,
            replacePaths
        });
        return { status: result.status, ...preserved };
    }
    if (validateWorkspace) validateWorkspace(prepared.workspacePath);
    const finished = finishIsolatedRun(prepared, {
        applyChanges: !reportOnly,
        allowedPaths,
        replacePaths
    });
    return { status: 0, ...finished };
}

export function runSubjectAgent({
    subjectPath: inputPath,
    model,
    reasoningEffort = 'high',
    operation = 'create',
    destination = 'whole-field',
    deckGranularity = 'course',
    focus = [],
    extraInstructions,
    dryRun = false,
    isolated = true,
    nonInteractive = false
}) {
    const subjectPath = resolvePath(inputPath);
    const baseline = operation === 'extend'
        ? resolveSubjectCurriculum(subjectPath, { requireDecks: true })
        : null;
    if (baseline?.errors.length) {
        throw new Error(`Cannot extend an invalid subject curriculum:\n- ${baseline.errors.join('\n- ')}`);
    }
    const preview = buildSubjectAgentInvocation({
        subjectPath,
        model,
        reasoningEffort,
        operation,
        destination,
        deckGranularity,
        focus,
        extraInstructions,
        isolated,
        nonInteractive
    });
    if (dryRun) return { invocation: preview, status: 0, dryRun: true };
    const version = agentVersion(model || configuredModel());
    if (!isolated) {
        const result = spawnSync(preview.command, preview.args, { stdio: 'inherit' });
        if (result.error) throw new Error(`Unable to launch Codex: ${result.error.message}`);
        if (result.status === 0) {
            const curriculum = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
            if (operation === 'extend') {
                const preservationErrors = validateSubjectExtension(baseline, curriculum);
                if (preservationErrors.length) {
                    throw new Error(`Subject extension violated preservation rules:\n- ${preservationErrors.join('\n- ')}`);
                }
            }
            if (curriculum.errors.length) {
                throw new Error(`Codex finished, but subject curriculum validation failed:\n- ${curriculum.errors.join('\n- ')}`);
            }
            const roadmapErrors = validateSubjectRoadmap(subjectPath, curriculum);
            if (roadmapErrors.length) {
                throw new Error(`Codex finished, but ROADMAP.md is not synchronized:\n- ${roadmapErrors.join('\n- ')}`);
            }
            const globalCurriculum = resolveGlobalCurriculum(path.dirname(subjectPath), { requireSubjects: true });
            if (globalCurriculum.errors.length) {
                throw new Error(`Codex finished, but global curriculum validation failed:\n- ${globalCurriculum.errors.join('\n- ')}`);
            }
        }
        return { invocation: preview, status: result.status };
    }

    const prepared = prepareIsolatedRun({
        sourcePath: subjectPath,
        contextFiles: preview.contextManifest.files,
        label: `subject-${operation}`,
        includeTopLevel: ['AGENTS.md', 'ROADMAP.md', 'SUBJECT_BRIEF.md', 'DOMAIN_GUIDE.md', 'subject.toml']
    });
    try {
        const prompt = buildSubjectPrompt({
            operation,
            subject: preview.contextManifest.subject,
            targetPath: prepared.workspacePath,
            contextFiles: prepared.stagedContext,
            skillPath: path.join(prepared.workspacePath, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
            guideExists: existsSync(preview.contextManifest.guide.path),
            destination,
            deckGranularity,
            focus,
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
            metadata: {
                operation: `subject-${operation}`,
                codexVersion: version,
                model: invocation.model,
                reasoningEffort,
                destination,
                deckGranularity,
                focus
            },
            validateWorkspace: workspacePath => {
                const generated = resolveSubjectCurriculum(workspacePath, { requireDecks: true });
                if (generated.errors.length) {
                    throw new Error(`Subject curriculum validation failed:\n- ${generated.errors.join('\n- ')}`);
                }
                const roadmapErrors = validateSubjectRoadmap(workspacePath, generated);
                if (roadmapErrors.length) {
                    throw new Error(`ROADMAP.md is not synchronized:\n- ${roadmapErrors.join('\n- ')}`);
                }
                if (operation === 'extend') {
                    const extended = generated;
                    const errors = validateSubjectExtension(baseline, extended);
                    if (errors.length) {
                        throw new Error(`Subject extension violated preservation rules:\n- ${errors.join('\n- ')}`);
                    }
                }
            }
        });
        if (result.status === 0) {
            const curriculum = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
            if (curriculum.errors.length) {
                throw new Error(`Codex finished, but subject curriculum validation failed:\n- ${curriculum.errors.join('\n- ')}`);
            }
            const roadmapErrors = validateSubjectRoadmap(subjectPath, curriculum);
            if (roadmapErrors.length) {
                throw new Error(`Codex finished, but ROADMAP.md is not synchronized:\n- ${roadmapErrors.join('\n- ')}`);
            }
            const globalCurriculum = resolveGlobalCurriculum(path.dirname(subjectPath), { requireSubjects: true });
            if (globalCurriculum.errors.length) {
                throw new Error(`Codex finished, but global curriculum validation failed:\n- ${globalCurriculum.errors.join('\n- ')}`);
            }
        }
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

    const version = agentVersion(model || configuredModel());
    let result;
    if (isolated) {
        const chapterName = buildScope === 'chapter' ? chapterNameForOrder(deckPath, chapterNumber) : undefined;
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: preview.contextManifest.files,
            label: chapterName ? `${mode}-${chapterName.replace(/\.md$/, '')}` : `${mode}-${buildScope}`,
            prepareWorkspace(workspacePath) {
                if (mode === 'build' && buildScope === 'pilot' && freshPilot) {
                    resetPilotForRegeneration(workspacePath);
                }
                if (mode === 'build' && buildScope === 'chapter' && freshChapter) {
                    resetChapterForRegeneration(workspacePath, chapterNumber);
                }
                if (preview.prerequisiteResolution) {
                    constrainWorkspaceToChapter(workspacePath, preview.prerequisiteResolution);
                }
                return stageExternalPrerequisites(
                    workspacePath,
                    preview.contextManifest.prerequisiteGraph,
                    preview.prerequisiteResolution
                );
            }
        });
        try {
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
                isolated: true,
                prerequisiteGraph: preview.contextManifest.prerequisiteGraph,
                prerequisiteResolution: preview.prerequisiteResolution
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
            const allowedPaths = buildScope === 'chapter'
                ? [
                    path.join('flashcards', chapterName),
                    path.join('figures', chapterName.replace(/\.md$/, '')),
                    path.join('.flashcards', 'audits', chapterAuditName(chapterName)),
                    'README.md',
                    'CARD_README.md'
                ]
                : buildScope === 'pilot' && freshPilot
                    ? [
                        path.join('flashcards', chapterNameForOrder(deckPath, 1)),
                        path.join('figures', chapterNameForOrder(deckPath, 1).replace(/\.md$/, '')),
                        path.join('.flashcards', 'audits', 'pilot-cold-start.md'),
                        'README.md',
                        'CARD_README.md'
                    ]
                    : undefined;
            const replacementPaths = mode === 'build' && buildScope === 'chapter' && freshChapter
                ? [
                    path.join('flashcards', chapterName),
                    path.join('figures', chapterName.replace(/\.md$/, ''))
                ]
                : mode === 'build' && buildScope === 'pilot' && freshPilot
                    ? [
                        path.join('flashcards', chapterNameForOrder(deckPath, 1)),
                        path.join('figures', chapterNameForOrder(deckPath, 1).replace(/\.md$/, ''))
                    ]
                    : undefined;
            result = runPreparedInvocation(prepared, invocation, {
                reportOnly,
                allowedPaths,
                replacePaths: replacementPaths,
                recoverOnFailure: mode === 'build' ? workspacePath => {
                    const validation = validateDeck(workspacePath, { quiet: true });
                    if (validation.status !== 0) {
                        throw new Error('deck validation did not pass');
                    }
                    const auditPath = buildScope === 'chapter'
                        ? path.join(workspacePath, '.flashcards', 'audits', chapterAuditName(chapterName))
                        : buildScope === 'pilot'
                            ? path.join(workspacePath, '.flashcards', 'audits', 'pilot-cold-start.md')
                            : path.join(workspacePath, '.flashcards', 'audits', 'full-cold-start.md');
                    if (!existsSync(auditPath)) throw new Error(`required audit is missing: ${auditPath}`);
                    const audit = readFileSync(auditPath, 'utf8');
                    if (!/^cold_start_status: pass$/m.test(audit) || !/^unresolved_dependencies: 0$/m.test(audit)) {
                        throw new Error('required cold-start audit is incomplete');
                    }
                } : undefined,
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
                    reasoningEffort,
                    prerequisiteResolution: preview.prerequisiteResolution ? {
                        targetChapter: preview.prerequisiteResolution.chapter.id,
                        edgeMode: preview.prerequisiteResolution.mode,
                        localChapters: preview.prerequisiteResolution.localChapterIds,
                        externalDecks: preview.prerequisiteResolution.externalDeckIds,
                        assumedTools: preview.prerequisiteResolution.assumedTools
                    } : null
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

import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FLASHCARDS_ROOT, resolvePath, shellQuote } from './paths.js';
import { buildContextManifest } from './context.js';
import { stabilizeDeck, validateDeck } from './validation.js';

function auditTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
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

export function buildAgentInvocation({
    mode,
    deckPath: inputPath,
    nonInteractive = false,
    reportOnly = false,
    model,
    extraInstructions,
    preflightPath
}) {
    const deckPath = resolvePath(inputPath);
    const contextManifest = buildContextManifest({ deckPath, mode, preflightPath });
    const { subjectRoot, subject } = contextManifest;
    const missingRequired = contextManifest.files.filter(file => file.required && !file.exists);
    if (missingRequired.length) {
        throw new Error(`Missing required authoring context: ${missingRequired.map(file => file.path).join(', ')}`);
    }
    const modeInstruction = mode === 'build'
        ? 'Research, design, and build this deck from its current state.'
        : reportOnly
            ? 'Audit the entire deck and write no files. Return a prioritized, evidence-backed report.'
            : 'Audit and improve the entire deck, working chapter by chapter while preserving review history.';
    const prompt = [
        `Use $manage-flashcard-decks in ${mode} mode. Read the complete skill at ${path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md')} before acting.`,
        `Target deck: ${deckPath}`,
        `Subject: ${subject}`,
        `Subject workspace: ${subjectRoot}`,
        `Read-only flashcards application and standards: ${FLASHCARDS_ROOT}`,
        preflightPath ? `Machine-readable preflight report: ${preflightPath}` : null,
        'Read every present file in this ordered context manifest completely before acting:',
        ...contextManifest.files.filter(file => file.exists).map((file, index) => `${index + 1}. [${file.role}] ${file.path}`),
        modeInstruction,
        'Do not load deprecated compatibility guides or unrelated subject encyclopedias unless the user explicitly asks.',
        'Do not edit the flashcards application repository; make deck and subject changes only in the target workspaces.',
        'Do not commit, push, create a remote repository, or deploy.',
        extraInstructions ? `Additional user instructions: ${extraInstructions}` : null
    ].filter(Boolean).join('\n');

    const globalArgs = [
        '--search',
        '--sandbox', reportOnly ? 'read-only' : 'workspace-write',
        '--cd', deckPath,
        '--add-dir', subjectRoot
    ];
    if (preflightPath && !preflightPath.startsWith(`${deckPath}${path.sep}`)) {
        globalArgs.push('--add-dir', path.dirname(preflightPath));
    }
    if (model) globalArgs.push('--model', model);
    const args = nonInteractive
        ? [...globalArgs, 'exec', prompt]
        : [...globalArgs, prompt];
    return { command: 'codex', args, prompt, deckPath, subjectRoot, contextManifest };
}

export function formatInvocation(invocation) {
    return [invocation.command, ...invocation.args].map(shellQuote).join(' ');
}

export function runDeckAgent({
    mode,
    deckPath: inputPath,
    nonInteractive = false,
    reportOnly = false,
    model,
    extraInstructions,
    dryRun = false,
    allowDirty = false
}) {
    const deckPath = resolvePath(inputPath);
    let preflightPath;

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

    const invocation = buildAgentInvocation({
        mode,
        deckPath,
        nonInteractive,
        reportOnly,
        model,
        extraInstructions,
        preflightPath
    });
    if (dryRun) return { invocation, status: 0, dryRun: true };

    const available = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    if (available.error?.code === 'ENOENT') throw new Error('Codex CLI is not installed or not available on PATH.');
    const result = spawnSync(invocation.command, invocation.args, { stdio: 'inherit' });
    if (result.error) throw new Error(`Unable to launch Codex: ${result.error.message}`);
    if (result.status !== 0) return { invocation, status: result.status };

    if (!reportOnly) {
        const validation = validateDeck(deckPath, { quiet: true });
        if (validation.status !== 0) {
            throw new Error('Codex finished, but postflight validation failed. Review the errors above before committing.');
        }
        const identities = stabilizeDeck(deckPath, { check: true });
        if (identities.status !== 0) {
            throw new Error('Codex finished, but one or more cards are missing stable IDs.');
        }
    }
    return { invocation, status: 0 };
}

export function codexDoctor() {
    const version = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    const login = spawnSync('codex', ['login', 'status'], { encoding: 'utf8' });
    const requiredFiles = [
        path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'),
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
        missingFiles
    };
}

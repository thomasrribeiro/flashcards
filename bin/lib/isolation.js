import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FLASHCARDS_ROOT, shellQuote } from './paths.js';

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function inventoryFiles(rootPath) {
    const files = [];
    const visit = currentPath => {
        for (const entry of readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name === '.git') continue;
            const filePath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                visit(filePath);
            } else if (entry.isFile()) {
                files.push({
                    path: path.relative(rootPath, filePath),
                    bytes: statSync(filePath).size,
                    sha256: sha256(filePath)
                });
            }
        }
    };
    visit(rootPath);
    return files;
}

function runGit(args, cwd, options = {}) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', ...options });
    if (result.error) throw new Error(`Unable to run git ${args[0]}: ${result.error.message}`);
    if (result.status !== 0) {
        throw new Error(`git ${args[0]} failed in isolated workspace: ${(result.stderr || result.stdout || '').trim()}`);
    }
    return result;
}

function safeLabel(value) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

function defaultRunRoot(sourcePath) {
    const pathHash = createHash('sha256').update(path.resolve(sourcePath)).digest('hex').slice(0, 12);
    return path.join(os.homedir(), '.flashcards', 'runs', `${safeLabel(path.basename(sourcePath))}-${pathHash}`);
}

function copyWorkspace(sourcePath, destination, includeTopLevel) {
    cpSync(sourcePath, destination, {
        recursive: true,
        filter(source) {
            const relative = path.relative(sourcePath, source);
            if (!relative) return true;
            const first = relative.split(path.sep)[0];
            if (includeTopLevel && !includeTopLevel.includes(first)) return false;
            if (first === '.git') return false;
            if (relative.startsWith(path.join('.flashcards', 'runs'))) return false;
            return true;
        }
    });
}

function stageContext(workspacePath, files) {
    const contextRoot = path.join(workspacePath, '.flashcards', 'context');
    mkdirSync(contextRoot, { recursive: true });
    return files.filter(file => file.exists).map((file, index) => {
        const destination = path.join(
            contextRoot,
            `${String(index + 1).padStart(2, '0')}-${safeLabel(path.basename(file.path))}`
        );
        cpSync(file.path, destination);
        return {
            role: file.role,
            source: file.path,
            path: destination,
            relativePath: path.relative(workspacePath, destination),
            bytes: file.bytes,
            words: file.words,
            sha256: sha256(file.path)
        };
    });
}

function vendorSkill(workspacePath) {
    const source = path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks');
    const destination = path.join(workspacePath, '.agents', 'skills', 'manage-flashcard-decks');
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
    return destination;
}

function writeOverride(workspacePath) {
    const target = path.join(workspacePath, 'AGENTS.override.md');
    writeFileSync(target, `# Isolated flashcard-agent workspace

This is a temporary, provenance-recorded workspace. Work only inside this
directory. Use the vendored \`$manage-flashcard-decks\` skill, the target files
present in this workspace, the machine-resolved closure under
\`.flashcards/prerequisites/\`, and only the ordered files in
\`.flashcards/context/\` as supplied project context. Live web research is
allowed and must be recorded in the appropriate source register.
Do not inspect parent directories, the user's home directory, unrelated local
repositories, saved conversations, or unlisted project files outside this
workspace. Do not commit, push, deploy, or modify the staged context files.
`);
    return target;
}

function initializeBaseline(workspacePath) {
    runGit(['init', '-q', '-b', 'isolated-run'], workspacePath);
    runGit(['config', 'user.name', 'Flashcards isolated agent'], workspacePath);
    runGit(['config', 'user.email', 'isolated-agent@localhost'], workspacePath);
    runGit(['add', '--all'], workspacePath);
    runGit(['commit', '-q', '-m', 'Isolated run baseline'], workspacePath);
}

function restoreProtectedContext(workspacePath) {
    const protectedPaths = [
        '.agents',
        path.join('.flashcards', 'context'),
        path.join('.flashcards', 'prerequisites'),
        'AGENTS.override.md'
    ];
    const presentPaths = protectedPaths.filter(target => existsSync(path.join(workspacePath, target)));
    runGit(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...presentPaths], workspacePath);
    runGit(['clean', '-q', '-fd', '--', ...protectedPaths], workspacePath);
}

function createPatch(workspacePath, allowedPaths) {
    runGit(['add', '-N', '--all'], workspacePath);
    const pathspec = allowedPaths?.length
        ? allowedPaths
        : [
            '.',
            ':(exclude).agents',
            ':(exclude).flashcards/context',
            ':(exclude).flashcards/prerequisites',
            ':(exclude)AGENTS.override.md'
        ];
    const result = runGit(
        ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...pathspec],
        workspacePath,
        { maxBuffer: 100 * 1024 * 1024 }
    );
    return result.stdout;
}

function applyPatch(targetPath, patch) {
    if (!patch.trim()) return;
    const check = spawnSync('git', ['apply', '--binary', '--check', '-'], {
        cwd: targetPath,
        input: patch,
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024
    });
    if (check.status !== 0) {
        throw new Error(`Unable to apply isolated agent changes cleanly: ${(check.stderr || check.stdout || '').trim()}`);
    }
    const applied = spawnSync('git', ['apply', '--binary', '-'], {
        cwd: targetPath,
        input: patch,
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024
    });
    if (applied.status !== 0) {
        throw new Error(`Unable to apply isolated agent changes: ${(applied.stderr || applied.stdout || '').trim()}`);
    }
}

export function prepareIsolatedRun({
    sourcePath,
    contextFiles,
    label = 'agent',
    includeTopLevel,
    prepareWorkspace
}) {
    const source = path.resolve(sourcePath);
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'flashcards-isolated-'));
    const workspacePath = path.join(temporaryRoot, 'workspace');
    copyWorkspace(source, workspacePath, includeTopLevel);
    const preparedWorkspace = prepareWorkspace ? prepareWorkspace(workspacePath) : undefined;
    const sourceSnapshot = inventoryFiles(workspacePath);
    const stagedContext = stageContext(workspacePath, contextFiles);
    const skillPath = vendorSkill(workspacePath);
    const vendoredSkill = inventoryFiles(skillPath);
    const overridePath = writeOverride(workspacePath);
    initializeBaseline(workspacePath);

    const runPath = path.join(defaultRunRoot(source), `${timestamp()}-${safeLabel(label)}`);
    mkdirSync(runPath, { recursive: true });
    return {
        sourcePath: source,
        temporaryRoot,
        workspacePath,
        runPath,
        stagedContext,
        skillPath,
        sourceSnapshot,
        preparedWorkspace,
        vendoredSkill,
        override: { path: 'AGENTS.override.md', sha256: sha256(overridePath) }
    };
}

export function recordIsolatedInvocation(prepared, { prompt, invocation, metadata = {} }) {
    writeFileSync(path.join(prepared.runPath, 'prompt.md'), `${prompt}\n`);
    writeFileSync(path.join(prepared.runPath, 'invocation.txt'), `${[
        invocation.command,
        ...invocation.args
    ].map(shellQuote).join(' ')}\n`);
    writeFileSync(path.join(prepared.runPath, 'context.json'), `${JSON.stringify(prepared.stagedContext, null, 2)}\n`);
    writeFileSync(path.join(prepared.runPath, 'manifest.json'), `${JSON.stringify({
        createdAt: new Date().toISOString(),
        sourcePath: prepared.sourcePath,
        workspacePath: prepared.workspacePath,
        context: prepared.stagedContext,
        sourceSnapshot: prepared.sourceSnapshot,
        preparedWorkspace: prepared.preparedWorkspace,
        vendoredSkill: prepared.vendoredSkill,
        override: prepared.override,
        ...metadata
    }, null, 2)}\n`);
}

export function finishIsolatedRun(prepared, { applyChanges = true, allowedPaths } = {}) {
    restoreProtectedContext(prepared.workspacePath);
    const patch = createPatch(prepared.workspacePath, allowedPaths);
    writeFileSync(path.join(prepared.runPath, 'changes.patch'), patch);
    if (applyChanges) applyPatch(prepared.sourcePath, patch);
    return { patch, runPath: prepared.runPath, changed: Boolean(patch.trim()) };
}

export function discardIsolatedRun(prepared) {
    rmSync(prepared.temporaryRoot, { recursive: true, force: true });
}

export function isolatedResultPath(prepared) {
    return path.join(prepared.runPath, 'result.md');
}

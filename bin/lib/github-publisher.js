import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function git(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim());
    return result.stdout.trim();
}

function gh(cwd, args) {
    const result = spawnSync('gh', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim());
    return result.stdout.trim();
}

export function assertCleanRegistryWorktree(registryRoot) {
    const status = git(registryRoot, ['status', '--porcelain']);
    if (status) throw new Error('Curriculum registry has uncommitted changes; commit or stash them before running a queued job.');
}

export function assertRepositoryCommit(repositoryRoot, expectedCommit) {
    if (!/^[a-f0-9]{40}$/i.test(expectedCommit || '')) {
        throw new Error('Expected repository commit must be a full Git SHA.');
    }
    const actual = git(repositoryRoot, ['rev-parse', 'HEAD']);
    if (actual.toLowerCase() !== expectedCommit.toLowerCase()) {
        throw new Error(`Workflow checkout is ${actual}, but the request requires ${expectedCommit}.`);
    }
    if (git(repositoryRoot, ['status', '--porcelain', '--untracked-files=no'])) {
        throw new Error('Workflow checkout has uncommitted tracked changes.');
    }
    return actual;
}

export function beginRegistryDraft(registryRoot, requestId, {
    baseCommit = null,
    baseRef = null
} = {}) {
    assertCleanRegistryWorktree(registryRoot);
    const base = git(registryRoot, ['branch', '--show-current']);
    if (!base) throw new Error('Curriculum registry must be on a named branch before generation.');
    if (baseCommit) {
        if (!/^[a-f0-9]{40}$/i.test(baseCommit)) throw new Error('Registry base commit must be a full Git SHA.');
        if (baseRef) git(registryRoot, ['fetch', 'origin', baseRef]);
        const resolved = git(registryRoot, ['rev-parse', '--verify', `${baseCommit}^{commit}`]);
        if (resolved.toLowerCase() !== baseCommit.toLowerCase()) {
            throw new Error(`Registry base commit did not resolve exactly: ${baseCommit}`);
        }
    }
    const branch = `flashcards/request-${requestId}`;
    if (git(registryRoot, ['branch', '--list', branch])) {
        throw new Error(`Curriculum generation branch already exists: ${branch}`);
    }
    const worktreeRoot = mkdtempSync(path.join(os.tmpdir(), 'flashcards-registry-draft-'));
    git(registryRoot, [
        'worktree', 'add', '-b', branch, worktreeRoot,
        ...(baseCommit ? [baseCommit] : [base])
    ]);
    return {
        base,
        prBase: baseRef || base,
        baseCommit,
        branch,
        sourceRoot: registryRoot,
        worktreeRoot
    };
}

export function registryCatalogHash(registryRoot, catalogPath = 'dist/curriculum.json') {
    if (path.isAbsolute(catalogPath) || catalogPath.includes('..')) {
        throw new Error('Curriculum catalog path must remain inside the registry.');
    }
    return `sha256:${createHash('sha256').update(readFileSync(path.join(registryRoot, catalogPath))).digest('hex')}`;
}

export function publishRegistryDraft(registryRoot, draft, { title, body }) {
    const paths = ['subjects', 'dist/curriculum.json'];
    if (existsSync(path.join(registryRoot, 'deck-metadata.json'))) paths.push('deck-metadata.json');
    git(registryRoot, ['add', '--', ...paths]);
    if (!git(registryRoot, ['status', '--porcelain'])) throw new Error('Generation produced no registry changes.');
    git(registryRoot, ['commit', '-m', title]);
    git(registryRoot, ['push', '-u', 'origin', draft.branch]);
    const url = gh(registryRoot, [
        'pr', 'create', '--draft', '--base', draft.prBase || draft.base, '--head', draft.branch,
        '--title', title, '--body', body
    ]);
    try { git(draft.sourceRoot, ['worktree', 'remove', registryRoot]); } catch { /* PR is already safely published */ }
    return url;
}

export function abandonRegistryDraft(registryRoot, draft) {
    try { git(draft.sourceRoot, ['worktree', 'remove', '--force', registryRoot]); } catch { /* keep original error */ }
    try { git(draft.sourceRoot, ['branch', '-D', draft.branch]); } catch { /* keep original error */ }
}

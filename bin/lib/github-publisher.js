import { spawnSync } from 'node:child_process';

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

export function beginRegistryDraft(registryRoot, requestId) {
    assertCleanRegistryWorktree(registryRoot);
    const base = git(registryRoot, ['branch', '--show-current']);
    const branch = `flashcards/request-${requestId}`;
    git(registryRoot, ['switch', '-c', branch]);
    return { base, branch };
}

export function publishRegistryDraft(registryRoot, draft, { title, body }) {
    git(registryRoot, ['add', 'subjects', 'dist/curriculum.json']);
    if (!git(registryRoot, ['status', '--porcelain'])) throw new Error('Generation produced no registry changes.');
    git(registryRoot, ['commit', '-m', title]);
    git(registryRoot, ['push', '-u', 'origin', draft.branch]);
    const url = gh(registryRoot, [
        'pr', 'create', '--draft', '--base', draft.base, '--head', draft.branch,
        '--title', title, '--body', body
    ]);
    git(registryRoot, ['switch', draft.base]);
    return url;
}

export function abandonRegistryDraft(registryRoot, draft) {
    try { git(registryRoot, ['switch', draft.base]); } catch { /* keep original error */ }
}

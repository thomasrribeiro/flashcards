import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPOSITORY_URL = /^https:\/\/github\.com\/([^/]+)\/([^/#]+)\/?$/i;

function run(command, args, { cwd, allowFailure = false } = {}) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
    if (result.error) throw new Error(`Unable to run ${command}: ${result.error.message}`);
    if (!allowFailure && result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `${command} exited with status ${result.status}`).trim());
    }
    return result;
}

function git(cwd, args, options) {
    return run('git', args, { cwd, ...options });
}

function gh(cwd, args, options) {
    return run('gh', args, { cwd, ...options });
}

export function deckRepositoryCoordinates(value) {
    const match = REPOSITORY_URL.exec(String(value || ''));
    if (!match) throw new Error('Deck repository must use https://github.com/owner/repository.');
    return {
        owner: match[1],
        repository: match[2].replace(/\.git$/i, ''),
        url: `https://github.com/${match[1]}/${match[2].replace(/\.git$/i, '')}`
    };
}

function remoteUrl(deckPath) {
    const result = git(deckPath, ['remote', 'get-url', 'origin'], { allowFailure: true });
    if (result.status !== 0) return '';
    return result.stdout.trim()
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/\.git$/, '');
}

function commit(deckPath, message) {
    git(deckPath, ['add', '--all']);
    if (!git(deckPath, ['status', '--porcelain']).stdout.trim()) return false;
    git(deckPath, [
        '-c', 'user.name=Flashcards generation runner',
        '-c', 'user.email=flashcards-generation@users.noreply.github.com',
        'commit', '-m', message
    ]);
    return true;
}

function repositoryDetails(deckPath, coordinates) {
    const result = gh(deckPath, [
        'repo', 'view', `${coordinates.owner}/${coordinates.repository}`,
        '--json', 'nameWithOwner,defaultBranchRef'
    ], { allowFailure: true });
    if (result.status !== 0) return null;
    return JSON.parse(result.stdout);
}

export function beginDeckDraft(deckPath, repositoryUrl, requestId, {
    visibility = 'private'
} = {}) {
    if (!existsSync(path.join(deckPath, '.git'))) {
        throw new Error(`Deck is not a Git repository: ${deckPath}`);
    }
    const coordinates = deckRepositoryCoordinates(repositoryUrl);
    let details = repositoryDetails(deckPath, coordinates);
    let base;
    let createdRepository = false;

    if (!details) {
        base = git(deckPath, ['branch', '--show-current']).stdout.trim() || 'master';
        commit(deckPath, `Initialize ${coordinates.repository} deck curriculum`);
        const head = git(deckPath, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
        if (head.status !== 0) throw new Error('Deck initialization produced no Git commit.');
        gh(deckPath, [
            'repo', 'create', `${coordinates.owner}/${coordinates.repository}`,
            visibility === 'public' ? '--public' : '--private',
            '--source', deckPath,
            '--remote', 'origin',
            '--push'
        ]);
        createdRepository = true;
        details = repositoryDetails(deckPath, coordinates);
    } else {
        const configuredRemote = remoteUrl(deckPath);
        if (!configuredRemote) {
            git(deckPath, ['remote', 'add', 'origin', `${coordinates.url}.git`]);
        } else if (configuredRemote.toLowerCase() !== coordinates.url.toLowerCase()) {
            throw new Error(`Deck origin ${configuredRemote} does not match pinned repository ${coordinates.url}.`);
        }
        if (git(deckPath, ['status', '--porcelain']).stdout.trim()) {
            throw new Error('Deck workspace has unpublished changes; publish or discard them before another generation job.');
        }
        git(deckPath, ['fetch', 'origin']);
        base = details.defaultBranchRef?.name || 'master';
        git(deckPath, ['switch', base]);
        git(deckPath, ['merge', '--ff-only', `origin/${base}`]);
    }

    base ||= details?.defaultBranchRef?.name || 'master';
    const branch = `flashcards/request-${requestId}`;
    if (git(deckPath, ['branch', '--list', branch]).stdout.trim()) {
        throw new Error(`Deck generation branch already exists: ${branch}`);
    }
    git(deckPath, ['switch', '-c', branch]);
    return { ...coordinates, base, branch, createdRepository };
}

export function publishDeckDraft(deckPath, draft, { title, body }) {
    if (!commit(deckPath, title)) throw new Error('Generation produced no deck changes.');
    git(deckPath, ['push', '-u', 'origin', draft.branch]);
    const result = gh(deckPath, [
        'pr', 'create', '--draft', '--base', draft.base, '--head', draft.branch,
        '--title', title, '--body', body
    ]);
    git(deckPath, ['switch', draft.base]);
    return result.stdout.trim();
}

export function abandonDeckDraft(deckPath, draft) {
    try { git(deckPath, ['switch', draft.base]); } catch { /* preserve original failure */ }
}

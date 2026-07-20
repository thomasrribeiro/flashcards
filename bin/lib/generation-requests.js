import { spawnSync } from 'node:child_process';

function githubToken(explicit) {
    if (explicit) return explicit;
    if (process.env.FLASHCARDS_GITHUB_TOKEN) return process.env.FLASHCARDS_GITHUB_TOKEN;
    const result = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
    throw new Error('GitHub authentication is required. Run gh auth login or set FLASHCARDS_GITHUB_TOKEN.');
}

function workerUrl(explicit) {
    const value = explicit || process.env.FLASHCARDS_WORKER_URL;
    if (!value) throw new Error('Set --worker-url or FLASHCARDS_WORKER_URL.');
    return value.replace(/\/$/, '');
}

async function request(endpoint, { method = 'GET', body, token, url } = {}) {
    const response = await fetch(`${workerUrl(url)}${endpoint}`, {
        method,
        headers: {
            Authorization: `Bearer ${githubToken(token)}`,
            'Content-Type': 'application/json'
        },
        body: body == null ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
    return payload;
}

export function listGenerationRequests(options = {}) {
    return request('/api/generation-requests', {
        token: options.token,
        url: options.workerUrl
    }).then(result => ({
        ...result,
        requests: (result.requests || []).map(item => ({
            ...item,
            job_type: item.job_type || 'deck-build',
            payload: item.payload_json ? JSON.parse(item.payload_json) : {
                deckId: item.deck_id,
                chapterId: item.chapter_id
            }
        }))
    }));
}

export function updateGenerationRequest(id, partial, options = {}) {
    return request(`/api/generation-requests/${id}`, {
        method: 'PATCH',
        body: partial,
        token: options.token,
        url: options.workerUrl
    });
}

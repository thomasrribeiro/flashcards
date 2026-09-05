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

function runnerToken(explicit) {
    const value = explicit || process.env.FLASHCARDS_RUNNER_TOKEN;
    if (value) return value;
    if (process.platform === 'darwin') {
        const keychain = spawnSync('security', [
            'find-generic-password',
            '-a', process.env.USER || '',
            '-s', 'flashcards-generation-runner',
            '-w'
        ], { encoding: 'utf8' });
        if (keychain.status === 0 && keychain.stdout.trim()) return keychain.stdout.trim();
    }
    throw new Error('Set --runner-token or FLASHCARDS_RUNNER_TOKEN, or provision the macOS flashcards-generation-runner keychain item.');
}

export function hasGenerationRunnerToken(explicit) {
    try {
        return Boolean(runnerToken(explicit));
    } catch {
        return false;
    }
}

async function request(endpoint, { method = 'GET', body, token, url } = {}) {
    const response = await fetch(`${workerUrl(url)}${endpoint}`, {
        method,
        signal: AbortSignal.timeout(15_000),
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

async function runnerRequest(endpoint, { method = 'POST', body, token, url } = {}) {
    const retryDelays = method === 'PATCH' ? [0, 250, 1000] : [0];
    let lastError = null;

    for (const [attempt, delay] of retryDelays.entries()) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        let response;
        try {
            response = await fetch(`${workerUrl(url)}${endpoint}`, {
                method,
                signal: AbortSignal.timeout(15_000),
                headers: {
                    'X-Flashcards-Runner-Token': runnerToken(token),
                    'Content-Type': 'application/json'
                },
                body: body == null ? undefined : JSON.stringify(body)
            });
        } catch (error) {
            if (attempt === retryDelays.length - 1) throw error;
            lastError = error;
            continue;
        }

        const payload = await response.json().catch(() => ({}));
        if (response.ok) return payload;

        const error = new Error(payload.error || `${response.status} ${response.statusText}`);
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retryable || attempt === retryDelays.length - 1) throw error;
        lastError = error;
    }

    throw lastError || new Error('Generation runner request failed');
}

export function claimGenerationRequest(options = {}) {
    return runnerRequest('/api/generation-runner/claim', {
        token: options.runnerToken,
        url: options.workerUrl
    });
}

export function getClaimedGenerationRequest(id, options = {}) {
    return runnerRequest(`/api/generation-runner/requests/${id}`, {
        method: 'GET', token: options.runnerToken, url: options.workerUrl
    });
}

export function updateClaimedGenerationRequest(id, partial, options = {}) {
    return runnerRequest(`/api/generation-runner/requests/${id}`, {
        method: 'PATCH',
        body: partial,
        token: options.runnerToken,
        url: options.workerUrl
    });
}

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const REVIEW_STATUSES = new Set(['needs-review']);

function parsePayload(value) {
    if (value && typeof value === 'object') return value;
    if (!value) return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

export function normalizeGenerationRequest(input) {
    const payload = parsePayload(input?.payload || input?.payload_json);
    return {
        id: Number(input?.id),
        jobType: input?.jobType || input?.job_type || 'deck-build',
        requestKey: input?.requestKey || input?.request_key || '',
        registryId: input?.registryId || input?.registry_id || '',
        targetRepository: input?.targetRepository || input?.target_repository || '',
        providerId: input?.providerId || input?.provider_id || '',
        modelId: input?.modelId || input?.model_id || '',
        status: String(input?.status || 'queued').toLowerCase(),
        resultUrl: input?.resultUrl || input?.result_url || '',
        error: input?.error || '',
        requestedAt: input?.requestedAt || input?.requested_at || '',
        updatedAt: input?.updatedAt || input?.updated_at || '',
        payload,
        subject: payload.subject || '',
        deckId: payload.deckId || input?.deck_id || ''
    };
}

export function summarizeGenerationActivity(requests) {
    return requests.reduce((summary, request) => {
        if (ACTIVE_STATUSES.has(request.status)) summary.active += 1;
        if (REVIEW_STATUSES.has(request.status)) summary.review += 1;
        return summary;
    }, { active: 0, review: 0 });
}

function initiatedAt(request) {
    const value = String(request?.requestedAt || '');
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
        ? `${value.replace(' ', 'T')}Z`
        : value;
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortGenerationRequestsByInitiatedAt(requests) {
    return [...requests].sort((a, b) => (
        initiatedAt(b) - initiatedAt(a) || Number(b.id || 0) - Number(a.id || 0)
    ));
}

export function pullRequestCoordinates(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('The generation result is not a valid pull request URL.');
    }
    const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(url.pathname);
    if (url.hostname !== 'github.com' || !match) {
        throw new Error('The generation result is not a GitHub pull request URL.');
    }
    return { owner: match[1], repository: match[2], number: Number(match[3]) };
}

export async function reconcileGenerationRequestStatuses(requests, {
    fetchImpl = fetch,
    token = '',
    updateRequest = async () => ({})
} = {}) {
    return Promise.all(requests.map(async request => {
        if (request.status !== 'needs-review' || !request.resultUrl) return request;
        let pull;
        try {
            pull = pullRequestCoordinates(request.resultUrl);
        } catch {
            return request;
        }
        try {
            const freshness = Date.now();
            const response = await fetchImpl(
                `https://api.github.com/repos/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/pulls/${pull.number}?activity_fresh=${freshness}`,
                {
                    cache: 'no-cache',
                    headers: {
                        Accept: 'application/vnd.github+json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                }
            );
            if (!response.ok) return request;
            const details = await response.json();
            const status = details.merged || details.merged_at
                ? 'published'
                : details.state === 'closed' ? 'cancelled' : null;
            if (!status) return request;
            const updated = await updateRequest(request.id, {
                status,
                resultUrl: request.resultUrl
            });
            return normalizeGenerationRequest({
                ...request,
                ...(updated?.request || updated),
                status
            });
        } catch {
            // Activity remains reviewable if GitHub or persistence is temporarily
            // unavailable; the next poll safely retries reconciliation.
            return request;
        }
    }));
}

async function checkedJson(response, message) {
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `${message} (${response.status})`);
    }
    return response.json();
}

export async function loadPullRequestCurriculum(request, {
    fetchImpl = fetch,
    token = ''
} = {}) {
    const pull = pullRequestCoordinates(request.resultUrl);
    const headers = {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
    const details = await checkedJson(await fetchImpl(
        `https://api.github.com/repos/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/pulls/${pull.number}`,
        { headers }
    ), 'Could not load the pull request');
    const commit = details?.head?.sha;
    if (!/^[a-f0-9]{40}$/i.test(commit || '')) {
        throw new Error('The pull request does not expose a pinned head commit.');
    }
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/${commit}/dist/curriculum.json`;
    const rawResponse = await fetchImpl(rawUrl, { cache: 'no-cache' });
    let catalog;
    if (rawResponse.ok) {
        catalog = await rawResponse.json();
    } else if (token) {
        const contentUrl = `https://api.github.com/repos/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/contents/dist/curriculum.json?ref=${encodeURIComponent(commit)}`;
        catalog = await checkedJson(await fetchImpl(contentUrl, {
            headers: {
                Accept: 'application/vnd.github.raw+json',
                Authorization: `Bearer ${token}`
            }
        }), 'Could not load the pull request curriculum');
    } else {
        catalog = await checkedJson(rawResponse, 'Could not load the pull request curriculum');
    }
    if (!Array.isArray(catalog?.subjects) || !Array.isArray(catalog?.decks)) {
        throw new Error('The pull request curriculum has an invalid catalog shape.');
    }
    if (request.subject && !catalog.subjects.some(subject => subject.id === request.subject)) {
        throw new Error(`The pull request does not contain the ${request.subject} subject.`);
    }
    return { catalog, commit, pull };
}

export function generationRequestName(request) {
    if (request.jobType === 'subject-design') {
        const subject = request.payload?.title || String(request.subject || 'Subject')
            .split('-')
            .map(word => word ? `${word[0].toUpperCase()}${word.slice(1)}` : '')
            .join(' ');
        return `${subject} curriculum`;
    }
    if (request.jobType === 'deck-plan') {
        return `${request.deckId || 'Deck'} chapter curriculum`;
    }
    if (request.jobType === 'chapter-expand') {
        const chapter = request.payload?.chapterId || '';
        return `${request.deckId || 'Deck'}${chapter ? ` / ${chapter}` : ''} content`;
    }
    return request.deckId || request.requestKey || `Request ${request.id}`;
}

export function generationStatusLabel(status) {
    return ({
        queued: 'Queued',
        running: 'Running',
        'needs-review': 'Ready for review',
        published: 'Published',
        failed: 'Failed',
        cancelled: 'Cancelled'
    })[status] || status;
}

export function generationPullRequestActionLabel(status) {
    return ({
        'needs-review': 'Review pull request',
        published: 'View merged pull request',
        cancelled: 'View closed pull request'
    })[status] || 'View pull request';
}

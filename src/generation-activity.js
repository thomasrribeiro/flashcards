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
    const catalog = await checkedJson(await fetchImpl(
        `https://raw.githubusercontent.com/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/${commit}/dist/curriculum.json`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    ), 'Could not load the pull request curriculum');
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

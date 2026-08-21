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
    const result = parsePayload(input?.result || input?.result_json);
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
        registryResultUrl: input?.registryResultUrl || result.registryResultUrl || '',
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

export async function mergeGenerationPullRequest(request, {
    fetchImpl = fetch,
    token = '',
    expectedHead = ''
} = {}) {
    if (!token) throw new Error('Sign in with GitHub before merging curriculum changes.');
    const pull = pullRequestCoordinates(request.resultUrl);
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    const details = await checkedJson(await fetchImpl(
        `https://api.github.com/repos/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/pulls/${pull.number}`,
        { headers }
    ), 'Could not load the pull request before merging');
    if (details.merged || details.merged_at) return { pull, alreadyMerged: true, details };
    if (details.state !== 'open') throw new Error('This pull request is closed and cannot be merged.');
    const head = details?.head?.sha;
    if (!/^[a-f0-9]{40}$/i.test(head || '')) {
        throw new Error('The pull request does not expose a pinned head commit.');
    }
    if (expectedHead && head.toLowerCase() !== expectedHead.toLowerCase()) {
        throw new Error('The pull request changed after this preview loaded. Exit and preview it again before merging.');
    }
    if (details.draft) {
        if (!details.node_id) throw new Error('The draft pull request does not expose a GitHub node ID.');
        const readyResponse = await fetchImpl('https://api.github.com/graphql', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: 'mutation MarkReady($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { id isDraft } } }',
                variables: { id: details.node_id }
            })
        });
        const ready = await checkedJson(readyResponse, 'Could not mark the draft pull request ready');
        if (ready.errors?.length) {
            throw new Error(ready.errors.map(error => error.message).join('\n'));
        }
    }
    const merged = await checkedJson(await fetchImpl(
        `https://api.github.com/repos/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/pulls/${pull.number}/merge`,
        {
            method: 'PUT',
            headers,
            body: JSON.stringify({ sha: head, merge_method: 'merge' })
        }
    ), 'GitHub could not merge the curriculum pull request');
    if (!merged.merged) throw new Error(merged.message || 'GitHub did not merge the curriculum pull request.');
    return { pull, alreadyMerged: false, details, merged };
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
            const pulls = [pull];
            if (request.registryResultUrl) {
                try { pulls.push(pullRequestCoordinates(request.registryResultUrl)); } catch { return request; }
            }
            const details = [];
            for (const coordinates of pulls) {
                const freshness = Date.now();
                const response = await fetchImpl(
                    `https://api.github.com/repos/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repository)}/pulls/${coordinates.number}?activity_fresh=${freshness}`,
                    {
                        cache: 'no-cache',
                        headers: {
                            Accept: 'application/vnd.github+json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {})
                        }
                    }
                );
                if (!response.ok) return request;
                details.push(await response.json());
            }
            const status = details.every(item => item.merged || item.merged_at)
                ? 'published'
                : details.some(item => item.state === 'closed' && !(item.merged || item.merged_at))
                    ? 'cancelled'
                    : null;
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

async function checkedText(response, message) {
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `${message} (${response.status})`);
    }
    return response.text();
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
    if (request.deckId && !catalog.decks.some(deck => deck.id === request.deckId)) {
        throw new Error(`The pull request does not contain the ${request.deckId} deck.`);
    }
    return { catalog, commit, pull };
}

export async function loadPullRequestChapter(request, {
    fetchImpl = fetch,
    token = ''
} = {}) {
    if (!token) throw new Error('Sign in with GitHub before reviewing generated flashcards.');
    const pull = pullRequestCoordinates(request.resultUrl);
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`
    };
    const details = await checkedJson(await fetchImpl(
        `https://api.github.com/repos/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/pulls/${pull.number}`,
        { headers }
    ), 'Could not load the flashcards pull request');
    const commit = details?.head?.sha;
    if (!/^[a-f0-9]{40}$/i.test(commit || '')) {
        throw new Error('The flashcards pull request does not expose a pinned head commit.');
    }
    const chapterId = String(request.payload?.chapterId || '').replace(/\.md$/i, '');
    if (!/^\d{2}_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(chapterId)) {
        throw new Error('The generation request does not identify an ordered chapter file.');
    }
    const file = `flashcards/${chapterId}.md`;
    const encodedFile = file.split('/').map(encodeURIComponent).join('/');
    const markdown = await checkedText(await fetchImpl(
        `https://api.github.com/repos/${encodeURIComponent(pull.owner)}/${encodeURIComponent(pull.repository)}/contents/${encodedFile}?ref=${encodeURIComponent(commit)}`,
        {
            cache: 'no-cache',
            headers: {
                Accept: 'application/vnd.github.raw+json',
                Authorization: `Bearer ${token}`
            }
        }
    ), 'Could not load the generated chapter');
    if (typeof markdown !== 'string') {
        throw new Error('GitHub returned an invalid generated chapter.');
    }
    return {
        markdown,
        commit,
        pull,
        file,
        repositoryId: `${pull.owner}/${pull.repository}`
    };
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

export function generationEffectiveCommand(request) {
    if (request.jobType !== 'chapter-expand') return '';
    const chapter = Number.parseInt(String(request.payload?.chapterId || '').slice(0, 2), 10);
    if (!Number.isInteger(chapter)) return '';
    if (request.payload?.buildScope === 'pilot') {
        return `flashcards deck build <deck-path>${request.payload?.generationMode === 'replace' ? ' --fresh-pilot' : ''}`;
    }
    return `flashcards deck build <deck-path> --chapter ${chapter}${request.payload?.generationMode === 'replace' ? ' --fresh-chapter' : ''}`;
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

export function generationPreviewDestination(request) {
    if (request.jobType === 'deck-plan') {
        const deckId = String(request.deckId || request.payload?.deckId || '');
        const subject = deckId.split('/')[0];
        if (!subject || !deckId.includes('/')) {
            throw new Error('The deck-plan result does not identify a canonical subject/deck target.');
        }
        return {
            mode: 'chapters', hierarchy: 'chapter', subject,
            parentId: deckId, targetId: '', query: '', layerStart: 0
        };
    }
    return {
        mode: 'subject', hierarchy: 'deck', subject: request.subject,
        parentId: request.subject, targetId: '', query: '', layerStart: 0
    };
}

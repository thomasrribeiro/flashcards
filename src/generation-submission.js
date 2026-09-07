import { normalizeGenerationRequest } from './generation-activity.js';

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
}

function fingerprint(input) {
    const request = normalizeGenerationRequest(input);
    // Addition metadata does not change model input; required decks do.
    const { newSubject, newSubjects, ...payload } = request.payload;
    return JSON.stringify(canonical([
        request.jobType, request.registryId, request.targetRepository,
        request.providerId, request.modelId, payload
    ]));
}

export async function submitGenerationJob(apiRequest, job, { onChecking = () => {} } = {}) {
    const startedAt = Date.now();
    const body = JSON.stringify(job);
    try {
        return await apiRequest('/api/generation-requests', { method: 'POST', body });
    } catch (error) {
        // Only a lost transport/response is ambiguous. Keep explicit API errors intact.
        if (!['TypeError', 'SyntaxError', 'AbortError', 'TimeoutError'].includes(error.name)) throw error;
        onChecking();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
            const result = await apiRequest('/api/generation-requests', {
                method: 'GET', cache: 'no-store', signal: controller.signal
            });
            const expected = fingerprint(JSON.parse(body));
            const match = (result.requests || []).find(input => {
                const request = normalizeGenerationRequest(input);
                const timestamp = request.requestedAt.replace(' ', 'T');
                const created = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`);
                const current = ['queued', 'running', 'needs-review'].includes(request.status)
                    || created >= startedAt - 1000;
                return request.id > 0 && current && fingerprint(input) === expected;
            });
            if (match) return { request: match, existing: true };
        } catch {
            // Failure to read activity is not evidence that submission failed.
        } finally {
            clearTimeout(timeout);
        }
        // Never automatically repeat a POST: it may still be processing remotely.
        const uncertain = new Error('Submission unconfirmed. Check Settings → Agents before retrying.', { cause: error });
        uncertain.submissionUnconfirmed = true;
        throw uncertain;
    }
}

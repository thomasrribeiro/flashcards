import { describe, expect, it, vi } from 'vitest';
import { submitGenerationJob } from './generation-submission.js';

const job = {
    jobType: 'curriculum-design', registryId: 'main', targetRepository: 'owner/curricula',
    providerId: 'openai', modelId: 'test-model',
    payload: { subjects: ['math'], reasoningEffort: 'high', catalogHash: 'pinned' }
};
const stored = {
    id: 42, job_type: job.jobType, registry_id: job.registryId,
    target_repository: job.targetRepository, provider_id: job.providerId,
    model_id: job.modelId, payload_json: JSON.stringify(job.payload), status: 'queued'
};

describe('generation submission recovery', () => {
    it('ignores addition metadata but distinguishes different required decks during recovery', async () => {
        const constrained = { ...job, payload: { ...job.payload, newSubjects: ['math'], mandatoryDecks: [{ subject: 'math', decks: ['algebra'] }] } };
        const wrong = { ...stored, id: 99, payload_json: JSON.stringify({ ...constrained.payload, mandatoryDecks: [{ subject: 'math', decks: ['geometry'] }] }) };
        const matching = { ...stored, payload_json: JSON.stringify({ ...job.payload, mandatoryDecks: constrained.payload.mandatoryDecks }) };
        const api = vi.fn().mockRejectedValueOnce(new TypeError('Load failed')).mockResolvedValueOnce({ requests: [wrong, matching] });
        expect((await submitGenerationJob(api, constrained)).request.id).toBe(42);
        expect(api).toHaveBeenCalledTimes(2);
    });
    it('does not add requests when submission succeeds', async () => {
        const result = { request: stored, existing: false };
        const api = vi.fn().mockResolvedValue(result);
        expect(await submitGenerationJob(api, job)).toBe(result);
        expect(api).toHaveBeenCalledTimes(1);
    });

    it('recovers a committed job after its response is lost without repeating the POST', async () => {
        const api = vi.fn().mockRejectedValueOnce(new TypeError('Load failed'))
            .mockResolvedValueOnce({ requests: [stored] });
        const onChecking = vi.fn();
        expect(await submitGenerationJob(api, job, { onChecking })).toEqual({ request: stored, existing: true });
        expect(onChecking).toHaveBeenCalledOnce();
        expect(api.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET']);
        expect(api.mock.calls[1][1].cache).toBe('no-store');
    });

    it('matches payloads regardless of key order', async () => {
        const api = vi.fn().mockRejectedValueOnce(new TypeError('Load failed'))
            .mockResolvedValueOnce({ requests: [{ ...stored, payload_json: JSON.stringify({
                catalogHash: 'pinned', reasoningEffort: 'high', subjects: ['math']
            }) }] });
        expect((await submitGenerationJob(api, job)).request.id).toBe(42);
    });

    it('does not mistake different models, reasoning, or catalog versions for the submission', async () => {
        const api = vi.fn().mockRejectedValueOnce(new TypeError('Load failed'))
            .mockResolvedValueOnce({ requests: [
                { ...stored, model_id: 'other' },
                { ...stored, payload_json: JSON.stringify({ ...job.payload, reasoningEffort: 'low' }) },
                { ...stored, payload_json: JSON.stringify({ ...job.payload, catalogHash: 'old' }) },
                { ...stored, target_repository: 'other/curricula' }
            ] });
        await expect(submitGenerationJob(api, job)).rejects.toMatchObject({ submissionUnconfirmed: true });
        expect(api).toHaveBeenCalledTimes(2);
    });

    it('recovers newly finished jobs but not old terminal jobs', async () => {
        const api = vi.fn().mockRejectedValueOnce(new TypeError('Load failed'))
            .mockResolvedValueOnce({ requests: [
                { ...stored, id: 40, status: 'failed', requested_at: '2020-01-01 00:00:00' },
                { ...stored, status: 'published', requested_at: new Date().toISOString() }
            ] });
        expect((await submitGenerationJob(api, job)).request.id).toBe(42);
    });

    it('reports uncertainty if activity is unreachable without retrying submission', async () => {
        const api = vi.fn().mockRejectedValue(new TypeError('Load failed'));
        await expect(submitGenerationJob(api, job)).rejects.toThrow('Check Settings → Agents before retrying');
        expect(api).toHaveBeenCalledTimes(2);
    });

    it('preserves explicit server errors', async () => {
        const error = new Error('Model unavailable');
        const api = vi.fn().mockRejectedValue(error);
        await expect(submitGenerationJob(api, job)).rejects.toBe(error);
        expect(api).toHaveBeenCalledOnce();
    });

    it('bounds the recovery lookup when the connection hangs', async () => {
        vi.useFakeTimers();
        try {
            const api = vi.fn().mockRejectedValueOnce(new TypeError('Load failed'))
                .mockImplementationOnce((endpoint, { signal }) => new Promise((resolve, reject) => {
                    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                }));
            const outcome = expect(submitGenerationJob(api, job)).rejects.toMatchObject({ submissionUnconfirmed: true });
            await vi.advanceTimersByTimeAsync(10_000);
            await outcome;
            expect(api).toHaveBeenCalledTimes(2);
        } finally { vi.useRealTimers(); }
    });
});

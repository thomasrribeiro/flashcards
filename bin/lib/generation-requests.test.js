import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateClaimedGenerationRequest } from './generation-requests.js';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('updateClaimedGenerationRequest', () => {
    it('retries an idempotent runner update after a transient fetch failure', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response(JSON.stringify({ request: { id: 6 } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        vi.stubGlobal('fetch', fetchMock);

        const update = updateClaimedGenerationRequest(6, { status: 'needs-review' }, {
            runnerToken: 'runner-token',
            workerUrl: 'https://worker.example'
        });
        await vi.runAllTimersAsync();

        await expect(update).resolves.toEqual({ request: { id: 6 } });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-transient worker rejection', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Not allowed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(updateClaimedGenerationRequest(6, { status: 'needs-review' }, {
            runnerToken: 'runner-token',
            workerUrl: 'https://worker.example'
        })).rejects.toThrow('Not allowed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

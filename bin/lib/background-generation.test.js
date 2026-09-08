import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { requestBackgroundGeneration, withGenerationTerminationSignal } from './background-generation.js';

const queued = () => Response.json({ id: 'resp_test', status: 'queued' });
const done = () => Response.json({ id: 'resp_test', status: 'completed', output: [] });
const options = () => ({ body: { model: 'configured-model', input: '{"subjects":["math"]}', store: false },
    apiKey: 'secret', signal: new AbortController().signal, wait: vi.fn(async () => {}) });

describe('background generation transport', () => {
    it('saves the ID before polling and recovers network, HTTP and body failures without another creation', async () => {
        const saved = vi.fn();
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(queued())
            .mockImplementationOnce(() => {
                expect(saved).toHaveBeenCalledWith('resp_test');
                throw new TypeError('secret transport details');
            })
            .mockResolvedValueOnce(new Response('secret', { status: 503 }))
            .mockResolvedValueOnce(new Response('secret', { status: 429 }))
            .mockResolvedValueOnce(new Response('invalid JSON'))
            .mockResolvedValueOnce(Response.json({ id: 'resp_test', status: 'in_progress' }))
            .mockResolvedValueOnce(done());
        const opts = options();
        expect((await requestBackgroundGeneration({ ...opts, fetchImpl, onCreated: saved })).status).toBe('completed');
        const calls = fetchImpl.mock.calls;
        expect(JSON.parse(calls[0][1].body)).toMatchObject({ background: true, stream: false, store: false });
        expect(calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
        for (const [url, request] of calls.slice(1)) {
            expect(url).toBe('https://api.openai.com/v1/responses/resp_test');
            expect(request.body).toBeUndefined();
        }
        expect(opts.wait.mock.calls.map(([ms]) => ms)).toEqual([5_000, 5_000, 10_000, 20_000, 30_000, 5_000]);
    });

    it.each([401, 429, 500])('does not retry creation HTTP %i', async status => {
        const fetchImpl = vi.fn(async () => new Response('secret', { status }));
        await expect(requestBackgroundGeneration({ ...options(), fetchImpl })).rejects.toThrow(`HTTP ${status}`);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry an uncertain submission or invent a response ID', async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
        const onCreated = vi.fn();
        await expect(requestBackgroundGeneration({ ...options(), fetchImpl, onCreated })).rejects.toThrow();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(onCreated).not.toHaveBeenCalled();
    });

    it('cancels acknowledged work on timeout using an independent signal', async () => {
        const controller = new AbortController();
        const fetchImpl = vi.fn().mockResolvedValueOnce(queued()).mockImplementationOnce((_url, request) => {
            expect(request.signal.aborted).toBe(false);
            return Response.json({ status: 'cancelled' });
        });
        await expect(requestBackgroundGeneration({ ...options(), signal: controller.signal, fetchImpl,
            wait: async () => {
                controller.abort(new DOMException('deadline', 'TimeoutError'));
                controller.signal.throwIfAborted();
            }
        })).rejects.toMatchObject({ name: 'TimeoutError' });
        expect(fetchImpl.mock.calls[1][0]).toBe('https://api.openai.com/v1/responses/resp_test/cancel');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('bounds repeated retrieval failure and cancels instead of resubmitting', async () => {
        const fetchImpl = vi.fn(async (url, request) => {
            if (url.endsWith('/cancel')) return Response.json({ status: 'cancelled' });
            if (request.method === 'POST') return queued();
            throw new TypeError('network down');
        });
        await expect(requestBackgroundGeneration({ ...options(), fetchImpl })).rejects.toThrow('status unavailable after repeated reconnects');
        expect(fetchImpl).toHaveBeenCalledTimes(22);
        expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/responses'))).toHaveLength(1);
    });

    it.each([() => new Response('secret', { status: 404 }),
        () => Response.json({ id: 'different-response', status: 'completed' })])('rejects permanent retrieval errors and mismatched IDs', async poll => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(queued()).mockResolvedValueOnce(poll())
            .mockResolvedValueOnce(Response.json({ status: 'cancelled' }));
        await expect(requestBackgroundGeneration({ ...options(), fetchImpl })).rejects.toThrow(/HTTP 404|ID changed/);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(fetchImpl.mock.calls[2][0]).toMatch(/\/cancel$/);
    });

    it('reports unconfirmed remote cancellation honestly', async () => {
        const controller = new AbortController();
        const fetchImpl = vi.fn().mockResolvedValueOnce(queued()).mockRejectedValueOnce(new TypeError('secret'));
        await expect(requestBackgroundGeneration({ ...options(), signal: controller.signal, fetchImpl,
            wait: async () => { controller.abort(); controller.signal.throwIfAborted(); }
        })).rejects.toThrow('Provider cancellation could not be confirmed; it may still be running.');
    });

    it('does not poll or cancel a response already completed', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(done());
        const onCreated = vi.fn();
        await requestBackgroundGeneration({ ...options(), fetchImpl, onCreated });
        expect(onCreated).toHaveBeenCalledWith('resp_test');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('cancels if retaining the response ID fails, and rejects unsafe IDs', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(queued()).mockResolvedValueOnce(Response.json({ status: 'cancelled' }));
        await expect(requestBackgroundGeneration({ ...options(), fetchImpl,
            onCreated: () => { throw new Error('Could not retain response ID.'); }
        })).rejects.toThrow('Could not retain response ID.');
        expect(fetchImpl.mock.calls[1][0]).toMatch(/\/cancel$/);
        fetchImpl.mockReset().mockResolvedValueOnce(Response.json({ id: '../unsafe', status: 'queued' }));
        await expect(requestBackgroundGeneration({ ...options(), fetchImpl })).rejects.toThrow('invalid response ID');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each(['SIGTERM', 'SIGINT'])('turns %s into graceful cancellation and restores listeners', async event => {
        const events = new EventEmitter();
        await expect(withGenerationTerminationSignal(async signal => {
            events.emit(event);
            signal.throwIfAborted();
        }, events)).rejects.toMatchObject({ name: 'AbortError' });
        expect(events.listenerCount('SIGTERM')).toBe(0);
        expect(events.listenerCount('SIGINT')).toBe(0);
    });
});

import { setTimeout as delay } from 'node:timers/promises';

const endpoint = 'https://api.openai.com/v1/responses';
const pending = status => ['queued', 'in_progress'].includes(status);
const transient = status => [408, 429].includes(status) || status >= 500;

/** Submit once; reconnect only by retrieving the acknowledged response ID. */
export async function requestBackgroundGeneration({ body, apiKey, signal, dispatcher,
    fetchImpl = fetch, onCreated = async () => {}, wait = ms => delay(ms, undefined, { signal }) }) {
    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    let responseId;
    let terminal = false;
    const request = async (url, options = {}) => {
        signal.throwIfAborted();
        return fetchImpl(url, { dispatcher, headers, ...options,
            signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
    };
    try {
        // An uncertain creation is never replayed, even after a connection error.
        const response = await request(endpoint, { method: 'POST',
            body: JSON.stringify({ ...body, background: true, stream: false }) });
        if (!response.ok) throw new Error(`Generation provider returned HTTP ${response.status}.`);
        let result = await response.json();
        if (typeof result.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(result.id)) {
            throw new Error('The provider returned an invalid response ID. Submission was not retried.');
        }
        responseId = result.id;
        const acceptStatus = value => {
            if (!['queued', 'in_progress', 'completed', 'failed', 'incomplete', 'cancelled'].includes(value.status)) {
                throw new Error('The provider returned an invalid generation status.');
            }
            terminal = !pending(value.status);
        };
        acceptStatus(result);
        await onCreated(responseId);
        let failures = 0;
        while (pending(result.status)) {
            await wait(failures ? Math.min(30_000, 5_000 * 2 ** (failures - 1)) : 5_000);
            let next;
            try {
                const poll = await request(`${endpoint}/${encodeURIComponent(responseId)}`);
                if (!poll.ok && !transient(poll.status)) {
                    throw new Error(`Generation status returned HTTP ${poll.status}.`);
                }
                if (!poll.ok) {
                    await poll.body?.cancel();
                    throw new TypeError('Temporary status failure.');
                }
                next = await poll.json();
            } catch (error) {
                signal.throwIfAborted();
                if (!(error instanceof TypeError || error instanceof SyntaxError
                    || ['TimeoutError', 'AbortError'].includes(error?.name) || error?.cause?.code || error?.code)) throw error;
                // Recover short outages without abandoning a paid response or
                // retrying forever against a broken connection.
                if (++failures >= 20) throw new Error('Generation status unavailable after repeated reconnects.');
                continue;
            }
            if (next.id !== responseId) throw new Error('Generation response ID changed unexpectedly.');
            result = next;
            acceptStatus(result);
            failures = 0;
        }
        return result;
    } catch (error) {
        let cancellationFailed = false;
        if (responseId && !terminal) {
            // Background work survives a closed connection. Cancellation needs
            // its own short deadline, independent of the aborted job signal.
            try {
                const cancelled = await fetchImpl(`${endpoint}/${encodeURIComponent(responseId)}/cancel`, {
                    method: 'POST', dispatcher, headers, signal: AbortSignal.timeout(3_000)
                });
                cancellationFailed = !cancelled.ok;
                await cancelled.body?.cancel();
            } catch { cancellationFailed = true; }
        }
        if (cancellationFailed) throw new Error('Generation interrupted. Provider cancellation could not be confirmed; it may still be running.');
        if (signal.aborted) throw signal.reason;
        if (error?.name === 'TimeoutError') throw new Error('Generation submission timed out. Not retried automatically.');
        throw error;
    }
}

// The desktop cancellation monitor sends SIGTERM before its forced-kill grace
// period. Give asynchronous provider work a chance to cancel remotely first.
export async function withGenerationTerminationSignal(action, processImpl = process) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    processImpl.on('SIGTERM', abort);
    processImpl.on('SIGINT', abort);
    try { return await action(controller.signal); }
    finally {
        processImpl.removeListener('SIGTERM', abort);
        processImpl.removeListener('SIGINT', abort);
    }
}

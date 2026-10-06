import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPushState, unsubscribeFromPush } from './push-client.js';

afterEach(() => vi.unstubAllGlobals());

function withoutRegisteredWorker() {
    vi.stubGlobal('navigator', {
        serviceWorker: {
            getRegistration: vi.fn().mockResolvedValue(undefined),
            get ready() { throw new Error('Must not wait for a worker that may never register'); }
        }
    });
    vi.stubGlobal('window', {
        PushManager: {}, Notification: {}, navigator: {},
        matchMedia: () => ({ matches: true })
    });
    vi.stubGlobal('Notification', { permission: 'default' });
}

describe('reminders without an installed service worker', () => {
    it('can save reminders off without waiting for service-worker installation', async () => {
        withoutRegisteredWorker();
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(unsubscribeFromPush()).resolves.toBe(true);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('reports an unsubscribed device when no registration exists', async () => {
        withoutRegisteredWorker();
        await expect(getPushState()).resolves.toBe('default');
    });
});

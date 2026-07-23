import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./storage.js', () => ({
    getCurrentUser: () => ({ id: 'user-1' })
}));

import { getSettings, saveSettings } from './habit-client.js';

function memoryStorage(entries = {}) {
    const values = new Map(Object.entries(entries));
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
        values
    };
}

describe('habit settings persistence', () => {
    let storage;

    beforeEach(() => {
        storage = memoryStorage();
        vi.stubGlobal('localStorage', storage);
    });

    afterEach(() => vi.unstubAllGlobals());

    it('persists signed-in settings to D1 without writing localStorage', async () => {
        let resolveFetch;
        vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveFetch = resolve; })));

        const saving = saveSettings({ activeDecks: ['owner/deck'] });
        expect(storage.getItem('flashcards_habit')).toBeNull();

        await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'));
        resolveFetch({
            ok: true,
            json: () => Promise.resolve({
                settings: { activeDecks: ['owner/deck'], newPerDay: 10, newBatchSize: 10, dailyGoal: 10 }
            })
        });
        await expect(saving).resolves.toMatchObject({ activeDecks: ['owner/deck'] });
        expect(storage.getItem('flashcards_habit')).toBeNull();
    });

    it('ignores stale signed-in local settings and reads D1', async () => {
        storage = memoryStorage({
            flashcards_habit: JSON.stringify({
                settings: { activeDecks: ['owner/stale-deck'] },
                days: {}
            })
        });
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                settings: { activeDecks: ['owner/server-deck'], newPerDay: 20, newBatchSize: 5, dailyGoal: 10 }
            })
        }));

        const settings = await getSettings();

        expect(settings.activeDecks).toEqual(['owner/server-deck']);
        expect(settings.newBatchSize).toBe(5);
        expect(JSON.parse(storage.getItem('flashcards_habit')).settings.activeDecks)
            .toEqual(['owner/stale-deck']);
    });
});

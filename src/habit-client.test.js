import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./storage.js', () => ({
    getCurrentUser: () => ({ id: 'user-1' })
}));

import { getSettings, saveSettings } from './habit-client.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
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

    it('records optimistic settings as pending until the worker confirms them', async () => {
        let resolveFetch;
        vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveFetch = resolve; })));

        const saving = saveSettings({ activeDecks: ['owner/deck'] });
        const optimistic = JSON.parse(storage.getItem('flashcards_habit'));
        expect(optimistic.settings.activeDecks).toEqual(['owner/deck']);
        expect(optimistic.pendingSettings.partial.activeDecks).toEqual(['owner/deck']);

        await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'));
        resolveFetch({
            ok: true,
            json: () => Promise.resolve({ settings: optimistic.settings })
        });
        await saving;

        expect(JSON.parse(storage.getItem('flashcards_habit')).pendingSettings).toBeNull();
    });

    it('uses pending local scope immediately on refresh and retries persistence', async () => {
        storage.setItem('flashcards_habit', JSON.stringify({
            settings: { activeDecks: ['owner/deck'], newPerDay: 10, dailyGoal: 10 },
            days: {},
            pendingSettings: {
                version: 'pending-version',
                partial: { activeDecks: ['owner/deck'] }
            }
        }));
        let resolveFetch;
        vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveFetch = resolve; })));

        const settings = await getSettings();

        expect(settings.activeDecks).toEqual(['owner/deck']);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings'), expect.objectContaining({
            method: 'POST',
            keepalive: true
        }));

        resolveFetch({ ok: true, json: () => Promise.resolve({ settings }) });
        await vi.waitFor(() => {
            expect(JSON.parse(storage.getItem('flashcards_habit')).pendingSettings).toBeNull();
        });
    });
});

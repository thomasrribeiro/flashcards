import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getStudySession,
    normalizePersistedStudySession,
    saveStudySession,
    studySessionMatchesActiveScope
} from './session-client.js';
import { setCurrentUser } from './storage.js';

afterEach(() => {
    setCurrentUser(null);
    vi.unstubAllGlobals();
});

describe('normalizePersistedStudySession', () => {
    it('derives progress from completed and remaining cards', () => {
        expect(normalizePersistedStudySession({
            mode: 'due',
            completedCards: 4,
            queue: [
                { cardHash: 'a', repo: 'owner/deck', filepath: 'a.md' },
                { cardHash: 'b', repo: 'owner/deck', filepath: 'b.md' }
            ]
        })).toMatchObject({ completedCards: 4, totalCards: 6 });
    });

    it('rejects a session with no restorable cards', () => {
        expect(normalizePersistedStudySession({ mode: 'new', queue: [] })).toBeNull();
    });

    it('persists the exact starred scope with the resumable queue', () => {
        expect(normalizePersistedStudySession({
            mode: 'new',
            activeDecks: ['owner/deck\0flashcards/01.md', 'owner/deck\0flashcards/01.md'],
            queue: [{ cardHash: 'a', repo: 'owner/deck', filepath: 'flashcards/01.md' }]
        })).toMatchObject({ activeDecks: ['owner/deck\0flashcards/01.md'] });
    });

    it('matches scope independent of ordering and rejects changed or legacy scope', () => {
        const session = { activeDecks: ['deck-b', 'deck-a'] };
        expect(studySessionMatchesActiveScope(session, ['deck-a', 'deck-b'])).toBe(true);
        expect(studySessionMatchesActiveScope(session, ['deck-a'])).toBe(false);
        expect(studySessionMatchesActiveScope({ mode: 'new' }, ['deck-a'])).toBe(false);
    });

    it('reads signed-in sessions from D1 and clears stale local snapshots', async () => {
        const values = new Map([
            ['flashcards_study_session', JSON.stringify({
                mode: 'new',
                queue: [{ cardHash: 'stale', repo: 'owner/stale', filepath: '01.md' }]
            })]
        ]);
        vi.stubGlobal('localStorage', {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
            removeItem: key => values.delete(key)
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                session: {
                    mode: 'new',
                    queue: [{ cardHash: 'server', repo: 'owner/current', filepath: '01.md' }]
                }
            })
        }));
        setCurrentUser({ id: 'user-1' });

        await expect(getStudySession()).resolves.toMatchObject({
            queue: [{ cardHash: 'server', repo: 'owner/current', filepath: '01.md' }]
        });
        expect(values.has('flashcards_study_session')).toBe(false);
    });

    it('writes signed-in sessions only to D1', async () => {
        const values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
            removeItem: key => values.delete(key)
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
        setCurrentUser({ id: 'user-1' });

        await saveStudySession({
            mode: 'due',
            queue: [{ cardHash: 'server', repo: 'owner/current', filepath: '01.md' }]
        });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/study-session'),
            expect.objectContaining({ method: 'POST' })
        );
        expect(values.size).toBe(0);
    });
});

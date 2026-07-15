import { describe, expect, it } from 'vitest';
import { normalizePersistedStudySession, studySessionMatchesActiveScope } from './session-client.js';

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
});

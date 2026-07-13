import { describe, expect, it } from 'vitest';
import { normalizePersistedStudySession } from './session-client.js';

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
});

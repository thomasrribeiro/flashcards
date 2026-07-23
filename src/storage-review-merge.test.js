import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    chapterProgressForCard,
    clearLocalStorage,
    enrichReviewSources,
    getAllCards,
    getAllReviews,
    invalidateRepositoryFiles,
    mergeReviewSnapshots,
    saveCards,
    saveReview,
    setCurrentUser
} from './storage.js';

afterEach(async () => {
    await clearLocalStorage();
    vi.unstubAllGlobals();
});

describe('mergeReviewSnapshots', () => {
    it('keeps a newer locally graded review over stale server state', () => {
        const remote = [{
            cardHash: 'card-a',
            fsrsCard: { due: '2026-07-20T00:00:00Z' },
            lastReviewed: '2026-07-17T10:00:00Z',
            repo: 'owner/deck'
        }];
        const local = [{
            cardHash: 'card-a',
            fsrsCard: { due: '2026-08-01T00:00:00Z' },
            lastReviewed: '2026-07-18T10:00:00Z',
            filepath: 'flashcards/01.md'
        }];

        expect(mergeReviewSnapshots(remote, local)).toEqual([{
            ...local[0],
            repo: 'owner/deck',
            cardLabel: null,
            lastRating: null
        }]);
    });

    it('retains reviews present in only one snapshot', () => {
        expect(mergeReviewSnapshots(
            [{ cardHash: 'remote', lastReviewed: '2026-07-17T10:00:00Z' }],
            [{ cardHash: 'local', lastReviewed: '2026-07-18T10:00:00Z' }]
        ).map(review => review.cardHash)).toEqual(['remote', 'local']);
    });
});

describe('enrichReviewSources', () => {
    it('repairs legacy hash-only reviews when their card body loads', () => {
        expect(enrichReviewSources(
            [{ cardHash: 'card-a', fsrsCard: { due: '2026-08-01T00:00:00Z' } }],
            [{
                hash: 'card-a',
                source: { repo: 'owner/deck', file: 'flashcards/01.md' },
                content: { question: 'What is one?' },
                type: 'basic'
            }]
        )).toEqual({
            changed: true,
            reviews: [{
                cardHash: 'card-a',
                fsrsCard: { due: '2026-08-01T00:00:00Z' },
                repo: 'owner/deck',
                filepath: 'flashcards/01.md',
                cardLabel: 'What is one?'
            }]
        });
    });
});

describe('chapterProgressForCard', () => {
    it('counts reviewed cards in the current source revision', () => {
        const cards = [
            {
                hash: 'card-a',
                source: { repo: 'owner/deck', file: 'flashcards/01.md', sha: 'abc123' }
            },
            {
                hash: 'card-b',
                source: { repo: 'owner/deck', file: 'flashcards/01.md', sha: 'abc123' }
            },
            {
                hash: 'card-c',
                source: { repo: 'owner/deck', file: 'flashcards/02.md', sha: 'def456' }
            }
        ];

        expect(chapterProgressForCard(
            cards,
            [{ cardHash: 'card-a' }, { cardHash: 'card-c' }],
            cards[0]
        )).toEqual({
            repo: 'owner/deck',
            filepath: 'flashcards/01.md',
            sourceSha: 'abc123',
            totalCards: 2,
            reviewedCards: 1
        });
    });
});

describe('invalidateRepositoryFiles', () => {
    it('drops stale card bodies without deleting their review history', async () => {
        const values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
            removeItem: key => values.delete(key)
        });
        setCurrentUser(null);
        await saveCards([
            {
                hash: 'card-a',
                type: 'basic',
                content: { question: 'Old question' },
                deckName: 'owner/deck',
                source: { repo: 'owner/deck', file: 'flashcards/01.md', sha: 'old-sha' }
            },
            {
                hash: 'card-b',
                type: 'basic',
                content: { question: 'Unchanged question' },
                deckName: 'owner/deck',
                source: { repo: 'owner/deck', file: 'flashcards/02.md', sha: 'same-sha' }
            }
        ]);
        await saveReview('card-a', { due: '2026-08-01T00:00:00Z' });

        expect(invalidateRepositoryFiles('owner/deck', ['flashcards/01.md'])).toBe(1);
        expect((await getAllCards()).map(card => card.hash)).toEqual(['card-b']);
        expect((await getAllReviews()).map(review => review.cardHash)).toEqual(['card-a']);
    });
});

import { describe, expect, it } from 'vitest';
import { enrichReviewSources, mergeReviewSnapshots } from './storage.js';

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

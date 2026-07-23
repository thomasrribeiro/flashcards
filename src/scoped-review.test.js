import { describe, expect, it } from 'vitest';
import { buildChapterContinuation, partitionScopedReviewCards } from './scoped-review.js';

describe('partitionScopedReviewCards', () => {
    const now = new Date('2026-07-20T12:00:00Z');
    const cards = [{ hash: 'due' }, { hash: 'new' }, { hash: 'future' }];
    const reviews = [
        { cardHash: 'due', fsrsCard: { due: '2026-07-19T12:00:00Z' } },
        { cardHash: 'future', fsrsCard: { due: '2026-07-25T12:00:00Z' } }
    ];

    it('keeps ordinary scheduled review limited to due and unseen cards', () => {
        const result = partitionScopedReviewCards(cards, reviews, { now });
        expect(result.due.map(entry => entry.cardHash)).toEqual(['due']);
        expect(result.fresh.map(entry => entry.cardHash)).toEqual(['new']);
        expect(result.scheduled).toEqual([]);
    });

    it('includes every card for an explicit chapter drill', () => {
        const result = partitionScopedReviewCards(cards, reviews, {
            includeScheduled: true,
            now
        });
        expect([
            ...result.due,
            ...result.fresh,
            ...result.scheduled
        ].map(entry => entry.cardHash)).toEqual(['due', 'new', 'future']);
    });
});

describe('buildChapterContinuation', () => {
    it('resumes at the first unseen card and keeps reviewed cards out of the chapter queue', () => {
        const cards = Array.from({ length: 19 }, (_, index) => ({
            hash: `card-${index + 1}`
        }));
        const reviews = [{
            cardHash: 'card-1',
            fsrsCard: { due: new Date('2026-07-22T23:50:00Z') }
        }];

        const continuation = buildChapterContinuation(cards, reviews);

        expect(continuation.totalCards).toBe(19);
        expect(continuation.introducedCards).toBe(1);
        expect(continuation.queue).toHaveLength(18);
        expect(continuation.queue[0].cardHash).toBe('card-2');
        expect(continuation.queue.some(entry => entry.cardHash === 'card-1')).toBe(false);
    });

    it('does not re-queue an introduced card even when it is already due', () => {
        const cards = [{ hash: 'reviewed' }, { hash: 'unseen' }];
        const reviews = [{
            cardHash: 'reviewed',
            fsrsCard: { due: new Date('2020-01-01T00:00:00Z') }
        }];

        expect(buildChapterContinuation(cards, reviews)).toMatchObject({
            introducedCards: 1,
            totalCards: 2,
            queue: [{ cardHash: 'unseen' }]
        });
    });
});

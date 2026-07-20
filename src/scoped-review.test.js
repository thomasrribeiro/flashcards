import { describe, expect, it } from 'vitest';
import { partitionScopedReviewCards } from './scoped-review.js';

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

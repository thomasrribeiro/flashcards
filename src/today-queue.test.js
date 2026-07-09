import { describe, it, expect } from 'vitest';
import { buildTodayQueue, todayQueueCounts, getLocalDate } from './today-queue.js';

const now = new Date('2026-07-08T12:00:00Z');
const past = new Date('2026-07-01T12:00:00Z');
const future = new Date('2026-08-01T12:00:00Z');

function card(hash, deck, order = null, file = '') {
    return { hash, deckName: deck, source: { repo: deck, file }, deckMetadata: { order } };
}

describe('buildTodayQueue', () => {
    it('returns empty when no decks are active', () => {
        const cards = [card('a', 'deck1')];
        expect(buildTodayQueue({ cards, reviews: [], activeDeckIds: [], now })).toEqual([]);
    });

    it('includes new (never-reviewed) cards from active decks only', () => {
        const cards = [card('a', 'deck1'), card('b', 'deck2')];
        const q = buildTodayQueue({ cards, reviews: [], activeDeckIds: ['deck1'], newPerDay: 10, now });
        expect(q.map(c => c.cardHash)).toEqual(['a']);
        expect(q[0].fsrsCard).toBeNull();
    });

    it('includes reviewed cards that are due, excludes those not yet due', () => {
        const cards = [card('due', 'deck1'), card('notdue', 'deck1')];
        const reviews = [
            { cardHash: 'due', fsrsCard: { due: past.toISOString() } },
            { cardHash: 'notdue', fsrsCard: { due: future.toISOString() } }
        ];
        const q = buildTodayQueue({ cards, reviews, activeDeckIds: ['deck1'], newPerDay: 0, now });
        expect(q.map(c => c.cardHash)).toEqual(['due']);
        expect(q[0].fsrsCard).not.toBeNull();
    });

    it('caps new cards by newPerDay minus already-introduced', () => {
        const cards = ['a', 'b', 'c', 'd', 'e'].map((h, i) => card(h, 'deck1', i));
        const q = buildTodayQueue({ cards, reviews: [], activeDeckIds: ['deck1'], newPerDay: 10, newIntroducedToday: 8, now });
        expect(q).toHaveLength(2); // 10 - 8
    });

    it('introduces zero new cards when the daily budget is already spent', () => {
        const cards = [card('a', 'deck1', 0)];
        const q = buildTodayQueue({ cards, reviews: [], activeDeckIds: ['deck1'], newPerDay: 10, newIntroducedToday: 10, now });
        expect(q).toHaveLength(0);
    });

    it('orders due before new, due oldest-first, new by frontmatter order', () => {
        const cards = [
            card('new2', 'deck1', 2),
            card('new1', 'deck1', 1),
            card('dueRecent', 'deck1'),
            card('dueOld', 'deck1')
        ];
        const reviews = [
            { cardHash: 'dueRecent', fsrsCard: { due: '2026-07-05T00:00:00Z' } },
            { cardHash: 'dueOld', fsrsCard: { due: '2026-07-01T00:00:00Z' } }
        ];
        const q = buildTodayQueue({ cards, reviews, activeDeckIds: ['deck1'], newPerDay: 10, now });
        expect(q.map(c => c.cardHash)).toEqual(['dueOld', 'dueRecent', 'new1', 'new2']);
    });

    it('accepts Date objects for due as well as ISO strings', () => {
        const cards = [card('a', 'deck1')];
        const reviews = [{ cardHash: 'a', fsrsCard: { due: past } }];
        const q = buildTodayQueue({ cards, reviews, activeDeckIds: ['deck1'], newPerDay: 0, now });
        expect(q).toHaveLength(1);
    });
});

describe('todayQueueCounts', () => {
    it('splits due and fresh counts', () => {
        const cards = [card('due', 'deck1'), card('new', 'deck1', 0)];
        const reviews = [{ cardHash: 'due', fsrsCard: { due: past.toISOString() } }];
        const counts = todayQueueCounts({ cards, reviews, activeDeckIds: ['deck1'], newPerDay: 10, now });
        expect(counts).toEqual({ due: 1, fresh: 1, total: 2 });
    });
});

describe('getLocalDate', () => {
    it('formats YYYY-MM-DD from local components', () => {
        const d = new Date(2026, 0, 5); // Jan 5 local
        expect(getLocalDate(d)).toBe('2026-01-05');
    });
});

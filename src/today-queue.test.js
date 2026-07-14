import { describe, it, expect } from 'vitest';
import { buildTodayQueue, freshCardAvailability, newCardSessionLimit, newLearningPlan, todayQueueCounts, getLocalDate, SCOPE_SEP } from './today-queue.js';

const now = new Date('2026-07-08T12:00:00Z');
const past = new Date('2026-07-01T12:00:00Z');
const future = new Date('2026-08-01T12:00:00Z');

function card(hash, deck, order = null, file = '') {
    return { hash, deckName: deck, source: { repo: deck, file }, deckMetadata: { order } };
}

describe('buildTodayQueue', () => {
    it('returns empty with no active scope and no learned cards due', () => {
        const cards = [card('a', 'deck1')];
        expect(buildTodayQueue({ cards, reviews: [], activeDeckIds: [], now })).toEqual([]);
    });

    it('includes due learned cards even when their deck is not active', () => {
        const cards = [card('due', 'deck1'), card('new', 'deck1')];
        const reviews = [{ cardHash: 'due', fsrsCard: { due: past.toISOString() } }];
        const q = buildTodayQueue({ cards, reviews, activeDeckIds: [], newPerDay: 10, now });
        expect(q.map(c => c.cardHash)).toEqual(['due']);
    });

    it('includes new (never-reviewed) cards from active decks only', () => {
        const cards = [card('a', 'deck1'), card('b', 'deck2')];
        const q = buildTodayQueue({ cards, reviews: [], activeDeckIds: ['deck1'], newPerDay: 10, now });
        expect(q.map(c => c.cardHash)).toEqual(['a']);
        expect(q[0].fsrsCard).toBeNull();
    });

    it('includes due reviewed cards globally and excludes those not yet due', () => {
        const cards = [card('due', 'deck2'), card('notdue', 'deck2')];
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

    it('keeps a large daily target in finite session batches', () => {
        const cards = Array.from({ length: 30 }, (_, i) => card(`c${i}`, 'deck1', i));
        const q = buildTodayQueue({
            cards,
            reviews: [],
            activeDeckIds: ['deck1'],
            newPerDay: 20,
            newBatchSize: 10,
            now
        });
        expect(q).toHaveLength(10);
    });

    it('allows another finite batch after the target on explicit request', () => {
        const cards = Array.from({ length: 20 }, (_, i) => card(`c${i}`, 'deck1', i));
        const q = buildTodayQueue({
            cards,
            reviews: [],
            activeDeckIds: ['deck1'],
            newPerDay: 10,
            newBatchSize: 5,
            newIntroducedToday: 10,
            allowBeyondTarget: true,
            now
        });
        expect(q).toHaveLength(5);
    });

    it('treats unlimited as unlimited per day but still batches each session', () => {
        expect(newCardSessionLimit({
            newPerDay: -1,
            newBatchSize: 20,
            newIntroducedToday: 200
        })).toBe(20);
    });

    it('describes a reached soft target without eliminating the next batch', () => {
        expect(newLearningPlan({
            newPerDay: 10,
            newBatchSize: 5,
            newIntroducedToday: 12
        })).toMatchObject({
            dailyTarget: 10,
            batchSize: 5,
            targetReached: true,
            nextBatch: 5
        });
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

    it('puts globally due cards before new cards from the active scope', () => {
        const cards = [card('new', 'active', 1), card('due', 'inactive')];
        const reviews = [{ cardHash: 'due', fsrsCard: { due: past.toISOString() } }];
        const q = buildTodayQueue({ cards, reviews, activeDeckIds: ['active'], newPerDay: 10, now });
        expect(q.map(c => c.cardHash)).toEqual(['due', 'new']);
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

describe('freshCardAvailability', () => {
    const deck = { id: 'owner/mechanics', files: [{ path: 'flashcards/01.md' }, { path: 'flashcards/02.md' }] };

    it('reports an exhausted starred chapter once that file is loaded', () => {
        const cards = [card('a', deck.id, null, 'flashcards/01.md')];
        expect(freshCardAvailability({
            cards,
            reviews: [{ cardHash: 'a' }],
            activeDeckIds: [`${deck.id}${SCOPE_SEP}flashcards/01.md`],
            decks: [deck]
        })).toEqual({ freshCount: 0, fullyKnown: true });
    });

    it('does not declare a whole deck complete while a file is metadata-only', () => {
        const cards = [card('a', deck.id, null, 'flashcards/01.md')];
        expect(freshCardAvailability({
            cards,
            reviews: [{ cardHash: 'a' }],
            activeDeckIds: [deck.id],
            decks: [deck]
        })).toEqual({ freshCount: 0, fullyKnown: false });
    });

    it('counts exact unseen cards after every active file is loaded', () => {
        const cards = [
            card('a', deck.id, null, 'flashcards/01.md'),
            card('b', deck.id, null, 'flashcards/02.md'),
            card('c', deck.id, null, 'flashcards/02.md')
        ];
        expect(freshCardAvailability({
            cards,
            reviews: [{ cardHash: 'a' }],
            activeDeckIds: [deck.id],
            decks: [deck]
        })).toEqual({ freshCount: 2, fullyKnown: true });
    });
});

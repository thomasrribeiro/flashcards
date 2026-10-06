import { describe, it, expect } from 'vitest';
import {
    buildTodayQueue,
    cardChapterScope,
    focusedNewCards,
    freshCardAvailability,
    getLocalDate,
    interleaveDueCards,
    newCardSessionLimit,
    newLearningPlan,
    SCOPE_SEP,
    todayQueueCounts
} from './today-queue.js';

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

    it('keeps the configured session size independent from remaining daily target', () => {
        const cards = Array.from({ length: 15 }, (_, i) => card(`c${i}`, 'deck1', i));
        const q = buildTodayQueue({ cards, reviews: [], activeDeckIds: ['deck1'], newPerDay: 10, newBatchSize: 10, newIntroducedToday: 8, now });
        expect(q).toHaveLength(10);
    });

    it('treats a reached daily target as a soft goal rather than a prohibition', () => {
        const cards = Array.from({ length: 10 }, (_, i) => card(`c${i}`, 'deck1', i));
        const q = buildTodayQueue({ cards, reviews: [], activeDeckIds: ['deck1'], newPerDay: 10, newBatchSize: 10, newIntroducedToday: 10, now });
        expect(q).toHaveLength(10);
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

    it('keeps each new-card session focused on one chapter', () => {
        const cards = [
            ...Array.from({ length: 10 }, (_, i) => card(`a${i}`, 'deck1', 1, 'flashcards/01.md')),
            ...Array.from({ length: 10 }, (_, i) => card(`b${i}`, 'deck1', 1, 'flashcards/02.md'))
        ];
        const q = buildTodayQueue({
            cards,
            reviews: [],
            activeDeckIds: ['deck1'],
            newBatchSize: 10,
            now
        });
        expect(new Set(q.map(entry => cardChapterScope(entry.card)))).toEqual(
            new Set([`deck1${SCOPE_SEP}flashcards/01.md`])
        );
    });

    it('rotates the focused chapter between new-card sessions', () => {
        const cards = [
            ...Array.from({ length: 10 }, (_, i) => card(`a${i}`, 'deck1', 1, 'flashcards/01.md')),
            ...Array.from({ length: 10 }, (_, i) => card(`b${i}`, 'deck1', 1, 'flashcards/02.md'))
        ];
        const q = buildTodayQueue({
            cards,
            reviews: [],
            activeDeckIds: ['deck1'],
            newBatchSize: 10,
            lastNewChapterScope: `deck1${SCOPE_SEP}flashcards/01.md`,
            now
        });
        expect(q.map(entry => entry.cardHash)).toEqual(
            Array.from({ length: 10 }, (_, i) => `b${i}`)
        );
    });

    it('holds a dependent chapter until its starred prerequisite is introduced', () => {
        const prerequisite = card('a', 'deck1', 1, 'flashcards/01_foundations.md');
        const dependent = card('b', 'deck1', 1, 'flashcards/02_applications.md');
        dependent.chapterMetadata = { prerequisites: ['chapter:01_foundations'] };
        const lastChapter = `deck1${SCOPE_SEP}flashcards/01_foundations.md`;

        const blocked = buildTodayQueue({
            cards: [prerequisite, dependent],
            reviews: [],
            activeDeckIds: ['deck1'],
            lastNewChapterScope: lastChapter,
            now
        });
        expect(blocked.map(entry => entry.cardHash)).toEqual(['a']);

        const available = buildTodayQueue({
            cards: [prerequisite, dependent],
            reviews: [{
                cardHash: 'a',
                fsrsCard: { due: future.toISOString() }
            }],
            activeDeckIds: ['deck1'],
            lastNewChapterScope: lastChapter,
            now
        });
        expect(available.map(entry => entry.cardHash)).toEqual(['b']);
    });

    it('ends a focused session instead of filling it from another chapter', () => {
        const fresh = [
            ...Array.from({ length: 3 }, (_, i) => ({
                card: card(`a${i}`, 'deck1', 1, 'flashcards/01.md'),
                cardHash: `a${i}`,
                fsrsCard: null
            })),
            ...Array.from({ length: 10 }, (_, i) => ({
                card: card(`b${i}`, 'deck1', 1, 'flashcards/02.md'),
                cardHash: `b${i}`,
                fsrsCard: null
            }))
        ];
        expect(focusedNewCards(fresh, 10).map(entry => entry.cardHash)).toEqual(['a0', 'a1', 'a2']);
    });

    it('interleaves due chapters in two-card blocks while starting with the oldest', () => {
        const due = [
            ['a1', 'flashcards/01.md', '2026-07-01T00:00:00Z'],
            ['a2', 'flashcards/01.md', '2026-07-02T00:00:00Z'],
            ['a3', 'flashcards/01.md', '2026-07-03T00:00:00Z'],
            ['b1', 'flashcards/02.md', '2026-07-01T12:00:00Z'],
            ['b2', 'flashcards/02.md', '2026-07-02T12:00:00Z'],
            ['b3', 'flashcards/02.md', '2026-07-03T12:00:00Z']
        ].map(([hash, file, dueDate]) => ({
            card: card(hash, 'deck1', 1, file),
            cardHash: hash,
            dueDate
        }));

        expect(interleaveDueCards(due).map(entry => entry.cardHash))
            .toEqual(['a1', 'a2', 'b1', 'b2', 'a3', 'b3']);
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

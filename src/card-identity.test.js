import { describe, expect, it } from 'vitest';
import { parseDeck } from './parser.js';
import { hashCard, identifyCard } from './hasher.js';
import { serializeFile, updateCard } from './card-serializer.js';
import { migrateLegacyReviews, rewriteStudySessionHashes } from './review-identity.js';
import { annotateCardIds } from './card-id-annotator.js';

describe('stable card identity', () => {
    it('keeps identity annotations outside the card content', () => {
        const alias = 'a'.repeat(64);
        const { cards } = parseDeck(`
<!-- card-id: mechanics-force-001 -->
<!-- card-alias: ${alias} -->
Q: What is force?
A: A push or pull.
`, 'mechanics.md');

        expect(cards).toHaveLength(1);
        expect(cards[0].stableId).toBe('mechanics-force-001');
        expect(cards[0].legacyHashes).toEqual([alias]);
        expect(cards[0].content.answer).toBe('A push or pull.');
    });

    it('assigns one stable identity and alias per cloze deletion', () => {
        const aliases = ['a'.repeat(64), 'b'.repeat(64)];
        const { cards } = parseDeck(`
<!-- card-id: mechanics-vector-components -->
<!-- card-alias: ${aliases[0]} -->
<!-- card-alias: ${aliases[1]} -->
C: A vector has [magnitude] and [direction].
`, 'mechanics.md');

        expect(cards.map(card => card.stableId)).toEqual([
            'mechanics-vector-components::1',
            'mechanics-vector-components::2'
        ]);
        expect(cards.map(card => card.legacyHashes)).toEqual([[aliases[0]], [aliases[1]]]);
    });

    it('preserves a stable hash while a figure changes the content hash', () => {
        const first = parseDeck(`
<!-- card-id: mechanics-free-body-001 -->
Q: Which forces act on the block?
A: Weight and the normal force.
`, 'mechanics.md').cards[0];
        const second = parseDeck(`
<!-- card-id: mechanics-free-body-001 -->
Q: Which forces act on the block?
A: Weight and the normal force.

![Free-body diagram](../figures/block.png)
`, 'mechanics.md').cards[0];

        const a = identifyCard(first, 'owner/mechanics');
        const b = identifyCard(second, 'owner/mechanics');
        expect(a.hash).toBe(b.hash);
        expect(a.contentHash).not.toBe(b.contentHash);
    });

    it('serializes and retains stable identity when editing a card', () => {
        const original = parseDeck(`Q: What is inertia?\nA: Resistance to a change in motion.\n`, 'mechanics.md').cards[0];
        const legacyHash = hashCard(original);
        const identified = {
            ...original,
            stableId: 'mechanics-inertia-001',
            stableIdBase: 'mechanics-inertia-001',
            legacyHashes: [legacyHash]
        };
        const file = serializeFile([identified]);
        const updated = updateCard(file, 0, {
            type: 'basic',
            content: {
                question: original.content.question,
                answer: `${original.content.answer}\n\n![Inertia diagram](../figures/inertia.png)`
            }
        });
        const reparsed = parseDeck(updated, 'mechanics.md').cards[0];

        expect(reparsed.stableId).toBe('mechanics-inertia-001');
        expect(reparsed.legacyHashes).toEqual([legacyHash]);
        expect(updated).toContain('<!-- card-id: mechanics-inertia-001 -->');
        expect(updated).toContain(`<!-- card-alias: ${legacyHash} -->`);
    });
});

describe('review identity migration', () => {
    it('moves FSRS state and paused-session hashes without recording a new review', () => {
        const legacyHash = 'a'.repeat(64);
        const stableHash = 'b'.repeat(64);
        const card = {
            hash: stableHash,
            stableId: 'mechanics-force-001',
            legacyHashes: [legacyHash],
            type: 'basic',
            deckName: 'owner/mechanics',
            source: { repo: 'owner/mechanics', file: 'flashcards/01.md' }
        };
        const fsrsCard = { due: '2026-08-01T00:00:00.000Z', state: 2, stability: 12 };
        const result = migrateLegacyReviews([card], [{
            cardHash: legacyHash,
            fsrsCard,
            lastReviewed: '2026-07-13T12:00:00.000Z',
            repo: 'owner/mechanics',
            filepath: 'flashcards/01.md'
        }]);

        expect(result.reviews).toEqual([expect.objectContaining({
            cardHash: stableHash,
            fsrsCard,
            lastReviewed: '2026-07-13T12:00:00.000Z'
        })]);
        expect(result.migrations).toEqual([expect.objectContaining({
            fromCardHashes: [legacyHash],
            toCardHash: stableHash
        })]);

        const session = rewriteStudySessionHashes({
            mode: 'new',
            queue: [{ cardHash: legacyHash, repo: 'owner/mechanics', filepath: 'flashcards/01.md' }]
        }, result.hashMapping);
        expect(session.queue[0].cardHash).toBe(stableHash);
    });

    it('keeps the newest state when old and stable identities both exist', () => {
        const legacyHash = 'a'.repeat(64);
        const stableHash = 'b'.repeat(64);
        const card = { hash: stableHash, stableId: 'card-001', legacyHashes: [legacyHash], type: 'basic' };
        const result = migrateLegacyReviews([card], [
            { cardHash: stableHash, fsrsCard: { stability: 2 }, lastReviewed: '2026-07-01T00:00:00Z' },
            { cardHash: legacyHash, fsrsCard: { stability: 9 }, lastReviewed: '2026-07-12T00:00:00Z' }
        ]);
        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0].cardHash).toBe(stableHash);
        expect(result.reviews[0].fsrsCard.stability).toBe(9);
    });
});

describe('card ID annotation', () => {
    it('inserts IDs and aliases without rewriting card content and is idempotent', () => {
        const source = `+++\norder = 1\n+++\n\n# Chapter\n\nQ: First?\nA: First answer.\n\nC: A [vector] has direction.\n`;
        let index = 0;
        const first = annotateCardIds(source, '01.md', () => `card-test-00${++index}`);
        expect(first.addedBlocks).toBe(2);
        expect(first.addedCards).toBe(2);
        expect(first.markdown).toContain('# Chapter');
        expect(first.markdown).toContain('Q: First?\nA: First answer.');
        expect(first.markdown.match(/<!-- card-alias: [a-f0-9]{64} -->/g)).toHaveLength(2);

        const second = annotateCardIds(first.markdown, '01.md', () => 'card-should-not-be-used');
        expect(second.addedBlocks).toBe(0);
        expect(second.markdown).toBe(first.markdown);
    });
});

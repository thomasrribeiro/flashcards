import { describe, expect, it } from 'vitest';
import { parseDeck } from './parser.js';
import { identifyCard } from './hasher.js';

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

});

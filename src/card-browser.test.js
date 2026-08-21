import { describe, expect, it } from 'vitest';
import { orderCardsForBrowsing } from './card-browser.js';
import { renderMath, resolveMarkdownImageSource } from './markdown.js';

describe('orderCardsForBrowsing', () => {
    it('uses source order and keeps cloze siblings in stable numeric order', () => {
        const cards = [
            { range: [20, 24], stableId: 'measurement::2' },
            { range: [8, 12], stableId: 'quantity' },
            { range: [20, 24], stableId: 'measurement::1' }
        ];

        expect(orderCardsForBrowsing(cards).map(card => card.stableId)).toEqual([
            'quantity',
            'measurement::1',
            'measurement::2'
        ]);
    });

    it('does not mutate the storage result', () => {
        const cards = [
            { range: [10, 12], stableId: 'later' },
            { range: [2, 4], stableId: 'earlier' }
        ];

        orderCardsForBrowsing(cards);
        expect(cards.map(card => card.stableId)).toEqual(['later', 'earlier']);
    });

    it('renders the TeX delimiters used by browsed chapter cards', () => {
        const html = renderMath(String.raw`Write \(\vec A\) in component form.
\[\vec A=A_x\hat{\mathbf i}+A_y\hat{\mathbf j}.\]`);

        expect(html).toContain('class="katex"');
        expect(html).not.toContain('\\(\\vec A\\)');
        expect(html).not.toContain('\\[');
    });

    it('pins preview figures to the reviewed pull-request commit', () => {
        const source = resolveMarkdownImageSource('../figures/01_foundations/shape.svg', {
            deckName: 'example/geometry',
            source: {
                file: 'flashcards/01_foundations.md',
                ref: 'abc123'
            }
        });

        expect(source).toBe('https://raw.githubusercontent.com/example/geometry/abc123/figures/01_foundations/shape.svg');
    });
});

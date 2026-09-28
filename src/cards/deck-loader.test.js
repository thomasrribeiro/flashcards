import { expect, it } from 'vitest';
import { loadExamples } from './deck-loader.js';

const markdown = '<!-- card-id: test-001 -->\nQ: Question?\nA: Answer.';

it('loads available decks while reporting a failed file', async () => {
    const fetcher = async url => url.endsWith('index.json')
        ? { ok: true, json: async () => ({ repos: [{ name: 'example', files: ['a.md', 'b.md'] }] }) }
        : { ok: url.endsWith('a.md'), text: async () => markdown };
    const result = await loadExamples(fetcher, '/');
    expect(result.decks).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
});

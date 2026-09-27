import { describe, expect, it } from 'vitest';
import { createLocalStore, readDeck, loadExamples, STORAGE_KEY } from './local-store.js';
function memory() {
    const values = new Map([['github_user', '{"id":"existing"}']]);
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const markdown = '<!-- card-id: test-001 -->\nQ: Question?\nA: Answer.';
describe('standalone persistence boundary', () => {
    it('persists grades without touching prior account state', () => {
        const storage = memory(), store = createLocalStore(storage);
        const deck = readDeck(markdown, 'chapter.md', 'example');
        expect(store.queue(deck.cards, 'new')).toHaveLength(1);
        store.grade(deck.cards[0], 3);
        expect(createLocalStore(storage).queue(deck.cards, 'new')).toEqual([]);
        expect(storage.getItem('github_user')).toBe('{"id":"existing"}');
    });
    it('keeps the same identity when wording changes', () => {
        const a = readDeck(markdown, 'chapter.md', 'example');
        const b = readDeck(markdown.replace('Answer.', 'Revised answer.'), 'chapter.md', 'example');
        expect(a.cards[0].hash).toBe(b.cards[0].hash);
    });
    it('does not advance memory when a storage write fails', () => {
        const store = createLocalStore({ getItem: () => null, setItem: () => { throw new Error('Quota'); } });
        const card = readDeck(markdown, 'chapter.md', 'example').cards[0];
        expect(() => store.grade(card, 3)).toThrow('Quota');
        expect(store.state.reviews).toEqual({});
    });
    it('counts introductions across sessions toward the daily limit', () => {
        const store = createLocalStore(memory(), () => new Date('2026-09-27T12:00:00'));
        store.setTarget(1);
        const cards = readDeck(`${markdown}\n\n<!-- card-id: test-002 -->\nQ: Other?\nA: Other.`, 'chapter.md', 'example').cards;
        store.grade(cards[0], 3);
        expect(store.queue(cards, 'new')).toHaveLength(0);
    });
    it('reports corrupted state without overwriting it', () => {
        const storage = memory(); storage.setItem(STORAGE_KEY, 'broken');
        expect(() => createLocalStore(storage)).toThrow();
        expect(storage.getItem(STORAGE_KEY)).toBe('broken');
    });
    it('loads available decks while reporting a failed file', async () => {
        const fetcher = async url => url.endsWith('index.json')
            ? { ok: true, json: async () => ({ repos: [{ name: 'example', files: ['a.md', 'b.md'] }] }) }
            : { ok: url.endsWith('a.md'), text: async () => markdown };
        const result = await loadExamples(fetcher, '/');
        expect(result.decks).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
    });
});

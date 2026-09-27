import { parseDeck } from './parser.js';
import { identifyCard } from './hasher.js';
import { createCard, isDue, rehydrateFsrsCard, reviewCard } from './fsrs-client.js';

// Deliberately isolated from the previous app's account and review storage.
export const STORAGE_KEY = 'flashcards.frontend.v1';
export function createLocalStore(storage, now = () => new Date()) {
    let state = { reviews: {}, stars: [], imports: [], dailyTarget: 10 };
    const saved = storage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.stars)
            || !Array.isArray(parsed.imports) || !parsed.reviews || typeof parsed.reviews !== 'object'
            || Array.isArray(parsed.reviews)) throw new Error('Local progress could not be read.');
        state = { ...state, ...parsed };
    }
    function update(patch) {
        const next = { ...state, ...patch };
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
        state = next;
    }
    return {
        get state() { return structuredClone(state); },
        toggleStar(id) {
            const stars = new Set(state.stars);
            stars.has(id) ? stars.delete(id) : stars.add(id);
            update({ stars: [...stars] });
        },
        setTarget(value) {
            if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('Choose a target from 1 to 100.');
            update({ dailyTarget: value });
        },
        importDecks(decks) {
            const imports = new Map(state.imports.map(deck => [deck.id, deck]));
            decks.forEach(deck => imports.set(deck.id, deck));
            update({ imports: [...imports.values()] });
        },
        queue(cards, mode = 'all') {
            const due = cards.filter(card => state.reviews[card.hash] && isDue(state.reviews[card.hash], now()));
            const fresh = cards.filter(card => !state.reviews[card.hash]);
            if (mode === 'due') return due;
            if (mode === 'new') {
                const today = now().toDateString();
                const introduced = Object.values(state.reviews).filter(review => new Date(review.introducedAt).toDateString() === today).length;
                return fresh.slice(0, Math.max(0, state.dailyTarget - introduced));
            }
            return [...due, ...fresh];
        },
        grade(card, rating) {
            if (![1, 2, 3, 4].includes(rating)) throw new Error('Choose a valid grade.');
            const previous = state.reviews[card.hash];
            const result = reviewCard(previous ? rehydrateFsrsCard(previous) : createCard(), rating, now());
            update({ reviews: { ...state.reviews, [card.hash]: {
                ...result.card, introducedAt: previous?.introducedAt || now().toISOString()
            } } });
        }
    };
}

export function readDeck(markdown, file, id, subject = 'Imported') {
    const { cards, metadata } = parseDeck(markdown, file);
    if (!cards.length) throw new Error(`${file}: no cards found.`);
    const name = metadata.name || file.split('/').pop().replace(/\.md$/i, '').replaceAll('-', ' ');
    const assetNamespace = id.startsWith('local/') ? id.split('/').slice(0, 2).join('/') : id;
    return {
        id, name, subject: metadata.subject || metadata.topic || subject,
        cards: cards.map(card => ({
            ...card, ...identifyCard(card, id), deckName: assetNamespace, source: { file }
        }))
    };
}

export async function loadExamples(fetcher = fetch, base = import.meta.env.BASE_URL) {
    const response = await fetcher(`${base}collection/index.json`);
    if (!response.ok) throw new Error('Example collection could not be loaded.');
    const index = await response.json();
    const results = await Promise.allSettled(index.repos.flatMap(repo => repo.files.map(async file => {
        const response = await fetcher(`${base}collection/${repo.name}/${file}`);
        if (!response.ok) throw new Error(`${file} could not be loaded.`);
        return readDeck(await response.text(), file, `local/${repo.name}/${file}`, 'Examples');
    })));
    return {
        decks: results.filter(result => result.status === 'fulfilled').map(result => result.value),
        errors: results.filter(result => result.status === 'rejected').map(result => result.reason.message)
    };
}

import { parseDeck } from './parser.js';
import { identifyCard } from './hasher.js';

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

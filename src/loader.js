/**
 * Card loader - loads cards from markdown files via the generated index
 */

import { parseDeck } from './parser.js';
import { processCards } from './hasher.js';
import { saveCards, initDB, getReview, saveReview } from './storage.js';
import { createCard } from './fsrs-client.js';

/**
 * Load card index from build output
 */
async function loadCardIndex() {
    try {
        // Add timestamp to prevent caching
        const response = await fetch(`/data/cards.json?t=${Date.now()}`);
        if (!response.ok) {
            throw new Error('Card index not found. Run npm run build first.');
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to load card index:', error);
        return { files: [] };
    }
}

/**
 * Load markdown file content
 */
async function loadMarkdownFile(relativePath) {
    // Add timestamp to prevent caching
    const response = await fetch(`/topics/${relativePath}?t=${Date.now()}`);
    if (!response.ok) {
        throw new Error(`Failed to load ${relativePath}`);
    }
    return await response.text();
}

/**
 * Load all cards from the index
 */
export async function loadAllCards() {
    await initDB();

    const index = await loadCardIndex();

    if (index.files.length === 0) {
        console.log('No cards to load');
        return [];
    }

    console.log(`Loading ${index.files.length} markdown files...`);

    const allCards = [];

    for (const file of index.files) {
        try {
            const content = await loadMarkdownFile(file.path);
            const cards = parseDeck(content, file.name);

            // Add file path to cards
            cards.forEach(card => {
                card.filePath = file.path;
            });

            allCards.push(...cards);
        } catch (error) {
            console.error(`Error parsing ${file.path}:`, error);
        }
    }

    // Process cards (add hashes, deduplicate)
    const processedCards = processCards(allCards);

    console.log(`Loaded ${processedCards.length} unique cards`);

    // Save to IndexedDB
    await saveCards(processedCards);

    // Initialize FSRS state for new cards
    await initializeNewCards(processedCards);

    return processedCards;
}

/**
 * Initialize FSRS state for cards that don't have review data yet
 */
async function initializeNewCards(cards) {
    for (const card of cards) {
        const existingReview = await getReview(card.hash);

        if (!existingReview) {
            // Create new FSRS card
            const fsrsCard = createCard();

            await saveReview(card.hash, fsrsCard);
        }
    }
}

/**
 * Reload cards (useful for updates)
 */
export async function reloadCards() {
    console.log('Reloading cards...');
    return await loadAllCards();
}

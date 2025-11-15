/**
 * Main entry point for topic listing page
 */

import { initDB, getAllCards, getAllReviews, getStats } from './storage.js';
import { loadAllCards } from './loader.js';

/**
 * Initialize the application
 */
async function init() {
    await initDB();

    // Check if we need to load cards
    const cards = await getAllCards();
    if (cards.length === 0) {
        // First time load
        const grid = document.getElementById('topics-grid');
        grid.innerHTML = '<div class="loading">Loading flashcards...</div>';

        try {
            await loadAllCards();
        } catch (error) {
            console.error('Error loading cards:', error);
        }
    }

    await loadTopics();
}

/**
 * Load and display topics
 */
async function loadTopics() {
    const grid = document.getElementById('topics-grid');

    try {
        // Get all cards and group by deck
        const allCards = await getAllCards();
        const allReviews = await getAllReviews();

        // Group cards by deck name
        const deckMap = new Map();

        allCards.forEach(card => {
            if (!deckMap.has(card.deckName)) {
                deckMap.set(card.deckName, {
                    name: card.deckName,
                    cards: [],
                    reviews: new Map()
                });
            }
            deckMap.get(card.deckName).cards.push(card);
        });

        // Add review data
        allReviews.forEach(review => {
            const card = allCards.find(c => c.hash === review.cardHash);
            if (card && deckMap.has(card.deckName)) {
                deckMap.get(card.deckName).reviews.set(review.cardHash, review);
            }
        });

        // Clear loading message
        grid.innerHTML = '';

        // Create cards for each topic
        if (deckMap.size === 0) {
            grid.innerHTML = `
                <div class="loading">
                    No topics loaded yet. Add flashcard files to the topics/ directory and run the build script.
                </div>
            `;
            return;
        }

        deckMap.forEach((deck, deckName) => {
            const card = createTopicCard(deck);
            grid.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading topics:', error);
        grid.innerHTML = `
            <div class="loading">
                Error loading topics. Please check the console for details.
            </div>
        `;
    }
}

/**
 * Create a topic card element
 */
function createTopicCard(deck) {
    const totalCards = deck.cards.length;
    const reviewedCards = deck.reviews.size;

    // Count due cards
    const now = new Date();
    let dueCards = 0;
    deck.reviews.forEach(review => {
        if (new Date(review.fsrsCard.due) <= now) {
            dueCards++;
        }
    });

    // Count new cards (never reviewed)
    const newCards = totalCards - reviewedCards;

    const card = document.createElement('a');
    card.href = `app.html?topic=${encodeURIComponent(deck.name)}`;
    card.className = 'project-card';

    card.innerHTML = `
        <div class="project-content">
            <h3 class="project-title">${escapeHtml(deck.name)}</h3>
            <p class="project-description">
                ${totalCards} card${totalCards !== 1 ? 's' : ''}
            </p>
            <div class="project-stats">
                ${dueCards > 0 ? `<strong>${dueCards} due</strong>` : 'No cards due'}
                ${newCards > 0 ? ` | ${newCards} new` : ''}
            </div>
        </div>
    `;

    return card;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on load
init();

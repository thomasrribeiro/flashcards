/**
 * Main entry point for topic listing page
 */

import { initDB, getAllCards, getAllReviews, getStats, getAllRepos, clearReviewsByDeck } from './storage.js';
import { loadRepository, loadDefaultRepo, removeRepository } from './repo-manager.js';

/**
 * Initialize the application
 */
async function init() {
    await initDB();

    const grid = document.getElementById('topics-grid');
    grid.innerHTML = '<div class="loading">Loading repositories...</div>';

    // Check if we have any repos, if not load default examples
    const repos = await getAllRepos();
    if (repos.length === 0) {
        await loadDefaultRepo();
    }

    await loadRepositories();
    setupEventListeners();
}

/**
 * Load and display repositories
 */
async function loadRepositories() {
    const grid = document.getElementById('topics-grid');

    try {
        // Get all repos and cards
        const repos = await getAllRepos();
        const allCards = await getAllCards();
        const allReviews = await getAllReviews();

        // Clear loading message
        grid.innerHTML = '';

        // Show example cards if no repos
        if (repos.length === 0 && allCards.length > 0) {
            // Show default example cards
            const exampleDeck = {
                id: 'basics',
                name: 'basics',
                description: 'Try out the flashcard system',
                cards: allCards.filter(c => c.deckName === 'basics' || c.deckName === 'examples'),
                reviews: new Map()
            };

            // Add review data for example cards
            allReviews.forEach(review => {
                const card = exampleDeck.cards.find(c => c.hash === review.cardHash);
                if (card) {
                    exampleDeck.reviews.set(review.cardHash, review);
                }
            });

            const card = createRepoCard(exampleDeck);
            grid.appendChild(card);
        }

        // Create cards for each repository
        for (const repo of repos) {
            // Get cards for this repo
            const repoCards = allCards.filter(c =>
                c.source?.repo === repo.id || c.deckName === repo.id
            );

            // Get reviews for these cards
            const repoReviews = new Map();
            allReviews.forEach(review => {
                const card = repoCards.find(c => c.hash === review.cardHash);
                if (card) {
                    repoReviews.set(review.cardHash, review);
                }
            });

            const repoData = {
                ...repo,
                cards: repoCards,
                reviews: repoReviews
            };

            const card = createRepoCard(repoData);
            grid.appendChild(card);
        }

    } catch (error) {
        console.error('Error loading repositories:', error);
        grid.innerHTML = `
            <div class="loading">
                Error loading repositories. Please check the console for details.
            </div>
        `;
    }
}

/**
 * Create a repository card element
 */
function createRepoCard(repo) {
    const totalCards = repo.cards.length;
    const reviewedCards = repo.reviews.size;

    // Count due cards
    const now = new Date();
    let dueCards = 0;
    repo.reviews.forEach(review => {
        if (new Date(review.fsrsCard.due) <= now) {
            dueCards++;
        }
    });

    // Count new cards (never reviewed)
    const newCards = totalCards - reviewedCards;

    const card = document.createElement('a');
    card.href = `app.html?topic=${encodeURIComponent(repo.id || repo.name)}`;
    card.className = 'project-card';

    const isExample = repo.id === 'examples';
    const displayName = isExample ? repo.name : repo.id;
    const description = repo.description || `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add reset button (top right)
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset all cards in this deck';
    resetBtn.innerHTML = '<img src="/icons/refresh.png" alt="Reset">';
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Reset all cards in "${displayName}"? This will mark all cards as new.`)) {
            await resetDeck(repo.id);
            await loadRepositories();
        }
    };

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(displayName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            ${dueCards > 0 ? `<strong>${dueCards} due</strong>` : 'No cards due'}
            ${newCards > 0 ? ` | ${newCards} new` : ''}
            ${repo.stars ? ` | ⭐ ${repo.stars}` : ''}
        </div>
    `;

    card.appendChild(resetBtn);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    const addBtn = document.getElementById('add-repo-btn');
    const repoInput = document.getElementById('repo-input');

    if (addBtn && repoInput) {
        addBtn.addEventListener('click', handleAddRepository);
        repoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAddRepository();
            }
        });
    }
}

/**
 * Handle adding a new repository
 */
async function handleAddRepository() {
    const input = document.getElementById('repo-input');
    const repoString = input.value.trim();

    if (!repoString) {
        alert('Please enter a repository in the format: owner/repository');
        return;
    }

    const addBtn = document.getElementById('add-repo-btn');
    const originalText = addBtn.textContent;
    addBtn.textContent = '...';
    addBtn.disabled = true;

    try {
        const result = await loadRepository(repoString);
        console.log(`Loaded ${result.cards.length} cards from ${repoString}`);

        // Clear input
        input.value = '';

        // Reload the display
        await loadRepositories();

    } catch (error) {
        console.error('Error loading repository:', error);
        alert(`Failed to load repository: ${error.message}`);
    } finally {
        addBtn.textContent = originalText;
        addBtn.disabled = false;
    }
}

/**
 * Reset all cards in a deck
 */
async function resetDeck(deckId) {
    await clearReviewsByDeck(deckId);
    console.log(`Reset all cards in deck: ${deckId}`);
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

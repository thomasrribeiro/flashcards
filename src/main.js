/**
 * Main entry point for topic listing page
 */

import { initDB, getAllCards, getAllReviews, getStats, getAllRepos, clearReviewsByDeck, saveCards } from './storage.js';
import { loadRepository, removeRepository } from './repo-manager.js';
import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';

/**
 * Initialize the application
 */
async function init() {
    console.log('=== INIT START ===');
    try {
        await initDB();
        console.log('DB initialized');

        const grid = document.getElementById('topics-grid');
        grid.innerHTML = '<div class="loading">Loading repositories...</div>';

        // Load example markdown only when logged out
        const isLoggedIn = !!localStorage.getItem('github_token');
        if (!isLoggedIn) {
            console.log('About to load example markdown...');
            await loadExampleMarkdown();
            console.log('Example markdown loaded');
        } else {
            console.log('Logged in, skipping example markdown');
        }

        console.log('About to load repositories...');
        await loadRepositories();
        console.log('Repositories loaded');

        setupEventListeners();
        console.log('=== INIT COMPLETE ===');
    } catch (error) {
        console.error('=== INIT ERROR ===', error);
    }
}

/**
 * Load and display repositories
 */
async function loadRepositories() {
    const grid = document.getElementById('topics-grid');

    try {
        // Get all repos and cards
        console.log('Loading repositories...');
        const repos = await getAllRepos();
        console.log('Repos:', repos.length);
        const allCards = await getAllCards();
        console.log('All cards:', allCards.length);
        const allReviews = await getAllReviews();
        console.log('All reviews:', allReviews.length);

        // Clear loading message
        grid.innerHTML = '';

        // Show example deck if no repos
        if (repos.length === 0 && allCards.length > 0) {
            console.log('Showing example deck');
            const exampleDeck = {
                id: 'basics',
                name: 'basics',
                description: 'Sample deck.',
                cards: allCards.filter(c => c.deckName === 'basics'),
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
            return;
        }

        // Show message if no repos and no example cards
        if (repos.length === 0) {
            grid.innerHTML = '<div class="loading">No repositories added. Click + to add a GitHub repository.</div>';
            return;
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

    // Count new cards (never reviewed) - these are always due
    const newCards = totalCards - reviewedCards;

    // Count due cards (reviewed cards that are due now)
    const now = new Date();
    let dueReviewedCards = 0;
    repo.reviews.forEach(review => {
        if (new Date(review.fsrsCard.due) <= now) {
            dueReviewedCards++;
        }
    });

    // Total due = new cards + reviewed cards that are due
    const dueCards = newCards + dueReviewedCards;

    const card = document.createElement('a');
    card.href = `app.html?topic=${encodeURIComponent(repo.id || repo.name)}`;
    card.className = 'project-card';

    const isBasicsDeck = repo.id === 'basics';
    const isLoggedIn = !!localStorage.getItem('github_token');
    const displayName = repo.name || repo.id;
    const description = repo.description || `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right) - only show buttons if logged in or not basics deck
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Add reset button
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
    btnContainer.appendChild(resetBtn);

    // Only show delete button if: logged in OR not the basics deck
    if (isLoggedIn || !isBasicsDeck) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.title = 'Delete this deck';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Delete deck "${displayName}"? This cannot be undone.`)) {
                await removeRepository(repo.id);
                await loadRepositories();
            }
        };
        btnContainer.appendChild(deleteBtn);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(displayName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            ${dueCards > 0 ? `<strong>${dueCards} due</strong>` : 'All done!'}
            ${repo.stars ? ` | ⭐ ${repo.stars}` : ''}
        </div>
    `;

    card.appendChild(btnContainer);
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

/**
 * Load example markdown from local file
 */
async function loadExampleMarkdown() {
    try {
        console.log('Loading example markdown...');
        const response = await fetch('/topics/example/basics.md');
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }
        const markdown = await response.text();
        console.log('Fetched markdown, length:', markdown.length);

        // Parse the markdown into cards
        const cards = parseDeck(markdown, 'basics.md');
        console.log('Parsed cards:', cards.length);

        // Add hash and metadata to each card
        const cardsWithMeta = cards.map(card => {
            const hash = hashCard(card);
            return {
                ...card,
                hash,
                deckName: 'basics',
                source: {
                    repo: 'local',
                    file: 'topics/example/basics.md'
                }
            };
        });

        // Always save the basics cards (in-memory storage)
        await saveCards(cardsWithMeta);
        console.log(`Loaded ${cardsWithMeta.length} example cards from basics.md`);
    } catch (error) {
        console.error('Failed to load example markdown:', error);
    }
}

// Initialize on load
init();

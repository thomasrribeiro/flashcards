/**
 * Main entry point for topic listing page
 */

import { initDB, getAllCards, getAllReviews, getStats, getAllRepos, getAllDecks, getAllTopics, clearReviewsByDeck, saveCards, saveRepoMetadata } from './storage.js';
import { loadRepository, removeRepository } from './repo-manager.js';
import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';
import { getAuthenticatedUser, getUserRepositories } from './github-client.js';
import { githubAuth } from './github-auth.js';

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

        // Only load example markdown when not logged in
        if (!githubAuth.isAuthenticated()) {
            console.log('About to load example markdown...');
            await loadExampleMarkdown();
            console.log('Example markdown loaded');
        }

        console.log('About to load repositories...');
        await loadRepositories();
        console.log('Repositories loaded');

        setupEventListeners();

        // Setup repo input if authenticated
        if (githubAuth.isAuthenticated()) {
            await setupRepoInput();
        }

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
    const controlsBar = document.getElementById('controls-bar');

    try {
        // Get all data
        console.log('Loading repositories...');
        const allCards = await getAllCards();
        console.log('All cards:', allCards.length);
        const allReviews = await getAllReviews();
        console.log('All reviews:', allReviews.length);
        const allDecks = await getAllDecks();
        console.log('All decks:', allDecks.length);

        // Clear loading message
        grid.innerHTML = '';

        // Check login status
        const isLoggedIn = githubAuth.isAuthenticated();

        // Show example deck only if logged out
        if (!isLoggedIn && allDecks.length === 0 && allCards.length > 0) {
            console.log('Showing example deck');
            controlsBar.classList.add('hidden');
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

            const card = createDeckCard(exampleDeck);
            grid.appendChild(card);
            return;
        }

        // Show message if no decks
        if (allDecks.length === 0) {
            controlsBar.classList.add('hidden');
            grid.innerHTML = '<div class="loading">Search for a GitHub repository and click + to add it.</div>';
            return;
        }

        // Show controls when there are decks
        controlsBar.classList.remove('hidden');

        // Apply search filter
        const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
        let filteredDecks = allDecks.filter(deck => {
            // Search by the displayed repo name (last part of owner/repo)
            const isBasicsDeck = deck.id === 'basics';
            const displayName = isBasicsDeck ? deck.id : deck.id.split('/').pop();
            return displayName.toLowerCase().includes(searchTerm);
        });

        // Display decks directly (no grouping, no headers)
        for (const deck of filteredDecks) {
            const deckCards = allCards.filter(c => c.deckName === deck.id);
            const deckReviews = allReviews.filter(r => {
                const card = deckCards.find(c => c.hash === r.cardHash);
                return !!card;
            });

            // Create deck card with review info
            const deckWithReviews = {
                ...deck,
                cards: deckCards,
                reviews: new Map(deckReviews.map(r => [r.cardHash, r]))
            };

            const card = createDeckCard(deckWithReviews);
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
 * Create a deck card element
 */
function createDeckCard(deck) {
    const totalCards = deck.cards.length;
    const reviewedCards = deck.reviews.size;

    // Count new cards (never reviewed) - these are always due
    const newCards = totalCards - reviewedCards;

    // Count due cards (reviewed cards that are due now)
    const now = new Date();
    let dueReviewedCards = 0;
    deck.reviews.forEach(review => {
        if (new Date(review.fsrsCard.due) <= now) {
            dueReviewedCards++;
        }
    });

    // Total due = new cards + reviewed cards that are due
    const dueCards = newCards + dueReviewedCards;

    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.cursor = 'pointer';
    card.onclick = () => openSubdeckModal(deck);

    const isBasicsDeck = deck.id === 'basics';
    // Extract repo name from deck.id (e.g., "owner/repo" -> "repo")
    const displayName = isBasicsDeck ? deck.id : deck.id.split('/').pop();
    // Show only card count in description (due count shown in stats below)
    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right) - only show buttons if not basics deck
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
            await resetDeck(deck.id);
            await loadRepositories();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Add review button (gavel)
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'card-review-btn';
    reviewBtn.title = 'Review this deck';
    reviewBtn.innerHTML = '<img src="/icons/gavel.png" alt="Review">';
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = `app.html?deck=${encodeURIComponent(deck.id)}`;
    };
    btnContainer.appendChild(reviewBtn);

    // Only show delete button if not the basics deck
    if (!isBasicsDeck) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.title = 'Delete this deck';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Delete deck "${displayName}"? This cannot be undone.`)) {
                try {
                    // Delete locally
                    console.log(`[Main] Deleting deck ${deck.id} locally`);
                    const beforeRepos = await getAllRepos();
                    console.log(`[Main] Repos BEFORE deletion:`, beforeRepos.length, beforeRepos.map(r => r.id));

                    await removeRepository(deck.id);

                    const afterRepos = await getAllRepos();
                    console.log(`[Main] Repos AFTER deletion:`, afterRepos.length, afterRepos.map(r => r.id));
                    console.log('[Main] Deck deleted locally');

                    // Verify the deck was actually removed
                    const stillExists = afterRepos.find(r => r.id === deck.id);
                    if (stillExists) {
                        console.error('[Main] ERROR: Deck still exists after deletion!', stillExists);
                    } else {
                        console.log('[Main] Verified: Deck successfully removed from local cache');
                    }

                    // Reload the entire page to ensure UI is fresh
                    console.log('[Main] Reloading page after deletion in 500ms...');
                    setTimeout(() => window.location.reload(), 500);
                } catch (error) {
                    console.error('[Main] Error deleting deck:', error);
                    alert(`Failed to delete deck: ${error.message}`);
                }
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
    const repoInput = document.getElementById('github-repo-input');

    // Add repository when + button is clicked
    if (addBtn) {
        addBtn.addEventListener('click', () => handleAddRepository());
    }

    // Add repository when Enter is pressed in input
    if (repoInput) {
        repoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAddRepository();
            }
        });
    }

    // Search handler
    const searchInput = document.getElementById('search-input');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            loadRepositories();
        });
    }
}

/**
 * Setup repository input with user's repos dropdown
 */
async function setupRepoInput() {
    const repoInput = document.getElementById('github-repo-input');
    const suggestions = document.getElementById('repo-suggestions');

    let userRepos = [];
    let selectedIndex = -1;

    try {
        // Get authenticated user
        const user = await getAuthenticatedUser();
        console.log(`[Main] Loading repos for ${user.login}`);
        // Don't pre-fill, just set placeholder
        repoInput.value = '';
        repoInput.placeholder = 'owner/repository';

        // Load user repositories (but don't show dropdown yet)
        userRepos = await getUserRepositories();
        console.log(`[Main] Loaded ${userRepos.length} repositories`);

    } catch (error) {
        console.error('[Main] Failed to setup repo dropdown:', error);
        suggestions.classList.add('hidden');
    }

    // Input event for filtering
    repoInput.addEventListener('input', () => {
        const value = repoInput.value;
        updateDropdownDisplay(userRepos, value, suggestions);
        selectedIndex = -1;
    });

    // Focus event to show dropdown
    repoInput.addEventListener('focus', () => {
        if (userRepos.length > 0) {
            updateDropdownDisplay(userRepos, repoInput.value, suggestions);
        }
    });

    // Click outside to hide dropdown
    document.addEventListener('click', (e) => {
        if (!repoInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.classList.add('hidden');
        }
    });

    // Keyboard navigation
    repoInput.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('.repo-suggestion-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelectedItem(items, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelectedItem(items, selectedIndex);
        } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < items.length) {
            e.preventDefault();
            const selectedRepo = items[selectedIndex].dataset.repo;
            repoInput.value = selectedRepo;
            suggestions.classList.add('hidden');
            selectedIndex = -1;
        } else if (e.key === 'Escape') {
            suggestions.classList.add('hidden');
            selectedIndex = -1;
        }
    });
}

/**
 * Update dropdown display based on filter
 */
function updateDropdownDisplay(repos, filter, container) {
    const filterLower = filter.toLowerCase();

    // Filter repos based on input
    const filteredRepos = repos.filter(repo => {
        const fullName = repo.full_name.toLowerCase();
        const name = repo.name.toLowerCase();
        return fullName.includes(filterLower) || name.includes(filterLower);
    });

    if (filteredRepos.length === 0) {
        container.innerHTML = '<div class="repo-loading">No matching repositories</div>';
        container.classList.remove('hidden');
        return;
    }

    // Build HTML for suggestions
    const html = filteredRepos.slice(0, 20).map(repo => `
        <div class="repo-suggestion-item" data-repo="${repo.full_name}">
            <div class="repo-suggestion-name">${repo.full_name}</div>
            ${repo.description ? `<div class="repo-suggestion-desc">${escapeHtml(repo.description)}</div>` : ''}
            <div class="repo-suggestion-meta">
                ${repo.private ? '<span>🔒 Private</span>' : ''}
                ${repo.stargazers_count > 0 ? `<span>⭐ ${repo.stargazers_count}</span>` : ''}
                ${repo.language ? `<span>${repo.language}</span>` : ''}
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
    container.classList.remove('hidden');

    // Add click handlers
    container.querySelectorAll('.repo-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const repoInput = document.getElementById('github-repo-input');
            repoInput.value = item.dataset.repo;
            container.classList.add('hidden');
        });
    });
}

/**
 * Update selected item highlighting
 */
function updateSelectedItem(items, index) {
    items.forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

/**
 * Handle adding a new repository
 */
async function handleAddRepository() {
    const input = document.getElementById('github-repo-input');
    const addBtn = document.getElementById('add-repo-btn');
    const repoString = input.value.trim();

    if (!repoString) {
        alert('Please enter a repository in the format: owner/repository');
        return;
    }

    // Validate format
    if (!repoString.includes('/') || repoString.split('/').length !== 2) {
        alert('Invalid format. Please use: owner/repository');
        return;
    }

    const originalText = addBtn.textContent;
    addBtn.textContent = '...';
    addBtn.disabled = true;
    input.disabled = true;

    try {
        // Import hasFlashcardContent to validate the repo
        const { hasFlashcardContent } = await import('./github-client.js');
        const [owner, repo] = repoString.split('/');

        // Check if repository contains flashcard content
        console.log(`[Main] Validating ${repoString} for flashcard content...`);
        const hasFlashcards = await hasFlashcardContent(owner, repo);

        if (!hasFlashcards) {
            alert(`Repository "${repoString}" does not contain any markdown files with Q:/A:/C: format flashcards. Please check the repository and try again.`);
            addBtn.textContent = originalText;
            addBtn.disabled = false;
            input.disabled = false;
            return;
        }

        console.log(`[Main] ${repoString} validated successfully`);

        const result = await loadRepository(repoString);
        console.log(`Loaded deck with ${result.cards.length} total cards from ${repoString}`);

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
        input.disabled = false;
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
        const { cards, metadata } = parseDeck(markdown, 'basics.md');
        console.log('Parsed cards:', cards.length);

        // Add hash and metadata to each card
        const cardsWithMeta = cards.map(card => {
            const hash = hashCard(card);
            return {
                ...card,
                hash,
                deckName: 'basics',
                deckMetadata: metadata,
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

/**
 * Open modal to show subdecks (individual markdown files)
 */
async function openSubdeckModal(deck) {
    const modal = document.getElementById('subdeck-modal');
    const modalDeckName = document.getElementById('modal-deck-name');
    const subdeckGrid = document.getElementById('subdeck-grid');

    // Set deck name
    modalDeckName.textContent = deck.id.split('/').pop();

    // Get all cards for this deck and group by file
    const allCards = await getAllCards();
    const deckCards = allCards.filter(c => c.deckName === deck.id);
    const allReviews = await getAllReviews();

    // Group cards by file
    const fileGroups = {};
    deckCards.forEach(card => {
        const fileName = card.source?.file || 'unknown';
        if (!fileGroups[fileName]) {
            fileGroups[fileName] = [];
        }
        fileGroups[fileName].push(card);
    });

    // Clear and populate subdeck grid
    subdeckGrid.innerHTML = '';

    // Sort files by name
    const sortedFiles = Object.keys(fileGroups).sort();

    for (const fileName of sortedFiles) {
        const cards = fileGroups[fileName];
        const fileReviews = allReviews.filter(r => {
            const card = cards.find(c => c.hash === r.cardHash);
            return !!card;
        });

        const subdeckData = {
            id: `${deck.id}/${fileName}`,
            fileName: fileName,
            deckId: deck.id,
            cards: cards,
            reviews: new Map(fileReviews.map(r => [r.cardHash, r]))
        };

        const subdeckCard = createSubdeckCard(subdeckData);
        subdeckGrid.appendChild(subdeckCard);
    }

    // Show modal
    modal.classList.remove('hidden');
}

/**
 * Close subdeck modal
 */
function closeSubdeckModal() {
    const modal = document.getElementById('subdeck-modal');
    modal.classList.add('hidden');
}

/**
 * Create a subdeck card element (for individual markdown files)
 */
function createSubdeckCard(subdeck) {
    const totalCards = subdeck.cards.length;
    const reviewedCards = subdeck.reviews.size;

    // Count new cards (never reviewed) - these are always due
    const newCards = totalCards - reviewedCards;

    // Count due cards (reviewed cards that are due now)
    const now = new Date();
    let dueReviewedCards = 0;
    subdeck.reviews.forEach(review => {
        if (new Date(review.fsrsCard.due) <= now) {
            dueReviewedCards++;
        }
    });

    // Total due = new cards + reviewed cards that are due
    const dueCards = newCards + dueReviewedCards;

    const card = document.createElement('div');
    card.className = 'project-card';

    // Extract just the filename from the path
    const displayName = subdeck.fileName.split('/').pop().replace('.md', '');
    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Add reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset all cards in this subdeck';
    resetBtn.innerHTML = '<img src="/icons/refresh.png" alt="Reset">';
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Reset all cards in "${displayName}"? This will mark all cards as new.`)) {
            // Reset cards by hash
            for (const card of subdeck.cards) {
                await clearReviewsByDeck(card.hash);
            }
            closeSubdeckModal();
            await loadRepositories();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Add review button (gavel)
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'card-review-btn';
    reviewBtn.title = 'Review this subdeck';
    reviewBtn.innerHTML = '<img src="/icons/gavel.png" alt="Review">';
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Navigate to app.html with file filter
        window.location.href = `app.html?deck=${encodeURIComponent(subdeck.deckId)}&file=${encodeURIComponent(subdeck.fileName)}`;
    };
    btnContainer.appendChild(reviewBtn);

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-delete-btn';
    deleteBtn.title = 'Delete this subdeck';
    deleteBtn.innerHTML = '×';
    deleteBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Delete subdeck "${displayName}"? This cannot be undone.`)) {
            // Remove cards from this file
            const { removeCards } = await import('./storage.js');
            const cardHashes = subdeck.cards.map(c => c.hash);
            await removeCards(cardHashes);
            closeSubdeckModal();
            await loadRepositories();
        }
    };
    btnContainer.appendChild(deleteBtn);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(displayName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            ${dueCards > 0 ? `<strong>${dueCards} due</strong>` : 'All done!'}
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

// Setup modal close handlers
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-modal');
    const overlay = document.querySelector('.modal-overlay');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSubdeckModal);
    }

    if (overlay) {
        overlay.addEventListener('click', closeSubdeckModal);
    }

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSubdeckModal();
        }
    });
});

// Initialize on load
init();

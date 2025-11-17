/**
 * Main entry point for topic listing page
 */

import { initDB, getAllCards, getAllReviews, getStats, getAllRepos, getAllDecks, getAllTopics, clearReviewsByDeck, saveCards, saveRepoMetadata } from './storage.js';
import { loadRepository, removeRepository } from './repo-manager.js';
import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';
import { getAuthenticatedUser, getUserRepositories } from './github-client.js';

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

        // Always load example markdown (no persistent login state)
        if (true) {
            console.log('About to load example markdown...');
            await loadExampleMarkdown();
            console.log('Example markdown loaded');
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

        // Show example deck if no decks (logged out state)
        if (allDecks.length === 0 && allCards.length > 0) {
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

        // Show message if no decks and no example cards
        if (allDecks.length === 0) {
            controlsBar.classList.add('hidden');
            grid.innerHTML = '<div class="loading">No repositories added. Click + to add a GitHub repository.</div>';
            return;
        }

        // Show controls when there are decks
        controlsBar.classList.remove('hidden');

        // Apply filters and sorting
        const filteredDecks = applyFiltersAndSort(allDecks, allCards, allReviews);

        // Group decks by topic
        const decksByTopic = new Map();
        filteredDecks.forEach(deck => {
            const topic = deck.topic || 'Uncategorized';
            if (!decksByTopic.has(topic)) {
                decksByTopic.set(topic, []);
            }
            decksByTopic.get(topic).push(deck);
        });

        // Create topic groups
        const sortedTopics = Array.from(decksByTopic.keys()).sort();
        for (const topic of sortedTopics) {
            const decks = decksByTopic.get(topic);

            // Create topic section
            const topicSection = createTopicSection(topic, decks, allCards, allReviews);
            grid.appendChild(topicSection);
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
 * Apply search filter and sorting to decks
 */
function applyFiltersAndSort(decks, allCards, allReviews) {
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');

    let filtered = [...decks];

    // Apply search filter
    const searchTerm = searchInput?.value.toLowerCase().trim() || '';
    if (searchTerm) {
        filtered = filtered.filter(deck => {
            const name = deck.name?.toLowerCase() || '';
            const topic = deck.topic?.toLowerCase() || '';
            const subject = deck.subject?.toLowerCase() || '';
            const tags = deck.tags?.join(' ').toLowerCase() || '';

            return name.includes(searchTerm) ||
                   topic.includes(searchTerm) ||
                   subject.includes(searchTerm) ||
                   tags.includes(searchTerm);
        });
    }

    // Calculate stats for sorting
    const decksWithStats = filtered.map(deck => {
        const deckCards = allCards.filter(c => c.deckName === deck.id);
        const deckReviews = allReviews.filter(r => {
            const card = deckCards.find(c => c.hash === r.cardHash);
            return !!card;
        });

        const now = new Date();
        const dueCount = deckCards.length - deckReviews.length +
                        deckReviews.filter(r => new Date(r.fsrsCard.due) <= now).length;

        return {
            ...deck,
            _dueCount: dueCount,
            _createdAt: deck.createdAt || new Date(0)
        };
    });

    // Apply sorting
    const sortOption = sortSelect?.value || '';

    switch (sortOption) {
        case 'newest':
            decksWithStats.sort((a, b) => new Date(b._createdAt) - new Date(a._createdAt));
            break;
        case 'oldest':
            decksWithStats.sort((a, b) => new Date(a._createdAt) - new Date(b._createdAt));
            break;
        case 'name-asc':
            decksWithStats.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'name-desc':
            decksWithStats.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            break;
        case 'due-most':
            decksWithStats.sort((a, b) => b._dueCount - a._dueCount);
            break;
        case 'due-least':
            decksWithStats.sort((a, b) => a._dueCount - b._dueCount);
            break;
        default:
            // Default: sort by topic, then by order within topic
            decksWithStats.sort((a, b) => {
                // First sort by topic
                const topicA = a.topic || 'Uncategorized';
                const topicB = b.topic || 'Uncategorized';
                if (topicA !== topicB) {
                    return topicA.localeCompare(topicB);
                }
                // Then by order or name within topic
                if (a.order !== null && b.order !== null) {
                    return a.order - b.order;
                }
                return (a.name || '').localeCompare(b.name || '');
            });
    }

    // Remove temporary stats properties
    return decksWithStats.map(({ _dueCount, _createdAt, ...deck }) => deck);
}

/**
 * Create a topic section with collapsible decks
 */
function createTopicSection(topic, decks, allCards, allReviews) {
    const section = document.createElement('div');
    section.className = 'topic-section';

    // Topic header
    const header = document.createElement('div');
    header.className = 'topic-header';
    header.innerHTML = `<h3>${escapeHtml(topic)}</h3>`;
    section.appendChild(header);

    // Decks container
    const decksContainer = document.createElement('div');
    decksContainer.className = 'decks-container';

    for (const deck of decks) {
        // Get cards for this deck
        const deckCards = allCards.filter(c => c.deckName === deck.id);

        // Get reviews for these cards
        const deckReviews = new Map();
        allReviews.forEach(review => {
            const card = deckCards.find(c => c.hash === review.cardHash);
            if (card) {
                deckReviews.set(review.cardHash, review);
            }
        });

        const deckData = {
            ...deck,
            cards: deckCards,
            reviews: deckReviews
        };

        const deckCard = createDeckCard(deckData);
        decksContainer.appendChild(deckCard);
    }

    section.appendChild(decksContainer);
    return section;
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

    const card = document.createElement('a');
    card.href = `app.html?deck=${encodeURIComponent(deck.id)}`;
    card.className = 'project-card';

    const isBasicsDeck = deck.id === 'basics';
    const displayName = deck.name || deck.id;
    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

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
            await resetDeck(deck.id);
            await loadRepositories();
        }
    };
    btnContainer.appendChild(resetBtn);

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
    const modal = document.getElementById('add-repo-modal');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    const modalAdd = document.getElementById('modal-add');
    const repoInput = document.getElementById('github-repo-input');

    // Open modal when + button is clicked
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            modal.classList.remove('hidden');

            // Set default username and load repos
            if (false) { // Disabled - no persistent auth
                console.log('[Main] Loading user repos for dropdown');
                await setupRepoDropdown();
            }

            repoInput.focus();
        });
    }

    // Close modal handlers
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    if (modalCancel) {
        modalCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    // Close on backdrop click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    // Add repository handler
    if (modalAdd && repoInput) {
        modalAdd.addEventListener('click', () => handleAddRepository());
        repoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAddRepository();
            }
        });
    }

    // Search and sort handlers
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            loadRepositories();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            loadRepositories();
        });
    }
}

/**
 * Setup repository dropdown with user's repos
 */
async function setupRepoDropdown() {
    const repoInput = document.getElementById('github-repo-input');
    const suggestions = document.getElementById('repo-suggestions');

    let userRepos = [];
    let selectedIndex = -1;

    try {
        // Get authenticated user
        const user = await getAuthenticatedUser();
        console.log(`[Main] Setting input default to ${user.login}/`);
        repoInput.value = `${user.login}/`;
        repoInput.placeholder = `${user.login}/repository`;

        // Load user repositories
        suggestions.innerHTML = '<div class="repo-loading">Loading repositories...</div>';
        suggestions.classList.remove('hidden');

        userRepos = await getUserRepositories();
        console.log(`[Main] Loaded ${userRepos.length} repositories`);

        // Display repositories
        updateDropdownDisplay(userRepos, repoInput.value, suggestions);

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
    const modal = document.getElementById('add-repo-modal');
    const modalAdd = document.getElementById('modal-add');
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

    const originalText = modalAdd.textContent;
    modalAdd.textContent = 'Loading...';
    modalAdd.disabled = true;

    try {
        const result = await loadRepository(repoString);
        console.log(`Loaded deck with ${result.cards.length} total cards from ${repoString}`);

        // Close modal
        modal.classList.add('hidden');
        input.value = '';

        // Reload the display
        await loadRepositories();

    } catch (error) {
        console.error('Error loading repository:', error);
        alert(`Failed to load repository: ${error.message}`);
    } finally {
        modalAdd.textContent = originalText;
        modalAdd.disabled = false;
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

// Initialize on load
init();

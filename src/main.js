/**
 * Main entry point for topic listing page
 */

import { initDB, getAllCards, getAllReviews, getStats, getAllRepos, getAllDecks, getAllTopics, clearReviewsByDeck, saveCards, saveRepoMetadata } from './storage.js';
import { loadRepository, removeRepository } from './repo-manager.js';
import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';
import { getAuthenticatedUser, getUserRepositories } from './github-client.js';
import { githubAuth } from './github-auth.js';
import { startSession, startDrillSession, revealAnswer, gradeCard, getState, cleanup as cleanupStudySession, GradeKeys } from './study-session.js';

// Card editor imports
import { initDeckCreator, openDeckCreator } from './deck-creator.js';
import { initFolderCreator, openFolderCreator } from './folder-creator.js';
import { initCardEditor, openCardEditorCreate, openCardEditorEdit } from './card-editor.js';
import './card-editor.css';

/**
 * Initialize the application
 */
async function init() {
    console.log('=== INIT START ===');
    try {
        await initDB();
        console.log('DB initialized');

        const grid = document.getElementById('topics-grid');
        grid.innerHTML = '<div class="loading">Loading collection...</div>';

        const isAuthenticated = githubAuth.isAuthenticated();

        if (!isAuthenticated) {
            console.log('About to load local collection repos...');
            await loadLocalCollectionRepos();
            console.log('Local collection repos loaded');
        } else {
            // Load user's repos from D1
            console.log('About to load user repos from D1...');
            await loadUserRepos();
            console.log('User repos loaded from D1');
        }

        console.log('About to load repositories...');
        await loadRepositories();
        console.log('Repositories loaded');

        // Restore navigation state from URL if present
        await restoreNavigationFromURL();

        setupEventListeners();

        // Setup repo input if authenticated
        if (githubAuth.isAuthenticated()) {
            await setupRepoInput();

            // Initialize card editor components
            initDeckCreator(onDeckCreated);
            initFolderCreator(onFolderCreated);
            initCardEditor(onCardSaved);
        }

        // Handle browser back/forward navigation
        window.addEventListener('popstate', handlePopState);

        console.log('=== INIT COMPLETE ===');
    } catch (error) {
        console.error('=== INIT ERROR ===', error);
    }
}

/**
 * Load user's repos from D1 and fetch their cards
 */
async function loadUserRepos() {
    const { loadReposFromD1 } = await import('./storage.js');
    const { loadRepository, removeRepository } = await import('./repo-manager.js');

    const repos = await loadReposFromD1();
    if (!repos || repos.length === 0) {
        console.log('[Main] No repos found in D1');
        return;
    }

    console.log(`[Main] Loading ${repos.length} repos from D1:`, repos.map(r => r.id));

    const grid = document.getElementById('topics-grid');
    const total = repos.length;
    let loaded = 0;
    const failedRepos = [];
    const evicted = [];

    const renderProgress = () => {
        if (!grid) return;
        grid.innerHTML = `<div class="loading">Loading your decks… (${loaded}/${total})</div>`;
    };
    renderProgress();

    // Load all repos in parallel — each repo already parallelises its own file fetches
    await Promise.all(repos.map(async (repo) => {
        const displayName = repo.id.split('/').pop();
        try {
            await loadRepository(repo.id);
            console.log(`[Main] Loaded repo: ${repo.id}`);
        } catch (error) {
            if (error.status === 404) {
                // Repo is gone or has moved — silently evict the stale D1 entry
                const reason = error.movedTo ? `moved to ${error.movedTo}` : 'not found';
                console.warn(`[Main] Auto-removed stale repo ${repo.id} (${reason})`);
                evicted.push({ id: repo.id, name: displayName, movedTo: error.movedTo || null });
                try { await removeRepository(repo.id); } catch (e) { /* best-effort */ }
            } else {
                // Transient failure (rate limit, auth, network) — keep the row, show placeholder
                console.error(`[Main] Failed to load repo ${repo.id}:`, error);
                failedRepos.push({ id: repo.id, name: displayName, error: error.message });
            }
        } finally {
            loaded++;
            renderProgress();
        }
    }));

    // Stash broken repos and evictions so loadRepositories can surface them
    window.__failedRepos = failedRepos;
    window.__evictedRepos = evicted;

    // Clean up orphaned reviews after loading all repos
    const { cleanupOrphanedReviews } = await import('./storage.js');
    const cleaned = await cleanupOrphanedReviews();
    if (cleaned > 0) {
        console.log(`[Main] Cleaned up ${cleaned} orphaned reviews`);
    }
}

/**
 * Populate the category filter dropdown from available deck subjects.
 * Preserves the current selection if still valid.
 */
function populateCategoryFilter(decks) {
    const select = document.getElementById('category-filter');
    if (!select) return;

    const subjects = [...new Set(
        decks.map(d => d.subject).filter(s => typeof s === 'string' && s.trim())
    )].sort((a, b) => a.localeCompare(b));

    const prev = select.value;

    select.innerHTML = '<option value="">All categories</option>' +
        subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    // Restore prior selection if it still exists among available subjects
    if (prev && subjects.includes(prev)) {
        select.value = prev;
    } else {
        select.value = '';
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

        // Filter out local decks when logged in
        let displayDecks = allDecks;
        if (isLoggedIn) {
            displayDecks = allDecks.filter(deck => !deck.id.startsWith('local/'));
            console.log(`[Main] Filtered out local decks. Showing ${displayDecks.length} GitHub decks`);
        }

        // Show message if no decks
        if (displayDecks.length === 0) {
            controlsBar.classList.add('hidden');
            if (isLoggedIn) {
                grid.innerHTML = '<div class="loading">Search for a GitHub repository and click + to add it.</div>';
            } else {
                grid.innerHTML = '<div class="loading">No example deck found.</div>';
            }
            return;
        }

        // Show controls when there are decks
        controlsBar.classList.remove('hidden');

        const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
        const breadcrumb = document.getElementById('deck-breadcrumb');

        // Global search: bypass category navigation, show all matching decks flat
        if (searchTerm && !currentDeck) {
            if (breadcrumb) breadcrumb.classList.add('hidden');

            const filtered = displayDecks.filter(deck =>
                deck.id.split('/').pop().toLowerCase().includes(searchTerm)
            );

            if (filtered.length === 0) {
                grid.innerHTML = '<div class="loading">No decks match your search.</div>';
            } else {
                for (const deck of filtered) {
                    const deckCards = allCards.filter(c => c.deckName === deck.id);
                    const deckReviews = allReviews.filter(r => deckCards.some(c => c.hash === r.cardHash));
                    grid.appendChild(createDeckCard({
                        ...deck,
                        cards: deckCards,
                        reviews: new Map(deckReviews.map(r => [r.cardHash, r]))
                    }));
                }
            }
            return;
        }

        if (currentCategory === null) {
            // HOME LEVEL: render category cards
            _renderCategoryGrid(displayDecks, allCards, allReviews, searchTerm, grid);
        } else {
            // CATEGORY LEVEL: render deck cards for the current category
            const filteredDecks = displayDecks.filter(deck => {
                const subject = (deck.subject && deck.subject.trim()) ? deck.subject.trim().toLowerCase() : 'misc';
                return subject === currentCategory;
            });

            for (const deck of filteredDecks) {
                const deckCards = allCards.filter(c => c.deckName === deck.id);
                const deckReviews = allReviews.filter(r => deckCards.some(c => c.hash === r.cardHash));
                grid.appendChild(createDeckCard({
                    ...deck,
                    cards: deckCards,
                    reviews: new Map(deckReviews.map(r => [r.cardHash, r]))
                }));
            }

            // Render placeholders for repos that failed to load
            const failedRepos = window.__failedRepos || [];
            for (const failed of failedRepos) {
                grid.appendChild(createFailedRepoCard(failed));
            }

            renderEvictedNotice();
        }

        updateDeckBreadcrumb();

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
 * Render the home-level category grid
 */
function _renderCategoryGrid(displayDecks, allCards, allReviews, searchTerm, grid) {
    // Group decks by subject
    const categoryMap = new Map();
    for (const deck of displayDecks) {
        const subject = (deck.subject && deck.subject.trim()) ? deck.subject.trim().toLowerCase() : 'misc';
        if (!categoryMap.has(subject)) categoryMap.set(subject, []);
        categoryMap.get(subject).push(deck);
    }

    // Named categories alphabetically, misc last
    const sorted = [...categoryMap.keys()].sort((a, b) => {
        if (a === 'misc') return 1;
        if (b === 'misc') return -1;
        return a.localeCompare(b);
    });

    const filtered = searchTerm
        ? sorted.filter(name => name.toLowerCase().includes(searchTerm))
        : sorted;

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No categories match your search.</div>';
        return;
    }

    for (const categoryName of filtered) {
        grid.appendChild(createCategoryCard(categoryName, categoryMap.get(categoryName), allCards, allReviews));
    }

    // Failed/evicted repos show at home level in Misc area
    renderEvictedNotice();
    updateDeckBreadcrumb();
}

/**
 * Create a category folder card (aggregate of all decks in that category)
 */
function createCategoryCard(categoryName, decks, allCards, allReviews) {
    let totalCards = 0;
    let reviewedCards = 0;
    let dueCards = 0;
    const now = new Date();

    for (const deck of decks) {
        const deckCards = allCards.filter(c => c.deckName === deck.id);
        totalCards += deckCards.length;

        const deckReviews = allReviews.filter(r => deckCards.some(c => c.hash === r.cardHash));
        reviewedCards += deckReviews.length;

        const newCount = deckCards.length - deckReviews.length;
        dueCards += newCount;
        deckReviews.forEach(r => {
            if (new Date(r.fsrsCard.due) <= now) dueCards++;
        });
    }

    const progressPercent = totalCards > 0 ? Math.round((reviewedCards / totalCards) * 100) : 0;
    const deckCount = decks.length;
    const description = `${deckCount} deck${deckCount !== 1 ? 's' : ''} · ${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.cursor = 'pointer';
    card.onclick = () => navigateToCategory(categoryName);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Reset all decks in category
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress for all decks in this category';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Reset all ${totalCards} card${totalCards !== 1 ? 's' : ''} in "${categoryName}"? This marks everything as new.`)) {
            for (const deck of decks) await resetDeck(deck.id);
            await loadRepositories();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Drill cards in this category
    const drillBtn = document.createElement('button');
    drillBtn.className = 'card-review-btn';
    drillBtn.title = `Drill cards in ${categoryName}`;
    drillBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Drill">`;
    drillBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDrillAllSession(categoryName);
    };
    btnContainer.appendChild(drillBtn);

    // Remove all decks in category from collection (auth only, non-local)
    const isAuthenticated = localStorage.getItem('github_user') !== null;
    const allGitHub = decks.every(d => !d.id.startsWith('local/'));
    if (isAuthenticated && allGitHub) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'card-delete-btn';
        removeBtn.title = `Remove all decks in "${categoryName}" from your collection`;
        removeBtn.innerHTML = '×';
        removeBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Remove all ${deckCount} deck${deckCount !== 1 ? 's' : ''} in "${categoryName}" from your collection?\n\nThis does NOT delete the GitHub repositories.`)) {
                for (const deck of decks) await removeRepository(deck.id);
                await loadRepositories();
            }
        };
        btnContainer.appendChild(removeBtn);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(categoryName)}</h3>
        <p class="project-description">${escapeHtml(description)}</p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Navigate into a category folder
 */
function navigateToCategory(categoryName) {
    currentCategory = categoryName;

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const url = new URL(window.location);
    url.searchParams.set('category', categoryName);
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    history.pushState({ category: categoryName }, '', url);

    updateDeckBreadcrumb();
    loadRepositories();
}

/**
 * Exit category view back to home (category grid)
 */
function exitCategoryNavigation() {
    currentCategory = null;

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const url = new URL(window.location);
    url.searchParams.delete('category');
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    history.pushState({}, '', url);

    updateDeckBreadcrumb();
    loadRepositories();
}

/**
 * Exit deck view back to the category's deck list (stay inside category)
 */
function exitToCategoryView() {
    currentDeck = null;
    currentPath = [];
    folderHierarchy = null;
    allReviewsCache = null;

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const url = new URL(window.location);
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    if (currentCategory) url.searchParams.set('category', currentCategory);
    history.pushState({ category: currentCategory }, '', url);

    updateDeckBreadcrumb();
    loadRepositories();
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

    // All decks can have hierarchy/modal navigation
    const isLocalRepo = deck.id.startsWith('local/');

    card.className = 'project-card';

    // All decks are clickable for inline navigation
    card.style.cursor = 'pointer';
    card.onclick = () => navigateToDeck(deck);

    // Extract repo name from deck.id (e.g., "owner/repo" -> "repo", "local/my-deck" -> "my-deck")
    const displayName = deck.id.includes('/') ? deck.id.split('/').pop() : deck.id;
    // Show only card count in description (due count shown in stats below)
    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Add reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
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
    reviewBtn.title = 'Review';
    reviewBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    reviewBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Navigate into deck first, then start study session for entire deck
        await navigateToDeck(deck, [], true);
        startStudySession(deck.id, null, 'all');
    };
    btnContainer.appendChild(reviewBtn);

    // Only show delete button when authenticated (local repos must be manually removed from public/collection/)
    const isAuthenticated = localStorage.getItem('github_user') !== null;
    if (isAuthenticated) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.title = 'Remove from collection';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (confirm(`Remove "${displayName}" from your collection?`)) {
                try {
                    await removeRepository(deck.id);
                    await loadRepositories();
                } catch (error) {
                    console.error('[Main] Error removing deck:', error);
                    alert(`Failed to remove deck: ${error.message}`);
                }
            }
        };
        btnContainer.appendChild(deleteBtn);
    }

    // Calculate progress percentage (cards reviewed at least once)
    const progressPercent = totalCards > 0 ? Math.round((reviewedCards / totalCards) * 100) : 0;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(displayName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Create a placeholder card for a repo that failed to load (non-404 error)
 */
function createFailedRepoCard(failed) {
    const card = document.createElement('div');
    card.className = 'project-card';

    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-delete-btn';
    deleteBtn.title = 'Remove from list';
    deleteBtn.innerHTML = '×';
    deleteBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Remove "${failed.name}" from your list? The deck failed to load and will stop appearing.`)) {
            try {
                await removeRepository(failed.id);
                window.__failedRepos = (window.__failedRepos || []).filter(r => r.id !== failed.id);
                await loadRepositories();
            } catch (err) {
                alert(`Failed to remove: ${err.message}`);
            }
        }
    };
    btnContainer.appendChild(deleteBtn);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(failed.name)}</h3>
        <p class="project-description" style="color:#c00">Failed to load</p>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Render a dismissible notice above the grid listing repos that were auto-evicted
 * (either deleted on GitHub or transferred to a new owner/org).
 */
function renderEvictedNotice() {
    const evicted = window.__evictedRepos || [];
    if (evicted.length === 0) return;

    const grid = document.getElementById('topics-grid');
    if (!grid) return;

    // Avoid stacking notices if this function runs multiple times
    const existing = document.getElementById('evicted-notice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.id = 'evicted-notice';
    notice.className = 'evicted-notice';

    const items = evicted.map(r => {
        if (r.movedTo) return `<li><code>${escapeHtml(r.id)}</code> → <code>${escapeHtml(r.movedTo)}</code></li>`;
        return `<li><code>${escapeHtml(r.id)}</code></li>`;
    }).join('');

    notice.innerHTML = `
        <div class="evicted-notice-body">
            <strong>Removed ${evicted.length} deck${evicted.length !== 1 ? 's' : ''} that could no longer be loaded:</strong>
            <ul>${items}</ul>
            <p class="evicted-notice-hint">These were transferred or deleted. Re-add them from their new location if needed.</p>
        </div>
        <button class="evicted-notice-dismiss" title="Dismiss">×</button>
    `;

    notice.querySelector('.evicted-notice-dismiss').addEventListener('click', () => {
        window.__evictedRepos = [];
        notice.remove();
    });

    grid.parentNode.insertBefore(notice, grid);
    window.__evictedRepos = [];
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    const addBtn = document.getElementById('add-repo-btn');
    const repoInput = document.getElementById('github-repo-input');
    const createDeckBtn = document.getElementById('create-deck-btn');

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

    // Create Deck button
    if (createDeckBtn) {
        createDeckBtn.addEventListener('click', () => openDeckCreator());
    }

    // Collapsible sections
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.dataset.section;
            const content = document.getElementById(`${section}-content`);
            const icon = header.querySelector('.toggle-icon');

            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.style.transform = 'rotate(90deg)';
            } else {
                content.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
        });
    });

    // Search handler - context-aware (decks at home, folders/files inside a deck)
    const searchInput = document.getElementById('search-input');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (currentDeck) {
                // Inside a deck - filter folders and files
                renderCurrentLevel();
            } else {
                // At home - filter decks
                loadRepositories();
            }
        });
    }

    // Drill-all: start a random shuffled session across all loaded decks
    const drillAllBtn = document.getElementById('drill-all-btn');
    if (drillAllBtn) {
        drillAllBtn.addEventListener('click', () => startDrillAllSession());
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
 * Callback when a new deck is created
 */
async function onDeckCreated(deckId) {
    console.log(`[Main] New deck created: ${deckId}`);
    try {
        // Load the new repository
        await loadRepository(deckId);
        // Reload the display
        await loadRepositories();
    } catch (error) {
        console.error('[Main] Error loading new deck:', error);
        alert(`Deck created but failed to load: ${error.message}`);
    }
}

/**
 * Callback when a folder is created
 */
async function onFolderCreated(deckId, folderPath) {
    console.log(`[Main] Folder created: ${deckId}/${folderPath}`);
    try {
        // Reload the repository to get updated structure
        await loadRepository(deckId);
        // Refresh the current view
        if (currentDeck && currentDeck.id === deckId) {
            await navigateToDeck(currentDeck, currentPath, false);
        }
    } catch (error) {
        console.error('[Main] Error refreshing after folder creation:', error);
    }
}

/**
 * Callback when a card is saved
 */
async function onCardSaved(deckId, filePath) {
    console.log(`[Main] Card saved: ${deckId}/${filePath}`);
    try {
        // Reload the repository to get updated cards
        await loadRepository(deckId);
        // Refresh the current view
        if (currentDeck && currentDeck.id === deckId) {
            await navigateToDeck(currentDeck, currentPath, false);
        } else {
            await loadRepositories();
        }
    } catch (error) {
        console.error('[Main] Error refreshing after card save:', error);
    }
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
        let hasFlashcards;
        try {
            hasFlashcards = await hasFlashcardContent(owner, repo);
        } catch (accessError) {
            if (accessError.status === 404) {
                alert(`Repository "${repoString}" was not found or is not accessible.\n\nIf this repo lives in an organization, the flashcards OAuth app may not have access to that org. Grant access at:\nhttps://github.com/organizations/${owner}/settings/oauth_application_policy`);
            } else if (accessError.status === 403) {
                alert(`Access denied to "${repoString}". Check the OAuth app's org permissions, or wait if this is a rate limit.`);
            } else if (accessError.status === 401) {
                alert(`Authentication failed. Please log out and log back in.`);
            } else {
                alert(`Failed to check repository: ${accessError.message}`);
            }
            addBtn.textContent = originalText;
            addBtn.disabled = false;
            input.disabled = false;
            return;
        }

        if (!hasFlashcards) {
            alert(`Repository "${repoString}" must have a flashcards/ folder containing markdown files with Q:/A:/C:/P: format. Please check the repository structure and try again.`);
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
 * Reset all cards in a deck - marks all as due for review
 */
async function resetDeck(deckId) {
    const { refreshDeck } = await import('./storage.js');
    await refreshDeck(deckId);
    console.log(`Refreshed all cards in deck: ${deckId}`);

    // Reload repositories to update due counts
    await loadRepositories();
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
 * Load all local collection repos from public/collection/
 */
export async function loadLocalCollectionRepos() {
    try {
        console.log('[Main] Loading local collection repos...');

        // Load the collection index
        const indexResponse = await fetch(`${import.meta.env.BASE_URL}collection/index.json`);
        if (!indexResponse.ok) {
            console.log('[Main] No collection index found');
            return;
        }

        const index = await indexResponse.json();
        console.log(`[Main] Found ${index.repos.length} repos in collection`);

        const grid = document.getElementById('topics-grid');

        // Load each repo from the index
        for (let i = 0; i < index.repos.length; i++) {
            const repoInfo = index.repos[i];

            // Update loading status with specific deck name and progress
            if (grid) {
                grid.innerHTML = `<div class="loading">Loading ${repoInfo.name}... (${i + 1}/${index.repos.length})</div>`;
            }

            await loadLocalRepo(repoInfo);
        }

        console.log(`[Main] Loaded all local collection repos`);
    } catch (error) {
        console.error('[Main] Failed to load local collection repos:', error);
    }
}

/**
 * Load a single local repo from public/collection/
 */
async function loadLocalRepo(repoInfo) {
    try {
        console.log(`[Main] Loading local repo: ${repoInfo.name}`);

        const allCards = [];
        let firstMetadata = null;

        // Load each markdown file in the repo
        for (const file of repoInfo.files) {
            const filePath = `${import.meta.env.BASE_URL}collection/${repoInfo.name}/${file}`;
            const response = await fetch(filePath);

            if (!response.ok) {
                console.warn(`[Main] Failed to fetch ${filePath}: ${response.status}`);
                continue;
            }

            const markdown = await response.text();
            const { cards, metadata } = parseDeck(markdown, file);

            // Save first metadata we encounter
            if (!firstMetadata && metadata) {
                firstMetadata = metadata;
            }

            // Add cards with proper deck info
            const cardsWithMeta = cards.map(card => {
                const hash = hashCard(card);
                return {
                    ...card,
                    hash,
                    deckName: `local/${repoInfo.name}`,
                    deckMetadata: metadata || firstMetadata,
                    source: {
                        repo: `local/${repoInfo.name}`,
                        file
                    }
                };
            });

            allCards.push(...cardsWithMeta);
        }

        if (allCards.length > 0) {
            await saveCards(allCards);
            await saveRepoMetadata({
                id: `local/${repoInfo.name}`,
                name: firstMetadata?.name || repoInfo.name,
                repo: `local/${repoInfo.name}`,
                cardCount: allCards.length,
                fileCount: repoInfo.files.length,
                createdAt: new Date().toISOString(),
                ...(firstMetadata?.subject && { subject: firstMetadata.subject }),
                ...(firstMetadata?.topic && { topic: firstMetadata.topic })
            });

            console.log(`[Main] Loaded ${allCards.length} cards from local repo: ${repoInfo.name}`);
        }
    } catch (error) {
        console.error(`[Main] Failed to load local repo ${repoInfo.name}:`, error);
    }
}

// Deck navigation state (inline breadcrumb navigation)
let currentCategory = null; // The currently selected category folder (null = at home level)
let currentDeck = null;
let currentPath = [];
let folderHierarchy = null;
let allReviewsCache = null; // Cache for reviews during navigation
let isInStudySession = false; // Track if we're in study mode
let currentStudyFile = null; // The file being studied (for breadcrumb)
let isDrillAll = false; // Track if we're in a cross-deck drill-all session

/**
 * Restore navigation state from URL parameters
 */
async function restoreNavigationFromURL() {
    const url = new URL(window.location);
    const deckId = url.searchParams.get('deck');
    const pathParam = url.searchParams.get('path');
    const studyParam = url.searchParams.get('study');
    const fileParam = url.searchParams.get('file');
    const categoryParam = url.searchParams.get('category');

    console.log('[Navigation] restoreNavigationFromURL called:', {
        fullURL: window.location.href,
        deckId,
        pathParam,
        studyParam,
        fileParam,
        categoryParam,
        historyLength: history.length
    });

    if (deckId) {
        // Find the deck object
        const allDecks = await getAllDecks();
        console.log('[Navigation] Looking for deck:', deckId, 'in', allDecks.map(d => d.id));
        const deck = allDecks.find(d => d.id === deckId);
        currentCategory = categoryParam || null;

        if (deck) {
            console.log('[Navigation] Found deck, restoring navigation');
            const path = pathParam ? pathParam.split('/') : [];
            // Use updateHistory=false since we're restoring, not navigating
            await navigateToDeck(deck, path, false);

            // If study session was active, restore it
            if (studyParam === 'true' && fileParam) {
                console.log('[Navigation] Restoring study session for file:', fileParam);
                const displayName = fileParam.split('/').pop().replace('.md', '');
                isInStudySession = true;
                currentStudyFile = displayName;

                const topicsGrid = document.getElementById('topics-grid');
                const studyArea = document.getElementById('study-area');
                const sessionComplete = document.getElementById('session-complete');

                topicsGrid.classList.add('hidden');
                studyArea.classList.remove('hidden');
                sessionComplete.classList.add('hidden');

                setupStudyEventListeners();
                updateDeckBreadcrumb();
                await startSession(deck.id, fileParam, onSessionComplete);
            }
        } else {
            console.log('[Navigation] Deck not found!');
        }
    } else if (categoryParam) {
        currentCategory = categoryParam;
        await loadRepositories();
    } else {
        console.log('[Navigation] No deck in URL, showing home');
    }
}

/**
 * Handle browser back/forward navigation
 */
async function handlePopState(event) {
    const state = event.state;

    // Clear search on any navigation
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // If we're in a study session and navigating away, clean up
    if (isInStudySession) {
        isInStudySession = false;
        currentStudyFile = null;
        cleanupStudySession();
        removeStudyEventListeners();

        // Hide study UI
        const topicsGrid = document.getElementById('topics-grid');
        const studyArea = document.getElementById('study-area');
        const sessionComplete = document.getElementById('session-complete');
        studyArea.classList.add('hidden');
        sessionComplete.classList.add('hidden');
        topicsGrid.classList.remove('hidden');
    }

    if (state && state.deck) {
        // Find the deck object
        const allDecks = await getAllDecks();
        const deck = allDecks.find(d => d.id === state.deck);
        currentCategory = state.category || null;

        if (deck) {
            const path = state.path || [];


            // Check if we're navigating to a study session
            if (state.study && state.file) {
                // First navigate to the deck/path
                await navigateToDeck(deck, path, false);
                // Then start study session (without pushing history)
                isInStudySession = true;
                currentStudyFile = state.file.replace('.md', '');

                const topicsGrid = document.getElementById('topics-grid');
                const studyArea = document.getElementById('study-area');
                const sessionComplete = document.getElementById('session-complete');

                topicsGrid.classList.add('hidden');
                studyArea.classList.remove('hidden');
                sessionComplete.classList.add('hidden');

                setupStudyEventListeners();
                updateDeckBreadcrumb();
                await startSession(deck.id, state.file, onSessionComplete);
            } else {
                // Use updateHistory=false to avoid pushing duplicate history entry
                await navigateToDeck(deck, path, false);
            }
        }
    } else {
        // No deck in state - show home view
        currentCategory = state?.category || null;
        currentDeck = null;
        currentPath = [];
        folderHierarchy = null;
        allReviewsCache = null;

        await loadRepositories();
    }
}

/**
 * Build folder hierarchy from file paths
 * Returns a tree structure: { folders: {}, files: {} }
 * Skips the "flashcards/" prefix if all files start with it
 */
function buildFolderHierarchy(fileGroups) {
    const root = { folders: {}, files: {} };

    // Check if all files start with "flashcards/"
    const allPaths = Object.keys(fileGroups);
    const allStartWithFlashcards = allPaths.every(path => path.startsWith('flashcards/'));

    for (const [filePath, cards] of Object.entries(fileGroups)) {
        // Remove "flashcards/" prefix if all files have it
        let normalizedPath = filePath;
        if (allStartWithFlashcards && filePath.startsWith('flashcards/')) {
            normalizedPath = filePath.substring(11); // Remove "flashcards/"
        }

        const parts = normalizedPath.split('/');
        let current = root;

        // Navigate through folders
        for (let i = 0; i < parts.length - 1; i++) {
            const folderName = parts[i];
            if (!current.folders[folderName]) {
                current.folders[folderName] = { folders: {}, files: {} };
            }
            current = current.folders[folderName];
        }

        // Add file at the end
        const fileName = parts[parts.length - 1];
        current.files[fileName] = cards;
    }

    return root;
}

/**
 * Get content at a specific path in the hierarchy
 */
function getContentAtPath(hierarchy, path) {
    let current = hierarchy;
    for (const segment of path) {
        if (current.folders[segment]) {
            current = current.folders[segment];
        } else {
            return null;
        }
    }
    return current;
}

/**
 * Navigate into a deck (inline breadcrumb navigation, replaces modal)
 */
async function navigateToDeck(deck, path = [], updateHistory = true) {
    currentDeck = deck;
    currentPath = path;

    // Update URL to persist navigation state
    if (updateHistory) {
        const url = new URL(window.location);
        url.searchParams.set('deck', deck.id);
        if (path.length > 0) {
            url.searchParams.set('path', path.join('/'));
        } else {
            url.searchParams.delete('path');
        }
        console.log('[Navigation] pushState:', url.toString(), 'historyLength before:', history.length);
        // Use pushState to create a new history entry
        // When user navigates to app.html and presses back, they return to this URL
        history.pushState({ deck: deck.id, path: [...path], category: currentCategory }, '', url);
        console.log('[Navigation] historyLength after:', history.length);
    }

    // Show search bar (keep same placeholder)
    const controlsBar = document.getElementById('controls-bar');
    const searchInput = document.getElementById('search-input');
    controlsBar.classList.remove('hidden');
    if (searchInput) {
        searchInput.value = ''; // Clear search when navigating
    }

    // Get all cards for this deck and group by file
    const allCards = await getAllCards();
    const deckCards = allCards.filter(c => c.deckName === deck.id);
    allReviewsCache = await getAllReviews();

    // Group cards by file
    const fileGroups = {};
    deckCards.forEach(card => {
        const fileName = card.source?.file || 'unknown';
        if (!fileGroups[fileName]) {
            fileGroups[fileName] = [];
        }
        fileGroups[fileName].push(card);
    });

    // Build folder hierarchy
    folderHierarchy = buildFolderHierarchy(fileGroups);

    // Update breadcrumb and render content inline
    updateDeckBreadcrumb();
    renderCurrentLevel();
}

/**
 * Update the deck navigation breadcrumb
 */
function updateDeckBreadcrumb() {
    const breadcrumb = document.getElementById('deck-breadcrumb');
    breadcrumb.classList.remove('hidden');
    breadcrumb.innerHTML = '';

    const tildeSpan = document.createElement('span');
    tildeSpan.className = 'breadcrumb-separator';
    tildeSpan.textContent = '~';
    breadcrumb.appendChild(tildeSpan);
    breadcrumb.appendChild(createBreadcrumbSeparator());

    // "home" segment
    const homeSpan = document.createElement('span');
    const homeClickable = currentDeck !== null || currentCategory !== null || isDrillAll;
    homeSpan.className = 'breadcrumb-segment' + (homeClickable ? ' breadcrumb-clickable' : ' current');
    homeSpan.textContent = 'home';
    if (homeClickable) {
        homeSpan.onclick = () => {
            if (isDrillAll) {
                exitStudySession();
                return;
            }
            if (isInStudySession) exitStudySession(true);
            exitDeckNavigation();
        };
    }
    breadcrumb.appendChild(homeSpan);

    // Drill-all tail
    if (isDrillAll && !currentDeck) {
        breadcrumb.appendChild(createBreadcrumbSeparator());
        const drillSegment = document.createElement('span');
        drillSegment.className = 'breadcrumb-segment current';
        drillSegment.textContent = 'drill all';
        breadcrumb.appendChild(drillSegment);
        return;
    }

    // Category segment (if inside a category)
    if (currentCategory) {
        breadcrumb.appendChild(createBreadcrumbSeparator());
        const catSegment = document.createElement('span');
        // Clickable if we're also inside a deck
        const catClickable = currentDeck !== null;
        catSegment.className = 'breadcrumb-segment' + (catClickable ? ' breadcrumb-clickable' : ' current');
        catSegment.textContent = currentCategory;
        if (catClickable) {
            catSegment.onclick = () => {
                if (isInStudySession) exitStudySession(true);
                exitToCategoryView();
            };
        }
        breadcrumb.appendChild(catSegment);
    }

    // Deck segment (if inside a deck)
    if (currentDeck) {
        breadcrumb.appendChild(createBreadcrumbSeparator());
        const repoName = currentDeck.id.split('/').pop();
        const deckSegment = document.createElement('span');
        const isDeckClickable = currentPath.length > 0 || isInStudySession;
        deckSegment.className = 'breadcrumb-segment' + (isDeckClickable ? ' breadcrumb-clickable' : ' current');
        deckSegment.textContent = repoName;
        if (isDeckClickable) {
            deckSegment.onclick = () => {
                if (isInStudySession) exitStudySession();
                navigateToPath([]);
            };
        }
        breadcrumb.appendChild(deckSegment);

        // Folder path segments
        currentPath.forEach((folder, index) => {
            breadcrumb.appendChild(createBreadcrumbSeparator());
            const segment = document.createElement('span');
            const isLast = index === currentPath.length - 1 && !isInStudySession;
            segment.className = 'breadcrumb-segment' + (!isLast ? ' breadcrumb-clickable' : ' current');
            segment.textContent = folder;
            if (!isLast) {
                segment.onclick = () => {
                    if (isInStudySession) exitStudySession();
                    navigateToPath(currentPath.slice(0, index + 1));
                };
            }
            breadcrumb.appendChild(segment);
        });

        if (isInStudySession && currentStudyFile) {
            breadcrumb.appendChild(createBreadcrumbSeparator());
            const fileSegment = document.createElement('span');
            fileSegment.className = 'breadcrumb-segment current';
            fileSegment.textContent = currentStudyFile;
            breadcrumb.appendChild(fileSegment);
        }
    }
}

/**
 * Create a breadcrumb separator element
 */
function createBreadcrumbSeparator() {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-separator';
    sep.textContent = '/';
    return sep;
}

/**
 * Render the current level of folders/files in the main grid
 */
function renderCurrentLevel() {
    const grid = document.getElementById('topics-grid');
    grid.innerHTML = '';

    const content = getContentAtPath(folderHierarchy, currentPath);
    if (!content) {
        console.error('Invalid path:', currentPath);
        return;
    }

    // Get search term for filtering
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';

    // Show folders first (filtered by search)
    const sortedFolders = Object.keys(content.folders).sort();
    for (const folderName of sortedFolders) {
        // Filter by search term
        if (searchTerm && !folderName.toLowerCase().includes(searchTerm)) {
            continue;
        }
        const folderCard = createFolderCard(folderName, content.folders[folderName], allReviewsCache);
        grid.appendChild(folderCard);
    }

    // Then show files (filtered by search)
    const sortedFiles = Object.keys(content.files).sort();
    for (const fileName of sortedFiles) {
        // Filter by search term (match filename without .md)
        const displayName = fileName.replace('.md', '');
        if (searchTerm && !displayName.toLowerCase().includes(searchTerm)) {
            continue;
        }

        const cards = content.files[fileName];
        const fileReviews = allReviewsCache.filter(r => {
            const card = cards.find(c => c.hash === r.cardHash);
            return !!card;
        });

        // Build full file path for subdeck
        const fullPath = [...currentPath, fileName].join('/');
        const subdeckData = {
            id: `${currentDeck.id}/${fullPath}`,
            fileName: fileName,
            fullPath: fullPath,
            deckId: currentDeck.id,
            cards: cards,
            reviews: new Map(fileReviews.map(r => [r.cardHash, r]))
        };

        const subdeckCard = createSubdeckCard(subdeckData);
        grid.appendChild(subdeckCard);
    }

    // Show message if no results after filtering
    if (grid.children.length === 0 && searchTerm) {
        grid.innerHTML = '<div class="loading">No matches found</div>';
    }
}

/**
 * Exit deck navigation and return to deck list
 */
function exitDeckNavigation() {
    currentDeck = null;
    currentCategory = null;
    currentPath = [];
    folderHierarchy = null;
    allReviewsCache = null;

    // Clear search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // Clear URL parameters and add to history
    const url = new URL(window.location);
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    // Use pushState so this becomes a new history entry
    history.pushState({}, '', url);

    loadRepositories();
}

/**
 * Start an inline study session
 */
async function startStudySession(deckId, fileFilter, displayFileName) {
    isInStudySession = true;
    currentStudyFile = displayFileName;

    // Update URL with study state
    const url = new URL(window.location);
    url.searchParams.set('study', 'true');
    url.searchParams.set('file', fileFilter);
    history.pushState({
        deck: currentDeck.id,
        path: [...currentPath],
        study: true,
        file: fileFilter
    }, '', url);

    // Update breadcrumb to show filename
    updateDeckBreadcrumb();

    // Hide topics grid, show study area
    const topicsGrid = document.getElementById('topics-grid');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    topicsGrid.classList.add('hidden');
    studyArea.classList.remove('hidden');
    sessionComplete.classList.add('hidden');

    // Setup event listeners for study session
    setupStudyEventListeners();

    // Callback when current card changes - update breadcrumb with file name
    const onCardChange = (card) => {
        if (card && card.source?.file) {
            // Extract filename without extension from card's source
            const filePath = card.source.file;
            const fileName = filePath.split('/').pop().replace('.md', '');
            currentStudyFile = fileName;
            updateDeckBreadcrumb();
        }
    };

    // Start the session
    await startSession(deckId, fileFilter, onSessionComplete, onCardChange);
}

/**
 * Start a drill-all session (random cards pooled across every loaded deck)
 * @param {string|null} subject - Optional category subject filter
 */
async function startDrillAllSession(subject = null) {
    const allCards = await getAllCards();
    if (allCards.length === 0) {
        alert('No cards loaded. Add a deck first.');
        return;
    }

    isInStudySession = true;
    isDrillAll = true;
    currentStudyFile = subject ? `drill ${subject.toLowerCase()}` : 'drill all';

    const topicsGrid = document.getElementById('topics-grid');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    topicsGrid.classList.add('hidden');
    studyArea.classList.remove('hidden');
    sessionComplete.classList.add('hidden');

    updateDeckBreadcrumb();
    setupStudyEventListeners();

    await startDrillSession(onSessionComplete, () => {}, { maxCards: 50, subject });
}

/**
 * Exit study session and return to folder view
 * @param {boolean} skipRender - If true, skip rendering (used when navigating away entirely)
 */
async function exitStudySession(skipRender = false) {
    const wasDrillAll = isDrillAll;

    isInStudySession = false;
    currentStudyFile = null;
    isDrillAll = false;

    // Cleanup study session state
    cleanupStudySession();

    // Remove study listeners
    removeStudyEventListeners();

    // Hide study area, show topics grid
    const topicsGrid = document.getElementById('topics-grid');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    studyArea.classList.add('hidden');
    sessionComplete.classList.add('hidden');
    topicsGrid.classList.remove('hidden');

    // If skipping render, just cleanup and return (used when navigating to home)
    if (skipRender) {
        return;
    }

    // Drill-all runs from the home level with no currentDeck — always return home
    if (wasDrillAll || !currentDeck) {
        updateDeckBreadcrumb();
        await loadRepositories();
        return;
    }

    // Update URL - remove study params but keep deck/path
    const url = new URL(window.location);
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    history.pushState({ deck: currentDeck.id, path: [...currentPath] }, '', url);

    // Update breadcrumb (removes filename)
    updateDeckBreadcrumb();

    // Refresh reviews cache to get updated progress from study session
    allReviewsCache = await getAllReviews();

    // Refresh the folder view to show updated progress
    renderCurrentLevel();
}

/**
 * Called when study session is complete
 */
function onSessionComplete() {
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    studyArea.classList.add('hidden');
    sessionComplete.classList.remove('hidden');
}

/**
 * Setup event listeners for study mode
 */
function setupStudyEventListeners() {
    // Reveal button
    const revealBtn = document.getElementById('reveal-btn');
    if (revealBtn) {
        revealBtn.onclick = revealAnswer;
    }

    // Grade buttons
    document.querySelectorAll('.grade-btn').forEach(btn => {
        btn.onclick = () => {
            const grade = parseInt(btn.dataset.grade);
            gradeCard(grade);
        };
    });

    // Keyboard listener
    document.addEventListener('keydown', handleStudyKeydown);
}

/**
 * Remove study event listeners
 */
function removeStudyEventListeners() {
    document.removeEventListener('keydown', handleStudyKeydown);
}

/**
 * Handle keyboard events during study session
 */
function handleStudyKeydown(event) {
    if (!isInStudySession) return;

    const state = getState();

    if (event.code === 'Space') {
        event.preventDefault();
        if (!state.isRevealed) {
            revealAnswer();
        }
    } else if (state.isRevealed && GradeKeys[event.key]) {
        event.preventDefault();
        gradeCard(GradeKeys[event.key]);
    }
}

/**
 * Navigate to a folder (inline breadcrumb navigation)
 */
function navigateToFolder(folderName) {
    currentPath.push(folderName);

    // Clear search when navigating to a folder
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // Update URL to persist navigation state
    const url = new URL(window.location);
    url.searchParams.set('path', currentPath.join('/'));
    console.log('[Navigation] navigateToFolder pushState:', url.toString());
    // Use pushState to create a new history entry for folder navigation
    history.pushState({ deck: currentDeck.id, path: [...currentPath], category: currentCategory }, '', url);

    updateDeckBreadcrumb();
    renderCurrentLevel();
}

/**
 * Navigate to a specific path (for breadcrumb clicks)
 */
function navigateToPath(targetPath) {
    currentPath = [...targetPath];

    // Clear search when navigating via breadcrumb
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // Update URL to persist navigation state
    const url = new URL(window.location);
    if (targetPath.length > 0) {
        url.searchParams.set('path', targetPath.join('/'));
    } else {
        url.searchParams.delete('path');
    }
    // Use pushState to create a new history entry for breadcrumb navigation
    history.pushState({ deck: currentDeck.id, path: [...currentPath], category: currentCategory }, '', url);

    updateDeckBreadcrumb();
    renderCurrentLevel();
}

/**
 * Create a folder card element
 */
function createFolderCard(folderName, folderContent, allReviews) {
    // Recursively count all cards in this folder and subfolders
    function countCardsInFolder(content) {
        let total = 0;

        // Count cards in files
        for (const cards of Object.values(content.files)) {
            total += cards.length;
        }

        // Count cards in subfolders
        for (const subfolder of Object.values(content.folders)) {
            total += countCardsInFolder(subfolder);
        }

        return total;
    }

    // Recursively get all cards in this folder and subfolders
    function getAllCardsInFolder(content) {
        let allCards = [];

        // Get cards from files
        for (const cards of Object.values(content.files)) {
            allCards.push(...cards);
        }

        // Get cards from subfolders
        for (const subfolder of Object.values(content.folders)) {
            allCards.push(...getAllCardsInFolder(subfolder));
        }

        return allCards;
    }

    // Count reviewed cards in this folder (cards that have been reviewed at least once)
    function countReviewedCardsInFolder(content) {
        let reviewedCount = 0;

        // Count reviewed cards in files
        for (const cards of Object.values(content.files)) {
            reviewedCount += cards.filter(card => allReviews.find(r => r.cardHash === card.hash)).length;
        }

        // Count reviewed cards in subfolders
        for (const subfolder of Object.values(content.folders)) {
            reviewedCount += countReviewedCardsInFolder(subfolder);
        }

        return reviewedCount;
    }

    const totalCards = countCardsInFolder(folderContent);
    const reviewedCards = countReviewedCardsInFolder(folderContent);
    const allCardsInFolder = getAllCardsInFolder(folderContent);

    const card = document.createElement('div');
    card.className = 'project-card folder-card';
    card.style.cursor = 'pointer';
    card.onclick = () => navigateToFolder(folderName);

    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Add reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Reset all cards in "${folderName}"? This will mark all cards as due for review.`)) {
            // Build folder path
            const folderPath = [...currentPath, folderName].join('/');
            const { refreshDeck } = await import('./storage.js');
            await refreshDeck(currentDeck.id, folderPath);
            // Refresh reviews cache and re-render
            allReviewsCache = await getAllReviews();
            renderCurrentLevel();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Add review button (gavel)
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'card-review-btn';
    reviewBtn.title = 'Review';
    reviewBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Build folder path for filtering and start inline study session
        const folderPath = [...currentPath, folderName].join('/');
        startStudySession(currentDeck.id, folderPath, folderName);
    };
    btnContainer.appendChild(reviewBtn);

    // No delete button for folders - managed via git

    // Calculate progress percentage (cards reviewed at least once)
    const progressPercent = totalCards > 0 ? Math.round((reviewedCards / totalCards) * 100) : 0;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(folderName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
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
    card.className = 'project-card file-card';
    card.style.cursor = 'pointer'; // File cards are clickable to start review
    card.onclick = () => {
        // Start inline study session (no page navigation)
        const displayName = subdeck.fileName.replace('.md', '');
        startStudySession(subdeck.deckId, subdeck.fullPath, displayName);
    };

    // Extract just the filename from the path
    const displayName = subdeck.fileName.split('/').pop().replace('.md', '');
    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Add reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Reset all cards in "${displayName}"? This will mark all cards as due for review.`)) {
            // Use file path for filtering
            const { refreshDeck } = await import('./storage.js');
            await refreshDeck(subdeck.deckId, subdeck.fullPath);
            // Refresh reviews cache and re-render
            allReviewsCache = await getAllReviews();
            renderCurrentLevel();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Calculate progress percentage (cards reviewed at least once)
    const progressPercent = totalCards > 0 ? Math.round((reviewedCards / totalCards) * 100) : 0;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(displayName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

// Initialize on load - only if topics-grid element exists (i.e., we're on index.html)
if (document.getElementById('topics-grid')) {
    init();
}

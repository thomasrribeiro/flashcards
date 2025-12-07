/**
 * Main entry point for topic listing page
 */

import { initDB, getAllCards, getAllReviews, getStats, getAllRepos, getAllDecks, getAllTopics, clearReviewsByDeck, saveCards, saveRepoMetadata } from './storage.js';
import { loadRepository, removeRepository } from './repo-manager.js';
import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';
import { getAuthenticatedUser, getUserRepositories } from './github-client.js';
import { githubAuth } from './github-auth.js';
import { startSession, revealAnswer, gradeCard, getState, cleanup as cleanupStudySession, GradeKeys } from './study-session.js';

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
    const { loadRepository } = await import('./repo-manager.js');

    const repos = await loadReposFromD1();
    if (!repos || repos.length === 0) {
        console.log('[Main] No repos found in D1');
        return;
    }

    console.log(`[Main] Loading ${repos.length} repos from D1:`, repos.map(r => r.id));

    for (const repo of repos) {
        try {
            await loadRepository(repo.id);
            console.log(`[Main] Loaded repo: ${repo.id}`);
        } catch (error) {
            console.error(`[Main] Failed to load repo ${repo.id}:`, error);
        }
    }

    // Clean up orphaned reviews after loading all repos
    const { cleanupOrphanedReviews } = await import('./storage.js');
    const cleaned = await cleanupOrphanedReviews();
    if (cleaned > 0) {
        console.log(`[Main] Cleaned up ${cleaned} orphaned reviews`);
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

        // Apply search filter
        const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
        let filteredDecks = displayDecks.filter(deck => {
            // Search by the displayed repo name (last part of local/name or owner/repo)
            const displayName = deck.id.split('/').pop();
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

        // Show breadcrumb (displays "~ / home" on initial load)
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

                    // Re-render the UI instead of reloading
                    console.log('[Main] Re-rendering UI after deletion');
                    await loadRepositories();
                } catch (error) {
                    console.error('[Main] Error deleting deck:', error);
                    alert(`Failed to delete deck: ${error.message}`);
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

        // Load each repo from the index
        for (const repoInfo of index.repos) {
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
let currentDeck = null;
let currentPath = [];
let folderHierarchy = null;
let allReviewsCache = null; // Cache for reviews during navigation
let isInStudySession = false; // Track if we're in study mode
let currentStudyFile = null; // The file being studied (for breadcrumb)

/**
 * Restore navigation state from URL parameters
 */
async function restoreNavigationFromURL() {
    const url = new URL(window.location);
    const deckId = url.searchParams.get('deck');
    const pathParam = url.searchParams.get('path');
    const studyParam = url.searchParams.get('study');
    const fileParam = url.searchParams.get('file');

    console.log('[Navigation] restoreNavigationFromURL called:', {
        fullURL: window.location.href,
        deckId,
        pathParam,
        studyParam,
        fileParam,
        historyLength: history.length
    });

    if (deckId) {
        // Find the deck object
        const allDecks = await getAllDecks();
        console.log('[Navigation] Looking for deck:', deckId, 'in', allDecks.map(d => d.id));
        const deck = allDecks.find(d => d.id === deckId);

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
        history.pushState({ deck: deck.id, path: [...path] }, '', url);
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

    // Always show breadcrumb
    breadcrumb.classList.remove('hidden');
    breadcrumb.innerHTML = '';

    // Add "~ /" prefix like the main breadcrumb
    const tildeSpan = document.createElement('span');
    tildeSpan.className = 'breadcrumb-separator';
    tildeSpan.textContent = '~';
    breadcrumb.appendChild(tildeSpan);

    breadcrumb.appendChild(createBreadcrumbSeparator());

    // "home" segment - clickable if we're inside a deck, current otherwise
    const homeSpan = document.createElement('span');
    if (currentDeck) {
        homeSpan.className = 'breadcrumb-segment breadcrumb-clickable';
        homeSpan.onclick = () => {
            if (isInStudySession) {
                // Skip render since we're navigating away entirely
                exitStudySession(true);
            }
            exitDeckNavigation();
        };
    } else {
        homeSpan.className = 'breadcrumb-segment current';
    }
    homeSpan.textContent = 'home';
    breadcrumb.appendChild(homeSpan);

    // If we're inside a deck, show deck name and path
    if (currentDeck) {
        // Separator
        breadcrumb.appendChild(createBreadcrumbSeparator());

        // Deck name (clickable if we're in a subfolder or study session)
        const repoName = currentDeck.id.split('/').pop();
        const deckSegment = document.createElement('span');
        const isDeckClickable = currentPath.length > 0 || isInStudySession;
        deckSegment.className = 'breadcrumb-segment' + (isDeckClickable ? ' breadcrumb-clickable' : ' current');
        deckSegment.textContent = repoName;
        if (isDeckClickable) {
            deckSegment.onclick = () => {
                if (isInStudySession) {
                    exitStudySession();
                }
                navigateToPath([]);
            };
        }
        breadcrumb.appendChild(deckSegment);

        // Folder path segments
        currentPath.forEach((folder, index) => {
            breadcrumb.appendChild(createBreadcrumbSeparator());
            const segment = document.createElement('span');
            const isLast = index === currentPath.length - 1 && !isInStudySession;
            const isClickable = !isLast;
            segment.className = 'breadcrumb-segment' + (isClickable ? ' breadcrumb-clickable' : ' current');
            segment.textContent = folder;
            if (isClickable) {
                segment.onclick = () => {
                    if (isInStudySession) {
                        exitStudySession();
                    }
                    navigateToPath(currentPath.slice(0, index + 1));
                };
            }
            breadcrumb.appendChild(segment);
        });

        // If in study session, add the filename as the last segment
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
 * Exit study session and return to folder view
 * @param {boolean} skipRender - If true, skip rendering (used when navigating away entirely)
 */
async function exitStudySession(skipRender = false) {
    isInStudySession = false;
    currentStudyFile = null;

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
    history.pushState({ deck: currentDeck.id, path: [...currentPath] }, '', url);

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
    history.pushState({ deck: currentDeck.id, path: [...currentPath] }, '', url);

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

    // No gavel button - clicking the card starts review
    // No delete button for files - managed via git

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

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

    if (true) {
        card.style.cursor = 'pointer';
        card.onclick = () => openSubdeckModal(deck);
    } else {
        card.style.cursor = 'default';
    }

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
    resetBtn.title = 'Reset all cards in this deck';
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
    reviewBtn.title = 'Review this deck';
    reviewBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = `app.html?deck=${encodeURIComponent(deck.id)}`;
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

// Modal navigation state
let currentDeck = null;
let currentPath = [];
let folderHierarchy = null;

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
 * Open modal to show subdecks with hierarchical navigation
 */
async function openSubdeckModal(deck, path = []) {
    currentDeck = deck;
    currentPath = path;

    const modal = document.getElementById('subdeck-modal');
    const modalDeckName = document.getElementById('modal-deck-name');
    const breadcrumb = document.getElementById('modal-breadcrumb');
    const backBtn = document.getElementById('modal-back-btn');
    const subdeckGrid = document.getElementById('subdeck-grid');

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

    // Build folder hierarchy
    folderHierarchy = buildFolderHierarchy(fileGroups);

    // Update modal content based on current path
    await updateModalContent(allReviews);

    // Show modal
    modal.classList.remove('hidden');
}

/**
 * Update modal content based on current navigation path
 */
async function updateModalContent(allReviews) {
    const breadcrumb = document.getElementById('modal-breadcrumb');
    const subdeckGrid = document.getElementById('subdeck-grid');

    // Update breadcrumb with clickable segments
    const repoName = currentDeck.id.split('/').pop();
    breadcrumb.innerHTML = '';

    // Add repo name (clickable to go to root)
    const repoSpan = document.createElement('span');
    repoSpan.className = 'breadcrumb-segment breadcrumb-clickable';
    repoSpan.textContent = repoName;
    repoSpan.onclick = () => navigateToPath([]);
    breadcrumb.appendChild(repoSpan);

    // Add each folder in the path
    for (let i = 0; i < currentPath.length; i++) {
        // Add separator
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = ' / ';
        breadcrumb.appendChild(separator);

        // Add folder segment (clickable to navigate to that level)
        const folderSpan = document.createElement('span');
        folderSpan.className = 'breadcrumb-segment breadcrumb-clickable';
        folderSpan.textContent = currentPath[i];
        const targetPath = currentPath.slice(0, i + 1);
        folderSpan.onclick = () => navigateToPath(targetPath);
        breadcrumb.appendChild(folderSpan);
    }

    // Get content at current path
    const content = getContentAtPath(folderHierarchy, currentPath);
    if (!content) {
        console.error('Invalid path:', currentPath);
        return;
    }

    // Clear and populate subdeck grid
    subdeckGrid.innerHTML = '';

    // Show folders first
    const sortedFolders = Object.keys(content.folders).sort();
    for (const folderName of sortedFolders) {
        const folderCard = createFolderCard(folderName, content.folders[folderName], allReviews);
        subdeckGrid.appendChild(folderCard);
    }

    // Then show files
    const sortedFiles = Object.keys(content.files).sort();
    for (const fileName of sortedFiles) {
        const cards = content.files[fileName];
        const fileReviews = allReviews.filter(r => {
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
        subdeckGrid.appendChild(subdeckCard);
    }
}

/**
 * Navigate to a folder
 */
async function navigateToFolder(folderName) {
    currentPath.push(folderName);
    const allReviews = await getAllReviews();
    await updateModalContent(allReviews);
}

/**
 * Navigate to a specific path (for breadcrumb clicks)
 */
async function navigateToPath(targetPath) {
    currentPath = [...targetPath];
    const allReviews = await getAllReviews();
    await updateModalContent(allReviews);
}

/**
 * Navigate back to parent folder
 */
async function navigateBack() {
    if (currentPath.length > 0) {
        currentPath.pop();
        const allReviews = await getAllReviews();
        await updateModalContent(allReviews);
    }
}

/**
 * Close subdeck modal
 */
function closeSubdeckModal() {
    const modal = document.getElementById('subdeck-modal');
    modal.classList.add('hidden');
    // Reset navigation state
    currentPath = [];
    currentDeck = null;
    folderHierarchy = null;
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

    // Count due cards in this folder
    function countDueCardsInFolder(content) {
        let dueCount = 0;
        const now = new Date();

        // Helper to check if a card is due
        function isCardDue(card) {
            const review = allReviews.find(r => r.cardHash === card.hash);
            if (!review) {
                // New card - always due
                return true;
            }
            // Reviewed card - check if due
            return new Date(review.fsrsCard.due) <= now;
        }

        // Count due cards in files
        for (const cards of Object.values(content.files)) {
            dueCount += cards.filter(isCardDue).length;
        }

        // Count due cards in subfolders
        for (const subfolder of Object.values(content.folders)) {
            dueCount += countDueCardsInFolder(subfolder);
        }

        return dueCount;
    }

    const totalCards = countCardsInFolder(folderContent);
    const dueCards = countDueCardsInFolder(folderContent);
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
    resetBtn.title = 'Reset all cards in this folder';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Reset all cards in "${folderName}"? This will mark all cards as due for review.`)) {
            // Build folder path
            const folderPath = [...currentPath, folderName].join('/');
            const { refreshDeck } = await import('./storage.js');
            await refreshDeck(currentDeck.id, folderPath);
            const allReviewsUpdated = await getAllReviews();
            await updateModalContent(allReviewsUpdated);
        }
    };
    btnContainer.appendChild(resetBtn);

    // Add review button (gavel)
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'card-review-btn';
    reviewBtn.title = 'Review this folder';
    reviewBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Build folder path for filtering
        const folderPath = [...currentPath, folderName].join('/');
        window.location.href = `app.html?deck=${encodeURIComponent(currentDeck.id)}&folder=${encodeURIComponent(folderPath)}`;
    };
    btnContainer.appendChild(reviewBtn);

    // No delete button for folders - managed via git

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(folderName)}</h3>
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
    card.style.cursor = 'default'; // File cards are not clickable (only buttons are)

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
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Reset all cards in "${displayName}"? This will mark all cards as due for review.`)) {
            // Use file path for filtering
            const { refreshDeck } = await import('./storage.js');
            await refreshDeck(subdeck.deckId, subdeck.fullPath);
            closeSubdeckModal();
            await loadRepositories();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Add review button (gavel)
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'card-review-btn';
    reviewBtn.title = 'Review this subdeck';
    reviewBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Navigate to app.html with file filter (use fullPath which includes folder structure)
        window.location.href = `app.html?deck=${encodeURIComponent(subdeck.deckId)}&file=${encodeURIComponent(subdeck.fullPath)}`;
    };
    btnContainer.appendChild(reviewBtn);

    // No delete button for files - managed via git

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

// Initialize on load - only if topics-grid element exists (i.e., we're on index.html)
if (document.getElementById('topics-grid')) {
    init();
}

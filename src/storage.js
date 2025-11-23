/**
 * D1-backed storage for cards and review state
 * Cards are derived from markdown and not stored in D1
 * Only review state (FSRS) is persisted to D1 via worker API
 */

// Get worker URL from environment
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

// In-memory caches (cards and repos not persisted to D1)
let cardsCache = [];
let reposCache = [];
let reviewsCache = []; // Local cache of reviews fetched from D1

// Current user info (set after GitHub auth)
let currentUser = null;

/**
 * Set current authenticated user
 */
export function setCurrentUser(user) {
    currentUser = user;
    console.log('[Storage] Current user set:', user);
}

/**
 * Get current authenticated user
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Initialize storage - load from D1 (if authenticated) or localStorage (if not)
 */
export async function initDB() {
    if (!currentUser) {
        console.log('[Storage] No user authenticated, loading from localStorage');

        // Migration: Clean up old "basics" deck references
        try {
            const oldReviewsKey = 'flashcards_reviews';
            const stored = localStorage.getItem(oldReviewsKey);
            if (stored) {
                const reviews = JSON.parse(stored);
                // Filter out any reviews for the old "basics" deck
                const cleanedReviews = reviews.filter(r =>
                    r.deckId !== 'basics' &&
                    !r.cardHash?.includes('basics')
                );

                if (cleanedReviews.length !== reviews.length) {
                    console.log(`[Storage] Migration: Removed ${reviews.length - cleanedReviews.length} old "basics" deck reviews`);
                    localStorage.setItem(oldReviewsKey, JSON.stringify(cleanedReviews));
                }

                reviewsCache = cleanedReviews;
                console.log(`[Storage] Loaded ${reviewsCache.length} reviews from localStorage`);
            }
        } catch (error) {
            console.error('[Storage] Failed to load from localStorage:', error);
        }
        return;
    }

    try {
        // Ensure user exists in D1
        const response = await fetch(`${WORKER_URL}/api/users/ensure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                githubId: currentUser.github_id || currentUser.id,
                username: currentUser.username || currentUser.login,
                avatarUrl: currentUser.avatar_url
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Storage] Ensure user failed:', response.status, errorText);
            throw new Error(`Failed to ensure user: ${response.statusText} - ${errorText}`);
        }

        // Load all reviews from D1
        await loadReviewsFromD1();

        // Load user's repos from D1
        await loadReposFromD1();

        console.log('[Storage] D1 initialized successfully');
    } catch (error) {
        console.error('[Storage] Failed to initialize D1:', error);
    }
}

/**
 * Load all repos from D1 for current user
 */
export async function loadReposFromD1() {
    if (!currentUser) return;

    try {
        const userId = currentUser.github_id || currentUser.id;
        const response = await fetch(`${WORKER_URL}/api/repos/${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to load repos: ${response.statusText}`);
        }

        const { repos } = await response.json();
        console.log(`[Storage] Loaded ${repos.length} repos from D1:`, repos.map(r => r.repo_id));

        // Return repo IDs so they can be loaded by main.js
        return repos.map(r => ({ id: r.repo_id, owner: r.owner, name: r.repo_name }));
    } catch (error) {
        console.error('[Storage] Failed to load repos from D1:', error);
        return [];
    }
}

/**
 * Load all reviews from D1 for current user
 * @param {boolean} mergeWithLocalStorage - If true, merge localStorage reviews with D1 reviews (for initial login). If false, use D1 as source of truth (for refresh).
 */
async function loadReviewsFromD1(mergeWithLocalStorage = true) {
    if (!currentUser) return;

    try {
        const userId = currentUser.github_id || currentUser.id;
        const response = await fetch(`${WORKER_URL}/api/reviews/${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to load reviews: ${response.statusText}`);
        }

        const { reviews } = await response.json();

        // Convert D1 reviews to local cache format
        const d1Reviews = reviews.map(r => ({
            cardHash: r.cardHash,
            fsrsCard: r.fsrsState,
            lastReviewed: r.lastReviewed
        }));

        if (mergeWithLocalStorage) {
            // Load any existing localStorage reviews and merge (for initial login)
            const localReviews = [];
            try {
                const stored = localStorage.getItem('flashcards_reviews');
                if (stored) {
                    localReviews.push(...JSON.parse(stored));
                    console.log(`[Storage] Found ${localReviews.length} reviews in localStorage to merge`);
                }
            } catch (error) {
                console.error('[Storage] Failed to load localStorage reviews:', error);
            }

            // Merge: D1 reviews + localStorage reviews (D1 takes precedence for duplicates)
            const d1Hashes = new Set(d1Reviews.map(r => r.cardHash));
            const uniqueLocalReviews = localReviews.filter(r => !d1Hashes.has(r.cardHash));

            reviewsCache = [...d1Reviews, ...uniqueLocalReviews];

            console.log(`[Storage] Loaded ${d1Reviews.length} reviews from D1, ${uniqueLocalReviews.length} from localStorage, total: ${reviewsCache.length}`);
        } else {
            // Use D1 as source of truth (for refresh operations)
            reviewsCache = d1Reviews;
            console.log(`[Storage] Loaded ${d1Reviews.length} reviews from D1 (no merge)`);
        }
    } catch (error) {
        console.error('[Storage] Failed to load reviews from D1:', error);
        reviewsCache = [];
    }
}

/**
 * Clear all data
 */
export async function clearLocalStorage() {
    cardsCache = [];
    reposCache = [];
    reviewsCache = [];
    currentUser = null;
    return Promise.resolve();
}

/**
 * Save cards to memory (not persisted to D1)
 */
export async function saveCards(cards) {
    console.log(`[Storage] saveCards called with ${cards.length} cards`);
    console.log(`[Storage] Cards cache before: ${cardsCache.length} cards`);

    const newHashes = new Set(cards.map(c => c.hash));
    cardsCache = cardsCache.filter(c => !newHashes.has(c.hash));
    cardsCache.push(...cards);

    console.log(`[Storage] Cards cache after: ${cardsCache.length} cards`);
    console.log(`[Storage] Deck IDs in cache:`, [...new Set(cardsCache.map(c => c.deckName))]);

    return Promise.resolve();
}

/**
 * Get all cards
 */
export async function getAllCards() {
    console.log(`[Storage] getAllCards called - returning ${cardsCache.length} cards`);
    return Promise.resolve([...cardsCache]);
}

/**
 * Get a single card by hash
 */
export async function getCard(hash) {
    return Promise.resolve(cardsCache.find(c => c.hash === hash));
}

/**
 * Save a review (FSRS state) - syncs to D1 or localStorage
 */
export async function saveReview(cardHash, fsrsCard) {
    const review = {
        cardHash,
        fsrsCard,
        lastReviewed: new Date().toISOString()
    };

    // Update local cache
    const existingIndex = reviewsCache.findIndex(r => r.cardHash === cardHash);
    if (existingIndex >= 0) {
        reviewsCache[existingIndex] = review;
    } else {
        reviewsCache.push(review);
    }

    // Always save to localStorage as backup
    try {
        localStorage.setItem('flashcards_reviews', JSON.stringify(reviewsCache));
        console.log('[Storage] Review saved to localStorage');
    } catch (error) {
        console.error('[Storage] Failed to save to localStorage:', error);
    }

    // Also sync to D1 if user is authenticated
    if (currentUser) {
        try {
            // Find the card to get repo and filepath
            const card = cardsCache.find(c => c.hash === cardHash);
            if (!card) {
                console.warn('[Storage] Card not found for hash:', cardHash);
                return;
            }

            const userId = currentUser.github_id || currentUser.id;
            const response = await fetch(`${WORKER_URL}/api/reviews/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    reviews: [{
                        cardHash,
                        repo: card.source?.repo || card.deckName,
                        filepath: card.source?.file || '',
                        fsrsState: fsrsCard,
                        lastReviewed: review.lastReviewed,
                        dueDate: fsrsCard.due
                    }]
                })
            });

            if (!response.ok) {
                console.error('[Storage] Failed to sync review to D1:', response.statusText);
            } else {
                console.log('[Storage] Review synced to D1 successfully');
            }
        } catch (error) {
            console.error('[Storage] Error syncing review to D1:', error);
        }
    }

    return Promise.resolve();
}

/**
 * Get all reviews
 */
export async function getAllReviews() {
    return Promise.resolve([...reviewsCache]);
}

/**
 * Get review for a specific card
 */
export async function getReview(cardHash) {
    return Promise.resolve(reviewsCache.find(r => r.cardHash === cardHash));
}

/**
 * Clear reviews for a specific deck - deletes from D1
 */
export async function clearReviewsByDeck(deckId) {
    if (currentUser) {
        try {
            const userId = currentUser.github_id || currentUser.id;
            const response = await fetch(`${WORKER_URL}/api/deck/${userId}/${encodeURIComponent(deckId)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                console.error('[Storage] Failed to delete deck from D1:', response.statusText);
            } else {
                console.log('[Storage] Deck deleted from D1 successfully');
            }
        } catch (error) {
            console.error('[Storage] Error deleting deck from D1:', error);
        }
    }

    // Update local cache
    const cardsInDeck = cardsCache.filter(c => c.deckName === deckId || c.id === deckId);
    const cardHashes = cardsInDeck.map(c => c.hash);
    reviewsCache = reviewsCache.filter(r => !cardHashes.includes(r.cardHash));

    return Promise.resolve();
}

/**
 * Refresh a deck - mark all cards as due for review
 */
export async function refreshDeck(deckId, folder = null) {
    if (!currentUser) {
        // For localStorage mode, just clear reviews for this deck
        console.log('[Storage] Refreshing deck in localStorage mode');
        const cardsInDeck = cardsCache.filter(c =>
            c.deckName === deckId || c.source?.repo === deckId
        );
        const cardHashes = cardsInDeck.map(c => c.hash);
        const beforeCount = reviewsCache.length;
        reviewsCache = reviewsCache.filter(r => !cardHashes.includes(r.cardHash));
        const deleted = beforeCount - reviewsCache.length;
        console.log(`[Storage] Refreshed deck - deleted ${deleted} review(s) from localStorage`);

        // Save to localStorage
        try {
            localStorage.setItem('flashcards_reviews', JSON.stringify(reviewsCache));
        } catch (error) {
            console.error('[Storage] Failed to save to localStorage:', error);
        }
        return;
    }

    try {
        const userId = currentUser.github_id || currentUser.id;
        const response = await fetch(`${WORKER_URL}/api/refresh/${userId}/${encodeURIComponent(deckId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder })
        });

        if (!response.ok) {
            throw new Error(`Failed to refresh deck: ${response.statusText}`);
        }

        const { deleted } = await response.json();
        console.log(`[Storage] Refreshed deck - deleted ${deleted} review(s)`);

        // Reload reviews from D1 (don't merge with localStorage - use D1 as source of truth)
        await loadReviewsFromD1(false);

        // Save updated reviews to localStorage
        try {
            localStorage.setItem('flashcards_reviews', JSON.stringify(reviewsCache));
            console.log('[Storage] Updated localStorage after refresh');
        } catch (error) {
            console.error('[Storage] Failed to update localStorage after refresh:', error);
        }
    } catch (error) {
        console.error('[Storage] Error refreshing deck:', error);
    }
}

/**
 * Save repository metadata - also syncs to D1
 */
export async function saveRepoMetadata(repo) {
    console.log(`[Storage] saveRepoMetadata called for: ${repo.id}`);

    // Update local cache
    const existingIndex = reposCache.findIndex(r => r.id === repo.id);
    if (existingIndex >= 0) {
        console.log(`[Storage] Updating existing repo at index ${existingIndex}`);
        reposCache[existingIndex] = repo;
    } else {
        console.log(`[Storage] Adding new repo to cache`);
        reposCache.push(repo);
    }
    console.log(`[Storage] Repos cache now has ${reposCache.length} repos:`, reposCache.map(r => r.id));

    // Sync to D1 if user is authenticated
    if (currentUser && repo.id && repo.name) {
        try {
            const userId = currentUser.github_id || currentUser.id;
            const [owner, repoName] = repo.id.includes('/') ? repo.id.split('/') : [userId, repo.id];

            // Get cards for this repo to register their hashes
            const repoCards = cardsCache
                .filter(c => c.deckName === repo.id || c.source?.repo === repo.id)
                .map(c => ({ hash: c.hash, contentType: c.type === 'cloze' ? 'cloze' : 'qa' }));

            const response = await fetch(`${WORKER_URL}/api/repos/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    repoId: repo.id,
                    repoName: repoName || repo.name,
                    owner,
                    cards: repoCards
                })
            });

            if (!response.ok) {
                console.error('[Storage] Failed to sync repo to D1:', response.statusText);
            } else {
                const result = await response.json();
                console.log(`[Storage] Repo synced to D1: ${result.cardsRegistered} cards registered`);
            }
        } catch (error) {
            console.error('[Storage] Error syncing repo to D1:', error);
        }
    }

    return Promise.resolve();
}

/**
 * Get all repositories
 */
export async function getAllRepos() {
    console.log(`[Storage] getAllRepos called - returning ${reposCache.length} repos:`, reposCache.map(r => r.id));
    return Promise.resolve([...reposCache]);
}

/**
 * Get repository metadata
 */
export async function getRepoMetadata(repoId) {
    return Promise.resolve(reposCache.find(r => r.id === repoId));
}

/**
 * Remove specific cards by hash
 */
export async function removeCards(cardHashes) {
    console.log(`[Storage] removeCards called for ${cardHashes.length} hashes`);

    // Remove cards
    cardsCache = cardsCache.filter(c => !cardHashes.includes(c.hash));

    // Remove associated reviews
    reviewsCache = reviewsCache.filter(r => !cardHashes.includes(r.cardHash));

    console.log(`[Storage] Cards cache after removal:`, cardsCache.length);
    return Promise.resolve();
}

/**
 * Remove repository - deletes from D1
 */
export async function removeRepo(repoId) {
    console.log(`[Storage] removeRepo called for: ${repoId}`);

    // Delete from D1 (repos table and reviews)
    if (currentUser) {
        try {
            const userId = currentUser.github_id || currentUser.id;

            // Delete from repos table
            const repoResponse = await fetch(`${WORKER_URL}/api/repos/${userId}/${encodeURIComponent(repoId)}`, {
                method: 'DELETE'
            });

            if (!repoResponse.ok) {
                const errorText = await repoResponse.text();
                console.error('[Storage] Failed to delete repo from D1:', repoResponse.status, errorText);
            } else {
                const result = await repoResponse.json();
                console.log('[Storage] Repo deleted from D1:', result);
            }

            // Delete reviews for this deck
            const reviewResponse = await fetch(`${WORKER_URL}/api/deck/${userId}/${encodeURIComponent(repoId)}`, {
                method: 'DELETE'
            });

            if (!reviewResponse.ok) {
                console.error('[Storage] Failed to delete reviews from D1:', reviewResponse.statusText);
            }

            console.log('[Storage] Repo and reviews deleted from D1');
        } catch (error) {
            console.error('[Storage] Error deleting from D1:', error);
        }
    }

    // Remove from local caches
    reposCache = reposCache.filter(r => r.id !== repoId);

    const cardsToRemove = cardsCache.filter(c =>
        c.deckName === repoId || c.source?.repo === repoId
    );

    cardsCache = cardsCache.filter(c =>
        c.deckName !== repoId && c.source?.repo !== repoId
    );

    const cardHashes = cardsToRemove.map(c => c.hash);
    reviewsCache = reviewsCache.filter(r => !cardHashes.includes(r.cardHash));

    console.log(`[Storage] Removed repo and ${cardsToRemove.length} cards`);

    // Save to localStorage if not authenticated
    if (!currentUser) {
        try {
            localStorage.setItem('flashcards_reviews', JSON.stringify(reviewsCache));
            console.log('[Storage] Saved updated reviews to localStorage after deletion');
        } catch (error) {
            console.error('[Storage] Failed to save to localStorage:', error);
        }
    }

    return Promise.resolve();
}

/**
 * Get statistics
 */
export async function getStats() {
    const now = new Date();
    const allReviews = await getAllReviews();

    const dueReviews = allReviews.filter(r => new Date(r.fsrsCard.due) <= now);
    const newCards = allReviews.filter(r => r.fsrsCard.state === 0);

    return Promise.resolve({
        totalCards: cardsCache.length,
        reviewedCards: allReviews.length,
        dueCards: dueReviews.length,
        newCards: newCards.length
    });
}

/**
 * Get all decks (repos with metadata)
 */
export async function getAllDecks() {
    return Promise.resolve(reposCache.filter(r => r.cardCount !== undefined));
}

/**
 * Get decks by topic
 */
export async function getDecksByTopic(topic) {
    return Promise.resolve(
        reposCache.filter(r => r.topic === topic && r.cardCount !== undefined)
    );
}

/**
 * Get decks by subject
 */
export async function getDecksBySubject(subject) {
    return Promise.resolve(
        reposCache.filter(r => r.subject === subject && r.cardCount !== undefined)
    );
}

/**
 * Get cards by topic
 */
export async function getCardsByTopic(topic) {
    return Promise.resolve(
        cardsCache.filter(c => c.deckMetadata?.topic === topic)
    );
}

/**
 * Get all unique topics
 */
export async function getAllTopics() {
    const topics = new Set();
    reposCache.forEach(r => {
        if (r.topic) topics.add(r.topic);
    });
    cardsCache.forEach(c => {
        if (c.deckMetadata?.topic) topics.add(c.deckMetadata.topic);
    });
    return Promise.resolve(Array.from(topics).sort());
}

/**
 * Get all unique subjects
 */
export async function getAllSubjects() {
    const subjects = new Set();
    reposCache.forEach(r => {
        if (r.subject) subjects.add(r.subject);
    });
    cardsCache.forEach(c => {
        if (c.deckMetadata?.subject) subjects.add(c.deckMetadata.subject);
    });
    return Promise.resolve(Array.from(subjects).sort());
}

/**
 * Clean up orphaned reviews (reviews for cards that no longer exist)
 * Returns count of orphaned reviews removed
 */
export async function cleanupOrphanedReviews() {
    if (!currentUser) {
        console.warn('[Storage] Cannot cleanup - no user authenticated');
        return 0;
    }

    // Find reviews for hashes that don't exist in current cards
    const cardHashes = new Set(cardsCache.map(c => c.hash));
    const orphanedReviews = reviewsCache.filter(r => !cardHashes.has(r.cardHash));

    if (orphanedReviews.length === 0) {
        console.log('[Storage] No orphaned reviews found');
        return 0;
    }

    console.log(`[Storage] Found ${orphanedReviews.length} orphaned reviews`);
    console.log('[Storage] Orphaned hashes:', orphanedReviews.map(r => r.cardHash));

    // Remove from local cache
    reviewsCache = reviewsCache.filter(r => cardHashes.has(r.cardHash));

    // Remove from D1
    try {
        const userId = currentUser.github_id || currentUser.id;
        const orphanedHashes = orphanedReviews.map(r => r.cardHash);

        const response = await fetch(`${WORKER_URL}/api/reviews/cleanup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, cardHashes: orphanedHashes })
        });

        if (!response.ok) {
            console.error('[Storage] Failed to cleanup orphaned reviews in D1:', response.statusText);
        } else {
            const result = await response.json();
            console.log(`[Storage] Cleaned up ${result.deleted} orphaned reviews from D1`);
        }
    } catch (error) {
        console.error('[Storage] Error cleaning up orphaned reviews from D1:', error);
    }

    return orphanedReviews.length;
}

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
 * Initialize storage - ensure user exists in D1 and load reviews
 */
export async function initDB() {
    if (!currentUser) {
        console.log('[Storage] No user authenticated, skipping D1 init');
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

        console.log('[Storage] D1 initialized successfully');
    } catch (error) {
        console.error('[Storage] Failed to initialize D1:', error);
    }
}

/**
 * Load all reviews from D1 for current user
 */
async function loadReviewsFromD1() {
    if (!currentUser) return;

    try {
        const userId = currentUser.github_id || currentUser.id;
        const response = await fetch(`${WORKER_URL}/api/reviews/${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to load reviews: ${response.statusText}`);
        }

        const { reviews } = await response.json();

        // Convert to local cache format
        reviewsCache = reviews.map(r => ({
            cardHash: r.cardHash,
            fsrsCard: r.fsrsState,
            lastReviewed: r.lastReviewed
        }));

        console.log(`[Storage] Loaded ${reviewsCache.length} reviews from D1`);
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
 * Save a review (FSRS state) - syncs to D1
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

    // Sync to D1 if user is authenticated
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
        console.warn('[Storage] Cannot refresh deck - no user authenticated');
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

        const { updated } = await response.json();
        console.log(`[Storage] Refreshed ${updated} cards`);

        // Reload reviews from D1
        await loadReviewsFromD1();
    } catch (error) {
        console.error('[Storage] Error refreshing deck:', error);
    }
}

/**
 * Save repository metadata
 */
export async function saveRepoMetadata(repo) {
    console.log(`[Storage] saveRepoMetadata called for: ${repo.id}`);
    const existingIndex = reposCache.findIndex(r => r.id === repo.id);
    if (existingIndex >= 0) {
        console.log(`[Storage] Updating existing repo at index ${existingIndex}`);
        reposCache[existingIndex] = repo;
    } else {
        console.log(`[Storage] Adding new repo to cache`);
        reposCache.push(repo);
    }
    console.log(`[Storage] Repos cache now has ${reposCache.length} repos:`, reposCache.map(r => r.id));
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

    // Delete from D1
    await clearReviewsByDeck(repoId);

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

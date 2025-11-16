/**
 * Dual-mode storage for cards and review state
 * - When logged out: Uses IndexedDB for demo purposes
 * - When logged in: Uses Cloudflare Worker KV via GitHub auth
 */

import { openDB } from 'idb';

const DB_NAME = 'flashcards-db';
const DB_VERSION = 4;

// In-memory stores (always used for cards, loaded from markdown)
let cardsCache = [];
let reposCache = [];

// IndexedDB instance (lazy-initialized)
let db = null;

/**
 * Check if user is logged in
 */
function isLoggedIn() {
    return !!localStorage.getItem('github_token');
}

/**
 * Initialize storage
 */
export async function initDB() {
    // Only init IndexedDB if not logged in
    if (!isLoggedIn() && !db) {
        db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Reviews store
                if (!db.objectStoreNames.contains('reviews')) {
                    db.createObjectStore('reviews', { keyPath: 'cardHash' });
                }
            }
        });
    }
    return Promise.resolve();
}

/**
 * Clear all IndexedDB data (called when user logs in)
 */
export async function clearLocalStorage() {
    await initDB();
    if (db) {
        const tx = db.transaction(['reviews'], 'readwrite');
        await tx.objectStore('reviews').clear();
        await tx.done;
    }
}

/**
 * Save cards to memory (replaces existing cards with same hash)
 */
export async function saveCards(cards) {
    const newHashes = new Set(cards.map(c => c.hash));
    cardsCache = cardsCache.filter(c => !newHashes.has(c.hash));
    cardsCache.push(...cards);
    return Promise.resolve();
}

/**
 * Get all cards
 */
export async function getAllCards() {
    return Promise.resolve([...cardsCache]);
}

/**
 * Get a single card by hash
 */
export async function getCard(hash) {
    return Promise.resolve(cardsCache.find(c => c.hash === hash));
}

/**
 * Save a review (FSRS state)
 */
export async function saveReview(cardHash, fsrsCard) {
    const review = {
        cardHash,
        fsrsCard,
        lastReviewed: new Date().toISOString()
    };

    if (isLoggedIn()) {
        // Save to worker KV
        await syncReviewToCloud(review);
    } else {
        // Save to IndexedDB
        await initDB();
        if (db) {
            const tx = db.transaction(['reviews'], 'readwrite');
            await tx.objectStore('reviews').put(review);
            await tx.done;
        }
    }

    return Promise.resolve();
}

/**
 * Get all reviews
 */
export async function getAllReviews() {
    if (isLoggedIn()) {
        // Load from worker KV
        return await loadReviewsFromCloud();
    } else {
        // Load from IndexedDB
        await initDB();
        if (!db) {
            return [];
        }
        return await db.getAll('reviews');
    }
}

/**
 * Get review for a specific card
 */
export async function getReview(cardHash) {
    if (isLoggedIn()) {
        const allReviews = await loadReviewsFromCloud();
        return allReviews.find(r => r.cardHash === cardHash);
    } else {
        await initDB();
        if (!db) {
            return null;
        }
        return await db.get('reviews', cardHash);
    }
}

/**
 * Clear reviews for a specific deck
 */
export async function clearReviewsByDeck(deckId) {
    const cardsInDeck = cardsCache.filter(c => c.deckName === deckId || c.id === deckId);
    const cardHashes = cardsInDeck.map(c => c.hash);

    if (isLoggedIn()) {
        // Delete from worker KV
        for (const hash of cardHashes) {
            await deleteReviewFromCloud(hash);
        }
    } else {
        // Delete from IndexedDB
        await initDB();
        if (db) {
            const tx = db.transaction(['reviews'], 'readwrite');
            for (const hash of cardHashes) {
                await tx.objectStore('reviews').delete(hash);
            }
            await tx.done;
        }
    }

    return Promise.resolve();
}

/**
 * Save repository metadata
 */
export async function saveRepoMetadata(repo) {
    const existingIndex = reposCache.findIndex(r => r.id === repo.id);
    if (existingIndex >= 0) {
        reposCache[existingIndex] = repo;
    } else {
        reposCache.push(repo);
    }
    return Promise.resolve();
}

/**
 * Get all repositories
 */
export async function getAllRepos() {
    return Promise.resolve([...reposCache]);
}

/**
 * Get repository metadata
 */
export async function getRepoMetadata(repoId) {
    return Promise.resolve(reposCache.find(r => r.id === repoId));
}

/**
 * Remove repository
 */
export async function removeRepo(repoId) {
    reposCache = reposCache.filter(r => r.id !== repoId);

    const cardsToRemove = cardsCache.filter(c =>
        c.source?.repo === repoId || c.deckName === repoId
    );
    cardsCache = cardsCache.filter(c =>
        c.source?.repo !== repoId && c.deckName !== repoId
    );

    // Remove reviews
    if (isLoggedIn()) {
        for (const card of cardsToRemove) {
            await deleteReviewFromCloud(card.hash);
        }
    } else {
        await initDB();
        if (db) {
            const tx = db.transaction(['reviews'], 'readwrite');
            for (const card of cardsToRemove) {
                await tx.objectStore('reviews').delete(card.hash);
            }
            await tx.done;
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
 * Sync single review to Cloudflare Worker KV
 */
async function syncReviewToCloud(review) {
    const token = localStorage.getItem('github_token');
    const workerUrl = import.meta.env.VITE_WORKER_URL;

    if (!token || !workerUrl) {
        console.error('Cannot sync: missing token or worker URL');
        return;
    }

    try {
        const response = await fetch(`${workerUrl}/reviews/${review.cardHash}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(review)
        });

        if (!response.ok) {
            throw new Error(`Failed to sync review: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error syncing review to cloud:', error);
        throw error;
    }
}

/**
 * Load all reviews from Cloudflare Worker KV
 */
async function loadReviewsFromCloud() {
    const token = localStorage.getItem('github_token');
    const workerUrl = import.meta.env.VITE_WORKER_URL;

    if (!token || !workerUrl) {
        console.error('Cannot load: missing token or worker URL');
        return [];
    }

    try {
        const response = await fetch(`${workerUrl}/reviews`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load reviews: ${response.statusText}`);
        }

        const data = await response.json();
        return data.reviews || [];
    } catch (error) {
        console.error('Error loading reviews from cloud:', error);
        return [];
    }
}

/**
 * Delete review from Cloudflare Worker KV
 */
async function deleteReviewFromCloud(cardHash) {
    const token = localStorage.getItem('github_token');
    const workerUrl = import.meta.env.VITE_WORKER_URL;

    if (!token || !workerUrl) {
        console.error('Cannot delete: missing token or worker URL');
        return;
    }

    try {
        const response = await fetch(`${workerUrl}/reviews/${cardHash}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to delete review: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error deleting review from cloud:', error);
        throw error;
    }
}

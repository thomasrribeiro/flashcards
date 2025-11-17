/**
 * In-memory storage for cards and review state
 * All data is ephemeral and cleared on page refresh
 * (Will be replaced with Cloudflare D1 for persistence)
 */

// In-memory stores
let cardsCache = [];
let reposCache = [];
let reviewsCache = [];

/**
 * Initialize storage (no-op for in-memory)
 */
export async function initDB() {
    return Promise.resolve();
}

/**
 * Clear all data
 */
export async function clearLocalStorage() {
    cardsCache = [];
    reposCache = [];
    reviewsCache = [];
    return Promise.resolve();
}

/**
 * Save cards to memory (replaces existing cards with same hash)
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
 * Save a review (FSRS state)
 */
export async function saveReview(cardHash, fsrsCard) {
    const review = {
        cardHash,
        fsrsCard,
        lastReviewed: new Date().toISOString()
    };

    // Update or add review
    const existingIndex = reviewsCache.findIndex(r => r.cardHash === cardHash);
    if (existingIndex >= 0) {
        reviewsCache[existingIndex] = review;
    } else {
        reviewsCache.push(review);
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
 * Clear reviews for a specific deck
 */
export async function clearReviewsByDeck(deckId) {
    const cardsInDeck = cardsCache.filter(c => c.deckName === deckId || c.id === deckId);
    const cardHashes = cardsInDeck.map(c => c.hash);

    reviewsCache = reviewsCache.filter(r => !cardHashes.includes(r.cardHash));

    return Promise.resolve();
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
 * Remove repository
 */
export async function removeRepo(repoId) {
    console.log(`[Storage] removeRepo called for: ${repoId}`);
    console.log(`[Storage] Repos cache before removal:`, reposCache.length, reposCache.map(r => r.id));
    console.log(`[Storage] Cards cache before removal:`, cardsCache.length);

    // Remove the deck from repos cache
    reposCache = reposCache.filter(r => r.id !== repoId);
    console.log(`[Storage] Repos cache after filtering:`, reposCache.length, reposCache.map(r => r.id));

    // Remove cards - match by deckName or source repo
    const cardsToRemove = cardsCache.filter(c =>
        c.deckName === repoId || c.source?.repo === repoId
    );
    console.log(`[Storage] Cards to remove:`, cardsToRemove.length);

    cardsCache = cardsCache.filter(c =>
        c.deckName !== repoId && c.source?.repo !== repoId
    );
    console.log(`[Storage] Cards cache after removal:`, cardsCache.length);

    // Remove associated reviews
    const cardHashes = cardsToRemove.map(c => c.hash);
    reviewsCache = reviewsCache.filter(r => !cardHashes.includes(r.cardHash));
    console.log(`[Storage] Reviews removed: ${cardsToRemove.length}`);

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
 * Returns decks grouped by their metadata
 */
export async function getAllDecks() {
    // Decks are stored in reposCache
    // Filter to only return items that have cardCount (these are deck metadata, not raw repo metadata)
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

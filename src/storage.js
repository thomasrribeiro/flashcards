/**
 * IndexedDB storage for cards and review state
 */

const DB_NAME = 'flashcards-db';
const DB_VERSION = 1;

const STORES = {
    CARDS: 'cards',           // Card metadata and content
    REVIEWS: 'reviews',       // FSRS review state per card
    SESSIONS: 'sessions'      // Session history
};

let db = null;

/**
 * Initialize IndexedDB
 */
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Cards store: full card data with hash as key
            if (!db.objectStoreNames.contains(STORES.CARDS)) {
                const cardsStore = db.createObjectStore(STORES.CARDS, { keyPath: 'hash' });
                cardsStore.createIndex('deckName', 'deckName', { unique: false });
                cardsStore.createIndex('filePath', 'filePath', { unique: false });
            }

            // Reviews store: FSRS state per card
            if (!db.objectStoreNames.contains(STORES.REVIEWS)) {
                const reviewsStore = db.createObjectStore(STORES.REVIEWS, { keyPath: 'cardHash' });
                reviewsStore.createIndex('due', 'fsrsCard.due', { unique: false });
                reviewsStore.createIndex('state', 'fsrsCard.state', { unique: false });
            }

            // Sessions store: review session history
            if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
                db.createObjectStore(STORES.SESSIONS, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

/**
 * Save a card to the database
 */
export async function saveCard(card) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CARDS], 'readwrite');
        const store = transaction.objectStore(STORES.CARDS);
        const request = store.put(card);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Save multiple cards
 */
export async function saveCards(cards) {
    if (!db) await initDB();

    const promises = cards.map(card => saveCard(card));
    return Promise.all(promises);
}

/**
 * Get a card by hash
 */
export async function getCard(hash) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CARDS], 'readonly');
        const store = transaction.objectStore(STORES.CARDS);
        const request = store.get(hash);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all cards
 */
export async function getAllCards() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CARDS], 'readonly');
        const store = transaction.objectStore(STORES.CARDS);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get cards by deck name
 */
export async function getCardsByDeck(deckName) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CARDS], 'readonly');
        const store = transaction.objectStore(STORES.CARDS);
        const index = store.index('deckName');
        const request = index.getAll(deckName);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Save review state for a card
 */
export async function saveReview(cardHash, fsrsCard) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.REVIEWS], 'readwrite');
        const store = transaction.objectStore(STORES.REVIEWS);
        const request = store.put({
            cardHash,
            fsrsCard,
            lastReviewed: new Date()
        });

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get review state for a card
 */
export async function getReview(cardHash) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.REVIEWS], 'readonly');
        const store = transaction.objectStore(STORES.REVIEWS);
        const request = store.get(cardHash);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all review states
 */
export async function getAllReviews() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.REVIEWS], 'readonly');
        const store = transaction.objectStore(STORES.REVIEWS);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get due cards (cards that need review)
 */
export async function getDueCards() {
    if (!db) await initDB();

    const now = new Date();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.REVIEWS], 'readonly');
        const store = transaction.objectStore(STORES.REVIEWS);
        const index = store.index('due');
        const request = index.openCursor(IDBKeyRange.upperBound(now));

        const results = [];
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Save a review session
 */
export async function saveSession(session) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.SESSIONS], 'readwrite');
        const store = transaction.objectStore(STORES.SESSIONS);
        const request = store.add(session);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all sessions
 */
export async function getAllSessions() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.SESSIONS], 'readonly');
        const store = transaction.objectStore(STORES.SESSIONS);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear all data (for testing/reset)
 */
export async function clearAllData() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CARDS, STORES.REVIEWS, STORES.SESSIONS], 'readwrite');

        transaction.objectStore(STORES.CARDS).clear();
        transaction.objectStore(STORES.REVIEWS).clear();
        transaction.objectStore(STORES.SESSIONS).clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Get statistics
 */
export async function getStats() {
    if (!db) await initDB();

    const [allReviews, allCards] = await Promise.all([
        getAllReviews(),
        getAllCards()
    ]);

    const now = new Date();
    const dueReviews = allReviews.filter(r => new Date(r.fsrsCard.due) <= now);
    const newCards = allReviews.filter(r => r.fsrsCard.state === 0); // State.New

    return {
        totalCards: allCards.length,
        reviewedCards: allReviews.length,
        dueCards: dueReviews.length,
        newCards: newCards.length
    };
}

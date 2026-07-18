/**
 * D1-backed storage for cards and review state
 * Cards are derived from markdown and not stored in D1
 * Only review state (FSRS) is persisted to D1 via worker API
 */

import { State } from './fsrs-client.js';
import { getLocalDate } from './today-queue.js';
import { migrateLegacyReviews, rewriteStudySessionHashes } from './review-identity.js';
import { setCriticalLocalStorageItem } from './browser-storage.js';

// Get worker URL from environment
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

// In-memory caches (cards and repos not persisted to D1)
let cardsCache = [];
let reposCache = [];
let reviewsCache = []; // Local cache of reviews fetched from D1
let reposListCache = null; // Cached list from D1 (avoids duplicate fetches in same session)

// Track which repo IDs fully loaded in this session (for safe orphan cleanup)
let fullyLoadedRepos = new Set();

// localStorage key holding the list of repo IDs the user added while logged out.
// We re-fetch each one from GitHub on the next page load.
const UNLOGGED_REPOS_KEY = 'flashcards_unlogged_repos';

// Outbox of review-sync payloads that failed to reach D1 (offline / transient
// error). Flushed on init and whenever the browser comes back online, so a
// review graded offline is never silently lost.
const SYNC_OUTBOX_KEY = 'flashcards_sync_outbox';
const IDENTITY_MIGRATIONS_KEY = 'flashcards_identity_migrations';
const IDENTITY_MIGRATION_BATCH_SIZE = 10;
let identityFlushPromise = null;

function cardLabelSnapshot(card) {
    if (!card) return null;
    const content = card.content || {};
    const value = card.type === 'problem'
        ? content.problem
        : card.type === 'cloze'
            ? content.text
            : content.question;
    const label = String(value || '')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return label ? label.slice(0, 300) : null;
}

function getIdentityMigrations() {
    try {
        return JSON.parse(localStorage.getItem(IDENTITY_MIGRATIONS_KEY) || '[]');
    } catch {
        return [];
    }
}

function queueIdentityMigrations(userId, migrations) {
    if (!userId || migrations.length === 0) return;
    const queued = getIdentityMigrations();
    for (let index = 0; index < migrations.length; index += IDENTITY_MIGRATION_BATCH_SIZE) {
        queued.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId,
            migrations: migrations.slice(index, index + IDENTITY_MIGRATION_BATCH_SIZE)
        });
    }
    try {
        setCriticalLocalStorageItem(IDENTITY_MIGRATIONS_KEY, JSON.stringify(queued));
    } catch (error) {
        console.error('[Storage] Failed to queue identity migration:', error);
    }
}

export async function flushIdentityMigrations() {
    if (identityFlushPromise) return identityFlushPromise;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    identityFlushPromise = (async () => {
        while (true) {
            const queued = getIdentityMigrations();
            const item = queued[0];
            if (!item) return;
            try {
                const payload = { userId: item.userId, migrations: item.migrations };
                const response = await fetch(`${WORKER_URL}/api/reviews/migrate-identities`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error(response.statusText);

                // Re-read before removing so migrations queued during this
                // request are never overwritten by an older snapshot.
                const latest = getIdentityMigrations();
                const remaining = item.id
                    ? latest.filter(entry => entry.id !== item.id)
                    : latest.slice(1); // compatibility with a pre-ID queue item
                setCriticalLocalStorageItem(IDENTITY_MIGRATIONS_KEY, JSON.stringify(remaining));
            } catch (error) {
                console.error('[Storage] Identity migration sync failed, will retry:', error);
                return;
            }
        }
    })().finally(() => {
        identityFlushPromise = null;
    });

    return identityFlushPromise;
}

function getSyncOutbox() {
    try {
        const raw = localStorage.getItem(SYNC_OUTBOX_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function loadReviewsFromLocalStorage() {
    try {
        const stored = localStorage.getItem('flashcards_reviews');
        if (!stored) return [];
        return JSON.parse(stored).filter(review =>
            review.deckId !== 'basics'
            && !review.cardHash?.includes('basics')
        );
    } catch (error) {
        console.error('[Storage] Failed to load local reviews:', error);
        return [];
    }
}

function persistReviewsLocally(reviews) {
    try {
        setCriticalLocalStorageItem('flashcards_reviews', JSON.stringify(reviews));
    } catch (error) {
        console.error('[Storage] Failed to persist local review snapshot:', error);
    }
}

export function mergeReviewSnapshots(remoteReviews = [], localReviews = []) {
    const merged = new Map();
    const timestamp = review => {
        const value = review.lastReviewed ? Date.parse(review.lastReviewed) : NaN;
        return Number.isNaN(value) ? 0 : value;
    };
    for (const review of [...remoteReviews, ...localReviews]) {
        const existing = merged.get(review.cardHash);
        if (!existing) {
            merged.set(review.cardHash, review);
            continue;
        }
        const newer = timestamp(review) >= timestamp(existing) ? review : existing;
        const older = newer === review ? existing : review;
        merged.set(review.cardHash, {
            ...newer,
            repo: newer.repo || older.repo || null,
            filepath: newer.filepath || older.filepath || null,
            cardLabel: newer.cardLabel || older.cardLabel || null,
            lastRating: newer.lastRating ?? older.lastRating ?? null
        });
    }
    return [...merged.values()];
}

export function enrichReviewSources(reviews = [], cards = []) {
    const cardByHash = new Map(cards.map(card => [card.hash, card]));
    let changed = false;
    const enriched = reviews.map(review => {
        const card = cardByHash.get(review.cardHash);
        if (!card || (review.repo && review.filepath)) return review;
        changed = true;
        return {
            ...review,
            repo: review.repo || card.source?.repo || card.deckName || null,
            filepath: review.filepath || card.source?.file || null,
            cardLabel: review.cardLabel || cardLabelSnapshot(card)
        };
    });
    return { reviews: enriched, changed };
}

function enqueueSync(userId, reviewPayload) {
    try {
        const outbox = getSyncOutbox();
        outbox.push({ userId, review: reviewPayload });
        setCriticalLocalStorageItem(SYNC_OUTBOX_KEY, JSON.stringify(outbox));
        console.log('[Storage] Queued review for later sync; outbox size:', outbox.length);
    } catch (error) {
        console.error('[Storage] Failed to enqueue review for sync:', error);
    }
}

/**
 * Flush queued review syncs to D1. Batches by user. Safe to call repeatedly.
 */
export async function flushSyncOutbox() {
    const outbox = getSyncOutbox();
    if (outbox.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    // Group payloads by userId; the sync endpoint accepts an array
    const byUser = new Map();
    for (const item of outbox) {
        if (!byUser.has(item.userId)) byUser.set(item.userId, []);
        byUser.get(item.userId).push(item.review);
    }

    const remaining = [];
    for (const [userId, reviews] of byUser) {
        try {
            const response = await fetch(`${WORKER_URL}/api/reviews/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, reviews })
            });
            if (!response.ok) throw new Error(response.statusText);
            console.log(`[Storage] Flushed ${reviews.length} queued review(s) for ${userId}`);
        } catch (error) {
            console.error('[Storage] Outbox flush failed, will retry later:', error);
            remaining.push(...reviews.map(review => ({ userId, review })));
        }
    }

    try {
        setCriticalLocalStorageItem(SYNC_OUTBOX_KEY, JSON.stringify(remaining));
    } catch (error) {
        console.error('[Storage] Failed to persist outbox after flush:', error);
    }
}

// Retry the outbox whenever connectivity returns
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        flushSyncOutbox();
        flushIdentityMigrations();
    });
}

export function getUnloggedRepoList() {
    try {
        const raw = localStorage.getItem(UNLOGGED_REPOS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function setUnloggedRepoList(ids) {
    try {
        setCriticalLocalStorageItem(UNLOGGED_REPOS_KEY, JSON.stringify([...new Set(ids)]));
    } catch (error) {
        console.error('[Storage] Failed to persist unlogged repo list:', error);
    }
}

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
    // Local review state is the durable first read for both signed-in and
    // signed-out users. Remote initialization may fail while offline and must
    // never make already graded cards appear unstudied after a refresh.
    const localReviews = loadReviewsFromLocalStorage();
    reviewsCache = localReviews;
    console.log(`[Storage] Loaded ${reviewsCache.length} reviews from localStorage`);

    if (!currentUser) {
        console.log('[Storage] No user authenticated, loading from localStorage');
        persistReviewsLocally(localReviews);
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

        // Flush any reviews queued while offline before loading fresh state
        await flushSyncOutbox();
        flushIdentityMigrations();

        // Load reviews and repo list in parallel — neither depends on the other
        await Promise.all([loadReviewsFromD1(), loadReposFromD1()]);

        console.log('[Storage] D1 initialized successfully');
    } catch (error) {
        console.error('[Storage] Failed to initialize D1:', error);
    }
}

/**
 * Load all repos from D1 for current user
 */
export async function loadReposFromD1() {
    if (!currentUser) return [];

    // Return cached list if already fetched this session
    if (reposListCache !== null) {
        console.log(`[Storage] loadReposFromD1: returning ${reposListCache.length} cached repos`);
        return reposListCache;
    }

    try {
        const userId = currentUser.github_id || currentUser.id;
        const response = await fetch(`${WORKER_URL}/api/repos/${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to load repos: ${response.statusText}`);
        }

        const { repos } = await response.json();
        console.log(`[Storage] Loaded ${repos.length} repos from D1:`, repos.map(r => r.repo_id));

        reposListCache = repos.map(r => ({ id: r.repo_id, owner: r.owner, name: r.repo_name }));
        return reposListCache;
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
            lastReviewed: r.lastReviewed,
            lastRating: r.lastRating ?? r.last_rating ?? null,
            repo: r.repo || r.repoId || r.repo_id || null,
            filepath: r.filepath || r.filePath || r.file_path || null,
            cardLabel: r.cardLabel || r.card_label || null
        }));

        if (mergeWithLocalStorage) {
            // Merge by cardHash, keeping whichever copy was reviewed more
            // recently. This protects locally graded cards from stale server
            // state after a connection interruption.
            const localReviews = loadReviewsFromLocalStorage();
            reviewsCache = mergeReviewSnapshots(d1Reviews, localReviews);

            console.log(`[Storage] Merged ${d1Reviews.length} D1 + ${localReviews.length} local reviews (newer-wins), total: ${reviewsCache.length}`);
        } else {
            // Use D1 as source of truth (for refresh operations)
            reviewsCache = d1Reviews;
            console.log(`[Storage] Loaded ${d1Reviews.length} reviews from D1 (no merge)`);
        }
        persistReviewsLocally(reviewsCache);
    } catch (error) {
        console.error('[Storage] Failed to load reviews from D1:', error);
        // Keep the local snapshot seeded by initDB (or the current in-memory
        // state). A failed fetch is not evidence that the learner has no data.
        if (reviewsCache.length === 0) reviewsCache = loadReviewsFromLocalStorage();
    }
}

/**
 * Mark a repo as having fully loaded (used by orphan cleanup safety gate)
 */
export function markRepoLoaded(repoId) {
    fullyLoadedRepos.add(repoId);
}

/**
 * Clear all data
 */
export async function clearLocalStorage() {
    cardsCache = [];
    reposCache = [];
    reviewsCache = [];
    reposListCache = null;
    fullyLoadedRepos = new Set();
    currentUser = null;
    return Promise.resolve();
}

/**
 * Save cards to memory (not persisted to D1)
 */
export async function saveCards(cards) {
    console.log(`[Storage] saveCards called with ${cards.length} cards`);
    console.log(`[Storage] Cards cache before: ${cardsCache.length} cards`);

    const stableIdentities = new Map();
    for (const card of [...cardsCache, ...cards]) {
        if (!card.stableId) continue;
        const previous = stableIdentities.get(card.hash);
        const location = `${card.source?.repo || card.deckName || ''}:${card.source?.file || card.filePath || ''}`;
        if (previous && previous.location !== location) {
            throw new Error(`Duplicate stable card-id "${card.stableId}" in ${previous.location} and ${location}`);
        }
        stableIdentities.set(card.hash, { location, stableId: card.stableId });
    }

    const newHashes = new Set(cards.map(c => c.hash));
    cardsCache = cardsCache.filter(c => !newHashes.has(c.hash));
    cardsCache.push(...cards);

    // Adding a stable ID to an existing card is a one-time, lossless identity
    // migration. Copy the newest FSRS state locally immediately, then queue the
    // same atomic migration for D1 and any persisted resumable session.
    const migration = migrateLegacyReviews(cards, reviewsCache);
    if (migration.migrations.length > 0) {
        reviewsCache = migration.reviews;
        try {
            setCriticalLocalStorageItem('flashcards_reviews', JSON.stringify(reviewsCache));

            for (const key of ['flashcards_study_session']) {
                const raw = JSON.parse(localStorage.getItem(key) || 'null');
                const rewritten = rewriteStudySessionHashes(raw, migration.hashMapping);
                if (rewritten !== raw) setCriticalLocalStorageItem(key, JSON.stringify(rewritten));
            }

            const pendingKey = 'flashcards_study_session_pending';
            const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
            if (pending?.session) {
                const rewritten = rewriteStudySessionHashes(pending.session, migration.hashMapping);
                if (rewritten !== pending.session) {
                    setCriticalLocalStorageItem(pendingKey, JSON.stringify({ ...pending, session: rewritten }));
                }
            }
        } catch (error) {
            console.error('[Storage] Failed to persist migrated identity state:', error);
        }

        if (currentUser) {
            const userId = currentUser.github_id || currentUser.id;
            queueIdentityMigrations(userId, migration.migrations);
            flushIdentityMigrations();
        }
        console.log(`[Storage] Preserved review state across ${migration.migrations.length} stable card identity migration(s)`);
    }

    // Older review rows may predate persisted source metadata. Once their card
    // bodies are available, repair the local snapshot so future refreshes can
    // map progress to a chapter without downloading the whole collection.
    const enrichment = enrichReviewSources(reviewsCache, cardsCache);
    reviewsCache = enrichment.reviews;
    if (enrichment.changed) persistReviewsLocally(reviewsCache);

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
 * @param {Object} log - optional ts-fsrs review log; when present it is sent
 *   with the sync payload so the worker records review_logs / daily_activity.
 */
export async function saveReview(cardHash, fsrsCard, log = null) {
    const reviewedCard = cardsCache.find(c => c.hash === cardHash);
    const cardLabel = cardLabelSnapshot(reviewedCard);
    const existingIndex = reviewsCache.findIndex(r => r.cardHash === cardHash);
    const existingReview = existingIndex >= 0 ? reviewsCache[existingIndex] : null;
    const review = {
        cardHash,
        fsrsCard,
        lastReviewed: new Date().toISOString(),
        lastRating: log?.rating ?? existingReview?.lastRating ?? null,
        repo: reviewedCard?.source?.repo || reviewedCard?.deckName || null,
        filepath: reviewedCard?.source?.file || null,
        cardLabel
    };

    // Update local cache
    if (existingIndex >= 0) {
        reviewsCache[existingIndex] = review;
    } else {
        reviewsCache.push(review);
    }

    // Always save to localStorage as backup
    try {
        setCriticalLocalStorageItem('flashcards_reviews', JSON.stringify(reviewsCache));
        console.log('[Storage] Review saved to localStorage');
    } catch (error) {
        console.error('[Storage] Failed to save to localStorage:', error);
    }

    // Also sync to D1 if user is authenticated
    if (currentUser) {
        try {
            // Find the card to get repo and filepath
            const card = reviewedCard;
            if (!card) {
                console.warn('[Storage] Card not found for hash:', cardHash);
                return;
            }

            const userId = currentUser.github_id || currentUser.id;
            const reviewPayload = {
                cardHash,
                repo: card.source?.repo || card.deckName,
                filepath: card.source?.file || '',
                fsrsState: fsrsCard,
                lastReviewed: review.lastReviewed,
                dueDate: fsrsCard.due,
                cardLabel,
                log: log ? {
                    rating: log.rating,
                    prevState: log.state,
                    stability: log.stability,
                    difficulty: log.difficulty,
                    elapsedDays: log.elapsed_days,
                    scheduledDays: log.scheduled_days
                } : null,
                localDate: getLocalDate()
            };

            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                enqueueSync(userId, reviewPayload);
            } else {
                const response = await fetch(`${WORKER_URL}/api/reviews/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, reviews: [reviewPayload] })
                });

                if (!response.ok) {
                    console.error('[Storage] Failed to sync review to D1, queueing:', response.statusText);
                    enqueueSync(userId, reviewPayload);
                } else {
                    console.log('[Storage] Review synced to D1 successfully');
                }
            }
        } catch (error) {
            // Network error — queue for retry rather than lose the review
            console.error('[Storage] Error syncing review to D1, queueing:', error);
            const userId = currentUser.github_id || currentUser.id;
            const card = cardsCache.find(c => c.hash === cardHash);
            enqueueSync(userId, {
                cardHash,
                repo: card?.source?.repo || card?.deckName || '',
                filepath: card?.source?.file || '',
                fsrsState: fsrsCard,
                lastReviewed: review.lastReviewed,
                dueDate: fsrsCard.due,
                cardLabel,
                log: log ? {
                    rating: log.rating, prevState: log.state, stability: log.stability,
                    difficulty: log.difficulty, elapsedDays: log.elapsed_days, scheduledDays: log.scheduled_days
                } : null,
                localDate: getLocalDate()
            });
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
        // For localStorage mode, clear reviews for matching cards
        console.log('[Storage] Refreshing deck in localStorage mode', { deckId, folder });

        // Filter cards by deck AND optionally by folder/file path
        const cardsInDeck = cardsCache.filter(c => {
            // Must match deck
            if (c.deckName !== deckId && c.source?.repo !== deckId) {
                return false;
            }

            // If folder filter specified, card's source.file must match
            if (folder) {
                const cardPath = c.source?.file || '';
                // Normalize paths (remove flashcards/ prefix if present)
                const normalizedCardPath = cardPath.startsWith('flashcards/') ? cardPath.substring(11) : cardPath;
                const normalizedFolder = folder.startsWith('flashcards/') ? folder.substring(11) : folder;

                // Exact match (for file) or folder prefix match
                if (normalizedCardPath === normalizedFolder) return true;
                if (normalizedCardPath.startsWith(normalizedFolder + '/')) return true;
                return false;
            }

            return true;
        });

        const cardHashes = cardsInDeck.map(c => c.hash);
        const beforeCount = reviewsCache.length;
        reviewsCache = reviewsCache.filter(r => !cardHashes.includes(r.cardHash));
        const deleted = beforeCount - reviewsCache.length;
        console.log(`[Storage] Refreshed deck - deleted ${deleted} review(s) from localStorage (matched ${cardsInDeck.length} cards)`);

        // Save to localStorage
        try {
            setCriticalLocalStorageItem('flashcards_reviews', JSON.stringify(reviewsCache));
        } catch (error) {
            console.error('[Storage] Failed to save to localStorage:', error);
        }
        return;
    }

    // Pre-compute card hashes to remove (mirrors localStorage path logic)
    const cardsInDeck = cardsCache.filter(c => {
        if (c.deckName !== deckId && c.source?.repo !== deckId) return false;
        if (folder) {
            const cardPath = c.source?.file || '';
            const normalizedCardPath = cardPath.startsWith('flashcards/') ? cardPath.substring(11) : cardPath;
            const normalizedFolder = folder.startsWith('flashcards/') ? folder.substring(11) : folder;
            if (normalizedCardPath === normalizedFolder) return true;
            if (normalizedCardPath.startsWith(normalizedFolder + '/')) return true;
            return false;
        }
        return true;
    });
    const cardHashSet = new Set(cardsInDeck.map(c => c.hash));

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

        // Reload from D1 to get the authoritative post-deletion state
        await loadReviewsFromD1(false);
    } catch (error) {
        console.error('[Storage] Error refreshing deck:', error);
    }

    // Always apply local filter after the API attempt so the UI reflects the
    // reset even if D1 returned stale data or the request failed transiently.
    reviewsCache = reviewsCache.filter(r => !cardHashSet.has(r.cardHash));

    try {
        setCriticalLocalStorageItem('flashcards_reviews', JSON.stringify(reviewsCache));
        console.log('[Storage] Updated localStorage after refresh');
    } catch (error) {
        console.error('[Storage] Failed to update localStorage after refresh:', error);
    }
}

/**
 * Save repository metadata - also syncs to D1
 */
export async function saveRepoMetadata(repo, { sync = true } = {}) {
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

    // Persist GitHub repos added in unlogged state so they reload on next visit.
    // Skip local/* (those come from the static collection, not user-added).
    if (!currentUser && repo.id && !repo.id.startsWith('local/')) {
        const list = getUnloggedRepoList();
        if (!list.includes(repo.id)) {
            list.push(repo.id);
            setUnloggedRepoList(list);
            console.log(`[Storage] Persisted unlogged repo: ${repo.id}`);
        }
    }

    // Sync to D1 if user is authenticated
    if (sync && currentUser && repo.id && repo.name) {
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
                // Invalidate list cache so the new repo appears in future loadReposFromD1 calls
                reposListCache = null;
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

    // Invalidate the repos-list cache so a subsequent loadReposFromD1 re-fetches
    reposListCache = null;

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
            setCriticalLocalStorageItem('flashcards_reviews', JSON.stringify(reviewsCache));
            console.log('[Storage] Saved updated reviews to localStorage after deletion');
        } catch (error) {
            console.error('[Storage] Failed to save to localStorage:', error);
        }

        // Drop from the unlogged-repos list so we don't re-fetch it next visit
        const list = getUnloggedRepoList().filter(id => id !== repoId);
        setUnloggedRepoList(list);
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
    // State.New === 0 in ts-fsrs; use the constant to be explicit
    const newCards = allReviews.filter(r => r.fsrsCard.state === State.New);

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
 * Clean up orphaned reviews (reviews for cards that no longer exist).
 * Only considers reviews from repos that fully loaded this session to avoid
 * deleting valid reviews when a repo failed to load due to a transient error.
 * Returns count of orphaned reviews removed.
 */
export async function cleanupOrphanedReviews() {
    if (!currentUser) {
        console.warn('[Storage] Cannot cleanup - no user authenticated');
        return 0;
    }

    if (fullyLoadedRepos.size === 0) {
        console.log('[Storage] No fully-loaded repos yet — skipping orphan cleanup');
        return 0;
    }

    // Only look at cards from repos that successfully loaded
    const loadedCardHashes = new Set(
        cardsCache
            .filter(c => fullyLoadedRepos.has(c.source?.repo || c.deckName))
            .map(c => c.hash)
    );

    // Only flag reviews whose repo is in our fully-loaded set
    const orphanedReviews = reviewsCache.filter(r => {
        const card = cardsCache.find(c => c.hash === r.cardHash);
        const repoId = card?.source?.repo || card?.deckName || r.cardHash;
        if (!fullyLoadedRepos.has(repoId)) {
            return false; // don't touch reviews from repos we didn't load
        }
        return !loadedCardHashes.has(r.cardHash);
    });

    if (orphanedReviews.length === 0) {
        console.log('[Storage] No orphaned reviews found');
        return 0;
    }

    // Safety threshold: never delete more than 20% of all reviews at once
    const threshold = Math.ceil(reviewsCache.length * 0.20);
    if (orphanedReviews.length > threshold) {
        console.warn(`[Storage] Orphan cleanup would remove ${orphanedReviews.length} reviews (>${threshold} threshold). Skipping to be safe.`);
        return 0;
    }

    console.log(`[Storage] Found ${orphanedReviews.length} orphaned reviews`);

    // Remove from local cache
    const orphanedHashes = new Set(orphanedReviews.map(r => r.cardHash));
    reviewsCache = reviewsCache.filter(r => !orphanedHashes.has(r.cardHash));

    // Remove from D1
    try {
        const userId = currentUser.github_id || currentUser.id;

        const response = await fetch(`${WORKER_URL}/api/reviews/cleanup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, cardHashes: [...orphanedHashes] })
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

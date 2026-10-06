/** Pure helpers for migrating legacy content-hash review state to stable IDs. */

function reviewedAt(review) {
    const parsed = Date.parse(review?.lastReviewed || '');
    return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Plan and apply in-memory review identity migrations.
 *
 * A card may retain one or more legacy content hashes in its Markdown. If any
 * of those hashes have saved state, the newest state wins and is moved to the
 * card's current persistent hash. No review event is created by this process.
 */
export function migrateLegacyReviews(cards, reviews) {
    const byHash = new Map(reviews.map(review => [review.cardHash, review]));
    const migrations = [];
    const hashMapping = new Map();

    for (const card of cards) {
        if (!card.stableId || !Array.isArray(card.legacyHashes)) continue;

        const legacyReviews = card.legacyHashes
            .map(hash => byHash.get(hash))
            .filter(Boolean);
        if (legacyReviews.length === 0) continue;

        const current = byHash.get(card.hash);
        const newest = [current, ...legacyReviews]
            .filter(Boolean)
            .sort((a, b) => reviewedAt(b) - reviewedAt(a))[0];
        const fromCardHashes = [...new Set(legacyReviews.map(review => review.cardHash))]
            .filter(hash => hash !== card.hash);
        if (fromCardHashes.length === 0) continue;

        const migrated = {
            ...newest,
            cardHash: card.hash,
            repo: card.source?.repo || card.deckName || newest.repo || null,
            filepath: card.source?.file || newest.filepath || null
        };
        byHash.set(card.hash, migrated);
        for (const oldHash of fromCardHashes) {
            byHash.delete(oldHash);
            hashMapping.set(oldHash, card.hash);
        }

        migrations.push({
            fromCardHashes,
            toCardHash: card.hash,
            repo: migrated.repo || '',
            filepath: migrated.filepath || '',
            contentType: card.type === 'cloze' ? 'cloze' : 'qa'
        });
    }

    return { reviews: [...byHash.values()], migrations, hashMapping };
}

/** Replace legacy hashes in a persisted resumable study-session payload. */
export function rewriteStudySessionHashes(session, hashMapping) {
    if (!session || !Array.isArray(session.queue) || hashMapping.size === 0) return session;
    let changed = false;
    const queue = session.queue.map(entry => {
        const cardHash = hashMapping.get(entry.cardHash);
        if (!cardHash) return entry;
        changed = true;
        return { ...entry, cardHash };
    });
    return changed ? { ...session, queue } : session;
}

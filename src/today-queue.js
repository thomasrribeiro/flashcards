/**
 * Today queue — the daily focus session.
 *
 * Pure, DOM-free module: given the loaded cards, the review cache, and the
 * user's habit settings, build today's study queue from ACTIVE decks only:
 * all due cards, plus a capped trickle of never-seen cards.
 */

/**
 * Local date as YYYY-MM-DD in the user's timezone. The single shared helper —
 * every day-bucketing decision (streaks, daily activity) uses this.
 */
export function getLocalDate(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Same deck predicate used by study-session.js loadDueCards */
function cardDeckId(card) {
    return card.source?.repo || card.deckName;
}

/**
 * Build the Today queue.
 *
 * @param {Object} opts
 * @param {Array} opts.cards - all loaded cards (with .hash, .source, .deckName, .deckMetadata)
 * @param {Array} opts.reviews - review cache entries { cardHash, fsrsCard, lastReviewed }
 * @param {Array<string>} opts.activeDeckIds - repo ids marked active
 * @param {number} opts.newPerDay - max new cards to introduce per day
 * @param {number} opts.newIntroducedToday - new cards already introduced today
 * @param {Date} opts.now
 * @returns {Array<{card, fsrsCard|null, cardHash}>} due first (oldest due first), then capped new
 */
export function buildTodayQueue({ cards, reviews, activeDeckIds, newPerDay = 10, newIntroducedToday = 0, now = new Date() }) {
    const active = new Set(activeDeckIds || []);
    if (active.size === 0) return [];

    const reviewMap = new Map((reviews || []).map(r => [r.cardHash, r]));

    const due = [];
    const fresh = [];

    for (const card of cards || []) {
        if (!active.has(cardDeckId(card))) continue;

        const review = reviewMap.get(card.hash);
        if (review) {
            // Reviewed before — include only if due (mirrors loadDueCards, which
            // treats "has a review row" as the reviewed/new boundary)
            const dueDate = review.fsrsCard.due instanceof Date
                ? review.fsrsCard.due
                : new Date(review.fsrsCard.due);
            if (dueDate <= now) {
                due.push({ card, fsrsCard: review.fsrsCard, cardHash: card.hash, dueDate });
            }
        } else {
            fresh.push({ card, fsrsCard: null, cardHash: card.hash });
        }
    }

    // Oldest-due first — clears the most overdue material before it decays further
    due.sort((a, b) => a.dueDate - b.dueDate);

    // Keep authoring order for new cards (frontmatter order, then file path),
    // matching the deck-session sort so new material arrives in sequence.
    fresh.sort((a, b) => {
        const oa = a.card.deckMetadata?.order;
        const ob = b.card.deckMetadata?.order;
        if (oa != null && ob != null && oa !== ob) return oa - ob;
        if (oa != null && ob == null) return -1;
        if (oa == null && ob != null) return 1;
        return (a.card.source?.file || '').localeCompare(b.card.source?.file || '');
    });

    const newBudget = Math.max(0, newPerDay - newIntroducedToday);
    const newCards = fresh.slice(0, newBudget);

    return [
        ...due.map(({ card, fsrsCard, cardHash }) => ({ card, fsrsCard, cardHash })),
        ...newCards
    ];
}

/**
 * Counts for the Today hero display without building a session.
 */
export function todayQueueCounts(opts) {
    const queue = buildTodayQueue(opts);
    const due = queue.filter(q => q.fsrsCard !== null).length;
    return { due, fresh: queue.length - due, total: queue.length };
}

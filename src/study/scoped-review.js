/**
 * Partition cards for a scoped study launch. Normal deck/subject review only
 * includes due and unseen cards; an explicit chapter drill also includes cards
 * scheduled for the future so the session is a complete chapter sweep.
 */
export function partitionScopedReviewCards(cards, reviews, {
    includeScheduled = false,
    now = new Date()
} = {}) {
    const reviewMap = new Map((reviews || []).map(review => [review.cardHash, review]));
    const due = [];
    const fresh = [];
    const scheduled = [];

    for (const card of cards || []) {
        const review = reviewMap.get(card.hash);
        if (!review) {
            fresh.push({ card, fsrsCard: null, cardHash: card.hash });
            continue;
        }
        const dueDate = new Date(review.fsrsCard.due);
        const entry = {
            card,
            fsrsCard: review.fsrsCard,
            cardHash: card.hash,
            dueDate
        };
        if (dueDate <= now) due.push(entry);
        else if (includeScheduled) scheduled.push(entry);
    }

    return { due, fresh, scheduled };
}

/**
 * Continue initial learning inside an explicitly selected chapter or folder.
 * Any card with review history is already introduced, regardless of whether
 * FSRS currently considers it due. Scheduled review belongs to the separate
 * Review flow; the chapter gavel advances through unseen cards only.
 */
export function buildChapterContinuation(cards, reviews) {
    const reviewMap = new Map((reviews || []).map(review => [review.cardHash, review]));
    const queue = [];
    let introducedCards = 0;

    for (const card of cards || []) {
        if (reviewMap.has(card.hash)) {
            introducedCards++;
        } else {
            queue.push({
                card,
                fsrsCard: null,
                cardHash: card.hash,
                wasFresh: true
            });
        }
    }

    return {
        queue,
        introducedCards,
        totalCards: (cards || []).length
    };
}

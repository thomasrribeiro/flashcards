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

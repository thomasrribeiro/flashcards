function deckName(deckId) {
    return String(deckId || '').split('/').pop();
}

function positiveOrder(deck) {
    const value = Number(deck?.curriculumOrder);
    return Number.isInteger(value) && value > 0 ? value : null;
}

export function compareDecksByCurriculum(leftId, rightId, deckById) {
    const leftOrder = positiveOrder(deckById.get(leftId));
    const rightOrder = positiveOrder(deckById.get(rightId));

    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
    }
    if (leftOrder !== null && rightOrder === null) return -1;
    if (leftOrder === null && rightOrder !== null) return 1;
    return deckName(leftId).localeCompare(deckName(rightId));
}

export function sortDeckIdsByCurriculum(deckIds, deckById) {
    return [...deckIds].sort((left, right) =>
        compareDecksByCurriculum(left, right, deckById)
    );
}

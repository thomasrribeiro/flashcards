/**
 * ts-fsrs integration for spaced repetition scheduling
 */

import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';

// Initialize FSRS with optimal parameters
const f = fsrs({
    enable_fuzz: true,
    enable_short_term: false
});

/**
 * Create a new card for FSRS
 */
export function createCard() {
    return createEmptyCard();
}

/**
 * Get scheduling info for all possible grades
 * Returns object with Again, Hard, Good, Easy properties
 */
export function getScheduling(card, now = new Date()) {
    const scheduling = f.repeat(card, now);

    return {
        [Rating.Again]: scheduling[Rating.Again],
        [Rating.Hard]: scheduling[Rating.Hard],
        [Rating.Good]: scheduling[Rating.Good],
        [Rating.Easy]: scheduling[Rating.Easy]
    };
}

/**
 * Review a card and get the updated card state
 * @param {Object} card - FSRS card object
 * @param {number} grade - Rating (1=Again, 2=Hard, 3=Good, 4=Easy)
 * @param {Date} now - Current time
 * @returns {Object} - { card, log } Updated card and review log
 */
export function reviewCard(card, grade, now = new Date()) {
    const scheduling = f.repeat(card, now);
    const result = scheduling[grade];

    return {
        card: result.card,
        log: result.log
    };
}

/**
 * Get retrievability (probability of recall) for a card
 * @param {Object} card - FSRS card object
 * @param {Date} now - Current time
 * @returns {number} - Retrievability between 0 and 1
 */
export function getRetrievability(card, now = new Date()) {
    return f.get_retrievability(card, now, false);
}

/**
 * Check if a card is due for review
 * @param {Object} card - FSRS card object
 * @param {Date} now - Current time
 * @returns {boolean}
 */
export function isDue(card, now = new Date()) {
    return card.due <= now;
}

/**
 * Get days until card is due
 * @param {Object} card - FSRS card object
 * @param {Date} now - Current time
 * @returns {number} - Days (can be negative if overdue)
 */
export function getDaysUntilDue(card, now = new Date()) {
    const diffMs = card.due - now;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get all due cards from a collection
 * @param {Array} cards - Array of { cardHash, fsrsCard } objects
 * @param {Date} now - Current time
 * @returns {Array} - Filtered array of due cards
 */
export function getDueCards(cards, now = new Date()) {
    return cards.filter(({ fsrsCard }) => isDue(fsrsCard, now));
}

/**
 * Get new cards (never reviewed)
 * @param {Array} cards - Array of { cardHash, fsrsCard } objects
 * @returns {Array} - Filtered array of new cards
 */
export function getNewCards(cards) {
    return cards.filter(({ fsrsCard }) => fsrsCard.state === State.New);
}

/**
 * Export Rating enum for convenience
 */
export { Rating, State };

/**
 * Grade mapping for keyboard shortcuts
 */
export const GradeKeys = {
    '1': Rating.Again,
    '2': Rating.Hard,
    '3': Rating.Good,
    '4': Rating.Easy
};

/**
 * Grade labels
 */
export const GradeLabels = {
    [Rating.Again]: 'Again',
    [Rating.Hard]: 'Hard',
    [Rating.Good]: 'Good',
    [Rating.Easy]: 'Easy'
};

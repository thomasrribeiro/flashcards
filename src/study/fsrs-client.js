import { fsrs, createEmptyCard } from 'ts-fsrs';

const scheduler = fsrs({ enable_fuzz: true, enable_short_term: false });

export function createCard() {
    return createEmptyCard();
}

export function reviewCard(card, grade, now = new Date()) {
    const result = scheduler.repeat(card, now)[grade];
    return { card: result.card, log: result.log };
}

// Browser storage serializes Date values as strings.
export function rehydrateFsrsCard(card) {
    if (!card) return card;
    return {
        ...card,
        due: card.due instanceof Date ? card.due : new Date(card.due),
        last_review: card.last_review
            ? (card.last_review instanceof Date ? card.last_review : new Date(card.last_review))
            : undefined
    };
}

export function isDue(card, now = new Date()) {
    const due = card.due instanceof Date ? card.due : new Date(card.due);
    return due <= now;
}

/**
 * Study session application
 */

import { initDB, getCard, getAllCards, getAllReviews, saveReview, saveCards } from './storage.js';
import { reviewCard, createCard, Rating, GradeKeys, getDueCards as filterDueCards, State } from './fsrs-client.js';
import { renderCardFront, renderCardBack } from './markdown.js';
import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';

// Session state
let currentCardIndex = 0;
let dueCards = [];
let reviewedCount = 0;
let isRevealed = false;
let currentCard = null;
let currentFsrsCard = null;

// DOM elements
const cardFront = document.getElementById('card-front');
const cardBack = document.getElementById('card-back');
const revealPrompt = document.getElementById('reveal-prompt');
const gradeButtons = document.getElementById('grade-buttons');
const cardsDue = document.getElementById('cards-due');
const cardsReviewed = document.getElementById('cards-reviewed');
const studyArea = document.getElementById('study-area');
const sessionComplete = document.getElementById('session-complete');

/**
 * Ensure cards are loaded for the deck
 */
async function ensureCardsLoaded(deckId) {
    const allCards = await getAllCards();
    const deckCards = allCards.filter(card => card.deckName === deckId);

    // If cards already loaded, we're done
    if (deckCards.length > 0) {
        console.log(`[App] Found ${deckCards.length} cards for deck ${deckId}`);
        return;
    }

    console.log(`[App] No cards found for deck ${deckId}, attempting to load...`);

    // Load basics deck from local markdown
    if (deckId === 'basics') {
        const response = await fetch('/topics/example/basics.md');
        const markdown = await response.text();
        const { cards, metadata } = parseDeck(markdown, 'basics.md');

        const cardsWithMeta = cards.map(card => ({
            ...card,
            hash: hashCard(card),
            deckName: 'basics',
            deckMetadata: metadata,
            source: { repo: 'local', file: 'topics/example/basics.md' }
        }));

        await saveCards(cardsWithMeta);
        console.log(`[App] Loaded ${cardsWithMeta.length} cards for basics deck`);
    } else if (deckId.includes('/')) {
        // This is a GitHub repository deck
        // Extract the base repository from the deck ID
        const parts = deckId.split('/');
        const repoId = parts.length === 3 ? `${parts[0]}/${parts[1]}` : deckId;

        console.log(`[App] Loading repository ${repoId} for deck ${deckId}`);

        // Try to load the repository
        try {
            const { loadRepository } = await import('./repo-manager.js');
            await loadRepository(repoId);

            // Check if cards are now loaded
            const newCards = await getAllCards();
            const newDeckCards = newCards.filter(card => card.deckName === deckId);
            console.log(`[App] After loading repo, found ${newDeckCards.length} cards for deck ${deckId}`);
        } catch (error) {
            console.error(`[App] Failed to load repository ${repoId}:`, error);
            alert(`Failed to load cards for deck: ${error.message}`);
        }
    }
}

/**
 * Initialize the study session
 */
async function init() {
    await initDB();

    // Get deck from URL parameter (supports both 'deck' and legacy 'topic')
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get('deck') || urlParams.get('topic');

    if (!deckId) {
        alert('No deck specified');
        window.location.href = 'index.html';
        return;
    }

    // Load cards if needed (in-memory storage may be empty on page load)
    await ensureCardsLoaded(deckId);

    await loadDueCards();
    setupEventListeners();
    showNextCard();
}

/**
 * Load due cards for the current deck
 */
async function loadDueCards() {
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get('deck') || urlParams.get('topic');

    // Get ALL cards for this deck
    const allCards = await getAllCards();
    const deckCards = allCards.filter(card => card.deckName === deckId);

    // Get all reviews
    const allReviews = await getAllReviews();
    const reviewMap = new Map(allReviews.map(r => [r.cardHash, r]));

    // Build list of cards to study
    const cardsToStudy = [];

    for (const card of deckCards) {
        const review = reviewMap.get(card.hash);

        if (review) {
            // Card has been reviewed - check if due
            const fsrsCard = review.fsrsCard;
            if (new Date(fsrsCard.due) <= new Date()) {
                cardsToStudy.push({ card, fsrsCard, cardHash: card.hash });
            }
        } else {
            // New card - never reviewed, always include in study session
            const fsrsCard = createCard();
            cardsToStudy.push({ card, fsrsCard, cardHash: card.hash });
        }
    }

    dueCards = cardsToStudy;
    updateStats();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Spacebar to reveal
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !isRevealed) {
            e.preventDefault();
            revealAnswer();
        }
    });

    // Number keys for grading
    document.addEventListener('keydown', (e) => {
        if (isRevealed && GradeKeys[e.key]) {
            e.preventDefault();
            gradeCard(GradeKeys[e.key]);
        }
    });

    // Grade button clicks
    document.querySelectorAll('.grade-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const grade = parseInt(btn.dataset.grade);
            gradeCard(grade);
        });
    });
}

/**
 * Show the next card
 */
function showNextCard() {
    if (currentCardIndex >= dueCards.length) {
        showSessionComplete();
        return;
    }

    const cardData = dueCards[currentCardIndex];
    currentCard = cardData.card;
    currentFsrsCard = cardData.fsrsCard;
    isRevealed = false;

    // Render front
    cardFront.innerHTML = renderCardFront(currentCard);
    cardBack.innerHTML = renderCardBack(currentCard);

    // Show front, hide back
    cardFront.classList.remove('hidden');
    cardBack.classList.add('hidden');
    revealPrompt.classList.remove('hidden');
    gradeButtons.classList.add('hidden');
}

/**
 * Reveal the answer
 */
function revealAnswer() {
    isRevealed = true;

    // Show back
    cardBack.classList.remove('hidden');
    revealPrompt.classList.add('hidden');
    gradeButtons.classList.remove('hidden');
}

/**
 * Grade the current card
 */
async function gradeCard(grade) {
    if (!isRevealed) return;

    // Review the card
    const result = reviewCard(currentFsrsCard, grade, new Date());

    // Save updated FSRS state
    await saveReview(currentCard.hash, result.card);

    // Update stats
    reviewedCount++;
    updateStats();

    // Move to next card
    currentCardIndex++;
    showNextCard();
}

/**
 * Update statistics display
 */
function updateStats() {
    const remaining = dueCards.length - currentCardIndex;
    cardsDue.textContent = `${remaining} due`;
    cardsReviewed.textContent = `${reviewedCount} reviewed`;
}

/**
 * Show session complete screen
 */
function showSessionComplete() {
    studyArea.classList.add('hidden');
    sessionComplete.classList.remove('hidden');
}

// Initialize on load
init();

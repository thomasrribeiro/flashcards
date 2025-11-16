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
 * Ensure cards are loaded for the topic
 */
async function ensureCardsLoaded(topic) {
    const allCards = await getAllCards();
    const topicCards = allCards.filter(card => card.deckName === topic);

    // If cards already loaded, we're done
    if (topicCards.length > 0) {
        return;
    }

    // Load basics deck from local markdown
    if (topic === 'basics') {
        const response = await fetch('/topics/example/basics.md');
        const markdown = await response.text();
        const cards = parseDeck(markdown, 'basics.md');

        const cardsWithMeta = cards.map(card => ({
            ...card,
            hash: hashCard(card),
            deckName: 'basics',
            source: { repo: 'local', file: 'topics/example/basics.md' }
        }));

        await saveCards(cardsWithMeta);
    }
}

/**
 * Initialize the study session
 */
async function init() {
    await initDB();

    // Get topic from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const topic = urlParams.get('topic');

    if (!topic) {
        alert('No topic specified');
        window.location.href = 'index.html';
        return;
    }

    // Load cards if needed (in-memory storage may be empty on page load)
    await ensureCardsLoaded(topic);

    await loadDueCards();
    setupEventListeners();
    showNextCard();
}

/**
 * Load due cards for the current topic
 */
async function loadDueCards() {
    const urlParams = new URLSearchParams(window.location.search);
    const topic = urlParams.get('topic');

    // Get ALL cards for this topic
    const allCards = await getAllCards();
    const topicCards = allCards.filter(card => card.deckName === topic);

    // Get all reviews
    const allReviews = await getAllReviews();
    const reviewMap = new Map(allReviews.map(r => [r.cardHash, r]));

    // Build list of cards to study
    const cardsToStudy = [];

    for (const card of topicCards) {
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

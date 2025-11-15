/**
 * Study session application
 */

import { initDB, getCard, getAllReviews, saveReview } from './storage.js';
import { reviewCard, createCard, Rating, GradeKeys, getDueCards as filterDueCards } from './fsrs-client.js';
import { renderCardFront, renderCardBack } from './markdown.js';

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

    await loadDueCards();
    setupEventListeners();
    showNextCard();
}

/**
 * Load due cards for the current topic
 */
async function loadDueCards() {
    const allReviews = await getAllReviews();

    // Get cards with FSRS state
    const cardsWithState = await Promise.all(
        allReviews.map(async (review) => {
            const card = await getCard(review.cardHash);
            return {
                card,
                fsrsCard: review.fsrsCard,
                cardHash: review.cardHash
            };
        })
    );

    // Filter for due cards
    dueCards = filterDueCards(
        cardsWithState.map(({ cardHash, fsrsCard }) => ({ cardHash, fsrsCard })),
        new Date()
    );

    // Load full card data for due cards
    dueCards = await Promise.all(
        dueCards.map(async ({ cardHash, fsrsCard }) => {
            const card = await getCard(cardHash);
            return { card, fsrsCard, cardHash };
        })
    );

    // Also include new cards (cards without review state)
    const reviewedHashes = new Set(allReviews.map(r => r.cardHash));
    // For now, we'll just use due cards. New card loading will be added when we implement the build script

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

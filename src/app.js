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

    // Skip loading for basics deck and local repos - they should already be loaded
    if (deckId === 'basics' || deckId.startsWith('local/')) {
        console.error(`[App] Local deck ${deckId} should already be loaded but cards not found`);
        alert(`Failed to load cards for deck: Local deck not properly initialized. Try refreshing the page.`);
        return;
    }

    // Load GitHub repos
    if (deckId.includes('/')) {
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
    // Restore user from localStorage if exists
    const storedUser = localStorage.getItem('github_user');
    if (storedUser) {
        const { setCurrentUser } = await import('./storage.js');
        setCurrentUser(JSON.parse(storedUser));
    }

    await initDB();

    // Get deck from URL parameter (supports both 'deck' and legacy 'topic')
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get('deck') || urlParams.get('topic');

    if (!deckId) {
        alert('No deck specified');
        window.location.href = 'index.html';
        return;
    }

    // If not authenticated, load local collection repos
    if (!storedUser) {
        console.log('[App] Not authenticated - loading local collection repos...');
        const { loadLocalCollectionRepos } = await import('./main.js');
        await loadLocalCollectionRepos();
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
    const fileFilter = urlParams.get('file'); // Optional: filter by specific file
    const folderFilter = urlParams.get('folder'); // Optional: filter by folder

    // Get ALL cards for this deck
    const allCards = await getAllCards();
    let deckCards = allCards.filter(card => card.deckName === deckId);

    console.log(`[App] Total cards in deck ${deckId}: ${deckCards.length}`);

    // Filter by file if specified
    if (fileFilter) {
        // The fileFilter might be missing the "flashcards/" prefix
        // Try both with and without prefix
        deckCards = deckCards.filter(card => {
            if (!card.source?.file) return false;
            const cardPath = card.source.file;

            // Try exact match
            if (cardPath === fileFilter) return true;

            // Try with flashcards/ prefix
            if (cardPath === `flashcards/${fileFilter}`) return true;

            // Try without flashcards/ prefix
            if (cardPath.startsWith('flashcards/') && cardPath.substring(11) === fileFilter) return true;

            return false;
        });
        console.log(`[App] Filtered to ${deckCards.length} cards from file ${fileFilter}`);
        if (deckCards.length > 0) {
            console.log(`[App] Sample card path: ${deckCards[0].source?.file}`);
        }
    }

    // Filter by folder if specified (cards whose source.file starts with folder path)
    if (folderFilter) {
        // Normalize folder path (remove flashcards/ prefix if present)
        let normalizedFolder = folderFilter;
        if (normalizedFolder.startsWith('flashcards/')) {
            normalizedFolder = normalizedFolder.substring(11);
        }

        deckCards = deckCards.filter(card => {
            if (!card.source?.file) return false;

            // Normalize card file path
            let cardPath = card.source.file;
            if (cardPath.startsWith('flashcards/')) {
                cardPath = cardPath.substring(11);
            }

            // Check if card's file path starts with the folder path
            return cardPath.startsWith(normalizedFolder + '/') || cardPath.startsWith(normalizedFolder);
        });
        console.log(`[App] Filtered to ${deckCards.length} cards from folder ${folderFilter}`);
    }

    // Get all reviews
    const allReviews = await getAllReviews();
    const reviewMap = new Map(allReviews.map(r => [r.cardHash, r]));

    // Sort cards by order metadata (if present) and then by file path
    deckCards.sort((a, b) => {
        // First sort by order (if both have order metadata)
        const orderA = a.deckMetadata?.order;
        const orderB = b.deckMetadata?.order;

        if (orderA !== null && orderA !== undefined && orderB !== null && orderB !== undefined) {
            if (orderA !== orderB) {
                return orderA - orderB;
            }
        } else if (orderA !== null && orderA !== undefined) {
            return -1; // Cards with order come first
        } else if (orderB !== null && orderB !== undefined) {
            return 1; // Cards with order come first
        }

        // Then sort by file path
        const pathA = a.source?.file || '';
        const pathB = b.source?.file || '';
        return pathA.localeCompare(pathB);
    });

    console.log(`[App] Sorted ${deckCards.length} cards by order and file path`);

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
    console.log(`[App] Found ${dueCards.length} cards to study`);
    updateStats();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Reveal button click
    const revealBtn = document.getElementById('reveal-btn');
    if (revealBtn) {
        revealBtn.addEventListener('click', () => {
            revealAnswer();
        });
    }

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

/**
 * Study session application
 */

import { initDB, getCard, getAllCards, getAllReviews, saveReview, saveCards } from './storage.js';
import { reviewCard, createCard, Rating, GradeKeys, getDueCards as filterDueCards, State } from './fsrs-client.js';
import { renderCardFront, renderCardBack, parseSolutionSteps, renderSolutionStep, markdownToHtml, setCardContext } from './markdown.js';
import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';

// Session state
let currentCardIndex = 0;
let dueCards = [];
let reviewedCount = 0;
let isRevealed = false;
let currentCard = null;
let currentFsrsCard = null;

// Problem card state
let currentStepIndex = 0;
let solutionSteps = [];

// Step guidance tooltips
const stepGuidance = {
    'IDENTIFY': [
        'Restate the problem in your own words',
        'Identify what\'s being asked (the goal)',
        'Spot key information and constraints',
        'Classify the type of problem'
    ],
    'PLAN': [
        'Represent the problem (diagram, table, notation)',
        'Identify what you know and what you need to find',
        'Choose relevant methods, formulas, or strategies',
        'Outline your approach in plain language'
    ],
    'EXECUTE': [
        'Carry out your plan step-by-step',
        'Show all your work clearly',
        'Work systematically through each stage',
        'Keep your reasoning organized and logical'
    ],
    'EVALUATE': [
        'Check that your answer makes sense',
        'Verify you answered the actual question',
        'Test edge cases or special conditions',
        'Reflect: What did I learn that applies elsewhere?'
    ]
};

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
 * Render a step label with info icon
 */
function renderStepLabel(label) {
    const guidance = stepGuidance[label.toUpperCase()];
    const guidanceHtml = guidance ? guidance.map(item => `<li>${item}</li>`).join('') : '';

    return `<div class="solution-step-label">
        ${label}:
        <span class="info-icon" data-tooltip="${label}">
            <span class="info-icon-circle">i</span>
            <div class="tooltip">
                <ul>${guidanceHtml}</ul>
            </div>
        </span>
    </div>`;
}

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

    // Skip loading for local repos - they should already be loaded
    if (deckId.startsWith('local/')) {
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

    // Spacebar for reveal, number keys for grading
    document.addEventListener('keydown', (e) => {
        // Spacebar to reveal answer
        if (e.key === ' ' && !isRevealed) {
            e.preventDefault();
            revealAnswer();
        }
        // Number keys for grading
        else if (isRevealed && GradeKeys[e.key]) {
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

    // Tooltip click handling for mobile
    document.addEventListener('click', (e) => {
        const infoIcon = e.target.closest('.info-icon');

        if (infoIcon) {
            // Toggle active class on click (for mobile)
            e.preventDefault();
            e.stopPropagation();

            // Close other tooltips
            document.querySelectorAll('.info-icon.active').forEach(icon => {
                if (icon !== infoIcon) {
                    icon.classList.remove('active');
                }
            });

            // Toggle current tooltip
            infoIcon.classList.toggle('active');
        } else {
            // Click outside - close all tooltips
            document.querySelectorAll('.info-icon.active').forEach(icon => {
                icon.classList.remove('active');
            });
        }
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
    currentStepIndex = 0;

    // Render front
    cardFront.innerHTML = renderCardFront(currentCard);

    if (currentCard.type === 'problem') {
        // Parse solution steps for problem cards
        solutionSteps = parseSolutionSteps(currentCard.content.solution);

        // Show the first step's header immediately
        if (solutionSteps.length > 0) {
            const firstStepHeader = `<div class="solution-step">
                ${renderStepLabel(solutionSteps[0].label)}
            </div>`;
            cardBack.innerHTML = firstStepHeader;
            cardBack.classList.remove('hidden');
        } else {
            cardBack.innerHTML = '';
        }
    } else {
        cardBack.innerHTML = renderCardBack(currentCard);
        solutionSteps = [];
    }

    // Show front
    cardFront.classList.remove('hidden');

    // For non-problem cards, hide back initially
    if (currentCard.type !== 'problem') {
        cardBack.classList.add('hidden');
    }

    revealPrompt.classList.remove('hidden');
    gradeButtons.classList.add('hidden');

    // Reset reveal button text
    const revealBtn = document.getElementById('reveal-btn');
    if (revealBtn) {
        revealBtn.textContent = 'Reveal';
    }
}

/**
 * Reveal the answer
 */
function revealAnswer() {
    if (currentCard.type === 'problem') {
        // For problem cards, reveal current step's content and next step's header
        if (currentStepIndex < solutionSteps.length) {
            const currentStep = solutionSteps[currentStepIndex];

            // Set card context for image resolution
            setCardContext(currentCard);

            // Build HTML for current step's content
            const currentStepContent = markdownToHtml(currentStep.content.trim());
            let html = `<div class="solution-step-content">${currentStepContent}</div>`;

            // If there's a next step, add its header
            if (currentStepIndex + 1 < solutionSteps.length) {
                const nextStep = solutionSteps[currentStepIndex + 1];
                html += `<div class="solution-step">
                    ${renderStepLabel(nextStep.label)}
                </div>`;
            }

            // Append to card back
            cardBack.innerHTML += html;
            cardBack.classList.remove('hidden');

            currentStepIndex++;

            // Update button text based on progress
            if (currentStepIndex >= solutionSteps.length) {
                // All steps revealed, show grade buttons
                revealPrompt.classList.add('hidden');
                gradeButtons.classList.remove('hidden');
                isRevealed = true;
            }
        }
    } else {
        // For basic and cloze cards, single reveal
        isRevealed = true;

        if (currentCard.type === 'cloze') {
            // For cloze cards, replace the ... with the revealed answer inline
            cardFront.innerHTML = renderCardBack(currentCard);
        } else {
            // For basic cards, show the back
            cardBack.classList.remove('hidden');
        }

        revealPrompt.classList.add('hidden');
        gradeButtons.classList.remove('hidden');
    }
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

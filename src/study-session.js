/**
 * Study session module - extracted from app.js for SPA integration
 */

import { getAllCards, getAllReviews, saveReview } from './storage.js';
import { reviewCard, createCard, Rating, GradeKeys, State } from './fsrs-client.js';
import { renderCardFront, renderCardBack, parseSolutionSteps, markdownToHtml, setCardContext } from './markdown.js';

// Session state
let state = {
    currentCardIndex: 0,
    dueCards: [],
    totalCards: 0,           // Total cards in scope (for progress calculation)
    reviewedCards: 0,        // Cards already reviewed (not due)
    reviewedCount: 0,
    isRevealed: false,
    currentCard: null,
    currentFsrsCard: null,
    currentStepIndex: 0,
    solutionSteps: [],
    deckId: null,
    fileFilter: null,
    onComplete: null,
    onCardChange: null
};

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

/**
 * Get current session state (for external queries)
 */
export function getState() {
    return {
        isRevealed: state.isRevealed,
        currentCardIndex: state.currentCardIndex,
        dueCards: state.dueCards,
        reviewedCount: state.reviewedCount
    };
}

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
 * Start a study session
 * @param {string} deckId - The deck ID
 * @param {string} fileFilter - Optional file path filter
 * @param {Function} onComplete - Callback when session is complete
 * @param {Function} onCardChange - Callback when current card changes (receives card object)
 */
export async function startSession(deckId, fileFilter, onComplete, onCardChange) {
    // Reset state
    state = {
        currentCardIndex: 0,
        dueCards: [],
        totalCards: 0,
        reviewedCards: 0,
        reviewedCount: 0,
        isRevealed: false,
        currentCard: null,
        currentFsrsCard: null,
        currentStepIndex: 0,
        solutionSteps: [],
        deckId,
        fileFilter,
        onComplete,
        onCardChange
    };

    // Load due cards
    await loadDueCards(deckId, fileFilter);

    // Update stats display
    updateStats();

    // Show first card
    showNextCard();
}

/**
 * Load due cards for the session
 */
async function loadDueCards(deckId, fileFilter) {
    // Get ALL cards for this deck
    const allCards = await getAllCards();
    let deckCards = allCards.filter(card => card.deckName === deckId);

    console.log(`[StudySession] Total cards in deck ${deckId}: ${deckCards.length}`);

    // Filter by file or folder if specified
    if (fileFilter) {
        deckCards = deckCards.filter(card => {
            if (!card.source?.file) return false;
            const cardPath = card.source.file;

            // Normalize paths (remove flashcards/ prefix if present)
            const normalizedCardPath = cardPath.startsWith('flashcards/') ? cardPath.substring(11) : cardPath;
            const normalizedFilter = fileFilter.startsWith('flashcards/') ? fileFilter.substring(11) : fileFilter;

            // Try exact match (for specific files)
            if (normalizedCardPath === normalizedFilter) return true;

            // Try folder match (cards in this folder or subfolders)
            if (normalizedCardPath.startsWith(normalizedFilter + '/')) return true;

            return false;
        });
        console.log(`[StudySession] Filtered to ${deckCards.length} cards from ${fileFilter}`);
    }

    // Get all reviews
    const allReviews = await getAllReviews();
    const reviewMap = new Map(allReviews.map(r => [r.cardHash, r]));

    // Sort cards by order metadata (if present) and then by file path
    deckCards.sort((a, b) => {
        const orderA = a.deckMetadata?.order;
        const orderB = b.deckMetadata?.order;

        if (orderA !== null && orderA !== undefined && orderB !== null && orderB !== undefined) {
            if (orderA !== orderB) {
                return orderA - orderB;
            }
        } else if (orderA !== null && orderA !== undefined) {
            return -1;
        } else if (orderB !== null && orderB !== undefined) {
            return 1;
        }

        const pathA = a.source?.file || '';
        const pathB = b.source?.file || '';
        return pathA.localeCompare(pathB);
    });

    // Build list of cards to study
    const cardsToStudy = [];
    let reviewedNotDueCount = 0;

    for (const card of deckCards) {
        const review = reviewMap.get(card.hash);

        if (review) {
            const fsrsCard = review.fsrsCard;
            const dueDate = new Date(fsrsCard.due);
            const now = new Date();
            const isDue = dueDate <= now;
            console.log(`[StudySession] Card ${card.hash.substring(0, 8)}: due=${dueDate.toISOString()}, now=${now.toISOString()}, isDue=${isDue}`);
            if (isDue) {
                cardsToStudy.push({ card, fsrsCard, cardHash: card.hash });
            } else {
                // Card has been reviewed and is not yet due again
                reviewedNotDueCount++;
            }
        } else {
            console.log(`[StudySession] Card ${card.hash.substring(0, 8)}: NEW (no review found)`);
            const fsrsCard = createCard();
            cardsToStudy.push({ card, fsrsCard, cardHash: card.hash });
        }
    }

    state.dueCards = cardsToStudy;
    state.totalCards = deckCards.length;
    state.reviewedCards = reviewedNotDueCount;
    console.log(`[StudySession] Found ${state.dueCards.length} cards to study, ${state.reviewedCards} already reviewed, ${state.totalCards} total`);
}

/**
 * Show the next card
 */
export function showNextCard() {
    const cardFront = document.getElementById('card-front');
    const cardBack = document.getElementById('card-back');
    const revealPrompt = document.getElementById('reveal-prompt');
    const gradeButtons = document.getElementById('grade-buttons');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    if (state.currentCardIndex >= state.dueCards.length) {
        // Session complete
        studyArea.classList.add('hidden');
        sessionComplete.classList.remove('hidden');
        if (state.onComplete) {
            state.onComplete();
        }
        return;
    }

    const cardData = state.dueCards[state.currentCardIndex];
    state.currentCard = cardData.card;
    state.currentFsrsCard = cardData.fsrsCard;
    state.isRevealed = false;
    state.currentStepIndex = 0;

    // Notify listener of card change
    if (state.onCardChange) {
        state.onCardChange(state.currentCard);
    }

    // Render front
    cardFront.innerHTML = renderCardFront(state.currentCard);

    if (state.currentCard.type === 'problem') {
        // Parse solution steps for problem cards
        state.solutionSteps = parseSolutionSteps(state.currentCard.content.solution);

        if (state.solutionSteps.length > 0) {
            const firstStepHeader = `<div class="solution-step">
                ${renderStepLabel(state.solutionSteps[0].label)}
            </div>`;
            cardBack.innerHTML = firstStepHeader;
            cardBack.classList.remove('hidden');
        } else {
            cardBack.innerHTML = '';
        }
    } else {
        cardBack.innerHTML = renderCardBack(state.currentCard);
        state.solutionSteps = [];
    }

    // Show front
    cardFront.classList.remove('hidden');

    // For non-problem cards, hide back initially
    if (state.currentCard.type !== 'problem') {
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
export function revealAnswer() {
    const cardFront = document.getElementById('card-front');
    const cardBack = document.getElementById('card-back');
    const revealPrompt = document.getElementById('reveal-prompt');
    const gradeButtons = document.getElementById('grade-buttons');

    if (state.currentCard.type === 'problem') {
        // For problem cards, reveal current step's content and next step's header
        if (state.currentStepIndex < state.solutionSteps.length) {
            const currentStep = state.solutionSteps[state.currentStepIndex];

            // Set card context for image resolution
            setCardContext(state.currentCard);

            // Build HTML for current step's content
            const currentStepContent = markdownToHtml(currentStep.content.trim());
            let html = `<div class="solution-step-content">${currentStepContent}</div>`;

            // If there's a next step, add its header
            if (state.currentStepIndex + 1 < state.solutionSteps.length) {
                const nextStep = state.solutionSteps[state.currentStepIndex + 1];
                html += `<div class="solution-step">
                    ${renderStepLabel(nextStep.label)}
                </div>`;
            }

            // Append to card back
            cardBack.innerHTML += html;
            cardBack.classList.remove('hidden');

            state.currentStepIndex++;

            // Update button text based on progress
            if (state.currentStepIndex >= state.solutionSteps.length) {
                revealPrompt.classList.add('hidden');
                gradeButtons.classList.remove('hidden');
                state.isRevealed = true;
            }
        }
    } else {
        // For basic and cloze cards, single reveal
        state.isRevealed = true;

        if (state.currentCard.type === 'cloze') {
            cardFront.innerHTML = renderCardBack(state.currentCard);
        } else {
            cardBack.classList.remove('hidden');
        }

        revealPrompt.classList.add('hidden');
        gradeButtons.classList.remove('hidden');
    }
}

/**
 * Grade the current card
 */
export async function gradeCard(grade) {
    if (!state.isRevealed) return;

    // Review the card
    const result = reviewCard(state.currentFsrsCard, grade, new Date());

    console.log(`[StudySession] Graded card ${state.currentCard.hash.substring(0, 8)} with grade ${grade}`);
    console.log(`[StudySession] New due date: ${result.card.due}`);

    // Save updated FSRS state
    await saveReview(state.currentCard.hash, result.card);

    // Update stats and move to next card
    state.reviewedCount++;
    state.currentCardIndex++;

    // Update progress bar (now using incremented index)
    updateStats();

    // Show next card
    showNextCard();
}

/**
 * Update progress bar display
 * Progress = (already reviewed cards + cards reviewed in this session) / total cards
 */
function updateStats() {
    const progressFill = document.getElementById('study-progress-fill');
    const progressPercent = document.getElementById('study-progress-percent');

    if (progressFill && state.totalCards > 0) {
        // Progress counts cards already reviewed (not due) + cards reviewed in current session
        const completed = state.reviewedCards + state.currentCardIndex;
        const percent = Math.round((completed / state.totalCards) * 100);
        progressFill.style.width = `${percent}%`;
        if (progressPercent) {
            progressPercent.textContent = `${percent}%`;
        }
        console.log(`[StudySession] Progress: ${completed}/${state.totalCards} (${percent}%) - reviewedCards=${state.reviewedCards}, currentCardIndex=${state.currentCardIndex}`);
    }
}

/**
 * Cleanup session state
 */
export function cleanup() {
    state = {
        currentCardIndex: 0,
        dueCards: [],
        totalCards: 0,
        reviewedCards: 0,
        reviewedCount: 0,
        isRevealed: false,
        currentCard: null,
        currentFsrsCard: null,
        currentStepIndex: 0,
        solutionSteps: [],
        deckId: null,
        fileFilter: null,
        onComplete: null,
        onCardChange: null
    };
}

// Re-export GradeKeys for use in main.js keyboard handling
export { GradeKeys };

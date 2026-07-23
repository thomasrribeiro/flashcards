/**
 * Study session module - extracted from app.js for SPA integration
 */

import { getAllCards, getAllReviews, saveReview } from './storage.js';
import { reviewCard, createCard, Rating, GradeKeys, State } from './fsrs-client.js';
import { recordReviewLocally } from './habit-client.js';
import { renderCardFront, renderCardBack, parseSolutionSteps, markdownToHtml, setCardContext } from './markdown.js';
import { buildChapterContinuation, partitionScopedReviewCards } from './scoped-review.js';

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
    scopeTotalCards: 0,
    introducedCards: 0,
    newlyIntroducedCards: 0,
    onComplete: null,
    onCardChange: null,
    onProgress: null
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
        totalCards: state.totalCards,
        reviewedCards: state.reviewedCards,
        reviewedCount: state.reviewedCount,
        currentCard: state.currentCard,
        deckId: state.deckId
    };
}

/**
 * Render a step label with info icon
 */
function renderStepLabel(label) {
    const guidance = stepGuidance[label.toUpperCase()];
    if (!guidance) {
        return `<div class="solution-step-label">${label}:</div>`;
    }
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
 * Start a drill-all session: pool cards from every deck and shuffle them.
 * Uses the normal FSRS scheduling path so reviews still count.
 */
export async function startDrillSession(onComplete, onCardChange, options = {}) {
    const { maxCards = 50, subject = null, activeDeckIds = null } = options;

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
        deckId: '__drill-all__',
        fileFilter: null,
        scopeTotalCards: 0,
        introducedCards: 0,
        newlyIntroducedCards: 0,
        onComplete,
        onCardChange,
        onProgress: null
    };

    const allCards = await getAllCards();
    const allReviews = await getAllReviews();
    const reviewMap = new Map(allReviews.map(r => [r.cardHash, r]));

    // Filter by active decks if provided (takes priority), else by subject
    let filteredCards = allCards;
    if (activeDeckIds && activeDeckIds.length > 0) {
        const active = new Set(activeDeckIds);
        filteredCards = allCards.filter(card => active.has(card.source?.repo || card.deckName));
    } else if (subject !== null) {
        filteredCards = allCards.filter(card => {
            const cardSubject = (card.deckMetadata?.subject && card.deckMetadata.subject.trim())
                ? card.deckMetadata.subject.trim().toLowerCase()
                : 'misc';
            return cardSubject === subject;
        });
    }

    // Shuffle all cards with Fisher-Yates
    const pool = [...filteredCards];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const picked = pool.slice(0, maxCards);
    const cardsToStudy = picked.map(card => {
        const review = reviewMap.get(card.hash);
        const fsrsCard = review ? review.fsrsCard : createCard();
        return { card, fsrsCard, cardHash: card.hash };
    });

    state.dueCards = cardsToStudy;
    state.totalCards = cardsToStudy.length;
    state.reviewedCards = 0;

    updateStats();
    showNextCard();
}

/**
 * Start a Today session from a prebuilt queue (see today-queue.js).
 * Entries with fsrsCard === null are new cards and get a fresh FSRS card.
 */
export function startTodaySession(queue, onComplete, onCardChange, {
    completedCards = 0,
    onProgress = null,
    fileFilter = null,
    scopeTotalCards = 0,
    introducedCards = 0
} = {}) {
    const completed = Math.max(0, Math.floor(Number(completedCards) || 0));
    const scopeTotal = Math.max(0, Math.floor(Number(scopeTotalCards) || 0));
    const introduced = Math.min(
        scopeTotal,
        Math.max(0, Math.floor(Number(introducedCards) || 0))
    );
    state = {
        currentCardIndex: 0,
        dueCards: queue.map(({ card, fsrsCard, cardHash }) => ({
            card,
            fsrsCard: fsrsCard || createCard(),
            cardHash,
            wasFresh: fsrsCard === null
        })),
        totalCards: completed + queue.length,
        reviewedCards: completed,
        reviewedCount: 0,
        isRevealed: false,
        currentCard: null,
        currentFsrsCard: null,
        currentStepIndex: 0,
        solutionSteps: [],
        deckId: '__today__',
        fileFilter,
        scopeTotalCards: scopeTotal,
        introducedCards: introduced,
        newlyIntroducedCards: 0,
        onComplete,
        onCardChange,
        onProgress
    };

    updateStats();
    showNextCard();
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
        scopeTotalCards: 0,
        introducedCards: 0,
        newlyIntroducedCards: 0,
        onComplete,
        onCardChange,
        onProgress: null
    };

    // Load due cards
    await loadDueCards(deckId, fileFilter, {
        continueChapter: Boolean(fileFilter)
    });

    // Update stats display
    updateStats();

    // Show first card
    showNextCard();
}

/**
 * Load due cards for the session
 */
async function loadDueCards(deckId, fileFilter, { continueChapter = false } = {}) {
    // Get ALL cards for this deck
    const allCards = await getAllCards();
    let deckCards = allCards.filter(card => card.deckName === deckId || card.source?.repo === deckId);

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

    let cardsToStudy;
    if (continueChapter) {
        const continuation = buildChapterContinuation(deckCards, allReviews);
        cardsToStudy = continuation.queue.map(entry => ({
            ...entry,
            fsrsCard: createCard()
        }));
        state.scopeTotalCards = continuation.totalCards;
        state.introducedCards = continuation.introducedCards;
    } else {
        const { due, fresh } = partitionScopedReviewCards(deckCards, allReviews);
        cardsToStudy = [
            ...due.map(entry => ({ ...entry, wasFresh: false })),
            ...fresh.map(entry => ({ ...entry, wasFresh: true }))
        ].map(entry => ({
            ...entry,
            fsrsCard: entry.fsrsCard || createCard()
        }));
        state.scopeTotalCards = deckCards.length;
        state.introducedCards = deckCards.length - fresh.length;
    }

    state.dueCards = cardsToStudy;
    state.totalCards = cardsToStudy.length;
    state.reviewedCards = 0;
    state.newlyIntroducedCards = 0;
    console.log(`[StudySession] Found ${state.totalCards} cards to study`);
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
        } else if (state.solutionSteps.length === 0) {
            // A legacy or externally authored problem may not use recognized
            // IPEE headings. Never leave the learner on an inert Reveal button:
            // show the complete solution as a safe fallback and allow grading.
            setCardContext(state.currentCard);
            cardBack.innerHTML = `<div class="solution-step-content">${
                markdownToHtml(state.currentCard.content.solution || '')
            }</div>`;
            cardBack.classList.remove('hidden');
            revealPrompt.classList.add('hidden');
            gradeButtons.classList.remove('hidden');
            state.isRevealed = true;
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
    if (!state.isRevealed || !state.currentCard) return;

    const gradedEntry = state.dueCards[state.currentCardIndex];

    // Review the card
    const result = reviewCard(state.currentFsrsCard, grade, new Date());

    console.log(`[StudySession] Graded card ${state.currentCard.hash?.substring(0, 8)} with grade ${grade}`);
    console.log(`[StudySession] New due date: ${result.card.due}`);

    // Save updated FSRS state, with the review log for habit/analytics tracking
    await saveReview(state.currentCard.hash, result.card, result.log);
    recordReviewLocally(result.log);

    // Update stats and move to next card
    if (gradedEntry?.wasFresh) state.newlyIntroducedCards++;
    state.reviewedCount++;
    state.currentCardIndex++;

    // Update progress bar (now using incremented index)
    updateStats();
    state.onProgress?.(getState());

    // Show next card
    showNextCard();
}

/**
 * Update progress bar display
 * Progress = (completed before resume + completed now) / session cards
 */
export function studyProgressSnapshot(sessionState) {
    const sessionCompleted = Math.max(
        0,
        (Number(sessionState.reviewedCards) || 0)
            + (Number(sessionState.currentCardIndex) || 0)
    );
    const sessionTotal = Math.max(0, Number(sessionState.totalCards) || 0);
    const scopeTotal = Math.max(0, Number(sessionState.scopeTotalCards) || 0);
    const introduced = Math.min(
        scopeTotal,
        Math.max(
            0,
            (Number(sessionState.introducedCards) || 0)
                + (Number(sessionState.newlyIntroducedCards) || 0)
        )
    );
    const isChapterSweep = Boolean(sessionState.fileFilter && scopeTotal > 0);
    const completed = isChapterSweep ? introduced : sessionCompleted;
    const total = isChapterSweep ? scopeTotal : sessionTotal;

    return {
        completed,
        total,
        percent: total ? Math.round((completed / total) * 100) : 0,
        isChapterSweep
    };
}

function updateStats() {
    const progressFill = document.getElementById('study-progress-fill');
    const progressPercent = document.getElementById('study-progress-percent');
    const progressLabel = document.getElementById('study-progress-label');

    if (progressFill) {
        const {
            completed,
            total,
            percent,
            isChapterSweep
        } = studyProgressSnapshot(state);
        progressFill.style.width = `${percent}%`;
        if (progressLabel) progressLabel.textContent = 'Progress:';
        if (progressPercent) {
            progressPercent.innerHTML = `<span>${percent}%</span> <span class="study-progress-count">(${completed}/${total})</span>`;
        }
        console.log(`[StudySession] ${isChapterSweep ? 'Chapter' : 'Session'} progress: ${completed}/${total} (${percent}%)`);
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
        scopeTotalCards: 0,
        introducedCards: 0,
        newlyIntroducedCards: 0,
        onComplete: null,
        onCardChange: null,
        onProgress: null
    };
}

// Re-export GradeKeys for use in main.js keyboard handling
export { GradeKeys };

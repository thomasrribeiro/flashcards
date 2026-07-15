import {
    clearCardContext,
    markdownToHtml,
    parseSolutionSteps,
    renderCardBack,
    renderCardFront,
    setCardContext
} from './markdown.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/** Preserve authored order, including separate scheduled cloze deletions. */
export function orderCardsForBrowsing(cards) {
    return [...(cards || [])].sort((a, b) => {
        const lineA = Number(a.range?.[0] ?? Number.MAX_SAFE_INTEGER);
        const lineB = Number(b.range?.[0] ?? Number.MAX_SAFE_INTEGER);
        if (lineA !== lineB) return lineA - lineB;

        const idA = a.stableId || a.hash || '';
        const idB = b.stableId || b.hash || '';
        return idA.localeCompare(idB, undefined, { numeric: true });
    });
}

function cardTypeLabel(type) {
    if (type === 'basic') return 'Q/A';
    if (type === 'cloze') return 'Cloze';
    if (type === 'problem') return 'Problem';
    return type || 'Card';
}

function renderProblemSolution(card) {
    setCardContext(card);
    try {
        const steps = parseSolutionSteps(card.content?.solution || '');
        if (steps.length === 0) return markdownToHtml(card.content?.solution || '');
        return steps.map(step => `
            <div class="browser-solution-step">
                <div class="solution-step-label">${escapeHtml(step.label)}:</div>
                <div class="solution-step-content">${markdownToHtml(step.content.trim())}</div>
            </div>`).join('');
    } finally {
        clearCardContext();
    }
}

function renderAnswer(card) {
    if (card.type === 'problem') {
        return `<div class="answer-separator browser-problem-answer">${renderProblemSolution(card)}</div>`;
    }
    return renderCardBack(card) || '';
}

export function renderBrowsableCard(card, index, total) {
    const identity = card.stableId || card.hash || 'unstable-card';

    return `
        <article class="browser-card" data-card-id="${escapeHtml(identity)}">
            <div class="browser-card-meta">
                <span>Card ${index + 1}/${total}</span>
                <span>${escapeHtml(cardTypeLabel(card.type))}</span>
                <span title="Stable card ID">${escapeHtml(identity)}</span>
            </div>
            <section class="browser-card-side">
                <div class="browser-side-label">Front</div>
                <div class="card-content">${renderCardFront(card) || ''}</div>
            </section>
            <section class="browser-card-side browser-card-answer">
                <div class="browser-side-label">Answer</div>
                <div class="card-content">${renderAnswer(card)}</div>
            </section>
        </article>`;
}

export function renderBrowsableCards(cards) {
    const ordered = orderCardsForBrowsing(cards);
    return ordered.map((card, index) => renderBrowsableCard(card, index, ordered.length)).join('');
}

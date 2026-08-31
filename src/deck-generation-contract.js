export const DECK_PLAN_WORKFLOW_VERSION = 'deck-plan-v3';
export const CHAPTER_CONTENT_WORKFLOW_VERSION = 'chapter-content-v1';
export const TARGET_ONLY_PREREQUISITE_PLAN_INSTRUCTION =
    'The user explicitly chose to continue planning only the requested deck despite missing prerequisite chapter curricula. Honor that recorded choice without asking again, keep the declared prerequisite boundary explicit, and do not expand the write scope.';

const GIT_COMMIT = /^[a-f0-9]{40}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;

const INCOMPLETE_DECK_STATUSES = new Set(['proposed', 'planned', 'scaffolded', 'chapter-planned']);

export function deckNeedsChapterCurriculum(deck) {
    return Boolean(
        deck?.id
        && INCOMPLETE_DECK_STATUSES.has(String(deck.status || '').toLowerCase())
        && (!Array.isArray(deck.chapters) || deck.chapters.length === 0)
    );
}

export function deckCanPlanChapterCurriculum(deck) {
    return Boolean(deck?.id);
}

export function unplannedPrerequisiteDecks(catalog, targetDeckId) {
    const decks = Array.isArray(catalog) ? catalog : catalog?.decks;
    if (!Array.isArray(decks) || !targetDeckId) return [];

    const byId = new Map(decks.filter(deck => deck?.id).map(deck => [deck.id, deck]));
    const target = byId.get(targetDeckId);
    if (!target) return [];

    const visited = new Set();
    const visiting = new Set();
    const ordered = [];
    const visit = deckId => {
        if (visited.has(deckId) || visiting.has(deckId)) return;
        const deck = byId.get(deckId);
        if (!deck) return;
        visiting.add(deckId);
        for (const prerequisite of deck.prerequisites || []) visit(prerequisite);
        visiting.delete(deckId);
        visited.add(deckId);
        if (!Array.isArray(deck.chapters) || deck.chapters.length === 0) ordered.push(deck);
    };

    for (const prerequisite of target.prerequisites || []) visit(prerequisite);
    return ordered;
}

function validateDeckWorkflowProvenance(input, expectedWorkflowVersion, label) {
    if (input.workflowVersion !== expectedWorkflowVersion) {
        throw new Error(`Unsupported ${label} workflow: ${input.workflowVersion || '(missing)'}`);
    }
    const provenance = {
        workflowVersion: expectedWorkflowVersion,
        workflowCommit: String(input.workflowCommit || '').toLowerCase(),
        registryBaseCommit: String(input.registryBaseCommit || '').toLowerCase(),
        catalogHash: String(input.catalogHash || '').toLowerCase(),
        registryRef: String(input.registryRef || 'master'),
        catalogPath: String(input.catalogPath || 'dist/curriculum.json')
    };
    const errors = [];
    if (!GIT_COMMIT.test(provenance.workflowCommit)) {
        errors.push('The deployed deck-planning workflow does not have a pinned Git commit.');
    }
    if (!GIT_COMMIT.test(provenance.registryBaseCommit)) {
        errors.push('The active curriculum registry does not have a pinned Git commit. Refresh it before generating.');
    }
    if (!SHA256.test(provenance.catalogHash)) {
        errors.push('The active curriculum catalog does not have a reproducible SHA-256. Refresh it before generating.');
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(provenance.registryRef) || provenance.registryRef.includes('..')) {
        errors.push('The curriculum registry ref is invalid.');
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(provenance.catalogPath)
        || provenance.catalogPath.includes('..')
        || provenance.catalogPath.startsWith('/')) {
        errors.push('The curriculum catalog path is invalid.');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    return provenance;
}

export function validateDeckPlanProvenance(input = {}) {
    return validateDeckWorkflowProvenance(input, DECK_PLAN_WORKFLOW_VERSION, 'deck-plan');
}

export function validateChapterContentProvenance(input = {}) {
    return validateDeckWorkflowProvenance(
        input,
        CHAPTER_CONTENT_WORKFLOW_VERSION,
        'chapter-content'
    );
}

export function chapterContentGenerationScope(deck, chapter) {
    if (!deck?.id || !chapter?.id) return null;
    const status = String(deck.status || '').toLowerCase();
    const order = Number(chapter.order ?? String(chapter.id).slice(0, 2));
    if (order === 1 && (INCOMPLETE_DECK_STATUSES.has(status) || status === 'pilot-built')) {
        return 'pilot';
    }
    if (['pilot-approved', 'full-built', 'built', 'active'].includes(status)) return 'chapter';
    return null;
}

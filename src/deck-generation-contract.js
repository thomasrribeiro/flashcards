export const DECK_PLAN_WORKFLOW_VERSION = 'deck-plan-v2';

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

export function validateDeckPlanProvenance(input = {}) {
    if (input.workflowVersion !== DECK_PLAN_WORKFLOW_VERSION) {
        throw new Error(`Unsupported deck-plan workflow: ${input.workflowVersion || '(missing)'}`);
    }
    const provenance = {
        workflowVersion: DECK_PLAN_WORKFLOW_VERSION,
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

export function chapterContentGenerationScope(deck, chapter) {
    if (!deck?.id || !chapter?.id || Number(chapter.card_count || 0) > 0) return null;
    const status = String(deck.status || '').toLowerCase();
    const order = Number(chapter.order ?? String(chapter.id).slice(0, 2));
    if (order === 1 && INCOMPLETE_DECK_STATUSES.has(status)) return 'pilot';
    if (status === 'pilot-approved') return 'chapter';
    return null;
}

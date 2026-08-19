export const DECK_PLAN_WORKFLOW_VERSION = 'deck-plan-v1';

const INCOMPLETE_DECK_STATUSES = new Set(['proposed', 'planned', 'scaffolded', 'chapter-planned']);

export function deckNeedsChapterCurriculum(deck) {
    return Boolean(
        deck?.id
        && INCOMPLETE_DECK_STATUSES.has(String(deck.status || '').toLowerCase())
        && (!Array.isArray(deck.chapters) || deck.chapters.length === 0)
    );
}

export function chapterContentGenerationScope(deck, chapter) {
    if (!deck?.id || !chapter?.id || Number(chapter.card_count || 0) > 0) return null;
    const status = String(deck.status || '').toLowerCase();
    const order = Number(chapter.order ?? String(chapter.id).slice(0, 2));
    if (order === 1 && INCOMPLETE_DECK_STATUSES.has(status)) return 'pilot';
    if (status === 'pilot-approved') return 'chapter';
    return null;
}

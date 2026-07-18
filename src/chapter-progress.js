import { SCOPE_SEP } from './today-queue.js';

export function chapterProgressScope(repo, filepath) {
    return `${repo}${SCOPE_SEP}${filepath || ''}`;
}

function deckFiles(deck) {
    return (deck?.files || []).map(file => ({
        path: typeof file === 'string' ? file : file.path,
        sha: typeof file === 'string' ? null : file.sha || null
    }));
}

/**
 * Find chapters whose durable completion snapshot is missing or belongs to an
 * older GitHub blob. Only active or previously reviewed chapters are fetched.
 */
export function chapterProgressTargets(decks, reviews, storedProgress, activeScopes) {
    const storedByScope = new Map((storedProgress || []).map(progress => [
        chapterProgressScope(progress.repo, progress.filepath),
        progress
    ]));
    const reviewedScopes = new Set((reviews || [])
        .filter(review => review.repo && review.filepath)
        .map(review => chapterProgressScope(review.repo, review.filepath)));
    const hasUnmappedReviews = (reviews || []).some(review =>
        !review.repo || !review.filepath);
    const targets = [];

    for (const deck of decks || []) {
        if (!deck?.id || deck.id.startsWith('local/')) continue;
        for (const file of deckFiles(deck)) {
            const scope = chapterProgressScope(deck.id, file.path);
            if (!hasUnmappedReviews
                && !reviewedScopes.has(scope)
                && !activeScopes?.has(scope)) continue;

            const stored = storedByScope.get(scope);
            const current = stored
                && (!file.sha || stored.sourceSha === file.sha);
            if (!current) {
                targets.push({
                    repo: deck.id,
                    filepath: file.path,
                    sourceSha: file.sha
                });
            }
        }
    }
    return targets;
}

export function buildChapterProgressSnapshot(cards, reviews, target) {
    const chapterCards = (cards || []).filter(card =>
        (card.source?.repo || card.deckName) === target.repo
        && card.source?.file === target.filepath);
    if (chapterCards.length === 0) return null;
    const reviewedHashes = new Set((reviews || []).map(review => review.cardHash));
    return {
        repo: target.repo,
        filepath: target.filepath,
        sourceSha: chapterCards[0]?.source?.sha || target.sourceSha || null,
        totalCards: chapterCards.length,
        reviewedCards: chapterCards.filter(card =>
            reviewedHashes.has(card.hash)).length
    };
}

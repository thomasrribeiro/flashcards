function subjectSlug(subject) {
    return String(subject || 'misc')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'misc';
}

function curriculumIdForRepository(deck) {
    if (deck?.curriculumId) return deck.curriculumId;
    const repositoryName = String(deck?.id || deck?.repo || '').split('/').pop();
    return repositoryName ? `${subjectSlug(deck?.subject)}/${repositoryName}` : '';
}

function reviewRepository(review, cardsByHash) {
    if (review?.repo) return review.repo;
    const card = cardsByHash.get(review?.cardHash);
    return card?.source?.repo || card?.deckName || '';
}

function currentChapterProgress(progress, file) {
    if (!progress || Number(progress.totalCards) <= 0) return false;
    if (file?.sha && progress.sourceSha && file.sha !== progress.sourceSha) return false;
    return Number(progress.reviewedCards) >= Number(progress.totalCards);
}

export function curriculumChapterProgressStates(
    curriculumDecks = [],
    repositories = [],
    reviews = [],
    chapterProgress = [],
    now = new Date()
) {
    const states = new Map();
    const repositoryByCurriculumId = new Map(repositories.map(repository => [
        curriculumIdForRepository(repository),
        repository
    ]));
    const progressByScope = new Map(chapterProgress.map(progress => [
        `${progress.repo}\u0000${progress.filepath}`,
        progress
    ]));
    const dueScopes = new Set(reviews.flatMap(review => {
        const due = new Date(review?.fsrsCard?.due);
        return review?.repo && review?.filepath && !Number.isNaN(due.getTime()) && due <= now
            ? [`${review.repo}\u0000${review.filepath}`]
            : [];
    }));

    for (const curriculumDeck of curriculumDecks || []) {
        const repository = repositoryByCurriculumId.get(curriculumDeck.id);
        const files = new Map((repository?.files || []).map(file => {
            const normalized = typeof file === 'string' ? { path: file, sha: null } : file;
            return [normalized.path, normalized];
        }));
        for (const chapter of curriculumDeck.chapters || []) {
            const id = `${curriculumDeck.id}#${chapter.id}`;
            if (Number(chapter.card_count || 0) <= 0) {
                states.set(id, 'unavailable');
                continue;
            }
            const scope = repository ? `${repository.id || repository.repo}\u0000${chapter.file}` : '';
            const complete = scope
                && currentChapterProgress(progressByScope.get(scope), files.get(chapter.file))
                && !dueScopes.has(scope);
            states.set(id, complete ? 'complete' : 'learning');
        }
    }
    return states;
}

/**
 * Derive display-only curriculum states without loading card bodies. Durable
 * chapter progress establishes completion; review due dates can turn a
 * completed deck yellow again when retrieval practice is needed.
 */
export function curriculumDeckProgressStates(
    decks = [],
    cards = [],
    reviews = [],
    chapterProgress = [],
    now = new Date()
) {
    const states = new Map();
    const cardsByHash = new Map(cards.map(card => [card.hash, card]));
    const progressByRepository = new Map();
    for (const progress of chapterProgress) {
        if (!progressByRepository.has(progress.repo)) progressByRepository.set(progress.repo, new Map());
        progressByRepository.get(progress.repo).set(progress.filepath, progress);
    }
    const dueRepositories = new Set(reviews.flatMap(review => {
        const due = new Date(review?.fsrsCard?.due);
        const repository = reviewRepository(review, cardsByHash);
        return repository && !Number.isNaN(due.getTime()) && due <= now ? [repository] : [];
    }));

    for (const deck of decks) {
        const curriculumId = curriculumIdForRepository(deck);
        const repository = deck.id || deck.repo;
        if (!curriculumId || !repository) continue;
        const files = (deck.files || []).map(file => typeof file === 'string'
            ? { path: file, sha: null }
            : { path: file.path, sha: file.sha || null });
        const progress = progressByRepository.get(repository) || new Map();
        const complete = files.length > 0 && files.every(file => {
            const snapshot = progress.get(file.path);
            if (!snapshot || Number(snapshot.totalCards) <= 0) return false;
            if (file.sha && snapshot.sourceSha && file.sha !== snapshot.sourceSha) return false;
            return Number(snapshot.reviewedCards) >= Number(snapshot.totalCards);
        });
        states.set(curriculumId, complete && !dueRepositories.has(repository) ? 'complete' : 'learning');
    }
    return states;
}

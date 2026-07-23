function normalizedCurriculumId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Return the effective collection after applying explicit deck replacements.
 *
 * A replacement is intentionally declared by the installed successor through
 * `supersedes` in deck.toml. We never infer replacement from repository name,
 * subject, or curriculum order, because independently authored decks may share
 * any of those properties.
 */
export function reconcileSupersededDecks(decks = []) {
    const supersededIds = new Set(
        decks.flatMap(deck => deck.supersedes || [])
            .map(normalizedCurriculumId)
            .filter(Boolean)
    );

    if (supersededIds.size === 0) return [...decks];

    return decks.filter(deck =>
        !supersededIds.has(normalizedCurriculumId(deck.curriculumId))
    );
}

export function supersededRepositoryIds(decks = []) {
    const effectiveRepoIds = new Set(
        reconcileSupersededDecks(decks).map(deck => deck.id)
    );
    return new Set(
        decks
            .filter(deck => !effectiveRepoIds.has(deck.id))
            .map(deck => deck.id)
    );
}

export function scopesWithoutRepositories(scopes = [], repositoryIds = []) {
    const removed = new Set(repositoryIds);
    return scopes.filter(scope => {
        const value = String(scope || '');
        const separator = value.indexOf('\0');
        const repoId = separator >= 0 ? value.slice(0, separator) : value;
        return !removed.has(repoId);
    });
}

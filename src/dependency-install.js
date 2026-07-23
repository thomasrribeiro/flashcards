/**
 * Install the configured repositories in a prerequisite plan.
 *
 * This deliberately knows nothing about the learner's starred study scope.
 * Adding repositories to the collection and choosing daily study material are
 * separate user decisions.
 */
export async function installAvailableDependencyDecks(plan, loadRepositoryMetadata) {
    const failures = [];
    for (const deck of plan?.requiredDecks || []) {
        if (!deck.repository?.configured) continue;
        const repo = deck.repository.url
            ?.replace(/^https:\/\/github\.com\//, '')
            .replace(/\.git$/, '');
        if (!repo) continue;
        try {
            await loadRepositoryMetadata(repo);
        } catch (error) {
            failures.push(`${deck.id}: ${error.message}`);
        }
    }
    return failures;
}

/**
 * Repository manager for handling GitHub repos and cards
 */

import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';
import * as githubClient from './github-client.js';
import { saveCards, getAllCards, saveRepoMetadata, getRepoMetadata, getAllRepos, markRepoLoaded } from './storage.js';

/**
 * Load cards from a GitHub repository
 */
export async function loadRepository(repoString) {
    console.log(`\n=== [RepoManager] Loading repository: ${repoString} ===`);
    const { owner, repo } = githubClient.parseRepoString(repoString);
    console.log(`[RepoManager] Parsed as owner="${owner}" repo="${repo}"`);

    // Fetch repository info
    console.log('[RepoManager] Fetching repository info from GitHub...');
    const repoInfo = await githubClient.getRepository(owner, repo);
    console.log(`[RepoManager] Repo info fetched: ${repoInfo.full_name}`);

    // Detect transferred/renamed repos: GitHub's REST API follows redirects transparently,
    // so a successful 200 can still come from a different full_name than we asked for.
    // Treat this like a 404 so the caller auto-evicts the stale D1 entry instead of
    // creating a duplicate deck under the old path.
    const requested = `${owner}/${repo}`.toLowerCase();
    const actual = (repoInfo.full_name || '').toLowerCase();
    if (actual && actual !== requested) {
        const err = new Error(`Repository ${requested} has moved to ${repoInfo.full_name}`);
        err.status = 404;
        err.movedTo = repoInfo.full_name;
        throw err;
    }

    // Fetch all markdown files from flashcards/ folder only.
    // Pass default_branch to avoid a redundant getRepository call inside getMarkdownFiles.
    console.log('[RepoManager] Fetching markdown files from flashcards/...');
    const markdownFiles = await githubClient.getMarkdownFiles(owner, repo, 'flashcards', repoInfo.default_branch);
    console.log(`[RepoManager] Found ${markdownFiles.length} markdown files in flashcards/`);

    if (markdownFiles.length === 0) {
        throw new Error(`No markdown files found in ${owner}/${repo}/flashcards/. Repos must have a flashcards/ folder.`);
    }

    // Parse cards from each file - ONE deck per repo
    const allCards = [];
    let totalFiles = 0;

    // Single deck ID for the entire repository
    const deckId = `${owner}/${repo}`;
    console.log(`[RepoManager] Creating single deck for repository: ${deckId}`);

    // Aggregate metadata from files
    let deckMetadata = {
        order: null,
        tags: [],
        subject: null,
        topic: null
    };

    // Sort files by path (respects 01_, 02_ prefixes)
    const sortedFiles = [...markdownFiles].sort((a, b) => a.path.localeCompare(b.path));
    console.log('[RepoManager] File processing order:', sortedFiles.map(f => f.path));

    // Fetch all file contents in parallel (SHA enables localStorage cache hits)
    const fileContents = await Promise.all(
        sortedFiles.map(async (file) => {
            try {
                const content = await githubClient.getFileContent(owner, repo, file.path, file.sha);
                return { file, content, ok: true };
            } catch (error) {
                console.error(`[RepoManager] Error fetching ${file.path}:`, error);
                return { file, content: null, ok: false };
            }
        })
    );

    for (const { file, content, ok } of fileContents) {
        if (!ok) continue;
        try {
            console.log(`[RepoManager] Processing file: ${file.path} (${content.length} chars)`);

            const { cards, metadata } = parseDeck(content, file.path);
            console.log(`[RepoManager] Parsed ${cards.length} cards from ${file.path}`);

            // Aggregate metadata: use order from first file, merge all tags
            if (totalFiles === 0 && metadata.order !== null) {
                deckMetadata.order = metadata.order;
            }
            if (metadata.tags?.length > 0) {
                deckMetadata.tags = [...new Set([...deckMetadata.tags, ...metadata.tags])];
            }
            // Take first non-null subject/topic we encounter (usually chapter 1)
            if (deckMetadata.subject === null && metadata.subject) {
                deckMetadata.subject = metadata.subject;
            }
            if (deckMetadata.topic === null && metadata.topic) {
                deckMetadata.topic = metadata.topic;
            }

            // Add repository source; deckMetadata is attached after aggregation below
            const cardsWithMeta = cards.map(card => {
                const hash = hashCard(card);
                return {
                    ...card,
                    hash,
                    source: {
                        repo: `${owner}/${repo}`,
                        file: file.path,
                        sha: file.sha
                    },
                    deckName: deckId,
                    id: `${deckId}#${hash}`
                };
            });

            allCards.push(...cardsWithMeta);
            console.log(`[RepoManager] Total cards so far: ${allCards.length}`);

            totalFiles++;
        } catch (error) {
            console.error(`[RepoManager] Error parsing ${file.path}:`, error);
        }
    }

    console.log(`[RepoManager] Total parsed: ${allCards.length} cards from ${totalFiles} files`);
    console.log(`[RepoManager] Single deck ID: ${deckId}`);

    // Save consolidated repo+deck metadata in a single call
    console.log('[RepoManager] Saving repository/deck metadata...');
    const repoData = githubClient.createRepoData(repoInfo, markdownFiles);
    const deck = {
        ...repoData,
        id: deckId,
        name: repoInfo.name,
        description: repoInfo.description || '',
        order: deckMetadata.order,
        tags: deckMetadata.tags,
        subject: deckMetadata.subject || null,
        topic: deckMetadata.topic || null,
        repo: `${owner}/${repo}`,
        cardCount: allCards.length,
        fileCount: totalFiles,
        createdAt: new Date().toISOString()
    };
    await saveRepoMetadata(deck);
    console.log(`[RepoManager] Saved deck metadata for: ${deck.id}`);

    // Attach the final aggregated deckMetadata to all cards
    const aggregatedMeta = { order: deckMetadata.order, tags: deckMetadata.tags,
        subject: deckMetadata.subject || null, topic: deckMetadata.topic || null };
    const cardsWithDeckMeta = allCards.map(c => ({ ...c, deckMetadata: aggregatedMeta }));

    // Save cards to storage
    console.log('[RepoManager] Saving cards to storage...');
    await saveCards(cardsWithDeckMeta);
    console.log(`[RepoManager] ${cardsWithDeckMeta.length} cards saved to storage`);

    // Mark repo as fully loaded so orphan cleanup can safely include it
    markRepoLoaded(deckId);

    console.log(`=== [RepoManager] Load complete for ${repoString} ===\n`);

    return {
        repository: deck,
        deck,
        cards: cardsWithDeckMeta,
        filesProcessed: totalFiles
    };
}

/**
 * Remove a repository and its cards
 */
export async function removeRepository(repoId) {
    console.log(`[RepoManager] removeRepository called for: ${repoId}`);

    // Use the removeRepo function from storage which handles everything
    const { removeRepo, getAllRepos, getAllCards } = await import('./storage.js');

    const beforeRepos = await getAllRepos();
    console.log(`[RepoManager] Repos before removal:`, beforeRepos.map(r => r.id));

    await removeRepo(repoId);

    const afterRepos = await getAllRepos();
    console.log(`[RepoManager] Repos after removal:`, afterRepos.map(r => r.id));

    // Return remaining cards
    const allCards = await getAllCards();
    console.log(`[RepoManager] Remaining cards:`, allCards.length);
    return allCards;
}

/**
 * Refresh repository content
 */
export async function refreshRepository(repoId) {
    const [owner, repo] = repoId.split('/');

    // Get current metadata
    const currentMeta = await getRepoMetadata(repoId);

    // Fetch latest repository info
    const repoInfo = await githubClient.getRepository(owner, repo);

    // Check if repo has been updated
    if (currentMeta && currentMeta.updated === repoInfo.updated_at) {
        console.log(`Repository ${repoId} is up to date`);
        return { updated: false };
    }

    // Reload the repository
    const result = await loadRepository(repoId);
    return { updated: true, ...result };
}

/**
 * Get repository statistics
 */
export async function getRepoStats(repoId) {
    const allCards = await getAllCards();
    const repoCards = allCards.filter(card =>
        card.source?.repo === repoId || card.deckName === repoId
    );

    return {
        totalCards: repoCards.length,
        basicCards: repoCards.filter(c => c.type === 'basic').length,
        clozeCards: repoCards.filter(c => c.type === 'cloze').length
    };
}


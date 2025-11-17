/**
 * Repository manager for handling GitHub repos and cards
 */

import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';
import * as githubClient from './github-client.js';
import { saveCards, getAllCards, saveRepoMetadata, getRepoMetadata, getAllRepos } from './storage.js';

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

    // Fetch all markdown files
    console.log('[RepoManager] Fetching markdown files...');
    const markdownFiles = await githubClient.getMarkdownFiles(owner, repo);
    console.log(`[RepoManager] Found ${markdownFiles.length} markdown files`);

    if (markdownFiles.length === 0) {
        throw new Error(`No markdown files found in ${owner}/${repo}`);
    }

    // Parse cards from each file - ONE deck per repo
    const allCards = [];
    let totalFiles = 0;

    // Single deck ID for the entire repository
    const deckId = `${owner}/${repo}`;
    console.log(`[RepoManager] Creating single deck for repository: ${deckId}`);

    // Aggregate metadata from first file with frontmatter, or use repo name
    let deckMetadata = {
        name: null,
        subject: null,
        topic: null,
        order: null,
        tags: []
    };

    // Sort files by path (respects 01_, 02_ prefixes)
    const sortedFiles = [...markdownFiles].sort((a, b) => a.path.localeCompare(b.path));
    console.log('[RepoManager] File processing order:', sortedFiles.map(f => f.path));

    for (const file of sortedFiles) {
        try {
            console.log(`[RepoManager] Processing file: ${file.path}`);
            const content = await githubClient.getFileContent(owner, repo, file.path);
            console.log(`[RepoManager] File content length: ${content.length} chars`);

            const { cards, metadata } = parseDeck(content, file.path);
            console.log(`[RepoManager] Parsed ${cards.length} cards from ${file.path}`);

            // Use metadata from first file that has it
            if (totalFiles === 0 || metadata.name || metadata.subject || metadata.topic) {
                deckMetadata = {
                    name: metadata.name || deckMetadata.name,
                    subject: metadata.subject || deckMetadata.subject,
                    topic: metadata.topic || deckMetadata.topic,
                    order: metadata.order !== null ? metadata.order : deckMetadata.order,
                    tags: metadata.tags?.length > 0 ? metadata.tags : deckMetadata.tags
                };
            }

            // Add repository source and metadata to each card
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
                    deckMetadata: metadata,
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

    // Save repository metadata
    console.log('[RepoManager] Saving repository metadata...');
    const repoData = githubClient.createRepoData(repoInfo, markdownFiles);
    await saveRepoMetadata(repoData);
    console.log('[RepoManager] Repository metadata saved:', repoData.id);

    // Save single deck metadata for the entire repository
    console.log('[RepoManager] Saving deck metadata...');
    const deck = {
        id: deckId,
        name: deckMetadata.name || repoInfo.name,
        subject: deckMetadata.subject,
        topic: deckMetadata.topic,
        order: deckMetadata.order,
        tags: deckMetadata.tags,
        repo: `${owner}/${repo}`,
        cardCount: allCards.length,
        fileCount: totalFiles,
        createdAt: new Date().toISOString()
    };
    await saveRepoMetadata(deck);
    console.log(`[RepoManager] Saved deck metadata for: ${deck.id}`);

    // Save cards to storage
    console.log('[RepoManager] Saving cards to storage...');
    await saveCards(allCards);
    console.log(`[RepoManager] ${allCards.length} cards saved to storage`);

    console.log(`=== [RepoManager] Load complete for ${repoString} ===\n`);

    return {
        repository: repoData,
        deck,
        cards: allCards,
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

/**
 * Load default example repository
 */
export async function loadDefaultRepo() {
    // For now, use a simple example
    const exampleCards = [
        {
            type: 'basic',
            content: {
                question: 'What is spaced repetition?',
                answer: 'A learning technique that presents information at gradually increasing intervals.'
            }
        },
        {
            type: 'basic',
            content: {
                question: 'How do you add a new repository?',
                answer: 'Enter the GitHub repository in the format "owner/repository" and click the + button.'
            }
        },
        {
            type: 'cloze',
            content: {
                text: 'The FSRS algorithm adapts to your [personal memory patterns].',
                cloze: 'personal memory patterns'
            }
        }
    ].map(card => ({
        ...card,
        hash: hashCard(card),
        deckName: 'basics',
        source: { repo: 'local', file: 'basics.md' }
    }));

    await saveCards(exampleCards);
    return exampleCards;
}
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
    const { owner, repo } = githubClient.parseRepoString(repoString);

    // Fetch repository info
    const repoInfo = await githubClient.getRepository(owner, repo);

    // Fetch all markdown files
    const markdownFiles = await githubClient.getMarkdownFiles(owner, repo);

    if (markdownFiles.length === 0) {
        throw new Error(`No markdown files found in ${owner}/${repo}`);
    }

    // Parse cards from each file
    const allCards = [];
    let totalFiles = 0;

    for (const file of markdownFiles) {
        try {
            const content = await githubClient.getFileContent(owner, repo, file.path);
            const cards = parseDeck(content, file.path);

            // Add repository source to each card
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
                    deckName: `${owner}/${repo}`,
                    id: `${owner}/${repo}/${file.path}#${hash}`
                };
            });

            allCards.push(...cardsWithMeta);
            totalFiles++;
        } catch (error) {
            console.error(`Error parsing ${file.path}:`, error);
        }
    }

    // Save repository metadata
    const repoData = githubClient.createRepoData(repoInfo, markdownFiles);
    await saveRepoMetadata(repoData);

    // Save cards to storage
    await saveCards(allCards);

    return {
        repository: repoData,
        cards: allCards,
        filesProcessed: totalFiles
    };
}

/**
 * Remove a repository and its cards
 */
export async function removeRepository(repoId) {
    // Get all cards
    const allCards = await getAllCards();

    // Filter out cards from this repository
    const remainingCards = allCards.filter(card =>
        card.source?.repo !== repoId && card.deckName !== repoId
    );

    // Save filtered cards
    await saveCards(remainingCards);

    // Remove repo metadata
    const repos = await getAllRepos();
    const filteredRepos = repos.filter(r => r.id !== repoId);

    // Update repos in storage
    const db = await window.dbPromise;
    const tx = db.transaction('metadata', 'readwrite');
    await tx.objectStore('metadata').put(filteredRepos, 'repos');
    await tx.done;

    return remainingCards;
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
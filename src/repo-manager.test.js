import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getFileContent: vi.fn(),
    getRepoMetadata: vi.fn(),
    getAllCards: vi.fn(),
    saveCards: vi.fn()
}));

vi.mock('./github-client.js', () => ({
    parseRepoString: repoString => {
        const [owner, repo] = repoString.split('/');
        return { owner, repo };
    },
    getFileContent: mocks.getFileContent,
    getRepository: vi.fn(),
    getMarkdownFiles: vi.fn(),
    createRepoData: vi.fn()
}));

vi.mock('./storage.js', () => ({
    getRepoMetadata: mocks.getRepoMetadata,
    getAllCards: mocks.getAllCards,
    saveCards: mocks.saveCards,
    saveRepoMetadata: vi.fn(),
    getAllRepos: vi.fn(),
    markRepoLoaded: vi.fn()
}));

import { loadRepositoryFiles } from './repo-manager.js';

const markdown = `+++
subject = "computer-science"
+++
Q: What is selective loading?
A: Fetching only the requested file.
`;

describe('loadRepositoryFiles', () => {
    beforeEach(() => {
        mocks.getFileContent.mockReset().mockResolvedValue(markdown);
        mocks.getAllCards.mockReset().mockResolvedValue([]);
        mocks.saveCards.mockReset().mockResolvedValue(undefined);
    });

    it('fetches only requested file paths', async () => {
        mocks.getRepoMetadata.mockResolvedValue({
            id: 'owner/selective',
            files: [
                { path: 'flashcards/01.md', sha: 'sha-01' },
                { path: 'flashcards/02.md', sha: 'sha-02' }
            ]
        });

        const cards = await loadRepositoryFiles('owner/selective', ['flashcards/02.md']);

        expect(mocks.getFileContent).toHaveBeenCalledTimes(1);
        expect(mocks.getFileContent).toHaveBeenCalledWith('owner', 'selective', 'flashcards/02.md', 'sha-02');
        expect(cards).toHaveLength(1);
        expect(cards[0].source.file).toBe('flashcards/02.md');
    });

    it('shares concurrent requests for the same GitHub blob', async () => {
        mocks.getRepoMetadata.mockResolvedValue({
            id: 'owner/shared',
            files: [{ path: 'flashcards/01.md', sha: 'shared-sha' }]
        });

        await Promise.all([
            loadRepositoryFiles('owner/shared', ['flashcards/01.md']),
            loadRepositoryFiles('owner/shared', ['flashcards/01.md'])
        ]);

        expect(mocks.getFileContent).toHaveBeenCalledTimes(1);
        expect(mocks.saveCards).toHaveBeenCalledTimes(1);
    });
});

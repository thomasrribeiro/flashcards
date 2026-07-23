import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createRepoData: vi.fn(),
    getFileContent: vi.fn(),
    getRepository: vi.fn(),
    getRepositoryFileIndex: vi.fn(),
    getRepoMetadata: vi.fn(),
    getAllCards: vi.fn(),
    invalidateRepositoryFiles: vi.fn(),
    saveCards: vi.fn(),
    saveRepoMetadata: vi.fn()
}));

vi.mock('./github-client.js', () => ({
    parseRepoString: repoString => {
        const [owner, repo] = repoString.split('/');
        return { owner, repo };
    },
    getFileContent: mocks.getFileContent,
    getRepository: mocks.getRepository,
    getRepositoryFileIndex: mocks.getRepositoryFileIndex,
    getMarkdownFiles: vi.fn(),
    createRepoData: mocks.createRepoData
}));

vi.mock('./storage.js', () => ({
    getRepoMetadata: mocks.getRepoMetadata,
    getAllCards: mocks.getAllCards,
    invalidateRepositoryFiles: mocks.invalidateRepositoryFiles,
    saveCards: mocks.saveCards,
    saveRepoMetadata: mocks.saveRepoMetadata,
    getAllRepos: vi.fn(),
    markRepoLoaded: vi.fn()
}));

import {
    loadRepositoryFiles,
    parseDeckManifest,
    repositoryFileChanges,
    resolveRepositorySubject,
    syncRepository
} from './repo-manager.js';

const markdown = `+++
subject = "computer-science"
+++
Q: What is selective loading?
A: Fetching only the requested file.
`;

describe('loadRepositoryFiles', () => {
    beforeEach(() => {
        mocks.createRepoData.mockReset();
        mocks.getFileContent.mockReset().mockResolvedValue(markdown);
        mocks.getRepository.mockReset();
        mocks.getRepositoryFileIndex.mockReset();
        mocks.getAllCards.mockReset().mockResolvedValue([]);
        mocks.invalidateRepositoryFiles.mockReset();
        mocks.saveCards.mockReset().mockResolvedValue(undefined);
        mocks.saveRepoMetadata.mockReset().mockResolvedValue(undefined);
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

    it('does not reuse a loaded card body from an older GitHub blob', async () => {
        mocks.getRepoMetadata.mockResolvedValue({
            id: 'owner/updated',
            files: [{ path: 'flashcards/01.md', sha: 'new-sha' }]
        });
        mocks.getAllCards.mockResolvedValue([{
            hash: 'old-card',
            deckName: 'owner/updated',
            source: {
                repo: 'owner/updated',
                file: 'flashcards/01.md',
                sha: 'old-sha'
            }
        }]);

        const cards = await loadRepositoryFiles('owner/updated', ['flashcards/01.md']);

        expect(mocks.getFileContent).toHaveBeenCalledWith(
            'owner',
            'updated',
            'flashcards/01.md',
            'new-sha'
        );
        expect(cards).toHaveLength(1);
        expect(cards[0].source.sha).toBe('new-sha');
    });
});

describe('repository synchronization', () => {
    beforeEach(() => {
        mocks.createRepoData.mockReset().mockReturnValue({
            updated: '2026-07-23T12:00:00Z',
            files: [
                { path: 'flashcards/01.md', sha: 'new-01' },
                { path: 'flashcards/03.md', sha: 'new-03' }
            ]
        });
        mocks.getRepository.mockReset().mockResolvedValue({
            full_name: 'owner/sync',
            default_branch: 'master',
            name: 'sync',
            description: '',
            topics: ['mathematics']
        });
        mocks.getRepositoryFileIndex.mockReset().mockResolvedValue({
            markdownFiles: [
                { path: 'flashcards/01.md', sha: 'new-01' },
                { path: 'flashcards/03.md', sha: 'new-03' }
            ],
            deckManifest: null
        });
        mocks.getRepoMetadata.mockReset().mockResolvedValue({
            id: 'owner/sync',
            subject: 'mathematics',
            files: [
                { path: 'flashcards/01.md', sha: 'old-01' },
                { path: 'flashcards/02.md', sha: 'old-02' }
            ]
        });
        mocks.invalidateRepositoryFiles.mockReset();
        mocks.saveRepoMetadata.mockReset().mockResolvedValue(undefined);
    });

    it('invalidates changed and removed chapters while retaining the installed repository', async () => {
        const result = await syncRepository('owner/sync');

        expect(result.changes).toEqual({
            added: ['flashcards/03.md'],
            removed: ['flashcards/02.md'],
            changed: ['flashcards/01.md'],
            invalidated: ['flashcards/02.md', 'flashcards/01.md']
        });
        expect(mocks.invalidateRepositoryFiles).toHaveBeenCalledWith(
            'owner/sync',
            ['flashcards/02.md', 'flashcards/01.md']
        );
        expect(mocks.saveRepoMetadata).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'owner/sync',
                subject: 'mathematics',
                files: expect.arrayContaining([
                    expect.objectContaining({ path: 'flashcards/01.md', sha: 'new-01' }),
                    expect.objectContaining({ path: 'flashcards/03.md', sha: 'new-03' })
                ])
            }),
            { sync: true }
        );
    });

    it('classifies unchanged files without invalidating them', () => {
        expect(repositoryFileChanges(
            [{ path: 'flashcards/01.md', sha: 'same' }],
            [{ path: 'flashcards/01.md', sha: 'same' }]
        )).toEqual({
            added: [],
            removed: [],
            changed: [],
            invalidated: []
        });
    });
});

describe('resolveRepositorySubject', () => {
    it('recognizes misc as an explicit canonical repository topic', () => {
        expect(resolveRepositorySubject(['flashcards', 'misc'], 'physics')).toBe('misc');
    });

    it('falls back to the manifest subject when no canonical topic exists', () => {
        expect(resolveRepositorySubject(['flashcards'], 'mathematics')).toBe('mathematics');
    });
});

describe('parseDeckManifest', () => {
    it('reads a positive curriculum order', () => {
        expect(parseDeckManifest(`subject = "physics"
deck = "mechanics"
curriculum_order = 4
supersedes = ["physics/legacy-mechanics"]

[prerequisites]
decks = ["mathematics/algebra"]
recommended_decks = [
  "mathematics/geometry",
]
`)).toEqual({
            subject: 'physics',
            curriculumOrder: 4,
            curriculumId: 'physics/mechanics',
            supersedes: ['physics/legacy-mechanics'],
            prerequisiteDecks: ['mathematics/algebra'],
            recommendedDecks: ['mathematics/geometry']
        });
    });

    it('treats missing and zero orders as unlisted', () => {
        expect(parseDeckManifest('deck = "legacy"\n')).toMatchObject({
            subject: null,
            curriculumOrder: null
        });
        expect(parseDeckManifest('curriculum_order = 0\n')).toMatchObject({
            subject: null,
            curriculumOrder: null
        });
    });
});

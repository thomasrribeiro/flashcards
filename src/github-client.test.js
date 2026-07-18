import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFileContent, getRepositoryFileIndex, mergeRepositoryLists } from './github-client.js';

describe('getFileContent', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn()
        });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('uses the immutable Git Blob endpoint when a SHA is known', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('card content')
        });
        vi.stubGlobal('fetch', fetchMock);

        const content = await getFileContent('owner', 'deck', 'flashcards/01.md', 'blob-sha');

        expect(content).toBe('card content');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe(
            'https://api.github.com/repos/owner/deck/git/blobs/blob-sha'
        );
    });

    it('falls back to the Contents endpoint when the blob response fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 404 })
            .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('fallback content') });
        vi.stubGlobal('fetch', fetchMock);

        const content = await getFileContent('owner', 'deck', 'flashcards/01.md', 'missing-sha');

        expect(content).toBe('fallback content');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toBe(
            'https://api.github.com/repos/owner/deck/contents/flashcards/01.md'
        );
    });
});

describe('getRepositoryFileIndex', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn()
        });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('returns flashcard markdown and the root deck manifest from one tree request', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                tree: [
                    { type: 'blob', path: 'flashcards/01_intro.md', sha: 'chapter', size: 20 },
                    { type: 'blob', path: 'deck.toml', sha: 'manifest', size: 30 },
                    { type: 'blob', path: 'README.md', sha: 'readme', size: 40 }
                ]
            })
        }));

        const result = await getRepositoryFileIndex('owner', 'deck', 'flashcards', 'master');

        expect(result.markdownFiles).toEqual([{
            path: 'flashcards/01_intro.md',
            sha: 'chapter',
            size: 20,
            name: '01_intro.md'
        }]);
        expect(result.deckManifest).toEqual({
            path: 'deck.toml',
            sha: 'manifest',
            size: 30,
            name: 'deck.toml'
        });
    });
});

describe('mergeRepositoryLists', () => {
    it('keeps authenticated repositories first and deduplicates public copies', () => {
        const privateRepo = {
            full_name: 'owner/quantitative-reasoning-and-arithmetic',
            private: true
        };
        const authenticatedPublicCopy = {
            full_name: 'catalog/mechanics',
            source: 'authenticated'
        };
        const publicCatalogCopy = {
            full_name: 'CATALOG/MECHANICS',
            source: 'catalog'
        };
        const publicRepo = { full_name: 'catalog/biology' };

        expect(mergeRepositoryLists(
            [privateRepo, authenticatedPublicCopy],
            [publicCatalogCopy, publicRepo]
        )).toEqual([
            privateRepo,
            authenticatedPublicCopy,
            publicRepo
        ]);
    });
});

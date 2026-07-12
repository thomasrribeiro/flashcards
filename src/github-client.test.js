import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFileContent } from './github-client.js';

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

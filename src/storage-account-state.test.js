import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearLocalStorage,
    getAllChapterProgress,
    loadReposFromD1,
    removeRepo,
    saveRepoMetadata,
    setCurrentUser,
    syncChapterProgress
} from './storage.js';

afterEach(async () => {
    await clearLocalStorage();
    vi.unstubAllGlobals();
});

describe('signed-in account state', () => {
    it('fetches repository membership fresh from D1 on every read', async () => {
        setCurrentUser({ id: 'user-1' });
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    repos: [{ repo_id: 'owner/first', owner: 'owner', repo_name: 'first' }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    repos: [{ repo_id: 'owner/second', owner: 'owner', repo_name: 'second' }]
                })
            }));

        await expect(loadReposFromD1()).resolves.toEqual([
            { id: 'owner/first', owner: 'owner', name: 'first' }
        ]);
        await expect(loadReposFromD1()).resolves.toEqual([
            { id: 'owner/second', owner: 'owner', name: 'second' }
        ]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('can retire collection membership without deleting study history', async () => {
        setCurrentUser({ id: 'user-1' });
        await saveRepoMetadata({
            id: 'owner/legacy',
            name: 'legacy',
            cardCount: 0,
            curriculumId: 'physics/legacy'
        }, { sync: false });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true, deleted: 1 })
        }));
        const chapterProgress = {
            repo: 'owner/legacy',
            filepath: 'flashcards/01.md',
            sourceSha: 'chapter-sha',
            totalCards: 10,
            reviewedCards: 10
        };
        await syncChapterProgress([chapterProgress]);

        await removeRepo('owner/legacy', { preserveReviews: true });

        expect(fetch).toHaveBeenCalledTimes(3);
        expect(fetch.mock.calls[1][0]).toContain('/api/repos/');
        expect(fetch.mock.calls[2][0]).toContain('/api/chapter-progress');
        expect(fetch.mock.calls.some(([url]) => url.includes('/api/deck/'))).toBe(false);
        await expect(getAllChapterProgress()).resolves.toEqual([chapterProgress]);
    });
});

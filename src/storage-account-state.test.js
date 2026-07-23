import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearLocalStorage,
    loadReposFromD1,
    removeRepo,
    saveRepoMetadata,
    setCurrentUser
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

    it('can retire collection membership without deleting review history', async () => {
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

        await removeRepo('owner/legacy', { preserveReviews: true });

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toContain('/api/repos/');
    });
});

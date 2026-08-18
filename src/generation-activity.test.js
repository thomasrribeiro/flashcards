import { describe, expect, it, vi } from 'vitest';
import {
    loadPullRequestCurriculum,
    normalizeGenerationRequest,
    pullRequestCoordinates,
    sortGenerationRequestsByInitiatedAt,
    summarizeGenerationActivity
} from './generation-activity.js';

describe('generation activity', () => {
    it('normalizes worker records and counts active and review work', () => {
        const requests = [
            normalizeGenerationRequest({ id: 1, status: 'running', payload_json: '{"subject":"chemistry"}' }),
            normalizeGenerationRequest({ id: 2, status: 'needs-review', payload_json: '{"subject":"physics"}' }),
            normalizeGenerationRequest({ id: 3, status: 'failed', payload_json: '{}' })
        ];
        expect(requests[0].subject).toBe('chemistry');
        expect(summarizeGenerationActivity(requests)).toEqual({ active: 1, review: 1 });
    });

    it('accepts only GitHub pull request result URLs', () => {
        expect(pullRequestCoordinates('https://github.com/example/curricula/pull/12'))
            .toEqual({ owner: 'example', repository: 'curricula', number: 12 });
        expect(() => pullRequestCoordinates('https://example.com/pull/12')).toThrow(/GitHub pull request/);
    });

    it('orders requests by initiation time with newest first', () => {
        const requests = [
            normalizeGenerationRequest({ id: 8, requested_at: '2026-08-17 21:21:37' }),
            normalizeGenerationRequest({ id: 4, requested_at: '2026-08-15 21:19:38' }),
            normalizeGenerationRequest({ id: 7, requested_at: '2026-08-17 21:21:35' })
        ];
        expect(sortGenerationRequestsByInitiatedAt(requests).map(request => request.id))
            .toEqual([8, 7, 4]);
    });

    it('loads the catalog at the exact pull request head commit', async () => {
        const commit = 'a'.repeat(40);
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ head: { sha: commit } }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({
                subjects: [{ id: 'chemistry' }],
                decks: [{ id: 'chemistry/foundations', subject: 'chemistry' }]
            }) });
        const result = await loadPullRequestCurriculum({
            resultUrl: 'https://github.com/example/curricula/pull/12',
            subject: 'chemistry'
        }, { fetchImpl, token: 'test-token' });
        expect(result.commit).toBe(commit);
        expect(result.catalog.decks).toHaveLength(1);
        expect(fetchImpl.mock.calls[1][0]).toContain(`/${commit}/dist/curriculum.json`);
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
        expect(fetchImpl.mock.calls[1][1]).toEqual({ cache: 'no-cache' });
    });

    it('falls back to the authenticated GitHub contents API for a private catalog', async () => {
        const commit = 'b'.repeat(40);
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ head: { sha: commit } }) })
            .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({
                subjects: [{ id: 'chemistry' }],
                decks: []
            }) });
        await loadPullRequestCurriculum({
            resultUrl: 'https://github.com/example/private-curricula/pull/9',
            subject: 'chemistry'
        }, { fetchImpl, token: 'test-token' });
        expect(fetchImpl.mock.calls[2][0]).toContain('/contents/dist/curriculum.json?ref=');
        expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBe('Bearer test-token');
    });
});

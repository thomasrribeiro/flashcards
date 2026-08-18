import { describe, expect, it, vi } from 'vitest';
import {
    loadPullRequestCurriculum,
    normalizeGenerationRequest,
    pullRequestCoordinates,
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
    });
});

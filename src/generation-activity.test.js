import { describe, expect, it, vi } from 'vitest';
import {
    generationEffectiveCommand,
    generationPullRequestActionLabel,
    generationPreviewDestination,
    mergeGenerationPullRequest,
    loadPullRequestChapter,
    loadPullRequestCurriculum,
    normalizeGenerationRequest,
    pullRequestCoordinates,
    reconcileGenerationRequestStatuses,
    sortGenerationRequestsByInitiatedAt,
    summarizeGenerationActivity
} from './generation-activity.js';

describe('generation activity', () => {
    it('shows the exact CLI-equivalent chapter command', () => {
        expect(generationEffectiveCommand({
            jobType: 'chapter-expand',
            payload: { chapterId: '01_foundations', buildScope: 'pilot', generationMode: 'generate' }
        })).toBe('flashcards deck build <deck-path>');
        expect(generationEffectiveCommand({
            jobType: 'chapter-expand',
            payload: { chapterId: '03_motion', buildScope: 'chapter', generationMode: 'replace' }
        })).toBe('flashcards deck build <deck-path> --chapter 3 --fresh-chapter');
    });

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

    it('marks a draft ready and merges the exact previewed commit', async () => {
        const head = 'd'.repeat(40);
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({
                state: 'open', draft: true, node_id: 'PR_test', head: { sha: head }
            }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({
                data: { markPullRequestReadyForReview: { pullRequest: { id: 'PR_test', isDraft: false } } }
            }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ merged: true, sha: 'e'.repeat(40) }) });
        const result = await mergeGenerationPullRequest({
            resultUrl: 'https://github.com/example/curricula/pull/12'
        }, { fetchImpl, token: 'test-token', expectedHead: head });
        expect(result.alreadyMerged).toBe(false);
        expect(fetchImpl.mock.calls[1][0]).toBe('https://api.github.com/graphql');
        expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'POST' });
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body).variables).toEqual({ id: 'PR_test' });
        expect(fetchImpl.mock.calls[2][0]).toContain('/pulls/12/merge');
        expect(fetchImpl.mock.calls[2][1]).toMatchObject({ method: 'PUT' });
        expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({ sha: head, merge_method: 'merge' });
    });

    it('refuses to merge when the pull request changed after preview', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({
            state: 'open', draft: false, node_id: 'PR_test', head: { sha: 'e'.repeat(40) }
        }) });
        await expect(mergeGenerationPullRequest({
            resultUrl: 'https://github.com/example/curricula/pull/12'
        }, { fetchImpl, token: 'test-token', expectedHead: 'd'.repeat(40) }))
            .rejects.toThrow(/changed after this preview loaded/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('labels pull request links by lifecycle state', () => {
        expect(generationPullRequestActionLabel('needs-review')).toBe('Review pull request');
        expect(generationPullRequestActionLabel('published')).toBe('View merged pull request');
        expect(generationPullRequestActionLabel('cancelled')).toBe('View closed pull request');
    });

    it('opens deck-plan previews directly on the generated chapter DAG', () => {
        expect(generationPreviewDestination({
            jobType: 'deck-plan', deckId: 'mathematics/geometry-and-measurement'
        })).toEqual({
            mode: 'chapters', hierarchy: 'chapter', subject: 'mathematics',
            parentId: 'mathematics/geometry-and-measurement', targetId: '', query: '', layerStart: 0
        });
        expect(generationPreviewDestination({
            jobType: 'subject-design', subject: 'chemistry'
        })).toMatchObject({ mode: 'subject', hierarchy: 'deck', subject: 'chemistry' });
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

    it('persists merged and closed pull request outcomes', async () => {
        const updateRequest = vi.fn(async (id, partial) => ({ request: { id, ...partial } }));
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'closed', merged: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'closed', merged: false }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'open', merged: false }) });
        const requests = [
            normalizeGenerationRequest({ id: 4, status: 'needs-review', result_url: 'https://github.com/example/curricula/pull/1' }),
            normalizeGenerationRequest({ id: 5, status: 'needs-review', result_url: 'https://github.com/example/curricula/pull/2' }),
            normalizeGenerationRequest({ id: 6, status: 'needs-review', result_url: 'https://github.com/example/curricula/pull/3' })
        ];
        const reconciled = await reconcileGenerationRequestStatuses(requests, {
            fetchImpl, token: 'test-token', updateRequest
        });
        expect(reconciled.map(request => request.status)).toEqual(['published', 'cancelled', 'needs-review']);
        expect(summarizeGenerationActivity(reconciled)).toEqual({ active: 0, review: 1 });
        expect(updateRequest.mock.calls).toEqual([
            [4, { status: 'published', resultUrl: 'https://github.com/example/curricula/pull/1' }],
            [5, { status: 'cancelled', resultUrl: 'https://github.com/example/curricula/pull/2' }]
        ]);
        expect(fetchImpl.mock.calls[0][0]).toMatch(/\/pulls\/1\?activity_fresh=\d+$/);
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
    });

    it('keeps chapter publication in review until both deck and registry pulls merge', async () => {
        const request = normalizeGenerationRequest({
            id: 9,
            job_type: 'chapter-expand',
            status: 'needs-review',
            result_url: 'https://github.com/example/deck/pull/4',
            result_json: JSON.stringify({
                registryResultUrl: 'https://github.com/example/curricula/pull/8'
            })
        });
        const updateRequest = vi.fn();
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'closed', merged: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'open', merged: false }) });
        const [reconciled] = await reconcileGenerationRequestStatuses([request], {
            fetchImpl, token: 'test-token', updateRequest
        });
        expect(reconciled.status).toBe('needs-review');
        expect(updateRequest).not.toHaveBeenCalled();
        expect(fetchImpl.mock.calls[1][0]).toContain('/curricula/pulls/8');
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

    it('loads generated chapter Markdown at the exact pull request head commit', async () => {
        const commit = 'a'.repeat(40);
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ head: { sha: commit } }) })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '+++\norder = 1\n+++\n\nQ: Generated?\nA: Yes.\n'
            });
        const result = await loadPullRequestChapter({
            resultUrl: 'https://github.com/example/algebra/pull/4',
            payload: { chapterId: '01_variables' }
        }, { fetchImpl, token: 'test-token' });
        expect(result).toMatchObject({
            commit,
            file: 'flashcards/01_variables.md',
            repositoryId: 'example/algebra'
        });
        expect(result.markdown).toContain('Q: Generated?');
        expect(fetchImpl.mock.calls[1][0]).toContain(`/flashcards/01_variables.md?ref=${commit}`);
        expect(fetchImpl.mock.calls[1][1].headers.Accept).toBe('application/vnd.github.raw+json');
    });

    it('requires authentication and an ordered chapter ID for flashcard previews', async () => {
        await expect(loadPullRequestChapter({
            resultUrl: 'https://github.com/example/algebra/pull/4',
            payload: { chapterId: '01_variables' }
        }, { token: '' })).rejects.toThrow(/Sign in with GitHub/);

        const commit = 'b'.repeat(40);
        const fetchImpl = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ head: { sha: commit } })
        });
        await expect(loadPullRequestChapter({
            resultUrl: 'https://github.com/example/algebra/pull/4',
            payload: { chapterId: '../deck.toml' }
        }, { fetchImpl, token: 'test-token' })).rejects.toThrow(/ordered chapter file/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('validates a deck-plan preview against its exact target deck', async () => {
        const commit = 'c'.repeat(40);
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ head: { sha: commit } }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({
                subjects: [{ id: 'mathematics' }],
                decks: [{ id: 'mathematics/geometry-and-measurement', subject: 'mathematics' }]
            }) });
        const result = await loadPullRequestCurriculum({
            resultUrl: 'https://github.com/example/curricula/pull/13',
            deckId: 'mathematics/geometry-and-measurement'
        }, { fetchImpl });
        expect(result.catalog.decks[0].id).toBe('mathematics/geometry-and-measurement');
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

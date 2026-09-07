import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const state = vi.hoisted(() => ({ root: '', published: [], abandoned: false }));
vi.mock('./github-publisher.js', async importOriginal => ({
    ...await importOriginal(), assertRepositoryCommit: vi.fn(),
    beginRegistryDraft: vi.fn(() => ({ worktreeRoot: state.root })),
    abandonRegistryDraft: vi.fn(() => { state.abandoned = true; }),
    publishRegistryDraft: vi.fn((root, _draft, options) => {
        state.published.push({ catalog: JSON.parse(readFileSync(path.join(root, 'dist/curriculum.json'))), options });
        return { url: 'https://github.com/test/curricula/pull/1', baseCommit: 'a'.repeat(40), headCommit: 'b'.repeat(40), baseRef: 'master' };
    })
}));
import { registryCatalogHash } from './github-publisher.js';
import { runFreshGenerationJob } from './fresh-generation-runner.js';
import { freshGenerationInstructions } from './fresh-generation-instructions.js';
import { FLASHCARDS_ROOT } from './paths.js';

afterEach(() => vi.unstubAllGlobals());
const outcomes = [{ id: 'basics', description: 'Explain arithmetic.' }];
function setup(jobType = 'curriculum-design') {
    state.root = mkdtempSync(path.join(os.tmpdir(), 'fresh-runner-test-'));
    state.published = []; state.abandoned = false;
    mkdirSync(path.join(state.root, 'dist'));
    const catalog = { schema_version: 3, registry: { id: 'test', repository: 'test/curricula' }, subjects: [{ id: 'math' }], decks: [{
        id: 'math/arithmetic', deck: 'arithmetic', subject: 'math', title: 'Arithmetic', description: 'Counting and operations.', outcomes,
        prerequisites: [], required_outcomes: [], chapters: [{ id: '01_basics', title: 'OLD_CHAPTER_SECRET', outcomes, prerequisites: [], cards: ['OLD_CARD_SECRET'] }]
    }] };
    writeFileSync(path.join(state.root, 'registry.toml'), 'schema_version = 1\nid = "test"\nname = "Test"\nrepository = "test/curricula"\n');
    writeFileSync(path.join(state.root, 'fresh-curriculum.json'), JSON.stringify(catalog));
    writeFileSync(path.join(state.root, 'dist/curriculum.json'), JSON.stringify(catalog));
    return { id: 1, job_type: jobType, registry_id: 'test', target_repository: 'test/curricula', provider_id: 'openai', model_id: 'future-model', payload: {
        workflowVersion: 'fresh-generation-v1', workflowCommit: 'b'.repeat(40), registryBaseCommit: 'a'.repeat(40), catalogHash: registryCatalogHash(state.root),
        registryRef: 'master', catalogPath: 'dist/curriculum.json', reasoningEffort: 'high',
        ...(jobType === 'curriculum-design' ? { subjects: ['math'] } : { deckId: 'math/arithmetic' })
    } };
}
function respond(candidate) {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'response-test', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(candidate) }] }] }));
    vi.stubGlobal('fetch', fetchImpl);
    return fetchImpl;
}
function globalCandidate() {
    const source = JSON.parse(readFileSync(path.join(state.root, 'fresh-curriculum.json')));
    return { curriculum_version: 'whole-field-v1', subjects: ['math'], scopeIssues: [],
        decks: [{ ...source.decks[0], title: 'New arithmetic', level: 'foundational',
            scope: { includes: ['Counting and operations.'], excludes: ['Algebra.'] },
            practice: ['Solve varied arithmetic problems.'] }],
        coverage: [{ subject: 'math', domain: 'Arithmetic', level: 'foundational', disposition: 'included',
            targets: [{ deck_id: 'math/arithmetic', outcome_ids: ['basics'] }], rationale: 'Entry arithmetic capability.' }] };
}
describe('queued restricted runner', () => {
    it('publishes a review-only global candidate and archives the previous catalog outside model context', async () => {
        const job = setup();
        const candidate = globalCandidate();
        const fetchImpl = respond(candidate);
        const result = await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).input).toBe('{"subjects":["math"]}');
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.instructions).toBe(readFileSync(path.join(FLASHCARDS_ROOT,
            '.agents/skills/manage-flashcard-decks/references/global-curriculum-workflow.md'), 'utf8'));
        expect(body.text.format.schema.required).toEqual(['curriculum_version', 'subjects', 'coverage', 'decks', 'scopeIssues']);
        expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('OLD_CHAPTER_SECRET');
        expect(result.status).toBe('needs-review');
        expect(result.result.proposals).toHaveLength(1);
        expect(state.published[0].catalog.decks[0].chapters).toEqual([]);
        expect(state.published[0].catalog.coverage).toEqual(candidate.coverage);
        expect(state.published[0].catalog.curriculum_version).toBe('whole-field-v1');
        expect(readFileSync(path.join(state.root, 'generation-archive/request-1/previous-curriculum.json'), 'utf8')).toContain('OLD_CARD_SECRET');
    });
    it('fails closed on a schema downgrade or unresolved scope without publishing or retrying', async () => {
        for (const unresolved of [false, true]) {
            const job = setup();
            const candidate = globalCandidate();
            if (unresolved) candidate.scopeIssues = ['Missing advanced coverage: needs a coherent prerequisite bridge.'];
            else delete candidate.curriculum_version;
            const fetchImpl = respond(candidate);
            await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } }))
                .rejects.toThrow(unresolved ? /Unresolved curriculum scope/ : /coverage version/);
            expect(fetchImpl).toHaveBeenCalledTimes(1);
            expect(state.published).toEqual([]);
            expect(state.abandoned).toBe(true);
        }
    });
    it('isolates global instructions while preserving chapter/card instruction bundles', () => {
        expect(freshGenerationInstructions('deck-plan')).not.toContain('# Global curriculum: whole-field-v1');
        expect(freshGenerationInstructions('chapter-expand')).toContain('# Card quality standard');
        expect(() => freshGenerationInstructions('unknown')).toThrow(/Unsupported/);
    });
    it('publishes a deck plan without supplying any previous chapter context', async () => {
        const job = setup('deck-plan');
        const fetchImpl = respond({ deckId: 'math/arithmetic', chapters: [{ id: '01_counting', title: 'Counting', outcomes, prerequisites: [] }] });
        await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('OLD_CHAPTER_SECRET');
        expect(state.published[0].catalog.decks[0].chapters[0].id).toBe('01_counting');
    });
    it('rejects a stale subject list before charging or publishing', async () => {
        const job = setup(); job.payload.subjects.push('physics');
        const fetchImpl = respond({});
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } })).rejects.toThrow(/Subject list/);
        expect(fetchImpl).not.toHaveBeenCalled(); expect(state.published).toEqual([]);
    });
    it('does not publish after cancellation', async () => {
        const job = setup('deck-plan');
        respond({ deckId: 'math/arithmetic', chapters: [{ id: '01_counting', title: 'Counting', outcomes, prerequisites: [] }] });
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' }, beforePublish: async () => { throw new Error('Cancelled'); } })).rejects.toThrow('Cancelled');
        expect(state.published).toEqual([]); expect(state.abandoned).toBe(true);
    });
});

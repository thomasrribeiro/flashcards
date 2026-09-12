import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
import { runFreshGenerationJob as runJob } from './fresh-generation-runner.js';
const runFreshGenerationJob = (job, options) => runJob(job, { ...options, draftsRoot: path.join(state.root, 'retained') });
const retained = () => path.join(state.root, 'retained', readdirSync(path.join(state.root, 'retained'))[0]);
import { freshGenerationInstructions } from './fresh-generation-instructions.js';
import { FLASHCARDS_ROOT } from './paths.js';
import { validateGlobalCurriculumCandidate } from '../../src/fresh-generation.js';
import { curriculumProbeJob } from '../../src/fresh-generation-contract.js';
import { beginRegistryDraft } from './github-publisher.js';

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
function respond(candidate, metadata = {}) {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'response-test', status: 'completed', ...metadata, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(candidate) }] }] }));
    vi.stubGlobal('fetch', fetchImpl);
    return fetchImpl;
}
function globalCandidate() {
    return { subjects: ['math'], scopeIssues: [], practiceNotes: [],
        decks: [{ id: 'math/arithmetic', subject: 'math', title: 'New arithmetic', description: 'Counting and operations.',
            outcomes, prerequisites: [], required_outcomes: [], level: 'foundational',
            scope: { includes: ['Counting and operations.'], excludes: ['Algebra.'] },
            practice: ['Solve varied arithmetic problems.'] }],
        coverage: [{ subject: 'math', domain: 'Arithmetic', level: 'foundational', disposition: 'included',
            targets: [{ deck_id: 'math/arithmetic', outcome_ids: ['basics'] }], rationale: 'Entry arithmetic capability.' }] };
}
describe('queued restricted runner', () => {
    it('records allowlisted usage for completed empty output without mistaking it for truncation', async () => {
        const job = setup();
        const fetchImpl = respond({ ...globalCandidate(), decks: [], coverage: [] }, {
            usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200,
                output_tokens_details: { reasoning_tokens: 150, secret: 'DO_NOT_RETAIN' }, total_tokens: 300 },
            error: { message: 'DO_NOT_RETAIN' }, metadata: { secret: 'DO_NOT_RETAIN' }
        });
        const failure = await runFreshGenerationJob(job, { credential: { apiKey: 'test-only' }, registryRoot: state.root }).catch(error => error);
        const diagnostics = JSON.parse(readFileSync(path.join(retained(), 'attempt-1-provider.json')));
        expect(diagnostics).toEqual({ responseId: 'response-test', status: 'completed', incompleteReason: null, maxOutputTokens: null,
            usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 200, reasoningTokens: 150, totalTokens: 300 } });
        expect(failure.reviewResult.provenance.diagnostics).toEqual(diagnostics);
        expect(JSON.stringify(diagnostics)).not.toContain('DO_NOT_RETAIN');
        expect(statSync(path.join(retained(), 'attempt-1-provider.json')).mode & 0o777).toBe(0o600);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    it.each(['incomplete', 'failed', 'completed'])('retains terminal diagnostics before rejecting %s without usable JSON', async status => {
        const job = setup();
        const fetchImpl = respond(undefined, { status, incomplete_details: { reason: 'max_output_tokens' }, max_output_tokens: 12000 });
        await expect(runFreshGenerationJob(job, { credential: { apiKey: 'test-only' }, registryRoot: state.root })).rejects.toThrow();
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1-provider.json')))).toMatchObject({
            status, incompleteReason: 'max_output_tokens', maxOutputTokens: 12000, usage: null
        });
        expect(state.published).toEqual([]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(readdirSync(retained())).not.toContain('attempt-1.json');
    });
    it('retains an empty completed response for online failure review without publication or retry', async () => {
        const job = setup();
        const candidate = { ...globalCandidate(), decks: [], coverage: [] };
        const fetchImpl = respond(candidate);
        const failure = await runFreshGenerationJob(job, { credential: { apiKey: 'test-only' }, registryRoot: state.root }).catch(error => error);
        expect(failure.reviewResult.preview).toMatchObject({ kind: 'invalid-output', readOnly: true,
            issues: ['The candidate has no decks.'], outputTruncated: false });
        expect(JSON.parse(failure.reviewResult.preview.output)).toEqual(candidate);
        expect(failure.reviewResult.preview.catalog).toBeUndefined();
        expect(failure.reviewResult.proposals).toBeUndefined();
        expect(state.published).toEqual([]);
        expect(state.abandoned).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    it.each([false, true])('runs a registry-free, read-only probe with scope failure=%s and no publication', async hasIssues => {
        setup(); beginRegistryDraft.mockClear();
        const candidate = globalCandidate();
        if (hasIssues) candidate.scopeIssues = ['Missing a necessary bridge.'];
        const fetchImpl = respond(candidate);
        const input = curriculumProbeJob(['math'], { providerId: 'openai', modelId: 'future-model', reasoningEffort: 'high' }, 'b'.repeat(40));
        const job = { id: 61, job_type: input.jobType, provider_id: input.providerId, model_id: input.modelId, payload: input.payload };
        const result = await runFreshGenerationJob(job, { registryRoot: '/not-a-registry', credential: { apiKey: 'test-only' } });
        expect(result.status).toBe(hasIssues ? 'failed' : 'needs-review');
        expect(result.result).toMatchObject({ evaluationOnly: true, preview: { available: true, readOnly: true, issues: candidate.scopeIssues } });
        expect(result.result.proposals).toBeUndefined();
        expect(result.result.preview.catalog.decks[0].chapters).toEqual([]);
        expect(beginRegistryDraft).not.toHaveBeenCalled();
        expect(state.published).toEqual([]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(JSON.parse(body.input)).toEqual({ subjects: ['math'] });
        expect(body.instructions).toBe(freshGenerationInstructions('curriculum-design'));
        expect(body.tools).toEqual([]);
        expect(JSON.stringify(body)).not.toMatch(/evaluationOnly|OLD_|registryBaseCommit/);
    });
    it('rejects a probe with production context before acquiring a draft or making a call', async () => {
        const job = setup(); job.payload.evaluationOnly = true;
        const fetchImpl = respond({}); beginRegistryDraft.mockClear();
        await expect(runFreshGenerationJob(job, { credential: { apiKey: 'test-only' } })).rejects.toThrow(/registry-free/);
        expect(fetchImpl).not.toHaveBeenCalled(); expect(beginRegistryDraft).not.toHaveBeenCalled();
    });
    it('rejects experimental format-2 output in restored-contract jobs without another call', async () => {
        const job = setup();
        const legacy = { ...globalCandidate(), schema_version: 2 };
        const fetchImpl = respond(legacy);
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } }))
            .rejects.toThrow(/needs revision/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(state.published).toEqual([]);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(legacy);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1-diagnostics.json'))).structuralValid).toBe(false);
        expect(readdirSync(retained())).not.toContain('attempt-1-validated.json');
    });
    it('retains a failed draft without making a repair call or publishing it', async () => {
        const job = setup(); const candidate = globalCandidate();
        candidate.scopeIssues = ['Missing advanced arithmetic outcome.'];
        const fetchImpl = respond(candidate);
        const result = await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(result).toMatchObject({ status: 'failed', result: { preview: {
            available: true, readOnly: true, issues: candidate.scopeIssues,
            catalog: { decks: [{ id: 'math/arithmetic', title: 'New arithmetic' }] }
        } } });
        expect(result.result.proposals).toBeUndefined();
        expect(result.error).not.toContain('Drafts:');
        expect(state.abandoned).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(JSON.parse(body.input)).toEqual({ subjects: ['math'] });
        expect(body.instructions).toBe(freshGenerationInstructions('curriculum-design'));
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(candidate);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1-response.json')))).toMatchObject({
            requestId: 1, attempt: 1, responseId: 'response-test', background: true
        });
        expect(statSync(path.join(retained(), 'attempt-1-response.json')).mode & 0o777).toBe(0o600);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1-diagnostics.json')))).toMatchObject({
            structuralValid: true, declaredScopeIssues: candidate.scopeIssues, educationalReviewRequired: true,
            summary: { deckCount: 1 }
        });
        expect(statSync(path.join(retained(), 'attempt-1-diagnostics.json')).mode & 0o777).toBe(0o600);
        expect(readdirSync(retained()).some(name => name.startsWith('attempt-2'))).toBe(false);
        expect(state.published).toEqual([]);
    });
    it('preserves practice disclaimers without charging for a repair', async () => {
        const job = setup(); const candidate = globalCandidate();
        candidate.practiceNotes = ['Laboratory practice requires supervision and institutional approval.'];
        const fetchImpl = respond(candidate);
        await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(state.published[0].catalog.practiceNotes).toEqual(candidate.practiceNotes);
    });
    it('does not treat a blocking defect as harmless because it mentions laboratory approval', async () => {
        const job = setup(); const candidate = globalCandidate();
        candidate.scopeIssues = ['Missing quantitative prerequisite outcomes; laboratory approval is also needed.'];
        candidate.practiceNotes = ['Institutional review required.'];
        const fetchImpl = respond(candidate);
        const result = await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(result.status).toBe('failed');
        expect(result.result.preview.issues).toEqual(candidate.scopeIssues);
        expect(fetchImpl).toHaveBeenCalledTimes(1); expect(state.published).toEqual([]);
    });
    it('does not retry an initial transport failure', async () => {
        const job = setup(); const fetchImpl = respond({}); fetchImpl.mockRejectedValue(new TypeError('network'));
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } })).rejects.toThrow(/Not retried automatically/);
        expect(fetchImpl).toHaveBeenCalledTimes(1); expect(state.published).toEqual([]);
    });
    it('retains but does not expose a cyclic graph to the DAG viewer', async () => {
        const job = setup(); const candidate = globalCandidate();
        candidate.decks[0].prerequisites = ['math/arithmetic'];
        candidate.decks[0].required_outcomes = [{ deck_id: 'math/arithmetic', outcome_ids: ['basics'] }];
        const fetchImpl = respond(candidate);
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } })).rejects.toThrow(/needs revision/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(state.published).toEqual([]);
        expect(state.abandoned).toBe(true);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(candidate);
    });
    it('checks cancellation before publication, preserving the completed first attempt', async () => {
        const job = setup(); const candidate = globalCandidate();
        const fetchImpl = respond(candidate);
        const beforePublish = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('Cancelled'));
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' }, beforePublish })).rejects.toThrow(/Cancelled/);
        expect(fetchImpl).toHaveBeenCalledTimes(1); expect(state.published).toEqual([]);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(candidate);
    });
    it('forwards explicit required names with multiple additions, but no launch metadata or catalog', async () => {
        const job = setup();
        job.payload.subjects = ['physics', 'math', 'chemistry'];
        job.payload.newSubjects = ['physics', 'chemistry'];
        job.payload.mandatoryDecks = [{ subject: 'math', decks: ['arithmetic'] }];
        const candidate = globalCandidate();
        candidate.subjects = [...job.payload.subjects];
        for (const subject of job.payload.newSubjects) {
            const id = `${subject}/foundations`;
            const outcomeId = `${subject}-basics`;
            candidate.decks.push({ ...candidate.decks[0], id, subject, title: 'Foundations',
                outcomes: [{ id: outcomeId, description: 'Explain the foundations.' }] });
            candidate.coverage.push({ ...candidate.coverage[0], subject, domain: 'Foundations',
                targets: [{ deck_id: id, outcome_ids: [outcomeId] }] });
        }
        const fetchImpl = respond(candidate);
        await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        const input = JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1].body).input);
        expect(input).toEqual({ subjects: ['chemistry', 'math', 'physics'], mandatoryDecks: [{ subject: 'math', decks: ['arithmetic'] }] });
        expect(state.published[0].catalog.subjects.map(subject => subject.id)).toEqual(input.subjects);
    });
    it('blocks a result missing a mandatory deck without another generation', async () => {
        const job = setup(); job.payload.mandatoryDecks = [{ subject: 'math', decks: ['measure-theoretic-probability'] }];
        const fetchImpl = respond(globalCandidate());
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } }))
            .rejects.toThrow(/needs revision/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(readFileSync(path.join(retained(), 'attempt-1-validation.json'), 'utf8')).toContain('Missing required decks');
        expect(state.published).toEqual([]);
    });
    it('rejects invalid required-deck subjects before making a paid request', async () => {
        const job = setup(); job.payload.mandatoryDecks = [{ subject: 'physics', decks: ['mechanics'] }];
        const fetchImpl = respond({});
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } })).rejects.toThrow(/listed subject/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('retains a read-only chapter graph with unresolved scope instead of publishing it', async () => {
        const job = setup('deck-plan');
        respond({ deckId: 'math/arithmetic', chapters: [{ id: '01_counting', title: 'Counting', outcomes, prerequisites: [] }], scopeIssues: ['Missing prerequisite capability.'] });
        const result = await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(result.status).toBe('failed');
        expect(result.result.preview).toMatchObject({ readOnly: true, issues: ['Missing prerequisite capability.'] });
        expect(result.result.preview.catalog.decks[0].chapters[0].title).toBe('Counting');
        expect(state.published).toEqual([]);
    });
    it('publishes a review-only global candidate and archives the previous catalog outside model context', async () => {
        const job = setup();
        const candidate = globalCandidate();
        const fetchImpl = respond(candidate);
        const result = await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).input).toBe('{"subjects":["math"]}');
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.instructions).toBe(readFileSync(path.join(FLASHCARDS_ROOT,
            '.agents/skills/manage-flashcard-decks/references/global-curriculum-workflow.md'), 'utf8'));
        expect(body.text.format.schema.required).toEqual(['subjects', 'decks', 'coverage', 'scopeIssues', 'practiceNotes']);
        expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('OLD_CHAPTER_SECRET');
        expect(result.status).toBe('needs-review');
        expect(result.result.provenance.attempts).toHaveLength(1);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(result.result.proposals).toHaveLength(1);
        expect(state.published[0].catalog.decks[0].chapters).toEqual([]);
        const compiled = validateGlobalCurriculumCandidate(candidate, ['math'], { requireCoverage: true });
        expect(state.published[0].catalog.coverage).toEqual(compiled.coverage);
        expect(state.published[0].catalog.curriculum_schema_version).toBe(1);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(candidate);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1-validated.json')))).toEqual({
            candidate: compiled, validation: result.result.provenance.validation
        });
        expect(result.result.provenance.validation).toMatchObject({ contractVersion: 1,
            rawCandidateHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            validatedCandidateHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
        expect(readFileSync(path.join(state.root, 'generation-archive/request-1/previous-curriculum.json'), 'utf8')).toContain('OLD_CARD_SECRET');
    });
    it('retains the single draft and fails closed on invalid or incomplete output', async () => {
        for (const unresolved of [false, true]) {
            const job = setup();
            const candidate = globalCandidate();
            if (unresolved) candidate.scopeIssues = ['Missing advanced coverage: needs a coherent prerequisite bridge.'];
            else delete candidate.coverage;
            const fetchImpl = respond(candidate);
            const run = runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
            if (unresolved) expect((await run).status).toBe('failed');
            else await expect(run).rejects.toThrow(/needs revision/);
            expect(fetchImpl).toHaveBeenCalledTimes(1);
            expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(candidate);
            expect(readFileSync(path.join(retained(), 'attempt-1-validation.json'), 'utf8'))
                .toMatch(unresolved ? /Missing advanced coverage/ : /coverage/);
            expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1-diagnostics.json'))).structuralValid).toBe(unresolved);
            expect(statSync(path.join(retained(), 'attempt-1.json')).mode & 0o777).toBe(0o600);
            expect(state.published).toEqual([]);
            expect(state.abandoned).toBe(true);
        }
    });
    it('isolates global instructions while preserving chapter/card instruction bundles', () => {
        expect(() => freshGenerationInstructions('curriculum-design', { repair: true })).toThrow(/not supported/);
        expect(freshGenerationInstructions('deck-plan')).not.toContain('# Global curriculum');
        expect(freshGenerationInstructions('chapter-expand')).toContain('# Card quality standard');
        expect(() => freshGenerationInstructions('unknown')).toThrow(/Unsupported/);
    });
    it('publishes a deck plan without supplying any previous chapter context', async () => {
        const job = setup('deck-plan');
        const fetchImpl = respond({ deckId: 'math/arithmetic', chapters: [{ id: '01_counting', title: 'Counting', outcomes, prerequisites: [] }], scopeIssues: [] });
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
        respond({ deckId: 'math/arithmetic', chapters: [{ id: '01_counting', title: 'Counting', outcomes, prerequisites: [] }], scopeIssues: [] });
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' }, beforePublish: async () => { throw new Error('Cancelled'); } })).rejects.toThrow('Cancelled');
        expect(state.published).toEqual([]); expect(state.abandoned).toBe(true);
    });
});

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
    return { subjects: ['math'], scopeIssues: [], practiceNotes: [],
        decks: [{ ...source.decks[0], title: 'New arithmetic', level: 'foundational',
            scope: { includes: ['Counting and operations.'], excludes: ['Algebra.'] },
            practice: ['Solve varied arithmetic problems.'] }],
        coverage: [{ subject: 'math', domain: 'Arithmetic', level: 'foundational', disposition: 'included',
            targets: [{ deck_id: 'math/arithmetic', outcome_ids: ['basics'] }], rationale: 'Entry arithmetic capability.' }] };
}
describe('queued restricted runner', () => {
    it('repairs only the fresh draft, retains both attempts, and records both provider calls', async () => {
        const job = setup();
        const first = globalCandidate();
        first.scopeIssues = ['Missing advanced arithmetic outcome.'];
        const fixed = globalCandidate();
        fixed.decks[0].outcomes.push({ id: 'advanced', description: 'Justify an advanced arithmetic method.' });
        fixed.coverage[0].targets[0].outcome_ids.push('advanced');
        const fetchImpl = respond(first);
        const firstResponse = fetchImpl.getMockImplementation();
        fetchImpl.mockImplementationOnce(firstResponse).mockImplementationOnce(async () => {
            expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(first);
            return Response.json({ id: 'repair-response', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(fixed) }] }] });
        });
        const result = await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const bodies = fetchImpl.mock.calls.map(call => JSON.parse(call[1].body));
        const repair = JSON.parse(bodies[1].input);
        expect(Object.keys(repair).sort()).toEqual(['repair', 'subjects']);
        expect(repair.repair.issues).toEqual(first.scopeIssues);
        expect(repair.repair.draft.decks[0].title).toBe('New arithmetic');
        expect(JSON.stringify(repair)).not.toMatch(/OLD_|chapters|repository|materialized/);
        expect(bodies[1].instructions).toBe(freshGenerationInstructions('curriculum-design', { repair: true }));
        for (const body of bodies) {
            expect(body.tools).toEqual([]); expect(body.store).toBe(false);
            expect(body.model).toBe(job.model_id); expect(body.reasoning.effort).toBe('high');
            expect(body).not.toHaveProperty('previous_response_id');
        }
        expect(result.result.provenance.attempts.map(item => item.responseId)).toEqual(['response-test', 'repair-response']);
        expect(state.published[0].catalog.decks[0].outcomes).toHaveLength(2);
        expect(JSON.parse(readFileSync(path.join(state.root, 'generation-archive/request-1/attempts/attempt-1.json'))).candidate).toEqual(first);
        expect(readFileSync(path.join(retained(), 'attempt-2.json'), 'utf8')).not.toContain('test-only');
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1-response.json')))).toMatchObject({
            requestId: 1, attempt: 1, responseId: 'response-test', background: true
        });
        expect(statSync(path.join(retained(), 'attempt-1-response.json')).mode & 0o777).toBe(0o600);
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
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } })).rejects.toThrow(/still needs repair/);
        expect(fetchImpl).toHaveBeenCalledTimes(2); expect(state.published).toEqual([]);
    });
    it('keeps the first draft after a repair connection failure without a third call', async () => {
        const job = setup(); const candidate = globalCandidate(); candidate.scopeIssues = ['Missing capability.'];
        const fetchImpl = respond(candidate); const firstResponse = fetchImpl.getMockImplementation();
        fetchImpl.mockImplementationOnce(firstResponse).mockRejectedValueOnce(new TypeError('secret transport detail'));
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } }))
            .rejects.toThrow(/connection failed.*Not retried automatically.*Drafts:/);
        expect(fetchImpl).toHaveBeenCalledTimes(2); expect(state.published).toEqual([]);
        expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(candidate);
        expect(readdirSync(retained())).toContain('attempt-2-started.json');
        expect(readdirSync(retained())).not.toContain('attempt-2.json');
    });
    it('does not retry an initial transport failure', async () => {
        const job = setup(); const fetchImpl = respond({}); fetchImpl.mockRejectedValue(new TypeError('network'));
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } })).rejects.toThrow(/Not retried automatically/);
        expect(fetchImpl).toHaveBeenCalledTimes(1); expect(state.published).toEqual([]);
    });
    it('checks cancellation before the paid repair, preserving the completed first attempt', async () => {
        const job = setup(); const candidate = globalCandidate(); candidate.scopeIssues = ['Missing capability.'];
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
            candidate.decks.push({ ...candidate.decks[0], subject, id, title: 'Foundations' });
            candidate.coverage.push({ ...candidate.coverage[0], subject, domain: 'Foundations', targets: [{ deck_id: id, outcome_ids: ['basics'] }] });
        }
        const fetchImpl = respond(candidate);
        await runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } });
        const input = JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1].body).input);
        expect(input).toEqual({ subjects: ['chemistry', 'math', 'physics'], mandatoryDecks: [{ subject: 'math', decks: ['arithmetic'] }] });
        expect(state.published[0].catalog.subjects.map(subject => subject.id)).toEqual(input.subjects);
    });
    it('blocks a result still missing a mandatory deck after one repair', async () => {
        const job = setup(); job.payload.mandatoryDecks = [{ subject: 'math', decks: ['measure-theoretic-probability'] }];
        const fetchImpl = respond(globalCandidate());
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } }))
            .rejects.toThrow(/still needs repair/);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(readFileSync(path.join(retained(), 'attempt-2-validation.json'), 'utf8')).toContain('Missing required decks');
        expect(state.published).toEqual([]);
    });
    it('rejects invalid required-deck subjects before making a paid request', async () => {
        const job = setup(); job.payload.mandatoryDecks = [{ subject: 'physics', decks: ['mechanics'] }];
        const fetchImpl = respond({});
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } })).rejects.toThrow(/listed subject/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('rejects unresolved chapter-plan scope instead of silently dropping it', async () => {
        const job = setup('deck-plan');
        respond({ deckId: 'math/arithmetic', chapters: [], scopeIssues: ['Missing prerequisite capability.'] });
        await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } }))
            .rejects.toThrow(/Unresolved chapter scope/);
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
        expect(body.text.format.schema.required).toEqual(['subjects', 'coverage', 'decks', 'scopeIssues', 'practiceNotes']);
        expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('OLD_CHAPTER_SECRET');
        expect(result.status).toBe('needs-review');
        expect(result.result.proposals).toHaveLength(1);
        expect(state.published[0].catalog.decks[0].chapters).toEqual([]);
        expect(state.published[0].catalog.coverage).toEqual(candidate.coverage);
        expect(state.published[0].catalog.curriculum_schema_version).toBe(1);
        expect(readFileSync(path.join(state.root, 'generation-archive/request-1/previous-curriculum.json'), 'utf8')).toContain('OLD_CARD_SECRET');
    });
    it('retains both drafts and fails closed after a bounded repair of invalid or incomplete output', async () => {
        for (const unresolved of [false, true]) {
            const job = setup();
            const candidate = globalCandidate();
            if (unresolved) candidate.scopeIssues = ['Missing advanced coverage: needs a coherent prerequisite bridge.'];
            else delete candidate.coverage;
            const fetchImpl = respond(candidate);
            await expect(runFreshGenerationJob(job, { registryRoot: state.root, credential: { apiKey: 'test-only' } }))
                .rejects.toThrow(/still needs repair/);
            expect(fetchImpl).toHaveBeenCalledTimes(2);
            expect(JSON.parse(readFileSync(path.join(retained(), 'attempt-1.json'))).candidate).toEqual(candidate);
            expect(readFileSync(path.join(retained(), 'attempt-2-validation.json'), 'utf8'))
                .toMatch(unresolved ? /Missing advanced coverage/ : /coverage map/);
            expect(statSync(path.join(retained(), 'attempt-1.json')).mode & 0o777).toBe(0o600);
            expect(state.published).toEqual([]);
            expect(state.abandoned).toBe(true);
        }
    });
    it('isolates global instructions while preserving chapter/card instruction bundles', () => {
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

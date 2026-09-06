import { describe, expect, it, vi } from 'vitest';
import {
    assertGenerationBaseCurrent, buildFreshGenerationContext,
    canonicalSubjectNames, validateGlobalCurriculumCandidate,
    validateChapterCurriculumCandidate
} from './fresh-generation.js';
import { requestFreshGeneration } from '../bin/lib/fresh-generation-provider.js';

const outcome = (id = 'basics') => ({ id, description: `Explain ${id}.` });
function fixture() {
    const deck = (id, prerequisites = []) => ({
        id, subject: id.split('/')[0], title: id.split('/')[1], description: 'Bounded learning scope',
        outcomes: [outcome()], prerequisites,
        required_outcomes: prerequisites.map(deck_id => ({ deck_id, outcome_ids: ['basics'] })),
        repository: { url: 'OLD_REPOSITORY' }, generation_runs: ['OLD_HISTORY'],
        chapters: [{ id: '01_basics', title: 'Basics', outcomes: [outcome()], prerequisites: [], cards: ['OLD_CARDS'] }]
    });
    return { decks: [deck('math/arithmetic'), deck('physics/mechanics', ['math/arithmetic']), deck('biology/cells')] };
}

describe('fresh generation context boundary', () => {
    it('global generation receives subject names only, independent of insertion order or old catalog', () => {
        const catalog = new Proxy({}, { get() { throw new Error('Old catalog accessed'); } });
        const first = buildFreshGenerationContext({ jobType: 'curriculum-design', subjects: ['physics', 'math'], catalog });
        expect(first).toEqual({ subjects: ['math', 'physics'] });
        expect(first).toEqual(buildFreshGenerationContext({ jobType: 'curriculum-design', subjects: ['math', 'physics'] }));
        expect(() => canonicalSubjectNames(['math', 'math'])).toThrow(/duplicates/);
        expect(() => canonicalSubjectNames(['Math'])).toThrow(/kebab/);
    });
    it('deck planning sees ancestor specifications, never chapter plans or old content', () => {
        const catalog = fixture(), snapshot = structuredClone(catalog);
        const context = buildFreshGenerationContext({ jobType: 'deck-plan', deckId: 'physics/mechanics', catalog });
        expect(context.prerequisites.map(deck => deck.id)).toEqual(['math/arithmetic']);
        expect(JSON.stringify(context)).not.toMatch(/OLD_|chapters|biology|repository|generation_runs/);
        expect(catalog).toEqual(snapshot);
    });
    it('flashcards see only specifications, including the accepted internal chapter graph', () => {
        const context = buildFreshGenerationContext({ jobType: 'chapter-expand', deckId: 'physics/mechanics', chapterId: '01_basics', catalog: fixture() });
        expect(context.chapters[0].outcomes).toEqual([outcome()]);
        expect(JSON.stringify(context)).not.toMatch(/OLD_|cards|repository|generation_runs/);
    });
    it('fails closed on cross-deck chapter references instead of hiding them', () => {
        const catalog = fixture();
        catalog.decks[1].chapters[0].prerequisites = ['chapter:math/arithmetic#01_basics'];
        expect(() => buildFreshGenerationContext({ jobType: 'chapter-expand', deckId: 'physics/mechanics', chapterId: '01_basics', catalog })).toThrow(/cross-deck/);
    });
    it('rejects missing outcomes instead of guessing that the whole prerequisite deck is required', () => {
        const catalog = fixture();
        catalog.decks[1].required_outcomes = [];
        expect(() => buildFreshGenerationContext({ jobType: 'deck-plan', deckId: 'physics/mechanics', catalog })).toThrow(/annotate every/);
    });
    it('rejects missing decks and cycles in the ancestor graph', () => {
        const catalog = fixture();
        catalog.decks[0].prerequisites = ['physics/mechanics'];
        expect(() => buildFreshGenerationContext({ jobType: 'deck-plan', deckId: 'physics/mechanics', catalog })).toThrow(/cycle/);
        catalog.decks[0].prerequisites = ['math/missing'];
        expect(() => buildFreshGenerationContext({ jobType: 'deck-plan', deckId: 'physics/mechanics', catalog })).toThrow(/Missing prerequisite/);
    });
});

describe('fresh candidate validation', () => {
    it('validates a global cross-subject DAG and strips old publication/content metadata', () => {
        const candidate = { subjects: ['math', 'physics', 'biology'], decks: fixture().decks };
        const result = validateGlobalCurriculumCandidate(candidate, candidate.subjects);
        expect(result.decks).toHaveLength(3);
        expect(JSON.stringify(result)).not.toMatch(/OLD_|chapters|repository/);
        candidate.decks[1].required_outcomes[0].outcome_ids = ['missing'];
        expect(() => validateGlobalCurriculumCandidate(candidate, candidate.subjects)).toThrow(/missing prerequisite outcomes/);
    });
    it('requires exact subject coverage without inventing or dropping subjects', () => {
        expect(() => validateGlobalCurriculumCandidate({ subjects: ['math'], decks: fixture().decks }, ['math', 'physics'])).toThrow(/exactly/);
        expect(() => validateGlobalCurriculumCandidate({ subjects: ['math', 'chemistry'], decks: [fixture().decks[0]] }, ['math', 'chemistry'])).toThrow(/Every subject/);
    });
    it('validates local chapter edges and rejects cycles, duplicates and external edges', () => {
        const candidate = { deckId: 'math/arithmetic', chapters: [
            { id: '01_basics', title: 'Basics', outcomes: [outcome()], prerequisites: [] },
            { id: '02_more', title: 'More', outcomes: [outcome('more')], prerequisites: ['chapter:01_basics'] }
        ] };
        expect(validateChapterCurriculumCandidate(candidate, candidate.deckId).chapters).toHaveLength(2);
        candidate.chapters[0].prerequisites = ['chapter:02_more'];
        expect(() => validateChapterCurriculumCandidate(candidate, candidate.deckId)).toThrow(/cycle/);
        candidate.chapters[0].prerequisites = ['deck:math/arithmetic'];
        expect(() => validateChapterCurriculumCandidate(candidate, candidate.deckId)).toThrow(/local chapter/);
    });
    it('blocks accepting a candidate against a changed or missing input version', () => {
        expect(() => assertGenerationBaseCurrent('a'.repeat(40), 'a'.repeat(40))).not.toThrow();
        expect(() => assertGenerationBaseCurrent('a'.repeat(40), 'b'.repeat(40))).toThrow(/Curriculum changed/);
        expect(() => assertGenerationBaseCurrent('', '')).toThrow(/pinned/);
    });
});

describe('restricted provider request', () => {
    const options = () => ({
        jobType: 'curriculum-design', subjects: ['math'], catalog: fixture(),
        instructions: 'Versioned instructions', modelId: 'future-model-id', reasoningEffort: 'high',
        apiKey: 'test-key', schema: { type: 'object', properties: {}, required: [], additionalProperties: false }
    });
    const completed = { id: 'response-1', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] };
    it('has no tools, previous responses, storage or old content; pins the requested model without a model whitelist', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(completed)));
        const result = await requestFreshGeneration({ ...options(), fetchImpl });
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body).toMatchObject({ model: 'future-model-id', reasoning: { effort: 'high' }, tools: [], tool_choice: 'none', store: false, truncation: 'disabled' });
        expect(JSON.parse(body.input)).toEqual({ subjects: ['math'] });
        expect(JSON.stringify(body)).not.toMatch(/OLD_|test-key|previous_response_id|conversation/);
        expect(result.provenance.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(JSON.stringify(result)).not.toContain('test-key');
    });
    it.each([
        { ...completed, status: 'incomplete' },
        { ...completed, output: [{ type: 'function_call' }] },
        { ...completed, output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
        { ...completed, output: [] }
    ])('never accepts incomplete, refused, tool or invalid output', async response => {
        await expect(requestFreshGeneration({ ...options(), fetchImpl: async () => new Response(JSON.stringify(response)) })).rejects.toThrow();
    });
    it('does not fall back to an unrestricted CLI for unsupported providers', async () => {
        const fetchImpl = vi.fn();
        await expect(requestFreshGeneration({ ...options(), providerId: 'custom', fetchImpl })).rejects.toThrow(/does not yet support/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

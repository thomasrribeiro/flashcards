import { describe, expect, it } from 'vitest';
import { compileGlobalCurriculumCandidate } from './global-curriculum-compiler.js';
import { inspectCurriculumCandidate } from './curriculum-diagnostics.js';
import { buildFreshGenerationContext } from './fresh-generation.js';
import { freshCandidateCatalog } from '../bin/lib/fresh-generation-output.js';
import { freshGenerationSchema } from '../bin/lib/fresh-generation-schema.js';

// Synthetic contracts exercise representation and graph invariants only.
// They are not a syllabus, model examples, or evidence of pedagogical quality.
function fixture() {
    const deck = (id, outcomeIds, required = []) => ({
        id, title: id.split('/')[1], description: 'A bounded learning destination.', level: 'undergraduate-core',
        scope: { includes: ['Related methods with shared preparation.'], excludes: [] },
        outcomes: outcomeIds.map(id => ({ id, description: `Demonstrate ${id} under stated conditions.` })),
        practice: ['Solve and explain a representative problem.'], required_outcome_ids: required
    });
    const decks = [deck('mathematics/vector-methods', ['vector-projection', 'linear-systems']),
        deck('physics/geometric-models', ['geometric-prediction'], ['vector-projection', 'linear-systems']),
        deck('physics/computational-models', ['simulate-model'], ['geometric-prediction', 'linear-systems'])];
    return { schema_version: 2, subjects: ['mathematics', 'physics'], decks,
        coverage: decks.map(deck => ({ subject: deck.id.split('/')[0], domain: deck.title, level: deck.level,
            disposition: 'included', outcome_ids: deck.outcomes.map(outcome => outcome.id),
            rationale: 'Teaches the stated working methods.' })), scopeIssues: [], practiceNotes: [] };
}
const compile = raw => compileGlobalCurriculumCandidate(raw, ['mathematics', 'physics']);

describe('single-source curriculum compilation', () => {
    it('derives owners and edges without mutating the model output or losing explicit ancestor requirements', () => {
        const raw = fixture(); const original = JSON.stringify(raw);
        const candidate = compile(raw);
        const target = candidate.decks.find(deck => deck.id === 'physics/computational-models');
        expect(target.prerequisites).toEqual(['mathematics/vector-methods', 'physics/geometric-models']);
        expect(target.required_outcomes).toEqual([
            { deck_id: 'mathematics/vector-methods', outcome_ids: ['linear-systems'] },
            { deck_id: 'physics/geometric-models', outcome_ids: ['geometric-prediction'] }
        ]);
        expect(candidate.decks.find(deck => deck.id === 'physics/geometric-models').required_outcomes).toEqual([
            { deck_id: 'mathematics/vector-methods', outcome_ids: ['linear-systems', 'vector-projection'] }
        ]);
        expect(candidate.curriculum_schema_version).toBe(1);
        expect(candidate).not.toHaveProperty('schema_version');
        expect(JSON.stringify(raw)).toBe(original);
        expect(compile(raw)).toEqual(candidate);
        // Determinism must not depend on declaration order, including forward references.
        raw.decks.reverse();
        raw.decks.forEach(deck => { deck.outcomes.reverse(); deck.required_outcome_ids.reverse(); });
        expect(compile(raw)).toEqual(candidate);
    });
    it('derives multi-owner coverage targets from the same outcome registry', () => {
        const raw = fixture();
        raw.coverage.push({ subject: 'physics', domain: 'Shared working methods', level: 'undergraduate-core',
            disposition: 'included', outcome_ids: ['geometric-prediction', 'linear-systems'], rationale: 'Uses both methods.' });
        expect(compile(raw).coverage.at(-1).targets).toEqual([
            { deck_id: 'mathematics/vector-methods', outcome_ids: ['linear-systems'] },
            { deck_id: 'physics/geometric-models', outcome_ids: ['geometric-prediction'] }
        ]);
    });
    it('follows the declared owner without a second owner field that can disagree', () => {
        const raw = fixture();
        raw.decks[0].id = 'mathematics/reusable-methods';
        const candidate = compile(raw);
        expect(candidate.decks.find(deck => deck.id === 'physics/geometric-models').prerequisites)
            .toEqual(['mathematics/reusable-methods']);
        expect(candidate.coverage[0].targets[0].deck_id).toBe('mathematics/reusable-methods');
        expect(candidate.decks.some(deck => deck.id === 'mathematics/vector-methods')).toBe(false);
    });
    it('collects unknown references without guessing names or repairing the draft', () => {
        const raw = fixture();
        raw.decks[1].required_outcome_ids = ['vector-projecton'];
        raw.decks[2].required_outcome_ids = ['linear-system'];
        const before = JSON.stringify(raw);
        const report = inspectCurriculumCandidate(raw, raw.subjects);
        expect(report.structuralValid).toBe(false);
        expect(report.structuralErrors).toHaveLength(2);
        expect(report.structuralErrors.join('\n')).toMatch(/vector-projecton/);
        expect(report.structuralErrors.join('\n')).toMatch(/linear-system/);
        expect(JSON.stringify(raw)).toBe(before);
    });
    it.each([
        ['ambiguous IDs', raw => { raw.decks[1].outcomes[0].id = 'linear-systems'; }, /Ambiguous outcome ID/],
        ['invalid ID', raw => { raw.decks[0].outcomes[0].id = 'Not Valid'; }, /Invalid outcome ID/],
        ['duplicate reference', raw => { raw.decks[1].required_outcome_ids.push('vector-projection'); }, /duplicate outcome/],
        ['self edge', raw => { raw.decks[0].required_outcome_ids = ['vector-projection']; }, /cycle/],
        ['cross-subject cycle', raw => { raw.decks[0].required_outcome_ids = ['simulate-model']; }, /cycle/],
        ['unknown coverage', raw => { raw.coverage[0].outcome_ids.push('absent'); }, /unknown outcome/],
        ['duplicate coverage reference', raw => { raw.coverage[0].outcome_ids.push('vector-projection'); }, /duplicate outcome/],
        ['unmapped outcome', raw => { raw.coverage[0].outcome_ids.pop(); }, /included coverage mapping/],
        ['depth mismatch', raw => { raw.coverage[0].level = 'graduate'; }, /depth must match/],
        ['excluded with targets', raw => { raw.coverage[0].disposition = 'deferred'; }, /exclusions must not claim/],
        ['empty included row', raw => { raw.coverage[0].outcome_ids = []; }, /Included coverage/],
        ['missing coverage', raw => { raw.coverage = []; }, /coverage map/],
        ['duplicate decks', raw => { raw.decks[1].id = raw.decks[0].id; }, /Deck IDs contains duplicates/],
        ['invalid deck', raw => { raw.decks[0].id = 'invalid'; }, /Invalid deck ID/],
        ['unrequested subject', raw => { raw.decks[0].id = 'biology/methods'; }, /unrequested subject/],
        ['wrong subjects', raw => { raw.subjects = ['physics']; }, /exactly the requested subjects/],
        ['missing practice notes', raw => { delete raw.practiceNotes; }, /Global candidate/],
        ['invalid version', raw => { raw.schema_version = 99; }, /Unsupported global candidate/],
        ['mixed legacy prerequisite field', raw => { raw.decks[0].prerequisites = []; }, /Deck must contain exactly/],
        ['redundant owner field', raw => { raw.decks[0].subject = 'physics'; }, /Deck must contain exactly/],
        ['legacy coverage target', raw => { raw.coverage[0].targets = []; }, /Coverage row must contain exactly/],
        ['publication injection', raw => { raw.decks[0].repository = 'untrusted'; }, /Deck must contain exactly/]
    ])('rejects %s', (_name, mutate, message) => {
        const raw = fixture(); mutate(raw); const before = JSON.stringify(raw);
        expect(() => compile(raw)).toThrow(message);
        expect(JSON.stringify(raw)).toBe(before);
    });
    it('enforces mandatory names and retains nonblocking scope boundaries', () => {
        const raw = fixture();
        raw.coverage.push({ subject: 'mathematics', domain: 'Specialist extension', level: 'research-specialization',
            disposition: 'out-of-scope', outcome_ids: [], rationale: 'Beyond the representative advanced route.' });
        expect(compile(raw).coverage.at(-1).targets).toEqual([]);
        expect(() => compileGlobalCurriculumCandidate(raw, raw.subjects, {
            mandatoryDecks: [{ subject: 'mathematics', decks: ['absent'] }]
        })).toThrow(/Missing required decks/);
    });
    it('retains the full deck dependency semantics and fits the existing catalog and chapter context', () => {
        const raw = fixture();
        raw.decks[1].required_outcome_ids = ['vector-projection'];
        const candidate = compile(raw);
        const catalog = freshCandidateCatalog({ subjects: [], decks: [] }, candidate, 'curriculum-design', { generation: {} });
        const context = buildFreshGenerationContext({ jobType: 'deck-plan', catalog, deckId: 'physics/geometric-models' });
        expect(context.prerequisites[0].outcomes).toHaveLength(2);
        expect(context.target.required_outcomes[0].outcome_ids).toEqual(['vector-projection']);
        const diagnostics = inspectCurriculumCandidate(raw, raw.subjects, { deckIds: ['physics/geometric-models'] });
        expect(diagnostics.structuralValid).toBe(true);
        expect(diagnostics.educationalReviewRequired).toBe(true);
        expect(diagnostics.decks[0].requirements[0].otherSourceOutcomeIds).toEqual(['linear-systems']);
        expect(diagnostics).not.toHaveProperty('qualityPassed');
    });
    it('keeps the restored generation schema separate from the historical format-2 reader', () => {
        const schema = freshGenerationSchema('curriculum-design');
        expect(schema.properties).not.toHaveProperty('schema_version');
        expect(schema.properties.decks.items.properties).not.toHaveProperty('required_outcome_ids');
        expect(schema.properties.decks.items.properties).toHaveProperty('subject');
        expect(schema.properties.decks.items.properties).toHaveProperty('prerequisites');
        expect(schema.properties.decks.items.properties).toHaveProperty('required_outcomes');
        expect(schema.properties.coverage.items.properties).not.toHaveProperty('outcome_ids');
        expect(schema.properties.coverage.items.properties).toHaveProperty('targets');
    });
});

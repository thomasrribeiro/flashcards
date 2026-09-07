import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFreshGenerationContext, validateGlobalCurriculumCandidate } from './fresh-generation.js';
import { freshCandidateCatalog, readFreshCatalog, writeFreshCatalog } from '../bin/lib/fresh-generation-output.js';

function fixture() {
    const deck = (id, level, prerequisites = []) => ({
        id, subject: id.split('/')[0], title: id.split('/')[1], description: 'Bounded capability.',
        level, scope: { includes: ['Explain the core structures and apply them.'], excludes: ['Research extensions.'] },
        practice: ['Solve extended problems.'], outcomes: [{ id: 'core', description: 'Apply core methods with justified conditions.' }],
        prerequisites, required_outcomes: prerequisites.map(deck_id => ({ deck_id, outcome_ids: ['core'] }))
    });
    const decks = [deck('math/tools', 'undergraduate-core'), deck('physics/models', 'undergraduate-advanced', ['math/tools'])];
    return { curriculum_schema_version: 1, subjects: ['math', 'physics'], decks, scopeIssues: [],
        coverage: decks.map(deck => ({ subject: deck.subject, domain: deck.title, level: deck.level,
            disposition: 'included', targets: [{ deck_id: deck.id, outcome_ids: ['core'] }], rationale: 'Teaches the specified capability.' })) };
}
const validate = candidate => validateGlobalCurriculumCandidate(candidate, ['math', 'physics'], { requireCoverage: true });

describe('whole-field curriculum contract', () => {
    it('retains explicit depth, boundaries, practice and outcome-level coverage', () => {
        const candidate = fixture();
        candidate.coverage.push({ subject: 'physics', domain: 'Shared mathematics', level: 'undergraduate-core',
            disposition: 'included', targets: [{ deck_id: 'math/tools', outcome_ids: ['core'] }], rationale: 'Reuses the single owner.' });
        candidate.coverage.push({ subject: 'physics', domain: 'Specialized extension', level: 'research-specialization',
            disposition: 'deferred', targets: [], rationale: 'A narrow extension beyond the representative routes.' });
        expect(validate(candidate)).toEqual(candidate);
    });
    it.each([
        ['unknown version', candidate => { candidate.curriculum_schema_version = 999; }, /schema version/],
        ['empty map', candidate => { candidate.coverage = []; }, /coverage map/],
        ['missing scope', candidate => { delete candidate.decks[0].scope; }, /scope boundaries/],
        ['empty scope', candidate => { candidate.decks[0].scope.includes = []; }, /must not be empty/],
        ['missing practice', candidate => { delete candidate.decks[0].practice; }, /practice/],
        ['missing issue report', candidate => { delete candidate.scopeIssues; }, /Scope issues/],
        ['invalid depth', candidate => { candidate.coverage[0].level = 'any'; }, /coverage level/],
        ['depth mismatch', candidate => { candidate.coverage[0].level = 'graduate'; }, /depth must match/],
        ['missing deck', candidate => { candidate.coverage[0].targets[0].deck_id = 'math/missing'; }, /missing deck/],
        ['missing outcome', candidate => { candidate.coverage[0].targets[0].outcome_ids = ['missing']; }, /missing outcomes/],
        ['unmapped outcome', candidate => { candidate.decks[0].outcomes.push({ id: 'other', description: 'Derive another result.' }); }, /Every deck outcome/],
        ['empty included target', candidate => { candidate.coverage[0].targets = []; }, /Included coverage/],
        ['excluded but claimed', candidate => { candidate.coverage[0].disposition = 'deferred'; }, /exclusions must not claim/],
        ['empty exclusion reason', candidate => { candidate.coverage[0].rationale = ' '; }, /rationale/],
        ['duplicate row', candidate => { candidate.coverage.push(candidate.coverage[0]); }, /duplicates/],
        ['duplicate targets', candidate => { candidate.coverage[0].targets.push(candidate.coverage[0].targets[0]); }, /duplicates/],
        ['unknown subject', candidate => { candidate.coverage[0].subject = 'chemistry'; }, /unrequested subject/],
        ['unmapped subject', candidate => { candidate.coverage[0].subject = 'physics'; }, /Every subject needs included/],
        ['cycle', candidate => { candidate.decks[0].prerequisites = ['physics/models']; candidate.decks[0].required_outcomes = [{ deck_id: 'physics/models', outcome_ids: ['core'] }]; }, /cycle/]
    ])('rejects %s', (_name, mutate, error) => {
        const candidate = fixture(); mutate(candidate);
        expect(() => validate(candidate)).toThrow(error);
    });
    it('keeps legacy proposals readable but does not accept their contract for new runs', () => {
        const candidate = fixture();
        delete candidate.curriculum_schema_version; delete candidate.coverage; delete candidate.scopeIssues;
        candidate.decks.forEach(deck => { delete deck.scope; delete deck.practice; delete deck.level; });
        expect(validateGlobalCurriculumCandidate(candidate, candidate.subjects).decks).toHaveLength(2);
        expect(() => validate(candidate)).toThrow(/learning level/);
    });
    it('stamps schema metadata on the host and reads the previous marker for compatibility', () => {
        const candidate = fixture(); delete candidate.curriculum_schema_version;
        expect(validate(candidate).curriculum_schema_version).toBe(1);
        candidate.curriculum_version = 'whole-field-v1';
        const migrated = validate(candidate);
        expect(migrated.curriculum_schema_version).toBe(1);
        expect(migrated).not.toHaveProperty('curriculum_version');
    });
    it('rejects missing mandatory deck IDs instead of allowing a mention in another deck', () => {
        const candidate = fixture();
        expect(() => validateGlobalCurriculumCandidate(candidate, candidate.subjects, {
            mandatoryDecks: [{ subject: 'math', decks: ['fourier-analysis'] }]
        })).toThrow('Missing required decks: math/fourier-analysis.');
        expect(() => validateGlobalCurriculumCandidate(candidate, candidate.subjects, {
            mandatoryDecks: [{ subject: 'math', decks: ['tools'] }]
        })).not.toThrow();
    });
    it('persists coverage and passes only accepted scope to later generation, never old content', () => {
        const candidate = fixture();
        const before = structuredClone(candidate);
        before.decks.forEach(deck => { deck.chapters = [{ cards: ['OLD_CONTENT'] }]; deck.generation_runs = ['OLD_HISTORY']; });
        const after = freshCandidateCatalog(before, candidate, 'curriculum-design', { generation: { run_id: 'test' } });
        expect(after.coverage).toEqual(candidate.coverage);
        const context = buildFreshGenerationContext({ jobType: 'deck-plan', catalog: after, deckId: 'physics/models' });
        expect(context.target.scope).toEqual(candidate.decks[1].scope);
        expect(context.prerequisites[0].practice).toEqual(candidate.decks[0].practice);
        expect(JSON.stringify(context)).not.toMatch(/OLD_|chapters|generation_runs|coverage/);
        // Persist the same metadata across write/read, without invalid fake chapters.
        after.decks.forEach(deck => { deck.chapters = []; });
        const root = mkdtempSync(path.join(os.tmpdir(), 'coverage-catalog-'));
        writeFreshCatalog(root, after, before, 1, path.join(root, 'dist/curriculum.json'));
        expect(readFreshCatalog(path.join(root, 'fresh-curriculum.json'))).toEqual(after);
    });
    it.each(['scope', 'practice', 'level'])('marks %s changes and descendants stale without overwriting old content', field => {
        const before = fixture();
        before.decks.forEach(deck => { deck.chapters = [{ cards: ['OLD_CONTENT'] }]; });
        const candidate = structuredClone(before);
        if (field === 'scope') candidate.decks[0].scope.includes.push('New theory.');
        if (field === 'practice') candidate.decks[0].practice.push('Construct proofs.');
        if (field === 'level') { candidate.decks[0].level = 'graduate'; candidate.coverage[0].level = 'graduate'; }
        const after = freshCandidateCatalog(before, candidate, 'curriculum-design', { generation: {} });
        expect(after.decks.every(deck => deck.content_state === 'needs-review' && deck.chapters.length === 0)).toBe(true);
        expect(before.decks[0].chapters[0].cards).toEqual(['OLD_CONTENT']);
    });
});

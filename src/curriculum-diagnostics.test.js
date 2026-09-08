import { describe, expect, it } from 'vitest';
import { inspectCurriculumCandidate } from './curriculum-diagnostics.js';

function fixture() {
    const deck = (id, prerequisites = [], level = 'foundational') => ({
        id, subject: id.split('/')[0], title: id, description: 'A learning contract.', level,
        scope: { includes: ['Two related capabilities.'], excludes: [] },
        outcomes: [{ id: 'first', description: 'Demonstrate the first capability.' },
            { id: 'second', description: 'Demonstrate the second capability.' }],
        practice: ['Solve a representative problem.'], prerequisites,
        required_outcomes: prerequisites.map(deck_id => ({ deck_id, outcome_ids: ['first'] }))
    });
    const decks = [deck('math/base'), deck('math/bridge', ['math/base'], 'graduate'),
        deck('physics/application', ['math/bridge', 'math/base']), deck('physics/independent')];
    return { subjects: ['math', 'physics'], decks, scopeIssues: [], practiceNotes: [],
        coverage: decks.map(item => ({ subject: item.subject, domain: item.id, level: item.level,
            disposition: 'included', targets: [{ deck_id: item.id, outcome_ids: item.outcomes.map(outcome => outcome.id) }],
            rationale: 'Demonstrates both specified capabilities.' })) };
}

describe('candidate-only deterministic diagnostics', () => {
    it('traces full cross-subject closures without treating annotations as partial-deck prerequisites', () => {
        const raw = fixture(); const before = JSON.stringify(raw);
        const report = inspectCurriculumCandidate(raw, ['math', 'physics'], { deckIds: ['physics/application'] });
        expect(report.structuralValid).toBe(true);
        expect(report.educationalReviewRequired).toBe(true);
        expect(report.declaredScopeIssues).toEqual([]);
        expect(report.summary).toMatchObject({ deckCount: 4, outcomeCount: 8, edgeCount: 3, crossSubjectEdgeCount: 2 });
        expect(report.decks).toHaveLength(1);
        expect(report.decks[0].ancestors).toEqual(['math/base', 'math/bridge']);
        expect(report.decks[0].requirements).toEqual([
            { source: 'math/base', requiredOutcomeIds: ['first'], otherSourceOutcomeIds: ['second'],
                sourceAncestors: [], higherLevelSource: false, alternatePath: ['physics/application', 'math/bridge', 'math/base'] },
            { source: 'math/bridge', requiredOutcomeIds: ['first'], otherSourceOutcomeIds: ['second'],
                sourceAncestors: ['math/base'], higherLevelSource: true, alternatePath: [] }
        ]);
        expect(JSON.stringify(raw)).toBe(before);
    });
    it('reports indirect consumers and all-source outcomes as signals, not additional failures', () => {
        const report = inspectCurriculumCandidate(fixture(), ['math', 'physics']);
        expect(report.decks.find(deck => deck.id === 'math/base').downstreamDeckCount).toBe(2);
        expect(report.decks.find(deck => deck.id === 'physics/independent').downstreamDeckCount).toBe(0);
        expect(report.structuralErrors).toEqual([]);
        expect(report).not.toHaveProperty('qualityPassed');
    });
    it('keeps model-declared issues and nonblocking exclusions separate from structural errors', () => {
        const raw = fixture(); raw.scopeIssues = ['A required branch is missing.'];
        const exclusion = { subject: 'math', domain: 'Specialist frontier', level: 'research-specialization',
            disposition: 'out-of-scope', targets: [], rationale: 'A separately scoped extension.' };
        raw.coverage.push(exclusion);
        const report = inspectCurriculumCandidate(raw, raw.subjects);
        expect(report.structuralValid).toBe(true);
        expect(report.declaredScopeIssues).toEqual(raw.scopeIssues);
        expect(report.exclusions).toEqual([exclusion]);
        expect(report.summary.singleDeckCoverageRows).toBe(4);
    });
    it.each([
        ['cycle', raw => { raw.decks[0].prerequisites = ['math/bridge']; raw.decks[0].required_outcomes = [{ deck_id: 'math/bridge', outcome_ids: ['first'] }]; }, /cycle/],
        ['missing outcome', raw => { raw.decks[1].required_outcomes[0].outcome_ids = ['nonexistent']; }, /missing prerequisite outcomes/],
        ['missing coverage', raw => { raw.coverage.pop(); }, /included coverage mapping/],
        ['missing practice report', raw => { delete raw.practiceNotes; }, /practice notes/]
    ])('reuses the canonical validator for %s', (_name, mutate, error) => {
        const raw = fixture(); mutate(raw);
        const report = inspectCurriculumCandidate(raw, ['math', 'physics']);
        expect(report.structuralValid).toBe(false);
        expect(report.structuralErrors[0]).toMatch(error);
        expect(report).not.toHaveProperty('decks');
    });
    it('uses independent expected subjects and mandatory decks, never candidate assertions as requirements', () => {
        const raw = fixture();
        expect(inspectCurriculumCandidate(raw, ['math']).structuralErrors[0]).toMatch(/exactly the requested subjects/);
        expect(inspectCurriculumCandidate(raw, raw.subjects, { mandatoryDecks: [{ subject: 'math', decks: ['missing'] }] })
            .structuralErrors[0]).toMatch(/Missing required decks/);
    });
    it('rejects unknown inspection targets and handles malformed output', () => {
        expect(() => inspectCurriculumCandidate(fixture(), ['math', 'physics'], { deckIds: ['math/missing'] }))
            .toThrow(/unknown deck/);
        expect(inspectCurriculumCandidate(null, ['math']).structuralValid).toBe(false);
    });
});

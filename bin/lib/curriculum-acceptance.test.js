import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAcceptanceReview, assessCurriculumAcceptance } from './curriculum-acceptance.js';
function fixture() {
    const candidate = { subjects: ['math'], scopeIssues: [], practiceNotes: [],
        decks: [{ id: 'math/base', subject: 'math', title: 'Base', description: 'Learn working methods.', level: 'foundational',
            scope: { includes: ['Arithmetic and proofs.'], excludes: [] },
            outcomes: [{ id: 'calculate', description: 'Calculate quantities.' }],
            prerequisites: [], required_outcomes: [], practice: ['Solve an unfamiliar quantitative problem.'] }],
        coverage: [{ subject: 'math', domain: 'Foundations', level: 'foundational', disposition: 'included',
            targets: [{ deck_id: 'math/base', outcome_ids: ['calculate'] }], rationale: 'Perform calculations.' }] };
    const benchmark = { version: 'test-1', subjects: ['math'], criteria: [{ id: 'arithmetic', subject: 'math', topic: 'Arithmetic', required: true }] };
    const review = createAcceptanceReview(candidate, ['math'], benchmark);
    for (const row of [...review.criteria, ...review.dimensions]) Object.assign(row, {
        verdict: 'pass', reason: 'Independent review finds this explicit capability adequate.', evidence: [{ deckId: 'math/base', outcomeIds: ['calculate'] }] });
    return { candidate, benchmark, review };
}
const assess = ({ candidate, benchmark, review }) => assessCurriculumAcceptance(candidate, ['math'], benchmark, review);
describe('external curriculum acceptance gate', () => {
    it('accepts a complete pinned review without modifying inputs', () => {
        const f = fixture(), before = JSON.stringify(f);
        expect(assess(f)).toMatchObject({ accepted: true, verdict: 'accept' });
        expect(JSON.stringify(f)).toBe(before);
    });
    it.each([
        ['absent review', f => { f.review = null; }],
        ['unreviewed criterion', f => { f.review.criteria[0].verdict = 'pending'; }],
        ['omitted dimension', f => { f.review.dimensions.pop(); }],
        ['stale candidate', f => { f.candidate.decks[0].description = 'Changed.'; }],
        ['stale benchmark', f => { f.benchmark.criteria[0].topic = 'Changed scope'; }],
        ['invalid outcome', f => { f.review.criteria[0].evidence[0].outcomeIds = ['absent']; }],
        ['missing evidence', f => { f.review.criteria[0].evidence = []; }],
        ['waived requirement', f => { f.review.criteria[0].verdict = 'optional'; }],
        ['duplicate criterion', f => { f.review.criteria.push(f.review.criteria[0]); }]
    ])('fails closed for %s', (_name, change) => {
        const f = fixture(); change(f);
        expect(assess(f)).toMatchObject({ accepted: false, verdict: 'incomplete-review' });
    });
    it('distinguishes blockers from warnings and preserves declared model issues', () => {
        const f = fixture();
        f.review.criteria[0].verdict = 'warning';
        expect(assess(f).verdict).toBe('accept-with-warnings');
        f.review.criteria[0].verdict = 'blocker'; f.review.criteria[0].evidence = [];
        expect(assess(f).verdict).toBe('needs-revision');
        f.candidate.scopeIssues.push('Missing a major branch.');
        const fresh = createAcceptanceReview(f.candidate, ['math'], f.benchmark);
        f.review.candidateHash = fresh.candidateHash;
        expect(assess(f).blockers).toContainEqual(expect.objectContaining({ id: 'model-scope-issue' }));
    });
    it('rejects mismatched or duplicate benchmark criteria', () => {
        const f = fixture(); f.benchmark.criteria.push(f.benchmark.criteria[0]);
        expect(() => assess(f)).toThrow(/unique IDs/);
        expect(() => createAcceptanceReview(f.candidate, ['physics'], f.benchmark)).toThrow(/matching subjects/);
    });
    it('CLI returns failure without external review and success only for completed review', () => {
        const root = mkdtempSync(join(tmpdir(), 'curriculum-review-'));
        try {
            const f = fixture();
            for (const key of ['candidate', 'benchmark', 'review']) writeFileSync(join(root, `${key}.json`), JSON.stringify(f[key]));
            const args = ['bin/flashcards.js', 'curriculum', 'review-candidate', join(root, 'candidate.json'), '--subjects', 'math', '--benchmark', join(root, 'benchmark.json')];
            const missing = spawnSync(process.execPath, args, { encoding: 'utf8' });
            expect(missing.status).toBe(1);
            expect(JSON.parse(missing.stdout).accepted).toBe(false);
            const passed = JSON.parse(execFileSync(process.execPath, [...args, '--review', join(root, 'review.json')], { encoding: 'utf8' }));
            expect(passed.accepted).toBe(true);
            const pending = JSON.parse(execFileSync(process.execPath, [...args, '--template'], { encoding: 'utf8' }));
            expect(pending.criteria[0].verdict).toBe('pending');
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});

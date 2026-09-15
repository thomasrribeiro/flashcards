import { createHash } from 'node:crypto';
import { inspectCurriculumCandidate } from '../../src/curriculum-diagnostics.js';

// External, read-only adjudication. Never imported by generation or recovery.
// This checks completeness and provenance of a human review, not semantic truth.
export const REVIEW_DIMENSIONS = ['breadth-depth', 'learner-readiness', 'teaching-contract', 'learning-usefulness'];
const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

function validateBenchmark(benchmark, subjects) {
    if (!nonempty(benchmark?.version) || !Array.isArray(benchmark.subjects)
        || JSON.stringify([...benchmark.subjects].sort()) !== JSON.stringify([...subjects].sort())
        || !Array.isArray(benchmark.criteria) || !benchmark.criteria.length) {
        throw new Error('Benchmark requires a version, matching subjects and nonempty criteria.');
    }
    const ids = new Set();
    for (const row of benchmark.criteria) {
        if (!nonempty(row.id) || ids.has(row.id) || !subjects.includes(row.subject)
            || !nonempty(row.topic) || typeof row.required !== 'boolean') {
            throw new Error('Benchmark criteria require unique IDs, a subject, topic and explicit required flag.');
        }
        ids.add(row.id);
    }
    for (const subject of subjects) {
        if (!benchmark.criteria.some(row => row.subject === subject)) throw new Error(`Benchmark omits subject ${subject}.`);
    }
}

export function createAcceptanceReview(candidate, subjects, benchmark) {
    validateBenchmark(benchmark, subjects);
    const pending = id => ({ id, verdict: 'pending', reason: '', evidence: [] });
    return { candidateHash: hash(candidate), benchmarkHash: hash(benchmark),
        criteria: benchmark.criteria.map(row => pending(row.id)), dimensions: REVIEW_DIMENSIONS.map(pending) };
}

export function assessCurriculumAcceptance(candidate, subjects, benchmark, review) {
    const template = createAcceptanceReview(candidate, subjects, benchmark);
    const structural = inspectCurriculumCandidate(candidate, subjects);
    const errors = [], blockers = [], warnings = [];
    if (!structural.structuralValid) errors.push(...structural.structuralErrors);
    blockers.push(...(structural.declaredScopeIssues || []).map(reason => ({ id: 'model-scope-issue', reason })));
    if (review?.candidateHash !== template.candidateHash) errors.push('Review is missing or belongs to a different candidate.');
    if (review?.benchmarkHash !== template.benchmarkHash) errors.push('Review is missing or belongs to a different benchmark.');
    const decks = new Map((structural.decks || []).map(deck => [deck.id, deck]));
    const inspectRows = (rows, expected, label) => {
        if (!Array.isArray(rows)) { errors.push(`Missing ${label} review.`); return; }
        const seen = new Set();
        for (const row of rows) {
            const criterion = expected.find(item => item.id === row?.id);
            if (!criterion || seen.has(row.id)) { errors.push(`Unknown or duplicate ${label} ID: ${row?.id}.`); continue; }
            seen.add(row.id);
            if (!['pass', 'warning', 'blocker', 'optional'].includes(row.verdict)) errors.push(`Unreviewed ${row.id}.`);
            if (!nonempty(row.reason)) errors.push(`Missing rationale for ${row.id}.`);
            if (criterion.required && row.verdict === 'optional') errors.push(`Required criterion ${row.id} cannot be waived as optional.`);
            if (!Array.isArray(row.evidence)) { errors.push(`Missing evidence array for ${row.id}.`); continue; }
            if (['pass', 'warning'].includes(row.verdict) && !row.evidence.length) errors.push(`No teaching evidence for ${row.id}.`);
            for (const evidence of row.evidence) {
                const deck = decks.get(evidence?.deckId);
                if (!deck || !Array.isArray(evidence.outcomeIds) || !evidence.outcomeIds.length
                    || evidence.outcomeIds.some(id => !deck.outcomes.some(outcome => outcome.id === id))) {
                    errors.push(`Invalid teaching reference for ${row.id}.`);
                }
            }
            if (row.verdict === 'blocker') blockers.push({ id: row.id, reason: row.reason, evidence: row.evidence });
            if (row.verdict === 'warning') warnings.push({ id: row.id, reason: row.reason, evidence: row.evidence });
        }
        for (const row of expected) if (!seen.has(row.id)) errors.push(`Missing ${label} criterion ${row.id}.`);
    };
    inspectRows(review?.criteria, benchmark.criteria, 'coverage');
    inspectRows(review?.dimensions, REVIEW_DIMENSIONS.map(id => ({ id, required: true })), 'dimension');
    const accepted = !errors.length && !blockers.length;
    return { accepted, verdict: errors.length ? 'incomplete-review' : blockers.length ? 'needs-revision' : warnings.length ? 'accept-with-warnings' : 'accept',
        candidateHash: template.candidateHash, benchmarkHash: template.benchmarkHash,
        structuralValid: structural.structuralValid, errors, blockers, warnings,
        interpretation: 'External reviewer judgments are required. Valid references do not prove educational adequacy. This command neither calls a model nor publishes, merges or applies the candidate.' };
}

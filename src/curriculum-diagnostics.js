import { CURRICULUM_LEVELS, validateGlobalCurriculumCandidate } from './fresh-generation.js';

/**
 * Read-only, provider-independent inspection of ONE supplied candidate.
 * No files, network, old curriculum, model calls, or candidate mutations.
 * Signals help a reviewer find paths to inspect; they are not quality gates.
 */
export function inspectCurriculumCandidate(raw, subjects, { mandatoryDecks = [], deckIds = [] } = {}) {
    let candidate;
    try {
        if (!raw || !Array.isArray(raw.practiceNotes)) throw new Error('Missing practice notes report.');
        candidate = validateGlobalCurriculumCandidate(raw, subjects, { requireCoverage: true, mandatoryDecks });
    } catch (error) {
        return { structuralValid: false, structuralErrors: [error.message], educationalReviewRequired: true };
    }
    const byId = new Map(candidate.decks.map(deck => [deck.id, deck]));
    for (const id of deckIds) if (!byId.has(id)) throw new Error(`Cannot inspect unknown deck: ${id}.`);
    const closures = new Map();
    const ancestors = id => {
        if (!closures.has(id)) {
            const result = new Set();
            for (const source of byId.get(id).prerequisites) {
                ancestors(source).forEach(ancestor => result.add(ancestor));
                result.add(source);
            }
            closures.set(id, result);
        }
        return closures.get(id);
    };
    candidate.decks.forEach(deck => ancestors(deck.id));
    const pathTo = (start, target) => {
        if (start === target) return [start];
        const next = byId.get(start).prerequisites.find(id => id === target || ancestors(id).has(target));
        return next ? [start, ...pathTo(next, target)] : [];
    };
    const selected = deckIds.length ? candidate.decks.filter(deck => deckIds.includes(deck.id)) : candidate.decks;
    const decks = selected.map(deck => ({
        id: deck.id,
        level: deck.level,
        scope: deck.scope,
        outcomes: deck.outcomes,
        practice: deck.practice,
        ancestors: [...ancestors(deck.id)].sort(),
        // Includes indirect consumers; source outcome annotations never exempt
        // a learner from the rest of that source deck or its ancestor closure.
        downstreamDeckCount: candidate.decks.filter(other => ancestors(other.id).has(deck.id)).length,
        requirements: deck.required_outcomes.map(edge => {
            const source = byId.get(edge.deck_id);
            const via = deck.prerequisites.find(id => id !== source.id && ancestors(id).has(source.id));
            return {
                source: source.id,
                requiredOutcomeIds: edge.outcome_ids,
                otherSourceOutcomeIds: source.outcomes.map(outcome => outcome.id).filter(id => !edge.outcome_ids.includes(id)),
                sourceAncestors: [...ancestors(source.id)].sort(),
                higherLevelSource: CURRICULUM_LEVELS.indexOf(source.level) > CURRICULUM_LEVELS.indexOf(deck.level),
                alternatePath: via ? [deck.id, ...pathTo(via, source.id)] : []
            };
        })
    }));
    const included = candidate.coverage.filter(row => row.disposition === 'included');
    return {
        structuralValid: true,
        structuralErrors: [],
        declaredScopeIssues: candidate.scopeIssues,
        educationalReviewRequired: true,
        interpretation: 'Structural validity and traceability do not establish completeness or learner readiness. Higher-level sources, alternate paths, and other source outcomes are inspection signals, not automatic defects. Do not delete edges or split decks without evaluating their contracts.',
        summary: {
            deckCount: candidate.decks.length,
            outcomeCount: candidate.decks.reduce((sum, deck) => sum + deck.outcomes.length, 0),
            edgeCount: candidate.decks.reduce((sum, deck) => sum + deck.prerequisites.length, 0),
            crossSubjectEdgeCount: candidate.decks.reduce((sum, deck) => sum + deck.prerequisites.filter(id => byId.get(id).subject !== deck.subject).length, 0),
            subjects: candidate.subjects.map(subject => ({ subject, levels: Object.fromEntries(CURRICULUM_LEVELS.map(level =>
                [level, candidate.decks.filter(deck => deck.subject === subject && deck.level === level).length])) })),
            includedCoverageRows: included.length,
            singleDeckCoverageRows: included.filter(row => row.targets.length === 1).length
        },
        exclusions: candidate.coverage.filter(row => row.disposition !== 'included'),
        decks
    };
}

import { validateGlobalCurriculumCandidate } from './fresh-generation.js';

// The model-facing format is separate from the persisted catalog format.
// Compilation resolves declared references only; it never infers pedagogy,
// repairs names, drops edges, or consults a previous candidate/catalog.
export const GLOBAL_CURRICULUM_FORMAT = 2;
export const GLOBAL_CURRICULUM_COMPILER = 1;

function shape(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || keys.some(key => !Object.hasOwn(value, key))
        || Object.keys(value).some(key => !keys.includes(key))) {
        throw new Error(`${label} must contain exactly: ${keys.join(', ')}.`);
    }
}

function array(value, label) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
}

export function compileGlobalCurriculumCandidate(raw, subjects, options = {}) {
    shape(raw, ['schema_version', 'subjects', 'decks', 'coverage', 'scopeIssues', 'practiceNotes'], 'Global candidate');
    if (raw.schema_version !== GLOBAL_CURRICULUM_FORMAT) throw new Error('Unsupported global candidate format.');
    array(raw.practiceNotes, 'Practice notes');
    const owners = new Map();
    const errors = [];
    const decks = array(raw.decks, 'Decks').map(deck => {
        shape(deck, ['id', 'title', 'description', 'level', 'scope', 'outcomes', 'practice', 'required_outcome_ids'], 'Deck');
        shape(deck.scope, ['includes', 'excludes'], 'Deck scope');
        array(deck.outcomes, 'Deck outcomes').forEach(outcome => {
            shape(outcome, ['id', 'description'], 'Outcome');
            if (typeof outcome.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(outcome.id)) {
                errors.push(`Invalid outcome ID in ${deck.id}.`);
            } else if (owners.has(outcome.id)) {
                errors.push(`Ambiguous outcome ID: ${outcome.id}. Outcome IDs must be globally unique.`);
            } else owners.set(outcome.id, deck.id);
        });
        return deck;
    });
    const targets = (references, label) => {
        const groups = new Map();
        const seen = new Set();
        for (const id of array(references, label)) {
            if (typeof id !== 'string' || !owners.has(id)) {
                errors.push(`${label}: unknown outcome ${JSON.stringify(id)}.`);
                continue;
            }
            if (seen.has(id)) errors.push(`${label}: duplicate outcome ${id}.`);
            seen.add(id);
            const owner = owners.get(id);
            if (!groups.has(owner)) groups.set(owner, []);
            groups.get(owner).push(id);
        }
        return [...groups].sort(([a], [b]) => a.localeCompare(b))
            .map(([deck_id, outcome_ids]) => ({ deck_id, outcome_ids: outcome_ids.sort() }));
    };
    const compiledDecks = decks.map(({ required_outcome_ids, ...deck }) => {
        const required_outcomes = targets(required_outcome_ids, `${deck.id} requirements`);
        return { ...deck, subject: typeof deck.id === 'string' ? deck.id.split('/')[0] : '',
            prerequisites: required_outcomes.map(edge => edge.deck_id), required_outcomes };
    });
    const coverage = array(raw.coverage, 'Coverage').map(row => {
        shape(row, ['subject', 'domain', 'level', 'disposition', 'outcome_ids', 'rationale'], 'Coverage row');
        const { outcome_ids, ...metadata } = row;
        return { ...metadata, targets: targets(outcome_ids, `${row.subject}/${row.domain} coverage`) };
    });
    if (errors.length) {
        const error = new Error(errors.join('\n'));
        error.structuralErrors = errors;
        throw error;
    }
    return validateGlobalCurriculumCandidate({ subjects: raw.subjects, decks: compiledDecks, coverage,
        scopeIssues: raw.scopeIssues, practiceNotes: raw.practiceNotes }, subjects, { ...options, requireCoverage: true });
}

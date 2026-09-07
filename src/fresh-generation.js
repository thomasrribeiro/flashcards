// Shared, provider-independent boundary for the new generation pipeline.
// Never serialize a catalog or queued job directly into a model request.
import { canonicalSubjectNames, canonicalMandatoryDecks } from './global-curriculum-input.js';
export { canonicalSubjectNames } from './global-curriculum-input.js';
export const FRESH_GENERATION_VERSION = 'fresh-generation-v1';
export const FRESH_JOB_TYPES = ['curriculum-design', 'deck-plan', 'chapter-expand'];
export const CURRICULUM_SCHEMA_VERSION = 1;
export const CURRICULUM_LEVELS = ['foundational', 'undergraduate-core', 'undergraduate-advanced', 'graduate', 'research-specialization'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHAPTER_ID = /^\d{2,}_[a-z0-9]+(?:_[a-z0-9]+)*$/;

function requireValue(condition, message) {
    if (!condition) throw new Error(message);
}

function text(value, label) {
    requireValue(typeof value === 'string' && value.trim(), `${label} is required.`);
    return value.trim();
}

function unique(values, label) {
    requireValue(Array.isArray(values), `${label} must be an array.`);
    requireValue(new Set(values).size === values.length, `${label} contains duplicates.`);
    return values;
}

function outcomes(values, label) {
    requireValue(Array.isArray(values) && values.length > 0, `${label} needs learning outcomes.`);
    const result = values.map(value => ({
        id: text(value.id, `${label} outcome ID`),
        description: text(value.description, `${label} outcome description`)
    }));
    unique(result.map(value => value.id), `${label} outcomes`);
    requireValue(result.every(value => SLUG.test(value.id)), `${label} outcome IDs must use kebab-case.`);
    return result.sort((a, b) => a.id.localeCompare(b.id));
}

function textList(values, label, { nonempty = false } = {}) {
    const result = unique(values, label).map(value => text(value, label));
    unique(result, label);
    requireValue(!nonempty || result.length > 0, `${label} must not be empty.`);
    return result;
}

function learningScope(deck) {
    requireValue(CURRICULUM_LEVELS.includes(deck.level), `${deck.id} has an invalid learning level.`);
    requireValue(deck.scope && typeof deck.scope === 'object', `${deck.id} needs scope boundaries.`);
    return {
        level: deck.level,
        scope: {
            includes: textList(deck.scope.includes, `${deck.id} included scope`, { nonempty: true }),
            excludes: textList(deck.scope.excludes, `${deck.id} excluded scope`)
        },
        practice: textList(deck.practice, `${deck.id} authentic practice`, { nonempty: true })
    };
}

function deckSpecification(deck) {
    requireValue(deck && DECK_ID.test(deck.id), 'Invalid deck ID.');
    requireValue(deck.subject === deck.id.split('/')[0], `${deck.id} has an inconsistent subject.`);
    const prerequisites = unique(deck.prerequisites || [], `${deck.id} prerequisites`);
    requireValue(prerequisites.every(id => DECK_ID.test(id)), `${deck.id} has an invalid prerequisite.`);
    return {
        id: deck.id,
        subject: deck.subject,
        title: text(deck.title || deck.deck, `${deck.id} title`),
        description: text(deck.description, `${deck.id} scope`),
        // Project accepted scope only, never old content or publication data.
        ...(deck.scope !== undefined || deck.practice !== undefined ? learningScope(deck) : {}),
        outcomes: outcomes(deck.outcomes, deck.id),
        prerequisites: [...prerequisites].sort(),
        required_outcomes: (deck.required_outcomes || []).map(edge => ({
            deck_id: text(edge.deck_id, 'Prerequisite deck'),
            outcome_ids: [...unique(edge.outcome_ids, 'Required outcomes')].sort()
        })).sort((a, b) => a.deck_id.localeCompare(b.deck_id))
    };
}

function validateDeckEdges(decks) {
    const byId = new Map(decks.map(deck => [deck.id, deck]));
    unique(decks.map(deck => deck.id), 'Deck IDs');
    for (const deck of decks) {
        unique(deck.required_outcomes.map(edge => edge.deck_id), `${deck.id} requirement annotations`);
        requireValue(deck.required_outcomes.length === deck.prerequisites.length,
            `${deck.id} must annotate every prerequisite with required outcomes.`);
        for (const edge of deck.required_outcomes) {
            const source = byId.get(edge.deck_id);
            requireValue(source && deck.prerequisites.includes(edge.deck_id), `${deck.id} references an undeclared prerequisite.`);
            const ids = new Set(source.outcomes.map(outcome => outcome.id));
            requireValue(edge.outcome_ids.length > 0 && edge.outcome_ids.every(id => ids.has(id)),
                `${deck.id} references missing prerequisite outcomes.`);
        }
    }
    dependencyOrder(byId, [...byId.keys()]);
    return byId;
}

function dependencyOrder(byId, roots) {
    const visited = new Set(), visiting = new Set(), ordered = [];
    const visit = id => {
        requireValue(byId.has(id), `Missing prerequisite: ${id}.`);
        requireValue(!visiting.has(id), `Prerequisite cycle: ${id}.`);
        if (visited.has(id)) return;
        visiting.add(id);
        const prerequisites = byId.get(id).prerequisites || [];
        requireValue(Array.isArray(prerequisites), `${id} prerequisites must be an array.`);
        for (const source of [...prerequisites].sort()) visit(source);
        visiting.delete(id);
        visited.add(id);
        ordered.push(byId.get(id));
    };
    [...roots].sort().forEach(visit);
    return ordered;
}

function chapterSpecification(chapter, deckId) {
    requireValue(CHAPTER_ID.test(chapter.id), 'Invalid chapter ID.');
    const local = (chapter.prerequisites || []).map(reference => {
        requireValue(typeof reference === 'string' && reference.startsWith('chapter:'),
            `${chapter.id}: chapter prerequisites must be local chapter references.`);
        const id = reference.slice('chapter:'.length);
        requireValue(CHAPTER_ID.test(id), `${chapter.id}: cross-deck chapter prerequisites are not allowed.`);
        return id;
    });
    for (const dependency of chapter.resolved_dependencies || []) {
        requireValue(dependency.kind !== 'external-concept'
            && (!dependency.resolved?.includes('#') || dependency.resolved.startsWith(`${deckId}#`)),
        `${chapter.id}: migrate cross-deck chapter dependencies before fresh generation.`);
    }
    return {
        id: chapter.id,
        title: text(chapter.title, `${chapter.id} title`),
        outcomes: outcomes(chapter.outcomes, chapter.id),
        prerequisites: [...unique(local, `${chapter.id} prerequisites`)].sort()
    };
}

export function buildFreshGenerationContext({ jobType, subjects, mandatoryDecks, catalog, deckId, chapterId }) {
    requireValue(FRESH_JOB_TYPES.includes(jobType), 'Unsupported fresh generation job.');
    // Intentionally return before touching the old catalog for global jobs.
    if (jobType === 'curriculum-design') {
        const names = canonicalSubjectNames(subjects);
        const required = canonicalMandatoryDecks(mandatoryDecks, names);
        return { subjects: names, ...(required.length ? { mandatoryDecks: required } : {}) };
    }
    const rawDecks = new Map((catalog?.decks || []).map(deck => [deck.id, deck]));
    unique((catalog?.decks || []).map(deck => deck.id), 'Deck IDs');
    const rawTarget = rawDecks.get(deckId);
    requireValue(rawTarget, `Deck not found: ${deckId}.`);
    // Only the target and its ancestors are projected. Unrelated material and
    // old plans/cards, repository URLs, run history, paths and status stay out.
    const selected = dependencyOrder(rawDecks, [deckId]).map(deckSpecification);
    validateDeckEdges(selected);
    const target = selected.find(deck => deck.id === deckId);
    const context = { target, prerequisites: selected.filter(deck => deck.id !== deckId) };
    if (jobType === 'deck-plan') return context;
    const chapters = (rawTarget.chapters || []).map(chapter => chapterSpecification(chapter, deckId));
    unique(chapters.map(chapter => chapter.id), 'Chapter IDs');
    const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));
    dependencyOrder(byId, [...byId.keys()]);
    requireValue(byId.has(chapterId), `Chapter not found: ${chapterId}.`);
    return { ...context, chapters: chapters.sort((a, b) => a.id.localeCompare(b.id)), chapterId };
}

export function validateGlobalCurriculumCandidate(candidate, expectedSubjects, { requireCoverage = false, mandatoryDecks = [] } = {}) {
    const subjects = canonicalSubjectNames(candidate.subjects || []);
    requireValue(JSON.stringify(subjects) === JSON.stringify(canonicalSubjectNames(expectedSubjects)),
        'The candidate must contain exactly the requested subjects.');
    requireValue(Array.isArray(candidate.decks) && candidate.decks.length > 0, 'The candidate has no decks.');
    const decks = candidate.decks.map(deckSpecification);
    requireValue(decks.every(deck => subjects.includes(deck.subject)), 'A deck belongs to an unrequested subject.');
    requireValue(subjects.every(subject => decks.some(deck => deck.subject === subject)), 'Every subject needs a curriculum.');
    validateDeckEdges(decks);
    const ids = new Set(decks.map(deck => deck.id));
    const missing = canonicalMandatoryDecks(mandatoryDecks, subjects)
        .flatMap(group => group.decks.map(deck => `${group.subject}/${deck}`)).filter(id => !ids.has(id));
    requireValue(!missing.length, `Missing required decks: ${missing.join(', ')}.`);
    // Returning a projection prevents model-supplied paths, content or
    // publication metadata from leaking into the downstream acceptance step.
    const result = { subjects, decks: decks.sort((a, b) => a.id.localeCompare(b.id)) };
    // Historical proposals have no coverage contract. New runner jobs require
    // it; catalog reads validate it whenever any of its metadata is present.
    if (requireCoverage || candidate.curriculum_schema_version !== undefined || candidate.curriculum_version !== undefined || candidate.coverage !== undefined || candidate.scopeIssues !== undefined) {
        requireValue(candidate.curriculum_schema_version === undefined || candidate.curriculum_schema_version === CURRICULUM_SCHEMA_VERSION,
            'Unsupported curriculum schema version.');
        // Read the briefly used legacy marker; new model output has no version.
        requireValue(candidate.curriculum_version === undefined || candidate.curriculum_version === 'whole-field-v1', 'Unsupported curriculum schema version.');
        decks.forEach(learningScope);
        const byId = new Map(decks.map(deck => [deck.id, deck]));
        requireValue(Array.isArray(candidate.coverage) && candidate.coverage.length > 0, 'The curriculum needs a coverage map.');
        const covered = new Set();
        const coverage = candidate.coverage.map(row => {
            requireValue(subjects.includes(row.subject), 'Coverage belongs to an unrequested subject.');
            const domain = text(row.domain, 'Coverage domain');
            requireValue(CURRICULUM_LEVELS.includes(row.level), 'Invalid coverage level.');
            requireValue(['included', 'deferred', 'out-of-scope'].includes(row.disposition), 'Invalid coverage disposition.');
            requireValue(Array.isArray(row.targets), 'Coverage targets must be an array.');
            unique(row.targets.map(target => target.deck_id), 'Coverage target decks');
            requireValue(row.disposition === 'included' ? row.targets.length > 0 : row.targets.length === 0,
                'Included coverage needs targets; exclusions must not claim targets.');
            const targets = row.targets.map(target => {
                const deck = byId.get(target.deck_id);
                requireValue(deck, 'Coverage references a missing deck.');
                requireValue(deck.level === row.level, 'Coverage depth must match the target deck level.');
                const ids = textList(target.outcome_ids, 'Coverage outcome IDs', { nonempty: true });
                requireValue(ids.every(id => deck.outcomes.some(outcome => outcome.id === id)), 'Coverage references missing outcomes.');
                ids.forEach(id => covered.add(`${deck.id}#${id}`));
                return { deck_id: deck.id, outcome_ids: ids };
            });
            return { subject: row.subject, domain, level: row.level, disposition: row.disposition,
                targets, rationale: text(row.rationale, 'Coverage rationale') };
        });
        unique(coverage.map(row => JSON.stringify([row.subject, row.domain.toLowerCase(), row.level])), 'Coverage domain/level rows');
        requireValue(subjects.every(subject => coverage.some(row => row.subject === subject && row.disposition === 'included')),
            'Every subject needs included coverage.');
        requireValue(decks.every(deck => deck.outcomes.every(outcome => covered.has(`${deck.id}#${outcome.id}`))),
            'Every deck outcome needs an included coverage mapping.');
        Object.assign(result, { curriculum_schema_version: CURRICULUM_SCHEMA_VERSION, coverage,
            scopeIssues: textList(candidate.scopeIssues, 'Scope issues') });
    }
    return result;
}

export function validateChapterCurriculumCandidate(candidate, deckId) {
    requireValue(candidate.deckId === deckId, 'The candidate targets a different deck.');
    requireValue(Array.isArray(candidate.chapters) && candidate.chapters.length > 0, 'The candidate has no chapters.');
    const chapters = candidate.chapters.map(chapter => chapterSpecification(chapter, deckId));
    unique(chapters.map(chapter => chapter.id), 'Chapter IDs');
    dependencyOrder(new Map(chapters.map(chapter => [chapter.id, chapter])), chapters.map(chapter => chapter.id));
    return {
        deckId,
        chapters: chapters.sort((a, b) => a.id.localeCompare(b.id)).map(chapter => ({
            ...chapter, prerequisites: chapter.prerequisites.map(id => `chapter:${id}`)
        }))
    };
}

export function assertGenerationBaseCurrent(expected, current) {
    requireValue(typeof expected === 'string' && /^[a-f0-9]{40}$/i.test(expected), 'Missing pinned curriculum version.');
    requireValue(expected.toLowerCase() === String(current).toLowerCase(),
        'Curriculum changed. Generate a new candidate before accepting.');
}

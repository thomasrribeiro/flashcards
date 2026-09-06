// Shared, provider-independent boundary for the new generation pipeline.
// Never serialize a catalog or queued job directly into a model request.
export const FRESH_GENERATION_VERSION = 'fresh-generation-v1';
export const FRESH_JOB_TYPES = ['curriculum-design', 'deck-plan', 'chapter-expand'];

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

export function canonicalSubjectNames(subjects) {
    requireValue(Array.isArray(subjects), 'Subjects must be an array.');
    const names = unique(subjects.map(subject => typeof subject === 'string' ? subject : subject.id), 'Subjects');
    requireValue(names.length > 0 && names.every(name => SLUG.test(name)), 'Subjects must use kebab-case.');
    return [...names].sort();
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

export function buildFreshGenerationContext({ jobType, subjects, catalog, deckId, chapterId }) {
    requireValue(FRESH_JOB_TYPES.includes(jobType), 'Unsupported fresh generation job.');
    // Intentionally return before touching the old catalog for global jobs.
    if (jobType === 'curriculum-design') return { subjects: canonicalSubjectNames(subjects) };
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

export function validateGlobalCurriculumCandidate(candidate, expectedSubjects) {
    const subjects = canonicalSubjectNames(candidate.subjects || []);
    requireValue(JSON.stringify(subjects) === JSON.stringify(canonicalSubjectNames(expectedSubjects)),
        'The candidate must contain exactly the requested subjects.');
    requireValue(Array.isArray(candidate.decks) && candidate.decks.length > 0, 'The candidate has no decks.');
    const decks = candidate.decks.map(deckSpecification);
    requireValue(decks.every(deck => subjects.includes(deck.subject)), 'A deck belongs to an unrequested subject.');
    requireValue(subjects.every(subject => decks.some(deck => deck.subject === subject)), 'Every subject needs a curriculum.');
    validateDeckEdges(decks);
    // Returning a projection prevents model-supplied paths, content or
    // publication metadata from leaking into the downstream acceptance step.
    return { subjects, decks: decks.sort((a, b) => a.id.localeCompare(b.id)) };
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

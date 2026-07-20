const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DESTINATIONS = new Set(['literacy', 'undergraduate-core', 'graduate-core', 'whole-field', 'research-specialization']);
const GRANULARITIES = new Set(['module', 'course', 'broad-area']);

export function normalizeCurriculumDraft(draft) {
    return {
        subject: String(draft.subject || '').trim().toLowerCase(),
        title: String(draft.title || '').trim(),
        destination: draft.destination || 'whole-field',
        deckGranularity: draft.deckGranularity || 'course',
        focus: Array.isArray(draft.focus)
            ? draft.focus
            : String(draft.focus || '').split(',').map(value => value.trim()).filter(Boolean),
        instructions: String(draft.instructions || '').trim(),
        proposedDecks: (draft.proposedDecks || []).map((deck, index) => ({
            id: String(deck.id || '').trim().toLowerCase(),
            order: index + 1,
            description: String(deck.description || '').trim(),
            prerequisites: Array.isArray(deck.prerequisites)
                ? deck.prerequisites
                : String(deck.prerequisites || '').split(',').map(value => value.trim()).filter(Boolean)
        }))
    };
}

export function validateCurriculumDraft(input) {
    const draft = normalizeCurriculumDraft(input);
    const errors = [];
    if (!SLUG.test(draft.subject)) errors.push('Subject must use lowercase kebab-case.');
    if (!draft.title) errors.push('Subject title is required.');
    if (!DESTINATIONS.has(draft.destination)) errors.push(`Invalid curriculum destination: ${draft.destination}`);
    if (!GRANULARITIES.has(draft.deckGranularity)) errors.push(`Invalid deck granularity: ${draft.deckGranularity}`);
    for (const focus of draft.focus) if (!SLUG.test(focus)) errors.push(`Invalid focus slug: ${focus}`);
    const ids = new Set();
    for (const deck of draft.proposedDecks) {
        if (!SLUG.test(deck.id)) errors.push(`Invalid deck slug: ${deck.id || '(empty)'}`);
        if (ids.has(deck.id)) errors.push(`Duplicate deck: ${deck.id}`);
        ids.add(deck.id);
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = id => {
        if (visiting.has(id)) return errors.push(`Draft prerequisite cycle includes ${id}.`);
        if (visited.has(id)) return;
        visiting.add(id);
        const deck = draft.proposedDecks.find(item => item.id === id);
        for (const dependency of deck?.prerequisites || []) {
            const local = dependency.includes('/') ? null : dependency;
            if (local && !ids.has(local)) errors.push(`${id} references missing draft deck ${local}.`);
            if (local) visit(local);
        }
        visiting.delete(id);
        visited.add(id);
    };
    draft.proposedDecks.forEach(deck => visit(deck.id));
    return { draft, errors: [...new Set(errors)] };
}

export function generationJobForDraft(input, {
    registryId = 'thomas-ribeiro',
    targetRepository = 'thomasrribeiro-flashcards/curricula',
    providerId = 'codex',
    modelId = null
} = {}) {
    const { draft, errors } = validateCurriculumDraft(input);
    if (errors.length) throw new Error(errors.join('\n'));
    return {
        jobType: 'subject-design',
        registryId,
        targetRepository,
        providerId,
        modelId: modelId || null,
        payload: draft
    };
}

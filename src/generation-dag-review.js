export function generationJobCategory(request) {
    const type = request?.jobType || request?.job_type;
    if (type === 'subject-design') return { id: 'subject-dag', label: 'Subject DAG' };
    if (type === 'deck-plan') return { id: 'deck-dag', label: 'Deck DAG' };
    if (['chapter-expand', 'deck-build', 'deck-audit'].includes(type)) return { id: 'flashcards', label: 'Flashcards' };
    return { id: 'other', label: 'Other generation' };
}

export function canReviewGenerationDag(request) {
    return ['subject-dag', 'deck-dag'].includes(generationJobCategory(request).id)
        && ['needs-review', 'published', 'cancelled'].includes(request?.status)
        && Boolean(request?.resultUrl);
}

function scopeNodes(catalog, request) {
    if (request.jobType === 'deck-plan') {
        const deckId = request.deckId || request.payload?.deckId;
        return (catalog?.decks?.find(deck => deck.id === deckId)?.chapters || [])
            .map(chapter => ({ ...chapter, id: `${deckId}#${chapter.id}` }));
    }
    const subject = request.subject || request.payload?.subject;
    return (catalog?.decks || []).filter(deck => deck.subject === subject);
}

function normalized(value) {
    if (Array.isArray(value)) return value.map(normalized).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
    return value;
}

// Only authored curriculum fields count: publication/card counts/provenance are
// not DAG edits. Keep dependency declarations as well as resolved graph edges.
const FIELDS = ['title', 'description', 'order', 'level', 'tier', 'estimated_chapters',
    'prerequisites', 'recommended_after', 'provides', 'resolved_dependencies'];

function edges(nodes, request) {
    const result = new Map();
    const add = (source, target, type) => {
        const edge = { source, target, type };
        result.set(JSON.stringify(edge), edge);
    };
    for (const node of nodes) {
        if (request.jobType === 'deck-plan') {
            const deckId = request.deckId || request.payload?.deckId;
            for (const dependency of node.resolved_dependencies || []) {
                if (!dependency.resolved || !['chapter', 'concept', 'external-concept'].includes(dependency.kind)) continue;
                const source = dependency.resolved.includes('#')
                    ? dependency.resolved : `${deckId}#${dependency.resolved}`;
                add(source, node.id, 'required');
            }
        } else {
            for (const source of node.prerequisites || []) add(source, node.id, 'required');
            for (const source of node.recommended_after || []) add(source, node.id, 'recommended');
        }
    }
    return result;
}

export function compareGenerationDag(beforeCatalog, afterCatalog, request) {
    const before = scopeNodes(beforeCatalog, request), after = scopeNodes(afterCatalog, request);
    const oldNodes = new Map(before.map(node => [node.id, node]));
    const newNodes = new Map(after.map(node => [node.id, node]));
    const oldEdges = edges(before, request), newEdges = edges(after, request);
    return {
        beforeCount: before.length,
        afterCount: after.length,
        added: after.filter(node => !oldNodes.has(node.id)),
        removed: before.filter(node => !newNodes.has(node.id)),
        changed: after.flatMap(node => {
            const old = oldNodes.get(node.id);
            if (!old) return [];
            const fields = FIELDS.filter(key => JSON.stringify(normalized(old[key] ?? null)) !== JSON.stringify(normalized(node[key] ?? null)));
            return fields.length ? [{ id: node.id, fields }] : [];
        }),
        addedEdges: [...newEdges].filter(([key]) => !oldEdges.has(key)).map(([,edge]) => edge),
        removedEdges: [...oldEdges].filter(([key]) => !newEdges.has(key)).map(([,edge]) => edge)
    };
}

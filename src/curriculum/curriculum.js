function curriculumMaps(index) {
    const decks = new Map((index?.decks || []).map(deck => [deck.id, deck]));
    const chapters = new Map();
    for (const deck of decks.values()) {
        for (const chapter of deck.chapters || []) {
            chapters.set(`${deck.id}#${chapter.id}`, { ...chapter, deckId: deck.id });
        }
    }
    return { decks, chapters };
}

function stronglyConnectedComponents(nodeIds, edges) {
    const outgoing = new Map(nodeIds.map(id => [id, []]));
    for (const edge of edges) outgoing.get(edge.source)?.push(edge.target);
    let nextIndex = 0;
    const stack = [];
    const onStack = new Set();
    const indices = new Map();
    const lowLinks = new Map();
    const components = [];
    const visit = id => {
        indices.set(id, nextIndex);
        lowLinks.set(id, nextIndex);
        nextIndex += 1;
        stack.push(id);
        onStack.add(id);
        for (const target of outgoing.get(id) || []) {
            if (!indices.has(target)) {
                visit(target);
                lowLinks.set(id, Math.min(lowLinks.get(id), lowLinks.get(target)));
            } else if (onStack.has(target)) {
                lowLinks.set(id, Math.min(lowLinks.get(id), indices.get(target)));
            }
        }
        if (lowLinks.get(id) !== indices.get(id)) return;
        const component = [];
        let member;
        do {
            member = stack.pop();
            onStack.delete(member);
            component.push(member);
        } while (member !== id);
        components.push(component);
    };
    nodeIds.forEach(id => { if (!indices.has(id)) visit(id); });
    return components;
}

/**
 * Return the minimum required-edge DAG that preserves prerequisite reachability.
 * Recommended relationships never participate in reduction. Cyclic projections
 * (which are valid at subject level) are preserved because a directed graph with
 * cycles has no unique transitive reduction.
 */
export function transitivelyReduceCurriculumGraph(graph) {
    const nodeIds = new Set((graph?.nodes || []).map(node => node.id));
    const unique = new Map();
    for (const edge of graph?.edges || []) {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
        const key = `${edge.source}>${edge.target}`;
        const current = unique.get(key);
        if (!current || edge.type === 'required') unique.set(key, edge);
    }
    const edges = [...unique.values()];
    const required = edges.filter(edge => edge.type === 'required');
    if (stronglyConnectedComponents([...nodeIds], required).some(component => component.length > 1)) {
        return { ...graph, edges };
    }

    const outgoing = new Map([...nodeIds].map(id => [id, []]));
    required.forEach(edge => outgoing.get(edge.source)?.push(edge));
    const redundant = new Set();
    for (const candidate of required) {
        const visited = new Set([candidate.source]);
        const pending = [candidate.source];
        let reachable = false;
        while (pending.length && !reachable) {
            const source = pending.pop();
            for (const edge of outgoing.get(source) || []) {
                if (edge === candidate) continue;
                if (edge.target === candidate.target) {
                    reachable = true;
                    break;
                }
                if (!visited.has(edge.target)) {
                    visited.add(edge.target);
                    pending.push(edge.target);
                }
            }
        }
        if (reachable) redundant.add(candidate);
    }
    return { ...graph, edges: edges.filter(edge => !redundant.has(edge)) };
}

function localChapterDependencies(chapter, deckId) {
    return (chapter?.resolved_dependencies || [])
        .filter(detail => detail.kind === 'chapter' || detail.kind === 'concept')
        .map(detail => detail.resolved)
        .filter(Boolean)
        .map(chapterId => chapterId.includes('#') ? chapterId : `${deckId}#${chapterId}`);
}

/** Build the strict deck DAG owned by one subject without pulling external decks in. */
export function subjectDeckGraph(index, subject, { includeRecommended = false } = {}) {
    const nodes = (index?.decks || [])
        .filter(deck => deck.subject === subject)
        .map(deck => ({ ...deck, nodeType: 'deck' }));
    const visible = new Set(nodes.map(node => node.id));
    const edges = [];
    for (const target of nodes) {
        for (const source of target.prerequisites || []) {
            if (visible.has(source)) edges.push({ source, target: target.id, type: 'required' });
        }
        if (includeRecommended) {
            for (const source of target.recommended_after || []) {
                if (visible.has(source)) edges.push({ source, target: target.id, type: 'recommended' });
            }
        }
    }
    return transitivelyReduceCurriculumGraph({ nodes, edges, seedIds: [] });
}

export function subjectOverviewGraph(index, { includeRecommended = false, query = '' } = {}) {
    const term = query.trim().toLowerCase();
    const subjects = new Map((index?.subjects || []).map(subject => [subject.id, subject]));
    for (const deck of index?.decks || []) {
        if (!subjects.has(deck.subject)) subjects.set(deck.subject, { id: deck.subject });
    }
    const edgeKinds = new Map();
    for (const target of index?.decks || []) {
        const add = (sourceId, type) => {
            const sourceSubject = sourceId.split('/')[0];
            if (sourceSubject === target.subject || !subjects.has(sourceSubject)) return;
            const key = `${sourceSubject}>${target.subject}`;
            const current = edgeKinds.get(key);
            if (!current || type === 'required') edgeKinds.set(key, type);
        };
        (target.prerequisites || []).forEach(id => add(id, 'required'));
        if (includeRecommended) (target.recommended_after || []).forEach(id => add(id, 'recommended'));
    }
    const visible = new Set();
    for (const subject of subjects.values()) {
        const count = (index?.decks || []).filter(deck => deck.subject === subject.id).length;
        const text = `${subject.id} ${subject.destination || ''} ${subject.focus || ''}`.toLowerCase();
        if (!term || text.includes(term)) visible.add(subject.id);
        subject.deck_count = count;
    }
    if (term) {
        for (const [key] of edgeKinds) {
            const [source, target] = key.split('>');
            if (visible.has(source) || visible.has(target)) visible.add(source), visible.add(target);
        }
    }
    return transitivelyReduceCurriculumGraph({
        nodes: [...subjects.values()].filter(subject => visible.has(subject.id)).map(subject => ({
            ...subject,
            subject: subject.id,
            deck: subject.id,
            nodeType: 'subject',
            order: 0
        })),
        edges: [...edgeKinds].map(([key, type]) => {
            const [source, target] = key.split('>');
            return { source, target, type };
        }).filter(edge => visible.has(edge.source) && visible.has(edge.target)),
        seedIds: [...visible]
    });
}

function requiredGraphRanks(graph) {
    const ids = new Set((graph.nodes || []).map(node => node.id));
    const parents = new Map([...ids].map(id => [id, []]));
    for (const edge of graph.edges || []) {
        if (edge.type === 'required' && ids.has(edge.source) && ids.has(edge.target)) {
            parents.get(edge.target).push(edge.source);
        }
    }
    const ranks = new Map();
    const visiting = new Set();
    const rank = id => {
        if (ranks.has(id)) return ranks.get(id);
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const prerequisites = parents.get(id) || [];
        const value = prerequisites.length
            ? Math.max(...prerequisites.map(parent => rank(parent) + 1))
            : 0;
        visiting.delete(id);
        ranks.set(id, value);
        return value;
    };
    ids.forEach(rank);
    return ranks;
}

export function chapterGraph(index, deckId) {
    const { decks } = curriculumMaps(index);
    const deck = decks.get(deckId);
    if (!deck) return { nodes: [], edges: [], seedIds: [] };
    const nodes = (deck.chapters || []).map(chapter => ({
        ...chapter,
        id: `${deckId}#${chapter.id}`,
        deck: chapter.title || chapter.id,
        subject: deck.subject,
        nodeType: 'chapter'
    }));
    const ids = new Set(nodes.map(node => node.id));
    const edges = [];
    for (const chapter of deck.chapters || []) {
        for (const dependency of localChapterDependencies(chapter, deckId)) {
            if (ids.has(dependency)) edges.push({ source: dependency, target: `${deckId}#${chapter.id}`, type: 'required' });
        }
    }
    return transitivelyReduceCurriculumGraph({ nodes, edges, seedIds: [] });
}

export async function layoutCurriculumGraphElk(graph, {
    nodeWidth = 250,
    nodeHeight = 78,
    nodeSizes = new Map(),
    direction = 'RIGHT'
} = {}) {
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
    const elk = new ELK();
    const result = await elk.layout({
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction,
            'elk.spacing.nodeNode': '34',
            'elk.layered.spacing.nodeNodeBetweenLayers': '90',
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES'
        },
        children: graph.nodes.map(node => ({ id: node.id, width: nodeWidth, height: nodeHeight, ...nodeSizes.get(node.id) })),
        edges: graph.edges.map((edge, index) => ({
            id: `edge-${index}`,
            sources: [edge.source],
            targets: [edge.target]
        }))
    });
    const original = new Map(graph.nodes.map(node => [node.id, node]));
    const nodes = (result.children || []).map(node => ({
        ...original.get(node.id),
        x: node.x || 0,
        y: node.y || 0,
        width: node.width || nodeWidth,
        height: node.height || nodeHeight
    }));
    const edges = graph.edges.map((edge, index) => ({
        ...edge,
        sections: result.edges?.find(item => item.id === `edge-${index}`)?.sections || []
    }));
    return { nodes, edges, width: result.width || nodeWidth, height: result.height || nodeHeight };
}

/**
 * Deterministic left-to-right layout: a node's column is one greater than its
 * deepest visible hard prerequisite. Recommended edges never affect rank.
 */
export function layoutCurriculumGraph(graph, {
    nodeWidth = 250,
    nodeHeight = 78,
    nodeSizes = new Map(),
    columnGap = 96,
    rowGap = 24,
    margin = 40
} = {}) {
    const suppliedRanks = graph.nodes.length > 0
        && graph.nodes.every(node => Number.isInteger(node.curriculumRank));
    const rankOffset = suppliedRanks
        ? Math.min(...graph.nodes.map(node => node.curriculumRank))
        : 0;
    const ranks = suppliedRanks
        ? new Map(graph.nodes.map(node => [node.id, node.curriculumRank - rankOffset]))
        : requiredGraphRanks(graph);

    const columns = new Map();
    for (const node of graph.nodes) {
        const column = ranks.get(node.id) || 0;
        if (!columns.has(column)) columns.set(column, []);
        columns.get(column).push(node);
    }
    for (const nodes of columns.values()) {
        nodes.sort((a, b) =>
            a.subject.localeCompare(b.subject)
            || Number(a.order || 0) - Number(b.order || 0)
            || a.deck.localeCompare(b.deck));
    }

    const positioned = [];
    for (const [column, nodes] of [...columns].sort((a, b) => a[0] - b[0])) {
        let y = margin;
        nodes.forEach(node => {
            const height = nodeSizes.get(node.id)?.height || nodeHeight;
            positioned.push({
                ...node,
                rank: column,
                x: margin + column * (nodeWidth + columnGap),
                y,
                width: nodeWidth,
                height
            });
            y += height + rowGap;
        });
    }
    const maxRank = positioned.reduce((max, node) => Math.max(max, node.rank), 0);
    return {
        nodes: positioned,
        edges: graph.edges,
        nodeWidth,
        nodeHeight,
        columnGap,
        width: margin * 2 + (maxRank + 1) * nodeWidth + maxRank * columnGap,
        height: Math.max(margin + nodeHeight, ...positioned.map(node => node.y + node.height)) + margin
    };
}

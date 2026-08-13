import { loadCurriculumRegistries } from './curriculum-registry.js';

const CURRICULUM_PATH = 'data/curriculum.json';
let curriculumPromise = null;

export async function loadCurriculumIndex(baseUrl = import.meta.env.BASE_URL) {
    if (!curriculumPromise) {
        curriculumPromise = loadCurriculumRegistries({ fallbackUrl: `${baseUrl}${CURRICULUM_PATH}` })
            .then(result => result.index);
    }
    return curriculumPromise;
}

export function curriculumMaps(index) {
    const decks = new Map((index?.decks || []).map(deck => [deck.id, deck]));
    const chapters = new Map();
    for (const deck of decks.values()) {
        for (const chapter of deck.chapters || []) {
            chapters.set(`${deck.id}#${chapter.id}`, { ...chapter, deckId: deck.id });
        }
    }
    return { decks, chapters };
}

function curriculumSubjectNodes(index) {
    const subjects = new Map((index?.subjects || []).map(subject => [subject.id, subject]));
    for (const deck of index?.decks || []) {
        if (!subjects.has(deck.subject)) subjects.set(deck.subject, { id: deck.subject });
    }
    return [...subjects.values()].map(subject => ({
        ...subject,
        id: subject.id,
        subject: subject.id,
        deck: subject.id,
        title: subject.title || subject.id,
        nodeType: 'subject',
        deck_count: (index?.decks || []).filter(deck => deck.subject === subject.id).length,
        order: 0
    }));
}

function chapterDependencyId(detail, deckId) {
    if (!detail?.resolved) return null;
    if (detail.kind === 'external-concept') return detail.resolved;
    if (detail.kind !== 'chapter' && detail.kind !== 'concept') return null;
    return detail.resolved.includes('#') ? detail.resolved : `${deckId}#${detail.resolved}`;
}

function curriculumHierarchyGraph(index, hierarchy, { includeRecommended = false } = {}) {
    if (hierarchy === 'subject') {
        const nodes = curriculumSubjectNodes(index);
        const ids = new Set(nodes.map(node => node.id));
        const edges = new Map();
        const add = (source, target, type) => {
            if (!source || !target || source === target || !ids.has(source) || !ids.has(target)) return;
            const key = `${source}>${target}`;
            if (!edges.has(key) || type === 'required') edges.set(key, { source, target, type });
        };
        for (const subject of index?.subjects || []) {
            for (const source of subject.prerequisites || []) add(source, subject.id, 'required');
            if (includeRecommended) {
                for (const source of subject.recommended_after || []) add(source, subject.id, 'recommended');
            }
        }
        for (const deck of index?.decks || []) {
            for (const sourceId of deck.prerequisites || []) add(sourceId.split('/')[0], deck.subject, 'required');
            if (includeRecommended) {
                for (const sourceId of deck.recommended_after || []) add(sourceId.split('/')[0], deck.subject, 'recommended');
            }
        }
        return { nodes, edges: [...edges.values()] };
    }

    if (hierarchy === 'chapter') {
        const { chapters } = curriculumMaps(index);
        const nodes = [...chapters.entries()].map(([id, chapter]) => {
            const deck = (index?.decks || []).find(item => item.id === chapter.deckId);
            return {
                ...chapter,
                id,
                subject: deck?.subject || chapter.deckId.split('/')[0],
                deck: chapter.title || chapter.id,
                deckId: chapter.deckId,
                nodeType: 'chapter'
            };
        });
        const ids = new Set(nodes.map(node => node.id));
        const edges = [];
        for (const chapter of nodes) {
            for (const detail of chapter.resolved_dependencies || []) {
                const source = chapterDependencyId(detail, chapter.deckId);
                if (source && ids.has(source)) edges.push({ source, target: chapter.id, type: 'required' });
            }
        }
        return { nodes, edges };
    }

    const nodes = [...(index?.decks || [])].map(deck => ({ ...deck, nodeType: 'deck' }));
    const ids = new Set(nodes.map(node => node.id));
    const edges = [];
    for (const target of nodes) {
        for (const source of target.prerequisites || []) {
            if (ids.has(source)) edges.push({ source, target: target.id, type: 'required' });
        }
        if (includeRecommended) {
            for (const source of target.recommended_after || []) {
                if (ids.has(source)) edges.push({ source, target: target.id, type: 'recommended' });
            }
        }
    }
    return { nodes, edges };
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

function distanceFromComponent(edges, component, direction) {
    const blocked = new Set(component);
    const distances = new Map();
    let frontier = new Set(component);
    let distance = 0;
    while (frontier.size) {
        distance += 1;
        const next = new Set();
        for (const edge of edges) {
            const from = direction === 'backward' ? edge.target : edge.source;
            const to = direction === 'backward' ? edge.source : edge.target;
            if (!frontier.has(from) || blocked.has(to) || distances.has(to)) continue;
            distances.set(to, distance);
            next.add(to);
        }
        frontier = next;
    }
    return distances;
}

/**
 * Return a hierarchy-preserving prerequisite neighborhood for one selected
 * subject, deck, or chapter. Required cycles are collapsed around the target
 * so traversal remains finite. Subject-level cycles are projections of more
 * specific deck relationships and are reported as interdependence; deck and
 * chapter cycles remain invalid curriculum data.
 */
export function curriculumNeighborhood(index, {
    hierarchy = 'deck',
    targetId,
    includeRecommended = false
} = {}) {
    const graph = curriculumHierarchyGraph(index, hierarchy, { includeRecommended });
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    const target = nodes.get(targetId) || null;
    if (!target) return null;
    const required = graph.edges.filter(edge => edge.type === 'required');
    const component = stronglyConnectedComponents([...nodes.keys()], required)
        .find(ids => ids.includes(targetId)) || [targetId];
    const hasSelfLoop = required.some(edge => edge.source === targetId && edge.target === targetId);
    const cyclic = component.length > 1 || hasSelfLoop;
    const before = distanceFromComponent(required, component, 'backward');
    const after = distanceFromComponent(required, component, 'forward');
    const entries = distances => [...distances]
        .map(([id, distance]) => ({ item: nodes.get(id), distance }))
        .filter(entry => entry.item)
        .sort((a, b) => a.distance - b.distance
            || a.item.subject.localeCompare(b.item.subject)
            || Number(a.item.order || 0) - Number(b.item.order || 0)
            || a.item.id.localeCompare(b.item.id));
    const recommended = includeRecommended
        ? graph.edges
            .filter(edge => edge.type === 'recommended' && component.includes(edge.target) && !component.includes(edge.source))
            .map(edge => nodes.get(edge.source))
            .filter(Boolean)
        : [];
    return {
        hierarchy,
        target,
        prerequisites: entries(before),
        unlocks: entries(after),
        recommended,
        interdependent: hierarchy === 'subject'
            ? component.filter(id => id !== targetId).map(id => nodes.get(id)).filter(Boolean)
            : [],
        cycle: hierarchy === 'subject' || !cyclic
            ? []
            : component.filter(id => id !== targetId).map(id => nodes.get(id)).filter(Boolean),
        cyclic
    };
}

export function curriculumDirectory(index, {
    hierarchy = 'subject',
    parentId = null,
    query = ''
} = {}) {
    const term = query.trim().toLowerCase();
    const graph = curriculumHierarchyGraph(index, hierarchy);
    return graph.nodes
        .filter(item => hierarchy === 'subject'
            || hierarchy === 'deck' && (!parentId || item.subject === parentId)
            || hierarchy === 'chapter' && (!parentId || item.deckId === parentId))
        .filter(item => !term || `${item.id} ${item.title || ''} ${item.description || ''}`.toLowerCase().includes(term))
        .sort((a, b) => a.subject.localeCompare(b.subject)
            || Number(a.order || 0) - Number(b.order || 0)
            || a.id.localeCompare(b.id));
}

export function deckPrerequisiteClosure(index, targetId) {
    const { decks } = curriculumMaps(index);
    const visited = new Set();
    const ordered = [];
    const visit = id => {
        const deck = decks.get(id);
        if (!deck) return;
        for (const prerequisite of deck.prerequisites || []) {
            if (visited.has(prerequisite)) continue;
            visit(prerequisite);
            visited.add(prerequisite);
            if (decks.has(prerequisite)) ordered.push(prerequisite);
        }
    };
    visit(targetId);
    return ordered;
}

function localChapterDependencies(chapter, deckId) {
    return (chapter?.resolved_dependencies || [])
        .filter(detail => detail.kind === 'chapter' || detail.kind === 'concept')
        .map(detail => detail.resolved)
        .filter(Boolean)
        .map(chapterId => `${deckId}#${chapterId}`);
}

export function chapterPrerequisiteClosure(index, targetDeckId, targetChapterId) {
    const { chapters } = curriculumMaps(index);
    const target = chapters.get(`${targetDeckId}#${targetChapterId}`);
    if (!target) return [];

    const requested = (target.resolved_dependencies || [])
        .filter(detail => detail.kind === 'external-concept')
        .map(detail => detail.resolved)
        .filter(Boolean);
    const visited = new Set();
    const ordered = [];
    const visit = key => {
        const chapter = chapters.get(key);
        if (!chapter || visited.has(key)) return;
        visited.add(key);
        for (const dependency of localChapterDependencies(chapter, chapter.deckId)) visit(dependency);
        ordered.push(key);
    };
    requested.forEach(visit);
    return ordered;
}

export function dependencyPlan(index, targetDeckId, targetChapterId = null) {
    const { decks, chapters } = curriculumMaps(index);
    const requiredDeckIds = deckPrerequisiteClosure(index, targetDeckId);
    const exactChapterIds = targetChapterId
        ? chapterPrerequisiteClosure(index, targetDeckId, targetChapterId)
        : [];
    const exactDecks = new Set(exactChapterIds.map(key => key.slice(0, key.indexOf('#'))));
    const wholeDeckIds = requiredDeckIds.filter(id => !exactDecks.has(id));
    return {
        target: decks.get(targetDeckId) || null,
        requiredDecks: requiredDeckIds.map(id => decks.get(id)).filter(Boolean),
        wholeDecks: wholeDeckIds.map(id => decks.get(id)).filter(Boolean),
        exactChapters: exactChapterIds.map(key => chapters.get(key)).filter(Boolean),
        missingDecks: requiredDeckIds
            .map(id => decks.get(id))
            .filter(deck => deck && !deck.repository?.configured),
        recommendedDecks: (decks.get(targetDeckId)?.recommended_after || [])
            .map(id => decks.get(id))
            .filter(Boolean)
    };
}

export function chapterForFile(index, deckId, file) {
    const deck = curriculumMaps(index).decks.get(deckId);
    return (deck?.chapters || []).find(chapter => chapter.file === file) || null;
}

export function curriculumDeckRows(index, { subject = null, query = '' } = {}) {
    const term = query.trim().toLowerCase();
    return (index?.decks || [])
        .filter(deck => !subject || deck.subject === subject)
        .filter(deck => !term
            || deck.id.toLowerCase().includes(term)
            || String(deck.description || '').toLowerCase().includes(term))
        .sort((a, b) =>
            a.subject.localeCompare(b.subject)
            || Number(a.order || 0) - Number(b.order || 0)
            || a.deck.localeCompare(b.deck));
}

/**
 * Build the visible portion of the curriculum DAG.
 *
 * Subject and search filters retain every hard prerequisite ancestor so a
 * filtered result never appears detached from the knowledge it depends on.
 * Recommended edges are included only when both endpoints are already in the
 * visible hard-prerequisite graph.
 */
export function curriculumGraph(index, {
    subject = null,
    query = '',
    includeRecommended = true
} = {}) {
    const { decks } = curriculumMaps(index);
    const term = query.trim().toLowerCase();
    const seeds = [...decks.values()].filter(deck => {
        if (subject && deck.subject !== subject) return false;
        return !term
            || deck.id.toLowerCase().includes(term)
            || String(deck.description || '').toLowerCase().includes(term);
    });
    const visible = new Set();
    const addWithPrerequisites = id => {
        if (visible.has(id)) return;
        const deck = decks.get(id);
        if (!deck) return;
        visible.add(id);
        for (const prerequisite of deck.prerequisites || []) {
            addWithPrerequisites(prerequisite);
        }
    };
    seeds.forEach(deck => addWithPrerequisites(deck.id));
    if (includeRecommended) {
        for (const seed of seeds) {
            for (const recommended of seed.recommended_after || []) {
                addWithPrerequisites(recommended);
            }
        }
    }

    const nodes = [...visible]
        .map(id => decks.get(id))
        .filter(Boolean)
        .sort((a, b) =>
            a.subject.localeCompare(b.subject)
            || Number(a.order || 0) - Number(b.order || 0)
            || a.deck.localeCompare(b.deck));
    const edges = [];
    for (const target of nodes) {
        for (const source of target.prerequisites || []) {
            if (visible.has(source)) {
                edges.push({ source, target: target.id, type: 'required' });
            }
        }
        if (includeRecommended) {
            for (const source of target.recommended_after || []) {
                if (visible.has(source)) {
                    edges.push({ source, target: target.id, type: 'recommended' });
                }
            }
        }
    }
    return { nodes, edges, seedIds: seeds.map(deck => deck.id) };
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
    return { nodes, edges, seedIds: [] };
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
    return {
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
    };
}

export function focusedCurriculumGraph(index, targetId, {
    includeRecommended = false,
    descendantDepth = 1
} = {}) {
    const { decks } = curriculumMaps(index);
    if (!decks.has(targetId)) return { nodes: [], edges: [], seedIds: [] };
    const visible = new Set([targetId]);
    const ancestors = id => {
        for (const parent of decks.get(id)?.prerequisites || []) {
            if (visible.has(parent)) continue;
            visible.add(parent);
            ancestors(parent);
        }
    };
    ancestors(targetId);
    let frontier = new Set([targetId]);
    for (let depth = 0; depth < descendantDepth; depth += 1) {
        const next = new Set();
        for (const deck of decks.values()) {
            if ((deck.prerequisites || []).some(id => frontier.has(id))) {
                visible.add(deck.id);
                next.add(deck.id);
            }
        }
        frontier = next;
    }
    const nodes = [...visible].map(id => decks.get(id)).filter(Boolean);
    const edges = [];
    for (const target of nodes) {
        for (const source of target.prerequisites || []) if (visible.has(source)) edges.push({ source, target: target.id, type: 'required' });
        if (includeRecommended) {
            for (const source of target.recommended_after || []) if (visible.has(source)) edges.push({ source, target: target.id, type: 'recommended' });
        }
    }
    return { nodes, edges, seedIds: [targetId] };
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

/**
 * Reduce a large subject DAG to one navigable layer and its immediate
 * prerequisite/dependent neighborhood. The current layer remains highlighted
 * through seedIds; callers can page through every hard-prerequisite rank or
 * switch back to the untouched full graph.
 */
export function curriculumLayerGraph(graph, requestedLayer = null) {
    if (!graph?.nodes?.length) {
        return {
            graph: { nodes: [], edges: [], seedIds: [] },
            layer: 0,
            layerCount: 0,
            focusIds: []
        };
    }
    const ranks = requiredGraphRanks(graph);
    const layerCount = Math.max(...ranks.values()) + 1;
    const seedRanks = (graph.seedIds || [])
        .map(id => ranks.get(id))
        .filter(Number.isInteger);
    const defaultLayer = seedRanks.length ? Math.min(...seedRanks) : 0;
    const numericLayer = requestedLayer == null ? defaultLayer : Number(requestedLayer);
    const layer = Math.max(0, Math.min(
        layerCount - 1,
        Number.isFinite(numericLayer) ? Math.round(numericLayer) : defaultLayer
    ));
    const focusIds = (graph.nodes || [])
        .filter(node => ranks.get(node.id) === layer)
        .map(node => node.id);
    const focus = new Set(focusIds);
    const visible = new Set(focusIds);
    for (const edge of graph.edges || []) {
        if (focus.has(edge.source) || focus.has(edge.target)) {
            visible.add(edge.source);
            visible.add(edge.target);
        }
    }
    const nodes = graph.nodes.filter(node => visible.has(node.id));
    const edges = graph.edges.filter(edge =>
        visible.has(edge.source) && visible.has(edge.target)
    );
    return {
        graph: { nodes, edges, seedIds: focusIds },
        layer,
        layerCount,
        focusIds
    };
}

/**
 * Return a horizontally sliding window of dependency ranks. Unlike the older
 * neighborhood layer view, this always retains up to `width` complete ranks,
 * so every visible column has one unambiguous prerequisite order.
 */
export function curriculumLayerWindow(graph, requestedStart = 0, width = 3) {
    if (!graph?.nodes?.length) {
        return {
            graph: { nodes: [], edges: [], seedIds: [] },
            start: 0,
            end: 0,
            layerCount: 0,
            width: Math.max(1, width)
        };
    }
    const ranks = requiredGraphRanks(graph);
    const layerCount = Math.max(...ranks.values()) + 1;
    const windowWidth = Math.max(1, Math.round(width));
    const maxStart = Math.max(0, layerCount - windowWidth);
    const numericStart = Number(requestedStart);
    const start = Math.max(0, Math.min(
        maxStart,
        Number.isFinite(numericStart) ? Math.round(numericStart) : 0
    ));
    const end = Math.min(layerCount, start + windowWidth);
    const visible = new Set(graph.nodes
        .filter(node => {
            const rank = ranks.get(node.id);
            return rank >= start && rank < end;
        })
        .map(node => node.id));
    return {
        graph: {
            nodes: graph.nodes
                .filter(node => visible.has(node.id))
                .map(node => ({ ...node, curriculumRank: ranks.get(node.id) })),
            edges: graph.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)),
            seedIds: []
        },
        start,
        end,
        layerCount,
        width: windowWidth
    };
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
    return { nodes, edges, seedIds: [] };
}

export async function layoutCurriculumGraphElk(graph, {
    nodeWidth = 250,
    nodeHeight = 78,
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
        children: graph.nodes.map(node => ({ id: node.id, width: nodeWidth, height: nodeHeight })),
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
        nodes.forEach((node, row) => positioned.push({
            ...node,
            rank: column,
            x: margin + column * (nodeWidth + columnGap),
            y: margin + row * (nodeHeight + rowGap),
            width: nodeWidth,
            height: nodeHeight
        }));
    }
    const maxRank = positioned.reduce((max, node) => Math.max(max, node.rank), 0);
    const maxRows = Math.max(1, ...columns.values().map(nodes => nodes.length));
    return {
        nodes: positioned,
        edges: graph.edges,
        nodeWidth,
        nodeHeight,
        width: margin * 2 + (maxRank + 1) * nodeWidth + maxRank * columnGap,
        height: margin * 2 + maxRows * nodeHeight + (maxRows - 1) * rowGap
    };
}

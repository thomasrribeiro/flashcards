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
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const requiredParents = new Map(graph.nodes.map(node => [node.id, []]));
    for (const edge of graph.edges) {
        if (edge.type === 'required' && byId.has(edge.source) && byId.has(edge.target)) {
            requiredParents.get(edge.target).push(edge.source);
        }
    }
    const ranks = new Map();
    const visiting = new Set();
    const rank = id => {
        if (ranks.has(id)) return ranks.get(id);
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const parents = requiredParents.get(id) || [];
        const value = parents.length ? Math.max(...parents.map(parent => rank(parent) + 1)) : 0;
        visiting.delete(id);
        ranks.set(id, value);
        return value;
    };
    graph.nodes.forEach(node => rank(node.id));

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

import { describe, expect, it } from 'vitest';
import {
    curriculumFallbackUrl,
    chapterPrerequisiteClosure,
    curriculumDirectory,
    curriculumGraph,
    curriculumNeighborhood,
    curriculumDeckRows,
    curriculumLayerGraph,
    curriculumLayerWindow,
    dependencyPlan,
    focusedCurriculumGraph,
    layoutCurriculumGraphElk,
    subjectOverviewGraph,
    subjectDeckGraph,
    transitivelyReduceCurriculumGraph,
    chapterGraph,
    layoutCurriculumGraph
} from './curriculum.js';

const index = {
    schema_version: 2,
    decks: [
        {
            id: 'mathematics/arithmetic',
            subject: 'mathematics',
            deck: 'arithmetic',
            order: 1,
            prerequisites: [],
            recommended_after: [],
            repository: { configured: true },
            chapters: [
                {
                    id: '01_numbers',
                    order: 1,
                    file: 'flashcards/01_numbers.md',
                    resolved_dependencies: []
                },
                {
                    id: '02_measurement',
                    order: 2,
                    file: 'flashcards/02_measurement.md',
                    resolved_dependencies: [
                        { kind: 'chapter', resolved: '01_numbers' }
                    ]
                }
            ]
        },
        {
            id: 'mathematics/algebra',
            subject: 'mathematics',
            deck: 'algebra',
            order: 2,
            prerequisites: ['mathematics/arithmetic'],
            recommended_after: [],
            repository: { configured: false },
            chapters: []
        },
        {
            id: 'physics/physical-reasoning',
            subject: 'physics',
            deck: 'physical-reasoning',
            order: 1,
            description: 'Reason from measurements.',
            prerequisites: ['mathematics/algebra'],
            recommended_after: [],
            repository: { configured: true },
            chapters: [{
                id: '01_systems',
                order: 1,
                file: 'flashcards/01_systems.md',
                resolved_dependencies: [{
                    kind: 'external-concept',
                    resolved: 'mathematics/arithmetic#02_measurement'
                }]
            }]
        }
    ]
};

describe('curriculum dependency planning', () => {
    it('versions the bundled catalog URL so installed app caches cannot hide a merge', () => {
        const url = new URL(curriculumFallbackUrl('/flashcards/'), 'https://example.test');
        expect(url.pathname).toBe('/flashcards/data/curriculum.json');
        expect(url.searchParams.get('v')).toBeTruthy();
    });

    it('transitively reduces required edges without using recommended paths', () => {
        const graph = transitivelyReduceCurriculumGraph({
            nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })),
            edges: [
                { source: 'a', target: 'b', type: 'required' },
                { source: 'b', target: 'c', type: 'required' },
                { source: 'a', target: 'c', type: 'required' },
                { source: 'a', target: 'd', type: 'recommended' }
            ],
            seedIds: ['c']
        });
        expect(graph).toEqual({
            nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })),
            edges: [
                { source: 'a', target: 'b', type: 'required' },
                { source: 'b', target: 'c', type: 'required' },
                { source: 'a', target: 'd', type: 'recommended' }
            ],
            seedIds: ['c']
        });
    });

    it('preserves cyclic subject projections rather than reducing them arbitrarily', () => {
        const graph = {
            nodes: ['a', 'b', 'c'].map(id => ({ id })),
            edges: [
                { source: 'a', target: 'b', type: 'required' },
                { source: 'b', target: 'a', type: 'required' },
                { source: 'a', target: 'c', type: 'required' }
            ]
        };
        expect(transitivelyReduceCurriculumGraph(graph).edges).toEqual(graph.edges);
    });

    it('expands an exact external provider through its local chapter closure', () => {
        expect(chapterPrerequisiteClosure(index, 'physics/physical-reasoning', '01_systems'))
            .toEqual([
                'mathematics/arithmetic#01_numbers',
                'mathematics/arithmetic#02_measurement'
            ]);
    });

    it('separates exact provider chapters from unresolved whole-deck requirements', () => {
        const plan = dependencyPlan(index, 'physics/physical-reasoning', '01_systems');
        expect(plan.requiredDecks.map(deck => deck.id)).toEqual([
            'mathematics/arithmetic',
            'mathematics/algebra'
        ]);
        expect(plan.exactChapters.map(chapter => `${chapter.deckId}#${chapter.id}`))
            .toEqual([
                'mathematics/arithmetic#01_numbers',
                'mathematics/arithmetic#02_measurement'
            ]);
        expect(plan.wholeDecks.map(deck => deck.id)).toEqual(['mathematics/algebra']);
        expect(plan.missingDecks.map(deck => deck.id)).toEqual(['mathematics/algebra']);
    });

    it('filters the complete map without losing curriculum order', () => {
        expect(curriculumDeckRows(index, { subject: 'mathematics', query: 'a' })
            .map(deck => deck.id)).toEqual([
            'mathematics/arithmetic',
            'mathematics/algebra'
        ]);
    });

    it('keeps cross-subject ancestors when filtering the interactive graph', () => {
        const graph = curriculumGraph(index, { subject: 'physics' });
        expect(graph.nodes.map(node => node.id)).toEqual([
            'mathematics/arithmetic',
            'mathematics/algebra',
            'physics/physical-reasoning'
        ]);
        expect(graph.edges.filter(edge => edge.type === 'required')).toEqual([
            {
                source: 'mathematics/arithmetic',
                target: 'mathematics/algebra',
                type: 'required'
            },
            {
                source: 'mathematics/algebra',
                target: 'physics/physical-reasoning',
                type: 'required'
            }
        ]);
    });

    it('lays hard prerequisites in earlier columns', () => {
        const graph = curriculumGraph(index);
        const layout = layoutCurriculumGraph(graph);
        const nodes = new Map(layout.nodes.map(node => [node.id, node]));
        expect(nodes.get('mathematics/arithmetic').rank).toBe(0);
        expect(nodes.get('mathematics/algebra').rank).toBe(1);
        expect(nodes.get('physics/physical-reasoning').rank).toBe(2);
        expect(layout.width).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
    });

    it('summarizes cross-subject dependencies without rendering every deck', () => {
        const graph = subjectOverviewGraph(index);
        expect(graph.nodes.map(node => node.id)).toEqual(['mathematics', 'physics']);
        expect(graph.edges).toEqual([{
            source: 'mathematics',
            target: 'physics',
            type: 'required'
        }]);
    });

    it('preserves reciprocal subject relationships in the overview graph', () => {
        const cyclicIndex = {
            ...index,
            decks: [...index.decks, {
                id: 'mathematics/mathematical-physics',
                subject: 'mathematics',
                deck: 'mathematical-physics',
                order: 3,
                prerequisites: ['physics/physical-reasoning'],
                recommended_after: [],
                chapters: []
            }]
        };
        expect(subjectOverviewGraph(cyclicIndex).edges).toEqual([
            { source: 'mathematics', target: 'physics', type: 'required' },
            { source: 'physics', target: 'mathematics', type: 'required' }
        ]);
    });

    it('builds a subject-owned deck DAG without importing external prerequisites', () => {
        const graph = subjectDeckGraph(index, 'physics');
        expect(graph.nodes.map(node => node.id)).toEqual(['physics/physical-reasoning']);
        expect(graph.edges).toEqual([]);
    });

    it('builds a focused ancestor path with only immediate descendants', () => {
        const graph = focusedCurriculumGraph(index, 'mathematics/algebra');
        expect(graph.nodes.map(node => node.id).sort()).toEqual([
            'mathematics/algebra',
            'mathematics/arithmetic',
            'physics/physical-reasoning'
        ]);
    });

    it('pages a large DAG by layer while retaining direct context', () => {
        const full = curriculumGraph(index);
        const first = curriculumLayerGraph(full, 0);
        expect(first.layerCount).toBe(3);
        expect(first.focusIds).toEqual(['mathematics/arithmetic']);
        expect(first.graph.nodes.map(node => node.id).sort()).toEqual([
            'mathematics/algebra',
            'mathematics/arithmetic'
        ]);

        const middle = curriculumLayerGraph(full, 1);
        expect(middle.focusIds).toEqual(['mathematics/algebra']);
        expect(middle.graph.nodes.map(node => node.id).sort()).toEqual([
            'mathematics/algebra',
            'mathematics/arithmetic',
            'physics/physical-reasoning'
        ]);
        expect(middle.graph.seedIds).toEqual(['mathematics/algebra']);
    });

    it('shows three complete dependency ranks and slides one rank at a time', () => {
        const graph = curriculumGraph(index);
        const first = curriculumLayerWindow(graph, 0, 3);
        expect(first).toMatchObject({
            start: 0, end: 3, layer: 1, layerCount: 3,
            minLayer: 1, maxLayer: 1, width: 3
        });
        expect(first.graph.nodes.map(node => [node.id, node.curriculumRank])).toEqual([
            ['mathematics/arithmetic', 0],
            ['mathematics/algebra', 1],
            ['physics/physical-reasoning', 2]
        ]);

        const extended = {
            nodes: [...graph.nodes, {
                id: 'physics/mechanics', subject: 'physics', deck: 'mechanics', order: 2
            }],
            edges: [...graph.edges, {
                source: 'physics/physical-reasoning', target: 'physics/mechanics', type: 'required'
            }],
            seedIds: []
        };
        const second = curriculumLayerWindow(extended, 3, 3);
        expect(second).toMatchObject({
            start: 1, end: 4, layer: 2, layerCount: 4,
            minLayer: 1, maxLayer: 2
        });
        expect(second.graph.nodes.map(node => node.id)).toEqual([
            'mathematics/algebra',
            'physics/physical-reasoning',
            'physics/mechanics'
        ]);
        const firstBoundary = curriculumLayerWindow(extended, 0, 3);
        const lastBoundary = curriculumLayerWindow(extended, 99, 3);
        expect(firstBoundary).toMatchObject({ start: 0, end: 3, layer: 1 });
        expect(lastBoundary).toMatchObject({ start: 1, end: 4, layer: 2 });
    });

    it('builds chapter-level edges from resolved local dependencies', () => {
        const graph = chapterGraph(index, 'mathematics/arithmetic');
        expect(graph.edges).toEqual([{
            source: 'mathematics/arithmetic#01_numbers',
            target: 'mathematics/arithmetic#02_measurement',
            type: 'required'
        }]);
    });

    it('builds a three-column deck neighborhood with direct and transitive distances', () => {
        const neighborhood = curriculumNeighborhood(index, {
            hierarchy: 'deck',
            targetId: 'mathematics/algebra'
        });
        expect(neighborhood.target.id).toBe('mathematics/algebra');
        expect(neighborhood.prerequisites.map(entry => [entry.item.id, entry.distance])).toEqual([
            ['mathematics/arithmetic', 1]
        ]);
        expect(neighborhood.unlocks.map(entry => [entry.item.id, entry.distance])).toEqual([
            ['physics/physical-reasoning', 1]
        ]);
    });

    it('keeps every neighborhood item at the selected hierarchy', () => {
        const subjects = curriculumDirectory(index, { hierarchy: 'subject' });
        const decks = curriculumDirectory(index, { hierarchy: 'deck', parentId: 'mathematics' });
        const chapters = curriculumDirectory(index, {
            hierarchy: 'chapter',
            parentId: 'mathematics/arithmetic'
        });
        expect(subjects.every(item => item.nodeType === 'subject')).toBe(true);
        expect(decks.map(item => item.id)).toEqual([
            'mathematics/arithmetic',
            'mathematics/algebra'
        ]);
        expect(chapters.map(item => item.id)).toEqual([
            'mathematics/arithmetic#01_numbers',
            'mathematics/arithmetic#02_measurement'
        ]);
    });

    it('turns reciprocal subject projections into interdependence', () => {
        const cyclicIndex = {
            ...index,
            subjects: [{ id: 'mathematics' }, { id: 'physics' }],
            decks: [
                ...index.decks,
                {
                    id: 'mathematics/mathematical-physics',
                    subject: 'mathematics',
                    deck: 'mathematical-physics',
                    order: 3,
                    prerequisites: ['physics/physical-reasoning'],
                    recommended_after: [],
                    chapters: []
                }
            ]
        };
        const neighborhood = curriculumNeighborhood(cyclicIndex, {
            hierarchy: 'subject',
            targetId: 'physics'
        });
        expect(neighborhood.prerequisites).toEqual([]);
        expect(neighborhood.unlocks).toEqual([]);
        expect(neighborhood.interdependent.map(item => item.id)).toEqual(['mathematics']);
        expect(neighborhood.cyclic).toBe(true);
    });

    it('flags a true deck cycle instead of recursing forever', () => {
        const cyclicIndex = {
            ...index,
            decks: index.decks.map(deck => deck.id === 'mathematics/arithmetic'
                ? { ...deck, prerequisites: ['mathematics/algebra'] }
                : deck)
        };
        const neighborhood = curriculumNeighborhood(cyclicIndex, {
            hierarchy: 'deck',
            targetId: 'mathematics/algebra'
        });
        expect(neighborhood.cycle.map(item => item.id)).toEqual(['mathematics/arithmetic']);
        expect(neighborhood.cyclic).toBe(true);
    });

    it('supports cross-deck chapter prerequisites at chapter hierarchy', () => {
        const neighborhood = curriculumNeighborhood(index, {
            hierarchy: 'chapter',
            targetId: 'physics/physical-reasoning#01_systems'
        });
        expect(neighborhood.prerequisites.map(entry => [entry.item.id, entry.distance])).toEqual([
            ['mathematics/arithmetic#02_measurement', 1],
            ['mathematics/arithmetic#01_numbers', 2]
        ]);
    });

    it('uses ELK to route a readable layered graph', async () => {
        const layout = await layoutCurriculumGraphElk(curriculumGraph(index));
        expect(layout.nodes).toHaveLength(3);
        expect(layout.edges.every(edge => edge.sections.length > 0)).toBe(true);
        expect(layout.width).toBeGreaterThan(250);
    });
});

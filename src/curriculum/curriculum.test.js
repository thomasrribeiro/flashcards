import { describe, expect, it } from 'vitest';
import {
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

const deckGraph = {
    nodes: index.decks,
    edges: [
        { source: 'mathematics/arithmetic', target: 'mathematics/algebra', type: 'required' },
        { source: 'mathematics/algebra', target: 'physics/physical-reasoning', type: 'required' }
    ]
};

describe('curriculum graphs and layout', () => {
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

    it('can project a valid cross-subject deck DAG into mutually dependent subjects', () => {
        const decks = [
            { id: 'chemistry/foundations', subject: 'chemistry', prerequisites: [] },
            { id: 'biology/ecology', subject: 'biology', prerequisites: ['chemistry/foundations'] },
            { id: 'chemistry/environment', subject: 'chemistry', prerequisites: ['biology/ecology', 'chemistry/foundations'] }
        ];
        const edges = decks.flatMap(deck => deck.prerequisites.map(source => ({ source, target: deck.id, type: 'required' })));
        const reduced = transitivelyReduceCurriculumGraph({ nodes: decks, edges });
        expect(reduced.edges).toEqual([edges[0], edges[1]]);
        // The subject arrows refer to different decks; neither is a deck cycle.
        expect(subjectOverviewGraph({ decks }).edges).toEqual([
            { source: 'chemistry', target: 'biology', type: 'required' },
            { source: 'biology', target: 'chemistry', type: 'required' }
        ]);
    });

    it('lays hard prerequisites in earlier columns', () => {
        const graph = deckGraph;
        const layout = layoutCurriculumGraph(graph);
        const nodes = new Map(layout.nodes.map(node => [node.id, node]));
        expect(nodes.get('mathematics/arithmetic').rank).toBe(0);
        expect(nodes.get('mathematics/algebra').rank).toBe(1);
        expect(nodes.get('physics/physical-reasoning').rank).toBe(2);
        expect(layout.width).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
    });

    it('uses measured widths and heights when routing subject nodes', async () => {
        const graph = subjectOverviewGraph(index);
        const nodeSizes = new Map(graph.nodes.map((node, i) => [node.id, { width: 100 + i * 30, height: 50 }]));
        const layout = await layoutCurriculumGraphElk(graph, { nodeSizes });
        for (const node of layout.nodes) {
            expect(node.width).toBe(nodeSizes.get(node.id).width);
            expect(node.height).toBe(50);
        }
        expect(layout.edges.every(edge => edge.sections.length > 0)).toBe(true);
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

    it('builds chapter-level edges from resolved local dependencies', () => {
        const graph = chapterGraph(index, 'mathematics/arithmetic');
        expect(graph.edges).toEqual([{
            source: 'mathematics/arithmetic#01_numbers',
            target: 'mathematics/arithmetic#02_measurement',
            type: 'required'
        }]);
    });

    it('uses ELK to route a readable layered graph', async () => {
        const layout = await layoutCurriculumGraphElk(deckGraph);
        expect(layout.nodes).toHaveLength(3);
        expect(layout.edges.every(edge => edge.sections.length > 0)).toBe(true);
        expect(layout.width).toBeGreaterThan(250);
    });
});

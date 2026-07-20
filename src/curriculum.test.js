import { describe, expect, it } from 'vitest';
import {
    chapterPrerequisiteClosure,
    curriculumGraph,
    curriculumDeckRows,
    dependencyPlan,
    focusedCurriculumGraph,
    layoutCurriculumGraphElk,
    subjectOverviewGraph,
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

    it('builds a focused ancestor path with only immediate descendants', () => {
        const graph = focusedCurriculumGraph(index, 'mathematics/algebra');
        expect(graph.nodes.map(node => node.id).sort()).toEqual([
            'mathematics/algebra',
            'mathematics/arithmetic',
            'physics/physical-reasoning'
        ]);
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
        const layout = await layoutCurriculumGraphElk(curriculumGraph(index));
        expect(layout.nodes).toHaveLength(3);
        expect(layout.edges.every(edge => edge.sections.length > 0)).toBe(true);
        expect(layout.width).toBeGreaterThan(250);
    });
});

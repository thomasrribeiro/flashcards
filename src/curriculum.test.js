import { describe, expect, it } from 'vitest';
import {
    chapterPrerequisiteClosure,
    curriculumDeckRows,
    dependencyPlan
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
});

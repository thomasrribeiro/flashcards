import { describe, expect, it } from 'vitest';
import {
    reconcileSupersededDecks,
    scopesWithoutRepositories,
    supersededRepositoryIds
} from './collection-reconciliation.js';

const legacy = {
    id: 'owner/quantitative-physics-foundations',
    curriculumId: 'physics/quantitative-physics-foundations',
    subject: 'physics',
    curriculumOrder: 1
};

const replacement = {
    id: 'owner/physical-reasoning-and-measurement',
    curriculumId: 'physics/physical-reasoning-and-measurement',
    subject: 'physics',
    curriculumOrder: 1,
    supersedes: ['physics/quantitative-physics-foundations']
};

describe('collection supersession', () => {
    it('keeps a legacy deck when its replacement is not installed', () => {
        expect(reconcileSupersededDecks([legacy])).toEqual([legacy]);
    });

    it('hides an explicitly superseded predecessor while its replacement is installed', () => {
        expect(reconcileSupersededDecks([legacy, replacement])).toEqual([replacement]);
        expect(supersededRepositoryIds([legacy, replacement]))
            .toEqual(new Set(['owner/quantitative-physics-foundations']));
    });

    it('does not infer replacement from matching subject and curriculum order', () => {
        const independent = {
            ...replacement,
            id: 'owner/independent-foundations',
            curriculumId: 'physics/independent-foundations',
            supersedes: []
        };

        expect(reconcileSupersededDecks([legacy, independent]))
            .toEqual([legacy, independent]);
    });

    it('matches declared curriculum IDs case-insensitively', () => {
        const caseVariantReplacement = {
            ...replacement,
            supersedes: [' PHYSICS/QUANTITATIVE-PHYSICS-FOUNDATIONS ']
        };
        expect(reconcileSupersededDecks([
            legacy,
            caseVariantReplacement
        ])).toEqual([caseVariantReplacement]);
    });

    it('removes whole-deck and chapter scopes for retired repositories', () => {
        expect(scopesWithoutRepositories([
            'owner/legacy',
            'owner/legacy\0flashcards/01.md',
            'owner/current\0flashcards/01.md'
        ], ['owner/legacy'])).toEqual([
            'owner/current\0flashcards/01.md'
        ]);
    });
});

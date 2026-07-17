import { describe, expect, it } from 'vitest';
import { sortDeckIdsByCurriculum } from './deck-order.js';

describe('sortDeckIdsByCurriculum', () => {
    it('lists curriculum decks first by order and unlisted decks alphabetically below', () => {
        const decks = new Map([
            ['org/legacy-zeta', { curriculumOrder: null }],
            ['org/classical-mechanics', { curriculumOrder: 4 }],
            ['org/quantitative-physics-foundations', { curriculumOrder: 1 }],
            ['org/community-alpha', {}]
        ]);

        expect(sortDeckIdsByCurriculum(decks.keys(), decks)).toEqual([
            'org/quantitative-physics-foundations',
            'org/classical-mechanics',
            'org/community-alpha',
            'org/legacy-zeta'
        ]);
    });

    it('uses the deck name as a deterministic tie-breaker', () => {
        const decks = new Map([
            ['org/zeta', { curriculumOrder: 2 }],
            ['org/alpha', { curriculumOrder: 2 }]
        ]);
        expect(sortDeckIdsByCurriculum(decks.keys(), decks)).toEqual([
            'org/alpha',
            'org/zeta'
        ]);
    });
});

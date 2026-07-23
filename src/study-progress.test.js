import { describe, expect, it } from 'vitest';
import { studyProgressSnapshot } from './study-session.js';

describe('studyProgressSnapshot', () => {
    it('starts a chapter drill from durable chapter completion', () => {
        expect(studyProgressSnapshot({
            currentCardIndex: 0,
            reviewedCards: 0,
            totalCards: 17,
            fileFilter: 'flashcards/01_systems_quantities_and_models.md',
            scopeTotalCards: 19,
            introducedCards: 2,
            newlyIntroducedCards: 0
        })).toEqual({
            completed: 2,
            total: 19,
            percent: 11,
            isChapterSweep: true
        });
    });

    it('advances chapter completion when a fresh card is graded', () => {
        expect(studyProgressSnapshot({
            currentCardIndex: 1,
            reviewedCards: 0,
            totalCards: 17,
            fileFilter: 'flashcards/01_systems_quantities_and_models.md',
            scopeTotalCards: 19,
            introducedCards: 2,
            newlyIntroducedCards: 1
        })).toMatchObject({
            completed: 3,
            total: 19,
            percent: 16
        });
    });

    it('shows a completed chapter as 100% when its continuation queue is empty', () => {
        expect(studyProgressSnapshot({
            currentCardIndex: 0,
            reviewedCards: 0,
            totalCards: 0,
            fileFilter: 'flashcards/01_systems_quantities_and_models.md',
            scopeTotalCards: 19,
            introducedCards: 19,
            newlyIntroducedCards: 0
        })).toEqual({
            completed: 19,
            total: 19,
            percent: 100,
            isChapterSweep: true
        });
    });

    it('preserves the existing resumed-session calculation outside chapter sweeps', () => {
        expect(studyProgressSnapshot({
            currentCardIndex: 2,
            reviewedCards: 3,
            totalCards: 10,
            fileFilter: null
        })).toEqual({
            completed: 5,
            total: 10,
            percent: 50,
            isChapterSweep: false
        });
    });
});

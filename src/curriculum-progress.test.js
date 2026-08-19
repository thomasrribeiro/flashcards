import { describe, expect, it } from 'vitest';
import {
    curriculumChapterProgressStates,
    curriculumDeckProgressStates
} from './curriculum-progress.js';

const deck = {
    id: 'owner/arithmetic',
    subject: 'Mathematics',
    curriculumId: 'mathematics/number-sense-and-arithmetic',
    files: [{ path: 'flashcards/01.md', sha: 'current-sha' }]
};
const progress = [{
    repo: deck.id,
    filepath: 'flashcards/01.md',
    sourceSha: 'current-sha',
    totalCards: 10,
    reviewedCards: 10
}];

describe('curriculumDeckProgressStates', () => {
    it('marks generated unfinished content as learning', () => {
        const states = curriculumDeckProgressStates([deck], [], [], [{ ...progress[0], reviewedCards: 9 }]);
        expect(states.get(deck.curriculumId)).toBe('learning');
    });

    it('marks a fully introduced deck with no due cards as complete', () => {
        const states = curriculumDeckProgressStates([deck], [], [], progress);
        expect(states.get(deck.curriculumId)).toBe('complete');
    });

    it('turns a complete deck back to learning when review is due', () => {
        const reviews = [{
            cardHash: 'card-1',
            repo: deck.id,
            fsrsCard: { due: '2026-08-12T12:00:00.000Z' }
        }];
        const states = curriculumDeckProgressStates(
            [deck], [], reviews, progress, new Date('2026-08-13T12:00:00.000Z')
        );
        expect(states.get(deck.curriculumId)).toBe('learning');
    });

    it('does not count progress from an outdated chapter revision', () => {
        const states = curriculumDeckProgressStates([deck], [], [], [{ ...progress[0], sourceSha: 'old-sha' }]);
        expect(states.get(deck.curriculumId)).toBe('learning');
    });
});

describe('curriculumChapterProgressStates', () => {
    const curriculumDeck = {
        id: deck.curriculumId,
        chapters: [
            { id: '01_foundations', file: 'flashcards/01.md', card_count: 10 },
            { id: '02_next', file: 'flashcards/02.md', card_count: 0 }
        ]
    };

    it('uses grey, yellow, and green for absent, in-progress, and completed cards', () => {
        const absentAndLearning = curriculumChapterProgressStates([curriculumDeck], [deck], [], []);
        expect(absentAndLearning.get(`${deck.curriculumId}#01_foundations`)).toBe('learning');
        expect(absentAndLearning.get(`${deck.curriculumId}#02_next`)).toBe('unavailable');

        const complete = curriculumChapterProgressStates([curriculumDeck], [deck], [], progress);
        expect(complete.get(`${deck.curriculumId}#01_foundations`)).toBe('complete');
    });

    it('returns a reviewed chapter to yellow when one of its cards is due', () => {
        const reviews = [{
            repo: deck.id,
            filepath: 'flashcards/01.md',
            fsrsCard: { due: '2026-08-12T12:00:00.000Z' }
        }];
        const states = curriculumChapterProgressStates(
            [curriculumDeck], [deck], reviews, progress, new Date('2026-08-13T12:00:00.000Z')
        );
        expect(states.get(`${deck.curriculumId}#01_foundations`)).toBe('learning');
    });
});

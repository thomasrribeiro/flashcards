import { describe, expect, it } from 'vitest';
import {
    buildChapterProgressSnapshot,
    chapterProgressScope,
    chapterProgressTargets
} from './chapter-progress.js';

describe('chapter progress startup backfill', () => {
    const deck = {
        id: 'owner/deck',
        files: [
            { path: 'flashcards/01.md', sha: 'sha-one' },
            { path: 'flashcards/02.md', sha: 'sha-two' }
        ]
    };

    it('loads reviewed and active chapters without a current D1 snapshot', () => {
        const activeScopes = new Set([
            chapterProgressScope('owner/deck', 'flashcards/02.md')
        ]);
        expect(chapterProgressTargets(
            [deck],
            [{ cardHash: 'a', repo: 'owner/deck', filepath: 'flashcards/01.md' }],
            [{
                repo: 'owner/deck',
                filepath: 'flashcards/01.md',
                sourceSha: 'old-sha',
                totalCards: 1,
                reviewedCards: 1
            }],
            activeScopes
        )).toEqual([
            { repo: 'owner/deck', filepath: 'flashcards/01.md', sourceSha: 'sha-one' },
            { repo: 'owner/deck', filepath: 'flashcards/02.md', sourceSha: 'sha-two' }
        ]);
    });

    it('skips a snapshot for the current GitHub blob', () => {
        expect(chapterProgressTargets(
            [deck],
            [{ cardHash: 'a', repo: 'owner/deck', filepath: 'flashcards/01.md' }],
            [{
                repo: 'owner/deck',
                filepath: 'flashcards/01.md',
                sourceSha: 'sha-one',
                totalCards: 1,
                reviewedCards: 1
            }],
            new Set()
        )).toEqual([]);
    });

    it('builds the denominator and reviewed count from loaded cards', () => {
        const cards = [
            { hash: 'a', source: { repo: 'owner/deck', file: 'flashcards/01.md', sha: 'sha-one' } },
            { hash: 'b', source: { repo: 'owner/deck', file: 'flashcards/01.md', sha: 'sha-one' } }
        ];
        expect(buildChapterProgressSnapshot(
            cards,
            [{ cardHash: 'a' }],
            { repo: 'owner/deck', filepath: 'flashcards/01.md', sourceSha: 'sha-one' }
        )).toEqual({
            repo: 'owner/deck',
            filepath: 'flashcards/01.md',
            sourceSha: 'sha-one',
            totalCards: 2,
            reviewedCards: 1
        });
    });
});

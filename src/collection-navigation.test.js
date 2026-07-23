import { describe, expect, it } from 'vitest';
import {
    collectionSnapshotForRender,
    commitCollectionSnapshot
} from './collection-navigation.js';

describe('column collection navigation', () => {
    it('keeps navigation on the currently rendered collection snapshot', () => {
        const snapshot = { decks: [{ id: 'physics/measurement' }] };

        expect(collectionSnapshotForRender(snapshot, false)).toBe(snapshot);
        expect(collectionSnapshotForRender(snapshot, true)).toBeNull();
        expect(collectionSnapshotForRender(null, false)).toBeNull();
    });

    it('does not commit data from a refresh superseded by navigation', () => {
        const current = { decks: [{ id: 'physics/measurement' }] };
        const stale = { decks: [{ id: 'physics/measurement' }, { id: 'mathematics/arithmetic' }] };

        expect(commitCollectionSnapshot(current, stale, {
            renderGeneration: 1,
            latestGeneration: 2,
            isDeckView: true
        })).toBe(current);
        expect(commitCollectionSnapshot(current, stale, {
            renderGeneration: 2,
            latestGeneration: 2,
            isDeckView: true
        })).toBe(stale);
    });
});

import { describe, expect, it, vi } from 'vitest';
import {
    evictDisposableLocalStorage,
    evictLegacyBlobLocalStorage,
    setCriticalLocalStorageItem
} from './browser-storage.js';

function storageWith(entries = {}) {
    const data = new Map(Object.entries(entries));
    return {
        get length() { return data.size; },
        key: index => [...data.keys()][index] ?? null,
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        data
    };
}

function quotaError() {
    const error = new Error('Storage quota exceeded');
    error.name = 'QuotaExceededError';
    return error;
}

describe('critical browser storage', () => {
    it('evicts only disposable caches and preserves user state', () => {
        const storage = storageWith({
            gh_blob_old: 'large card body',
            'flashcards_repo_metadata_owner/deck': 'metadata',
            flashcards_reviews: 'review-state',
            flashcards_habit: 'starred-scope'
        });

        expect(evictDisposableLocalStorage(storage)).toBe(2);
        expect(storage.getItem('gh_blob_old')).toBeNull();
        expect(storage.getItem('flashcards_repo_metadata_owner/deck')).toBeNull();
        expect(storage.getItem('flashcards_reviews')).toBe('review-state');
        expect(storage.getItem('flashcards_habit')).toBe('starred-scope');
    });

    it('retries a critical write after quota recovery', () => {
        const storage = storageWith({ gh_blob_old: 'large card body' });
        const originalSet = storage.setItem;
        storage.setItem = vi.fn((key, value) => {
            if (storage.getItem('gh_blob_old') !== null) throw quotaError();
            originalSet(key, value);
        });

        expect(setCriticalLocalStorageItem('flashcards_study_session', '{"queue":[]}', storage)).toBe(true);
        expect(storage.setItem).toHaveBeenCalledTimes(2);
        expect(storage.getItem('flashcards_study_session')).toBe('{"queue":[]}');
    });

    it('can purge only legacy Markdown blobs during startup', () => {
        const storage = storageWith({
            gh_blob_a: 'a',
            gh_blob_b: 'b',
            'flashcards_repo_metadata_owner/deck': 'metadata'
        });

        expect(evictLegacyBlobLocalStorage(storage)).toBe(2);
        expect(storage.getItem('flashcards_repo_metadata_owner/deck')).toBe('metadata');
    });
});

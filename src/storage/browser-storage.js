/** Helpers that keep disposable caches from crowding critical local state. */

const EVICTABLE_PREFIXES = ['gh_blob_', 'flashcards_repo_metadata_'];

export function isStorageQuotaError(error) {
    return error?.name === 'QuotaExceededError'
        || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || error?.code === 22
        || error?.code === 1014;
}

/**
 * Remove legacy/disposable localStorage caches. Review state, starred scope,
 * authentication, and resumable sessions are deliberately never evicted.
 */
export function evictDisposableLocalStorage(storage = globalThis.localStorage) {
    if (!storage) return 0;
    const keys = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key && EVICTABLE_PREFIXES.some(prefix => key.startsWith(prefix))) {
            keys.push(key);
        }
    }
    for (const key of keys) storage.removeItem(key);
    return keys.length;
}

/** Remove card bodies left by versions that cached Markdown in localStorage. */
export function evictLegacyBlobLocalStorage(storage = globalThis.localStorage) {
    if (!storage) return 0;
    const keys = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith('gh_blob_')) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return keys.length;
}

/**
 * Persist important state. If an old card-body/metadata cache filled the
 * origin quota, evict only that disposable data and retry once.
 */
export function setCriticalLocalStorageItem(key, value, storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
        storage.setItem(key, value);
        return true;
    } catch (error) {
        if (!isStorageQuotaError(error)) throw error;
        const evicted = evictDisposableLocalStorage(storage);
        if (evicted > 0) {
            console.warn(`[Storage] Reclaimed local space from ${evicted} disposable cache item(s)`);
        }
        storage.setItem(key, value);
        return true;
    }
}

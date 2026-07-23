/**
 * Navigation inside the column viewer must render the collection snapshot that
 * produced the current rows. It must not adopt repositories that happened to
 * arrive asynchronously between clicks; explicit collection mutations perform
 * a fresh load instead.
 */
export function collectionSnapshotForRender(snapshot, refreshCollection = true) {
    return !refreshCollection && snapshot ? snapshot : null;
}

export function commitCollectionSnapshot(current, next, {
    renderGeneration,
    latestGeneration,
    isDeckView
}) {
    if (!next || renderGeneration !== latestGeneration || !isDeckView) return current;
    return next;
}

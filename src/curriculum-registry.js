export const DEFAULT_CURRICULUM_REGISTRIES = [{
    id: 'thomas-ribeiro',
    name: 'Thomas Ribeiro Curricula',
    repository: 'thomasrribeiro-flashcards/curricula',
    ref: 'master',
    path: 'dist/curriculum.json',
    enabled: true
}];

const SOURCES_KEY = 'flashcards_curriculum_registries_v1';
const CACHE_NAME = 'flashcards-curriculum-registry-v1';
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function registryIndexUrl(source, resolvedRef = null) {
    const repository = String(source?.repository || '');
    if (!REPOSITORY.test(repository) || repository.split('/').some(part => part === '.' || part === '..')) {
        throw new Error('Registry repository must use owner/repository form');
    }
    const ref = String(resolvedRef || source.ref || 'master');
    const file = String(source.path || 'dist/curriculum.json').replace(/^\/+/, '');
    if (!/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..') || file.includes('..')) {
        throw new Error('Registry ref and path must be safe repository-relative values');
    }
    return `https://raw.githubusercontent.com/${repository}/${ref}/${file}`;
}

async function resolveRegistryCommit(source, fetchImpl) {
    const response = await fetchImpl(`https://api.github.com/repos/${source.repository}/commits/${encodeURIComponent(source.ref || 'master')}`, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-cache'
    });
    if (!response.ok) return null;
    const sha = String((await response.json())?.sha || '');
    return /^[a-f0-9]{40}$/i.test(sha) ? sha : null;
}

export function getCurriculumRegistrySources(storage = globalThis.localStorage) {
    try {
        const saved = JSON.parse(storage?.getItem(SOURCES_KEY) || 'null');
        if (Array.isArray(saved) && saved.length) return saved;
    } catch { /* use defaults */ }
    return DEFAULT_CURRICULUM_REGISTRIES.map(source => ({ ...source }));
}

export function saveCurriculumRegistrySources(sources, storage = globalThis.localStorage) {
    const normalized = sources.map(source => ({
        id: String(source.id || source.repository).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        name: String(source.name || source.repository),
        repository: String(source.repository),
        ref: String(source.ref || 'master'),
        path: String(source.path || 'dist/curriculum.json'),
        enabled: source.enabled !== false
    }));
    normalized.forEach(registryIndexUrl);
    storage?.setItem(SOURCES_KEY, JSON.stringify(normalized));
    return normalized;
}

export function validateCurriculumIndex(index) {
    if (Number(index?.schema_version) < 2 || !Array.isArray(index?.decks) || !Array.isArray(index?.subjects)) {
        throw new Error('Curriculum index uses an unsupported schema');
    }
    const ids = new Set();
    for (const deck of index.decks) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(deck.id || ''))) {
            throw new Error(`Invalid curriculum deck id: ${deck.id}`);
        }
        if (ids.has(deck.id)) throw new Error(`Duplicate curriculum deck id: ${deck.id}`);
        ids.add(deck.id);
    }
    return index;
}

async function cachedResponse(url, cacheStorage) {
    if (!cacheStorage?.open) return null;
    return (await cacheStorage.open(CACHE_NAME)).match(url);
}

async function cacheResponse(url, response, cacheStorage) {
    if (!cacheStorage?.open || !response?.ok) return;
    const cache = await cacheStorage.open(CACHE_NAME);
    await cache.put(url, response.clone());
}

export async function fetchCurriculumRegistry(source, {
    fetchImpl = globalThis.fetch,
    cacheStorage = globalThis.caches
} = {}) {
    const commit = await resolveRegistryCommit(source, fetchImpl).catch(() => null);
    const url = registryIndexUrl(source, commit);
    try {
        const response = await fetchImpl(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        await cacheResponse(url, response, cacheStorage);
        return { source: { ...source, resolved_commit: commit }, index: validateCurriculumIndex(await response.json()), cached: false };
    } catch (networkError) {
        const cached = await cachedResponse(url, cacheStorage);
        if (!cached) throw networkError;
        return { source: { ...source, resolved_commit: commit }, index: validateCurriculumIndex(await cached.json()), cached: true };
    }
}

export function mergeCurriculumRegistries(results) {
    const subjects = new Map();
    const decks = new Map();
    const conflicts = [];
    for (const { source, index } of results) {
        for (const subject of index.subjects || []) {
            if (!subjects.has(subject.id)) subjects.set(subject.id, { ...subject, registry_id: source.id });
        }
        for (const deck of index.decks || []) {
            if (decks.has(deck.id)) {
                conflicts.push({ id: deck.id, kept: decks.get(deck.id).registry_id, ignored: source.id });
                continue;
            }
            decks.set(deck.id, { ...deck, registry_id: source.id });
        }
    }
    return {
        schema_version: 3,
        registries: results.map(({ source, cached }) => ({ ...source, cached })),
        subjects: [...subjects.values()],
        decks: [...decks.values()],
        conflicts
    };
}

export async function loadCurriculumRegistries({
    sources = getCurriculumRegistrySources(),
    fallbackUrl,
    fetchImpl = globalThis.fetch,
    cacheStorage = globalThis.caches
} = {}) {
    const enabled = sources.filter(source => source.enabled !== false);
    const settled = await Promise.allSettled(enabled.map(source =>
        fetchCurriculumRegistry(source, { fetchImpl, cacheStorage })));
    const loaded = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
    const errors = settled.flatMap((result, index) => result.status === 'rejected'
        ? [{ source: enabled[index], error: result.reason }]
        : []);
    if (loaded.length) return { index: mergeCurriculumRegistries(loaded), errors, fallback: false };
    if (!fallbackUrl) throw errors[0]?.error || new Error('No curriculum registry is available');
    const response = await fetchImpl(fallbackUrl);
    if (!response.ok) throw new Error(`Bundled curriculum unavailable (${response.status})`);
    return { index: validateCurriculumIndex(await response.json()), errors, fallback: true };
}

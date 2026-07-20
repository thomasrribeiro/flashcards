import { describe, expect, it } from 'vitest';
import {
    loadCurriculumRegistries,
    mergeCurriculumRegistries,
    registryIndexUrl,
    validateCurriculumIndex
} from './curriculum-registry.js';

const index = id => ({
    schema_version: 3,
    subjects: [{ id: id.split('/')[0] }],
    decks: [{ id, subject: id.split('/')[0], deck: id.split('/')[1] }]
});

describe('curriculum registries', () => {
    it('builds a safe raw GitHub index URL', () => {
        expect(registryIndexUrl({ repository: 'owner/curricula', ref: 'master' }))
            .toBe('https://raw.githubusercontent.com/owner/curricula/master/dist/curriculum.json');
        expect(() => registryIndexUrl({ repository: '../bad' })).toThrow();
    });

    it('merges registries deterministically and reports deck collisions', () => {
        const merged = mergeCurriculumRegistries([
            { source: { id: 'first' }, index: index('physics/mechanics') },
            { source: { id: 'second' }, index: index('physics/mechanics') }
        ]);
        expect(merged.decks).toHaveLength(1);
        expect(merged.decks[0].registry_id).toBe('first');
        expect(merged.conflicts).toEqual([{ id: 'physics/mechanics', kept: 'first', ignored: 'second' }]);
    });

    it('falls back to the bundled index only when all remote registries fail', async () => {
        const fallback = index('biology/cells');
        const fetchImpl = async url => url === '/fallback.json'
            ? new Response(JSON.stringify(fallback), { status: 200 })
            : new Response('missing', { status: 503 });
        const result = await loadCurriculumRegistries({
            sources: [{ id: 'remote', repository: 'owner/curricula' }],
            fallbackUrl: '/fallback.json',
            fetchImpl,
            cacheStorage: null
        });
        expect(result.fallback).toBe(true);
        expect(result.errors[0].source.id).toBe('remote');
        expect(result.index.decks[0].id).toBe('biology/cells');
    });

    it('pins a registry fetch to the current Git commit when GitHub resolves it', async () => {
        const calls = [];
        const sha = 'a'.repeat(40);
        const fetchImpl = async url => {
            calls.push(url);
            if (url.includes('api.github.com')) return new Response(JSON.stringify({ sha }), { status: 200 });
            return new Response(JSON.stringify(index('physics/mechanics')), { status: 200 });
        };
        const result = await loadCurriculumRegistries({
            sources: [{ id: 'remote', repository: 'owner/curricula', ref: 'master' }],
            fetchImpl,
            cacheStorage: null
        });
        expect(calls[1]).toContain(`/${sha}/dist/curriculum.json`);
        expect(result.index.registries[0].resolved_commit).toBe(sha);
    });

    it('rejects duplicate deck IDs inside one index', () => {
        const duplicate = index('physics/mechanics');
        duplicate.decks.push({ ...duplicate.decks[0] });
        expect(() => validateCurriculumIndex(duplicate)).toThrow(/Duplicate/);
    });
});

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePrerequisiteGraph } from './prerequisites.js';
import { resolveRegistry } from './registry.js';

function chapterTitle(content, id) {
    return /^#\s+(.+?)\s*$/m.exec(content)?.[1]?.trim()
        || id.replace(/^\d+_/, '').replaceAll('_', ' ');
}

function deckStatus(deckPath, fallback) {
    const content = readFileSync(path.join(deckPath, 'deck.toml'), 'utf8');
    return /^\s*status\s*=\s*"([^"]+)"\s*$/m.exec(content)?.[1] || fallback;
}

function registryDeck(registry, deckId) {
    const deck = registry.graph.decks.find(candidate => candidate.id === deckId);
    if (!deck) throw new Error(`Deck ${deckId} is not declared in the pinned curriculum registry.`);
    return deck;
}

export function createPinnedDeckContext(registryRoot, deckId, provenance) {
    const registry = resolveRegistry(registryRoot);
    if (registry.errors.length) {
        throw new Error(`Invalid curriculum registry:\n- ${registry.errors.join('\n- ')}`);
    }
    const catalog = JSON.parse(readFileSync(registry.outputPath, 'utf8'));
    const byId = new Map(catalog.decks.map(deck => [deck.id, deck]));
    const target = byId.get(deckId);
    if (!target) throw new Error(`Deck ${deckId} is absent from the pinned curriculum catalog.`);

    const closure = new Set();
    const visit = id => {
        for (const dependency of byId.get(id)?.prerequisites || []) {
            if (closure.has(dependency)) continue;
            closure.add(dependency);
            visit(dependency);
        }
    };
    visit(deckId);
    const directIds = new Set(target.prerequisites || []);
    const compactDeck = deck => ({
        id: deck.id,
        subject: deck.subject,
        level: deck.level,
        status: deck.status,
        description: deck.description,
        prerequisites: deck.prerequisites || [],
        repository: deck.repository || null,
        chapters: (deck.chapters || []).map(chapter => ({
            id: chapter.id,
            title: chapter.title,
            prerequisites: chapter.prerequisites || [],
            provides: chapter.provides || [],
            card_count: chapter.card_count || 0
        }))
    });
    const payload = {
        schema_version: 1,
        purpose: 'Bounded, reproducible context for one deck chapter curriculum. The target contract and direct prerequisites are authoritative. Downstream consumers constrain handoffs but do not expand target scope.',
        provenance,
        target: compactDeck(target),
        direct_prerequisites: [...directIds]
            .map(id => byId.get(id))
            .filter(Boolean)
            .map(compactDeck),
        transitive_prerequisites: [...closure]
            .filter(id => !directIds.has(id))
            .map(id => {
                const deck = byId.get(id);
                return deck ? {
                    id: deck.id,
                    level: deck.level,
                    description: deck.description,
                    provides: (deck.chapters || []).flatMap(chapter => chapter.provides || [])
                } : null;
            })
            .filter(Boolean),
        direct_consumers: catalog.decks
            .filter(deck => (deck.prerequisites || []).includes(deckId))
            .map(compactDeck),
        recommended_consumers: catalog.decks
            .filter(deck => (deck.recommended_after || []).includes(deckId))
            .map(compactDeck)
    };
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'flashcards-deck-context-'));
    const contextPath = path.join(temporaryRoot, 'pinned-curriculum-slice.json');
    writeFileSync(contextPath, `${JSON.stringify(payload, null, 2)}\n`);
    return {
        registry,
        target,
        subjectContextRoot: path.join(registry.subjectsRoot, target.subject),
        contextPath,
        sha256: `sha256:${createHash('sha256').update(readFileSync(contextPath)).digest('hex')}`,
        cleanup() { rmSync(temporaryRoot, { recursive: true, force: true }); }
    };
}

export function updateRegistryDeckSnapshot(registryRoot, deckId, deckPath, generation, {
    generationKind = 'curriculum',
    repositoryUrl = null
} = {}) {
    const registry = resolveRegistry(registryRoot);
    if (registry.errors.length) {
        throw new Error(`Invalid curriculum registry:\n- ${registry.errors.join('\n- ')}`);
    }
    if (!registry.deckMetadataPath) throw new Error('Curriculum registry does not configure a deck metadata snapshot.');
    const declared = registryDeck(registry, deckId);
    const metadataPath = path.join(registry.root, registry.deckMetadataPath);
    if (!existsSync(metadataPath)) throw new Error(`Missing deck metadata snapshot: ${metadataPath}`);
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const index = metadata.decks.findIndex(deck => deck.id === deckId);
    if (index < 0) throw new Error(`Deck metadata snapshot does not contain ${deckId}.`);
    const graph = resolvePrerequisiteGraph(deckPath);
    if (graph.errors.length) {
        throw new Error(`Cannot publish an invalid deck prerequisite graph:\n- ${graph.errors.join('\n- ')}`);
    }
    const chapters = graph.chapters.map(chapter => {
        const content = readFileSync(chapter.path, 'utf8');
        return {
            id: chapter.id,
            order: chapter.order,
            title: chapterTitle(content, chapter.id),
            file: `flashcards/${chapter.filename}`,
            card_count: (content.match(/^(?:Q|C|P):/gm) || []).length,
            prerequisites: chapter.prerequisites,
            provides: chapter.provides,
            resolved_dependencies: chapter.dependencyDetails.map(detail => ({
                reference: detail.reference,
                kind: detail.kind,
                resolved: detail.resolved
            }))
        };
    });
    metadata.decks[index] = {
        ...metadata.decks[index],
        materialized: true,
        status: deckStatus(deckPath, declared.status),
        ...(repositoryUrl ? {
            repository: { url: repositoryUrl, configured: true }
        } : {}),
        chapters,
        ...(generationKind === 'content'
            ? { chapter_content_generation: generation }
            : { chapter_curriculum_generation: generation })
    };
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return { metadataPath, chapters };
}

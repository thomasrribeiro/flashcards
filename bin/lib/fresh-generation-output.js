import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { compareGenerationDag } from '../../src/generation-dag-review.js';
import { validateGlobalCurriculumCandidate, validateChapterCurriculumCandidate } from '../../src/fresh-generation.js';

export const FRESH_CATALOG = 'fresh-curriculum.json';

export function rejectedCurriculumResult(catalog, issues, provenance) {
    if (!issues?.length) throw new Error('A rejected draft must record its validation issues.');
    return { status: 'failed', error: 'Needs revision. Draft available for review.', result: {
        provenance, preview: { available: true, readOnly: true, issues, catalog }
    } };
}

// Generation never sees this comparison or the old content. This deterministic
// publication step preserves it separately for review and recovery.
export function freshCandidateCatalog(before, candidate, jobType, { deckId, generation }) {
    if (jobType === 'curriculum-design') {
        const validated = validateGlobalCurriculumCandidate(candidate, candidate.subjects);
        const old = new Map(before.decks.map(deck => [deck.id, deck]));
        const specifications = catalog => ({ ...catalog, decks: catalog.decks.map(deck => ({ ...deck,
            title: deck.title || deck.deck, order: undefined, level: deck.scope ? deck.level : undefined, tier: undefined,
            estimated_chapters: undefined, recommended_after: undefined, provides: undefined, resolved_dependencies: undefined
        })) });
        const changed = new Set(compareGenerationDag(specifications(before), specifications(validated), { jobType }).affectedContent.map(deck => deck.id));
        const levels = new Map();
        const byId = new Map(validated.decks.map(deck => [deck.id, deck]));
        const level = id => {
            if (!levels.has(id)) levels.set(id, Math.max(0, ...byId.get(id).prerequisites.map(source => level(source) + 1)));
            return levels.get(id);
        };
        const ordered = [...validated.decks].sort((a, b) => level(a.id) - level(b.id) || a.id.localeCompare(b.id));
        const orders = new Map();
        return { schema_version: 3, registry: before.registry, fresh_generation: generation,
            ...(validated.curriculum_schema_version ? { curriculum_schema_version: validated.curriculum_schema_version,
                coverage: validated.coverage, scopeIssues: validated.scopeIssues,
                ...(validated.practiceNotes !== undefined ? { practiceNotes: validated.practiceNotes } : {}) } : {}),
            subjects: validated.subjects.map(id => ({ id })),
            decks: ordered.map(deck => {
                const prior = old.get(deck.id);
                const stale = changed.has(deck.id);
                orders.set(deck.subject, (orders.get(deck.subject) || 0) + 1);
                return {
                    ...deck, deck: deck.id.split('/')[1], order: orders.get(deck.subject),
                    status: prior && !stale ? prior.status : 'planned',
                    // Never infer semantic identity from a matching slug. A
                    // changed scope/ancestry gets a new plan, not old mastery.
                    chapters: prior && !stale ? prior.chapters || [] : [],
                    materialized: prior && !stale ? Boolean(prior.materialized) : false,
                    repository: prior?.repository || null,
                    content_state: prior && stale ? 'needs-review' : 'current',
                    ...(prior?.generation_runs ? { generation_runs: prior.generation_runs } : {})
                };
            }) };
    }
    const plan = validateChapterCurriculumCandidate(candidate, deckId);
    return { ...before, fresh_generation: generation, decks: before.decks.map(deck => deck.id !== deckId ? deck : {
        ...deck, status: 'chapter-planned', content_state: 'needs-review',
        chapters: plan.chapters.map(chapter => ({ ...chapter, order: Number.parseInt(chapter.id), file: `flashcards/${chapter.id}.md`, card_count: 0,
            resolved_dependencies: chapter.prerequisites.map(reference => ({ reference, kind: 'chapter', resolved: reference.slice(8) })) })),
        chapter_curriculum_generation: generation,
        generation_runs: [...(deck.generation_runs || []), generation]
    }) };
}

export function writeFreshCatalog(root, catalog, before, requestId, outputPath) {
    const archive = path.join(root, 'generation-archive', `request-${requestId}`);
    mkdirSync(archive, { recursive: true });
    writeFileSync(path.join(archive, 'previous-curriculum.json'), `${JSON.stringify(before, null, 2)}\n`, { flag: 'wx' });
    writeFileSync(path.join(root, FRESH_CATALOG), `${JSON.stringify(catalog, null, 2)}\n`);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
}

export function readFreshCatalog(file) {
    const catalog = JSON.parse(readFileSync(file, 'utf8'));
    validateGlobalCurriculumCandidate(catalog, catalog.subjects);
    for (const deck of catalog.decks) if (deck.chapters?.length) validateChapterCurriculumCandidate({ deckId: deck.id, chapters: deck.chapters }, deck.id);
    return catalog;
}

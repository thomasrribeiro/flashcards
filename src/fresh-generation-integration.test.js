import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshGenerationJob } from './fresh-generation-contract.js';
import { freshCandidateCatalog, readFreshCatalog, writeFreshCatalog } from '../bin/lib/fresh-generation-output.js';
import { freshGenerationSchema } from '../bin/lib/fresh-generation-schema.js';
import { renderFreshChapter } from '../bin/lib/fresh-generation-runner.js';
import { buildRegistry } from '../bin/lib/registry.js';
import { chapterGraph } from './curriculum.js';
import { parseDeck } from './parser.js';

const outcomes = [{ id: 'basics', description: 'Explain the basics.' }];
const deck = (id, prerequisites = []) => ({ id, subject: id.split('/')[0], deck: id.split('/')[1], title: id.split('/')[1], description: 'Original scope', outcomes,
    prerequisites, required_outcomes: prerequisites.map(deck_id => ({ deck_id, outcome_ids: ['basics'] })),
    chapters: [{ id: '01_basics', title: 'Basics', outcomes, prerequisites: [], card_count: 4 }], repository: { url: 'https://github.com/test/original', configured: true } });
const before = { schema_version: 3, subjects: [{ id: 'math' }, { id: 'physics' }], decks: [deck('math/arithmetic'), deck('physics/mechanics', ['math/arithmetic'])] };
const generation = { run_id: 'request-1', operation: 'chapter-curriculum', provider_id: 'openai', model_id: 'future-model', reasoning_effort: 'high', generated_at: '2026-09-06', artifacts: ['curriculum'] };

describe('fresh generation integration', () => {
    it('restores the exact request-58 global output schema', () => {
        const digest = createHash('sha256').update(JSON.stringify(freshGenerationSchema('curriculum-design'))).digest('hex');
        expect(digest).toBe('687574d6027d7f8d65e740b983a18e0d3d809e0e816deba50ebad0fd614d0f47');
    });
    it('uses the same canonical input for adding a subject and regenerating its resulting list', () => {
        const registry = { id: 'test', repository: 'test/curricula', resolved_commit: 'a'.repeat(40), catalog_hash: `sha256:${'b'.repeat(64)}` };
        const preferences = { providerId: 'openai', modelId: 'new-model', reasoningEffort: 'high' };
        const added = freshGenerationJob('curriculum-design', { subjects: ['physics', 'math'], newSubject: 'physics' }, preferences, registry, 'c'.repeat(40));
        const regenerated = freshGenerationJob('curriculum-design', { subjects: ['math', 'physics'] }, preferences, registry, 'c'.repeat(40));
        expect(added.payload.subjects).toEqual(regenerated.payload.subjects);
        expect(Object.keys(added.payload).sort()).toEqual(['catalogHash', 'catalogPath', 'newSubjects', 'reasoningEffort', 'registryBaseCommit', 'registryRef', 'subjects', 'workflowCommit', 'workflowVersion']);
    });
    it('archives metadata and invalidates only changed scopes and downstream plans', () => {
        const candidate = structuredClone(before);
        candidate.decks[0].description = 'New scope';
        const after = freshCandidateCatalog(before, candidate, 'curriculum-design', { generation });
        expect(after.decks.every(deck => deck.chapters.length === 0 && deck.content_state === 'needs-review')).toBe(true);
        expect(after.decks[0].repository).toEqual(before.decks[0].repository);
        expect(before.decks[0].chapters[0].card_count).toBe(4);
        const root = mkdtempSync(path.join(os.tmpdir(), 'fresh-catalog-test-'));
        mkdirSync(path.join(root, 'subjects'));
        writeFileSync(path.join(root, 'registry.toml'), 'schema_version = 1\nid = "test"\nname = "Test"\nrepository = "test/curricula"\n');
        writeFreshCatalog(root, after, before, 1, path.join(root, 'dist/curriculum.json'));
        const built = buildRegistry(root);
        expect(JSON.parse(readFileSync(built.outputPath)).decks).toHaveLength(2);
        expect(JSON.parse(readFileSync(path.join(root, 'generation-archive/request-1/previous-curriculum.json')))).toEqual(before);
        expect(readFreshCatalog(path.join(root, 'fresh-curriculum.json')).decks).toHaveLength(2);
        expect(() => writeFreshCatalog(root, after, before, 1, built.outputPath)).toThrow();
    });
    it('creates local chapter edges the existing chapter viewer can render', () => {
        const chapters = [before.decks[0].chapters[0], { id: '02_more', title: 'More', outcomes, prerequisites: ['chapter:01_basics'] }];
        const after = freshCandidateCatalog(before, { deckId: 'math/arithmetic', chapters }, 'deck-plan', { deckId: 'math/arithmetic', generation });
        expect(chapterGraph(after, 'math/arithmetic').edges).toEqual([{ source: 'math/arithmetic#01_basics', target: 'math/arithmetic#02_more', type: 'required' }]);
        expect(after.decks[0].chapters.every(chapter => chapter.card_count === 0)).toBe(true);
        expect(after.decks[1]).toEqual(before.decks[1]);
    });
    it('keeps unaffected plans despite presentation-order differences', () => {
        const current = structuredClone(before);
        current.decks.forEach((deck, index) => { deck.order = index + 1; deck.level = 'legacy-level'; });
        const result = freshCandidateCatalog(current, before, 'curriculum-design', { generation });
        expect(result.decks.every(deck => deck.chapters.length === 1)).toBe(true);
    });
    it('gives new cards new identities without importing legacy aliases', () => {
        const candidate = { chapterId: '01_basics', markdown: 'Q: What is one plus one?\n\nA: Two.\n', scopeIssues: [], coldStartAudit: 'Counting is introduced.', figurePlan: 'No visual retrieval target.' };
        const result = renderFreshChapter(candidate, before.decks[0].chapters[0], before.decks[0], generation);
        expect(result.cardCount).toBe(1);
        expect(result.markdown).not.toContain('card-alias');
        expect(parseDeck(result.markdown, '01_basics.md').cards[0].stableId).toBeTruthy();
        expect(result.markdown).toContain('authoring_model = "future-model"');
        expect(() => renderFreshChapter({ ...candidate, markdown: '<!-- card-id: old -->\n' + candidate.markdown }, before.decks[0].chapters[0], before.decks[0], generation)).toThrow(/identity/);
        expect(() => renderFreshChapter({ ...candidate, scopeIssues: ['Missing outcome'] }, before.decks[0].chapters[0], before.decks[0], generation)).toThrow(/scope/);
    });
    it('all schema objects are strict and no job imposes a count quota', () => {
        for (const type of ['curriculum-design', 'deck-plan', 'chapter-expand']) {
            const schema = freshGenerationSchema(type);
            const visit = value => {
                if (!value || typeof value !== 'object') return;
                if (value.type === 'object') { expect(value.additionalProperties).toBe(false); expect(value.required).toEqual(Object.keys(value.properties)); }
                Object.values(value).forEach(visit);
            };
            visit(schema);
            expect(JSON.stringify(schema)).not.toMatch(/maxItems|estimated_chapters/);
        }
    });
});

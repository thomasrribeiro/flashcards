import { describe, expect, it } from 'vitest';
import {
    deckGenerationScope,
    generationJobForChapterContent,
    generationJobForChapterCurriculum,
    generationJobForDeck,
    getGenerationPreferences,
    saveGenerationPreferences
} from './generation-preferences.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem: key => data.get(key) || null,
        setItem: (key, value) => data.set(key, value)
    };
}

describe('generation preferences', () => {
    it('persists provider, model, and reasoning without accepting a credential', () => {
        const storage = memoryStorage();
        saveGenerationPreferences({ providerId: 'codex', modelId: 'gpt-example', reasoningEffort: 'xhigh' }, storage);
        expect(getGenerationPreferences(storage)).toEqual({
            providerId: 'codex', modelId: 'gpt-example', reasoningEffort: 'xhigh'
        });
        expect(JSON.stringify(getGenerationPreferences(storage))).not.toMatch(/key|secret|token/i);
    });

    it('enforces the pilot gate before a full deck build', () => {
        expect(deckGenerationScope({ status: 'planned' })).toBe('pilot');
        expect(deckGenerationScope({ status: 'pilot-built' })).toBeNull();
        expect(deckGenerationScope({ status: 'pilot-approved' })).toBe('full');
        expect(deckGenerationScope({ status: 'built' })).toBeNull();
    });

    it('creates the same typed deck-build job consumed by the isolated CLI', () => {
        expect(generationJobForDeck({ id: 'mathematics/algebra', status: 'planned' }, {
            providerId: 'codex', modelId: 'gpt-example', reasoningEffort: 'high'
        })).toEqual({
            jobType: 'deck-build',
            registryId: 'thomas-ribeiro',
            providerId: 'codex',
            modelId: 'gpt-example',
            payload: {
                deckId: 'mathematics/algebra', buildScope: 'pilot', reasoningEffort: 'high'
            }
        });
    });

    it('requires an exact model for a connected API provider without persisting a key', () => {
        expect(() => generationJobForDeck({ id: 'biology/foundations', status: 'planned' }, {
            providerId: 'none', modelId: '', reasoningEffort: 'high'
        })).toThrow(/Connect an AI provider/);
        expect(() => generationJobForDeck({ id: 'biology/foundations', status: 'planned' }, {
            providerId: 'anthropic', modelId: '', reasoningEffort: 'high'
        })).toThrow(/Choose a model/);
        const job = generationJobForDeck({ id: 'biology/foundations', status: 'planned' }, {
            providerId: 'anthropic', modelId: 'claude-example', reasoningEffort: 'high'
        });
        expect(job).toMatchObject({ providerId: 'anthropic', modelId: 'claude-example' });
        expect(JSON.stringify(job)).not.toMatch(/api[-_]?key|secret|credential/i);
    });

    it('creates a provenance-pinned deck-plan job only for a deck without chapters', () => {
        const job = generationJobForChapterCurriculum({
            id: 'physics/mechanics', status: 'proposed', chapters: [], registry_id: 'primary'
        }, {
            providerId: 'openai', modelId: 'gpt-example', reasoningEffort: 'high'
        }, {
            workflowCommit: 'a'.repeat(40),
            registryBaseCommit: 'b'.repeat(40),
            catalogHash: 'sha256:test'
        });
        expect(job).toEqual({
            jobType: 'deck-plan',
            registryId: 'primary',
            providerId: 'openai',
            modelId: 'gpt-example',
            payload: {
                deckId: 'physics/mechanics',
                workflowVersion: 'deck-plan-v1',
                workflowCommit: 'a'.repeat(40),
                registryBaseCommit: 'b'.repeat(40),
                catalogHash: 'sha256:test',
                reasoningEffort: 'high'
            }
        });
        expect(() => generationJobForChapterCurriculum({
            id: 'physics/mechanics', status: 'proposed', chapters: [{ id: '01_motion' }]
        })).toThrow(/already has a chapter curriculum/);
    });

    it('creates pilot content only for chapter one and later content only after approval', () => {
        const preferences = {
            providerId: 'openai', modelId: 'gpt-example', reasoningEffort: 'xhigh'
        };
        expect(generationJobForChapterContent({
            id: 'physics/mechanics', status: 'scaffolded'
        }, {
            id: '01_motion', order: 1, card_count: 0
        }, preferences)).toMatchObject({
            jobType: 'chapter-expand',
            payload: { chapterId: '01_motion', buildScope: 'pilot' }
        });
        expect(() => generationJobForChapterContent({
            id: 'physics/mechanics', status: 'scaffolded'
        }, {
            id: '02_forces', order: 2, card_count: 0
        }, preferences)).toThrow(/not ready/);
        expect(generationJobForChapterContent({
            id: 'physics/mechanics', status: 'pilot-approved'
        }, {
            id: '02_forces', order: 2, card_count: 0
        }, preferences)).toMatchObject({
            payload: { chapterId: '02_forces', buildScope: 'chapter' }
        });
    });
});

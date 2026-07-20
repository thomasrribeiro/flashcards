import { describe, expect, it } from 'vitest';
import {
    deckGenerationScope,
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
});

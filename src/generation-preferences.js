import {
    CHAPTER_CONTENT_WORKFLOW_VERSION,
    DECK_PLAN_WORKFLOW_VERSION,
    chapterContentGenerationScope,
    deckCanPlanChapterCurriculum
} from './deck-generation-contract.js';

const STORAGE_KEY = 'flashcards_generation_preferences_v1';
const PROVIDERS = new Set(['none', 'codex', 'custom', 'anthropic', 'openai', 'google']);
const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);

export const DEFAULT_GENERATION_PREFERENCES = Object.freeze({
    providerId: 'codex',
    modelId: '',
    reasoningEffort: 'high'
});

export function normalizeGenerationPreferences(input = {}) {
    const providerId = PROVIDERS.has(input.providerId) ? input.providerId : 'codex';
    const modelId = String(input.modelId || '').trim();
    const reasoningEffort = REASONING_EFFORTS.has(input.reasoningEffort)
        ? input.reasoningEffort
        : 'high';
    if (modelId.length > 120 || /[\r\n\0]/.test(modelId)) {
        throw new Error('Model identifier must be a single line of at most 120 characters.');
    }
    return { providerId, modelId, reasoningEffort };
}

export function getGenerationPreferences(storage = globalThis.localStorage) {
    try {
        return normalizeGenerationPreferences(JSON.parse(storage?.getItem(STORAGE_KEY) || '{}'));
    } catch {
        return { ...DEFAULT_GENERATION_PREFERENCES };
    }
}

export function saveGenerationPreferences(input, storage = globalThis.localStorage) {
    const preferences = normalizeGenerationPreferences(input);
    storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return preferences;
}

export function deckGenerationScope(deck) {
    const status = String(deck?.status || '').toLowerCase();
    if (['built', 'full-built', 'active'].includes(status)) return null;
    if (status === 'pilot-approved') return 'full';
    if (['pilot-built', 'needs-review'].includes(status)) return null;
    return 'pilot';
}

export function generationJobForDeck(deck, preferences = getGenerationPreferences()) {
    const buildScope = deckGenerationScope(deck);
    if (!deck?.id || !buildScope) throw new Error('This deck is not ready for another generation job.');
    const normalized = normalizeGenerationPreferences(preferences);
    if (normalized.providerId === 'none') {
        throw new Error('Connect an AI provider and choose a model before requesting generation.');
    }
    if (['anthropic', 'openai', 'google'].includes(normalized.providerId) && !normalized.modelId) {
        throw new Error('Choose a model from the connected AI provider before requesting generation.');
    }
    return {
        jobType: 'deck-build',
        registryId: deck.registry_id || 'thomas-ribeiro',
        providerId: normalized.providerId,
        modelId: normalized.modelId || null,
        payload: {
            deckId: deck.id,
            buildScope,
            reasoningEffort: normalized.reasoningEffort
        }
    };
}

function generationProviderFields(preferences) {
    const normalized = normalizeGenerationPreferences(preferences);
    if (normalized.providerId === 'none') {
        throw new Error('Connect an AI provider and choose a model before requesting generation.');
    }
    if (['anthropic', 'openai', 'google'].includes(normalized.providerId) && !normalized.modelId) {
        throw new Error('Choose a model from the connected AI provider before requesting generation.');
    }
    return {
        providerId: normalized.providerId,
        modelId: normalized.modelId || null,
        reasoningEffort: normalized.reasoningEffort
    };
}

export function generationJobForChapterCurriculum(deck, preferences = getGenerationPreferences(), provenance = {}) {
    if (!deckCanPlanChapterCurriculum(deck)) {
        throw new Error('This deck is not ready for chapter curriculum planning.');
    }
    const provider = generationProviderFields(preferences);
    return {
        jobType: 'deck-plan',
        registryId: deck.registry_id || provenance.registryId || 'thomas-ribeiro',
        providerId: provider.providerId,
        modelId: provider.modelId,
        payload: {
            deckId: deck.id,
            workflowVersion: DECK_PLAN_WORKFLOW_VERSION,
            workflowCommit: provenance.workflowCommit || null,
            registryBaseCommit: provenance.registryBaseCommit || null,
            catalogHash: provenance.catalogHash || null,
            reasoningEffort: provider.reasoningEffort
        }
    };
}

export function generationJobForChapterContent(
    deck,
    chapter,
    preferences = getGenerationPreferences(),
    provenance = {},
    { replace = false } = {}
) {
    const buildScope = chapterContentGenerationScope(deck, chapter);
    if (!buildScope) {
        throw new Error('This chapter is not ready for content generation.');
    }
    const provider = generationProviderFields(preferences);
    return {
        jobType: 'chapter-expand',
        registryId: deck.registry_id || provenance.registryId || 'thomas-ribeiro',
        providerId: provider.providerId,
        modelId: provider.modelId,
        payload: {
            deckId: deck.id,
            chapterId: chapter.id,
            buildScope,
            generationMode: Number(chapter.card_count || 0) > 0
                ? replace ? 'replace' : 'improve'
                : 'generate',
            workflowVersion: CHAPTER_CONTENT_WORKFLOW_VERSION,
            workflowCommit: provenance.workflowCommit || null,
            registryBaseCommit: provenance.registryBaseCommit || null,
            catalogHash: provenance.catalogHash || null,
            reasoningEffort: provider.reasoningEffort
        }
    };
}

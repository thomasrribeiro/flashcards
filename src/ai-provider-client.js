export const AI_PROVIDER_DEFINITIONS = Object.freeze([
    Object.freeze({ id: 'anthropic', name: 'Anthropic', keyPlaceholder: 'sk-ant-…' }),
    Object.freeze({ id: 'openai', name: 'OpenAI', keyPlaceholder: 'sk-…' }),
    Object.freeze({ id: 'google', name: 'Google Gemini', keyPlaceholder: 'AIza…' })
]);

const PROVIDER_IDS = new Set(AI_PROVIDER_DEFINITIONS.map(provider => provider.id));

export function normalizeAIProviders(input = []) {
    const records = new Map((input || []).map(record => [record.id, record]));
    return AI_PROVIDER_DEFINITIONS.map(definition => {
        const record = records.get(definition.id) || {};
        return {
            ...definition,
            connected: record.connected === true,
            status: record.status || 'disconnected',
            keyHint: record.keyHint || null,
            verifiedAt: record.verifiedAt || null,
            updatedAt: record.updatedAt || null
        };
    });
}

export function generationEligibleModels(models = []) {
    return (models || [])
        .filter(model => model?.eligibleForGeneration !== false && model?.id)
        .map(model => ({
            id: String(model.id),
            name: String(model.name || model.id),
            description: String(model.description || ''),
            supportsReasoning: model.supportsReasoning !== false,
            contextWindow: model.contextWindow || model.inputTokenLimit || null,
            outputTokenLimit: model.outputTokenLimit || null
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function reasoningEffortsForProvider(providerId, model = null) {
    if (model?.supportsReasoning === false) return ['medium'];
    if (providerId === 'google') return ['medium'];
    if (providerId === 'openai' || providerId === 'codex') {
        return ['low', 'medium', 'high', 'xhigh'];
    }
    return ['low', 'medium', 'high'];
}

export async function listAIProviders(apiRequest) {
    const result = await apiRequest('/api/ai/providers', { method: 'GET' });
    return normalizeAIProviders(result.providers);
}

export async function connectAIProvider(apiRequest, providerId, apiKey) {
    if (!PROVIDER_IDS.has(providerId)) throw new Error('Unsupported AI provider.');
    return apiRequest(`/api/ai/providers/${providerId}`, {
        method: 'PUT',
        body: JSON.stringify({ apiKey })
    });
}

export async function disconnectAIProvider(apiRequest, providerId) {
    if (!PROVIDER_IDS.has(providerId)) throw new Error('Unsupported AI provider.');
    return apiRequest(`/api/ai/providers/${providerId}`, { method: 'DELETE' });
}

export async function loadAIProviderModels(apiRequest, providerId) {
    if (!PROVIDER_IDS.has(providerId)) return [];
    const result = await apiRequest(`/api/ai/providers/${providerId}/models`, { method: 'GET' });
    return generationEligibleModels(result.models);
}

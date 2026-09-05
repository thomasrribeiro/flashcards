import { describe, expect, it, vi } from 'vitest';
import {
    connectAIProvider,
    generationEligibleModels,
    loadAIProviderModels,
    normalizeAIProviders,
    reasoningEffortsForProvider
} from './ai-provider-client.js';

describe('AI provider client', () => {
    it('reloads capabilities without reusing an HTTP-cached model catalog', async () => {
        const api = vi.fn(async () => ({ models: [{
            id: 'gpt-6-astra', supportsReasoning: true,
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max']
        }] }));
        const [model] = await loadAIProviderModels(api, 'openai');
        expect(api).toHaveBeenCalledWith('/api/ai/providers/openai/models', { method: 'GET', cache: 'no-store' });
        expect(reasoningEffortsForProvider('openai', model)).toHaveLength(5);
    });
    it('preserves model-specific Astra efforts through catalog normalization', () => {
        const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
        const [model] = generationEligibleModels([{
            id: 'gpt-6-astra', supportsReasoning: true, reasoningEfforts: efforts
        }]);
        expect(reasoningEffortsForProvider('openai', model)).toEqual(efforts);
        expect(reasoningEffortsForProvider('openai', {
            id: 'gpt-4.1', supportsReasoning: false
        })).toEqual(['medium']);
        expect(reasoningEffortsForProvider('openai', {
            id: 'gpt-5.1', supportsReasoning: true
        })).not.toContain('max');
    });

    it('filters unknown and duplicate model effort values', () => {
        const [model] = generationEligibleModels([{
            id: 'example', reasoningEfforts: ['high', 'invalid', 'high', 'max']
        }]);
        expect(reasoningEffortsForProvider('openai', model)).toEqual(['high', 'max']);
    });

    it('renders every supported provider without inventing a connection', () => {
        const providers = normalizeAIProviders([
            { id: 'anthropic', connected: true, keyHint: '••••abcd', status: 'verified' }
        ]);
        expect(providers).toHaveLength(3);
        expect(providers[0]).toMatchObject({
            id: 'anthropic', connected: true, keyHint: '••••abcd'
        });
        expect(providers[1]).toMatchObject({ id: 'openai', connected: false });
    });

    it('filters and sorts the provider catalog for generation', () => {
        expect(generationEligibleModels([
            { id: 'embedding', eligibleForGeneration: false },
            { id: 'z-model', name: 'Z model' },
            { id: 'a-model', name: 'A model', inputTokenLimit: 1000 }
        ])).toEqual([
            expect.objectContaining({ id: 'a-model', contextWindow: 1000 }),
            expect.objectContaining({ id: 'z-model' })
        ]);
    });

    it('uses provider-aware reasoning choices and transmits a key only to the connect endpoint', async () => {
        expect(reasoningEffortsForProvider('anthropic')).toEqual(['low', 'medium', 'high']);
        expect(reasoningEffortsForProvider('openai')).toContain('xhigh');
        expect(reasoningEffortsForProvider('google')).toEqual(['medium']);
        const apiRequest = vi.fn(async () => ({ provider: { connected: true }, models: [] }));
        await connectAIProvider(apiRequest, 'openai', 'sk-secret');
        expect(apiRequest).toHaveBeenCalledWith('/api/ai/providers/openai', {
            method: 'PUT',
            body: JSON.stringify({ apiKey: 'sk-secret' })
        });
    });
});

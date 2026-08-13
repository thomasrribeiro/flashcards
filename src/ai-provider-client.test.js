import { describe, expect, it, vi } from 'vitest';
import {
    connectAIProvider,
    generationEligibleModels,
    normalizeAIProviders,
    reasoningEffortsForProvider
} from './ai-provider-client.js';

describe('AI provider client', () => {
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

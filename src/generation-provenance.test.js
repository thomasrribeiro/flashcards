import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    appendGenerationProvenance,
    changedGenerationArtifacts,
    generationProviderId,
    validateGenerationProvenance
} from '../bin/lib/generation-provenance.js';
import { validateDeckGenerationMetadata } from '../bin/lib/registry.js';

describe('generation provenance ledger', () => {
    it('appends artifact-level, secret-free run history', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'generation-provenance-'));
        await mkdir(path.join(root, 'flashcards'));
        appendGenerationProvenance(root, {
            runId: 'request-22',
            requestId: 22,
            operation: 'chapter-content',
            artifacts: ['flashcards/02_equivalent_expressions.md'],
            providerId: 'openai',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            chapterId: '02_equivalent_expressions',
            generatedAt: '2026-08-24T23:46:30.000Z'
        });
        const content = await readFile(path.join(root, 'generation.toml'), 'utf8');
        expect(content).toContain('run_id = "request-22"');
        expect(content).toContain('artifacts = ["flashcards/02_equivalent_expressions.md"]');
        expect(content).toContain('provider_id = "openai"');
        expect(content).toContain('model_id = "gpt-5.6-sol"');
        expect(content).toContain('reasoning_effort = "high"');
        expect(content).not.toMatch(/api.?key|secret/i);
        expect(validateGenerationProvenance(root)).toEqual([]);
        expect(() => appendGenerationProvenance(root, {
            runId: 'request-22', operation: 'chapter-content', artifacts: ['flashcards/x.md'],
            providerId: 'openai', modelId: 'gpt-5.6-sol', reasoningEffort: 'high'
        })).toThrow(/already recorded/);
    });

    it('derives provider IDs and changed artifact paths deterministically', () => {
        expect(generationProviderId(null, { provider: 'claude-cli' })).toBe('anthropic');
        expect(generationProviderId(null, { provider: 'gemini-cli' })).toBe('google');
        expect(generationProviderId(null, { provider: 'codex-cli' })).toBe('openai');
        expect(changedGenerationArtifacts([
            'diff --git a/flashcards/02_old.md b/flashcards/02_new.md',
            'diff --git a/generation.toml b/generation.toml'
        ].join('\n'))).toEqual(['flashcards/02_new.md']);
    });

    it('requires append-only registry history for every latest generation', () => {
        const complete = {
            run_id: 'request-22',
            request_id: 22,
            operation: 'chapter-content',
            artifacts: ['flashcards/02_equivalent_expressions.md'],
            provider_id: 'openai',
            model_id: 'gpt-5.6-sol',
            reasoning_effort: 'high',
            generated_at: '2026-08-24T21:40:46.000Z'
        };
        expect(validateDeckGenerationMetadata({
            decks: [{
                id: 'mathematics/example',
                chapter_content_generation: complete,
                generation_runs: [complete]
            }]
        })).toEqual([]);
        expect(validateDeckGenerationMetadata({
            decks: [{
                id: 'mathematics/example',
                chapter_content_generation: complete,
                generation_runs: []
            }]
        })).toContain('mathematics/example: generation_runs must retain every AI generation run');
    });
});

import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendSubjectGenerationProvenance } from '../bin/lib/subject-generation-provenance.js';

const baseRecord = {
    operation: 'create',
    providerId: 'openai',
    modelId: 'gpt-test',
    reasoningEffort: 'high',
    workflowVersion: 'subject-design-v1',
    workflowCommit: 'a'.repeat(40),
    registryBaseCommit: 'b'.repeat(40),
    catalogHash: `sha256:${'c'.repeat(64)}`
};

describe('subject generation provenance', () => {
    it('appends durable, secret-free generation history', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'subject-provenance-'));
        const subjectPath = path.join(root, 'physics');
        await mkdir(subjectPath);
        appendSubjectGenerationProvenance(subjectPath, { ...baseRecord, requestId: 7 });
        appendSubjectGenerationProvenance(subjectPath, {
            ...baseRecord,
            requestId: 8,
            operation: 'audit',
            modelId: 'gpt-next',
            reasoningEffort: 'xhigh'
        });
        const content = await readFile(path.join(subjectPath, 'generation.toml'), 'utf8');
        expect(content.match(/\[\[runs\]\]/g)).toHaveLength(2);
        expect(content).toContain('run_id = "request-7"');
        expect(content).toContain('artifacts = ["ROADMAP.md", "SUBJECT_BRIEF.md", "subject.toml"]');
        expect(content).toContain('model_id = "gpt-test"');
        expect(content).toContain('model_id = "gpt-next"');
        expect(content).toContain('reasoning_effort = "xhigh"');
        expect(content).not.toMatch(/api.?key|secret/i);
    });

    it('rejects a duplicate request record', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'subject-provenance-'));
        const subjectPath = path.join(root, 'mathematics');
        await mkdir(subjectPath);
        appendSubjectGenerationProvenance(subjectPath, { ...baseRecord, requestId: 7 });
        expect(() => appendSubjectGenerationProvenance(subjectPath, { ...baseRecord, requestId: 7 }))
            .toThrow(/already recorded/);
    });
});

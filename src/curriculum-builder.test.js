import { describe, expect, it } from 'vitest';
import { generationJobForDraft, validateCurriculumDraft } from './curriculum-builder.js';
import { SUBJECT_DESIGN_WORKFLOW_VERSION } from './subject-generation-contract.js';

const provenance = {
    modelId: 'gpt-test',
    workflowCommit: 'c'.repeat(40),
    registryBaseCommit: 'a'.repeat(40),
    catalogHash: `sha256:${'b'.repeat(64)}`,
    registryRef: 'master',
    catalogPath: 'dist/curriculum.json'
};

describe('curriculum builder', () => {
    it('produces a secret-free typed subject-design job', () => {
        const job = generationJobForDraft({
            subject: 'earth-science',
            title: 'Earth Science',
            proposedDecks: [
                { id: 'earth-systems', prerequisites: [] },
                { id: 'climate', prerequisites: ['earth-systems'] }
            ]
        }, provenance);
        expect(job).toMatchObject({ jobType: 'subject-design', providerId: 'codex' });
        expect(job.payload).toMatchObject({
            workflowVersion: SUBJECT_DESIGN_WORKFLOW_VERSION,
            workflowCommit: provenance.workflowCommit,
            registryBaseCommit: provenance.registryBaseCommit,
            catalogHash: provenance.catalogHash
        });
        expect(JSON.stringify(job)).not.toMatch(/api.?key|secret/i);
    });

    it('requires an exact model and pinned registry provenance', () => {
        const draft = { subject: 'biology', title: 'Biology' };
        expect(() => generationJobForDraft(draft, { ...provenance, modelId: '' }))
            .toThrow(/exact model/);
        expect(() => generationJobForDraft(draft, { ...provenance, workflowCommit: '' }))
            .toThrow(/workflow.*pinned Git commit/);
        expect(() => generationJobForDraft(draft, { ...provenance, registryBaseCommit: '' }))
            .toThrow(/pinned Git commit/);
        expect(() => generationJobForDraft(draft, { ...provenance, catalogHash: '' }))
            .toThrow(/SHA-256/);
    });

    it('rejects missing local references and cycles before queueing AI work', () => {
        expect(validateCurriculumDraft({
            subject: 'biology', title: 'Biology', proposedDecks: [
                { id: 'cells', prerequisites: ['genetics'] }
            ]
        }).errors.join('\n')).toContain('missing draft deck');
        expect(validateCurriculumDraft({
            subject: 'biology', title: 'Biology', proposedDecks: [
                { id: 'cells', prerequisites: ['genetics'] },
                { id: 'genetics', prerequisites: ['cells'] }
            ]
        }).errors.join('\n')).toContain('cycle');
    });
});

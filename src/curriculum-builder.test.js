import { describe, expect, it } from 'vitest';
import { generationJobForDraft, validateCurriculumDraft } from './curriculum-builder.js';

describe('curriculum builder', () => {
    it('produces a secret-free typed subject-design job', () => {
        const job = generationJobForDraft({
            subject: 'earth-science',
            title: 'Earth Science',
            proposedDecks: [
                { id: 'earth-systems', prerequisites: [] },
                { id: 'climate', prerequisites: ['earth-systems'] }
            ]
        });
        expect(job).toMatchObject({ jobType: 'subject-design', providerId: 'codex' });
        expect(JSON.stringify(job)).not.toMatch(/api.?key|secret/i);
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

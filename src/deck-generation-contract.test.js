import { describe, expect, it } from 'vitest';
import {
    CHAPTER_CONTENT_WORKFLOW_VERSION,
    DECK_PLAN_WORKFLOW_VERSION,
    validateChapterContentProvenance,
    validateDeckPlanProvenance
} from './deck-generation-contract.js';

describe('deck generation contract', () => {
    it('requires exact workflow, repository, and catalog provenance', () => {
        const valid = {
            workflowVersion: DECK_PLAN_WORKFLOW_VERSION,
            workflowCommit: 'a'.repeat(40),
            registryBaseCommit: 'b'.repeat(40),
            catalogHash: `sha256:${'c'.repeat(64)}`
        };
        expect(validateDeckPlanProvenance(valid)).toMatchObject(valid);
        expect(() => validateDeckPlanProvenance({ ...valid, workflowVersion: 'deck-plan-v1' }))
            .toThrow(/Unsupported deck-plan workflow/);
        expect(() => validateDeckPlanProvenance({ ...valid, registryBaseCommit: '' }))
            .toThrow(/pinned Git commit/);
        expect(() => validateDeckPlanProvenance({ ...valid, catalogHash: 'sha256:test' }))
            .toThrow(/reproducible SHA-256/);
        expect(validateChapterContentProvenance({
            ...valid,
            workflowVersion: CHAPTER_CONTENT_WORKFLOW_VERSION
        })).toMatchObject({ workflowVersion: CHAPTER_CONTENT_WORKFLOW_VERSION });
        expect(() => validateChapterContentProvenance(valid))
            .toThrow(/Unsupported chapter-content workflow/);
    });
});

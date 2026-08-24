import { describe, expect, it } from 'vitest';
import { subjectValidationRepairInstructions } from './generation-repair.js';

describe('subject generation repair', () => {
    it('turns deterministic subject validation failures into a bounded repair instruction', () => {
        const instruction = subjectValidationRepairInstructions(new Error(
            'Codex finished, but global curriculum validation failed:\n- redundant prerequisite'
        ));
        expect(instruction).toContain('Repair the existing subject artifacts in place.');
        expect(instruction).toContain('redundant prerequisite');
        expect(instruction).toContain('hard prerequisite edges direct and minimal');
    });

    it('does not retry provider, transport, or unrelated failures', () => {
        expect(subjectValidationRepairInstructions(new Error('Codex exited with status 1'))).toBeNull();
        expect(subjectValidationRepairInstructions(new Error('fetch failed'))).toBeNull();
    });
});

import { describe, expect, it } from 'vitest';
import { parseSolutionSteps } from './markdown.js';

describe('parseSolutionSteps', () => {
    it('parses headings with the colon outside the bold text', () => {
        expect(parseSolutionSteps(
            '**IDENTIFY**: Find the target.\n\n**PLAN**: Choose a method.'
        )).toEqual([
            { label: 'IDENTIFY', content: 'Find the target.\n' },
            { label: 'PLAN', content: 'Choose a method.' }
        ]);
    });

    it('parses headings emitted by the current authoring pipeline', () => {
        expect(parseSolutionSteps(
            '**IDENTIFY:** Find the target.\n\n**PLAN:** Choose a method.'
        )).toEqual([
            { label: 'IDENTIFY', content: 'Find the target.\n' },
            { label: 'PLAN', content: 'Choose a method.' }
        ]);
    });

    it('returns no steps for an unstructured solution so the UI can use its fallback', () => {
        expect(parseSolutionSteps('Compute the result directly.')).toEqual([]);
    });
});

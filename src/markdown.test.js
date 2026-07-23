import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { parseSolutionSteps } from './markdown.js';

describe('responsive prose wrapping', () => {
    it('treats source wrapping as a soft break', () => {
        const html = marked.parse('A sentence wrapped in the source\ncontinues in the same paragraph.');

        expect(html).not.toContain('<br>');
        expect(html).toContain('source\ncontinues');
    });

    it('preserves an explicitly authored Markdown hard break', () => {
        const html = marked.parse('First line.  \nSecond line.');

        expect(html).toContain('<br>');
    });
});

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

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

    it('parses unstyled IPEE headings from durable decks', () => {
        expect(parseSolutionSteps(
            'IDENTIFY: Find the target.\n\nPLAN: Choose a method.\n\nEXECUTE: Calculate.\n\nEVALUATE: Check.'
        )).toEqual([
            { label: 'IDENTIFY', content: 'Find the target.\n' },
            { label: 'PLAN', content: 'Choose a method.\n' },
            { label: 'EXECUTE', content: 'Calculate.\n' },
            { label: 'EVALUATE', content: 'Check.' }
        ]);
    });

    it('preserves a direct answer before the first IPEE heading', () => {
        expect(parseSolutionSteps(
            'The note should show 70.\n\nIDENTIFY: Round 73 to the nearest ten.\n\nPLAN: Compare 70 and 80.'
        )).toEqual([
            {
                label: 'IDENTIFY',
                content: 'The note should show 70.\n\nRound 73 to the nearest ten.\n'
            },
            { label: 'PLAN', content: 'Compare 70 and 80.' }
        ]);
    });

    it('does not treat arbitrary unstyled labels as solution steps', () => {
        expect(parseSolutionSteps('Answer: Compute the result directly.')).toEqual([]);
    });

    it('returns no steps for an unstructured solution so the UI can use its fallback', () => {
        expect(parseSolutionSteps('Compute the result directly.')).toEqual([]);
    });
});

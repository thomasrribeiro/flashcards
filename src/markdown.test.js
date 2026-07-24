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

    it('holds a direct answer until EXECUTE in a full IPEE solution', () => {
        expect(parseSolutionSteps(
            'The note should show 70.\n\nIDENTIFY: Round 73 to the nearest ten.\n\nPLAN: Compare 70 and 80.\n\nEXECUTE: Choose the closer ten.\n\nEVALUATE: Check the distances.'
        )).toEqual([
            { label: 'IDENTIFY', content: 'Round 73 to the nearest ten.\n' },
            { label: 'PLAN', content: 'Compare 70 and 80.\n' },
            {
                label: 'EXECUTE',
                content: 'The note should show 70.\n\nChoose the closer ten.\n'
            },
            { label: 'EVALUATE', content: 'Check the distances.' }
        ]);
    });

    it('keeps faded working separate from a retained EVALUATE step', () => {
        expect(parseSolutionSteps(
            'The result is 600.\n\n649 is closer to 600 than 700.\n\nEVALUATE: Check the two distances.'
        )).toEqual([
            {
                label: null,
                content: 'The result is 600.\n\n649 is closer to 600 than 700.'
            },
            { label: 'EVALUATE', content: 'Check the two distances.' }
        ]);
    });

    it('holds a direct answer inside EXECUTE when earlier IPEE stages are faded', () => {
        expect(parseSolutionSteps(
            'The sum is 3.16.\n\nEXECUTE: Align the decimal points and add.\n\nEVALUATE: Estimate the sum.'
        )).toEqual([
            {
                label: 'EXECUTE',
                content: 'The sum is 3.16.\n\nAlign the decimal points and add.\n'
            },
            { label: 'EVALUATE', content: 'Estimate the sum.' }
        ]);
    });

    it('reveals a faded prelude after retained reasoning and before EVALUATE', () => {
        expect(parseSolutionSteps(
            'The result is 70.\n\nIDENTIFY: Round to the nearest ten.\n\nPLAN: Compare the neighbors.\n\nEVALUATE: Check the distances.'
        )).toEqual([
            { label: 'IDENTIFY', content: 'Round to the nearest ten.\n' },
            { label: 'PLAN', content: 'Compare the neighbors.\n' },
            { label: null, content: 'The result is 70.' },
            { label: 'EVALUATE', content: 'Check the distances.' }
        ]);
    });

    it('does not treat arbitrary unstyled labels as solution steps', () => {
        expect(parseSolutionSteps('Answer: Compute the result directly.')).toEqual([]);
    });

    it('returns no steps for an unstructured solution so the UI can use its fallback', () => {
        expect(parseSolutionSteps('Compute the result directly.')).toEqual([]);
    });
});

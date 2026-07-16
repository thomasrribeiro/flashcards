import { describe, expect, it } from 'vitest';
import { decorateTikzSvg, parseTikzMetadata } from '../bin/lib/figures.js';

describe('TikZ figure rendering', () => {
    it('requires accessible source metadata', () => {
        const source = '% flashcards-title: Vector components\n' +
            '% flashcards-desc: A vector and its two Cartesian projections.\n' +
            '\\documentclass{standalone}';
        expect(parseTikzMetadata(source)).toEqual({
            title: 'Vector components',
            desc: 'A vector and its two Cartesian projections.'
        });
        expect(() => parseTikzMetadata('\\documentclass{standalone}')).toThrow(/requires/);
    });

    it('adds accessible metadata and source provenance to generated SVG', () => {
        const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><path/></svg>";
        const output = decorateTikzSvg(svg, {
            title: 'A & B',
            desc: 'A < B'
        }, 'figures/01/a.tex');

        expect(output).toContain("role='img' aria-labelledby='title desc'");
        expect(output).toContain("<title id='title'>A &amp; B</title>");
        expect(output).toContain("<desc id='desc'>A &lt; B</desc>");
        expect(output).toContain('TikZ source: figures/01/a.tex');
    });

    it('canonicalizes one-line dvisvgm definitions without rewriting complex defs', () => {
        const metadata = { title: 'Figure', desc: 'Description' };
        const simple = "<svg><defs>\n<path id='z'/>\n<path id='a'/>\n</defs></svg>";
        expect(decorateTikzSvg(simple, metadata, 'a.tex')).toContain(
            "<defs>\n<path id='a'/>\n<path id='z'/>\n</defs>"
        );

        const multiline = "<svg><defs>\n<linearGradient id='g'>\n<stop/>\n</linearGradient>\n</defs></svg>";
        expect(decorateTikzSvg(multiline, metadata, 'a.tex')).toContain(
            "<defs>\n<linearGradient id='g'>\n<stop/>\n</linearGradient>\n</defs>"
        );
    });
});

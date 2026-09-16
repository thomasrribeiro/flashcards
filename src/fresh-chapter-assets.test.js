import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, realpathSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { validateChapterAssets, validateConceptLedger, compileChapterFigures, figureSandboxProfile } from '../bin/lib/fresh-chapter-assets.js';
import { renderTikzFigures } from '../bin/lib/figures.js';
const candidate = () => ({ markdown: 'Q: Read the marked point.\n![A point on a line](../figures/01_basics/line.svg)\nA: One.', figures: [{ id: 'line', title: 'A marked line', description: 'An unlabeled point between the endpoints.', tikz: String.raw`\begin{tikzpicture}\draw (0,0) -- (3,0);\fill (1,0) circle (0.1);\node[below] at (0,0) {0};\end{tikzpicture}` }] });
describe('isolated chapter figures and ledger', () => {
    it('requires exact declared references, unique IDs, local paths and picture-only sources', () => {
        expect(validateChapterAssets(candidate(), '01_basics')).toHaveLength(1);
        for (const change of [
            c => { c.markdown = c.markdown.replace('line.svg', 'missing.svg'); },
            c => { c.figures.push(c.figures[0]); },
            c => { c.figures[0].id = '../escape'; },
            c => { c.figures[0].tikz = String.raw`\begin{tikzpicture}\input{/tmp/private}\end{tikzpicture}`; },
            c => { c.figures[0].tikz = String.raw`\begin{tikzpicture}\directlua{os.execute('id')}\end{tikzpicture}`; },
            c => { c.markdown = 'Q: No image.\nA: None.'; },
            c => { c.markdown = '![External](https://example.org/a.svg)'; }
        ]) { const c = candidate(); change(c); expect(() => validateChapterAssets(c, '01_basics')).toThrow(); }
        expect(() => validateChapterAssets(candidate(), '../escape')).toThrow();
    });
    it('rejects missing and forward or nonexistent concept references', () => {
        const c = { entryAssumptions: ['Ordinary reading'], conceptLedger: [{ concept: 'digit', explanationCard: 1, explanation: 'A written symbol used to build numerals.', retrievalCard: 2, applicationCards: [3] }] };
        expect(() => validateConceptLedger(c, 3)).not.toThrow();
        expect(() => validateConceptLedger(c, 2)).toThrow();
        expect(() => validateConceptLedger({}, 3)).toThrow();
        c.conceptLedger[0].retrievalCard = 0;
        expect(() => validateConceptLedger(c, 3)).toThrow();
    });
    it.skipIf(process.platform !== 'darwin')('OS sandbox denies reads and writes outside its temporary root', () => {
        const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'figure-sandbox-test-')));
        const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'figure-private-test-')));
        try {
            writeFileSync(path.join(outside, 'sentinel'), 'private sentinel');
            writeFileSync(path.join(root, 'allowed'), 'allowed');
            const profile = figureSandboxProfile(root, '/usr/local/texlive', '/bin/bash');
            const run = script => spawnSync('/usr/bin/sandbox-exec', ['-p', profile, '/bin/bash', '--noprofile', '--norc', '-c', script], { encoding: 'utf8' });
            expect(run(`read item < '${root}/allowed'; echo "$item"`).stdout.trim()).toBe('allowed');
            expect(run(`read item < '${outside}/sentinel'`).status).not.toBe(0);
            expect(run(`echo forbidden > '${outside}/written'`).status).not.toBe(0);
            expect(run('/usr/bin/curl https://example.org').status).not.toBe(0);
        } finally { rmSync(root, { recursive: true }); rmSync(outside, { recursive: true }); }
    });
    it.skipIf(process.platform !== 'darwin' || spawnSync('which', ['lualatex']).status !== 0)('compiles accessible SVG and reproducible editable TeX', () => {
        const assets = compileChapterFigures(candidate(), '01_basics');
        const svg = assets.find(a => a.path.endsWith('.svg')).content;
        expect(svg).toMatch(/viewBox=/); expect(svg).toContain("<title id='title'>A marked line</title>");
        expect(svg).not.toMatch(/<script|<image/);
        const root = mkdtempSync(path.join(os.tmpdir(), 'chapter-figure-deck-'));
        try {
            mkdirSync(path.join(root, 'flashcards'));
            for (const asset of assets) { const target = path.join(root, asset.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, asset.content); }
            expect(renderTikzFigures(root, { check: true, quiet: true }).status).toBe(0);
        } finally { rmSync(root, { recursive: true, force: true }); }
    }, 60000);
});

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { decorateTikzSvg, validateTikzCanvasCoordinates } from './figures.js';

const STYLE = String.raw`\usetikzlibrary{arrows.meta,patterns,positioning,calc}
\tikzset{every picture/.style={line width=0.8pt},every node/.style={font=\sffamily}}
`;

export function validateChapterAssets(candidate, chapterId) {
    if (!/^\d{2}_[a-z0-9_]+$/.test(chapterId)) throw new Error('Invalid chapter asset directory.');
    const figures = candidate.figures || [];
    if (!Array.isArray(figures)) throw new Error('Invalid chapter figures.');
    const paths = new Set();
    for (const figure of figures) {
        if (!/^[a-z][a-z0-9-]*$/.test(figure.id) || !figure.title?.trim() || !figure.description?.trim()) throw new Error('Invalid figure identity or accessibility metadata.');
        const file = `../figures/${chapterId}/${figure.id}.svg`;
        if (paths.has(file)) throw new Error('Duplicate figure identity.');
        paths.add(file);
        const source = figure.tikz;
        if (typeof source !== 'string' || !/^\s*\\begin\{tikzpicture\}[\s\S]*\\end\{tikzpicture\}\s*$/.test(source) ||
            (source.match(/\\begin\{tikzpicture\}/g) || []).length !== 1 ||
            /\^\^|\u0000|\\(?:input|include|write|read|openin|openout|closein|closeout|usepackage|documentclass|special|directlua|luaexec|catcode|csname|def|gdef|edef|xdef|let|newcommand|renewcommand|filecontents|immediate|endinput)\b/.test(source)) {
            throw new Error('Figure must contain only a TikZ picture, without file access, document setup, or executable TeX extensions.');
        }
        validateTikzCanvasCoordinates(source);
    }
    const used = new Set();
    const withoutImages = candidate.markdown.replace(/!\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, alt, file) => {
        if (!alt.trim() || !paths.has(file)) throw new Error('Image must reference a declared chapter figure with meaningful alt text.');
        used.add(file); return '';
    });
    if (/!\[|<\/?(?:img|svg|script|iframe)\b/i.test(withoutImages)) throw new Error('Unsupported image or embedded asset markup.');
    if (used.size !== paths.size) throw new Error('Each figure must be used by a scheduled card.');
    return figures;
}

export function validateConceptLedger(candidate, cardCount) {
    if (!Array.isArray(candidate.entryAssumptions) || !Array.isArray(candidate.conceptLedger) || !candidate.conceptLedger.length) throw new Error('Missing explicit entry assumptions or concept ledger.');
    const valid = n => Number.isInteger(n) && n >= 1 && n <= cardCount;
    const concepts = new Set();
    for (const row of candidate.conceptLedger) {
        if (!row.concept?.trim() || concepts.has(row.concept) || !row.explanation?.trim() || !valid(row.explanationCard) || !valid(row.retrievalCard) || row.retrievalCard < row.explanationCard || !Array.isArray(row.applicationCards) || row.applicationCards.some(n => !valid(n) || n < row.retrievalCard)) throw new Error('Invalid concept ledger sequence or card reference.');
        concepts.add(row.concept);
    }
}

function executable(name) {
    const result = spawnSync('/usr/bin/which', [name], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Missing isolated figure dependency: ${name}`);
    return realpathSync(result.stdout.trim());
}

export function figureSandboxProfile(root, texRoot, binary) {
    const quote = value => JSON.stringify(value);
    return `(version 1) (deny default)
(allow process-exec (literal ${quote(binary)}))
(allow sysctl-read)
(allow file-map-executable)
(allow process-info* (target self))
(allow file-read-metadata)
(allow mach-lookup)
(allow file-read* (literal ${quote(binary)}) (literal "/") (subpath "/System") (subpath "/private/var/db/dyld") (subpath "/private/preboot") (subpath "/Library/Apple") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/Library/Fonts") (subpath "/etc") (subpath "/private/etc") (subpath "/dev") (subpath ${quote(texRoot)}) (subpath ${quote(root)}))
(allow file-write* (subpath ${quote(root)}) (literal "/dev/null"))`;
}

// Generated TeX is untrusted code. Fail closed unless an OS sandbox is available;
// no shell, network, home directory, repository, provider credentials or old cards.
export function compileChapterFigures(candidate, chapterId) {
    const figures = validateChapterAssets(candidate, chapterId);
    if (!figures.length) return [];
    if (process.platform !== 'darwin') throw new Error('Generated TikZ requires the macOS isolated compiler on this runner.');
    const latex = executable('lualatex'), dvisvgm = executable('dvisvgm');
    const texRoot = path.resolve(path.dirname(latex), '../..');
    const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'flashcards-isolated-figures-')));
    const assets = [{ path: 'figures/tikz-style.tex', content: STYLE }];
    try {
        mkdirSync(path.join(root, 'figures'));
        writeFileSync(path.join(root, 'figures/tikz-style.tex'), STYLE);
        const env = { PATH: path.dirname(latex), HOME: root, TMPDIR: root, TEXMFHOME: root, TEXMFVAR: root,
            TEXMFCACHE: root, openin_any: 'a', openout_any: 'p', shell_escape: 'f', SOURCE_DATE_EPOCH: '0' };
        const run = (binary, args) => {
            const result = spawnSync('/usr/bin/sandbox-exec', ['-p', figureSandboxProfile(root, texRoot, binary), binary, ...args], { cwd: root, env, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
            if (result.error || result.status !== 0) throw new Error(`Isolated figure compilation failed (${result.status}/${result.signal}): ${result.error?.message || (result.stdout + result.stderr).slice(-2000)}`);
        };
        for (const figure of figures) {
            const relative = `figures/${chapterId}/${figure.id}`;
            const source = `% flashcards-title: ${figure.title.replace(/[\r\n]/g, ' ')}\n% flashcards-desc: ${figure.description.replace(/[\r\n]/g, ' ')}\n` +
                String.raw`\documentclass[dvisvgm,tikz,border=5pt]{standalone}
\input{figures/tikz-style.tex}
\begin{document}
` + figure.tikz + '\n\\end{document}\n';
            writeFileSync(path.join(root, `${figure.id}.tex`), source);
            run(latex, ['--fmt=lualatex', '--output-format=dvi', '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', `${figure.id}.tex`]);
            run(dvisvgm, ['--no-fonts', '--exact-bbox', '--optimize=all', '--verbosity=0', `--output=${figure.id}.svg`, `${figure.id}.dvi`]);
            const svg = decorateTikzSvg(readFileSync(path.join(root, `${figure.id}.svg`), 'utf8'), { title: figure.title, desc: figure.description }, relative + '.tex');
            if (!/viewBox=/.test(svg) || /<(?:script|foreignObject|image)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*['"](?!#)/i.test(svg)) throw new Error('Unsafe or incomplete generated SVG.');
            assets.push({ path: relative + '.tex', content: source }, { path: relative + '.svg', content: svg });
        }
        return assets;
    } finally { rmSync(root, { recursive: true, force: true }); }
}

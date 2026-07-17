import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePath } from './paths.js';

function escapeXml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

export function parseTikzMetadata(source) {
    const title = source.match(/^%\s*flashcards-title:\s*(.+)$/m)?.[1]?.trim();
    const desc = source.match(/^%\s*flashcards-desc:\s*(.+)$/m)?.[1]?.trim();
    if (!title || !desc) {
        throw new Error('TikZ source requires non-empty flashcards-title and flashcards-desc comments.');
    }
    return { title, desc };
}

export function decorateTikzSvg(svg, metadata, sourcePath) {
    svg = svg.replace(/<defs>\n([\s\S]*?)\n<\/defs>/, (match, body) => {
        const definitions = body.split('\n').filter(Boolean);
        if (!definitions.every(line => /^\s*<(?:path|use)\b.*\/>\s*$/.test(line))) {
            return match;
        }
        definitions.sort((a, b) => a.localeCompare(b));
        return '<defs>\n' + definitions.join('\n') + '\n</defs>';
    });
    const openTag = svg.match(/<svg\b[^>]*>/)?.[0];
    if (!openTag) throw new Error('dvisvgm output does not contain an SVG root element.');
    const accessibleTag = openTag.replace(
        '<svg',
        "<svg role='img' aria-labelledby='title desc'"
    );
    const sourceComment = '<!-- TikZ source: ' + escapeXml(sourcePath) +
        '; regenerate with flashcards deck render-figures. -->';
    const accessibility = "<title id='title'>" + escapeXml(metadata.title) +
        "</title>\n<desc id='desc'>" + escapeXml(metadata.desc) + '</desc>';
    return svg.replace(openTag, accessibleTag + '\n' + sourceComment + '\n' + accessibility);
}

function findTikzSources(dir) {
    if (!existsSync(dir)) return [];
    const sources = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            sources.push(...findTikzSources(target));
        } else if (entry.isFile() && entry.name.endsWith('.tex') && entry.name !== 'tikz-style.tex') {
            sources.push(target);
        }
    }
    return sources.sort((a, b) => a.localeCompare(b));
}

function run(command, args, cwd, env = process.env) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') {
        throw new Error('Missing TikZ rendering dependency: ' + command);
    }
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim();
        throw new Error(command + ' failed' + (detail ? ': ' + detail : ''));
    }
}

function renderOne(deckPath, sourcePath) {
    const source = readFileSync(sourcePath, 'utf8');
    const metadata = parseTikzMetadata(source);
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'flashcards-tikz-'));
    const base = path.basename(sourcePath, '.tex');
    try {
        const home = path.join(temporary, 'home');
        const texmfVar = path.join(temporary, 'texmf-var');
        const texmfCache = path.join(temporary, 'texmf-cache');
        mkdirSync(home);
        mkdirSync(texmfVar);
        mkdirSync(texmfCache);
        const env = {
            ...process.env,
            HOME: home,
            TEXMFVAR: texmfVar,
            TEXMFCACHE: texmfCache,
            // Sources deliberately load the shared style as
            // \input{figures/tikz-style.tex}. Running from the isolated
            // temporary directory keeps every TeX write there; this search
            // path still lets TeX resolve deck-owned inputs read-only.
            TEXINPUTS: `${deckPath}//:${process.env.TEXINPUTS || ''}`
        };
        run('lualatex', [
            '--output-format=dvi',
            '--interaction=batchmode',
            '--halt-on-error',
            '--output-directory=' + temporary,
            sourcePath
        ], temporary, env);
        const dviPath = path.join(temporary, base + '.dvi');
        const svgPath = path.join(temporary, base + '.svg');
        run('dvisvgm', [
            '--no-fonts',
            '--exact-bbox',
            '--optimize=all',
            '--verbosity=0',
            '--output=' + svgPath,
            dviPath
        ], temporary, env);
        const relativeSource = path.relative(deckPath, sourcePath);
        return decorateTikzSvg(readFileSync(svgPath, 'utf8'), metadata, relativeSource);
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
}

export function renderTikzFigures(inputPath, { check = false, quiet = false } = {}) {
    const deckPath = resolvePath(inputPath);
    if (!existsSync(path.join(deckPath, 'flashcards'))) {
        throw new Error('Not a flashcard deck (missing flashcards/): ' + deckPath);
    }
    const sources = findTikzSources(path.join(deckPath, 'figures'));
    const changed = [];
    for (const sourcePath of sources) {
        const targetPath = sourcePath.replace(/\.tex$/, '.svg');
        const rendered = renderOne(deckPath, sourcePath);
        const current = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;
        if (current === rendered) continue;
        changed.push(path.relative(deckPath, targetPath));
        if (!check) writeFileSync(targetPath, rendered);
    }
    if (!quiet) {
        if (check && changed.length) {
            console.error('Out-of-date TikZ figures: ' + changed.join(', '));
        } else {
            console.log((check ? 'Checked' : 'Rendered') + ' ' + sources.length +
                ' TikZ figure(s)' + (changed.length ? '; updated ' + changed.length : '') + '.');
        }
    }
    return { deckPath, sources: sources.length, changed, status: check && changed.length ? 1 : 0 };
}

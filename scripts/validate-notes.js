#!/usr/bin/env node
/**
 * Validate a notes collection against the app's real parser, hasher, and KaTeX.
 *
 * Checks per file:
 *   - parses with zero parser warnings (warnings mean silently dropped cards)
 *   - every LaTeX segment renders under KaTeX (code fences/spans stripped first)
 *   - every image link resolves; images have non-empty alt text
 *   - cloze lints: deletion inside $...$ math (C4), deletion > 60 chars,
 *     > 2 deletions per block, leftover unmatched '['
 *   - frontmatter/filename lints (F1/F2 of CARD_STANDARD.md)
 *
 * Emits a machine-readable JSON report including a full hash inventory
 * (deck, file, type, hash, excerpt) — the baseline for history-safety diffs.
 *
 * Usage: node scripts/validate-notes.js [rootDir] [--out report.json] [--quiet]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import { parseDeck } from '../src/parser.js';
import { hashCard, familyHash } from '../src/hasher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
const root = path.resolve(positional[0] || path.join(process.env.HOME, 'notes'));

const SKIP_DIRS = new Set(['.git', '.venv', 'node_modules', 'sources', 'references', '.claude', 'code']);

/** Find deck directories: any dir containing a flashcards/ subdir with .md files. */
function findDecks(dir, depth = 0, decks = []) {
    if (depth > 4) return decks;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return decks;
    }
    const hasFlashcards = entries.some(e => e.isDirectory() && e.name === 'flashcards');
    if (hasFlashcards) {
        const files = fs.readdirSync(path.join(dir, 'flashcards'))
            .filter(f => f.endsWith('.md'))
            .sort((a, b) => a.localeCompare(b));
        if (files.length > 0) {
            decks.push({ name: path.basename(dir), dir, files });
        }
        return decks; // decks don't nest
    }
    for (const e of entries) {
        if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
            findDecks(path.join(dir, e.name), depth + 1, decks);
        }
    }
    return decks;
}

/** Strip fenced code blocks and inline code spans, preserving offsets is not needed — we only lint the stripped text. */
function stripCode(text) {
    return text
        .replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length));
}

/** Extract math segments from text (code already stripped). Returns { segments, leftoverDollars }. */
function extractMath(text) {
    const segments = [];
    let work = text.replace(/\\\$/g, '  '); // escaped dollars are literal
    work = work.replace(/\$\$([\s\S]*?)\$\$/g, (m, body) => {
        segments.push({ body, display: true });
        return ' '.repeat(m.length);
    });
    work = work.replace(/\$([^$\n]+?)\$/g, (m, body) => {
        segments.push({ body, display: false });
        return ' '.repeat(m.length);
    });
    const leftoverDollars = [];
    const lines = work.split('\n');
    lines.forEach((line, i) => {
        if (line.includes('$')) leftoverDollars.push(i + 1);
    });
    return { segments, leftoverDollars };
}

/** Byte-offset ranges of $...$ / $$...$$ spans within a string (to match cloze byte offsets). */
function mathByteRanges(text) {
    const enc = new TextEncoder();
    const ranges = [];
    const stripped = stripCode(text).replace(/\\\$/g, '  ');
    const re = /\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
        const startByte = enc.encode(stripped.slice(0, m.index)).length;
        const lenBytes = enc.encode(m[0]).length;
        ranges.push([startByte, startByte + lenBytes - 1]);
    }
    return ranges;
}

function byteSlice(str, start, endInclusive) {
    const bytes = new TextEncoder().encode(str);
    return new TextDecoder().decode(bytes.slice(start, endInclusive + 1));
}

function excerptOf(card) {
    const text = card.type === 'basic' ? card.content.question
        : card.type === 'problem' ? card.content.problem
        : card.content.text;
    return text.replace(/\s+/g, ' ').slice(0, 80);
}

function checkFrontmatter(raw, fileName, metadata) {
    const lints = [];
    if (!raw.trimStart().startsWith('+++')) {
        lints.push({ rule: 'F1', msg: 'missing TOML +++ frontmatter' });
        return lints;
    }
    const prefixMatch = fileName.match(/^(\d+)_/);
    if (!prefixMatch) {
        lints.push({ rule: 'F2', msg: 'filename lacks NN_ prefix' });
    } else if (prefixMatch[1].length < 2) {
        lints.push({ rule: 'F2', msg: `filename prefix '${prefixMatch[1]}_' not zero-padded` });
    }
    if (metadata.order === null) {
        lints.push({ rule: 'F1', msg: 'frontmatter missing order' });
    } else if (prefixMatch && parseInt(prefixMatch[1], 10) !== metadata.order) {
        lints.push({ rule: 'F1', msg: `order=${metadata.order} does not match filename prefix ${prefixMatch[1]}` });
    }
    if (!metadata.subject) lints.push({ rule: 'F1', msg: 'frontmatter missing subject' });
    if (!metadata.tags || metadata.tags.length === 0) lints.push({ rule: 'F1', msg: 'frontmatter missing tags' });
    if (metadata.name) lints.push({ rule: 'F1', msg: "frontmatter has dead 'name' field" });
    return lints;
}

// --- main ---

const decks = findDecks(root);
const report = {
    generatedAt: new Date().toISOString(),
    root,
    decks: [],
    summary: { decks: decks.length, files: 0, cards: 0, byType: { basic: 0, cloze: 0, problem: 0 },
               parserWarnings: 0, katexErrors: 0, imageErrors: 0, clozeLints: 0, frontmatterLints: 0 }
};

const origWarn = console.warn;
console.warn = () => {}; // parser is chatty about warnings it also returns

for (const deck of decks) {
    const deckReport = { deck: deck.name, path: deck.dir, files: [], hashInventory: [] };

    for (const file of deck.files) {
        const filePath = path.join(deck.dir, 'flashcards', file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const fileReport = { file, counts: { basic: 0, cloze: 0, problem: 0 },
                             parserWarnings: [], katexErrors: [], imageErrors: [], clozeLints: [], frontmatterLints: [] };

        let parsed;
        try {
            parsed = parseDeck(raw, file);
        } catch (err) {
            fileReport.parserWarnings.push(`FATAL: ${err.message}`);
            deckReport.files.push(fileReport);
            continue;
        }
        const { cards, metadata } = parsed;
        fileReport.parserWarnings.push(...(cards.warnings || []));

        for (const card of cards) {
            fileReport.counts[card.type]++;
            deckReport.hashInventory.push({
                file, type: card.type, hash: hashCard(card), excerpt: excerptOf(card)
            });
        }

        // KaTeX validation on the whole file body (code stripped)
        const stripped = stripCode(raw);
        const { segments, leftoverDollars } = extractMath(stripped);
        for (const seg of segments) {
            try {
                katex.renderToString(seg.body, { displayMode: seg.display, throwOnError: true });
            } catch (err) {
                fileReport.katexErrors.push({ snippet: seg.body.slice(0, 100), error: String(err.message || err).slice(0, 200) });
            }
        }
        if (leftoverDollars.length > 0) {
            fileReport.katexErrors.push({ snippet: `unpaired '$' on stripped-text lines: ${leftoverDollars.slice(0, 10).join(', ')}`, error: 'possible unbalanced math delimiters (or literal $ outside code spans)', info: true });
        }

        // Image links
        const imgRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
        let im;
        while ((im = imgRe.exec(raw)) !== null) {
            const [, alt, src] = im;
            if (/^https?:/.test(src)) continue;
            const resolved = path.resolve(path.join(deck.dir, 'flashcards'), src);
            if (!fs.existsSync(resolved)) {
                fileReport.imageErrors.push({ src, msg: 'missing image file' });
            }
            if (!alt.trim()) {
                fileReport.imageErrors.push({ src, msg: 'empty alt text' });
            }
        }

        // Cloze lints — group cloze cards by family (same block text)
        const families = new Map();
        for (const card of cards) {
            if (card.type !== 'cloze') continue;
            const fam = familyHash(card);
            if (!families.has(fam)) families.set(fam, { text: card.content.text, deletions: [] });
            families.get(fam).deletions.push([card.content.start, card.content.end]);
        }
        for (const { text, deletions } of families.values()) {
            if (deletions.length > 2) {
                fileReport.clozeLints.push({ rule: 'C1', msg: `${deletions.length} deletions in one block`, excerpt: text.slice(0, 80) });
            }
            const ranges = mathByteRanges(text);
            for (const [start, end] of deletions) {
                const delText = byteSlice(text, start, end);
                if (delText.length > 60) {
                    fileReport.clozeLints.push({ rule: 'C1', msg: `deletion ${delText.length} chars`, excerpt: delText.slice(0, 80) });
                }
                // A deletion that fully CONTAINS math spans (e.g. [$2x$]) is fine.
                // Flag: deletion inside a math span (spurious card from bracket notation)
                // or partially crossing a math boundary (mis-spanned deletion).
                for (const [ms, me] of ranges) {
                    if (start > ms && end < me) {
                        fileReport.clozeLints.push({ rule: 'C4', msg: 'cloze deletion inside $...$ math (spurious card from bracket notation)', excerpt: delText.slice(0, 80) });
                        break;
                    }
                    const overlaps = start <= me && end >= ms;
                    const contains = start <= ms && end >= me;
                    if (overlaps && !contains) {
                        fileReport.clozeLints.push({ rule: 'C4', msg: 'cloze deletion partially crosses $...$ math boundary (mis-span)', excerpt: delText.slice(0, 80) });
                        break;
                    }
                }
                const dollarCount = (delText.match(/\$/g) || []).length;
                if (dollarCount % 2 === 1) {
                    fileReport.clozeLints.push({ rule: 'C4', msg: 'odd number of $ inside deletion (mis-span suspected)', excerpt: delText.slice(0, 80) });
                }
            }
            // Unmatched '[' heuristic: brackets outside images should pair up
            const nonImg = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
            const opens = (nonImg.match(/\[/g) || []).length;
            const closes = (nonImg.match(/\]/g) || []).length;
            if (opens !== closes) {
                fileReport.clozeLints.push({ rule: 'C4', msg: `unbalanced brackets in cloze block (${opens} '[' vs ${closes} ']')`, excerpt: text.slice(0, 80) });
            }
        }

        fileReport.frontmatterLints = checkFrontmatter(raw, file, metadata);

        report.summary.files++;
        report.summary.cards += cards.length;
        for (const t of ['basic', 'cloze', 'problem']) report.summary.byType[t] += fileReport.counts[t];
        report.summary.parserWarnings += fileReport.parserWarnings.length;
        report.summary.katexErrors += fileReport.katexErrors.filter(e => !e.info).length;
        report.summary.imageErrors += fileReport.imageErrors.length;
        report.summary.clozeLints += fileReport.clozeLints.length;
        report.summary.frontmatterLints += fileReport.frontmatterLints.length;

        deckReport.files.push(fileReport);
    }
    report.decks.push(deckReport);
}

console.warn = origWarn;

if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
}

// Human summary
const s = report.summary;
console.log(`Validated ${s.files} files in ${s.decks} decks under ${root}`);
console.log(`Cards: ${s.cards} (basic ${s.byType.basic}, cloze ${s.byType.cloze}, problem ${s.byType.problem})`);
console.log(`Parser warnings: ${s.parserWarnings} | KaTeX errors: ${s.katexErrors} | image errors: ${s.imageErrors} | cloze lints: ${s.clozeLints} | frontmatter lints: ${s.frontmatterLints}`);

if (!quiet) {
    for (const d of report.decks) {
        for (const f of d.files) {
            const issues = [];
            f.parserWarnings.forEach(w => issues.push(`  PARSE  ${w}`));
            f.katexErrors.filter(e => !e.info).forEach(e => issues.push(`  KATEX  ${e.snippet} → ${e.error}`));
            f.imageErrors.forEach(e => issues.push(`  IMAGE  ${e.src}: ${e.msg}`));
            f.clozeLints.forEach(e => issues.push(`  CLOZE  [${e.rule}] ${e.msg} :: ${e.excerpt}`));
            f.frontmatterLints.forEach(e => issues.push(`  FRONT  [${e.rule}] ${e.msg}`));
            if (issues.length) {
                console.log(`\n${d.deck}/${f.file}`);
                issues.forEach(i => console.log(i));
            }
        }
    }
}

const hardFailures = s.parserWarnings + s.katexErrors + s.imageErrors;
process.exit(hardFailures > 0 ? 1 : 0);

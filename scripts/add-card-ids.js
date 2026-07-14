#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { annotateCardIds } from '../src/card-id-annotator.js';

const args = process.argv.slice(2);
const check = args.includes('--check');
const targets = args.filter(arg => arg !== '--check');

if (targets.length === 0) {
    console.error('Usage: node scripts/add-card-ids.js [--check] <markdown-file-or-directory> [...]');
    process.exitCode = 2;
} else {
    const files = [];
    async function collect(target) {
        const info = await stat(target);
        if (info.isDirectory()) {
            for (const name of (await readdir(target)).sort()) {
                await collect(path.join(target, name));
            }
        } else if (target.endsWith('.md')) {
            files.push(target);
        }
    }
    for (const target of targets) await collect(path.resolve(target));

    let totalBlocks = 0;
    let totalCards = 0;
    for (const file of files) {
        const markdown = await readFile(file, 'utf8');
        const result = annotateCardIds(
            markdown,
            file,
            () => `card-${randomUUID()}`
        );
        totalBlocks += result.addedBlocks;
        totalCards += result.addedCards;
        if (!check && result.addedBlocks > 0) await writeFile(file, result.markdown);
    }

    const verb = check ? 'missing' : 'added';
    console.log(`${verb} stable IDs for ${totalBlocks} card block(s) / ${totalCards} schedulable card(s) across ${files.length} file(s)`);
    if (check && totalBlocks > 0) process.exitCode = 1;
}

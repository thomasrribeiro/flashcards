import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { FLASHCARDS_ROOT, resolvePath } from './paths.js';

function runNode(script, args, options = {}) {
    const result = spawnSync(process.execPath, [path.join(FLASHCARDS_ROOT, script), ...args], {
        cwd: options.cwd || FLASHCARDS_ROOT,
        encoding: 'utf8',
        stdio: options.capture ? 'pipe' : 'inherit'
    });
    if (result.error) throw new Error(result.error.message);
    return result;
}

function requireDeckPath(deckPath) {
    if (!existsSync(path.join(deckPath, 'flashcards'))) {
        throw new Error(`Not a flashcard deck (missing flashcards/): ${deckPath}`);
    }
}

export function validateDeck(inputPath, { outputPath, quiet = false, capture = false } = {}) {
    const deckPath = resolvePath(inputPath);
    requireDeckPath(deckPath);
    const args = [deckPath];
    if (outputPath) {
        const resolvedOutput = resolvePath(outputPath);
        mkdirSync(path.dirname(resolvedOutput), { recursive: true });
        args.push('--out', resolvedOutput);
    }
    if (quiet) args.push('--quiet');
    const result = runNode('scripts/validate-notes.js', args, { capture });
    return { ...result, deckPath };
}

export function stabilizeDeck(inputPath, { check = false, capture = false } = {}) {
    const deckPath = resolvePath(inputPath);
    requireDeckPath(deckPath);
    const args = [];
    if (check) args.push('--check');
    args.push(path.join(deckPath, 'flashcards'));
    const result = runNode('scripts/add-card-ids.js', args, { capture });
    return { ...result, deckPath };
}

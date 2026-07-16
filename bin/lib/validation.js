import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FLASHCARDS_ROOT, resolvePath } from './paths.js';
import { resolvePrerequisiteGraph } from './prerequisites.js';

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
    const prerequisiteGraph = resolvePrerequisiteGraph(deckPath);
    const prerequisiteReport = {
        valid: prerequisiteGraph.errors.length === 0,
        schemaVersion: prerequisiteGraph.root?.schemaVersion ?? null,
        deck: prerequisiteGraph.root?.id ?? null,
        deckDependencies: prerequisiteGraph.root?.deckDependencies || [],
        assumedTools: prerequisiteGraph.root?.assumedTools || [],
        chapters: prerequisiteGraph.chapters.map(chapter => ({
            id: chapter.id,
            order: chapter.order,
            mode: chapter.prerequisiteMode,
            prerequisites: chapter.prerequisites,
            provides: chapter.provides,
            resolvedLocalDependencies: chapter.dependencies
        })),
        warnings: prerequisiteGraph.warnings,
        errors: prerequisiteGraph.errors
    };
    if (outputPath && existsSync(resolvePath(outputPath))) {
        const resolvedOutput = resolvePath(outputPath);
        const report = JSON.parse(readFileSync(resolvedOutput, 'utf8'));
        report.prerequisites = prerequisiteReport;
        writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
    }
    let stdout = result.stdout;
    if (prerequisiteGraph.errors.length) {
        const message = `Prerequisite errors: ${prerequisiteGraph.errors.length}\n${prerequisiteGraph.errors.map(error => `  - ${error}`).join('\n')}\n`;
        if (capture) stdout = `${stdout || ''}${message}`;
        else console.error(message.trimEnd());
    } else if (!quiet && !capture) {
        console.log(`Prerequisite graph: valid (${prerequisiteGraph.chapters.length} chapter(s), ${prerequisiteGraph.externalDecks.length} external deck(s))`);
    }
    return {
        ...result,
        stdout,
        status: result.status !== 0 || prerequisiteGraph.errors.length ? 1 : 0,
        deckPath,
        prerequisiteGraph,
        prerequisiteReport
    };
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

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { FLASHCARDS_ROOT, resolvePath } from './paths.js';
import { resolvePrerequisiteGraph } from './prerequisites.js';
import { parseDeck } from '../../src/parser.js';
import { cardMarkupErrors } from '../../src/card-markup-policy.js';
import { annotateNamespaceAliases } from '../../src/card-id-annotator.js';
import { validateGenerationProvenance } from './generation-provenance.js';

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

function changedChapterPaths(workspacePath) {
    const commands = [
        ['diff', '--name-only', 'HEAD', '--', 'flashcards'],
        ['ls-files', '--others', '--exclude-standard', '--', 'flashcards']
    ];
    const changed = new Set();
    for (const args of commands) {
        const result = spawnSync('git', args, { cwd: workspacePath, encoding: 'utf8' });
        if (result.status !== 0) {
            throw new Error(
                `Unable to identify generated chapters: ${(result.stderr || result.stdout || '').trim()}`
            );
        }
        for (const relativePath of result.stdout.split('\n').map(value => value.trim()).filter(Boolean)) {
            if (/^flashcards\/\d{2}_.+\.md$/.test(relativePath)) changed.add(relativePath);
        }
    }
    return [...changed].sort();
}

export function validateGeneratedChapterMarkup(workspacePath) {
    const failures = [];
    for (const relativePath of changedChapterPaths(workspacePath)) {
        const chapterPath = path.join(workspacePath, relativePath);
        const parsed = parseDeck(readFileSync(chapterPath, 'utf8'), path.basename(relativePath));
        for (const card of parsed.cards) {
            for (const error of cardMarkupErrors(card, { generated: true })) {
                failures.push(`${relativePath} [${error.rule}] ${error.msg} :: ${error.excerpt}`);
            }
        }
    }
    if (failures.length) {
        throw new Error(`Generated chapter markup validation failed:\n- ${failures.join('\n- ')}`);
    }
    return [];
}

export function chapterCurriculumCardSignatures(inputPath) {
    const deckPath = resolvePath(inputPath);
    requireDeckPath(deckPath);
    return readdirSync(path.join(deckPath, 'flashcards'))
        .filter(filename => /^\d{2}_.+\.md$/.test(filename))
        .flatMap(filename => parseDeck(
            readFileSync(path.join(deckPath, 'flashcards', filename), 'utf8'),
            filename
        ).cards.map(card => JSON.stringify({
            filename,
            type: card.type,
            stableIdBase: card.stableIdBase || null,
            stableId: card.stableId || null,
            legacyHashes: [...(card.legacyHashes || [])].sort(),
            content: card.content
        })))
        .sort();
}

function isStagedExternalLookupError(error, stagedExternalDecks) {
    if (!String(error).startsWith('Missing deck.toml: ')) return false;
    const normalized = String(error).replaceAll('\\', '/');
    return stagedExternalDecks.some(deckId => normalized.endsWith(`/${deckId}`));
}

export function validateChapterCurriculumPlan(inputPath, {
    baselineCards = null,
    stagedExternalDecks = []
} = {}) {
    const deckPath = resolvePath(inputPath);
    const validation = validateDeck(deckPath, { quiet: true, capture: true });
    const failures = validation.prerequisiteGraph.errors.filter(error => (
        !isStagedExternalLookupError(error, stagedExternalDecks)
    ));
    if (!validation.prerequisiteGraph.chapters.length) {
        failures.push('the chapter curriculum does not contain any ordered chapters');
    }
    const currentCards = chapterCurriculumCardSignatures(deckPath);
    if (Array.isArray(baselineCards)) {
        if (JSON.stringify(currentCards) !== JSON.stringify([...baselineCards].sort())) {
            failures.push('chapter planning changed existing scheduled card content');
        }
    } else if (currentCards.length) {
        for (const chapter of validation.prerequisiteGraph.chapters) {
            const parsed = parseDeck(readFileSync(chapter.path, 'utf8'), chapter.filename);
            if (parsed.cards.length) {
                failures.push(`${chapter.filename} contains ${parsed.cards.length} scheduled card(s); chapter planning must not author content`);
            }
        }
    }
    if (validation.status !== 0 && !validation.prerequisiteGraph.errors.length) {
        failures.push('deck validation did not pass');
    }
    if (failures.length) {
        throw new Error(`Chapter curriculum validation failed:\n- ${failures.join('\n- ')}`);
    }
    return {
        deckPath,
        chapters: validation.prerequisiteGraph.chapters.map(chapter => chapter.id),
        preservedCards: currentCards.length
    };
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
    const generationProvenanceErrors = validateGenerationProvenance(deckPath);
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
    if (generationProvenanceErrors.length) {
        const message = `Generation provenance errors: ${generationProvenanceErrors.length}\n${generationProvenanceErrors.map(error => `  - ${error}`).join('\n')}\n`;
        if (capture) stdout = `${stdout || ''}${message}`;
        else console.error(message.trimEnd());
    } else if (existsSync(path.join(deckPath, 'generation.toml')) && !quiet && !capture) {
        console.log('Generation provenance: valid');
    }
    return {
        ...result,
        stdout,
        status: result.status !== 0 || prerequisiteGraph.errors.length || generationProvenanceErrors.length ? 1 : 0,
        deckPath,
        prerequisiteGraph,
        prerequisiteReport,
        generationProvenanceErrors
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

function markdownFilesUnder(directory) {
    return readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) return markdownFilesUnder(entryPath);
            return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
        })
        .sort();
}

export function preserveDeckNamespace(inputPath, namespace, { check = false } = {}) {
    const deckPath = resolvePath(inputPath);
    requireDeckPath(deckPath);
    let addedBlocks = 0;
    let addedCards = 0;
    const changedFiles = [];

    for (const chapterPath of markdownFilesUnder(path.join(deckPath, 'flashcards'))) {
        const markdown = readFileSync(chapterPath, 'utf8');
        const annotated = annotateNamespaceAliases(markdown, chapterPath, namespace);
        addedBlocks += annotated.addedBlocks;
        addedCards += annotated.addedCards;
        if (annotated.markdown === markdown) continue;
        changedFiles.push(path.relative(deckPath, chapterPath));
        if (!check) writeFileSync(chapterPath, annotated.markdown);
    }

    return { deckPath, namespace, addedBlocks, addedCards, changedFiles, check };
}

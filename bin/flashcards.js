#!/usr/bin/env node

import { Command, Option } from 'commander';
import { addChapter, createDeck, ensureSubject } from './lib/scaffold.js';
import { codexDoctor, formatInvocation, runDeckAgent, runSubjectAgent } from './lib/codex.js';
import { buildContextManifest, buildSubjectContextManifest, formatContextManifest } from './lib/context.js';
import { approvePilot } from './lib/pilot.js';
import {
    formatPrerequisiteGraph,
    migratePrerequisites,
    resolvePrerequisiteGraph
} from './lib/prerequisites.js';
import { renderTikzFigures } from './lib/figures.js';
import { resolveNotesRoot, resolvePath } from './lib/paths.js';
import { stabilizeDeck, validateDeck } from './lib/validation.js';

const program = new Command();

function collect(value, previous) {
    return [...previous, value];
}

function positiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Expected a positive integer, received: ${value}`);
    return parsed;
}

function handleError(error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
}

function addAgentOptions(command, { audit = false, build = false } = {}) {
    command
        .option('--non-interactive', 'Use codex exec in legacy --no-isolated mode')
        .option('--no-isolated', 'Use the legacy local workspace instead of a fresh staged run')
        .option('--model <model>', 'Override the model configured in Codex')
        .option('--reasoning-effort <effort>', 'Codex reasoning effort for an isolated run', 'high')
        .option('--instructions <text>', 'Append task-specific instructions')
        .option('--dry-run', 'Print the Codex command and prompt without running it');
    if (audit) {
        command
            .option('--report-only', 'Inspect the deck without modifying it')
            .option('--allow-dirty', 'Audit despite pre-existing uncommitted deck changes');
    }
    if (build) {
        command
            .option('--full', 'Build every chapter after explicit pilot approval')
            .addOption(new Option('--chapter <number>', 'Build only one ordered chapter').argParser(positiveInteger))
            .option('--fresh-chapter', 'Regenerate the selected chapter from a blank sandbox copy')
            .option('--fresh-pilot', 'Regenerate chapter 1 from a blank sandbox copy');
    }
    return command;
}

function executeAgent(mode, deckPath, options) {
    if (options.full && options.chapter) throw new Error('--full cannot be combined with --chapter.');
    if (options.freshChapter && !options.chapter) throw new Error('--fresh-chapter requires --chapter.');
    if (options.freshPilot && options.chapter && options.chapter !== 1) {
        throw new Error('--fresh-pilot cannot target a chapter other than 1.');
    }
    const chapterNumber = options.chapter || (options.freshPilot ? 1 : undefined);
    const buildScope = options.full ? 'full' : options.chapter ? 'chapter' : 'pilot';
    const result = runDeckAgent({
        mode,
        deckPath,
        nonInteractive: options.nonInteractive,
        reportOnly: options.reportOnly,
        model: options.model,
        extraInstructions: options.instructions,
        dryRun: options.dryRun,
        allowDirty: options.allowDirty,
        buildScope,
        chapterNumber,
        freshChapter: options.freshChapter,
        freshPilot: options.freshPilot,
        isolated: options.isolated,
        reasoningEffort: options.reasoningEffort
    });
    if (result.dryRun) {
        console.log('Preview only: a live isolated run replaces these source paths with hash-recorded staged copies.');
        console.log(formatInvocation(result.invocation));
        console.log('\nPrompt:\n');
        console.log(result.invocation.prompt);
    }
    if (result.status !== 0) process.exitCode = result.status;
}

program
    .name('flashcards')
    .description('Create, validate, build, and audit durable spaced-repetition decks')
    .version('3.3.0')
    .showSuggestionAfterError();

program
    .command('doctor')
    .description('Check deck paths and local Codex readiness')
    .option('--notes-root <path>', 'Notes collection root')
    .action(options => {
        const status = codexDoctor();
        console.log(`Notes root: ${resolveNotesRoot(options.notesRoot)}`);
        console.log(`Codex: ${status.installed ? status.version : 'not installed'}`);
        console.log(`Authentication: ${status.authenticated ? status.authStatus : 'not authenticated'}`);
        console.log(`Isolated-run model: ${status.configuredModel}`);
        console.log(`Authoring runtime: ${status.missingFiles.length ? `missing ${status.missingFiles.join(', ')}` : 'ready'}`);
        if (!status.installed || !status.authenticated || status.missingFiles.length) process.exitCode = 1;
    });

const subject = program.command('subject').description('Manage subject-level curriculum context');

subject
    .command('create <subject>')
    .description('Create and research a subject roadmap and authoring context')
    .option('--notes-root <path>', 'Notes collection root')
    .option('--title <title>', 'Human-readable subject title')
    .option('--no-agent', 'Create deterministic scaffold files without launching Codex')
    .option('--no-isolated', 'Use the legacy local workspace instead of a fresh staged run')
    .option('--model <model>', 'Override the model configured in Codex')
    .option('--reasoning-effort <effort>', 'Codex reasoning effort for an isolated run', 'high')
    .option('--instructions <text>', 'Append task-specific instructions')
    .option('--dry-run', 'Create the scaffold and print the Codex command and prompt')
    .action(async (subjectName, options) => {
        try {
            const result = await ensureSubject({ subject: subjectName, notesRoot: options.notesRoot, title: options.title });
            console.log(`Subject workspace: ${result.subjectPath}`);
            console.log(result.created.length ? `Created ${result.created.length} context file(s).` : 'Subject context already exists.');
            if (options.agent) {
                const agent = runSubjectAgent({
                    subjectPath: result.subjectPath,
                    model: options.model,
                    reasoningEffort: options.reasoningEffort,
                    extraInstructions: options.instructions,
                    dryRun: options.dryRun,
                    isolated: options.isolated
                });
                if (agent.dryRun) {
                    console.log('Preview only: a live isolated run replaces these source paths with hash-recorded staged copies.');
                    console.log(formatInvocation(agent.invocation));
                    console.log('\nPrompt:\n');
                    console.log(agent.invocation.prompt);
                }
                if (agent.runPath) console.log(`Isolated run record: ${agent.runPath}`);
                if (agent.status !== 0) process.exitCode = agent.status;
            }
        } catch (error) {
            handleError(error);
        }
    });

subject
    .command('context <subject-path>')
    .description('Show the exact ordered Markdown context used by subject creation')
    .option('--json', 'Print the manifest as JSON')
    .action((subjectPath, options) => {
        try {
            const manifest = buildSubjectContextManifest({ subjectPath });
            console.log(options.json ? JSON.stringify(manifest, null, 2) : formatContextManifest(manifest));
            if (manifest.summary.missingRequired) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

const deck = program.command('deck').description('Manage one Git repository per deck');

addAgentOptions(deck
    .command('create <subject> <deck>')
    .description('Create a standards-compliant deck repository')
    .option('--notes-root <path>', 'Notes collection root')
    .option('--level <level>', 'Learner level', 'introductory-college')
    .option('--description <text>', 'One-sentence deck purpose')
    .option('--prerequisite-deck <subject/deck>', 'Declare a prerequisite deck; repeat as needed', collect, [])
    .option('--assumed-tool <tool>', 'Declare a mastered mathematical/tool prerequisite; repeat as needed', collect, [])
    .option('-c, --chapter <name>', 'Create an initial chapter; repeat for multiple chapters', collect, [])
    .option('--no-git', 'Do not initialize a Git repository')
    .option('--no-agent', 'Create deterministic scaffold files without launching Codex'))
    .action(async (subjectName, deckName, options) => {
        try {
            const result = await createDeck({
                subject: subjectName,
                deck: deckName,
                notesRoot: options.notesRoot,
                level: options.level,
                description: options.description,
                initializeGit: options.git,
                chapters: options.chapter,
                prerequisiteDecks: options.prerequisiteDeck,
                assumedTools: options.assumedTool
            });
            console.log(`Created deck: ${result.deckPath}`);
            if (result.subjectFiles.length) console.log(`Created ${result.subjectFiles.length} missing subject context file(s).`);
            if (result.chapterResults.length) console.log(`Created ${result.chapterResults.length} initial chapter(s).`);
            if (result.gitInitialized) console.log('Initialized Git on branch master.');
            if (options.agent) {
                if (result.subjectFiles.length) {
                    const subjectAgent = runSubjectAgent({
                        subjectPath: result.subjectPath,
                        model: options.model,
                        reasoningEffort: options.reasoningEffort,
                        extraInstructions: options.instructions,
                        dryRun: options.dryRun,
                        isolated: options.isolated
                    });
                    if (subjectAgent.dryRun) {
                        console.log('Preview only: a live isolated run replaces these source paths with hash-recorded staged copies.');
                        console.log(formatInvocation(subjectAgent.invocation));
                        console.log('\nSubject prompt:\n');
                        console.log(subjectAgent.invocation.prompt);
                    }
                    if (subjectAgent.runPath) console.log(`Subject isolated run record: ${subjectAgent.runPath}`);
                    if (subjectAgent.status !== 0) {
                        process.exitCode = subjectAgent.status;
                        return;
                    }
                }
                executeAgent('build', result.deckPath, options);
            } else {
                console.log(`Next: flashcards deck build ${result.deckPath}`);
            }
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('add-chapter <deck-path> <name>')
    .description('Add an ordered chapter file and matching figure directory')
    .addOption(new Option('--order <number>', 'Explicit chapter order').argParser(positiveInteger))
    .option('--prerequisite <reference>', 'Add chapter:, concept:, deck:, or tool: prerequisite; repeat as needed', collect, [])
    .option('--provides <concept>', 'Declare a concept provided by this chapter; repeat as needed', collect, [])
    .option('--independent', 'Create the chapter with no default preceding-chapter edge')
    .action(async (deckPath, name, options) => {
        try {
            if (options.independent && options.prerequisite.length) {
                throw new Error('--independent cannot be combined with --prerequisite.');
            }
            const result = await addChapter({
                deckPath,
                name,
                order: options.order,
                prerequisites: options.independent
                    ? []
                    : options.prerequisite.length ? options.prerequisite : undefined,
                provides: options.provides
            });
            console.log(`Created ${result.filePath}`);
            console.log(`Created ${result.figurePath}`);
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('approve-pilot <deck-path>')
    .description('Record explicit approval of a validated novice-first pilot chapter')
    .action(deckPath => {
        try {
            const result = approvePilot(deckPath);
            console.log(`Approved pilot: ${result.chapter}`);
            console.log(`Cold-start audit: ${result.audit}`);
            console.log(`Next: flashcards deck build ${resolvePath(deckPath)} --full`);
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('context <deck-path>')
    .description('Show the exact ordered Markdown context used by a build or audit')
    .addOption(new Option('--mode <mode>', 'Agent operation').choices(['build', 'audit']).default('build'))
    .addOption(new Option('--chapter <number>', 'Resolve context for one ordered chapter').argParser(positiveInteger))
    .option('--json', 'Print the manifest as JSON')
    .action((deckPath, options) => {
        try {
            const manifest = buildContextManifest({ deckPath, mode: options.mode, chapterNumber: options.chapter });
            console.log(options.json ? JSON.stringify(manifest, null, 2) : formatContextManifest(manifest));
            if (manifest.summary.missingRequired) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('prerequisites <deck-path>')
    .description('Resolve and validate deck, chapter, concept, and tool prerequisites')
    .addOption(new Option('--chapter <number>', 'Show the transitive closure for one ordered chapter').argParser(positiveInteger))
    .option('--json', 'Print the resolved graph as JSON')
    .action((deckPath, options) => {
        try {
            const graph = resolvePrerequisiteGraph(deckPath);
            if (options.chapter && !graph.errors.length) {
                // Formatting resolves the requested closure and verifies the chapter exists.
                formatPrerequisiteGraph(graph, { chapter: options.chapter });
            }
            console.log(options.json
                ? JSON.stringify(graph, null, 2)
                : formatPrerequisiteGraph(graph, { chapter: options.chapter }));
            if (graph.errors.length) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('migrate-prerequisites <deck-path>')
    .description('Upgrade a legacy deck to explicit schema-v2 prerequisite metadata')
    .option('--check', 'Report files that require migration without changing them')
    .action((deckPath, options) => {
        try {
            const result = migratePrerequisites(deckPath, { check: options.check });
            if (result.changed.length) {
                console.log(`${options.check ? 'Would update' : 'Updated'} ${result.changed.length} file(s):`);
                for (const file of result.changed) console.log(`- ${file}`);
                if (options.check) process.exitCode = 1;
            } else {
                console.log('Prerequisite metadata is already explicit and current.');
            }
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('render-figures <deck-path>')
    .description('Compile authored TikZ sources to portable, accessible SVG assets')
    .option('--check', 'Fail when a generated SVG is missing or out of date')
    .option('--quiet', 'Print only errors')
    .action((deckPath, options) => {
        try {
            const result = renderTikzFigures(deckPath, { check: options.check, quiet: options.quiet });
            if (result.status !== 0) process.exitCode = result.status;
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('validate <deck-path>')
    .description('Validate prerequisites, parser behavior, metadata, math, figures, and identities')
    .option('--out <path>', 'Write the machine-readable JSON report')
    .option('--quiet', 'Print only the validation summary')
    .action((deckPath, options) => {
        try {
            const figures = renderTikzFigures(deckPath, { check: true, quiet: options.quiet });
            const identities = stabilizeDeck(deckPath, { check: true });
            const validation = validateDeck(deckPath, { outputPath: options.out, quiet: options.quiet });
            if (figures.status !== 0 || identities.status !== 0 || validation.status !== 0) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('stabilize <deck-path>')
    .description('Add stable card IDs before revising studied cards')
    .option('--check', 'Report missing IDs without changing files')
    .action((deckPath, options) => {
        try {
            const result = stabilizeDeck(deckPath, { check: options.check });
            if (result.status !== 0) process.exitCode = result.status;
        } catch (error) {
            handleError(error);
        }
    });

addAgentOptions(deck
    .command('build <deck-path>')
    .description('Build one pilot chapter by default; use --full after approval'), { build: true })
    .action((deckPath, options) => {
        try {
            executeAgent('build', resolvePath(deckPath), options);
        } catch (error) {
            handleError(error);
        }
    });

addAgentOptions(deck
    .command('audit <deck-path>')
    .description('Launch Codex to review and improve an entire existing deck'), { audit: true })
    .action((deckPath, options) => {
        try {
            executeAgent('audit', resolvePath(deckPath), options);
        } catch (error) {
            handleError(error);
        }
    });

await program.parseAsync(process.argv);

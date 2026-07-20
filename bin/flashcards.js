#!/usr/bin/env node

import { Command, Option } from 'commander';
import path from 'node:path';
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
import {
    formatGlobalCurriculum,
    resolveGlobalCurriculum,
    writeGlobalCurriculumIndex
} from './lib/global-curriculum.js';
import { materializeCurriculumDeck } from './lib/materialize.js';
import { buildRegistry, formatRegistry, resolveRegistry } from './lib/registry.js';
import { providerRunner, runExternalProviderJob } from './lib/agent-provider.js';
import { executionOptionsForGenerationJob } from './lib/generation-job.js';
import {
    abandonRegistryDraft,
    beginRegistryDraft,
    publishRegistryDraft
} from './lib/github-publisher.js';
import {
    listGenerationRequests,
    updateGenerationRequest
} from './lib/generation-requests.js';
import { resolveNotesRoot, resolvePath } from './lib/paths.js';
import { stabilizeDeck, validateDeck } from './lib/validation.js';
import {
    DECK_GRANULARITY_RANGES,
    formatSubjectCurriculum,
    resolveSubjectCurriculum,
    SUBJECT_DESTINATIONS,
    syncDeckPrerequisitesFromSubject,
    validateSubjectRoadmap
} from './lib/subject-curriculum.js';

const program = new Command();

function collect(value, previous) {
    return [...previous, value];
}

function positiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Expected a positive integer, received: ${value}`);
    return parsed;
}

function validateSubjectOptions(destination, focus) {
    for (const item of focus) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item)) {
            throw new Error(`--focus must use lowercase kebab-case: ${item}`);
        }
    }
    if (destination === 'research-specialization' && focus.length === 0) {
        throw new Error('--destination research-specialization requires at least one --focus.');
    }
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
    // Commander passes the command instance to action handlers. Absent option
    // names can therefore resolve to Command methods (for example `full()`),
    // and deck creation also has a repeatable `chapter` array. Only accept the
    // exact value types produced by the build command.
    const full = options.full === true;
    const chapter = Number.isInteger(options.chapter) ? options.chapter : undefined;
    const freshChapter = options.freshChapter === true;
    const freshPilot = options.freshPilot === true;
    if (full && chapter) throw new Error('--full cannot be combined with --chapter.');
    if (freshChapter && !chapter) throw new Error('--fresh-chapter requires --chapter.');
    if (freshPilot && chapter && chapter !== 1) {
        throw new Error('--fresh-pilot cannot target a chapter other than 1.');
    }
    const chapterNumber = chapter || (freshPilot ? 1 : undefined);
    const buildScope = full ? 'full' : chapter ? 'chapter' : 'pilot';
    const synced = syncDeckPrerequisitesFromSubject(deckPath, { allowMissing: true });
    if (synced.changed) {
        console.log(`Synced subject curriculum metadata (order ${synced.curriculumOrder}).`);
    }
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
        freshChapter,
        freshPilot,
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
    return result;
}

program
    .name('flashcards')
    .description('Create, validate, build, and audit durable spaced-repetition decks')
    .version('4.0.0')
    .showSuggestionAfterError();

const registry = program.command('registry').description('Validate and publish a portable curriculum registry');

registry
    .command('validate [path]')
    .description('Validate registry.toml and its complete cross-subject prerequisite DAG')
    .action(inputPath => {
        try {
            const result = resolveRegistry(inputPath || '.');
            console.log(formatRegistry(result));
            if (result.errors.length) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

registry
    .command('build [path]')
    .description('Compile a registry into its deterministic public JSON index')
    .action(inputPath => {
        try {
            const result = buildRegistry(inputPath || '.');
            console.log(formatRegistry(result.registry));
            console.log(`Wrote: ${result.outputPath}`);
        } catch (error) {
            handleError(error);
        }
    });

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

const curriculum = program.command('curriculum').description('Manage the collection-wide cross-subject prerequisite graph');

curriculum
    .command('validate [notes-root]')
    .description('Validate every subject manifest as one global prerequisite DAG')
    .action(notesRoot => {
        try {
            const graph = resolveGlobalCurriculum(resolveNotesRoot(notesRoot), { requireSubjects: true });
            console.log(formatGlobalCurriculum(graph));
            if (graph.errors.length) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

curriculum
    .command('audit [notes-root]')
    .description('Summarize cross-subject routes and validation findings')
    .action(notesRoot => {
        try {
            const graph = resolveGlobalCurriculum(resolveNotesRoot(notesRoot), { requireSubjects: true });
            console.log(formatGlobalCurriculum(graph, { audit: true }));
            if (graph.errors.length) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

curriculum
    .command('build [notes-root]')
    .description('Build a machine-readable global curriculum index')
    .option('-o, --output <path>', 'Output JSON path; defaults to <notes-root>/.flashcards/curriculum.json')
    .action((notesRoot, options) => {
        try {
            const root = resolveNotesRoot(notesRoot);
            const graph = resolveGlobalCurriculum(root, { requireSubjects: true });
            console.log(formatGlobalCurriculum(graph));
            if (graph.errors.length) {
                process.exitCode = 1;
                return;
            }
            const output = options.output || path.join(root, '.flashcards', 'curriculum.json');
            console.log(`Wrote: ${writeGlobalCurriculumIndex(graph, output)}`);
        } catch (error) {
            handleError(error);
        }
    });

addAgentOptions(curriculum
    .command('materialize <subject/deck>')
    .description('Create or resume a planned curriculum deck and build its isolated pilot')
    .option('--notes-root <path>', 'Notes collection root')
    .option('--no-agent', 'Create or synchronize the local deck without launching Codex'), { build: true })
    .action(async (reference, options) => {
        try {
            const result = await materializeCurriculumDeck(reference, {
                notesRoot: options.notesRoot
            });
            console.log(`${result.created ? 'Created' : 'Using'} deck: ${result.deckPath}`);
            console.log(`Curriculum order: ${result.curriculumOrder}`);
            console.log(`Direct prerequisites: ${result.prerequisites.length ? result.prerequisites.join(', ') : 'none'}`);
            console.log(`Recommended after: ${result.recommendedDecks.length ? result.recommendedDecks.join(', ') : 'none'}`);
            if (options.agent) {
                executeAgent('build', result.deckPath, options);
            } else {
                console.log(`Next: flashcards deck build ${result.deckPath}`);
            }
        } catch (error) {
            handleError(error);
        }
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
    .addOption(new Option('--destination <destination>', 'Curriculum destination')
        .choices(SUBJECT_DESTINATIONS)
        .default('whole-field'))
    .addOption(new Option('--deck-granularity <granularity>', 'Target size for one deck repository')
        .choices(Object.keys(DECK_GRANULARITY_RANGES))
        .default('course'))
    .option('--focus <area>', 'Graduate or research focus in lowercase kebab-case; repeat as needed', collect, [])
    .option('--instructions <text>', 'Append task-specific instructions')
    .option('--dry-run', 'Create the scaffold and print the Codex command and prompt')
    .action(async (subjectName, options) => {
        try {
            validateSubjectOptions(options.destination, options.focus);
            const result = await ensureSubject({
                subject: subjectName,
                notesRoot: options.notesRoot,
                title: options.title,
                destination: options.destination,
                deckGranularity: options.deckGranularity,
                focus: options.focus
            });
            console.log(`Subject workspace: ${result.subjectPath}`);
            console.log(result.created.length ? `Created ${result.created.length} context file(s).` : 'Subject context already exists.');
            if (options.agent) {
                const agent = runSubjectAgent({
                    subjectPath: result.subjectPath,
                    model: options.model,
                    reasoningEffort: options.reasoningEffort,
                    destination: options.destination,
                    deckGranularity: options.deckGranularity,
                    focus: options.focus,
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
            if (!process.exitCode) {
                const curriculum = resolveSubjectCurriculum(result.subjectPath, {
                    requireDecks: options.agent && !options.dryRun
                });
                console.log(formatSubjectCurriculum(curriculum));
                if (curriculum.errors.length) process.exitCode = 1;
            }
        } catch (error) {
            handleError(error);
        }
    });

subject
    .command('extend <subject-path>')
    .description('Extend an existing subject with graduate or research-level routes')
    .addOption(new Option('--destination <destination>', 'Destination for the extension')
        .choices(SUBJECT_DESTINATIONS))
    .addOption(new Option('--deck-granularity <granularity>', 'Target size for new deck repositories')
        .choices(Object.keys(DECK_GRANULARITY_RANGES)))
    .option('--focus <area>', 'Graduate or research focus in lowercase kebab-case; repeat as needed', collect, [])
    .option('--no-isolated', 'Use the legacy local workspace instead of a fresh staged run')
    .option('--model <model>', 'Override the model configured in Codex')
    .option('--reasoning-effort <effort>', 'Codex reasoning effort for an isolated run', 'high')
    .option('--instructions <text>', 'Append task-specific instructions')
    .option('--dry-run', 'Print the Codex command and extension prompt')
    .action((subjectPath, options) => {
        try {
            const current = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
            if (current.errors.length) {
                throw new Error(`Invalid subject curriculum:\n- ${current.errors.join('\n- ')}`);
            }
            const destination = options.destination || current.destination || 'whole-field';
            const deckGranularity = options.deckGranularity || current.deckGranularity || 'course';
            const focus = [...new Set([...(current.focus || []), ...options.focus])];
            validateSubjectOptions(destination, focus);
            const agent = runSubjectAgent({
                subjectPath: current.subjectPath,
                operation: 'extend',
                model: options.model,
                reasoningEffort: options.reasoningEffort,
                destination,
                deckGranularity,
                focus,
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
            if (agent.status !== 0) {
                process.exitCode = agent.status;
                return;
            }
            if (!options.dryRun) {
                const curriculum = resolveSubjectCurriculum(current.subjectPath, { requireDecks: true });
                console.log(formatSubjectCurriculum(curriculum));
                if (curriculum.errors.length) process.exitCode = 1;
            }
        } catch (error) {
            handleError(error);
        }
    });

subject
    .command('context <subject-path>')
    .description('Show the exact ordered context used by subject creation')
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

subject
    .command('prerequisites <subject-path>')
    .description('Show the AI-authored subject curriculum and resolved deck prerequisites')
    .option('--deck <deck>', 'Show one deck and its transitive prerequisite closure')
    .action((subjectPath, options) => {
        try {
            const graph = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
            console.log(formatSubjectCurriculum(graph, { deck: options.deck }));
            if (graph.errors.length) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

subject
    .command('validate <subject-path>')
    .description('Validate subject.toml and its synchronized ROADMAP.md deck table')
    .action(subjectPath => {
        try {
            const graph = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
            console.log(formatSubjectCurriculum(graph));
            const roadmapErrors = validateSubjectRoadmap(subjectPath, graph);
            if (roadmapErrors.length) {
                console.log('\nROADMAP.md errors:');
                roadmapErrors.forEach(error => console.log(`- ${error}`));
            }
            if (graph.errors.length || roadmapErrors.length) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

const deck = program.command('deck').description('Manage one Git repository per deck');

addAgentOptions(deck
    .command('create <subject> <deck>')
    .description('Create a standards-compliant deck repository')
    .option('--notes-root <path>', 'Notes collection root')
    .option('--level <level>', 'Override the learning level declared by the subject curriculum')
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
                    const subjectInstructions = [
                        `The requested deck is ${subjectName}/${deckName}. Include it in the proposed subject curriculum with its true direct prerequisites.`,
                        options.instructions
                    ].filter(Boolean).join(' ');
                    const subjectAgent = runSubjectAgent({
                        subjectPath: result.subjectPath,
                        model: options.model,
                        reasoningEffort: options.reasoningEffort,
                        extraInstructions: subjectInstructions,
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
                const synced = syncDeckPrerequisitesFromSubject(result.deckPath, { requireEntry: !options.dryRun });
                if (synced.inferred.length) {
                    console.log(`Inherited subject prerequisites: ${synced.inferred.join(', ')}`);
                }
                executeAgent('build', result.deckPath, options);
            } else {
                const synced = syncDeckPrerequisitesFromSubject(result.deckPath);
                if (synced.inferred.length) {
                    console.log(`Inherited subject prerequisites: ${synced.inferred.join(', ')}`);
                }
                console.log(`Next: flashcards deck build ${result.deckPath}`);
            }
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('sync-curriculum <deck-path>')
    .description('Copy current subject order and direct prerequisites into deck.toml')
    .action(deckPath => {
        try {
            const result = syncDeckPrerequisitesFromSubject(deckPath, { requireEntry: true });
            console.log(`Curriculum order: ${result.curriculumOrder}`);
            console.log(`Direct prerequisites: ${result.inferred.length ? result.inferred.join(', ') : 'none'}`);
            console.log(`Recommended after: ${result.inferredRecommended.length ? result.inferredRecommended.join(', ') : 'none'}`);
            console.log(result.changed ? 'Updated deck.toml.' : 'deck.toml is already current.');
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

const requests = program.command('requests').description('Process curriculum generation requests');

requests
    .command('list')
    .description('List generation requests queued from the PWA')
    .option('--worker-url <url>', 'Flashcards Worker URL')
    .action(async options => {
        try {
            const result = await listGenerationRequests({ workerUrl: options.workerUrl });
            if (!result.requests?.length) {
                console.log('No generation requests.');
                return;
            }
            for (const item of result.requests) {
                console.log(`${item.id}. ${item.job_type} ${item.request_key || item.deck_id || ''} [${item.status}]`);
            }
        } catch (error) {
            handleError(error);
        }
    });

addAgentOptions(requests
    .command('run')
    .description('Run the oldest queued request with its selected local provider and model')
    .option('--worker-url <url>', 'Flashcards Worker URL')
    .option('--notes-root <path>', 'Notes collection root for deck jobs')
    .option('--registry-root <path>', 'Curriculum registry checkout for subject-design jobs')
    .option('--agent-runner <command>', 'Executable implementing the generic local provider protocol'), { build: true })
    .action(async options => {
        let queued = null;
        let registryDraft = null;
        let registryRoot = null;
        try {
            const result = await listGenerationRequests({ workerUrl: options.workerUrl });
            queued = result.requests?.find(item => item.status === 'queued') || null;
            if (!queued) {
                console.log('No queued generation requests.');
                return;
            }
            await updateGenerationRequest(queued.id, { status: 'running' }, {
                workerUrl: options.workerUrl
            });
            const jobType = queued.job_type || 'deck-build';
            const payload = queued.payload || {};
            const runner = providerRunner(queued.provider_id, options.agentRunner);
            let agent;
            let resultUrl = null;
            if (jobType === 'subject-design') {
                registryRoot = resolvePath(options.registryRoot || '.');
                const registry = resolveRegistry(registryRoot);
                if (registry.errors.length) throw new Error(`Invalid registry:\n- ${registry.errors.join('\n- ')}`);
                registryDraft = beginRegistryDraft(registryRoot, queued.id);
                const destination = payload.destination || 'whole-field';
                const deckGranularity = payload.deckGranularity || 'course';
                const focus = Array.isArray(payload.focus) ? payload.focus : [];
                validateSubjectOptions(destination, focus);
                const subjectResult = await ensureSubject({
                    subject: payload.subject,
                    notesRoot: registry.subjectsRoot,
                    title: payload.title,
                    destination,
                    deckGranularity,
                    focus
                });
                agent = runner
                    ? runExternalProviderJob({ ...queued, payload }, {
                        workspacePath: subjectResult.subjectPath,
                        command: runner
                    })
                    : runSubjectAgent({
                        subjectPath: subjectResult.subjectPath,
                        model: queued.model_id || options.model,
                        reasoningEffort: payload.reasoningEffort || options.reasoningEffort,
                        destination,
                        deckGranularity,
                        focus,
                        extraInstructions: [
                            payload.instructions,
                            payload.proposedDecks?.length
                                ? `The user supplied this ordered visual draft. Treat it as an explicit design constraint, preserve valid existing identities, and change an edge only when validation or a documented false prerequisite requires it:\n${JSON.stringify(payload.proposedDecks, null, 2)}`
                                : null
                        ].filter(Boolean).join('\n\n'),
                        isolated: options.isolated
                    });
                if (agent.status !== 0) throw new Error(`Subject agent exited with status ${agent.status}`);
                buildRegistry(registryRoot);
                resultUrl = publishRegistryDraft(registryRoot, registryDraft, {
                    title: `Design ${payload.subject} curriculum`,
                    body: `Queued generation request ${queued.id}.\n\nThis is a draft for human review. No deck or cards are published by this pull request.`
                });
                registryDraft = null;
            } else {
                const deckId = payload.deckId || queued.deck_id;
                const materialized = await materializeCurriculumDeck(deckId, {
                    notesRoot: options.notesRoot
                });
                console.log(`${materialized.created ? 'Created' : 'Using'} deck: ${materialized.deckPath}`);
                const mode = jobType === 'deck-audit' ? 'audit' : 'build';
                const executionOptions = executionOptionsForGenerationJob(queued, payload, options);
                agent = runner
                    ? runExternalProviderJob({ ...queued, payload }, {
                        workspacePath: materialized.deckPath,
                        command: runner
                    })
                    : executeAgent(mode, materialized.deckPath, executionOptions);
            }
            if (agent.status !== 0) throw new Error(`Deck agent exited with status ${agent.status}`);
            await updateGenerationRequest(queued.id, { status: 'needs-review', resultUrl }, {
                workerUrl: options.workerUrl
            });
            console.log(`Request ${queued.id} is ready for human review${resultUrl ? `: ${resultUrl}` : '.'}`);
        } catch (error) {
            if (registryDraft && registryRoot) abandonRegistryDraft(registryRoot, registryDraft);
            if (queued) {
                await updateGenerationRequest(queued.id, {
                    status: 'failed',
                    error: error.message
                }, { workerUrl: options.workerUrl }).catch(() => {});
            }
            handleError(error);
        }
    });

await program.parseAsync(process.argv);

#!/usr/bin/env node

import { Command, Option } from 'commander';
import { addChapter, createDeck, ensureSubject } from './lib/scaffold.js';
import { codexDoctor, formatInvocation, runDeckAgent, runSubjectAgent } from './lib/codex.js';
import { buildContextManifest, buildSubjectContextManifest, formatContextManifest } from './lib/context.js';
import { approvePilot } from './lib/pilot.js';
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
    if (build) command.option('--full', 'Build every chapter after explicit pilot approval');
    return command;
}

function executeAgent(mode, deckPath, options) {
    const result = runDeckAgent({
        mode,
        deckPath,
        nonInteractive: options.nonInteractive,
        reportOnly: options.reportOnly,
        model: options.model,
        extraInstructions: options.instructions,
        dryRun: options.dryRun,
        allowDirty: options.allowDirty,
        buildScope: options.full ? 'full' : 'pilot',
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
    .version('3.0.0')
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
                chapters: options.chapter
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
    .action(async (deckPath, name, options) => {
        try {
            const result = await addChapter({ deckPath, name, order: options.order });
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
    .option('--json', 'Print the manifest as JSON')
    .action((deckPath, options) => {
        try {
            const manifest = buildContextManifest({ deckPath, mode: options.mode });
            console.log(options.json ? JSON.stringify(manifest, null, 2) : formatContextManifest(manifest));
            if (manifest.summary.missingRequired) process.exitCode = 1;
        } catch (error) {
            handleError(error);
        }
    });

deck
    .command('validate <deck-path>')
    .description('Validate parser behavior, metadata, math, clozes, figures, and card identities')
    .option('--out <path>', 'Write the machine-readable JSON report')
    .option('--quiet', 'Print only the validation summary')
    .action((deckPath, options) => {
        try {
            const identities = stabilizeDeck(deckPath, { check: true });
            const validation = validateDeck(deckPath, { outputPath: options.out, quiet: options.quiet });
            if (identities.status !== 0 || validation.status !== 0) process.exitCode = 1;
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

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { addChapter, createDeck, ensureSubject } from '../bin/lib/scaffold.js';
import { buildAgentInvocation, formatInvocation, runDeckAgent } from '../bin/lib/codex.js';
import { buildContextManifest, formatContextManifest } from '../bin/lib/context.js';
import { requireKebabSlug } from '../bin/lib/paths.js';
import { stabilizeDeck, validateDeck } from '../bin/lib/validation.js';

const temporaryRoots = [];
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function temporaryRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'flashcards-cli-'));
    temporaryRoots.push(root);
    return root;
}

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('flashcards CLI scaffolding', () => {
    it('creates subject context and a complete deck without overwriting subject files', async () => {
        const notesRoot = await temporaryRoot();
        const subject = await ensureSubject({ subject: 'earth-science', notesRoot });
        expect(subject.created).toHaveLength(3);

        const roadmap = path.join(subject.subjectPath, 'ROADMAP.md');
        await writeFile(roadmap, '# My roadmap\n');
        const result = await createDeck({
            subject: 'earth-science',
            deck: 'plate-tectonics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'plate boundaries']
        });

        expect(await readFile(roadmap, 'utf8')).toBe('# My roadmap\n');
        expect(await readFile(path.join(result.deckPath, 'deck.toml'), 'utf8')).toContain('subject = "earth-science"');
        expect(await readFile(path.join(result.deckPath, 'AGENTS.md'), 'utf8')).toContain('CARD_STANDARD.md');
        expect(await readFile(path.join(result.deckPath, 'CARD_README.md'), 'utf8')).toContain('Chapter design ledger');
        expect(await stat(path.join(subject.subjectPath, 'SUBJECT_BRIEF.md'))).toBeTruthy();
        expect(await stat(path.join(result.deckPath, 'figures', '01_foundations'))).toBeTruthy();
        expect(await stat(path.join(result.deckPath, 'flashcards', '02_plate_boundaries.md'))).toBeTruthy();
    });

    it('adds chapters in the next available order', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'biology',
            deck: 'genetics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations']
        });
        const chapter = await addChapter({ deckPath, name: 'Gene Expression' });
        expect(path.basename(chapter.filePath)).toBe('02_gene_expression.md');
        expect(await readFile(chapter.filePath, 'utf8')).toContain('tags = ["genetics"]');
    });

    it('rejects noncanonical subject and deck slugs', () => {
        expect(() => requireKebabSlug('Computer Science', 'Subject')).toThrow(/lowercase kebab-case/);
        expect(requireKebabSlug('computer-science', 'Subject')).toBe('computer-science');
    });

    it('rejects duplicate normalized chapters before creating subject files', async () => {
        const notesRoot = await temporaryRoot();
        await expect(createDeck({
            subject: 'history',
            deck: 'modern-europe',
            notesRoot,
            initializeGit: false,
            chapters: ['World War I', 'world-war-i']
        })).rejects.toThrow(/must be unique/);
        await expect(stat(path.join(notesRoot, 'history'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
});

describe('flashcards CLI validation and Codex handoff', () => {
    it('validates an empty scaffold and checks its stable identities', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'law',
            deck: 'contracts',
            notesRoot,
            initializeGit: false,
            chapters: ['formation']
        });
        const reportPath = path.join(notesRoot, 'validation.json');
        expect(stabilizeDeck(deckPath, { check: true, capture: true }).status).toBe(0);
        expect(validateDeck(deckPath, { outputPath: reportPath, quiet: true, capture: true }).status).toBe(0);
        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        expect(report.summary.decks).toBe(1);
        expect(report.summary.files).toBe(1);
    });

    it('treats missing stable identities as validation failures', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'law',
            deck: 'torts',
            notesRoot,
            initializeGit: false,
            chapters: ['duty']
        });
        const chapterPath = path.join(deckPath, 'flashcards', '01_duty.md');
        await writeFile(chapterPath, '+++\norder = 1\nsubject = "law"\ntags = ["torts"]\n+++\n\nQ: What is duty?\nA: A legal obligation.\n');
        const invalid = validateDeck(deckPath, { quiet: true, capture: true });
        expect(invalid.status).toBe(1);
        expect(invalid.stdout).toContain('identity errors: 1');

        expect(stabilizeDeck(deckPath, { capture: true }).status).toBe(0);
        expect(validateDeck(deckPath, { quiet: true, capture: true }).status).toBe(0);
    });

    it('explains parser-ambiguous math-internal clozes', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['kinematics']
        });
        const chapterPath = path.join(deckPath, 'flashcards', '01_kinematics.md');
        await writeFile(chapterPath, '+++\norder = 1\nsubject = "physics"\ntags = ["mechanics"]\n+++\n\n<!-- card-id: mechanics-velocity -->\nC: For constant acceleration, $v=[v_0+at]$.\n');
        const reportPath = path.join(notesRoot, 'cloze-validation.json');
        const result = validateDeck(deckPath, { outputPath: reportPath, quiet: true, capture: true });
        expect(result.status).toBe(0);
        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        expect(report.decks[0].files[0].clozeLints[0].msg).toContain('math-internal cloze is parser-ambiguous');
    });

    it('builds an explicit, model-unpinned Codex invocation', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'biology',
            deck: 'genetics',
            notesRoot,
            initializeGit: false
        });
        const invocation = buildAgentInvocation({
            mode: 'audit',
            deckPath,
            nonInteractive: true,
            reportOnly: false,
            extraInstructions: 'Check prerequisite bridges.'
        });
        expect(invocation.args).toContain('--search');
        expect(invocation.args).toContain('exec');
        expect(invocation.args).toContain('workspace-write');
        expect(invocation.args).toContain(deckPath);
        expect(invocation.args).not.toContain('--model');
        expect(invocation.prompt).toContain('$manage-flashcard-decks');
        expect(invocation.prompt).toContain('AUTHORING_PLAYBOOK.md');
        expect(invocation.prompt).toContain('chapter design ledger');
        expect(invocation.prompt).toContain('one figure per chapter');
        expect(invocation.prompt).toContain('Check prerequisite bridges.');
        expect(formatInvocation(invocation)).toContain('codex');
    });

    it('reports the exact ordered context without deprecated compatibility guides', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'biology',
            deck: 'genetics',
            notesRoot,
            initializeGit: false
        });
        const manifest = buildContextManifest({ deckPath, mode: 'audit' });
        const paths = manifest.files.filter(file => file.exists).map(file => file.path);
        expect(paths.some(file => file.endsWith('CARD_STANDARD.md'))).toBe(true);
        expect(paths.some(file => file.endsWith('AUTHORING_PLAYBOOK.md'))).toBe(true);
        expect(paths.some(file => file.endsWith('audit-workflow.md'))).toBe(true);
        expect(paths.some(file => file.endsWith('general.md'))).toBe(false);
        expect(paths.some(file => file.endsWith('new-subject.md'))).toBe(false);
        expect(manifest.summary.missingRequired).toBe(0);
        expect(formatContextManifest(manifest)).toContain('Total loaded context');
    });

    it('honors a deck-selected domain guide when its display subject differs', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'misc',
            deck: 'mechanics-revised',
            notesRoot,
            initializeGit: false
        });
        const manifestPath = path.join(deckPath, 'deck.toml');
        const manifest = await readFile(manifestPath, 'utf8');
        await writeFile(
            manifestPath,
            manifest.replace(
                'subject = "templates/guides/misc.md"',
                'subject = "templates/guides/physics.md"'
            )
        );

        const context = buildContextManifest({ deckPath, mode: 'build' });
        expect(context.subject).toBe('misc');
        expect(context.files.some(file => file.path.endsWith('templates/guides/physics.md') && file.exists)).toBe(true);
        expect(context.files.some(file => file.path.endsWith('templates/guides/misc.md'))).toBe(false);
    });

    it('requires Git safety before an editing audit can launch Codex', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'biology',
            deck: 'ecology',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations']
        });
        expect(() => runDeckAgent({ mode: 'audit', deckPath })).toThrow(/requires the deck to be a Git repository/);
    });

    it('exposes only the new command surface', () => {
        const result = spawnSync(process.execPath, ['bin/flashcards.js', '--help'], {
            cwd: path.resolve(testDirectory, '..'),
            encoding: 'utf8'
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('deck');
        expect(result.stdout).toContain('subject');
        expect(result.stdout).not.toContain('generate');
        expect(result.stdout).not.toContain('auth');
    });
});

import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { addChapter, createDeck, ensureSubject } from '../bin/lib/scaffold.js';
import {
    buildAgentInvocation,
    buildSubjectAgentInvocation,
    formatInvocation,
    resetChapterForRegeneration,
    resetPilotForRegeneration,
    runDeckAgent
} from '../bin/lib/codex.js';
import { buildContextManifest, buildSubjectContextManifest, formatContextManifest } from '../bin/lib/context.js';
import { discardIsolatedRun, finishIsolatedRun, prepareIsolatedRun } from '../bin/lib/isolation.js';
import { approvePilot, markPilotBuilt, readDeckStatus, requireFullBuildApproval } from '../bin/lib/pilot.js';
import { requireKebabSlug } from '../bin/lib/paths.js';
import {
    constrainWorkspaceToChapter,
    migratePrerequisites,
    resolveChapterClosure,
    resolvePrerequisiteGraph,
    stageExternalPrerequisites
} from '../bin/lib/prerequisites.js';
import { stabilizeDeck, validateDeck } from '../bin/lib/validation.js';
import {
    resolveSubjectCurriculum,
    resolveSubjectDeckClosure,
    syncDeckPrerequisitesFromSubject,
    validateSubjectExtension
} from '../bin/lib/subject-curriculum.js';

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
        expect(subject.created).toHaveLength(4);

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
        expect(await readFile(path.join(result.deckPath, 'deck.toml'), 'utf8')).toContain('schema_version = 2');
        expect(await readFile(path.join(result.deckPath, 'deck.toml'), 'utf8')).toContain('curriculum_order = 0');
        expect(await readFile(path.join(result.deckPath, 'AGENTS.md'), 'utf8')).toContain('CARD_STANDARD.md');
        expect(await readFile(path.join(result.deckPath, 'CARD_README.md'), 'utf8')).toContain('Chapter design ledger');
        expect(await readFile(path.join(result.deckPath, 'CARD_README.md'), 'utf8')).toContain('Concept-dependency ledger');
        expect(await readFile(path.join(result.deckPath, 'README.md'), 'utf8')).toContain('Confirmed subject prerequisites: none');
        expect(await stat(path.join(subject.subjectPath, 'SUBJECT_BRIEF.md'))).toBeTruthy();
        expect(await stat(path.join(subject.subjectPath, 'subject.toml'))).toBeTruthy();
        expect(await readFile(path.join(subject.subjectPath, 'subject.toml'), 'utf8'))
            .toContain('schema_version = 3');
        expect(await readFile(path.join(subject.subjectPath, 'subject.toml'), 'utf8'))
            .toContain('destination = "whole-field"');
        expect(await stat(path.join(result.deckPath, 'figures', '01_foundations'))).toBeTruthy();
        expect(await stat(path.join(result.deckPath, 'flashcards', '02_plate_boundaries.md'))).toBeTruthy();
        expect(await readFile(path.join(result.deckPath, 'flashcards', '02_plate_boundaries.md'), 'utf8'))
            .toContain('prerequisites = ["chapter:01_foundations"]');
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

    it('validates an AI-authored subject graph and resolves transitive deck prerequisites', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'biology', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 1
subject = "biology"

[[decks]]
id = "biology-foundations"
order = 1
prerequisites = []
status = "proposed"
description = "Scientific and chemical foundations."

[[decks]]
id = "cell-biology"
order = 2
prerequisites = ["biology-foundations"]
status = "proposed"

[[decks]]
id = "molecular-biology"
order = 3
prerequisites = ["cell-biology"]
status = "proposed"
`);

        const graph = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
        expect(graph.errors).toEqual([]);
        expect(resolveSubjectDeckClosure(graph, 'molecular-biology')).toMatchObject({
            direct: ['cell-biology'],
            transitive: ['biology-foundations', 'cell-biology']
        });
    });

    it('validates schema-v2 subject tiers, soft sequencing, scope, and field coverage', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({
            subject: 'biology',
            notesRoot,
            destination: 'undergraduate-core',
            deckGranularity: 'course'
        });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 2
subject = "biology"
destination = "undergraduate-core"
deck_granularity = "course"

[[decks]]
id = "biology-foundations"
order = 1
tier = "core"
prerequisites = []
recommended_after = []
estimated_chapters = 8
status = "proposed"
description = "Establish inquiry and the chemistry of life."

[[decks]]
id = "cell-biology"
order = 2
tier = "core"
prerequisites = ["biology-foundations"]
recommended_after = []
estimated_chapters = 10
status = "proposed"
description = "Reason about cells, membranes, and cellular systems."

[[decks]]
id = "field-biology"
order = 3
tier = "specialization"
prerequisites = []
recommended_after = ["cell-biology"]
estimated_chapters = 6
status = "proposed"
description = "Practice observation, sampling, and organismal comparison."

[[coverage]]
domain = "biological-foundations"
disposition = "included"
decks = ["biology-foundations"]
rationale = "Required entry knowledge."

[[coverage]]
domain = "cellular-systems"
disposition = "included"
decks = ["cell-biology"]
rationale = "Core biological organization."

[[coverage]]
domain = "field-practice"
disposition = "included"
decks = ["field-biology"]
rationale = "Optional authentic-practice branch."

[[coverage]]
domain = "clinical-medicine"
disposition = "out-of-scope"
decks = []
rationale = "The destination is biology rather than clinical practice."
`);

        const graph = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
        expect(graph.errors).toEqual([]);
        expect(graph).toMatchObject({
            schemaVersion: 2,
            destination: 'undergraduate-core',
            deckGranularity: 'course'
        });
        expect(graph.decks[2]).toMatchObject({
            tier: 'specialization',
            recommendedAfter: ['cell-biology'],
            estimatedChapters: 6
        });
        expect(resolveSubjectDeckClosure(graph, 'field-biology')).toMatchObject({
            direct: [],
            transitive: [],
            recommendedAfter: ['cell-biology']
        });
        expect(graph.coverage).toHaveLength(4);
    });

    it('rejects incoherent schema-v2 curriculum metadata', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'physics', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 2
subject = "physics"
destination = "undergraduate-core"
deck_granularity = "course"

[[decks]]
id = "foundations"
order = 1
tier = "core"
prerequisites = []
recommended_after = []
estimated_chapters = 2
status = "proposed"
description = "Foundations."

[[decks]]
id = "mechanics"
order = 2
tier = "required"
prerequisites = ["foundations"]
recommended_after = ["foundations"]
estimated_chapters = 18
status = "proposed"
description = "Mechanics."

[[coverage]]
domain = "mechanics"
disposition = "included"
decks = []
rationale = "Core domain."

[[coverage]]
domain = "medicine"
disposition = "deferred"
decks = ["mechanics"]
rationale = "Later."
`);

        const errors = resolveSubjectCurriculum(subjectPath, { requireDecks: true }).errors.join('\n');
        expect(errors).toContain('outside the course range 6-14');
        expect(errors).toContain('tier must be one of core, recommended, specialization');
        expect(errors).toContain('cannot be both a prerequisite and recommended_after');
        expect(errors).toContain('included coverage must name at least one deck');
        expect(errors).toContain('deferred coverage must not name decks');
        expect(errors).toContain('deck foundations is not assigned to any included coverage domain');
    });

    it('validates schema-v3 learning levels independently from destination tiers', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({
            subject: 'physics',
            notesRoot,
            destination: 'research-specialization',
            focus: ['quantum-field-theory']
        });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 3
subject = "physics"
destination = "research-specialization"
deck_granularity = "course"
focus = ["quantum-field-theory"]

[[decks]]
id = "quantum-foundations"
order = 1
tier = "recommended"
level = "undergraduate-advanced"
prerequisites = []
recommended_after = []
estimated_chapters = 10
status = "active"
description = "Establish quantum mechanics needed by later field theory."

[[decks]]
id = "quantum-field-theory"
order = 2
tier = "core"
level = "graduate"
prerequisites = ["quantum-foundations"]
recommended_after = []
estimated_chapters = 12
status = "proposed"
description = "Develop the shared graduate foundations of quantum field theory."

[[decks]]
id = "conformal-field-theory"
order = 3
tier = "specialization"
level = "research-specialization"
prerequisites = ["quantum-field-theory"]
recommended_after = []
estimated_chapters = 8
status = "proposed"
description = "Build a literature-facing conformal field theory route."

[[coverage]]
domain = "quantum-foundations"
disposition = "included"
decks = ["quantum-foundations"]
rationale = "Minimum honest bridge."

[[coverage]]
domain = "quantum-field-theory"
disposition = "included"
decks = ["quantum-field-theory", "conformal-field-theory"]
rationale = "Requested focus and one research branch."
`);

        const graph = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
        expect(graph.errors).toEqual([]);
        expect(graph).toMatchObject({
            schemaVersion: 3,
            destination: 'research-specialization',
            focus: ['quantum-field-theory']
        });
        expect(graph.decks.map(deck => deck.level)).toEqual([
            'undergraduate-advanced',
            'graduate',
            'research-specialization'
        ]);

        const created = await createDeck({
            subject: 'physics',
            deck: 'quantum-field-theory',
            notesRoot,
            initializeGit: false
        });
        expect(created.level).toBe('graduate');
        expect(await readFile(path.join(created.deckPath, 'deck.toml'), 'utf8'))
            .toContain('level = "graduate"');

        expect(validateSubjectExtension(graph, {
            ...graph,
            decks: [...graph.decks, {
                ...graph.decks.at(-1),
                id: 'new-research-branch',
                order: 4
            }]
        })).toEqual([]);
        expect(validateSubjectExtension(graph, {
            ...graph,
            decks: graph.decks.map(deck => deck.id === 'quantum-foundations'
                ? { ...deck, prerequisites: ['quantum-field-theory'] }
                : deck)
        }).join('\n')).toContain('changed quantum-foundations hard prerequisites');
    });

    it('rejects research routes without focus and later-level hard prerequisites', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'biology', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 3
subject = "biology"
destination = "research-specialization"
deck_granularity = "course"
focus = []

[[decks]]
id = "advanced-genomics"
order = 1
tier = "specialization"
level = "research-specialization"
prerequisites = []
recommended_after = []
estimated_chapters = 8
status = "proposed"
description = "Research genomics."

[[decks]]
id = "genetics"
order = 2
tier = "core"
level = "undergraduate-core"
prerequisites = ["advanced-genomics"]
recommended_after = []
estimated_chapters = 8
status = "proposed"
description = "Undergraduate genetics."

[[coverage]]
domain = "genetics"
disposition = "included"
decks = ["advanced-genomics", "genetics"]
rationale = "Test fixture."
`);

        const graph = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
        expect(graph.errors.join('\n')).toContain('research-specialization requires at least one focus');
        expect(graph.errors.join('\n')).toContain('cannot require later-level deck advanced-genomics');
    });

    it('rejects missing, later, duplicate, and cyclic subject deck edges', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'biology', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 1
subject = "biology"

[[decks]]
id = "foundations"
order = 1
prerequisites = ["advanced"]
status = "proposed"

[[decks]]
id = "advanced"
order = 1
prerequisites = ["foundations", "missing"]
status = "proposed"
`);

        const errors = resolveSubjectCurriculum(subjectPath, { requireDecks: true }).errors.join('\n');
        expect(errors).toContain('duplicate value 1');
        expect(errors).toContain('references missing prerequisite deck missing');
        expect(errors).toContain('must have a lower order');
        expect(errors).toContain('subject curriculum cycle');
    });

    it('inherits direct subject prerequisites when creating a declared deck', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'biology', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 1
subject = "biology"

[[decks]]
id = "biology-foundations"
order = 1
prerequisites = []
status = "active"

[[decks]]
id = "cell-biology"
order = 2
prerequisites = ["biology-foundations"]
status = "proposed"
`);
        const foundation = await createDeck({
            subject: 'biology',
            deck: 'biology-foundations',
            notesRoot,
            initializeGit: false
        });
        expect(syncDeckPrerequisitesFromSubject(foundation.deckPath, { requireEntry: true }).inferred)
            .toEqual([]);
        expect(await readFile(path.join(foundation.deckPath, 'deck.toml'), 'utf8'))
            .toContain('[prerequisites]\ndecks = []\nassumed_tools = []');
        expect(await readFile(path.join(foundation.deckPath, 'deck.toml'), 'utf8'))
            .toContain('curriculum_order = 1');
        const { deckPath, inferredPrerequisiteDecks } = await createDeck({
            subject: 'biology',
            deck: 'cell-biology',
            notesRoot,
            initializeGit: false
        });

        expect(inferredPrerequisiteDecks).toEqual(['biology/biology-foundations']);
        expect(await readFile(path.join(deckPath, 'deck.toml'), 'utf8'))
            .toContain('decks = ["biology/biology-foundations"]');
        expect(await readFile(path.join(deckPath, 'deck.toml'), 'utf8'))
            .toContain('curriculum_order = 2');
        expect(syncDeckPrerequisitesFromSubject(deckPath, { requireEntry: true }).inferred)
            .toEqual(['biology/biology-foundations']);
    });

    it('can leave a legacy unlisted deck unchanged during build-time sync', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'biology', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 1
subject = "biology"

[[decks]]
id = "biology-foundations"
order = 1
prerequisites = []
status = "active"
`);
        const deckPath = path.join(subjectPath, 'legacy-deck');
        await mkdir(deckPath);
        await writeFile(path.join(deckPath, 'deck.toml'), `schema_version = 2
subject = "biology"
deck = "legacy-deck"
level = "foundational"
status = "built"

[prerequisites]
decks = []
assumed_tools = []
`);

        expect(syncDeckPrerequisitesFromSubject(deckPath, { allowMissing: true }))
            .toMatchObject({ changed: false, curriculumOrder: null });
    });

    it('resolves sparse chapter and concept edges instead of assuming file order', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'vectors', 'kinematics']
        });
        const vectors = path.join(deckPath, 'flashcards', '02_vectors.md');
        const kinematics = path.join(deckPath, 'flashcards', '03_kinematics.md');
        await writeFile(
            vectors,
            (await readFile(vectors, 'utf8'))
                .replace('prerequisites = ["chapter:01_foundations"]', 'prerequisites = []')
                .replace('provides = []', 'provides = ["vector-components"]')
        );
        await writeFile(
            kinematics,
            (await readFile(kinematics, 'utf8'))
                .replace('prerequisites = ["chapter:02_vectors"]', 'prerequisites = ["concept:vector-components"]')
        );

        const graph = resolvePrerequisiteGraph(deckPath);
        expect(graph.errors).toEqual([]);
        const closure = resolveChapterClosure(graph, 3);
        expect(closure.localChapterIds).toEqual(['02_vectors']);
        expect(graph.chapters[2].dependencyDetails[0]).toMatchObject({
            kind: 'concept',
            resolved: '02_vectors'
        });
    });

    it('rejects missing, later, ambiguous, undeclared, and cyclic prerequisite edges', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'vectors']
        });
        const first = path.join(deckPath, 'flashcards', '01_foundations.md');
        const second = path.join(deckPath, 'flashcards', '02_vectors.md');
        await writeFile(
            first,
            (await readFile(first, 'utf8'))
                .replace('prerequisites = []', 'prerequisites = ["chapter:02_vectors", "deck:math/algebra", "tool:calculus"]')
                .replace('provides = []', 'provides = ["shared-concept"]')
        );
        await writeFile(
            second,
            (await readFile(second, 'utf8'))
                .replace('prerequisites = ["chapter:01_foundations"]', 'prerequisites = ["chapter:01_foundations", "concept:missing-concept"]')
                .replace('provides = []', 'provides = ["shared-concept"]')
        );

        const graph = resolvePrerequisiteGraph(deckPath);
        expect(graph.errors.join('\n')).toContain('chapter prerequisite cycle');
        expect(graph.errors.join('\n')).toContain('must point to an earlier chapter');
        expect(graph.errors.join('\n')).toContain('not declared in deck.toml');
        expect(graph.errors.join('\n')).toContain('must resolve to exactly one local provider');
        expect(graph.errors.join('\n')).toContain('provided by multiple chapters');
        expect(validateDeck(deckPath, { quiet: true, capture: true }).status).toBe(1);
    });

    it('stages transitive external decks and removes unrelated local chapters', async () => {
        const notesRoot = await temporaryRoot();
        await createDeck({
            subject: 'mathematics',
            deck: 'arithmetic',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations']
        });
        await createDeck({
            subject: 'mathematics',
            deck: 'algebra',
            notesRoot,
            initializeGit: false,
            prerequisiteDecks: ['mathematics/arithmetic'],
            chapters: ['foundations']
        });
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            prerequisiteDecks: ['mathematics/algebra'],
            chapters: ['foundations', 'vectors', 'kinematics']
        });
        const vectors = path.join(deckPath, 'flashcards', '02_vectors.md');
        await writeFile(
            vectors,
            (await readFile(vectors, 'utf8')).replace('prerequisites = ["chapter:01_foundations"]', 'prerequisites = []')
        );
        const graph = resolvePrerequisiteGraph(deckPath);
        const closure = resolveChapterClosure(graph, 3);
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: buildContextManifest({ deckPath, mode: 'build', chapterNumber: 3 }).files,
            label: 'prerequisite-test',
            prepareWorkspace(workspacePath) {
                constrainWorkspaceToChapter(workspacePath, closure);
                return stageExternalPrerequisites(workspacePath, graph, closure);
            }
        });
        try {
            await expect(stat(path.join(prepared.workspacePath, 'flashcards', '01_foundations.md')))
                .rejects.toMatchObject({ code: 'ENOENT' });
            expect(await stat(path.join(prepared.workspacePath, 'flashcards', '02_vectors.md'))).toBeTruthy();
            expect(await stat(path.join(prepared.workspacePath, 'flashcards', '03_kinematics.md'))).toBeTruthy();
            expect(await stat(path.join(
                prepared.workspacePath,
                '.flashcards',
                'prerequisites',
                'mathematics',
                'arithmetic',
                'deck.toml'
            ))).toBeTruthy();
            expect(prepared.preparedWorkspace.externalDecks.map(deck => deck.id))
                .toEqual(['mathematics/algebra', 'mathematics/arithmetic']);
        } finally {
            discardIsolatedRun(prepared);
        }
    });

    it('migrates schema-v1 decks to explicit metadata without changing the closure', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'law',
            deck: 'contracts',
            notesRoot,
            initializeGit: false,
            chapters: ['formation', 'remedies']
        });
        const manifestPath = path.join(deckPath, 'deck.toml');
        await writeFile(
            manifestPath,
            (await readFile(manifestPath, 'utf8'))
                .replace('schema_version = 2', 'schema_version = 1')
                .replace('\n[prerequisites]\ndecks = []\nassumed_tools = []\n', '')
        );
        for (const filename of ['01_formation.md', '02_remedies.md']) {
            const filePath = path.join(deckPath, 'flashcards', filename);
            await writeFile(
                filePath,
                (await readFile(filePath, 'utf8'))
                    .replace(/^prerequisites = .*\n/m, '')
                    .replace(/^provides = .*\n/m, '')
            );
        }
        const legacy = resolvePrerequisiteGraph(deckPath);
        expect(resolveChapterClosure(legacy, 2).localChapterIds).toEqual(['01_formation']);
        expect(migratePrerequisites(deckPath, { check: true }).changed).toHaveLength(3);
        const migrated = migratePrerequisites(deckPath);
        expect(migrated.graph.errors).toEqual([]);
        expect(migrated.graph.root.schemaVersion).toBe(2);
        expect(migrated.graph.chapters.every(chapter => chapter.prerequisitesExplicit)).toBe(true);
        expect(resolveChapterClosure(migrated.graph, 2).localChapterIds).toEqual(['01_formation']);
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
        await writeFile(chapterPath, '+++\norder = 1\nsubject = "law"\ntags = ["torts"]\nprerequisites = []\nprovides = []\n+++\n\nQ: What is duty?\nA: A legal obligation.\n');
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
        await writeFile(chapterPath, '+++\norder = 1\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = []\nprovides = []\n+++\n\n<!-- card-id: mechanics-velocity -->\nC: For constant acceleration, $v=[v_0+at]$.\n');
        const reportPath = path.join(notesRoot, 'cloze-validation.json');
        const result = validateDeck(deckPath, { outputPath: reportPath, quiet: true, capture: true });
        expect(result.status).toBe(0);
        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        expect(report.decks[0].files[0].clozeLints[0].msg).toContain('math-internal cloze is parser-ambiguous');
    });

    it('rejects unsafe SVG marker sizing and rounded marker-ended caps', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['vectors']
        });
        const figurePath = path.join(deckPath, 'figures', '01_vectors', 'vector.svg');
        await writeFile(
            figurePath,
            '<svg viewBox="0 0 100 100"><defs><marker id="arrow" markerWidth="8" markerHeight="8"><path d="M0 0L10 5L0 10Z"/></marker></defs></svg>\n'
        );
        const chapterPath = path.join(deckPath, 'flashcards', '01_vectors.md');
        await writeFile(
            chapterPath,
            '+++\norder = 1\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = []\nprovides = []\n+++\n\n<!-- card-id: marker-sizing -->\nQ: ![Vector](../figures/01_vectors/vector.svg)\n\nWhich way does it point?\nA: Right.\n'
        );

        const invalid = validateDeck(deckPath, { quiet: true, capture: true });
        expect(invalid.status).toBe(1);
        expect(invalid.stdout).toContain('image errors: 1');

        await writeFile(
            figurePath,
            '<svg viewBox="0 0 100 100"><defs><marker id="arrow" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12"><path d="M0 0L10 5L0 10Z"/></marker></defs><line x1="10" y1="50" x2="90" y2="50" stroke-linecap="round" marker-end="url(#arrow)"/></svg>\n'
        );
        const unsafeCap = validateDeck(deckPath, { quiet: true, capture: true });
        expect(unsafeCap.status).toBe(1);
        expect(unsafeCap.stdout).toContain('image errors: 1');

        await writeFile(
            figurePath,
            '<svg viewBox="0 0 100 100"><defs><marker id="arrow" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12"><path d="M0 0L10 5L0 10Z"/></marker></defs><line x1="10" y1="50" x2="90" y2="50" stroke-linecap="butt" marker-end="url(#arrow)"/></svg>\n'
        );
        expect(validateDeck(deckPath, { quiet: true, capture: true }).status).toBe(0);
    });

    it('builds an explicit fresh isolated Codex invocation', async () => {
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
            model: 'test-model',
            extraInstructions: 'Check prerequisite bridges.'
        });
        expect(invocation.args).toContain('--search');
        expect(invocation.args).toContain('exec');
        expect(invocation.args).toContain('workspace-write');
        expect(invocation.args).toContain(deckPath);
        expect(invocation.args).toContain('--model');
        expect(invocation.args).toContain('test-model');
        expect(invocation.args).toContain('--ephemeral');
        expect(invocation.args).toContain('--ignore-user-config');
        expect(invocation.args).toContain('--ignore-rules');
        expect(invocation.args).toContain('--json');
        expect(invocation.prompt).toContain('$manage-flashcard-decks');
        expect(invocation.prompt).toContain('AUTHORING_PLAYBOOK.md');
        expect(invocation.prompt).toContain('chapter design ledger');
        expect(invocation.prompt).toContain('one figure per chapter');
        expect(invocation.prompt).toContain('Check prerequisite bridges.');
        expect(formatInvocation(invocation)).toContain('codex');
    });

    it('reports subject creation context and creates a fresh subject invocation', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'earth-science', notesRoot });
        const manifest = buildSubjectContextManifest({ subjectPath });
        expect(manifest.files.some(file => file.path.endsWith('subject-workflow.md') && file.required)).toBe(true);
        expect(manifest.files.some(file => file.path.endsWith('ROADMAP.md') && file.required)).toBe(true);
        expect(manifest.files.some(file => file.path.endsWith('SUBJECT_BRIEF.md') && file.required)).toBe(true);
        expect(manifest.files.some(file => file.path.endsWith('subject.toml') && file.required)).toBe(true);
        expect(manifest.guide.path).toBe(path.join(subjectPath, 'DOMAIN_GUIDE.md'));

        const invocation = buildSubjectAgentInvocation({
            subjectPath,
            model: 'test-model',
            destination: 'whole-field',
            deckGranularity: 'module'
        });
        expect(invocation.args).toContain('--ephemeral');
        expect(invocation.prompt).toContain('Create DOMAIN_GUIDE.md');
        expect(invocation.prompt).toContain('subject.toml');
        expect(invocation.prompt).toContain('Requested curriculum destination: whole-field');
        expect(invocation.prompt).toContain('Required deck granularity: module, with 3-7 estimated chapters');
        expect(invocation.prompt).toContain('schema_version = 3');
        expect(invocation.prompt).toContain('deck level');
        expect(invocation.prompt).toContain('complete [[coverage]] matrix');
        expect(invocation.prompt).toContain('Do not create a deck');

        const extension = buildSubjectAgentInvocation({
            subjectPath,
            operation: 'extend',
            destination: 'research-specialization',
            focus: ['plate-tectonics']
        });
        expect(extension.prompt).toContain('Requested focus branches: plate-tectonics');
        expect(extension.prompt).toContain('Extend the existing curriculum rather than regenerating it');
        expect(extension.prompt).toContain('Preserve every valid existing deck id');
    });

    it('applies only target changes from an isolated workspace', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'biology',
            deck: 'genetics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations']
        });
        const manifest = buildContextManifest({ deckPath, mode: 'build' });
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: manifest.files,
            label: 'test'
        });
        try {
            expect(path.basename(prepared.workspacePath)).toBe('genetics');
            await writeFile(path.join(prepared.workspacePath, 'README.md'), '# Revised in isolation\n');
            await writeFile(prepared.stagedContext[0].path, '# Attempted context mutation\n');
            const result = finishIsolatedRun(prepared);
            expect(result.changed).toBe(true);
            expect(await readFile(path.join(deckPath, 'README.md'), 'utf8')).toBe('# Revised in isolation\n');
            expect(await readFile(manifest.files[0].path, 'utf8')).not.toBe('# Attempted context mutation\n');
            await rm(prepared.runPath, { recursive: true, force: true });
        } finally {
            discardIsolatedRun(prepared);
        }
    });

    it('defaults builds to one cold-start-audited pilot chapter', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'biology',
            deck: 'genetics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'inheritance']
        });
        const invocation = buildAgentInvocation({ mode: 'build', deckPath });
        expect(invocation.prompt).toContain('AUTHOR ONLY THE FIRST ORDERED CHAPTER');
        expect(invocation.prompt).toContain('.flashcards/audits/pilot-cold-start.md');
        expect(invocation.prompt).toContain('all unconfirmed domain knowledge as unseen');
        expect(invocation.prompt).toContain('ignored by the parser');
        expect(invocation.prompt).toContain('minimal teaching bridge on a scheduled front');
        expect(invocation.prompt).toContain('later chapter');
    });

    it('blanks only the first chapter and its figures for fresh pilot regeneration', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'vectors']
        });
        const first = path.join(deckPath, 'flashcards', '01_foundations.md');
        const second = path.join(deckPath, 'flashcards', '02_vectors.md');
        await writeFile(first, '+++\norder = 1\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = []\nprovides = []\n+++\n\n<!-- card-id: old -->\nQ: Old?\nA: Old.\n');
        await writeFile(second, '+++\norder = 2\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = ["chapter:01_foundations"]\nprovides = []\n+++\n\n<!-- card-id: keep -->\nQ: Keep?\nA: Keep.\n');
        await writeFile(path.join(deckPath, 'figures', '01_foundations', 'old.svg'), '<svg/>\n');

        resetPilotForRegeneration(deckPath);

        expect(await readFile(first, 'utf8')).toContain('Fresh isolated chapter-1 regeneration');
        expect(await readFile(first, 'utf8')).not.toContain('card-id: old');
        expect(await readFile(second, 'utf8')).toContain('card-id: keep');
        await expect(stat(path.join(deckPath, 'figures', '01_foundations', 'old.svg'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await stat(path.join(deckPath, 'figures', '01_foundations', '.gitkeep'))).toBeTruthy();

        const invocation = buildAgentInvocation({ mode: 'build', deckPath, freshPilot: true });
        expect(invocation.prompt).toContain('intentionally blanked');
    });

    it('isolates a fresh later-chapter build and its chapter-boundary audit', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'vectors', 'kinematics']
        });
        const first = path.join(deckPath, 'flashcards', '01_foundations.md');
        const second = path.join(deckPath, 'flashcards', '02_vectors.md');
        const third = path.join(deckPath, 'flashcards', '03_kinematics.md');
        await writeFile(first, '+++\norder = 1\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = []\nprovides = []\n+++\n\n<!-- card-id: keep-one -->\nQ: Keep one?\nA: Keep one.\n');
        await writeFile(second, '+++\norder = 2\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = ["chapter:01_foundations"]\nprovides = []\n+++\n\n<!-- card-id: replace-two -->\nQ: Replace two?\nA: Replace two.\n');
        await writeFile(third, '+++\norder = 3\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = ["chapter:02_vectors"]\nprovides = []\n+++\n\n<!-- card-id: keep-three -->\nQ: Keep three?\nA: Keep three.\n');
        await writeFile(path.join(deckPath, 'figures', '02_vectors', 'old.svg'), '<svg/>\n');

        resetChapterForRegeneration(deckPath, 2);

        expect(await readFile(first, 'utf8')).toContain('keep-one');
        expect(await readFile(second, 'utf8')).toContain('Fresh isolated chapter-2 regeneration');
        expect(await readFile(second, 'utf8')).not.toContain('replace-two');
        expect(await readFile(third, 'utf8')).toContain('keep-three');
        await expect(stat(path.join(deckPath, 'figures', '02_vectors', 'old.svg'))).rejects.toMatchObject({ code: 'ENOENT' });

        const invocation = buildAgentInvocation({
            mode: 'build',
            deckPath,
            buildScope: 'chapter',
            chapterNumber: 2,
            freshChapter: true
        });
        expect(invocation.prompt).toContain('AUTHOR ONLY ORDERED CHAPTER 2');
        expect(invocation.prompt).toContain('02_vectors-cold-start.md');
        expect(invocation.prompt).toContain('resolved local prerequisite closure (01_foundations)');
        expect(invocation.prompt).toContain('intentionally blanked');
    });

    it('applies only allowlisted paths from a bounded isolated run', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations']
        });
        const manifest = buildContextManifest({ deckPath, mode: 'build' });
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: manifest.files,
            label: 'bounded-test'
        });
        try {
            await writeFile(path.join(prepared.workspacePath, 'README.md'), '# Allowed change\n');
            await writeFile(
                path.join(prepared.workspacePath, 'flashcards', '01_foundations.md'),
                'Unrelated chapter change\n'
            );
            finishIsolatedRun(prepared, { allowedPaths: ['README.md'] });
            expect(await readFile(path.join(deckPath, 'README.md'), 'utf8')).toBe('# Allowed change\n');
            expect(await readFile(path.join(deckPath, 'flashcards', '01_foundations.md'), 'utf8')).not.toBe(
                'Unrelated chapter change\n'
            );
        } finally {
            discardIsolatedRun(prepared);
        }
    });

    it('requires a passing pilot artifact and explicit approval before a full build', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'biology',
            deck: 'genetics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations']
        });
        expect(() => requireFullBuildApproval(deckPath)).toThrow(/approved pilot/);

        const chapter = path.join(deckPath, 'flashcards', '01_foundations.md');
        await writeFile(chapter, '+++\norder = 1\nsubject = "biology"\ntags = ["genetics"]\nprerequisites = []\nprovides = []\n+++\n\n<!-- card-id: genetics-foundation -->\nQ: Supported question?\nA: Supported answer.\n');
        const auditPath = path.join(deckPath, '.flashcards', 'audits', 'pilot-cold-start.md');
        await writeFile(auditPath, '# Pilot cold-start audit\n\ncold_start_status: pass\n');
        expect(() => markPilotBuilt(deckPath)).toThrow(/unresolved_dependencies: 0/);
        await writeFile(
            auditPath,
            '# Pilot cold-start audit\n\ncold_start_status: pass\nunresolved_dependencies: 0\n'
        );
        expect(markPilotBuilt(deckPath).stableCards).toBe(1);
        expect(readDeckStatus(deckPath)).toBe('pilot-built');
        approvePilot(deckPath);
        expect(readDeckStatus(deckPath)).toBe('pilot-approved');
        expect(() => requireFullBuildApproval(deckPath)).not.toThrow();

        const full = runDeckAgent({ mode: 'build', deckPath, buildScope: 'full', dryRun: true });
        expect(full.invocation.prompt).toContain('full-cold-start.md');
        expect(full.invocation.prompt).toContain('creating any planned chapter files');
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
        expect(paths.some(file => file.endsWith('cold-start-workflow.md'))).toBe(true);
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

    it('loads a subject-owned domain guide when no reusable guide exists', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath, subjectPath } = await createDeck({
            subject: 'earth-science',
            deck: 'plate-tectonics',
            notesRoot,
            initializeGit: false
        });
        const guidePath = path.join(subjectPath, 'DOMAIN_GUIDE.md');
        await writeFile(guidePath, '# Earth science domain guide\n');
        const context = buildContextManifest({ deckPath, mode: 'build' });
        expect(context.files.some(file => file.path === guidePath && file.role === 'subject-owned domain guide')).toBe(true);
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

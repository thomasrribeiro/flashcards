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
    compactStagedChapterContext,
    formatInvocation,
    resetChapterForRegeneration,
    resetPilotForRegeneration,
    runDeckAgent,
    stampChangedChapterAuthoringModel
} from '../bin/lib/codex.js';
import { buildContextManifest, buildSubjectContextManifest, formatContextManifest } from '../bin/lib/context.js';
import {
    globalCurriculumIndex,
    resolveGlobalCurriculum
} from '../bin/lib/global-curriculum.js';
import { discardIsolatedRun, finishIsolatedRun, prepareIsolatedRun } from '../bin/lib/isolation.js';
import { materializeCurriculumDeck, parseCurriculumDeckReference } from '../bin/lib/materialize.js';
import { buildRegistry, resolveRegistry } from '../bin/lib/registry.js';
import { approvePilot, markPilotBuilt, readDeckStatus, requireFullBuildApproval } from '../bin/lib/pilot.js';
import { requireKebabSlug } from '../bin/lib/paths.js';
import {
    compactTransitivePrerequisiteChapters,
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
    validateSubjectExtension,
    validateSubjectRoadmap
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
    it('validates and deterministically compiles a portable curriculum registry', async () => {
        const root = await temporaryRoot();
        await writeFile(path.join(root, 'registry.toml'), `schema_version = 1
id = "learning-lab"
name = "Learning Lab"
repository = "example/curricula"
default_ref = "master"
subjects_dir = "subjects"
output = "dist/curriculum.json"
deck_metadata = "deck-metadata.json"
deck_owner = "example-decks"
`);
        const subjectsRoot = path.join(root, 'subjects');
        const { subjectPath } = await ensureSubject({ subject: 'physics', notesRoot: subjectsRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 1
subject = "physics"

[[decks]]
id = "mechanics"
order = 1
prerequisites = []
status = "proposed"
description = "Learn mechanics."
`);
        await writeFile(path.join(root, 'deck-metadata.json'), JSON.stringify({ decks: [{
            id: 'physics/mechanics',
            status: 'active',
            materialized: true,
            repository: { url: 'https://github.com/example-decks/mechanics', configured: true },
            chapters: [{ id: '01_foundations', order: 1, card_count: 20 }]
        }] }));

        expect(resolveRegistry(root).errors).toEqual([]);
        const { outputPath } = buildRegistry(root);
        const index = JSON.parse(await readFile(outputPath, 'utf8'));
        expect(index).toMatchObject({
            schema_version: 3,
            registry: {
                id: 'learning-lab',
                repository: 'example/curricula',
                ref: 'master'
            }
        });
        expect(index.decks[0]).toMatchObject({
            status: 'active',
            materialized: true,
            repository: { url: 'https://github.com/example-decks/mechanics', configured: true },
            chapters: [{ id: '01_foundations', card_count: 20 }]
        });
        const first = await readFile(outputPath, 'utf8');
        buildRegistry(root);
        expect(await readFile(outputPath, 'utf8')).toBe(first);
    });

    it('rejects registry paths that escape the repository', async () => {
        const root = await temporaryRoot();
        await writeFile(path.join(root, 'registry.toml'), `schema_version = 1
id = "learning-lab"
name = "Learning Lab"
repository = "example/curricula"
subjects_dir = "../notes"
output = "../curriculum.json"
`);
        expect(resolveRegistry(root).errors.join('\n')).toContain('must remain inside');
        expect(resolveRegistry(root).errors.join('\n')).toContain('must be a JSON path inside');
    });

    it('materializes a canonical planned deck without requiring a filesystem path', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'physics', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 1
subject = "physics"

[[decks]]
id = "physical-reasoning"
order = 1
prerequisites = []
status = "proposed"
description = "Reason from systems, quantities, and evidence."
`);

        const result = await materializeCurriculumDeck('physics/physical-reasoning', {
            notesRoot,
            initializeGit: false
        });

        expect(parseCurriculumDeckReference(result.reference)).toEqual({
            subject: 'physics',
            deck: 'physical-reasoning'
        });
        expect(result).toMatchObject({
            created: true,
            curriculumOrder: 1,
            prerequisites: []
        });
        expect(await readFile(path.join(result.deckPath, 'README.md'), 'utf8'))
            .toContain('Reason from systems, quantities, and evidence.');
    });

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

    it('validates the ROADMAP deck table against schema-v3 subject metadata', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'physics', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 3
subject = "physics"
destination = "whole-field"
deck_granularity = "course"
focus = []

[[decks]]
id = "physics-foundations"
order = 1
tier = "core"
level = "foundational"
prerequisites = []
recommended_after = []
estimated_chapters = 8
status = "active"
description = "Establish physical reasoning."

[[decks]]
id = "advanced-physics"
order = 2
tier = "specialization"
level = "undergraduate-advanced"
prerequisites = ["physics-foundations"]
recommended_after = ["mathematics/linear-algebra"]
estimated_chapters = 10
status = "proposed"
description = "Apply advanced physical models."

[[coverage]]
domain = "physics"
disposition = "included"
decks = ["physics-foundations", "advanced-physics"]
rationale = "Test fixture."
`);
        const roadmapPath = path.join(subjectPath, 'ROADMAP.md');
        await writeFile(roadmapPath, `# Physics learning roadmap

## Deck sequence

| Order | Deck | Level | Tier | Hard prerequisites | Recommended after | Est. chapters | Durable capabilities | Status |
|---:|---|---|---|---|---|---:|---|---|
| 1 | physics-foundations | foundational | core | None | None | 8 | Establish physical reasoning. | active |
| 2 | advanced-physics | undergraduate-advanced | specialization | 1 | mathematics/linear-algebra | 10 | Apply advanced physical models. | proposed |
`);
        const graph = resolveSubjectCurriculum(subjectPath, { requireDecks: true });
        expect(validateSubjectRoadmap(subjectPath, graph)).toEqual([]);

        await writeFile(roadmapPath, (await readFile(roadmapPath, 'utf8')).replace(
            '| mathematics/linear-algebra | 10 | Apply advanced physical models. |',
            '| mathematics/linear-algebra | Apply advanced physical models. |'
        ));
        expect(validateSubjectRoadmap(subjectPath, graph).join('\n'))
            .toContain('deck row must have 9 cells');
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
            .toContain('[prerequisites]\ndecks = []\nrecommended_decks = []\nassumed_tools = []');
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

    it('validates qualified cross-subject prerequisites and syncs them into deck manifests', async () => {
        const notesRoot = await temporaryRoot();
        const mathematics = await ensureSubject({ subject: 'mathematics', notesRoot });
        await writeFile(path.join(mathematics.subjectPath, 'subject.toml'), `schema_version = 1
subject = "mathematics"

[[decks]]
id = "algebra"
order = 1
prerequisites = []
status = "active"
`);
        const physics = await ensureSubject({ subject: 'physics', notesRoot });
        await writeFile(path.join(physics.subjectPath, 'subject.toml'), `schema_version = 1
subject = "physics"

[[decks]]
id = "mechanics"
order = 1
prerequisites = ["mathematics/algebra"]
status = "proposed"
`);

        expect(resolveSubjectCurriculum(physics.subjectPath, { requireDecks: true }).errors).toEqual([]);
        const global = resolveGlobalCurriculum(notesRoot, { requireSubjects: true });
        expect(global.errors).toEqual([]);
        expect(global.crossSubjectHardEdges).toEqual([{
            from: 'physics/mechanics',
            to: 'mathematics/algebra',
            kind: 'required'
        }]);
        expect(globalCurriculumIndex(global).decks.find(deck => deck.id === 'physics/mechanics'))
            .toMatchObject({ prerequisites: ['mathematics/algebra'] });

        const created = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false
        });
        expect(created.inferredPrerequisiteDecks).toEqual(['mathematics/algebra']);
        expect(await readFile(path.join(created.deckPath, 'deck.toml'), 'utf8'))
            .toContain('decks = ["mathematics/algebra"]');
    });

    it('detects missing references and cycles across subject boundaries', async () => {
        const notesRoot = await temporaryRoot();
        const mathematics = await ensureSubject({ subject: 'mathematics', notesRoot });
        const physics = await ensureSubject({ subject: 'physics', notesRoot });
        await writeFile(path.join(mathematics.subjectPath, 'subject.toml'), `schema_version = 1
subject = "mathematics"

[[decks]]
id = "algebra"
order = 1
prerequisites = ["physics/mechanics"]
status = "active"
`);
        await writeFile(path.join(physics.subjectPath, 'subject.toml'), `schema_version = 1
subject = "physics"

[[decks]]
id = "mechanics"
order = 1
prerequisites = ["mathematics/algebra", "computer-science/programming"]
status = "proposed"
`);

        const errors = resolveGlobalCurriculum(notesRoot, { requireSubjects: true }).errors.join('\n');
        expect(errors).toContain('physics/mechanics references missing prerequisite deck computer-science/programming');
        expect(errors).toContain('global curriculum cycle:');
        expect(errors).toContain('mathematics/algebra');
        expect(errors).toContain('physics/mechanics');
    });

    it('fails before launching a subject agent when an external curriculum is invalid', async () => {
        const notesRoot = await temporaryRoot();
        const mathematics = await ensureSubject({ subject: 'mathematics', notesRoot });
        await writeFile(path.join(mathematics.subjectPath, 'subject.toml'), `schema_version = 1
subject = "mathematics"

[[decks]]
id = "calculus"
order = 1
prerequisites = ["missing-foundations"]
status = "active"
`);
        const physics = await ensureSubject({ subject: 'physics', notesRoot });

        expect(() => buildSubjectAgentInvocation({
            subjectPath: physics.subjectPath,
            operation: 'create',
            destination: 'whole-field',
            deckGranularity: 'course',
            focus: [],
            isolated: true
        })).toThrow(/established external curriculum is invalid/);
    });

    it('allows a subject agent to repair its target while validating external subjects', async () => {
        const notesRoot = await temporaryRoot();
        const mathematics = await ensureSubject({ subject: 'mathematics', notesRoot });
        await writeFile(path.join(mathematics.subjectPath, 'subject.toml'), `schema_version = 1
subject = "mathematics"

[[decks]]
id = "calculus"
order = 1
prerequisites = []
status = "active"
`);
        const physics = await ensureSubject({ subject: 'physics', notesRoot });
        await writeFile(path.join(physics.subjectPath, 'subject.toml'), `schema_version = 1
subject = "physics"

[[decks]]
id = "mechanics"
order = 1
prerequisites = ["missing-local-deck"]
status = "proposed"
`);

        expect(() => buildSubjectAgentInvocation({
            subjectPath: physics.subjectPath,
            operation: 'create',
            destination: 'whole-field',
            deckGranularity: 'course',
            focus: [],
            isolated: true
        })).not.toThrow();
    });

    it('warns when an advanced curriculum skips the immediately preceding maturity layer', async () => {
        const notesRoot = await temporaryRoot();
        const { subjectPath } = await ensureSubject({ subject: 'physics', notesRoot });
        await writeFile(path.join(subjectPath, 'subject.toml'), `schema_version = 3
subject = "physics"
destination = "whole-field"
deck_granularity = "course"
focus = []

[[decks]]
id = "introductory-physics"
order = 1
tier = "core"
level = "undergraduate-core"
prerequisites = []
recommended_after = []
estimated_chapters = 10
status = "active"
description = "Develop introductory physical reasoning."

[[decks]]
id = "graduate-field-theory"
order = 2
tier = "specialization"
level = "graduate"
prerequisites = ["introductory-physics"]
recommended_after = []
estimated_chapters = 10
status = "proposed"
description = "Develop a graduate field-theory route."

[[coverage]]
domain = "physics"
disposition = "included"
decks = ["introductory-physics", "graduate-field-theory"]
rationale = "Test the maturity-transition audit."
`);

        const graph = resolveGlobalCurriculum(notesRoot, { requireSubjects: true });
        expect(graph.errors).toEqual([]);
        expect(graph.warnings.join('\n')).toContain(
            'physics/graduate-field-theory is graduate but has no direct undergraduate-advanced prerequisite'
        );
        expect(globalCurriculumIndex(graph)).not.toHaveProperty('generated_at');
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

    it('resolves a qualified concept to its exact chapter in a transitive external deck', async () => {
        const notesRoot = await temporaryRoot();
        const arithmetic = await createDeck({
            subject: 'mathematics',
            deck: 'arithmetic',
            notesRoot,
            initializeGit: false,
            chapters: ['numbers', 'measurement']
        });
        const measurement = path.join(arithmetic.deckPath, 'flashcards', '02_measurement.md');
        await writeFile(
            measurement,
            (await readFile(measurement, 'utf8'))
                .replace('provides = []', 'provides = ["measurement-unit", "unit-conversion"]')
        );
        await createDeck({
            subject: 'mathematics',
            deck: 'algebra',
            notesRoot,
            initializeGit: false,
            prerequisiteDecks: ['mathematics/arithmetic'],
            chapters: ['expressions']
        });
        const physics = await createDeck({
            subject: 'physics',
            deck: 'physical-reasoning',
            notesRoot,
            initializeGit: false,
            prerequisiteDecks: ['mathematics/algebra'],
            chapters: ['systems']
        });
        const systems = path.join(physics.deckPath, 'flashcards', '01_systems.md');
        await writeFile(
            systems,
            (await readFile(systems, 'utf8')).replace(
                'prerequisites = []',
                'prerequisites = ["concept:mathematics/arithmetic#measurement-unit"]'
            )
        );

        const graph = resolvePrerequisiteGraph(physics.deckPath);
        expect(graph.errors).toEqual([]);
        expect(graph.chapters[0].dependencyDetails[0]).toMatchObject({
            kind: 'external-concept',
            deck: 'mathematics/arithmetic',
            chapter: '02_measurement',
            concept: 'measurement-unit',
            resolved: 'mathematics/arithmetic#02_measurement'
        });
        expect(resolveChapterClosure(graph, 1).externalConcepts).toEqual([
            expect.objectContaining({
                deck: 'mathematics/arithmetic',
                chapter: '02_measurement'
            })
        ]);
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

    it('keeps direct prerequisite cards and summarizes older transitive chapters', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'mathematics',
            deck: 'arithmetic',
            notesRoot,
            initializeGit: false,
            chapters: ['quantities', 'addition', 'multiplication', 'fractions']
        });
        const auditsPath = path.join(deckPath, '.flashcards', 'audits');
        await mkdir(auditsPath, { recursive: true });
        await writeFile(path.join(auditsPath, 'full-cold-start.md'), '# Old full audit\n');
        await writeFile(path.join(auditsPath, '04_fractions-cold-start.md'), '# Old chapter audit\n');
        const graph = resolvePrerequisiteGraph(deckPath);
        const closure = resolveChapterClosure(graph, 4);
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: buildContextManifest({ deckPath, mode: 'build', chapterNumber: 4 }).files,
            label: 'bounded-prerequisite-test',
            prepareWorkspace(workspacePath) {
                constrainWorkspaceToChapter(workspacePath, closure);
                return compactTransitivePrerequisiteChapters(workspacePath, closure);
            }
        });
        try {
            const first = await readFile(path.join(prepared.workspacePath, 'flashcards', '01_quantities.md'), 'utf8');
            const second = await readFile(path.join(prepared.workspacePath, 'flashcards', '02_addition.md'), 'utf8');
            const third = await readFile(path.join(prepared.workspacePath, 'flashcards', '03_multiplication.md'), 'utf8');
            expect(first).toContain('# Bounded prerequisite summary');
            expect(second).toContain('# Bounded prerequisite summary');
            expect(third).not.toContain('# Bounded prerequisite summary');
            await expect(stat(path.join(prepared.workspacePath, '.flashcards', 'audits', 'full-cold-start.md')))
                .rejects.toMatchObject({ code: 'ENOENT' });
            await expect(stat(path.join(
                prepared.workspacePath,
                '.flashcards',
                'audits',
                '04_fractions-cold-start.md'
            ))).rejects.toMatchObject({ code: 'ENOENT' });
            expect(prepared.preparedWorkspace).toEqual({
                direct: ['03_multiplication'],
                summarized: ['01_quantities', '02_addition']
            });
            expect(validateDeck(prepared.workspacePath, { quiet: true, capture: true }).status).toBe(0);
        } finally {
            discardIsolatedRun(prepared);
        }
    });

    it('bounds subject and deck planning context for one chapter build', async () => {
        const root = await temporaryRoot();
        const roadmapPath = path.join(root, 'ROADMAP.md');
        const curriculumPath = path.join(root, 'subject.toml');
        const blueprintPath = path.join(root, 'CARD_README.md');
        await writeFile(roadmapPath, `# Roadmap

## Learner and destination

Cold start.

## Field coverage

Large matrix.

## Deck sequence

Sequence notes.

| Order | Deck | Level |
|---:|---|---|
| 1 | arithmetic | foundational |
| 2 | algebra | foundational |
`);
        await writeFile(curriculumPath, `schema_version = 3
subject = "mathematics"

[[decks]]
id = "arithmetic"
order = 1

[[decks]]
id = "algebra"
order = 2
`);
        await writeFile(blueprintPath, `# Blueprint

## Learner model

Cold start.

## Concept-dependency ledger

| Concept | Fronts |
|---|---|
| Whole number | Ch. 1 |
| Fraction | Ch. 6 |

## Retrieval portfolio

Use basic and problem cards.

## Chapter design ledger

| Chapter | Targets |
|---|---|
| 1. Whole numbers | counting |
| 6. Fractions | fractions |

## Validation gate

Validate.
`);
        const staged = [
            { role: 'learner-specific subject roadmap', path: roadmapPath },
            { role: 'machine-readable subject curriculum', path: curriculumPath },
            { role: 'deck-specific retrieval blueprint', path: blueprintPath }
        ];
        expect(compactStagedChapterContext(staged, 'arithmetic', 6)).toHaveLength(3);
        expect(await readFile(roadmapPath, 'utf8')).toContain('| 1 | arithmetic |');
        expect(await readFile(roadmapPath, 'utf8')).not.toContain('| 2 | algebra |');
        expect(await readFile(curriculumPath, 'utf8')).toContain('id = "arithmetic"');
        expect(await readFile(curriculumPath, 'utf8')).not.toContain('id = "algebra"');
        expect(await readFile(blueprintPath, 'utf8')).toContain('| Fraction | Ch. 6 |');
        expect(await readFile(blueprintPath, 'utf8')).not.toContain('| Whole number | Ch. 1 |');
        expect(await readFile(blueprintPath, 'utf8')).toContain('| 6. Fractions |');
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

    it('routes Claude model aliases through a fresh non-persistent Claude Code session', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'mathematics',
            deck: 'arithmetic',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations']
        });
        const invocation = buildAgentInvocation({
            mode: 'build',
            deckPath,
            model: 'fable',
            reasoningEffort: 'high'
        });

        expect(invocation.command).toBe('claude');
        expect(invocation.args).not.toContain('--safe-mode');
        expect(invocation.args).not.toContain('--prompt-suggestions');
        expect(invocation.args).toContain('--no-session-persistence');
        expect(invocation.args).toContain('--setting-sources');
        expect(invocation.args[invocation.args.indexOf('--setting-sources') + 1]).toBe('');
        expect(invocation.args).toContain('--dangerously-skip-permissions');
        expect(invocation.args).toContain('fable');
        expect(invocation.provider).toBe('claude-code');
    });

    it('preserves the configured credential store while ignoring other user config', async () => {
        const previous = process.env.FLASHCARDS_CODEX_AUTH_CREDENTIALS_STORE;
        process.env.FLASHCARDS_CODEX_AUTH_CREDENTIALS_STORE = 'keyring';
        try {
            const notesRoot = await temporaryRoot();
            const { deckPath } = await createDeck({
                subject: 'biology',
                deck: 'credential-test',
                notesRoot,
                initializeGit: false
            });
            const invocation = buildAgentInvocation({ mode: 'build', deckPath });
            expect(invocation.args).toContain('cli_auth_credentials_store="keyring"');
            expect(invocation.args).toContain('--ignore-user-config');
        } finally {
            if (previous === undefined) delete process.env.FLASHCARDS_CODEX_AUTH_CREDENTIALS_STORE;
            else process.env.FLASHCARDS_CODEX_AUTH_CREDENTIALS_STORE = previous;
        }
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

    it('preserves an inspectable patch without applying it', async () => {
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
            label: 'preserve-only-test'
        });
        try {
            await writeFile(path.join(prepared.workspacePath, 'README.md'), '# Partial provider output\n');
            const result = finishIsolatedRun(prepared, { applyChanges: false });
            expect(result.changed).toBe(true);
            expect(await readFile(path.join(deckPath, 'README.md'), 'utf8')).not.toBe('# Partial provider output\n');
            expect(await readFile(path.join(result.runPath, 'changes.patch'), 'utf8')).toContain('Partial provider output');
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
        expect(invocation.prompt).toContain('CARD_STANDARD U11 and D8');
        expect(invocation.prompt).toContain('reject future-facing examples and supplied premises');
        expect(invocation.prompt).toContain('separate first-use scan');
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

    it('blanks a fresh chapter before the isolated Git baseline is created', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'vectors']
        });
        const second = path.join(deckPath, 'flashcards', '02_vectors.md');
        await writeFile(second, '+++\norder = 2\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = ["chapter:01_foundations"]\nprovides = []\n+++\n\n<!-- card-id: secret-old-card -->\nQ: Old target?\nA: Old answer.\n');
        const manifest = buildContextManifest({ deckPath, mode: 'build', chapterNumber: 2 });
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: manifest.files,
            label: 'fresh-baseline-test',
            prepareWorkspace(workspacePath) {
                resetChapterForRegeneration(workspacePath, 2);
            }
        });
        try {
            const baseline = spawnSync(
                'git',
                ['show', 'HEAD:flashcards/02_vectors.md'],
                { cwd: prepared.workspacePath, encoding: 'utf8' }
            );
            expect(baseline.status).toBe(0);
            expect(baseline.stdout).toContain('Fresh isolated chapter-2 regeneration');
            expect(baseline.stdout).not.toContain('secret-old-card');
            const diff = spawnSync('git', ['diff', 'HEAD'], { cwd: prepared.workspacePath, encoding: 'utf8' });
            expect(diff.stdout).not.toContain('secret-old-card');
        } finally {
            await rm(prepared.runPath, { recursive: true, force: true });
            discardIsolatedRun(prepared);
        }
    });

    it('stamps changed generated chapters with the exact authoring model', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'vectors']
        });
        const manifest = buildContextManifest({ deckPath, mode: 'build', chapterNumber: 2 });
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: manifest.files,
            label: 'model-provenance-test'
        });
        try {
            const first = path.join(prepared.workspacePath, 'flashcards', '01_foundations.md');
            const second = path.join(prepared.workspacePath, 'flashcards', '02_vectors.md');
            const third = path.join(prepared.workspacePath, 'flashcards', '03_new_chapter.md');
            await writeFile(first, `${await readFile(first, 'utf8')}\n`);
            await writeFile(second, `${await readFile(second, 'utf8')}\n`);
            await writeFile(third, '+++\norder = 3\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = []\nprovides = []\n+++\n');

            expect(stampChangedChapterAuthoringModel(prepared.workspacePath, 'claude-fable-5', 'high'))
                .toEqual([
                    'flashcards/01_foundations.md',
                    'flashcards/02_vectors.md',
                    'flashcards/03_new_chapter.md'
                ]);
            expect(await readFile(first, 'utf8')).toContain('authoring_model = "claude-fable-5"');
            expect(await readFile(first, 'utf8')).toContain('authoring_reasoning_effort = "high"');
            expect(await readFile(second, 'utf8')).toContain('authoring_model = "claude-fable-5"');
            expect(await readFile(second, 'utf8')).toContain('authoring_reasoning_effort = "high"');
            expect(await readFile(third, 'utf8')).toContain('authoring_model = "claude-fable-5"');
            expect(await readFile(third, 'utf8')).toContain('authoring_reasoning_effort = "high"');

            expect(stampChangedChapterAuthoringModel(prepared.workspacePath, 'claude-opus-4-8', 'medium'))
                .toEqual([
                    'flashcards/01_foundations.md',
                    'flashcards/02_vectors.md',
                    'flashcards/03_new_chapter.md'
                ]);
            expect(await readFile(first, 'utf8')).toContain('authoring_model = "claude-opus-4-8"');
            expect(await readFile(first, 'utf8')).toContain('authoring_reasoning_effort = "medium"');
            expect((await readFile(first, 'utf8')).match(/^authoring_model\s*=/gm)).toHaveLength(1);
            expect((await readFile(first, 'utf8')).match(/^authoring_reasoning_effort\s*=/gm)).toHaveLength(1);
        } finally {
            await rm(prepared.runPath, { recursive: true, force: true });
            discardIsolatedRun(prepared);
        }
    });

    it('atomically replaces a fresh chapter while applying compatible deck-document changes', async () => {
        const notesRoot = await temporaryRoot();
        const { deckPath } = await createDeck({
            subject: 'physics',
            deck: 'mechanics',
            notesRoot,
            initializeGit: false,
            chapters: ['foundations', 'vectors']
        });
        const chapterPath = path.join(deckPath, 'flashcards', '02_vectors.md');
        const figurePath = path.join(deckPath, 'figures', '02_vectors');
        await writeFile(chapterPath, '+++\norder = 2\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = ["chapter:01_foundations"]\nprovides = []\n+++\n\n<!-- card-id: hidden-old-card -->\nQ: Old?\nA: Old.\n');
        await writeFile(path.join(figurePath, 'old.svg'), '<svg>old</svg>\n');
        const manifest = buildContextManifest({ deckPath, mode: 'build', chapterNumber: 2 });
        const prepared = prepareIsolatedRun({
            sourcePath: deckPath,
            contextFiles: manifest.files,
            label: 'fresh-replacement-test',
            prepareWorkspace(workspacePath) {
                resetChapterForRegeneration(workspacePath, 2);
            }
        });
        try {
            await writeFile(
                path.join(prepared.workspacePath, 'flashcards', '02_vectors.md'),
                '+++\norder = 2\nsubject = "physics"\ntags = ["mechanics"]\nprerequisites = ["chapter:01_foundations"]\nprovides = []\n+++\n\n<!-- card-id: generated-new-card -->\nQ: New?\nA: New.\n'
            );
            await rm(path.join(prepared.workspacePath, 'figures', '02_vectors', '.gitkeep'));
            await writeFile(
                path.join(prepared.workspacePath, 'figures', '02_vectors', 'new.svg'),
                '<svg>new</svg>\n'
            );
            await writeFile(path.join(prepared.workspacePath, 'README.md'), '# Revised deck\n');

            finishIsolatedRun(prepared, {
                allowedPaths: ['flashcards/02_vectors.md', 'figures/02_vectors', 'README.md'],
                replacePaths: ['flashcards/02_vectors.md', 'figures/02_vectors']
            });

            expect(await readFile(chapterPath, 'utf8')).toContain('generated-new-card');
            expect(await readFile(chapterPath, 'utf8')).not.toContain('hidden-old-card');
            expect(await readFile(path.join(figurePath, 'new.svg'), 'utf8')).toContain('new');
            await expect(stat(path.join(figurePath, 'old.svg'))).rejects.toMatchObject({ code: 'ENOENT' });
            expect(await readFile(path.join(deckPath, 'README.md'), 'utf8')).toBe('# Revised deck\n');
        } finally {
            await rm(prepared.runPath, { recursive: true, force: true });
            discardIsolatedRun(prepared);
        }
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

    it('starts a deck-create agent run at the pilot instead of a full build', async () => {
        const notesRoot = await temporaryRoot();
        const result = spawnSync(process.execPath, [
            'bin/flashcards.js',
            'deck',
            'create',
            'mathematics',
            'arithmetic',
            '--notes-root',
            notesRoot,
            '--dry-run'
        ], {
            cwd: path.resolve(testDirectory, '..'),
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('AUTHOR ONLY THE FIRST ORDERED CHAPTER');
        expect(result.stdout).not.toContain('Full build requires an approved pilot');
    });
});

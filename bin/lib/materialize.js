import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { addChapter, createDeck } from './scaffold.js';
import { resolveGlobalCurriculum } from './global-curriculum.js';
import { requireKebabSlug, resolveNotesRoot } from './paths.js';
import { syncDeckPrerequisitesFromSubject } from './subject-curriculum.js';

export function parseCurriculumDeckReference(reference) {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(reference || '');
    if (!match) throw new Error(`Expected a canonical subject/deck reference, received: ${reference}`);
    return {
        subject: requireKebabSlug(match[1], 'Subject'),
        deck: requireKebabSlug(match[2], 'Deck')
    };
}

export async function materializeCurriculumDeck(
    reference,
    {
        notesRoot,
        initializeGit = true,
        curriculumRoot,
        chapterSnapshot = [],
        repositoryUrl,
        cloneExistingRepository = false
    } = {}
) {
    const root = resolveNotesRoot(notesRoot);
    const curriculum = curriculumRoot ? resolveNotesRoot(curriculumRoot) : root;
    const { subject, deck } = parseCurriculumDeckReference(reference);
    const graph = resolveGlobalCurriculum(curriculum, { requireSubjects: true });
    if (graph.errors.length) {
        throw new Error(`Invalid global curriculum:\n- ${graph.errors.join('\n- ')}`);
    }
    const node = graph.decks.find(candidate => candidate.id === `${subject}/${deck}`);
    if (!node) throw new Error(`Deck ${subject}/${deck} is not declared in the global curriculum.`);

    const deckPath = path.join(root, subject, deck);
    let created = null;
    if (!existsSync(deckPath)) {
        if (cloneExistingRepository && repositoryUrl) {
            mkdirSync(path.dirname(deckPath), { recursive: true });
            const cloned = spawnSync('gh', ['repo', 'clone', repositoryUrl, deckPath], {
                encoding: 'utf8'
            });
            if (cloned.status !== 0) {
                throw new Error(`Unable to clone ${repositoryUrl}: ${(cloned.stderr || cloned.stdout).trim()}`);
            }
        } else {
            created = await createDeck({
                subject,
                deck,
                notesRoot: root,
                initializeGit,
                description: node.description
            });
        }
    } else if (!existsSync(path.join(deckPath, 'deck.toml'))) {
        throw new Error(`Existing directory is not a flashcard deck: ${deckPath}`);
    }

    for (const chapter of chapterSnapshot || []) {
        const id = String(chapter?.id || '');
        const match = /^(\d{2})_([a-z0-9]+(?:_[a-z0-9]+)*)$/.exec(id);
        if (!match) throw new Error(`Invalid pinned chapter identifier: ${id || '(missing)'}`);
        const chapterPath = path.join(deckPath, 'flashcards', `${id}.md`);
        if (existsSync(chapterPath)) continue;
        await addChapter({
            deckPath,
            name: match[2],
            order: Number(match[1]),
            prerequisites: Array.isArray(chapter.prerequisites) ? chapter.prerequisites : [],
            provides: Array.isArray(chapter.provides) ? chapter.provides : []
        });
    }

    const synced = syncDeckPrerequisitesFromSubject(deckPath, {
        requireEntry: true,
        subjectPath: path.join(curriculum, subject)
    });
    return {
        reference: `${subject}/${deck}`,
        subject,
        deck,
        deckPath,
        created: Boolean(created),
        gitInitialized: created?.gitInitialized || false,
        prerequisites: synced.prerequisites,
        recommendedDecks: synced.recommendedDecks,
        curriculumOrder: synced.curriculumOrder
    };
}

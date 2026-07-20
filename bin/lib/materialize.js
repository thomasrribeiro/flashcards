import { existsSync } from 'node:fs';
import path from 'node:path';
import { createDeck } from './scaffold.js';
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
    { notesRoot, initializeGit = true } = {}
) {
    const root = resolveNotesRoot(notesRoot);
    const { subject, deck } = parseCurriculumDeckReference(reference);
    const graph = resolveGlobalCurriculum(root, { requireSubjects: true });
    if (graph.errors.length) {
        throw new Error(`Invalid global curriculum:\n- ${graph.errors.join('\n- ')}`);
    }
    const node = graph.decks.find(candidate => candidate.id === `${subject}/${deck}`);
    if (!node) throw new Error(`Deck ${subject}/${deck} is not declared in the global curriculum.`);

    const deckPath = path.join(root, subject, deck);
    let created = null;
    if (!existsSync(deckPath)) {
        created = await createDeck({
            subject,
            deck,
            notesRoot: root,
            initializeGit,
            description: node.description
        });
    } else if (!existsSync(path.join(deckPath, 'deck.toml'))) {
        throw new Error(`Existing directory is not a flashcard deck: ${deckPath}`);
    }

    const synced = syncDeckPrerequisitesFromSubject(deckPath, { requireEntry: true });
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

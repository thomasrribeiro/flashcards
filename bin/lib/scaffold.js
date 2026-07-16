import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
    FLASHCARDS_ROOT,
    normalizeChapterName,
    requireKebabSlug,
    resolveNotesRoot,
    resolvePath,
    titleFromSlug,
    tomlString
} from './paths.js';

const TEMPLATE_ROOT = path.join(FLASHCARDS_ROOT, 'templates', 'scaffold');

async function exists(target) {
    try {
        await stat(target);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

async function renderTemplate(relativePath, values) {
    let content = await readFile(path.join(TEMPLATE_ROOT, relativePath), 'utf8');
    for (const [key, value] of Object.entries(values)) {
        content = content.replaceAll(`{{${key}}}`, String(value));
    }
    return content;
}

async function writeNewFile(target, content) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { encoding: 'utf8', flag: fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY });
}

async function writeIfMissing(target, content) {
    if (await exists(target)) return false;
    await writeNewFile(target, content);
    return true;
}

function commonValues({
    subject,
    deck = '',
    level = '',
    description = '',
    prerequisiteDecks = [],
    assumedTools = []
}) {
    return {
        SUBJECT: subject,
        SUBJECT_TITLE: titleFromSlug(subject),
        DECK: deck,
        DECK_TITLE: deck ? titleFromSlug(deck) : '',
        LEVEL: level,
        DESCRIPTION: description,
        PREREQUISITE_DECKS: prerequisiteDecks.map(tomlString).join(', '),
        ASSUMED_TOOLS: assumedTools.map(tomlString).join(', '),
        DATE: new Date().toISOString().slice(0, 10),
        FLASHCARDS_ROOT
    };
}

export async function ensureSubject({ subject, notesRoot, title }) {
    requireKebabSlug(subject, 'Subject');
    const root = resolveNotesRoot(notesRoot);
    const subjectPath = path.join(root, subject);
    const values = commonValues({ subject });
    if (title) values.SUBJECT_TITLE = title;

    await mkdir(subjectPath, { recursive: true });
    const created = [];
    for (const name of ['AGENTS.md', 'ROADMAP.md', 'SUBJECT_BRIEF.md']) {
        const target = path.join(subjectPath, name);
        if (await writeIfMissing(target, await renderTemplate(`subject/${name}`, values))) created.push(target);
    }
    return { subjectPath, created };
}

export async function createDeck({
    subject,
    deck,
    notesRoot,
    level = 'introductory-college',
    description,
    initializeGit = true,
    chapters = [],
    prerequisiteDecks = [],
    assumedTools = []
}) {
    requireKebabSlug(subject, 'Subject');
    requireKebabSlug(deck, 'Deck');
    for (const reference of prerequisiteDecks) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reference)) {
            throw new Error(`Prerequisite deck must use subject/deck lowercase kebab-case: ${reference}`);
        }
    }
    for (const tool of assumedTools) requireKebabSlug(tool, 'Assumed tool');
    const root = resolveNotesRoot(notesRoot);
    const subjectPath = path.join(root, subject);
    const deckPath = path.join(subjectPath, deck);
    if (await exists(deckPath)) throw new Error(`Deck directory already exists: ${deckPath}`);
    const normalizedChapters = chapters.map(normalizeChapterName);
    if (new Set(normalizedChapters).size !== normalizedChapters.length) {
        throw new Error('Initial chapter names must be unique after normalization.');
    }
    if (normalizedChapters.length > 99) throw new Error('A deck may contain at most 99 ordered chapter files.');
    const { created: subjectFiles } = await ensureSubject({ subject, notesRoot: root });

    const summary = description || `Spaced-repetition deck for ${titleFromSlug(deck)}.`;
    const values = commonValues({ subject, deck, level, description: summary, prerequisiteDecks, assumedTools });
    await mkdir(path.join(deckPath, 'flashcards'), { recursive: true });
    await mkdir(path.join(deckPath, 'figures'), { recursive: true });
    await mkdir(path.join(deckPath, 'references'), { recursive: true });
    await mkdir(path.join(deckPath, '.flashcards', 'audits'), { recursive: true });

    const files = [
        ['AGENTS.md', 'AGENTS.md'],
        ['CARD_README.md', 'CARD_README.md'],
        ['README.md', 'README.md'],
        ['deck.toml', 'deck.toml'],
        ['gitignore', '.gitignore']
    ];
    for (const [template, destination] of files) {
        await writeNewFile(path.join(deckPath, destination), await renderTemplate(`deck/${template}`, values));
    }
    await writeNewFile(path.join(deckPath, 'flashcards', '.gitkeep'), '');
    await writeNewFile(path.join(deckPath, 'figures', '.gitkeep'), '');
    await writeNewFile(path.join(deckPath, 'references', '.gitkeep'), '');
    await writeNewFile(path.join(deckPath, '.flashcards', 'audits', '.gitkeep'), '');

    const chapterResults = [];
    for (const chapter of normalizedChapters) {
        chapterResults.push(await addChapter({ deckPath, name: chapter }));
    }

    let gitInitialized = false;
    if (initializeGit) {
        const result = spawnSync('git', ['init', '-b', 'master'], { cwd: deckPath, encoding: 'utf8' });
        if (result.error) throw new Error(`Unable to initialize Git: ${result.error.message}`);
        if (result.status !== 0) throw new Error(`Unable to initialize Git: ${result.stderr.trim()}`);
        gitInitialized = true;
    }

    return { deckPath, subjectPath, subjectFiles, chapterResults, gitInitialized };
}

async function nextChapterOrder(deckPath) {
    const dir = path.join(deckPath, 'flashcards');
    const entries = await readdir(dir);
    const orders = entries
        .map(name => /^(\d{2})_/.exec(name)?.[1])
        .filter(Boolean)
        .map(Number);
    return orders.length === 0 ? 1 : Math.max(...orders) + 1;
}

async function readDeckSubject(deckPath) {
    const manifestPath = path.join(deckPath, 'deck.toml');
    if (await exists(manifestPath)) {
        const manifest = await readFile(manifestPath, 'utf8');
        const match = /^subject\s*=\s*"([^"]+)"/m.exec(manifest);
        if (match) return requireKebabSlug(match[1], 'Subject');
    }
    const entries = (await readdir(path.join(deckPath, 'flashcards')))
        .filter(name => name.endsWith('.md'))
        .sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
        const markdown = await readFile(path.join(deckPath, 'flashcards', entry), 'utf8');
        const match = /^subject\s*=\s*"([^"]+)"/m.exec(markdown);
        if (match) return requireKebabSlug(match[1], 'Subject');
    }
    return requireKebabSlug(path.basename(path.dirname(deckPath)), 'Subject');
}

export async function addChapter({ deckPath: inputPath, name, order, prerequisites, provides = [] }) {
    const deckPath = resolvePath(inputPath);
    const flashcardsPath = path.join(deckPath, 'flashcards');
    if (!(await exists(flashcardsPath))) {
        throw new Error(`Not a flashcard deck (missing flashcards/): ${deckPath}`);
    }
    const chapter = normalizeChapterName(name);
    const resolvedOrder = order == null ? await nextChapterOrder(deckPath) : Number(order);
    if (!Number.isInteger(resolvedOrder) || resolvedOrder < 1 || resolvedOrder > 99) {
        throw new Error('Chapter order must be an integer from 1 to 99.');
    }
    const prefix = String(resolvedOrder).padStart(2, '0');
    const filename = `${prefix}_${chapter}.md`;
    const filePath = path.join(flashcardsPath, filename);
    const figurePath = path.join(deckPath, 'figures', `${prefix}_${chapter}`);
    if (await exists(filePath)) throw new Error(`Chapter file already exists: ${filePath}`);
    if (await exists(figurePath)) throw new Error(`Chapter figure directory already exists: ${figurePath}`);
    const subject = await readDeckSubject(deckPath);
    const deck = path.basename(deckPath);
    const entries = (await readdir(flashcardsPath))
        .map(entry => /^(\d{2}_.+)\.md$/.exec(entry)?.[1])
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    const previous = entries
        .filter(entry => Number(entry.slice(0, 2)) < resolvedOrder)
        .at(-1);
    const resolvedPrerequisites = prerequisites == null
        ? previous ? [`chapter:${previous}`] : []
        : prerequisites;
    for (const reference of resolvedPrerequisites) {
        if (!/^(?:chapter:\d{2}_[a-z0-9]+(?:_[a-z0-9]+)*|concept:[a-z0-9]+(?:-[a-z0-9]+)*|deck:[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*|tool:[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(reference)) {
            throw new Error(`Invalid chapter prerequisite reference: ${reference}`);
        }
    }
    for (const concept of provides) requireKebabSlug(concept, 'Provided concept');
    const content = `+++\norder = ${resolvedOrder}\nsubject = ${tomlString(subject)}\ntags = [${tomlString(deck)}]\nprerequisites = [${resolvedPrerequisites.map(tomlString).join(', ')}]\nprovides = [${provides.map(tomlString).join(', ')}]\n+++\n\n<!-- Add atomic card blocks here. Every new block requires a stable card-id. -->\n`;
    await writeNewFile(filePath, content);
    await mkdir(figurePath, { recursive: true });
    await writeNewFile(path.join(figurePath, '.gitkeep'), '');
    return { filePath, figurePath, order: resolvedOrder, chapter };
}

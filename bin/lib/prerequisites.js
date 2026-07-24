import { createHash } from 'node:crypto';
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs';
import path from 'node:path';
import { resolvePath } from './paths.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHAPTER_ID = /^\d{2}_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const DECK_REF = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assignmentSource(content, key, section) {
    let source = content;
    if (section) {
        const header = new RegExp(`^\\[${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*$`, 'm');
        const match = header.exec(content);
        if (!match) return null;
        const start = match.index + match[0].length;
        const next = /^\[[^\]]+\]\s*$/m.exec(content.slice(start));
        source = content.slice(start, next ? start + next.index : content.length);
    }
    const match = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'm').exec(source);
    if (!match) return null;
    return source.slice(match.index + match[0].length);
}

function parseString(content, key, { section, required = false, sourceName = 'TOML' } = {}) {
    const source = assignmentSource(content, key, section);
    if (source == null) {
        if (required) throw new Error(`${sourceName}: missing ${section ? `[${section}].` : ''}${key}`);
        return { present: false, value: undefined };
    }
    const match = /^\s*("(?:\\.|[^"\\])*")/.exec(source);
    if (!match) throw new Error(`${sourceName}: ${section ? `[${section}].` : ''}${key} must be a quoted string`);
    return { present: true, value: JSON.parse(match[1]) };
}

function parseInteger(content, key, { required = false, sourceName = 'TOML' } = {}) {
    const source = assignmentSource(content, key);
    if (source == null) {
        if (required) throw new Error(`${sourceName}: missing ${key}`);
        return { present: false, value: undefined };
    }
    const match = /^\s*(\d+)/.exec(source);
    if (!match) throw new Error(`${sourceName}: ${key} must be a non-negative integer`);
    return { present: true, value: Number(match[1]) };
}

function parseStringArray(content, key, { section, required = false, sourceName = 'TOML' } = {}) {
    const source = assignmentSource(content, key, section);
    if (source == null) {
        if (required) throw new Error(`${sourceName}: missing ${section ? `[${section}].` : ''}${key}`);
        return { present: false, value: [] };
    }
    let index = 0;
    while (/\s/.test(source[index] || '')) index += 1;
    if (source[index] !== '[') {
        throw new Error(`${sourceName}: ${section ? `[${section}].` : ''}${key} must be an array of quoted strings`);
    }
    index += 1;
    const values = [];
    while (index < source.length) {
        while (true) {
            while (/\s/.test(source[index] || '')) index += 1;
            if (source[index] !== '#') break;
            while (index < source.length && source[index] !== '\n') index += 1;
        }
        if (source[index] === ']') return { present: true, value: values };
        if (source[index] !== '"') {
            throw new Error(`${sourceName}: ${section ? `[${section}].` : ''}${key} contains a non-string value`);
        }
        const start = index;
        index += 1;
        let escaped = false;
        while (index < source.length) {
            const character = source[index];
            if (!escaped && character === '"') break;
            if (!escaped && character === '\\') escaped = true;
            else escaped = false;
            index += 1;
        }
        if (source[index] !== '"') throw new Error(`${sourceName}: unterminated string in ${key}`);
        index += 1;
        values.push(JSON.parse(source.slice(start, index)));
        while (true) {
            while (/\s/.test(source[index] || '')) index += 1;
            if (source[index] !== '#') break;
            while (index < source.length && source[index] !== '\n') index += 1;
        }
        if (source[index] === ']') return { present: true, value: values };
        if (source[index] !== ',') {
            throw new Error(`${sourceName}: ${section ? `[${section}].` : ''}${key} requires commas between values`);
        }
        index += 1;
    }
    throw new Error(`${sourceName}: unterminated array for ${key}`);
}

function frontmatter(markdown, sourceName) {
    const match = /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/.exec(markdown);
    if (!match) throw new Error(`${sourceName}: missing TOML frontmatter`);
    return match[1];
}

function unique(values, label, errors) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) errors.push(`${label}: duplicate value ${JSON.stringify(value)}`);
        seen.add(value);
    }
}

function readDeckIdentity(deckPath, errors) {
    const manifestPath = path.join(deckPath, 'deck.toml');
    if (!existsSync(manifestPath)) {
        errors.push(`Missing deck.toml: ${deckPath}`);
        return null;
    }
    const content = readFileSync(manifestPath, 'utf8');
    const sourceName = manifestPath;
    try {
        const schemaVersion = parseInteger(content, 'schema_version', { required: true, sourceName }).value;
        const subject = parseString(content, 'subject', { required: true, sourceName }).value;
        const deck = parseString(content, 'deck', { required: true, sourceName }).value;
        const deckDependencies = parseStringArray(content, 'decks', {
            section: 'prerequisites',
            required: schemaVersion >= 2,
            sourceName
        });
        const assumedTools = parseStringArray(content, 'assumed_tools', {
            section: 'prerequisites',
            required: schemaVersion >= 2,
            sourceName
        });
        if (!SLUG.test(subject)) errors.push(`${manifestPath}: subject must be lowercase kebab-case`);
        if (!SLUG.test(deck)) errors.push(`${manifestPath}: deck must be lowercase kebab-case`);
        for (const reference of deckDependencies.value) {
            if (!DECK_REF.test(reference)) errors.push(`${manifestPath}: invalid prerequisite deck ${JSON.stringify(reference)}; expected subject/deck`);
        }
        for (const tool of assumedTools.value) {
            if (!SLUG.test(tool)) errors.push(`${manifestPath}: invalid assumed tool ${JSON.stringify(tool)}; expected lowercase kebab-case`);
        }
        unique(deckDependencies.value, `${manifestPath} prerequisite decks`, errors);
        unique(assumedTools.value, `${manifestPath} assumed tools`, errors);
        return {
            path: deckPath,
            manifestPath,
            schemaVersion,
            id: `${subject}/${deck}`,
            subject,
            deck,
            deckDependencies: deckDependencies.value,
            assumedTools: assumedTools.value,
            explicitPrerequisites: deckDependencies.present && assumedTools.present
        };
    } catch (error) {
        errors.push(error.message);
        return null;
    }
}

function readChapters(deck, errors, warnings) {
    const directory = path.join(deck.path, 'flashcards');
    if (!existsSync(directory)) {
        errors.push(`Missing flashcards directory: ${directory}`);
        return [];
    }
    const chapters = readdirSync(directory)
        .filter(name => /^\d{2}_.+\.md$/.test(name))
        .sort((a, b) => a.localeCompare(b))
        .map(filename => {
            const filePath = path.join(directory, filename);
            const id = filename.replace(/\.md$/, '');
            const filenameOrder = Number(filename.slice(0, 2));
            try {
                if (!CHAPTER_ID.test(id)) errors.push(`${filePath}: chapter filename must use NN_snake_case.md`);
                const metadata = frontmatter(readFileSync(filePath, 'utf8'), filePath);
                const order = parseInteger(metadata, 'order', { required: true, sourceName: filePath }).value;
                const prerequisites = parseStringArray(metadata, 'prerequisites', {
                    required: deck.schemaVersion >= 2,
                    sourceName: filePath
                });
                const provides = parseStringArray(metadata, 'provides', {
                    required: deck.schemaVersion >= 2,
                    sourceName: filePath
                });
                if (order !== filenameOrder) errors.push(`${filePath}: frontmatter order ${order} does not match filename order ${filenameOrder}`);
                for (const concept of provides.value) {
                    if (!SLUG.test(concept)) errors.push(`${filePath}: invalid provided concept ${JSON.stringify(concept)}; expected lowercase kebab-case`);
                }
                unique(prerequisites.value, `${filePath} prerequisites`, errors);
                unique(provides.value, `${filePath} provided concepts`, errors);
                return {
                    id,
                    filename,
                    path: filePath,
                    order,
                    prerequisites: prerequisites.value,
                    prerequisitesExplicit: prerequisites.present,
                    provides: provides.value,
                    providesExplicit: provides.present,
                    dependencies: [],
                    dependencyDetails: []
                };
            } catch (error) {
                errors.push(error.message);
                return {
                    id,
                    filename,
                    path: filePath,
                    order: filenameOrder,
                    prerequisites: [],
                    prerequisitesExplicit: false,
                    provides: [],
                    providesExplicit: false,
                    dependencies: [],
                    dependencyDetails: []
                };
            }
        });
    const orderMap = new Map();
    for (const chapter of chapters) {
        if (orderMap.has(chapter.order)) errors.push(`${deck.path}: duplicate chapter order ${chapter.order}`);
        orderMap.set(chapter.order, chapter.id);
    }
    for (const chapter of chapters) {
        if (!chapter.prerequisitesExplicit && deck.schemaVersion < 2) {
            chapter.prerequisites = chapters
                .filter(candidate => candidate.order < chapter.order)
                .map(candidate => `chapter:${candidate.id}`);
            chapter.prerequisiteMode = 'legacy-inferred';
        } else {
            chapter.prerequisiteMode = 'explicit';
        }
    }
    if (deck.schemaVersion < 2 && chapters.some(chapter => !chapter.prerequisitesExplicit)) {
        warnings.push(`${deck.path}: schema-v1 compatibility infers every earlier ordered chapter as a prerequisite; migrate to schema_version = 2 for sparse explicit edges`);
    }
    return chapters;
}

function conceptProviders(chapters, deckId, errors) {
    const providers = new Map();
    for (const chapter of chapters) {
        for (const concept of chapter.provides) {
            if (!providers.has(concept)) providers.set(concept, []);
            providers.get(concept).push(chapter);
        }
    }
    for (const [concept, matches] of providers) {
        if (matches.length > 1) {
            errors.push(`${deckId}: concept:${concept} is provided by multiple chapters: ${matches.map(chapter => chapter.id).join(', ')}`);
        }
    }
    return providers;
}

function qualifiedConcept(reference) {
    const match = /^concept:([a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*)#([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(reference);
    return match ? { deckId: match[1], concept: match[2] } : null;
}

function resolveChapterEdges(deck, chapters, externalDeckIds, externalChapters, errors) {
    const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));
    const providers = conceptProviders(chapters, deck.path, errors);
    const externalProviders = new Map([...externalChapters].map(([deckId, deckChapters]) => [
        deckId,
        conceptProviders(deckChapters, deckId, errors)
    ]));
    const toolSet = new Set(deck.assumedTools);
    for (const chapter of chapters) {
        for (const reference of chapter.prerequisites) {
            if (reference.startsWith('chapter:')) {
                const id = reference.slice('chapter:'.length).replace(/\.md$/, '');
                const dependency = byId.get(id);
                if (!dependency) {
                    errors.push(`${chapter.path}: unknown prerequisite ${reference}`);
                    continue;
                }
                chapter.dependencies.push(dependency.id);
                chapter.dependencyDetails.push({ reference, kind: 'chapter', resolved: dependency.id });
                if (dependency.order >= chapter.order) {
                    errors.push(`${chapter.path}: ${reference} must point to an earlier chapter`);
                }
            } else if (qualifiedConcept(reference)) {
                const { deckId, concept } = qualifiedConcept(reference);
                if (!externalDeckIds.has(deckId)) {
                    errors.push(`${chapter.path}: ${reference} is not in the transitive deck.toml prerequisite closure`);
                    continue;
                }
                const matches = externalProviders.get(deckId)?.get(concept) || [];
                if (matches.length !== 1) {
                    errors.push(`${chapter.path}: ${reference} must resolve to exactly one external provider`);
                    continue;
                }
                const dependency = matches[0];
                chapter.dependencyDetails.push({
                    reference,
                    kind: 'external-concept',
                    resolved: `${deckId}#${dependency.id}`,
                    deck: deckId,
                    chapter: dependency.id,
                    concept
                });
            } else if (reference.startsWith('concept:')) {
                const concept = reference.slice('concept:'.length);
                const matches = providers.get(concept) || [];
                if (matches.length !== 1) {
                    errors.push(`${chapter.path}: ${reference} must resolve to exactly one local provider`);
                    continue;
                }
                const dependency = matches[0];
                chapter.dependencies.push(dependency.id);
                chapter.dependencyDetails.push({ reference, kind: 'concept', resolved: dependency.id });
                if (dependency.order >= chapter.order) {
                    errors.push(`${chapter.path}: ${reference} is provided by ${dependency.id}, which is not earlier`);
                }
            } else if (reference.startsWith('deck:')) {
                const deckReference = reference.slice('deck:'.length);
                if (!externalDeckIds.has(deckReference)) {
                    errors.push(`${chapter.path}: ${reference} is not declared in deck.toml [prerequisites].decks`);
                    continue;
                }
                chapter.dependencyDetails.push({ reference, kind: 'deck', resolved: deckReference });
            } else if (reference.startsWith('tool:')) {
                const tool = reference.slice('tool:'.length);
                if (!toolSet.has(tool)) {
                    errors.push(`${chapter.path}: ${reference} is not declared in deck.toml [prerequisites].assumed_tools`);
                    continue;
                }
                chapter.dependencyDetails.push({ reference, kind: 'tool', resolved: tool });
            } else {
                errors.push(`${chapter.path}: invalid prerequisite ${JSON.stringify(reference)}; use chapter:, concept:, concept:subject/deck#concept, deck:, or tool:`);
            }
        }
        chapter.dependencies = [...new Set(chapter.dependencies)];
    }

    const state = new Map();
    const stack = [];
    const visit = chapter => {
        const current = state.get(chapter.id);
        if (current === 'done') return;
        if (current === 'visiting') {
            const start = stack.indexOf(chapter.id);
            errors.push(`${deck.path}: chapter prerequisite cycle: ${[...stack.slice(start), chapter.id].join(' -> ')}`);
            return;
        }
        state.set(chapter.id, 'visiting');
        stack.push(chapter.id);
        for (const dependency of chapter.dependencies) visit(byId.get(dependency));
        stack.pop();
        state.set(chapter.id, 'done');
    };
    for (const chapter of chapters) visit(chapter);
}

export function resolvePrerequisiteGraph(inputPath) {
    const deckPath = resolvePath(inputPath);
    const collectionRoot = path.dirname(path.dirname(deckPath));
    const errors = [];
    const warnings = [];
    const root = readDeckIdentity(deckPath, errors);
    if (!root) return { deckPath, collectionRoot, root: null, decks: [], chapters: [], errors, warnings };

    const decksById = new Map();
    const visiting = [];
    const visitDeck = deck => {
        if (decksById.has(deck.id)) return;
        if (visiting.includes(deck.id)) {
            errors.push(`Deck prerequisite cycle: ${[...visiting.slice(visiting.indexOf(deck.id)), deck.id].join(' -> ')}`);
            return;
        }
        visiting.push(deck.id);
        decksById.set(deck.id, deck);
        for (const reference of deck.deckDependencies) {
            const dependencyPath = path.join(collectionRoot, ...reference.split('/'));
            const dependency = readDeckIdentity(dependencyPath, errors);
            if (!dependency) continue;
            if (dependency.id !== reference) {
                errors.push(`${dependency.manifestPath}: declares ${dependency.id}, but was referenced as ${reference}`);
            }
            if (visiting.includes(dependency.id)) {
                errors.push(`Deck prerequisite cycle: ${[...visiting.slice(visiting.indexOf(dependency.id)), dependency.id].join(' -> ')}`);
                continue;
            }
            visitDeck(dependency);
        }
        visiting.pop();
    };
    visitDeck(root);

    const externalDeckIds = new Set([...decksById.keys()].filter(id => id !== root.id));
    const decks = [...decksById.values()];
    const chapters = readChapters(root, errors, warnings);
    const externalChapters = new Map(decks
        .filter(deck => deck.id !== root.id)
        .map(deck => [deck.id, readChapters(deck, errors, warnings)]));
    resolveChapterEdges(root, chapters, externalDeckIds, externalChapters, errors);
    return {
        deckPath,
        collectionRoot,
        root,
        decks,
        externalDecks: decks.filter(deck => deck.id !== root.id),
        externalChapters: Object.fromEntries([...externalChapters].map(([id, deckChapters]) => [
            id,
            deckChapters.map(chapter => ({
                id: chapter.id,
                filename: chapter.filename,
                order: chapter.order,
                provides: chapter.provides
            }))
        ])),
        chapters,
        errors: [...new Set(errors)],
        warnings: [...new Set(warnings)]
    };
}

export function resolveChapterClosure(graph, chapterSelector) {
    if (graph.errors.length) throw new Error(`Invalid prerequisite graph:\n- ${graph.errors.join('\n- ')}`);
    const chapter = typeof chapterSelector === 'number'
        ? graph.chapters.find(candidate => candidate.order === chapterSelector)
        : graph.chapters.find(candidate => candidate.id === String(chapterSelector).replace(/\.md$/, ''));
    if (!chapter) throw new Error(`No ordered chapter ${chapterSelector} exists in ${graph.deckPath}.`);
    const byId = new Map(graph.chapters.map(candidate => [candidate.id, candidate]));
    const closure = new Set();
    const visit = current => {
        for (const dependency of current.dependencies) {
            if (closure.has(dependency)) continue;
            closure.add(dependency);
            visit(byId.get(dependency));
        }
    };
    visit(chapter);
    const localChapters = graph.chapters
        .filter(candidate => closure.has(candidate.id))
        .sort((a, b) => a.order - b.order);
    const externalConcepts = [...localChapters, chapter]
        .flatMap(candidate => candidate.dependencyDetails)
        .filter(detail => detail.kind === 'external-concept')
        .map(detail => ({
            reference: detail.reference,
            deck: detail.deck,
            chapter: detail.chapter,
            concept: detail.concept,
            resolved: detail.resolved
        }))
        .filter((item, index, items) =>
            items.findIndex(candidate => candidate.reference === item.reference) === index);
    return {
        chapter,
        localChapters,
        localChapterIds: localChapters.map(candidate => candidate.id),
        externalDecks: graph.externalDecks,
        externalDeckIds: graph.externalDecks.map(deck => deck.id),
        externalConcepts,
        assumedTools: graph.root.assumedTools,
        mode: chapter.prerequisiteMode
    };
}

export function formatPrerequisiteGraph(graph, { chapter } = {}) {
    const lines = [
        `Prerequisite graph: ${graph.root?.id || graph.deckPath}`,
        `Schema: ${graph.root?.schemaVersion ?? 'invalid'}`
    ];
    if (graph.root) {
        lines.push(`Deck prerequisites: ${graph.root.deckDependencies.length ? graph.root.deckDependencies.join(', ') : 'none'}`);
        lines.push(`Assumed tools: ${graph.root.assumedTools.length ? graph.root.assumedTools.join(', ') : 'none'}`);
    }
    if (chapter != null && !graph.errors.length) {
        const resolution = resolveChapterClosure(graph, chapter);
        lines.push(`Target chapter: ${resolution.chapter.id}`);
        lines.push(`Local prerequisite closure: ${resolution.localChapterIds.length ? resolution.localChapterIds.join(', ') : 'none'}`);
        lines.push(`External deck closure: ${resolution.externalDeckIds.length ? resolution.externalDeckIds.join(', ') : 'none'}`);
        lines.push(`Exact external providers: ${resolution.externalConcepts.length
            ? resolution.externalConcepts.map(item => `${item.deck}#${item.chapter} (${item.concept})`).join(', ')
            : 'none'}`);
        lines.push(`Edge mode: ${resolution.mode}`);
    }
    lines.push('', 'Chapters:');
    for (const item of graph.chapters) {
        lines.push(`- ${item.id} [${item.prerequisiteMode}]: ${item.prerequisites.length ? item.prerequisites.join(', ') : 'none'}`);
        if (item.provides.length) lines.push(`  provides: ${item.provides.join(', ')}`);
    }
    if (graph.warnings.length) {
        lines.push('', 'Warnings:', ...graph.warnings.map(warning => `- ${warning}`));
    }
    if (graph.errors.length) {
        lines.push('', 'Errors:', ...graph.errors.map(error => `- ${error}`));
    }
    return lines.join('\n');
}

function insertManifestPrerequisites(content) {
    let updated = content.replace(/^schema_version\s*=\s*\d+\s*$/m, 'schema_version = 2');
    const sectionMatch = /^\[prerequisites\]\s*$/m.exec(updated);
    if (!sectionMatch) {
        const nextSection = /^\[[^\]]+\]\s*$/m.exec(updated);
        const insertion = '[prerequisites]\ndecks = []\nassumed_tools = []\n\n';
        return nextSection
            ? `${updated.slice(0, nextSection.index)}${insertion}${updated.slice(nextSection.index)}`
            : `${updated.trimEnd()}\n\n${insertion}`;
    }
    const sectionStart = sectionMatch.index + sectionMatch[0].length;
    const sectionTail = updated.slice(sectionStart);
    const nextSection = /^\[[^\]]+\]\s*$/m.exec(sectionTail);
    const sectionEnd = nextSection ? sectionStart + nextSection.index : updated.length;
    const body = updated.slice(sectionStart, sectionEnd);
    const additions = [];
    if (!/^\s*decks\s*=/m.test(body)) additions.push('decks = []');
    if (!/^\s*assumed_tools\s*=/m.test(body)) additions.push('assumed_tools = []');
    if (!additions.length) return updated;
    return `${updated.slice(0, sectionStart)}\n${additions.join('\n')}${updated.slice(sectionStart)}`;
}

function migrateChapterFrontmatter(markdown, chapter, prerequisites) {
    const match = /^(\+\+\+\r?\n)([\s\S]*?)(\r?\n\+\+\+)/.exec(markdown);
    if (!match) throw new Error(`${chapter.path}: missing TOML frontmatter`);
    let metadata = match[2];
    if (assignmentSource(metadata, 'prerequisites') == null) {
        metadata = `${metadata.trimEnd()}\nprerequisites = [${prerequisites.map(value => JSON.stringify(value)).join(', ')}]`;
    }
    if (assignmentSource(metadata, 'provides') == null) {
        metadata = `${metadata.trimEnd()}\nprovides = []`;
    }
    return `${match[1]}${metadata}${match[3]}${markdown.slice(match[0].length)}`;
}

export function migratePrerequisites(inputPath, { check = false } = {}) {
    const deckPath = resolvePath(inputPath);
    const graph = resolvePrerequisiteGraph(deckPath);
    if (graph.errors.length) throw new Error(`Cannot migrate an invalid prerequisite graph:\n- ${graph.errors.join('\n- ')}`);
    const changes = [];
    const manifestPath = path.join(deckPath, 'deck.toml');
    const manifest = readFileSync(manifestPath, 'utf8');
    const migratedManifest = insertManifestPrerequisites(manifest);
    if (migratedManifest !== manifest) {
        changes.push(manifestPath);
        if (!check) writeFileSync(manifestPath, migratedManifest);
    }
    for (const [index, chapter] of graph.chapters.entries()) {
        const markdown = readFileSync(chapter.path, 'utf8');
        const prerequisites = chapter.prerequisitesExplicit
            ? chapter.prerequisites
            : index > 0 ? [`chapter:${graph.chapters[index - 1].id}`] : [];
        const migrated = migrateChapterFrontmatter(markdown, chapter, prerequisites);
        if (migrated !== markdown) {
            changes.push(chapter.path);
            if (!check) writeFileSync(chapter.path, migrated);
        }
    }
    const migratedGraph = check ? graph : resolvePrerequisiteGraph(deckPath);
    if (!check && migratedGraph.errors.length) {
        throw new Error(`Prerequisite migration produced an invalid graph:\n- ${migratedGraph.errors.join('\n- ')}`);
    }
    return { deckPath, changed: changes, graph: migratedGraph };
}

export function constrainWorkspaceToChapter(workspacePath, resolution) {
    const allowed = new Set([...resolution.localChapterIds, resolution.chapter.id]);
    const flashcardsPath = path.join(workspacePath, 'flashcards');
    for (const filename of readdirSync(flashcardsPath)) {
        if (!/^\d{2}_.+\.md$/.test(filename)) continue;
        if (!allowed.has(filename.replace(/\.md$/, ''))) rmSync(path.join(flashcardsPath, filename));
    }
    const figuresPath = path.join(workspacePath, 'figures');
    if (existsSync(figuresPath)) {
        for (const name of readdirSync(figuresPath)) {
            const target = path.join(figuresPath, name);
            if (statSync(target).isDirectory() && /^\d{2}_/.test(name) && !allowed.has(name)) {
                rmSync(target, { recursive: true, force: true });
            }
        }
    }
    const auditsPath = path.join(workspacePath, '.flashcards', 'audits');
    if (existsSync(auditsPath)) {
        for (const filename of readdirSync(auditsPath)) {
            if (filename.endsWith('.md')) rmSync(path.join(auditsPath, filename));
        }
    }
}

export function compactTransitivePrerequisiteChapters(workspacePath, resolution) {
    if (!resolution?.chapter) return { direct: [], summarized: [] };
    const direct = new Set(resolution.chapter.dependencies);
    const summarized = resolution.localChapters.filter(chapter => !direct.has(chapter.id));
    for (const chapter of summarized) {
        const chapterPath = path.join(workspacePath, 'flashcards', chapter.filename);
        summarizePrerequisiteChapter(chapterPath, chapter, {
            scope: 'transitive local prerequisite',
            guidance: 'Use the complete scheduled cards in the direct prerequisite chapter instead of inferring additional knowledge from this summary.'
        });
        rmSync(path.join(workspacePath, 'figures', chapter.id), { recursive: true, force: true });
    }
    return {
        direct: resolution.localChapters.filter(chapter => direct.has(chapter.id)).map(chapter => chapter.id),
        summarized: summarized.map(chapter => chapter.id)
    };
}

function summarizePrerequisiteChapter(chapterPath, chapter, { scope, guidance }) {
    const markdown = readFileSync(chapterPath, 'utf8');
    const chapterFrontmatter = /^\+\+\+\r?\n[\s\S]*?\r?\n\+\+\+\r?\n?/.exec(markdown)?.[0];
    if (!chapterFrontmatter) {
        throw new Error(`Cannot summarize prerequisite chapter without TOML frontmatter: ${chapterPath}`);
    }
    const capabilities = chapter.provides.length
        ? chapter.provides.map(value => `\`${value}\``).join(', ')
        : 'none declared';
    writeFileSync(
        chapterPath,
        `${chapterFrontmatter}\n# Bounded prerequisite summary\n\n` +
        `The scheduled card bodies for this ${scope} are intentionally omitted from this isolated run.\n` +
        `Its validator-resolved capabilities are: ${capabilities}.\n` +
        `${guidance}\n`
    );
}

export function compactExternalPrerequisiteChapters(workspacePath, graph, resolution) {
    if (!resolution?.chapter) return { complete: [], summarized: [] };
    const exactProviders = new Set(
        resolution.externalConcepts.map(item => `${item.deck}#${item.chapter}`)
    );
    const complete = [];
    const summarized = [];
    const root = path.join(workspacePath, '.flashcards', 'prerequisites');

    for (const deck of resolution.externalDecks) {
        for (const chapter of graph.externalChapters[deck.id] || []) {
            const identity = `${deck.id}#${chapter.id}`;
            const chapterPath = path.join(root, ...deck.id.split('/'), 'flashcards', chapter.filename);
            if (exactProviders.has(identity)) {
                complete.push(identity);
                continue;
            }
            summarizePrerequisiteChapter(chapterPath, chapter, {
                scope: 'external prerequisite',
                guidance: 'Treat only the declared capabilities as established; do not infer additional knowledge from omitted card bodies.'
            });
            rmSync(
                path.join(root, ...deck.id.split('/'), 'figures', chapter.id),
                { recursive: true, force: true }
            );
            summarized.push(identity);
        }
    }
    return { complete, summarized };
}

function hashFile(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function inventory(rootPath) {
    const files = [];
    const visit = current => {
        for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name === '.git' || entry.name === 'references') continue;
            const target = path.join(current, entry.name);
            if (entry.isDirectory()) visit(target);
            else if (entry.isFile()) files.push({
                path: path.relative(rootPath, target),
                bytes: statSync(target).size,
                sha256: hashFile(target)
            });
        }
    };
    visit(rootPath);
    return files;
}

export function stageExternalPrerequisites(workspacePath, graph, resolution) {
    const root = path.join(workspacePath, '.flashcards', 'prerequisites');
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    const decks = [];
    for (const dependency of resolution?.externalDecks || graph.externalDecks) {
        const destination = path.join(root, ...dependency.id.split('/'));
        cpSync(dependency.path, destination, {
            recursive: true,
            filter(source) {
                const relative = path.relative(dependency.path, source);
                if (!relative) return true;
                const first = relative.split(path.sep)[0];
                if (['.git', 'references'].includes(first)) return false;
                return !relative.startsWith(path.join('.flashcards', 'runs'));
            }
        });
        decks.push({ id: dependency.id, source: dependency.path, path: destination, files: inventory(destination) });
    }
    const record = {
        targetChapter: resolution?.chapter?.id || null,
        edgeMode: resolution?.mode || 'whole-deck',
        localChapters: resolution?.localChapterIds || graph.chapters.map(chapter => chapter.id),
        directLocalChapters: resolution?.chapter?.dependencies || [],
        summarizedLocalChapters: resolution
            ? resolution.localChapterIds.filter(id => !resolution.chapter.dependencies.includes(id))
            : [],
        externalDecks: decks,
        assumedTools: resolution?.assumedTools || graph.root.assumedTools
    };
    writeFileSync(path.join(root, 'graph.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
}

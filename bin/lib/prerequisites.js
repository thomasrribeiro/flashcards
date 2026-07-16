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

function resolveChapterEdges(deck, chapters, externalDeckIds, errors) {
    const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));
    const providers = new Map();
    for (const chapter of chapters) {
        for (const concept of chapter.provides) {
            if (!providers.has(concept)) providers.set(concept, []);
            providers.get(concept).push(chapter);
        }
    }
    for (const [concept, matches] of providers) {
        if (matches.length > 1) {
            errors.push(`${deck.path}: concept:${concept} is provided by multiple chapters: ${matches.map(chapter => chapter.id).join(', ')}`);
        }
    }
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
                errors.push(`${chapter.path}: invalid prerequisite ${JSON.stringify(reference)}; use chapter:, concept:, deck:, or tool:`);
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

    const chapters = readChapters(root, errors, warnings);
    const externalDeckIds = new Set([...decksById.keys()].filter(id => id !== root.id));
    resolveChapterEdges(root, chapters, externalDeckIds, errors);
    const decks = [...decksById.values()];
    return {
        deckPath,
        collectionRoot,
        root,
        decks,
        externalDecks: decks.filter(deck => deck.id !== root.id),
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
    return {
        chapter,
        localChapters,
        localChapterIds: localChapters.map(candidate => candidate.id),
        externalDecks: graph.externalDecks,
        externalDeckIds: graph.externalDecks.map(deck => deck.id),
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
            const chapterId = /^(\d{2}_.+?)-cold-start\.md$/.exec(filename)?.[1];
            if (chapterId && !allowed.has(chapterId)) rmSync(path.join(auditsPath, filename));
        }
    }
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
        externalDecks: decks,
        assumedTools: resolution?.assumedTools || graph.root.assumedTools
    };
    writeFileSync(path.join(root, 'graph.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
}

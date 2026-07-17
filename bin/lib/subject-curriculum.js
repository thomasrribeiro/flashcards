import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePath } from './paths.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assignmentSource(content, key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^\\s*${escaped}\\s*=`, 'm').exec(content);
    return match ? content.slice(match.index + match[0].length) : null;
}

function parseString(content, key, { required = false, sourceName = 'subject.toml' } = {}) {
    const source = assignmentSource(content, key);
    if (source == null) {
        if (required) throw new Error(`${sourceName}: missing ${key}`);
        return undefined;
    }
    const match = /^\s*("(?:\\.|[^"\\])*")/.exec(source);
    if (!match) throw new Error(`${sourceName}: ${key} must be a quoted string`);
    return JSON.parse(match[1]);
}

function parseInteger(content, key, { required = false, sourceName = 'subject.toml' } = {}) {
    const source = assignmentSource(content, key);
    if (source == null) {
        if (required) throw new Error(`${sourceName}: missing ${key}`);
        return undefined;
    }
    const match = /^\s*(\d+)/.exec(source);
    if (!match) throw new Error(`${sourceName}: ${key} must be a non-negative integer`);
    return Number(match[1]);
}

function parseStringArray(content, key, { required = false, sourceName = 'subject.toml' } = {}) {
    const source = assignmentSource(content, key);
    if (source == null) {
        if (required) throw new Error(`${sourceName}: missing ${key}`);
        return [];
    }
    let index = 0;
    while (/\s/.test(source[index] || '')) index += 1;
    if (source[index] !== '[') throw new Error(`${sourceName}: ${key} must be an array of quoted strings`);
    index += 1;
    const values = [];
    while (index < source.length) {
        while (true) {
            while (/\s/.test(source[index] || '')) index += 1;
            if (source[index] !== '#') break;
            while (index < source.length && source[index] !== '\n') index += 1;
        }
        if (source[index] === ']') return values;
        if (source[index] !== '"') throw new Error(`${sourceName}: ${key} contains a non-string value`);
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
        if (source[index] === ']') return values;
        if (source[index] !== ',') throw new Error(`${sourceName}: ${key} requires commas between values`);
        index += 1;
    }
    throw new Error(`${sourceName}: unterminated array for ${key}`);
}

function deckBlocks(content) {
    const matches = [...content.matchAll(/^\[\[decks\]\]\s*$/gm)];
    return matches.map((match, index) => {
        const start = match.index + match[0].length;
        const end = matches[index + 1]?.index ?? content.length;
        return content.slice(start, end);
    });
}

function unique(values, label, errors) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) errors.push(`${label}: duplicate value ${JSON.stringify(value)}`);
        seen.add(value);
    }
}

function findCycles(decks, errors) {
    const byId = new Map(decks.map(deck => [deck.id, deck]));
    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    const visit = deck => {
        if (visited.has(deck.id)) return;
        if (visiting.has(deck.id)) {
            const start = stack.indexOf(deck.id);
            errors.push(`subject curriculum cycle: ${[...stack.slice(start), deck.id].join(' -> ')}`);
            return;
        }
        visiting.add(deck.id);
        stack.push(deck.id);
        for (const prerequisite of deck.prerequisites) {
            const dependency = byId.get(prerequisite);
            if (dependency) visit(dependency);
        }
        stack.pop();
        visiting.delete(deck.id);
        visited.add(deck.id);
    };
    decks.forEach(visit);
}

export function resolveSubjectCurriculum(inputPath, { requireDecks = false } = {}) {
    const subjectPath = resolvePath(inputPath);
    const manifestPath = path.join(subjectPath, 'subject.toml');
    const errors = [];
    const warnings = [];
    if (!existsSync(subjectPath) || !statSync(subjectPath).isDirectory()) {
        return { subjectPath, manifestPath, subject: path.basename(subjectPath), schemaVersion: null, decks: [], errors: [`Subject path does not exist: ${subjectPath}`], warnings };
    }
    if (!existsSync(manifestPath)) {
        return { subjectPath, manifestPath, subject: path.basename(subjectPath), schemaVersion: null, decks: [], errors: [`Missing subject.toml: ${subjectPath}`], warnings };
    }

    const content = readFileSync(manifestPath, 'utf8');
    let schemaVersion = null;
    let subject = path.basename(subjectPath);
    const decks = [];
    try {
        const firstDeck = /^\[\[decks\]\]\s*$/m.exec(content)?.index ?? content.length;
        const header = content.slice(0, firstDeck);
        schemaVersion = parseInteger(header, 'schema_version', { required: true, sourceName: manifestPath });
        subject = parseString(header, 'subject', { required: true, sourceName: manifestPath });
        if (schemaVersion !== 1) errors.push(`${manifestPath}: unsupported schema_version ${schemaVersion}; expected 1`);
        if (!SLUG.test(subject)) errors.push(`${manifestPath}: subject must be lowercase kebab-case`);
        if (subject !== path.basename(subjectPath)) errors.push(`${manifestPath}: subject ${JSON.stringify(subject)} must match directory ${JSON.stringify(path.basename(subjectPath))}`);

        deckBlocks(content).forEach((block, index) => {
            const sourceName = `${manifestPath} [[decks]] #${index + 1}`;
            const id = parseString(block, 'id', { required: true, sourceName });
            const order = parseInteger(block, 'order', { required: true, sourceName });
            const prerequisites = parseStringArray(block, 'prerequisites', { required: true, sourceName });
            const status = parseString(block, 'status', { sourceName }) || 'proposed';
            const description = parseString(block, 'description', { sourceName }) || '';
            if (!SLUG.test(id)) errors.push(`${sourceName}: id must be lowercase kebab-case`);
            if (!Number.isInteger(order) || order < 1) errors.push(`${sourceName}: order must be a positive integer`);
            if (!SLUG.test(status)) errors.push(`${sourceName}: status must be lowercase kebab-case`);
            for (const dependency of prerequisites) {
                if (!SLUG.test(dependency)) errors.push(`${sourceName}: invalid prerequisite ${JSON.stringify(dependency)}`);
            }
            unique(prerequisites, `${sourceName} prerequisites`, errors);
            decks.push({ id, order, prerequisites, status, description });
        });
    } catch (error) {
        errors.push(error.message);
    }

    unique(decks.map(deck => deck.id), `${manifestPath} deck ids`, errors);
    unique(decks.map(deck => deck.order), `${manifestPath} deck orders`, errors);
    const byId = new Map(decks.map(deck => [deck.id, deck]));
    for (const deck of decks) {
        for (const prerequisite of deck.prerequisites) {
            const dependency = byId.get(prerequisite);
            if (!dependency) {
                errors.push(`${manifestPath}: ${deck.id} references missing prerequisite deck ${prerequisite}`);
            } else if (dependency.order >= deck.order) {
                errors.push(`${manifestPath}: ${deck.id} prerequisite ${prerequisite} must have a lower order`);
            }
        }
    }
    findCycles(decks, errors);
    decks.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    if (decks.length === 0) {
        const message = `${manifestPath}: curriculum contains no decks`;
        if (requireDecks) errors.push(message);
        else warnings.push(message);
    }
    return { subjectPath, manifestPath, subject, schemaVersion, decks, errors, warnings };
}

export function resolveSubjectDeckClosure(graph, deckId) {
    if (graph.errors.length) throw new Error(`Invalid subject curriculum:\n- ${graph.errors.join('\n- ')}`);
    const byId = new Map(graph.decks.map(deck => [deck.id, deck]));
    const target = byId.get(deckId);
    if (!target) throw new Error(`Deck ${deckId} is not declared in ${graph.manifestPath}`);
    const closure = new Set();
    const visit = id => {
        const deck = byId.get(id);
        for (const dependency of deck.prerequisites) {
            visit(dependency);
            closure.add(dependency);
        }
    };
    visit(deckId);
    return {
        deck: target,
        direct: [...target.prerequisites],
        transitive: graph.decks.filter(deck => closure.has(deck.id)).map(deck => deck.id)
    };
}

export function subjectPrerequisiteDecks(subjectPath, deckId) {
    const graph = resolveSubjectCurriculum(subjectPath);
    if (graph.errors.length) throw new Error(`Invalid subject curriculum:\n- ${graph.errors.join('\n- ')}`);
    if (graph.decks.length === 0) return [];
    const resolution = resolveSubjectDeckClosure(graph, deckId);
    return resolution.direct.map(id => `${graph.subject}/${id}`);
}

function replaceDeckPrerequisites(content, prerequisites) {
    const section = /^\[prerequisites\]\s*$/m.exec(content);
    if (!section) throw new Error('deck.toml: missing [prerequisites] section');
    const start = section.index + section[0].length;
    const tail = content.slice(start);
    const next = /^\[[^\]]+\]\s*$/m.exec(tail);
    const end = next ? start + next.index : content.length;
    const body = content.slice(start, end);
    if (!/^\s*decks\s*=/m.test(body)) throw new Error('deck.toml: missing [prerequisites].decks');
    const rendered = `decks = [${prerequisites.map(value => JSON.stringify(value)).join(', ')}]`;
    const updatedBody = body.replace(/^\s*decks\s*=\s*\[[\s\S]*?\]\s*$/m, rendered);
    return `${content.slice(0, start)}${updatedBody}${content.slice(end)}`;
}

function manifestString(content, key) {
    return parseString(content, key, { required: true, sourceName: 'deck.toml' });
}

function manifestPrerequisites(content) {
    const section = /^\[prerequisites\]\s*$/m.exec(content);
    if (!section) return [];
    const start = section.index + section[0].length;
    const tail = content.slice(start);
    const next = /^\[[^\]]+\]\s*$/m.exec(tail);
    return parseStringArray(tail.slice(0, next?.index ?? tail.length), 'decks', { required: true, sourceName: 'deck.toml [prerequisites]' });
}

export function syncDeckPrerequisitesFromSubject(inputPath, { requireEntry = false } = {}) {
    const deckPath = resolvePath(inputPath);
    const manifestPath = path.join(deckPath, 'deck.toml');
    const content = readFileSync(manifestPath, 'utf8');
    const subject = manifestString(content, 'subject');
    const deck = manifestString(content, 'deck');
    const subjectPath = path.dirname(deckPath);
    const graph = resolveSubjectCurriculum(subjectPath);
    if (graph.errors.length) throw new Error(`Invalid subject curriculum:\n- ${graph.errors.join('\n- ')}`);
    const entry = graph.decks.find(candidate => candidate.id === deck);
    if (!entry) {
        if (requireEntry || graph.decks.length > 0) {
            throw new Error(`Deck ${subject}/${deck} is not declared in ${graph.manifestPath}; update the subject curriculum before creating it.`);
        }
        return { deckPath, changed: false, prerequisites: manifestPrerequisites(content), inferred: [] };
    }
    const inferred = entry.prerequisites.map(id => `${subject}/${id}`);
    const prerequisites = [...new Set([...inferred, ...manifestPrerequisites(content)])];
    const updated = replaceDeckPrerequisites(content, prerequisites);
    if (updated !== content) writeFileSync(manifestPath, updated);
    return { deckPath, changed: updated !== content, prerequisites, inferred };
}

export function formatSubjectCurriculum(graph, { deck } = {}) {
    const lines = [
        `Subject curriculum: ${graph.subjectPath}`,
        `Schema: ${graph.schemaVersion ?? 'invalid'}`,
        `Subject: ${graph.subject}`
    ];
    if (deck && !graph.errors.length) {
        try {
            const closure = resolveSubjectDeckClosure(graph, deck);
            lines.push(`Target deck: ${deck}`);
            lines.push(`Direct prerequisites: ${closure.direct.length ? closure.direct.join(', ') : 'none'}`);
            lines.push(`Transitive closure: ${closure.transitive.length ? closure.transitive.join(', ') : 'none'}`);
        } catch (error) {
            lines.push(`Target error: ${error.message}`);
        }
    }
    lines.push('', 'Decks:');
    for (const item of graph.decks) {
        lines.push(`${item.order}. ${item.id} [${item.status}]: ${item.prerequisites.length ? item.prerequisites.join(', ') : 'none'}`);
        if (item.description) lines.push(`   ${item.description}`);
    }
    if (graph.warnings.length) lines.push('', 'Warnings:', ...graph.warnings.map(warning => `- ${warning}`));
    if (graph.errors.length) lines.push('', 'Errors:', ...graph.errors.map(error => `- ${error}`));
    return lines.join('\n');
}

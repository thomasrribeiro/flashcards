import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePath } from './paths.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECK_REF = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
export const SUBJECT_DESTINATIONS = Object.freeze([
    'literacy',
    'undergraduate-core',
    'graduate-core',
    'whole-field',
    'research-specialization'
]);
export const SUBJECT_LEVELS = Object.freeze([
    'foundational',
    'undergraduate-core',
    'undergraduate-advanced',
    'graduate',
    'research-specialization'
]);
export const DECK_GRANULARITY_RANGES = Object.freeze({
    module: Object.freeze([3, 7]),
    course: Object.freeze([6, 14]),
    'broad-area': Object.freeze([10, 20])
});
const DESTINATIONS = new Set(SUBJECT_DESTINATIONS);
const LEVELS = new Set(SUBJECT_LEVELS);
const LEVEL_RANK = new Map(SUBJECT_LEVELS.map((level, index) => [level, index]));
const GRANULARITY_RANGES = new Map(Object.entries(DECK_GRANULARITY_RANGES));
const TIERS = new Set(['core', 'recommended', 'specialization']);
const COVERAGE_DISPOSITIONS = new Set(['included', 'deferred', 'out-of-scope']);

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

function tableBlocks(content, table) {
    const matches = [...content.matchAll(/^\[\[([a-z0-9_-]+)\]\]\s*$/gm)];
    return matches.flatMap((match, index) => {
        if (match[1] !== table) return [];
        const start = match.index + match[0].length;
        const end = matches[index + 1]?.index ?? content.length;
        return [content.slice(start, end)];
    });
}

function unique(values, label, errors) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) errors.push(`${label}: duplicate value ${JSON.stringify(value)}`);
        seen.add(value);
    }
}

export function canonicalDeckReference(subject, reference) {
    return reference.includes('/') ? reference : `${subject}/${reference}`;
}

function markdownSection(content, heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startMatch = new RegExp(`^## ${escaped}\\s*$`, 'm').exec(content);
    if (!startMatch) return null;
    const start = startMatch.index + startMatch[0].length;
    const tail = content.slice(start);
    const next = /^## .+$/m.exec(tail);
    return {
        content: tail.slice(0, next?.index ?? tail.length),
        lineOffset: content.slice(0, start).split('\n').length
    };
}

function markdownCells(line) {
    if (!line.trim().startsWith('|') || !line.trim().endsWith('|')) return [];
    return line.trim().slice(1, -1).split('|').map(cell => cell.trim());
}

function unquoteMarkdown(value) {
    return value.trim().replace(/^`|`$/g, '').trim();
}

function roadmapReferences(value, byOrder, errors, sourceName) {
    if (/^(?:none|—|-)\.?$/i.test(value.trim())) return [];
    return value
        .split(/[;,]/)
        .map(item => unquoteMarkdown(item))
        .filter(Boolean)
        .flatMap(item => {
            if (/^\d+$/.test(item)) {
                const deck = byOrder.get(Number(item));
                if (!deck) {
                    errors.push(`${sourceName}: unknown deck order ${item}`);
                    return [];
                }
                return [deck.id];
            }
            if (!DECK_REF.test(item)) {
                errors.push(`${sourceName}: invalid deck reference ${JSON.stringify(item)}`);
                return [];
            }
            return [item];
        });
}

function sameReferences(subject, left, right) {
    const canonical = values => values
        .map(reference => canonicalDeckReference(subject, reference))
        .sort();
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function validateSubjectRoadmap(inputPath, graph = resolveSubjectCurriculum(inputPath, {
    requireDecks: true
})) {
    const subjectPath = resolvePath(inputPath);
    const roadmapPath = path.join(subjectPath, 'ROADMAP.md');
    const errors = [];
    if (graph.schemaVersion < 3 || graph.decks.length === 0 || graph.errors.length) return errors;
    if (!existsSync(roadmapPath)) return [`Missing ROADMAP.md: ${subjectPath}`];

    const content = readFileSync(roadmapPath, 'utf8');
    const section = markdownSection(content, 'Deck sequence');
    if (!section) return [`${roadmapPath}: missing ## Deck sequence section`];
    const byOrder = new Map(graph.decks.map(deck => [deck.order, deck]));
    const byId = new Map(graph.decks.map(deck => [deck.id, deck]));
    const seen = new Set();
    const lines = section.content.split('\n');

    lines.forEach((line, index) => {
        if (!/^\|\s*\d+\s*\|/.test(line)) return;
        const sourceName = `${roadmapPath}:${section.lineOffset + index + 1}`;
        const cells = markdownCells(line);
        if (cells.length !== 9) {
            errors.push(
                `${sourceName}: deck row must have 9 cells (order, deck, level, tier, hard prerequisites, recommended after, estimated chapters, durable capabilities, status); found ${cells.length}`
            );
            return;
        }
        const [orderText, deckText, level, tier, hardText, recommendedText, chaptersText, , status] = cells;
        const order = Number(orderText);
        const id = unquoteMarkdown(deckText);
        const deck = byId.get(id);
        if (!deck) {
            errors.push(`${sourceName}: roadmap references undeclared deck ${JSON.stringify(id)}`);
            return;
        }
        if (seen.has(id)) errors.push(`${sourceName}: duplicate roadmap deck ${id}`);
        seen.add(id);
        if (order !== deck.order) errors.push(`${sourceName}: ${id} order ${orderText} does not match subject.toml order ${deck.order}`);
        if (level !== deck.level) errors.push(`${sourceName}: ${id} level ${JSON.stringify(level)} does not match subject.toml ${JSON.stringify(deck.level)}`);
        if (tier !== deck.tier) errors.push(`${sourceName}: ${id} tier ${JSON.stringify(tier)} does not match subject.toml ${JSON.stringify(deck.tier)}`);
        if (Number(chaptersText) !== deck.estimatedChapters) {
            errors.push(`${sourceName}: ${id} estimated chapters ${JSON.stringify(chaptersText)} does not match subject.toml ${deck.estimatedChapters}`);
        }
        if (status !== deck.status) errors.push(`${sourceName}: ${id} status ${JSON.stringify(status)} does not match subject.toml ${JSON.stringify(deck.status)}`);
        const hard = roadmapReferences(hardText, byOrder, errors, sourceName);
        const recommended = roadmapReferences(recommendedText, byOrder, errors, sourceName);
        if (!sameReferences(graph.subject, hard, deck.prerequisites)) {
            errors.push(`${sourceName}: ${id} hard prerequisites do not match subject.toml`);
        }
        if (!sameReferences(graph.subject, recommended, deck.recommendedAfter)) {
            errors.push(`${sourceName}: ${id} recommended sequencing does not match subject.toml`);
        }
    });

    for (const deck of graph.decks) {
        if (!seen.has(deck.id)) errors.push(`${roadmapPath}: missing deck row for ${deck.id}`);
    }
    return [...new Set(errors)];
}

function localDeckReference(subject, reference) {
    if (!reference.includes('/')) return reference;
    const [referenceSubject, deck] = reference.split('/');
    return referenceSubject === subject ? deck : null;
}

function findCycles(subject, decks, errors) {
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
            const localId = localDeckReference(subject, prerequisite);
            const dependency = localId ? byId.get(localId) : null;
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
        return {
            subjectPath,
            manifestPath,
            subject: path.basename(subjectPath),
            schemaVersion: null,
            destination: null,
            deckGranularity: null,
            focus: [],
            decks: [],
            coverage: [],
            errors: [`Subject path does not exist: ${subjectPath}`],
            warnings
        };
    }
    if (!existsSync(manifestPath)) {
        return {
            subjectPath,
            manifestPath,
            subject: path.basename(subjectPath),
            schemaVersion: null,
            destination: null,
            deckGranularity: null,
            focus: [],
            decks: [],
            coverage: [],
            errors: [`Missing subject.toml: ${subjectPath}`],
            warnings
        };
    }

    const content = readFileSync(manifestPath, 'utf8');
    let schemaVersion = null;
    let subject = path.basename(subjectPath);
    let destination;
    let deckGranularity;
    let focus = [];
    const decks = [];
    const coverage = [];
    try {
        const firstTable = /^\[\[[a-z0-9_-]+\]\]\s*$/m.exec(content)?.index ?? content.length;
        const header = content.slice(0, firstTable);
        schemaVersion = parseInteger(header, 'schema_version', { required: true, sourceName: manifestPath });
        subject = parseString(header, 'subject', { required: true, sourceName: manifestPath });
        if (![1, 2, 3].includes(schemaVersion)) {
            errors.push(`${manifestPath}: unsupported schema_version ${schemaVersion}; expected 1, 2, or 3`);
        }
        if (!SLUG.test(subject)) errors.push(`${manifestPath}: subject must be lowercase kebab-case`);
        if (subject !== path.basename(subjectPath)) errors.push(`${manifestPath}: subject ${JSON.stringify(subject)} must match directory ${JSON.stringify(path.basename(subjectPath))}`);
        if (schemaVersion >= 2) {
            destination = parseString(header, 'destination', { required: true, sourceName: manifestPath });
            deckGranularity = parseString(header, 'deck_granularity', { required: true, sourceName: manifestPath });
            focus = schemaVersion >= 3
                ? parseStringArray(header, 'focus', { required: true, sourceName: manifestPath })
                : [];
            if (!DESTINATIONS.has(destination)) {
                errors.push(`${manifestPath}: destination must be one of ${[...DESTINATIONS].join(', ')}`);
            }
            if (!GRANULARITY_RANGES.has(deckGranularity)) {
                errors.push(`${manifestPath}: deck_granularity must be one of ${[...GRANULARITY_RANGES.keys()].join(', ')}`);
            }
            unique(focus, `${manifestPath} focus`, errors);
            for (const item of focus) {
                if (!SLUG.test(item)) errors.push(`${manifestPath}: focus must contain lowercase kebab-case values`);
            }
            if (schemaVersion >= 3 && destination === 'research-specialization' && focus.length === 0) {
                errors.push(`${manifestPath}: research-specialization requires at least one focus`);
            }
        } else if (schemaVersion === 1) {
            warnings.push(`${manifestPath}: schema version 1 has no curriculum tiers, soft sequencing, deck-size estimates, or coverage matrix`);
        }

        tableBlocks(content, 'decks').forEach((block, index) => {
            const sourceName = `${manifestPath} [[decks]] #${index + 1}`;
            const id = parseString(block, 'id', { required: true, sourceName });
            const order = parseInteger(block, 'order', { required: true, sourceName });
            const prerequisites = parseStringArray(block, 'prerequisites', { required: true, sourceName });
            const recommendedAfter = parseStringArray(block, 'recommended_after', {
                required: schemaVersion >= 2,
                sourceName
            });
            const tier = parseString(block, 'tier', {
                required: schemaVersion >= 2,
                sourceName
            }) || null;
            const level = parseString(block, 'level', {
                required: schemaVersion >= 3,
                sourceName
            }) || null;
            const estimatedChapters = parseInteger(block, 'estimated_chapters', {
                required: schemaVersion >= 2,
                sourceName
            });
            const status = parseString(block, 'status', { sourceName }) || 'proposed';
            const description = parseString(block, 'description', { sourceName }) || '';
            if (!SLUG.test(id)) errors.push(`${sourceName}: id must be lowercase kebab-case`);
            if (!Number.isInteger(order) || order < 1) errors.push(`${sourceName}: order must be a positive integer`);
            if (!SLUG.test(status)) errors.push(`${sourceName}: status must be lowercase kebab-case`);
            if (schemaVersion >= 2 && !TIERS.has(tier)) {
                errors.push(`${sourceName}: tier must be one of ${[...TIERS].join(', ')}`);
            }
            if (schemaVersion >= 3 && !LEVELS.has(level)) {
                errors.push(`${sourceName}: level must be one of ${[...LEVELS].join(', ')}`);
            }
            if (schemaVersion >= 2 && !description.trim()) errors.push(`${sourceName}: description must not be empty`);
            if (schemaVersion >= 2 && (!Number.isInteger(estimatedChapters) || estimatedChapters < 1)) {
                errors.push(`${sourceName}: estimated_chapters must be a positive integer`);
            }
            const range = GRANULARITY_RANGES.get(deckGranularity);
            if (schemaVersion >= 2 && range && (estimatedChapters < range[0] || estimatedChapters > range[1])) {
                errors.push(`${sourceName}: estimated_chapters ${estimatedChapters} is outside the ${deckGranularity} range ${range[0]}-${range[1]}`);
            }
            for (const dependency of [...prerequisites, ...recommendedAfter]) {
                if (!DECK_REF.test(dependency)) {
                    errors.push(`${sourceName}: invalid prerequisite ${JSON.stringify(dependency)}; expected deck or subject/deck`);
                }
            }
            unique(prerequisites, `${sourceName} prerequisites`, errors);
            unique(recommendedAfter, `${sourceName} recommended_after`, errors);
            for (const dependency of recommendedAfter) {
                if (prerequisites.includes(dependency)) {
                    errors.push(`${sourceName}: ${dependency} cannot be both a prerequisite and recommended_after`);
                }
            }
            decks.push({
                id,
                order,
                tier,
                level,
                prerequisites,
                recommendedAfter,
                estimatedChapters,
                status,
                description
            });
        });

        tableBlocks(content, 'coverage').forEach((block, index) => {
            const sourceName = `${manifestPath} [[coverage]] #${index + 1}`;
            const domain = parseString(block, 'domain', { required: true, sourceName });
            const disposition = parseString(block, 'disposition', { required: true, sourceName });
            const deckIds = parseStringArray(block, 'decks', { required: true, sourceName });
            const rationale = parseString(block, 'rationale', { required: true, sourceName });
            if (!SLUG.test(domain)) errors.push(`${sourceName}: domain must be lowercase kebab-case`);
            if (!COVERAGE_DISPOSITIONS.has(disposition)) {
                errors.push(`${sourceName}: disposition must be one of ${[...COVERAGE_DISPOSITIONS].join(', ')}`);
            }
            unique(deckIds, `${sourceName} decks`, errors);
            for (const deckId of deckIds) {
                if (!SLUG.test(deckId)) errors.push(`${sourceName}: invalid deck reference ${JSON.stringify(deckId)}`);
            }
            if (disposition === 'included' && deckIds.length === 0) {
                errors.push(`${sourceName}: included coverage must name at least one deck`);
            }
            if (disposition !== 'included' && deckIds.length > 0) {
                errors.push(`${sourceName}: ${disposition} coverage must not name decks`);
            }
            if (!rationale.trim()) errors.push(`${sourceName}: rationale must not be empty`);
            coverage.push({ domain, disposition, decks: deckIds, rationale });
        });
    } catch (error) {
        errors.push(error.message);
    }

    unique(decks.map(deck => deck.id), `${manifestPath} deck ids`, errors);
    unique(decks.map(deck => deck.order), `${manifestPath} deck orders`, errors);
    const byId = new Map(decks.map(deck => [deck.id, deck]));
    for (const deck of decks) {
        for (const prerequisite of deck.prerequisites) {
            const localId = localDeckReference(subject, prerequisite);
            if (!localId) continue;
            const dependency = byId.get(localId);
            if (!dependency) {
                errors.push(`${manifestPath}: ${deck.id} references missing prerequisite deck ${prerequisite}`);
            } else if (dependency.order >= deck.order) {
                errors.push(`${manifestPath}: ${deck.id} prerequisite ${prerequisite} must have a lower order`);
            } else if (
                schemaVersion >= 3
                && LEVEL_RANK.get(dependency.level) > LEVEL_RANK.get(deck.level)
            ) {
                errors.push(`${manifestPath}: ${deck.id} cannot require later-level deck ${prerequisite}`);
            }
        }
        for (const recommendation of deck.recommendedAfter) {
            const localId = localDeckReference(subject, recommendation);
            if (!localId) continue;
            const dependency = byId.get(localId);
            if (!dependency) {
                errors.push(`${manifestPath}: ${deck.id} references missing recommended deck ${recommendation}`);
            } else if (dependency.order >= deck.order) {
                errors.push(`${manifestPath}: ${deck.id} recommended_after ${recommendation} must have a lower order`);
            } else if (
                schemaVersion >= 3
                && LEVEL_RANK.get(dependency.level) > LEVEL_RANK.get(deck.level)
            ) {
                errors.push(`${manifestPath}: ${deck.id} cannot be recommended after later-level deck ${recommendation}`);
            }
        }
    }
    findCycles(subject, decks, errors);
    decks.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

    const ancestors = new Map();
    for (const deck of decks) {
        const deckAncestors = new Set();
        for (const prerequisite of deck.prerequisites) {
            const localId = localDeckReference(subject, prerequisite);
            if (!localId) continue;
            deckAncestors.add(localId);
            for (const ancestor of ancestors.get(localId) || []) deckAncestors.add(ancestor);
        }
        for (const prerequisite of deck.prerequisites) {
            const localPrerequisite = localDeckReference(subject, prerequisite);
            if (!localPrerequisite) continue;
            const redundantVia = deck.prerequisites.filter(other =>
                other !== prerequisite
                && ancestors.get(localDeckReference(subject, other))?.has(localPrerequisite)
            );
            if (redundantVia.length) {
                errors.push(`${manifestPath}: ${deck.id} prerequisite ${prerequisite} is transitively redundant via ${redundantVia.join(', ')}`);
            }
        }
        for (const recommendation of deck.recommendedAfter) {
            const localRecommendation = localDeckReference(subject, recommendation);
            if (localRecommendation && deckAncestors.has(localRecommendation)) {
                errors.push(`${manifestPath}: ${deck.id} recommended_after ${recommendation} is already guaranteed by hard prerequisites`);
            }
        }
        ancestors.set(deck.id, deckAncestors);
    }

    unique(coverage.map(item => item.domain), `${manifestPath} coverage domains`, errors);
    const coveredDecks = new Set();
    for (const item of coverage) {
        for (const deckId of item.decks) {
            if (!byId.has(deckId)) {
                errors.push(`${manifestPath}: coverage domain ${item.domain} references missing deck ${deckId}`);
            } else {
                coveredDecks.add(deckId);
            }
        }
    }
    if (schemaVersion >= 2 && decks.length > 0) {
        if (coverage.length === 0) errors.push(`${manifestPath}: schema version ${schemaVersion} requires at least one [[coverage]] entry`);
        for (const deck of decks) {
            if (!coveredDecks.has(deck.id)) {
                errors.push(`${manifestPath}: deck ${deck.id} is not assigned to any included coverage domain`);
            }
        }
    }
    if (decks.length === 0) {
        const message = `${manifestPath}: curriculum contains no decks`;
        if (requireDecks) errors.push(message);
        else warnings.push(message);
    }
    return {
        subjectPath,
        manifestPath,
        subject,
        schemaVersion,
        destination,
        deckGranularity,
        focus,
        decks,
        coverage,
        errors,
        warnings
    };
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
            const localId = localDeckReference(graph.subject, dependency);
            if (!localId || !byId.has(localId)) continue;
            visit(localId);
            closure.add(localId);
        }
    };
    visit(deckId);
    return {
        deck: target,
        direct: [...target.prerequisites],
        transitive: graph.decks.filter(deck => closure.has(deck.id)).map(deck => deck.id),
        recommendedAfter: [...target.recommendedAfter]
    };
}

export function validateSubjectExtension(before, after) {
    const errors = [];
    if (before.errors.length) {
        errors.push(`baseline curriculum is invalid: ${before.errors.join('; ')}`);
        return errors;
    }
    if (after.errors.length) {
        errors.push(`extended curriculum is invalid: ${after.errors.join('; ')}`);
        return errors;
    }
    const afterById = new Map(after.decks.map(deck => [deck.id, deck]));
    for (const original of before.decks) {
        const extended = afterById.get(original.id);
        if (!extended) {
            errors.push(`extension removed existing deck ${original.id}`);
            continue;
        }
        if (original.level && extended.level !== original.level) {
            errors.push(`extension changed ${original.id} level from ${original.level} to ${extended.level}`);
        }
        if (extended.status !== original.status) {
            errors.push(`extension changed ${original.id} status from ${original.status} to ${extended.status}`);
        }
        if (
            original.prerequisites.length !== extended.prerequisites.length
            || original.prerequisites.some((id, index) => extended.prerequisites[index] !== id)
        ) {
            errors.push(`extension changed ${original.id} hard prerequisites`);
        }
    }
    return errors;
}

export function subjectPrerequisiteDecks(subjectPath, deckId) {
    const graph = resolveSubjectCurriculum(subjectPath);
    if (graph.errors.length) throw new Error(`Invalid subject curriculum:\n- ${graph.errors.join('\n- ')}`);
    if (graph.decks.length === 0) return [];
    const resolution = resolveSubjectDeckClosure(graph, deckId);
    return resolution.direct.map(id => canonicalDeckReference(graph.subject, id));
}

function replaceDeckArray(content, key, values, { insertAfter } = {}) {
    const section = /^\[prerequisites\][ \t]*$/m.exec(content);
    if (!section) throw new Error('deck.toml: missing [prerequisites] section');
    const start = section.index + section[0].length;
    const tail = content.slice(start);
    const next = /^\[[^\]]+\]\s*$/m.exec(tail);
    const end = next ? start + next.index : content.length;
    const body = content.slice(start, end);
    const rendered = `${key} = [${values.map(value => JSON.stringify(value)).join(', ')}]`;
    const field = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*\\[[\\s\\S]*?\\][ \\t]*$`, 'm');
    let updatedBody;
    if (field.test(body)) {
        updatedBody = body.replace(field, rendered);
    } else if (insertAfter) {
        const anchor = new RegExp(`^([ \\t]*${insertAfter}[ \\t]*=[ \\t]*\\[[\\s\\S]*?\\][ \\t]*)$`, 'm');
        if (!anchor.test(body)) throw new Error(`deck.toml: missing [prerequisites].${insertAfter}`);
        updatedBody = body.replace(anchor, `$1\n${rendered}`);
    } else {
        throw new Error(`deck.toml: missing [prerequisites].${key}`);
    }
    return `${content.slice(0, start)}${updatedBody}${content.slice(end)}`;
}

function replaceDeckCurriculumOrder(content, order) {
    const rendered = `curriculum_order = ${order}`;
    if (/^[ \t]*curriculum_order[ \t]*=/m.test(content)) {
        return content.replace(/^[ \t]*curriculum_order[ \t]*=[ \t]*\d+[ \t]*$/m, rendered);
    }
    const level = /^[ \t]*level[ \t]*=.*$/m.exec(content);
    if (level) {
        const insertAt = level.index + level[0].length;
        return `${content.slice(0, insertAt)}\n${rendered}${content.slice(insertAt)}`;
    }
    const status = /^[ \t]*status[ \t]*=.*$/m.exec(content);
    if (status) return `${content.slice(0, status.index)}${rendered}\n${content.slice(status.index)}`;
    throw new Error('deck.toml: missing level or status field for curriculum_order');
}

function manifestString(content, key) {
    return parseString(content, key, { required: true, sourceName: 'deck.toml' });
}

function manifestPrerequisites(content) {
    const section = /^\[prerequisites\][ \t]*$/m.exec(content);
    if (!section) return [];
    const start = section.index + section[0].length;
    const tail = content.slice(start);
    const next = /^\[[^\]]+\]\s*$/m.exec(tail);
    return parseStringArray(tail.slice(0, next?.index ?? tail.length), 'decks', { required: true, sourceName: 'deck.toml [prerequisites]' });
}

function manifestRecommendedDecks(content) {
    const section = /^\[prerequisites\][ \t]*$/m.exec(content);
    if (!section) return [];
    const start = section.index + section[0].length;
    const tail = content.slice(start);
    const next = /^\[[^\]]+\]\s*$/m.exec(tail);
    return parseStringArray(
        tail.slice(0, next?.index ?? tail.length),
        'recommended_decks',
        { required: false, sourceName: 'deck.toml [prerequisites]' }
    );
}

export function syncDeckPrerequisitesFromSubject(
    inputPath,
    { requireEntry = false, allowMissing = false } = {}
) {
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
        if (requireEntry || (graph.decks.length > 0 && !allowMissing)) {
            throw new Error(`Deck ${subject}/${deck} is not declared in ${graph.manifestPath}; update the subject curriculum before creating it.`);
        }
        return {
            deckPath,
            changed: false,
            prerequisites: manifestPrerequisites(content),
            recommendedDecks: manifestRecommendedDecks(content),
            inferred: [],
            inferredRecommended: [],
            curriculumOrder: null
        };
    }
    const inferred = entry.prerequisites.map(id => canonicalDeckReference(subject, id));
    const inferredRecommended = entry.recommendedAfter.map(id => canonicalDeckReference(subject, id));
    const prerequisites = [...new Set([...inferred, ...manifestPrerequisites(content)])];
    const recommendedDecks = [...new Set([...inferredRecommended, ...manifestRecommendedDecks(content)])];
    const updated = replaceDeckCurriculumOrder(
        replaceDeckArray(
            replaceDeckArray(content, 'decks', prerequisites),
            'recommended_decks',
            recommendedDecks,
            { insertAfter: 'decks' }
        ),
        entry.order
    );
    if (updated !== content) writeFileSync(manifestPath, updated);
    return {
        deckPath,
        changed: updated !== content,
        prerequisites,
        recommendedDecks,
        inferred,
        inferredRecommended,
        curriculumOrder: entry.order
    };
}

export function formatSubjectCurriculum(graph, { deck } = {}) {
    const lines = [
        `Subject curriculum: ${graph.subjectPath}`,
        `Schema: ${graph.schemaVersion ?? 'invalid'}`,
        `Subject: ${graph.subject}`
    ];
    if (graph.destination) lines.push(`Destination: ${graph.destination}`);
    if (graph.deckGranularity) lines.push(`Deck granularity: ${graph.deckGranularity}`);
    if (graph.focus?.length) lines.push(`Focus: ${graph.focus.join(', ')}`);
    if (deck && !graph.errors.length) {
        try {
            const closure = resolveSubjectDeckClosure(graph, deck);
            lines.push(`Target deck: ${deck}`);
            lines.push(`Direct prerequisites: ${closure.direct.length ? closure.direct.join(', ') : 'none'}`);
            lines.push(`Transitive closure: ${closure.transitive.length ? closure.transitive.join(', ') : 'none'}`);
            lines.push(`Recommended after: ${closure.recommendedAfter.length ? closure.recommendedAfter.join(', ') : 'none'}`);
        } catch (error) {
            lines.push(`Target error: ${error.message}`);
        }
    }
    lines.push('', 'Decks:');
    for (const item of graph.decks) {
        const metadata = [
            item.level,
            item.tier,
            item.status,
            item.estimatedChapters ? `${item.estimatedChapters} chapters` : null
        ].filter(Boolean).join(', ');
        lines.push(`${item.order}. ${item.id} [${metadata}]: ${item.prerequisites.length ? item.prerequisites.join(', ') : 'none'}`);
        if (item.recommendedAfter.length) lines.push(`   Recommended after: ${item.recommendedAfter.join(', ')}`);
        if (item.description) lines.push(`   ${item.description}`);
    }
    if (graph.coverage.length) {
        lines.push('', 'Coverage:');
        for (const item of graph.coverage) {
            const placement = item.decks.length ? item.decks.join(', ') : item.disposition;
            lines.push(`- ${item.domain} [${item.disposition}]: ${placement}`);
        }
    }
    if (graph.warnings.length) lines.push('', 'Warnings:', ...graph.warnings.map(warning => `- ${warning}`));
    if (graph.errors.length) lines.push('', 'Errors:', ...graph.errors.map(error => `- ${error}`));
    return lines.join('\n');
}

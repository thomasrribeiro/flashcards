import {
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
    writeFileSync
} from 'node:fs';
import path from 'node:path';
import { resolvePath } from './paths.js';
import {
    canonicalDeckReference,
    resolveSubjectCurriculum,
    SUBJECT_LEVELS
} from './subject-curriculum.js';

const LEVEL_RANK = new Map(SUBJECT_LEVELS.map((level, index) => [level, index]));

function subjectDirectories(notesRoot) {
    if (!existsSync(notesRoot) || !statSync(notesRoot).isDirectory()) return [];
    return readdirSync(notesRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && existsSync(path.join(notesRoot, entry.name, 'subject.toml')))
        .map(entry => path.join(notesRoot, entry.name))
        .sort();
}

function findCycles(decks, errors) {
    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    const visit = id => {
        if (visited.has(id)) return;
        if (visiting.has(id)) {
            const start = stack.indexOf(id);
            errors.push(`global curriculum cycle: ${[...stack.slice(start), id].join(' -> ')}`);
            return;
        }
        visiting.add(id);
        stack.push(id);
        for (const dependency of decks.get(id)?.prerequisites || []) {
            if (decks.has(dependency)) visit(dependency);
        }
        stack.pop();
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of decks.keys()) visit(id);
}

function prerequisiteClosure(decks, start, seen = new Set()) {
    for (const dependency of decks.get(start)?.prerequisites || []) {
        if (seen.has(dependency) || !decks.has(dependency)) continue;
        seen.add(dependency);
        prerequisiteClosure(decks, dependency, seen);
    }
    return seen;
}

export function resolveGlobalCurriculum(inputPath, { requireSubjects = false } = {}) {
    const notesRoot = resolvePath(inputPath);
    const errors = [];
    const warnings = [];
    const subjects = subjectDirectories(notesRoot).map(subjectPath =>
        resolveSubjectCurriculum(subjectPath, { requireDecks: false })
    );
    if (requireSubjects && subjects.length === 0) {
        errors.push(`No subject.toml manifests found under ${notesRoot}`);
    }
    for (const subject of subjects) {
        errors.push(...subject.errors);
        warnings.push(...subject.warnings);
    }

    const decks = new Map();
    for (const graph of subjects) {
        for (const deck of graph.decks) {
            const id = `${graph.subject}/${deck.id}`;
            if (decks.has(id)) {
                errors.push(`duplicate global deck id: ${id}`);
                continue;
            }
            decks.set(id, {
                ...deck,
                id,
                deck: deck.id,
                subject: graph.subject,
                manifestPath: graph.manifestPath,
                prerequisites: deck.prerequisites.map(reference =>
                    canonicalDeckReference(graph.subject, reference)
                ),
                recommendedAfter: deck.recommendedAfter.map(reference =>
                    canonicalDeckReference(graph.subject, reference)
                )
            });
        }
    }

    for (const deck of decks.values()) {
        const hard = new Set(deck.prerequisites);
        for (const dependency of deck.prerequisites) {
            const prerequisite = decks.get(dependency);
            if (!prerequisite) {
                errors.push(`${deck.id} references missing prerequisite deck ${dependency}`);
                continue;
            }
            if (
                deck.level
                && prerequisite.level
                && LEVEL_RANK.get(prerequisite.level) > LEVEL_RANK.get(deck.level)
            ) {
                errors.push(`${deck.id} cannot require later-level deck ${dependency}`);
            }
        }
        for (const recommendation of deck.recommendedAfter) {
            const prerequisite = decks.get(recommendation);
            if (!prerequisite) {
                errors.push(`${deck.id} references missing recommended deck ${recommendation}`);
                continue;
            }
            if (hard.has(recommendation)) {
                errors.push(`${deck.id} cannot both require and recommend ${recommendation}`);
            }
            if (
                deck.level
                && prerequisite.level
                && LEVEL_RANK.get(prerequisite.level) > LEVEL_RANK.get(deck.level)
            ) {
                errors.push(`${deck.id} cannot be recommended after later-level deck ${recommendation}`);
            }
        }
        const targetRank = LEVEL_RANK.get(deck.level);
        const dependencyRanks = deck.prerequisites
            .map(reference => LEVEL_RANK.get(decks.get(reference)?.level))
            .filter(Number.isInteger);
        const highestDependencyRank = dependencyRanks.length ? Math.max(...dependencyRanks) : -1;
        if (targetRank >= LEVEL_RANK.get('graduate') && highestDependencyRank < targetRank - 1) {
            const predecessor = SUBJECT_LEVELS[targetRank - 1];
            warnings.push(
                `${deck.id} is ${deck.level} but has no direct ${predecessor} prerequisite; verify that it does not skip an essential maturity layer`
            );
        }
    }
    findCycles(decks, errors);

    for (const deck of decks.values()) {
        for (const prerequisite of deck.prerequisites) {
            const redundantVia = deck.prerequisites.filter(other =>
                other !== prerequisite && prerequisiteClosure(decks, other).has(prerequisite)
            );
            if (redundantVia.length) {
                errors.push(`${deck.id} prerequisite ${prerequisite} is transitively redundant via ${redundantVia.join(', ')}`);
            }
        }
        const guaranteed = prerequisiteClosure(decks, deck.id);
        for (const recommendation of deck.recommendedAfter) {
            if (guaranteed.has(recommendation)) {
                errors.push(`${deck.id} recommended_after ${recommendation} is already guaranteed by hard prerequisites`);
            }
        }
    }

    const orderedDecks = [...decks.values()].sort((a, b) =>
        a.subject.localeCompare(b.subject)
        || a.order - b.order
        || a.deck.localeCompare(b.deck)
    );
    const crossSubjectHardEdges = orderedDecks.flatMap(deck =>
        deck.prerequisites
            .filter(reference => !reference.startsWith(`${deck.subject}/`))
            .map(reference => ({ from: deck.id, to: reference, kind: 'required' }))
    );
    const crossSubjectRecommendedEdges = orderedDecks.flatMap(deck =>
        deck.recommendedAfter
            .filter(reference => !reference.startsWith(`${deck.subject}/`))
            .map(reference => ({ from: deck.id, to: reference, kind: 'recommended' }))
    );

    return {
        schemaVersion: 1,
        notesRoot,
        subjects,
        decks: orderedDecks,
        crossSubjectHardEdges,
        crossSubjectRecommendedEdges,
        errors: [...new Set(errors)],
        warnings: [...new Set(warnings)]
    };
}

export function globalCurriculumIndex(graph) {
    return {
        schema_version: graph.schemaVersion,
        subjects: graph.subjects.map(subject => ({
            id: subject.subject,
            destination: subject.destination,
            focus: subject.focus,
            deck_granularity: subject.deckGranularity
        })),
        decks: graph.decks.map(deck => ({
            id: deck.id,
            subject: deck.subject,
            deck: deck.deck,
            order: deck.order,
            tier: deck.tier,
            level: deck.level,
            status: deck.status,
            description: deck.description,
            prerequisites: deck.prerequisites,
            recommended_after: deck.recommendedAfter
        }))
    };
}

export function writeGlobalCurriculumIndex(graph, outputPath) {
    if (graph.errors.length) {
        throw new Error(`Invalid global curriculum:\n- ${graph.errors.join('\n- ')}`);
    }
    const resolvedOutput = resolvePath(outputPath);
    mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, `${JSON.stringify(globalCurriculumIndex(graph), null, 2)}\n`);
    return resolvedOutput;
}

export function formatGlobalCurriculum(graph, { audit = false } = {}) {
    const lines = [
        `Global curriculum: ${graph.notesRoot}`,
        `Subjects: ${graph.subjects.length}`,
        `Decks: ${graph.decks.length}`,
        `Cross-subject required edges: ${graph.crossSubjectHardEdges.length}`,
        `Cross-subject recommended edges: ${graph.crossSubjectRecommendedEdges.length}`
    ];
    if (graph.crossSubjectHardEdges.length || graph.crossSubjectRecommendedEdges.length) {
        lines.push('', 'Cross-subject routes:');
        for (const edge of [...graph.crossSubjectHardEdges, ...graph.crossSubjectRecommendedEdges]) {
            lines.push(`- ${edge.from} -> ${edge.to} [${edge.kind}]`);
        }
    }
    if (audit) {
        lines.push('', 'Subject summary:');
        for (const subject of graph.subjects) {
            const decks = graph.decks.filter(deck => deck.subject === subject.subject);
            const incoming = [...graph.crossSubjectHardEdges, ...graph.crossSubjectRecommendedEdges]
                .filter(edge => edge.from.startsWith(`${subject.subject}/`)).length;
            lines.push(`- ${subject.subject}: ${decks.length} decks, ${incoming} outbound cross-subject prerequisite edge(s)`);
        }
    }
    if (graph.warnings.length) lines.push('', 'Warnings:', ...graph.warnings.map(warning => `- ${warning}`));
    if (graph.errors.length) lines.push('', 'Errors:', ...graph.errors.map(error => `- ${error}`));
    return lines.join('\n');
}

export function formatGlobalCurriculumCatalog(graph, { excludeSubject } = {}) {
    const decks = graph.decks.filter(deck => deck.subject !== excludeSubject);
    const lines = [
        '# Established cross-subject curriculum catalog',
        '',
        'This file is generated input. It lists already-defined decks that may be referenced as `subject/deck` prerequisites.',
        'Reuse an established external deck only when its documented capability is genuinely required. Prefer `recommended_after` for helpful but nonessential preparation.',
        'Do not copy external decks into the new subject merely to make its roadmap self-contained.',
        ''
    ];
    let currentSubject = null;
    for (const deck of decks) {
        if (deck.subject !== currentSubject) {
            currentSubject = deck.subject;
            lines.push(`## ${currentSubject}`, '');
        }
        const required = deck.prerequisites.length ? deck.prerequisites.join(', ') : 'none';
        const recommended = deck.recommendedAfter.length ? deck.recommendedAfter.join(', ') : 'none';
        lines.push(`- \`${deck.id}\` — ${deck.level || 'unspecified level'}: ${deck.description || 'No description supplied.'}`);
        lines.push(`  - requires: ${required}`);
        lines.push(`  - recommended after: ${recommended}`);
    }
    if (decks.length === 0) lines.push('No other subject curricula are currently available.');
    return `${lines.join('\n')}\n`;
}

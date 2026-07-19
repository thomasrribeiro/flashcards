import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FLASHCARDS_ROOT, resolvePath } from './paths.js';
import {
    formatGlobalCurriculumCatalog,
    resolveGlobalCurriculum
} from './global-curriculum.js';
import { formatPrerequisiteGraph, resolvePrerequisiteGraph } from './prerequisites.js';
import { formatSubjectCurriculum, resolveSubjectCurriculum } from './subject-curriculum.js';

function readSubject(deckPath) {
    const manifestPath = path.join(deckPath, 'deck.toml');
    if (existsSync(manifestPath)) {
        const manifest = readFileSync(manifestPath, 'utf8');
        const subject = /^subject\s*=\s*"([^"]+)"/m.exec(manifest)?.[1];
        if (subject) return subject;
    }
    const flashcardsPath = path.join(deckPath, 'flashcards');
    if (existsSync(flashcardsPath)) {
        const files = readdirSync(flashcardsPath).filter(name => name.endsWith('.md')).sort();
        for (const file of files) {
            const markdown = readFileSync(path.join(flashcardsPath, file), 'utf8');
            const subject = /^subject\s*=\s*"([^"]+)"/m.exec(markdown)?.[1];
            if (subject) return subject;
        }
    }
    return path.basename(path.dirname(deckPath));
}

function readSubjectGuide(deckPath, subject) {
    const canonical = path.join(FLASHCARDS_ROOT, 'templates', 'guides', `${subject}.md`);
    const local = path.join(path.dirname(deckPath), 'DOMAIN_GUIDE.md');
    const fallback = existsSync(local) ? local : canonical;
    const manifestPath = path.join(deckPath, 'deck.toml');
    if (!existsSync(manifestPath)) return { path: fallback, overridden: existsSync(local), local: existsSync(local) };

    const manifest = readFileSync(manifestPath, 'utf8');
    let inStandards = false;
    let configured = null;
    for (const line of manifest.split('\n')) {
        const section = /^\[([^\]]+)\]\s*$/.exec(line.trim());
        if (section) {
            inStandards = section[1] === 'standards';
            continue;
        }
        if (!inStandards) continue;
        configured = /^subject\s*=\s*"([^"]+)"/.exec(line.trim())?.[1] || configured;
    }
    if (!configured) return { path: fallback, overridden: existsSync(local), local: existsSync(local) };

    const configuredPath = path.resolve(FLASHCARDS_ROOT, configured);
    const relative = path.relative(FLASHCARDS_ROOT, configuredPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { path: fallback, overridden: existsSync(local), local: existsSync(local) };
    }
    if (!existsSync(configuredPath) && configuredPath === canonical && existsSync(local)) {
        return { path: local, overridden: true, local: true };
    }
    return { path: configuredPath, overridden: true, local: false };
}

function inspectFile(filePath, role, { required = false, legacy = false } = {}) {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return { path: filePath, role, required, legacy, exists: false, words: 0, bytes: 0 };
    }
    const content = readFileSync(filePath, 'utf8');
    const trimmed = content.trim();
    return {
        path: filePath,
        role,
        required,
        legacy,
        exists: true,
        words: trimmed ? trimmed.split(/\s+/u).length : 0,
        bytes: Buffer.byteLength(content)
    };
}

function subjectGuidePath(subjectPath, subject) {
    const localGuide = path.join(subjectPath, 'DOMAIN_GUIDE.md');
    if (existsSync(localGuide)) return { path: localGuide, role: 'subject-owned domain guide' };
    const canonicalGuide = path.join(FLASHCARDS_ROOT, 'templates', 'guides', `${subject}.md`);
    if (existsSync(canonicalGuide)) return { path: canonicalGuide, role: `${subject} domain guide` };
    return { path: localGuide, role: 'subject-owned domain guide to research and create' };
}

export function buildSubjectContextManifest({ subjectPath: inputPath } = {}) {
    const subjectPath = resolvePath(inputPath);
    if (!existsSync(subjectPath) || !statSync(subjectPath).isDirectory()) {
        throw new Error(`Subject path does not exist: ${subjectPath}`);
    }
    const collectionRoot = path.dirname(subjectPath);
    const subject = path.basename(subjectPath);
    const guide = subjectGuidePath(subjectPath, subject);
    const globalCurriculum = resolveGlobalCurriculum(collectionRoot, {
        excludeSubjects: [subject]
    });
    const globalCatalogPath = path.join(subjectPath, '.flashcards', 'context', 'global-curriculum.md');
    mkdirSync(path.dirname(globalCatalogPath), { recursive: true });
    writeFileSync(
        globalCatalogPath,
        formatGlobalCurriculumCatalog(globalCurriculum, { excludeSubject: subject })
    );
    const files = [];
    const add = (filePath, role, options) => files.push(inspectFile(filePath, role, options));

    add(path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'), 'agent workflow', { required: true });
    add(
        path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'references', 'subject-workflow.md'),
        'subject curriculum workflow',
        { required: true }
    );
    add(path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'CARD_STANDARD.md'), 'normative card standard', { required: true });
    add(path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'AUTHORING_PLAYBOOK.md'), 'universal authoring playbook', { required: true });
    add(guide.path, guide.role);
    add(path.join(collectionRoot, 'AGENTS.md'), 'collection routing instructions');
    add(path.join(subjectPath, 'AGENTS.md'), 'subject routing instructions');
    add(path.join(subjectPath, 'ROADMAP.md'), 'learner-specific subject roadmap', { required: true });
    add(path.join(subjectPath, 'SUBJECT_BRIEF.md'), 'learner-specific subject brief', { required: true });
    add(path.join(subjectPath, 'subject.toml'), 'machine-readable subject curriculum', { required: true });
    add(globalCatalogPath, 'generated cross-subject curriculum catalog', { required: true });

    const present = files.filter(file => file.exists);
    const subjectCurriculum = resolveSubjectCurriculum(subjectPath);
    return {
        mode: 'subject',
        subjectPath,
        collectionRoot,
        subject,
        guide,
        globalCurriculum,
        subjectCurriculum,
        files,
        summary: {
            present: present.length,
            missingOptional: files.filter(file => !file.exists && !file.required).length,
            missingRequired: files.filter(file => !file.exists && file.required).length,
            words: present.reduce((total, file) => total + file.words, 0),
            bytes: present.reduce((total, file) => total + file.bytes, 0)
        }
    };
}

export function buildContextManifest({ deckPath: inputPath, mode = 'build', preflightPath, chapterNumber } = {}) {
    if (!['build', 'audit'].includes(mode)) throw new Error(`Unknown context mode: ${mode}`);
    const deckPath = resolvePath(inputPath);
    if (!existsSync(deckPath) || !statSync(deckPath).isDirectory()) {
        throw new Error(`Deck path does not exist: ${deckPath}`);
    }
    if (!existsSync(path.join(deckPath, 'flashcards'))) {
        throw new Error(`Not a flashcard deck (missing flashcards/): ${deckPath}`);
    }
    const subjectRoot = path.dirname(deckPath);
    const collectionRoot = path.dirname(subjectRoot);
    const subject = readSubject(deckPath);
    const subjectGuide = readSubjectGuide(deckPath, subject);
    const files = [];
    const add = (filePath, role, options) => files.push(inspectFile(filePath, role, options));

    add(path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'), 'agent workflow', { required: true });
    add(path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'CARD_STANDARD.md'), 'normative card standard', { required: true });
    add(path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'AUTHORING_PLAYBOOK.md'), 'universal authoring playbook', { required: true });
    add(path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'references', 'cold-start-workflow.md'), 'cold-start and pilot workflow', { required: true });
    add(
        subjectGuide.path,
        subjectGuide.local ? 'subject-owned domain guide' : subjectGuide.overridden ? 'deck-selected domain guide' : `${subject} domain guide`
    );
    add(path.join(collectionRoot, 'AGENTS.md'), 'collection routing instructions');
    add(path.join(subjectRoot, 'AGENTS.md'), 'subject routing instructions');
    add(path.join(subjectRoot, 'ROADMAP.md'), 'learner-specific subject roadmap');
    add(path.join(subjectRoot, 'subject.toml'), 'machine-readable subject curriculum');

    const subjectBrief = path.join(subjectRoot, 'SUBJECT_BRIEF.md');
    const legacyAuthoringGuide = path.join(subjectRoot, 'AUTHORING_GUIDE.md');
    if (existsSync(subjectBrief) || !existsSync(legacyAuthoringGuide)) {
        add(subjectBrief, 'learner-specific subject brief');
    } else {
        add(legacyAuthoringGuide, 'legacy learner/subject brief', { legacy: true });
    }

    add(path.join(deckPath, 'AGENTS.md'), 'deck routing instructions');
    add(path.join(deckPath, 'deck.toml'), 'machine-readable deck identity');
    add(path.join(deckPath, 'README.md'), 'deck scope, chapter map, and source register');
    add(path.join(deckPath, 'CARD_README.md'), 'deck-specific retrieval blueprint');

    if (mode === 'audit') {
        add(path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'references', 'audit-workflow.md'), 'whole-deck audit workflow', { required: true });
        if (preflightPath) add(preflightPath, 'machine-readable audit preflight', { required: true });
    }

    const present = files.filter(file => file.exists);
    const prerequisiteGraph = resolvePrerequisiteGraph(deckPath);
    return {
        mode,
        deckPath,
        subjectRoot,
        collectionRoot,
        subject,
        prerequisiteGraph,
        chapterNumber,
        files,
        summary: {
            present: present.length,
            missingOptional: files.filter(file => !file.exists && !file.required).length,
            missingRequired: files.filter(file => !file.exists && file.required).length,
            words: present.reduce((total, file) => total + file.words, 0),
            bytes: present.reduce((total, file) => total + file.bytes, 0)
        }
    };
}

export function formatContextManifest(manifest) {
    const lines = [
        `Context mode: ${manifest.mode}`,
        manifest.deckPath ? `Deck: ${manifest.deckPath}` : `Subject workspace: ${manifest.subjectPath}`,
        `Subject: ${manifest.subject}`,
        ''
    ];
    let order = 0;
    for (const file of manifest.files) {
        if (file.exists) {
            order += 1;
            lines.push(`${order}. ${file.role}${file.legacy ? ' (legacy fallback)' : ''}`);
            lines.push(`   ${file.path}`);
            lines.push(`   ${file.words} words`);
        } else {
            lines.push(`- Missing ${file.required ? 'required' : 'optional'}: ${file.path}`);
        }
    }
    lines.push('');
    lines.push(`Total loaded context: ${manifest.summary.words} words across ${manifest.summary.present} files`);
    if (manifest.prerequisiteGraph) {
        lines.push('', formatPrerequisiteGraph(manifest.prerequisiteGraph, { chapter: manifest.chapterNumber }));
    }
    if (manifest.subjectCurriculum) {
        lines.push('', formatSubjectCurriculum(manifest.subjectCurriculum));
    }
    return lines.join('\n');
}

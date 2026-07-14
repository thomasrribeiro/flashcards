import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { FLASHCARDS_ROOT, resolvePath } from './paths.js';

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

export function buildContextManifest({ deckPath: inputPath, mode = 'build', preflightPath } = {}) {
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
    const files = [];
    const add = (filePath, role, options) => files.push(inspectFile(filePath, role, options));

    add(path.join(FLASHCARDS_ROOT, '.agents', 'skills', 'manage-flashcard-decks', 'SKILL.md'), 'agent workflow', { required: true });
    add(path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'CARD_STANDARD.md'), 'normative card standard', { required: true });
    add(path.join(FLASHCARDS_ROOT, 'templates', 'guides', 'AUTHORING_PLAYBOOK.md'), 'universal authoring playbook', { required: true });
    add(path.join(FLASHCARDS_ROOT, 'templates', 'guides', `${subject}.md`), `${subject} domain guide`);
    add(path.join(collectionRoot, 'AGENTS.md'), 'collection routing instructions');
    add(path.join(subjectRoot, 'AGENTS.md'), 'subject routing instructions');
    add(path.join(subjectRoot, 'ROADMAP.md'), 'learner-specific subject roadmap');

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
    return {
        mode,
        deckPath,
        subjectRoot,
        collectionRoot,
        subject,
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
        `Deck: ${manifest.deckPath}`,
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
    return lines.join('\n');
}

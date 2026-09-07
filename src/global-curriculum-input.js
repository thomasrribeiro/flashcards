const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function canonicalSubjectNames(subjects) {
    if (!Array.isArray(subjects)) throw new Error('Subjects must be an array.');
    const names = subjects.map(subject => typeof subject === 'string' ? subject : subject?.id);
    if (new Set(names).size !== names.length) throw new Error('Subjects contains duplicates.');
    if (!names.length || !names.every(name => typeof name === 'string' && SLUG.test(name))) throw new Error('Subjects must use kebab-case.');
    return [...names].sort();
}

export function canonicalMandatoryDecks(groups = [], subjects) {
    if (!Array.isArray(groups)) throw new Error('Required decks must be a list.');
    const seen = new Set();
    return groups.map(group => {
        if (!group || Object.keys(group).some(key => !['subject', 'decks'].includes(key))
            || !subjects.includes(group.subject)) throw new Error('Required decks must name a listed subject.');
        if (seen.has(group.subject)) throw new Error('List each subject once under required decks.');
        seen.add(group.subject);
        if (!Array.isArray(group.decks) || !group.decks.length
            || !group.decks.every(deck => typeof deck === 'string' && SLUG.test(deck))) throw new Error('Required decks must use kebab-case.');
        if (new Set(group.decks).size !== group.decks.length) throw new Error('Required decks contains duplicates.');
        return { subject: group.subject, decks: [...group.decks].sort() };
    }).sort((a, b) => a.subject.localeCompare(b.subject));
}

// newSubject is accepted only for queued jobs/clients from before multi-add.
// It never enters model input, nor does any other launch metadata.
export function globalCurriculumTarget({ subjects, newSubject, newSubjects, mandatoryDecks }) {
    const canonical = canonicalSubjectNames(subjects);
    if (newSubject !== undefined && newSubjects !== undefined) throw new Error('Use one new-subject list.');
    const additions = newSubjects ?? (newSubject !== undefined ? [newSubject] : []);
    if (!Array.isArray(additions)) throw new Error('New subjects must be a list.');
    const added = additions.length ? canonicalSubjectNames(additions) : [];
    if (added.some(subject => !canonical.includes(subject))) throw new Error('New subjects must be included in the subject list.');
    const required = canonicalMandatoryDecks(mandatoryDecks, canonical);
    return { subjects: canonical, ...(added.length ? { newSubjects: added } : {}),
        ...(required.length ? { mandatoryDecks: required } : {}) };
}

const splitNames = value => value.trim() ? value.trim().split(/[\s,]+/) : [];

export function parseGlobalCurriculumFields(subjects, additionsText, requiredText) {
    const base = Array.isArray(subjects) && !subjects.length ? [] : canonicalSubjectNames(subjects);
    const added = splitNames(additionsText);
    if (added.some(subject => base.includes(subject))) throw new Error('Subject already listed.');
    const all = canonicalSubjectNames([...base, ...added]);
    const groups = requiredText.split(/\r?\n/).filter(line => line.trim()).map(line => {
        const parts = line.split(':');
        if (parts.length !== 2) throw new Error('Use subject: deck-one, deck-two.');
        return { subject: parts[0].trim(), decks: splitNames(parts[1]) };
    });
    return globalCurriculumTarget({ subjects: all, newSubjects: added, mandatoryDecks: groups });
}

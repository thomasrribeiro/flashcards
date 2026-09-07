import { globalCurriculumTarget, parseGlobalCurriculumFields } from './global-curriculum-input.js';

// Keep editable launch constraints separate from provider settings and job
// submission. Nothing is written to the job until the user confirms.
export function globalCurriculumFields(payload) {
    const initial = globalCurriculumTarget(payload);
    const added = initial.newSubjects || [];
    const base = initial.subjects.filter(subject => !added.includes(subject));
    const element = document.createElement('div');
    element.className = 'global-curriculum-fields';
    const subjects = document.createElement('p');
    subjects.className = 'generation-launch-subjects';
    subjects.textContent = `Subjects: ${base.join(', ')}`;
    element.append(subjects);
    const field = (title, placeholder, rows, value) => {
        const label = document.createElement('label');
        label.textContent = title;
        const input = document.createElement('textarea');
        input.rows = rows;
        input.placeholder = placeholder;
        input.value = value;
        input.autocomplete = 'off';
        input.autocapitalize = 'none';
        input.spellcheck = false;
        label.append(input);
        element.append(label);
        return input;
    };
    const additions = field('Additional subjects (optional)', 'earth-science, economics', 2, added.join(', '));
    const mandatory = field('Required decks (optional)', 'mathematics: fourier-analysis, measure-theoretic-probability\nphysics: quantum-mechanics', 4,
        (initial.mandatoryDecks || []).map(group => `${group.subject}: ${group.decks.join(', ')}`).join('\n'));
    const hint = document.createElement('p');
    hint.className = 'global-curriculum-hint';
    hint.textContent = 'Kebab-case. Required decks: one subject per line.';
    element.append(hint);
    return { element, read: () => parseGlobalCurriculumFields(base, additions.value, mandatory.value) };
}

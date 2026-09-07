import { describe, expect, it } from 'vitest';
import { canonicalMandatoryDecks, globalCurriculumTarget, parseGlobalCurriculumFields } from './global-curriculum-input.js';
import { buildFreshGenerationContext } from './fresh-generation.js';

describe('global curriculum launch inputs', () => {
    it('parses additional subjects and per-subject required decks into canonical inputs', () => {
        expect(parseGlobalCurriculumFields(['math'], 'physics, earth-science',
            'physics: quantum-mechanics\nmath: probability, fourier-analysis')).toEqual({
            subjects: ['earth-science', 'math', 'physics'], newSubjects: ['earth-science', 'physics'],
            mandatoryDecks: [{ subject: 'math', decks: ['fourier-analysis', 'probability'] },
                { subject: 'physics', decks: ['quantum-mechanics'] }]
        });
        expect(parseGlobalCurriculumFields(['math'], '', '')).toEqual({ subjects: ['math'] });
        expect(parseGlobalCurriculumFields([], 'math', 'math: arithmetic')).toEqual({ subjects: ['math'], newSubjects: ['math'],
            mandatoryDecks: [{ subject: 'math', decks: ['arithmetic'] }] });
    });
    it.each([
        ['Physics', '', /kebab-case/], ['math', '', /already listed/], ['physics physics', '', /duplicates/],
        ['', 'math: linear_algebra', /kebab-case/], ['', 'math: Linear-algebra', /kebab-case/],
        ['', 'physics: mechanics', /listed subject/], ['', 'math: ', /kebab-case/],
        ['', 'math: algebra, algebra', /duplicates/], ['', 'math algebra', /subject: deck-one/],
        ['', 'math: algebra: geometry', /subject: deck-one/], ['', 'math: algebra\nmath: geometry', /once/]
    ])('rejects invalid fields (%s, %s)', (subjects, decks, message) => {
        expect(() => parseGlobalCurriculumFields(['math'], subjects, decks)).toThrow(message);
    });
    it('normalizes old single-add launches but rejects inconsistent metadata and extra deck context', () => {
        expect(globalCurriculumTarget({ subjects: ['physics', 'math'], newSubject: 'physics' }))
            .toEqual({ subjects: ['math', 'physics'], newSubjects: ['physics'] });
        expect(() => globalCurriculumTarget({ subjects: ['math'], newSubjects: ['physics'] })).toThrow(/included/);
        expect(() => globalCurriculumTarget({ subjects: ['math'], newSubject: 'math', newSubjects: ['math'] })).toThrow(/one new/);
        expect(() => canonicalMandatoryDecks([{ subject: 'math', decks: ['algebra'], chapters: ['OLD_CONTENT'] }], ['math'])).toThrow();
    });
    it('includes only explicit names in model input, never addition metadata or old content', () => {
        const catalog = new Proxy({}, { get() { throw new Error('Old catalog accessed'); } });
        const target = parseGlobalCurriculumFields(['math'], 'physics', 'math: algebra');
        const input = buildFreshGenerationContext({ ...target, jobType: 'curriculum-design', catalog });
        expect(input).toEqual({ subjects: ['math', 'physics'], mandatoryDecks: [{ subject: 'math', decks: ['algebra'] }] });
        expect(input).not.toHaveProperty('newSubjects');
        expect(buildFreshGenerationContext({ jobType: 'curriculum-design', subjects: target.subjects, mandatoryDecks: [], catalog }))
            .toEqual({ subjects: target.subjects });
    });
});

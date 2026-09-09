import { CURRICULUM_LEVELS } from '../../src/fresh-generation.js';
import { GLOBAL_CURRICULUM_FORMAT } from '../../src/global-curriculum-compiler.js';

const string = { type: 'string' };
const list = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const outcomes = list(object({ id: string, description: string }));
const level = { type: 'string', enum: CURRICULUM_LEVELS };
export function freshGenerationSchema(jobType) {
    if (jobType === 'curriculum-design') return object({
        schema_version: { type: 'integer', enum: [GLOBAL_CURRICULUM_FORMAT] },
        subjects: list(string),
        decks: list(object({
            id: string, title: string, description: string, level,
            scope: object({ includes: list(string), excludes: list(string) }), outcomes, practice: list(string),
            required_outcome_ids: list(string)
        })),
        coverage: list(object({ subject: string, domain: string, level,
            disposition: { type: 'string', enum: ['included', 'deferred', 'out-of-scope'] },
            outcome_ids: list(string), rationale: string })),
        scopeIssues: list(string), practiceNotes: list(string)
    });
    if (jobType === 'deck-plan') return object({ deckId: string, chapters: list(object({ id: string, title: string, outcomes, prerequisites: list(string) })), scopeIssues: list(string) });
    if (jobType === 'chapter-expand') return object({ chapterId: string, markdown: string,
        coldStartAudit: string, figurePlan: string, scopeIssues: list(string) });
    throw new Error('Unsupported generation job.');
}

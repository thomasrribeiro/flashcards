import { CURRICULUM_LEVELS, GLOBAL_CURRICULUM_VERSION } from '../../src/fresh-generation.js';

const string = { type: 'string' };
const list = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const outcomes = list(object({ id: string, description: string }));
const level = { type: 'string', enum: CURRICULUM_LEVELS };
const targets = list(object({ deck_id: string, outcome_ids: list(string) }));
export function freshGenerationSchema(jobType) {
    if (jobType === 'curriculum-design') return object({
        curriculum_version: { type: 'string', enum: [GLOBAL_CURRICULUM_VERSION] },
        subjects: list(string),
        coverage: list(object({ subject: string, domain: string, level,
            disposition: { type: 'string', enum: ['included', 'deferred', 'out-of-scope'] },
            targets, rationale: string })),
        decks: list(object({
            id: string, subject: string, title: string, description: string, outcomes,
            level, scope: object({ includes: list(string), excludes: list(string) }), practice: list(string),
            prerequisites: list(string), required_outcomes: targets
        })), scopeIssues: list(string)
    });
    if (jobType === 'deck-plan') return object({ deckId: string, chapters: list(object({ id: string, title: string, outcomes, prerequisites: list(string) })) });
    if (jobType === 'chapter-expand') return object({ chapterId: string, markdown: string,
        coldStartAudit: string, figurePlan: string, scopeIssues: list(string) });
    throw new Error('Unsupported generation job.');
}

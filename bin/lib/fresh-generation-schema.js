const string = { type: 'string' };
const list = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const outcomes = list(object({ id: string, description: string }));
export function freshGenerationSchema(jobType) {
    if (jobType === 'curriculum-design') return object({ subjects: list(string), decks: list(object({
        id: string, subject: string, title: string, description: string, outcomes,
        prerequisites: list(string), required_outcomes: list(object({ deck_id: string, outcome_ids: list(string) }))
    })) });
    if (jobType === 'deck-plan') return object({ deckId: string, chapters: list(object({ id: string, title: string, outcomes, prerequisites: list(string) })) });
    if (jobType === 'chapter-expand') return object({ chapterId: string, markdown: string,
        coldStartAudit: string, figurePlan: string, scopeIssues: list(string) });
    throw new Error('Unsupported generation job.');
}

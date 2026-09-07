import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FLASHCARDS_ROOT } from './paths.js';

// Each operation receives only its own instructions. The pinned workflow
// commit versions these bytes; no runtime prompt suffix hides extra rules.
export function freshGenerationInstructions(jobType) {
    const references = '.agents/skills/manage-flashcard-decks/references';
    const workflows = { 'curriculum-design': 'global-curriculum-workflow.md',
        'deck-plan': 'deck-plan-workflow.md', 'chapter-expand': 'chapter-expand-workflow.md' };
    if (!Object.hasOwn(workflows, jobType)) throw new Error('Unsupported generation job.');
    const files = [`${references}/${workflows[jobType]}`];
    if (jobType === 'chapter-expand') files.push('templates/guides/CARD_STANDARD.md', 'templates/guides/AUTHORING_PLAYBOOK.md');
    return files.map(file => readFileSync(path.join(FLASHCARDS_ROOT, file), 'utf8')).join('\n\n');
}

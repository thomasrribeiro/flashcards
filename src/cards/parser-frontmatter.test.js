import { describe, expect, it } from 'vitest';
import { parseDeck } from './parser.js';

describe('chapter curriculum frontmatter', () => {
    it('preserves prerequisite and provided-concept arrays for study ordering', () => {
        const { metadata } = parseDeck(`+++
order = 2
prerequisites = ["chapter:01_foundations", "tool:algebra"]
provides = ["concept:applications"]
+++

Q: What is the application?
A: An example.
`, 'flashcards/02_applications.md');

        expect(metadata).toMatchObject({
            order: 2,
            prerequisites: ['chapter:01_foundations', 'tool:algebra'],
            provides: ['concept:applications']
        });
    });
});

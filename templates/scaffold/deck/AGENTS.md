# {{DECK_TITLE}} deck instructions

Read and follow, in order:

1. `{{FLASHCARDS_ROOT}}/templates/guides/CARD_STANDARD.md`
2. `{{FLASHCARDS_ROOT}}/templates/guides/AUTHORING_PLAYBOOK.md`
3. `{{FLASHCARDS_ROOT}}/templates/guides/{{SUBJECT}}.md` when it exists
4. `../SUBJECT_BRIEF.md` and `../ROADMAP.md`
5. This repository's `deck.toml`, `README.md`, and `CARD_README.md`

Use the flashcards application's parser, stable-ID implementation, and
validator as executable truth. Establish prerequisites before applications.
Create the smallest sufficient card set; do not optimize for card count.

Preserve every existing `card-id` when correcting or improving the same
retrieval target. Assign a new ID when a card tests materially new knowledge.
Use original SVG figures where spatial, temporal, structural, or graphical
reasoning is itself part of the target.

Run `flashcards deck validate .` before handoff. Do not commit, push, create a
remote repository, or deploy unless the user asks.

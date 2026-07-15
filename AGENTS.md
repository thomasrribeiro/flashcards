# Flashcards repository instructions

This repository contains the browser application, deterministic deck CLI,
card parser and identity model, validation scripts, authoring standards, and
the repo-scoped `$manage-flashcard-decks` skill.

## Required checks

For application or CLI changes, run:

```bash
npm test
npm run build
git diff --check
```

For skill changes, also run:

```bash
python3 /Users/thomasribeiro/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/manage-flashcard-decks
```

For deck changes, use `flashcards deck validate <deck-path>` and inspect every
changed figure. Do not treat lints as automatically equivalent in severity;
interpret them using `templates/guides/CARD_STANDARD.md`.

## Architecture boundaries

- `src/parser.js` defines the accepted Markdown card syntax.
- `src/hasher.js` and `src/review-identity.js` define persistent identity and
  legacy schedule migration.
- `scripts/validate-notes.js` is the deterministic collection validator.
- `bin/flashcards.js` exposes deterministic deck operations plus isolated,
  provenance-recorded Codex subject/build/audit handoffs.
- `.agents/skills/manage-flashcard-decks/` owns the reusable agent workflow.
- `templates/guides/` owns universal and subject-specific authoring guidance.

Do not put provider credentials, model-pinned generation logic, or large
pedagogical prompts in the CLI. Do not duplicate universal standards in every
deck scaffold. Add deterministic behavior to code and judgment-heavy behavior
to the skill or applicable guide.

## Review-history safety

Every new card block requires a stable `card-id`. Preserve it when the retrieval
target is unchanged. Assign a new ID for materially new retrieval. Preserve
aliases and never bulk-regenerate IDs. Before revising a studied legacy deck,
run `flashcards deck stabilize <deck-path>`.

## Repository and deployment safety

Preserve unrelated user changes. Do not modify the separate flashcards-worker
repository, production data, authentication configuration, GitHub remotes, or
deployment secrets unless the user explicitly places them in scope.

# Flashcards frontend instructions

This branch is a standalone frontend. Preserve the visual design and keep UI copy short.

## Boundaries

- Keep view behavior in focused modules and storage behind `src/storage/local-store.js`.
- `src/cards/parser.js` defines accepted card syntax.
- `src/cards/hasher.js` defines stable identity; preserve the hashes and aliases of existing cards.
- `src/cards/deck-loader.js` parses imported decks and loads bundled examples.
- `src/curriculum/curriculum.js` projects and lays out an existing graph; it does not generate curricula.
- Do not reintroduce provider credentials, AI prompts or generation orchestration into the browser.

## Safety

Preserve unrelated user changes and existing card IDs and aliases. Do not modify the separate worker repository, production data, authentication configuration, remotes or deployment secrets without explicit authorization. Local preview data uses a separate storage namespace; do not migrate or erase prior account data implicitly.

## Checks

For application changes, run `npm test`, `npm run build` and `git diff --check`. For view changes, inspect desktop and mobile rendering and exercise the affected interactions. The root `tests/` directory is intentionally excluded; unit tests live beside source files. Preserve bundled card content unless deck edits are explicitly requested.

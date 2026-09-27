# Flashcards frontend instructions

This branch is a standalone frontend. Preserve the visual design and keep UI copy short.

## Boundaries

- Keep view behavior in focused modules and storage behind `src/local-store.js`.
- `src/parser.js` defines accepted card syntax.
- `src/hasher.js` and `src/review-identity.js` define stable identity and legacy migration utilities.
- `src/curriculum.js` projects and lays out an existing graph; it does not generate curricula.
- Do not reintroduce provider credentials, AI prompts or generation orchestration into the browser.
- The backend proposal in `docs/backend-plan.md` is not an implemented contract.

## Safety

Preserve unrelated user changes and existing card IDs and aliases. Do not modify the separate worker repository, production data, authentication configuration, remotes or deployment secrets without explicit authorization. Local preview data uses a separate storage namespace; do not migrate or erase prior account data implicitly.

## Checks

For application changes, run `npm test`, `npm run build` and `git diff --check`. For view changes, also run `npm run test:e2e` and inspect desktop and mobile rendering. Preserve bundled card content unless deck edits are explicitly requested.

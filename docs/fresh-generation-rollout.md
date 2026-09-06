# Fresh generation rollout

## Agreed behavior

Preserve breadcrumbs, subject overview, subject-filtered deck views, local
chapter views, and Prereqs & unlocks. The canonical prerequisite model is one
global deck DAG plus one internal chapter DAG per deck. Do not add a full-graph
screen. Cross-deck prerequisites identify required learning outcomes, not
external chapters or blanket completion of entire decks.

Adding a subject and regenerating the curriculum must use the same global
workflow with the full subject list. It is an order-independent input contract,
not a guarantee that independent model samples produce identical curricula.
All three job types disclose and pin model and reasoning before launch.

## Implemented workflow

- `src/fresh-generation.js`: allowlisted, canonical context projections;
  global/local candidate validators; exact subject coverage; cycle, unresolved
  outcome and cross-deck chapter checks; stale-base guard.
- `bin/lib/fresh-generation-provider.js`: tool-free OpenAI Responses adapter,
  no stored conversation or previous response, no inherited CLI capabilities,
  explicit output schema and input/instruction/schema hashes. Unsupported
  providers fail closed. Explicitly versioned queued jobs use this adapter;
  legacy CLI audits remain separate and are never a fallback.
- `src/generation-dag-review.js`: global comparison, before/after field values,
  outcome-annotation changes and downstream chapter/card impact inventory.
- Fresh authoring rules are versioned separately from legacy audit workflows.
- `fresh-generation-runner.js`: pins the registry and workflow, verifies the
  input catalog hash and subject list, generates without tools, validates the
  candidate, archives old metadata, and publishes review-only pull requests.
- `fresh-curriculum.json` becomes the canonical global specification when a
  fresh global proposal is accepted. `registry build` validates it and emits
  the existing catalog format. Older subject TOML files remain untouched for
  recovery; they no longer override this canonical snapshot.
- Add subject and Regenerate curriculum share the global pipeline. Existing
  viewers, breadcrumbs, three-column mobile layout and neighborhood navigation
  remain. Subject-only regeneration is removed from the UI.
- The worker validates the fresh input allowlist, handles global job keys,
  exposes cancellation status, and guards acceptance using a pinned,
  single-parent commit and a non-forced fast-forward. The frontend does not
  use its legacy merge path for fresh jobs.
- The preview shows before/after fields, added/removed edges, and affected
  plans. Changed specs/ancestry retire old chapter plans from the new catalog;
  previous metadata is archived, never destroyed. Unaffected plans remain.

## Release boundaries and follow-up work

1. Legacy catalogs without explicit learning outcomes must first receive a
   reviewed global proposal, then new chapter plans. No heuristic migration
   invents outcome requirements from old cards or cross-deck chapter links.
2. Renames, splits, merges and equivalent retrieval targets have no automatic
   identity mapping. A dedicated mapping editor is future work. Fresh cards
   receive new IDs, without borrowing old IDs/aliases. Existing studied
   repositories/history are not deleted by accepting a curriculum.
3. Fresh chapter output currently supports Markdown cards, not generated file
   assets. Missing figure or source-verification work must be reported as a
   scope issue; it fails closed, never claims verification was performed.
   Human content review remains required. Extend with isolated asset authoring
   and separate evidence verification before claiming full authoring parity.
4. Flashcards use a deck PR plus a registry PR. Both are checked before applying,
   then fast-forwarded separately, deck first. This is not a cross-repository
   transaction. A concurrent registry change can leave accepted cards awaiting
   metadata reconciliation; never roll them back or overwrite newer work.
5. Other providers need equally restricted adapters. No provider/model/reasoning
   substitution or automatic paid retry is allowed.

Existing queued legacy jobs keep their recorded workflow contract; they are
not relabeled fresh. No live generation, content migration or provider billing
is part of infrastructure tests. Mock HTTP requests and keep production
credentials out of test logs. Deployment does not itself regenerate curricula.

## Verification

Run `npm test`, `npm run build`, `git diff --check`, and skill quick validation.
Browser tests must preserve the three-column mobile layout, center-layer label,
scrolling, breadcrumbs, and cross-subject Prereqs & unlocks navigation.
Workflow tests cover canonical add-subject/regeneration inputs, stale drafts,
cancellation, no-content-access sentinels, graph integrity, archived metadata,
strict schema structure, and guarded global preview acceptance. Network and
GitHub publication are mocked; no paid provider generation was run.

API references: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
and [reasoning](https://developers.openai.com/api/docs/guides/reasoning).
Acceptance uses [GitHub references](https://docs.github.com/en/rest/git/refs).

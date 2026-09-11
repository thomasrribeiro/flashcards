# Fresh generation rollout

## Agreed behavior

Preserve breadcrumbs, subject overview, subject-filtered deck views, local
chapter views, and Prereqs & unlocks. The canonical prerequisite model is one
global deck DAG plus one internal chapter DAG per deck. Do not add a full-graph
screen. Cross-deck prerequisites are deck-level requirements annotated with
the outcomes that justify them. An annotation does not exempt a learner from
the source deck or its ancestor closure. Chapter graphs remain local.

Adding a subject and regenerating the curriculum must use the same global
workflow with the full subject list. It is an order-independent input contract,
not a guarantee that independent model samples produce identical curricula.
All three job types disclose and pin model and reasoning before launch.

## Implemented workflow

- `src/global-curriculum-compiler.js`: read-only support for historical format-2
  outputs. Current generation uses explicit deck/outcome references instead.
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

### Whole-field curriculum contract

New global runs use `references/global-curriculum-workflow.md` verbatim, with
no appended instructions or chapter/card-authoring bundle. The queued
`workflowCommit` and recorded instruction/schema hashes pin the exact contract;
the transport envelope remains `fresh-generation-v1`. The host stamps
`curriculum_schema_version: 1` after validation. The model-facing schema is
restored byte-for-byte from request #58 (workflow `8eed586`). The instruction
file also returns to that baseline, except its final-audit revision permission
is replaced with the user's single-candidate, no-self-revision rule. This is
a rollback experiment, not proof of educational quality or reliability.
Historical format-2 outputs, unversioned
catalogs and the short-lived
`curriculum_version: whole-field-v1` marker remain readable. New runs require
the coverage contract regardless of metadata.

The launch dialog accepts optional additional subjects and required deck names
in `subject: deck-one, deck-two` lines. Names must use kebab-case. The request
stores the complete subject list, `newSubjects`, and optional `mandatoryDecks`
groups. The runner checks additions against the pinned registry before a paid
call, and requires the returned candidate to contain every mandatory deck ID.
The input projector forwards only subjects and nonempty mandatory-deck groups.
Deduplication and uncertain-submission recovery distinguish required-deck lists,
but not addition metadata. Old single-`newSubject` requests remain compatible.

The structured candidate requires a domain-and-level coverage map targeting
deck IDs and their local outcome IDs, deck learning levels, included/excluded
scope, authentic practice, and `scopeIssues`. Each deck declares its subject,
prerequisites and `required_outcomes`; coverage rows declare `targets`. Validation
checks these references without guessing, adding content, consulting an old
catalog or modifying the retained raw response. The experimental format-2
compiler is not used by new jobs; it remains available for archived inspections.

Deterministic checks reject unmapped
outcomes, missing targets, mismatched target levels, contradictory dispositions,
duplicate rows, and empty rationales. Unresolved scope issues stop publication
without another generation call; intentional exclusions persist in the catalog's
coverage rows for review. These checks cannot prove semantic completeness.
The existing compact diff does not yet display the complete coverage map.

Global jobs now return separate `practiceNotes` for nonblocking external-practice
conditions (supervision, facilities, institutional approval). Notes persist in
the candidate and appear collapsed in preview. Missing curriculum content,
prerequisites, or correctness verification remain blocking `scopeIssues`;
the runner never downgrades issues with keyword matching. Legacy catalogs may
omit practice notes, but new global responses must include the array.

Before validation, each completed global response is saved with its provenance
under `~/.flashcards/generation-drafts/request-<id>-<unique>/` on the runner,
outside disposable Git worktrees. Files are private to the runner user and
contain no credentials or old catalog. The single raw candidate, validation
report, diagnostics and start marker are retained even on cancellation or failure.
A successful proposal also archives them under `generation-archive/request-<id>/attempts`.
For valid structure, `attempt-1-validated.json` records the normalized candidate,
contract version and hashes of both raw and validated JSON. Existing archived
proposals and format-2 compilation artifacts remain readable without migration.
Structurally valid scope failures expose a read-only web preview and diff;
structural failures expose the returned JSON instead of an invented graph. Neither
case automatically resumes or repairs a job. Interrupted streams without
a completed JSON candidate cannot supply a recoverable draft. Earlier discarded
jobs cannot be recovered retroactively by this change.

`attempt-1-provider.json` records allowlisted completion status, incomplete reason,
returned output-token limit and usage (input, cached input, output, reasoning and
total tokens) before candidate parsing or validation. Missing values stay null.
The same diagnostics accompany parsed-candidate provenance. Arbitrary provider
error messages, reasoning text and request metadata are never retained. A
completed empty candidate is not automatically diagnosed as token exhaustion;
the model's prose is not provider evidence. Transport failures may have no
terminal response or usage to record. This change does not alter token limits,
model choice, transport, or the number of generation calls.

Completed JSON that fails structural validation now retains a separate
`invalid-output` review: validation errors and inert returned JSON, not a DAG
or a publishable proposal. Activity polling omits the output body; the
owner-authenticated preview endpoint loads it on demand. Large online outputs
are explicitly marked truncated; the complete local artifact stays untouched.
Transport failures without completed JSON still have no output to review.
Existing retained artifacts can be attached to failed requests without rerunning
generation. Neither status nor acceptance eligibility is upgraded by doing so.

Every global job makes one generation call. Validation, external reviews and
previous candidates never become model feedback. The permitted iteration is
external review → update canonical instructions → test/push/deploy → fresh job.
Read-only polling retrieves the same response; it is not another generation.
Cancellation is checked before the call and publication. Transport/refusal/
incomplete-response failures are not automatically retried.

The external evaluation workflow uses a frozen scope map and separates
structural/educational blockers from warnings and optional refinements. Neither
counts nor the published curriculum define success. The fixed offline regression
suite runs with `npm run test:curriculum`; reviewer calibration and proposed
small paid probes are in `references/curriculum-evaluation-cases.md` within the
skill. Their criteria are reviewer-only, not extra generator input. Passing
synthetic tests is not evidence of model quality; paid probes require a recorded
budget, and full-scale promotion requires their independent review.

Registry-free probes use `curriculumProbeJob` and the authenticated job queue
with `evaluationOnly: true`. Their payload contains only subject names and
the pinned workflow/model/reasoning configuration, with no registry target or
baseline. The trusted runner uses the same instruction file, strict schema,
single-call retention and validator as production, but branches before any
registry access or publication. The evaluation flag is never model context.
Successful probes expose a read-only preview against an empty evaluation
catalog. Acceptance is blocked using the stored request payload, not merely
the preview's metadata. They cannot change the collection or published DAG.

Accepted scope/practice/level specifications are projected into later chapter
and card requests. Their changes invalidate affected and downstream plans;
archived content and review history remain untouched. Global generation still
receives only canonical subject names and explicit mandatory deck names, not
the existing coverage map or deck specifications.

Each operation now has a dedicated prompt file. The obsolete combined prompt
and hidden runtime suffix are removed. Deck chapter planning now has a real
`scopeIssues` schema field and publication gate instead of asking for a field
its schema forbade. Legacy CLI audit/build commands remain supported; they
are separate, still-used workflows rather than dead generation code.

### Remaining boundaries

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
   substitution, draft revision or uncertain transport retry is allowed.

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

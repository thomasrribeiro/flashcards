---
name: manage-flashcard-decks
description: Create, expand, audit, or modernize durable spaced-repetition flashcard decks in the flashcards ecosystem. Use for new subject roadmaps, new deck curricula, chapter/card authoring, whole-deck quality reviews, stable-identity-safe revisions, and figure planning or auditing.
---

# Manage Flashcard Decks

Build for durable learning, not card volume. Treat the application parser,
stable-ID implementation, and validator as executable truth.

## Establish the operation

Infer one mode from the request and CLI prompt:

- **build**: research and create a new or incomplete deck;
- **expand**: add a chapter or close a defined coverage gap;
- **audit**: inspect and improve an existing deck end to end;
- **report-only**: inspect without writing files.

State the target deck, learner level, assumed prerequisites, and requested
write boundary before substantive work. Preserve unrelated user changes.

## Load context in order

Use the ordered context manifest supplied by the CLI when present. Otherwise,
read each applicable file completely before editing:

1. `templates/guides/CARD_STANDARD.md`;
2. `templates/guides/AUTHORING_PLAYBOOK.md`;
3. the applicable `templates/guides/<subject>.md`, when present;
4. the subject's routing `AGENTS.md`, learner-specific `ROADMAP.md`, and
   `SUBJECT_BRIEF.md`; use legacy `AUTHORING_GUIDE.md` only when the brief is
   absent;
5. the deck's routing `AGENTS.md`, machine-readable `deck.toml`, scope/source
   `README.md`, and deck-specific `CARD_README.md`;
6. [references/audit-workflow.md](references/audit-workflow.md) for whole-deck
   audits;
7. the preflight JSON report named in the prompt, when present.

If a deck predates these files, infer its current contract from its README and
cards. Add missing metadata only when the requested mode permits edits. Do not
copy long universal guidance into deck-local documents.

## Research before authoring

For build, expand, and editing audits:

1. Map desired capabilities and true prerequisite edges before chapter count.
2. Search current authoritative sources appropriate to the domain.
3. Prefer consensus bodies, primary literature, public agencies, and openly
   licensed educational materials.
4. Record URLs, authority, license or terms, and access dates in the deck.
5. Distinguish curricular sources from sources that verify individual claims.
6. Do not ingest or reproduce material merely because it is freely viewable.
7. Identify uncertainty, contested claims, simplified models, and conditions
   of validity explicitly.

When the subject brief is only a scaffold, research and complete it before
creating a large deck. Keep reusable domain guidance in the repository subject
guide, learner-specific choices in `SUBJECT_BRIEF.md`, sequence in `ROADMAP.md`,
and deck-specific retrieval decisions in `CARD_README.md`.

## Design the learning progression

Arrange material as a prerequisite graph. Within a chapter, prefer this arc
where applicable:

1. motivation and prerequisite bridge;
2. operational definitions and boundary conditions;
3. causal mechanism or governing structure;
4. translation among authentic representations;
5. qualitative prediction;
6. misconception or error diagnosis;
7. worked or analyzed example;
8. faded then independent application;
9. mixed discrimination against neighboring ideas.

Ensure a learner encounters and understands a concept before an application
card assumes it. Do not duplicate prerequisite decks merely to make cards feel
self-contained.

Unconfirmed domain knowledge defaults to not mastered. Before authoring, create
a concept-dependency ledger listing allowed inbound knowledge and, for every new
term, symbol, representation, or procedure, its first explanation, supported
retrieval, and later application. Do not count revealing an answer after an
uninformed failure as explanation.

Before authoring, record a chapter design ledger in `CARD_README.md` or an
equivalent deck-local plan. For each chapter, map retrieval targets to card
forms, the analyzed-to-independent problem progression, authentic
representations, and every plausible figure opportunity. Mark an opportunity as
included or intentionally omitted with a short reason. This is not a numeric
quota: zero clozes or figures can be correct, and a visually rich chapter can
require several figures. Reconcile the planned and actual inventories before
handoff.

For a new deck, author one pilot chapter before scaling. Run the cold-start
workflow in [references/cold-start-workflow.md](references/cold-start-workflow.md),
record its report, and stop for explicit learner or maintainer approval before
building later chapters. A request that explicitly names a previously approved
pilot or an established existing deck may proceed chapter by chapter.

## Author cards safely

- Make one card equal one meaningful grading and scheduling decision.
- Use the smallest sufficient set; do not impose per-chapter quotas.
- Put the direct answer first, followed by only enough explanation to repair an
  error or distinguish a tempting alternative.
- Use stable `card-id` comments on every new card block.
- Preserve an existing ID for corrections, wording, formatting, accessibility,
  or figures when the retrieval target is unchanged.
- Assign a new ID when the learner must retrieve materially different
  knowledge. Never let a new target inherit mastery accidentally.
- Preserve `card-alias` comments.
- Keep canonical lowercase kebab-case subjects and tags and ordered
  `NN_snake_case.md` chapter files.

## Use figures for retrieval

Add figures wherever spatial, temporal, structural, graphical, or relational
reasoning benefits—not according to an arbitrary cap. Prefer original SVGs for
technical diagrams. Require a `viewBox`, meaningful `<title>` and `<desc>`,
phone-width legibility, high contrast, and a redundant cue beyond color.

Assess figure opportunities by retrieval role rather than chapter count. Do not
stop at one figure when diagrams, graphs, before/after states, experimental
setups, or representation translations support distinct decisions.

Keep answer-revealing labels off the front. Use meaningful Markdown alt text
that remains accessible without leaking the answer. Do not use generated
raster art for exact geometry, quantitative graphs, anatomy, force direction,
or scale-critical representations.

## Audit an existing deck

Inventory first; then work one chapter at a time. Treat
incorrect claims, parser loss, broken math/assets, and identity corruption as
critical. Treat omitted prerequisites, ambiguous cues, non-atomic prompts, and
misleading figures as major.

Do not silently broaden a deck beyond its roadmap. Record intentional omissions
and remaining uncertainties.

## Validate and hand off

After every chapter-sized change, parse the affected files and inspect changed
figures. Before final handoff:

1. run `flashcards deck stabilize <deck> --check`;
2. run `flashcards deck validate <deck>`;
3. run relevant application tests when parser or identity behavior changed;
4. run `git diff --check` in every modified repository;
5. review every diff for accidental ID or scope changes;
6. summarize new, modified, removed, and intentionally omitted material;
7. distinguish local edits, commits, pushes, and deployment status.

For new builds and sequencing audits, also verify that the required cold-start
report maps every front dependency to confirmed inbound knowledge or an earlier
establishment point.

Never commit, push, create a remote repository, or deploy unless the user or
the invoking prompt explicitly authorizes it.

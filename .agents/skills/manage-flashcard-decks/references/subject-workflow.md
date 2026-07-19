# Subject curriculum workflow

Use this workflow when creating or substantially revising a subject roadmap.
The goal is a learnable curriculum, not merely a taxonomy of the field.

## Honor the requested destination

The CLI supplies a destination and deck granularity. Treat them as design
constraints:

- `literacy`: durable conceptual and practical literacy without simulating a
  complete major;
- `undergraduate-core`: the coherent shared foundation expected before
  specialization, plus clearly labeled recommended or specialization branches;
- `graduate-core`: the advanced common foundation for graduate work, including
  only the undergraduate bridge decks that the declared outcomes actually
  require;
- `whole-field`: a navigable map of the major domains and contemporary
  branches across learning levels, with deliberate future extension points;
- `research-specialization`: a focused route into one or more named research
  areas, with the minimum honest prerequisite bridge from earlier levels.

Do not silently change the destination because a familiar textbook or
curriculum framework uses a different one. Put unresolved personal choices in
`SUBJECT_BRIEF.md`, but still produce a coherent proposal for the requested
destination.

Destination is not a ceiling and does not classify the learner. A subject can
contain decks from several levels, and a later extension can add graduate or
research branches without deleting or renaming approved earlier decks.
`deferred` means a visible future extension point, never “this learner is not
allowed to study it.” Use `out-of-scope` only for material outside the subject
or declared practice horizon.

For `research-specialization`, honor every CLI-supplied focus slug. For
`whole-field`, map representative advanced routes without pretending that
every active research microfield belongs in the initial roadmap.

## Map the field before naming decks

First inventory the subject's major domains, recurring practices,
representations, and interdisciplinary boundaries from the maintained domain
guide and current authoritative curriculum frameworks. Record every material
domain in the roadmap coverage matrix as:

- `included`: assigned to one or more proposed decks;
- `deferred`: valuable but intentionally postponed beyond this destination;
- `out-of-scope`: outside the declared subject or use horizon.

An omitted domain must be a visible decision. Do not turn framework headings
into equal-sized decks or equal card quotas.

## Make one deck a coherent learning unit

The default `course` granularity means one repository should support one
coherent course-scale capability, normally estimated at 6–14 ordered chapters.
The estimate is a planning stress test, not a chapter quota.

Split a candidate deck when it:

- joins subfields that can be learned or practiced independently;
- would require multiple unrelated source registers, representation grammars,
  or capstone performances;
- creates a false prerequisite, where learning one internal topic forces
  completion of several unrelated topics;
- cannot plausibly progress from foundations to independent application within
  the requested chapter range; or
- is held together mainly by a broad institutional label such as “advanced
  topics,” “quantitative methods,” or “organismal biology.”

Merge candidates when they share the same prerequisites, conceptual spine,
authentic representations, practice portfolio, and culminating capability.
Do not create tiny decks merely to mirror every framework heading.

For other granularities, use the range supplied by the CLI and apply the same
coherence test.

## Separate necessity from helpful order

`prerequisites` are hard knowledge dependencies. For a cold-start learner,
every listed prerequisite means the target deck may freely assume the entire
prerequisite deck's declared outcomes. Add an edge only when that is genuinely
necessary.

Use `recommended_after` when an earlier deck would make the target easier,
provide motivating examples, or fit a conventional sequence but is not needed
for successful cold-start learning.

If a target needs only one concept buried inside a broad predecessor, do not
add the broad deck as a hard prerequisite. Split the predecessor, introduce a
small explicit bridge, or use recommended sequencing.

Keep both edge types direct and minimal. Do not list an ancestor already
guaranteed through another direct edge.

## Reuse capabilities across subjects

Read the generated cross-subject curriculum catalog before proposing a new
subject. A local reference uses `deck-id`; an established external capability
uses the canonical `subject/deck-id` form.

Do not recreate algebra, statistics, programming, chemistry, or another broad
capability inside every subject merely to make its roadmap look self-contained.
Reference the established external deck when the complete capability is truly
required. Use `recommended_after` when it is useful preparation but a
cold-start learner could still succeed without it.

A subject-specific bridge is appropriate only when the transfer itself needs
instruction—for example, translating mathematical notation into a new domain's
representations—or when the target needs a small subset that would make the
entire external deck a false prerequisite. Explain that choice in `ROADMAP.md`.
Never invent a qualified reference absent from the supplied catalog.

The hierarchy remains subject → deck → chapter → card for ownership and
navigation. Prerequisite edges form one collection-wide directed acyclic graph
that may cross those ownership boundaries.

## Assign curriculum tiers

Every deck has one tier:

- `core`: required for the declared destination or for several major branches;
- `recommended`: valuable breadth or reinforcement that is not universally
  required;
- `specialization`: a learner-selected branch or advanced application.

Tier is not status. New proposals remain `proposed` until approved.

## Assign learning levels separately

Every schema-v3 deck also has one level:

- `foundational`: entry tools or literacy that do not assume a university
  treatment of the subject;
- `undergraduate-core`: shared major-level foundations;
- `undergraduate-advanced`: upper-division depth or an undergraduate
  specialization;
- `graduate`: graduate common foundations or advanced specialist preparation;
- `research-specialization`: literature-facing research methods and focused
  frontier study.

Level describes the deck's assumed maturity; tier describes its priority for
the requested destination. They are independent. A graduate deck may be
`core` for a graduate destination, while an undergraduate deck may be
`recommended` because it is only one possible bridge. A hard prerequisite
cannot have a later level than its dependent deck.

For every graduate or research-specialization proposal, audit the maturity
transition rather than relying on the label. Enumerate what the first chapter
may assume—formalism, mathematical tools, experimental practice, representation
grammar, and research conventions—and verify that the direct prerequisite
closure establishes it. A route may skip the immediately preceding level only
when that closure is genuinely sufficient and `ROADMAP.md` explains why. Do
not hide a missing advanced foundation inside a literature-facing deck.

## Keep the three artifacts synchronized

`SUBJECT_BRIEF.md` records the learner assumptions, requested destination,
conventions, evidence policy, and decisions needing confirmation.

`ROADMAP.md` explains:

- the field map and coverage decisions;
- deck tier, estimated chapters, durable capability, and sequencing rationale;
- hard prerequisites versus recommended order;
- cross-deck concepts and practice outside SRS; and
- deliberate exclusions and future extension points.

`subject.toml` is schema version 3 and the executable copy. It contains:

```toml
schema_version = 3
subject = "subject-slug"
destination = "whole-field"
deck_granularity = "course"
focus = []

[[decks]]
id = "coherent-deck"
order = 1
tier = "core"
level = "foundational"
prerequisites = []
recommended_after = []
estimated_chapters = 10
status = "proposed"
description = "One concise durable capability."

[[coverage]]
domain = "major-domain"
disposition = "included"
decks = ["coherent-deck"]
rationale = "Why this placement fits the requested destination."
```

All identifiers use lowercase kebab-case. Orders are unique positive
topological values within a subject. Local references name earlier decks;
cross-subject references use `subject/deck` and are checked in the global DAG.
Every included coverage row
names at least one deck; deferred and out-of-scope rows name none. Every deck
must appear in at least one included coverage row.

Before handoff, validate schema, synchronization, minimal edges, deck
coherence, chapter estimates, and coverage. A valid DAG can still be a poor
curriculum; perform the semantic stress tests above after deterministic checks.

When extending an existing subject, preserve every valid existing deck id,
level, status, and edge; approved or active entries are especially immutable.
Tiers may change because they express priority for the new destination. Add
focused decks and the minimum necessary bridge decks; do not regenerate the
whole roadmap merely because the requested destination changed. Revisit a
prior decision only when evidence or a genuine dependency error warrants it,
and document that correction.

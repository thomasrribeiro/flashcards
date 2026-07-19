# Cross-subject curriculum benchmark — 2026-07-19

## Question

Does the cross-subject subject-generation workflow generalize beyond the
physics trial, and is it reproducible enough to accept a freshly generated
roadmap without inspection?

The comparison used fresh isolated agents for biology and computer science:

- before:
  `/Users/thomasribeiro/notes/subject-benchmarks/2026-07-17-cli-v3`
- after:
  `/Users/thomasribeiro/notes/subject-benchmarks/2026-07-19-global-curriculum`
- independent biology reproduction:
  `/Users/thomasribeiro/notes/subject-benchmarks/2026-07-19-global-curriculum-reproduction`

The after collections contained the accepted mathematics and physics
manifests. Each fresh agent received the standard subject-design context plus
the generated global curriculum catalog. The CLI then validated every subject
as one graph.

## Quantitative comparison

| Subject and run | Decks | Coverage decisions | Hard edges | Recommended edges | External edges | Unique external decks | Foundation / UG core / UG advanced / graduate / research | Artifact words |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| Biology before | 34 | 35 | 51 | 51 | 0 | 0 | 3 / 12 / 11 / 5 / 3 | 6,031 |
| Biology after | 34 | 24 | 58 | 25 | 6 | 5 | 1 / 7 / 12 / 7 / 7 | 7,071 |
| Biology reproduction | 41 | 25 | 85 | 56 | 17 | 12 | 6 / 8 / 13 / 8 / 6 | 6,916 |
| Computer science before | 55 | 33 | 88 | 91 | 0 | 0 | 6 / 15 / 24 / 10 / 0 | 7,736 |
| Computer science after | 49 | 25 | 95 | 61 | 30 | 17 | 3 / 10 / 14 / 12 / 10 | 9,547 |

The final four-subject graph contains 183 decks, 31 required cross-subject
edges, and 26 recommended cross-subject edges. It has no missing references,
cycles, later-level dependencies, or transitively redundant edges. Its only
three maturity advisories belong to the previously accepted mathematics
benchmark; neither fresh subject has one.

## Biology assessment

The after curriculum is better than the CLI-v3 result. It has the same number
of decks while making the progression more explicit: one bounded cold-start
foundation, a coherent undergraduate core, separate laboratory and field
methods bridges, graduate synthesis, and representative research routes.
General mathematics is reused from the established subject, while biological
data practice and laboratory or field transfer remain biology-owned.

The curriculum also distinguishes deliberate deferral from omission.
Paleobiology is a visible future extension, and clinical practice is explicitly
outside this biology curriculum rather than silently underrepresented.

One edge deserves human review before adoption:
`inquiry-and-chemistry-of-life` requires
`mathematics/quantitative-reasoning-and-arithmetic`. The requirement is
defensible for measurement and scale, but a sufficiently self-contained first
biology course could treat it as recommended instead. This is a semantic
judgment, not a graph error.

## Computer-science assessment

The after curriculum is substantially better than the CLI-v3 result. It removes
four locally duplicated mathematics bridges and replaces them with precise
external capabilities. It also supplies the maturity layers absent from the
old roadmap: graduate methods and ten representative research-facing routes.

The prerequisite semantics improved during the run. Machine learning now
requires programming practice, linear algebra, and statistical inference;
classical artificial intelligence is recommended rather than falsely required.
Advanced agents then require both AI and machine learning. Embedded systems
requires systems architecture while circuits are recommended, avoiding a
physics prerequisite for learners who can acquire the bounded hardware model
inside the course.

The result remains intentionally ambitious. Forty-nine course-scale decks and
ten research routes are a field map, not a promise that every learner follows
one linear sequence. Computing-education research is explicitly deferred until
the global catalog contains an appropriate learning-science capability.

## Reproducibility result

The independent biology run was semantically consistent but not structurally
reproducible. It covered nearly the same field and reached the same broad
foundation-to-research architecture, yet produced 41 rather than 34 decks and
shared only seven exact deck ids with the first run. It split the cold-start
layer into six decks and used more external capabilities.

This variability is not evidence that the prompt failed. Several different
course decompositions can faithfully cover biology. It does mean that a fresh
agent output must remain a proposal: stable ids should be approved once, then
future work should use extension and audit operations rather than repeatedly
regenerating an accepted subject from scratch.

## Failures exposed by the benchmark

The deterministic validator rejected three transitively redundant edges in the
first computer-science draft and five in the biology reproduction. The agents
repaired them before handoff.

The biology reproduction also emitted malformed `ROADMAP.md` rows that omitted
the estimated-chapter cell even though `subject.toml` was valid. This would
have left two conflicting curriculum representations. The CLI now:

- validates the established external graph before launching a subject agent,
  while excluding the target so an invalid target can still be repaired;
- requires exactly nine cells in each numeric `ROADMAP.md` deck row;
- compares roadmap order, id, level, tier, required and recommended edges,
  chapter estimate, and status with `subject.toml`;
- rejects an isolated workspace before applying it when the table has drifted;
- runs the same synchronization check through `flashcards subject validate`.

## Verdict

The architecture is good enough to freeze for normal use. The second domain
trial confirms the central design: reusable capabilities belong to one subject,
qualified edges connect subjects, and deterministic whole-graph validation
catches structural mistakes that fluent prose hides.

Further prompt iteration is unlikely to make independent subject creation
produce identical deck names or counts, nor should that be the target. The
appropriate workflow is:

1. create a subject with a fresh isolated agent;
2. validate the manifest, roadmap projection, and global graph;
3. inspect and approve the semantic decomposition;
4. preserve approved identities through later extension and audit operations.

The next useful benchmark is therefore not another unconstrained regeneration.
It is an extension test against an approved subject, measuring whether the CLI
preserves identities while adding one deliberately missing branch.

## Reproduction

```sh
flashcards subject validate \
  /Users/thomasribeiro/notes/subject-benchmarks/2026-07-19-global-curriculum/biology

flashcards subject validate \
  /Users/thomasribeiro/notes/subject-benchmarks/2026-07-19-global-curriculum/computer-science

flashcards curriculum validate \
  /Users/thomasribeiro/notes/subject-benchmarks/2026-07-19-global-curriculum

flashcards curriculum validate \
  /Users/thomasribeiro/notes/subject-benchmarks/2026-07-19-global-curriculum-reproduction
```

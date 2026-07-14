# Evidence-informed flashcard authoring playbook

This is the maintained design guide for creating, expanding, and auditing
durable spaced-repetition decks. It complements the strict acceptance rubric in
`CARD_STANDARD.md`; it does not duplicate parser rules or subject expertise.

## What SRS should and should not do

Spaced retrieval is effective for durable access to learned knowledge, and
feedback improves retrieval practice. It is not a substitute for explanation,
extended problem solving, projects, laboratories, writing, conversation, or
real performance in the domain.

Design cards to maintain useful mental components and decisions. Then connect
those components through authentic practice outside SRS. Avoid neuroscience
folklore, universal learning-style claims, and precise effect-size slogans that
are not supported in the stated context.

## Define the learning contract

Before choosing chapters, record:

- the intended learner and actual prerequisite mastery;
- the target horizon and depth: literacy, course readiness, professional use,
  or advanced study;
- what the learner should be able to explain, predict, interpret, model,
  discriminate, and do;
- deliberate exclusions and the boundary with adjacent decks;
- authentic representations and non-SRS practice the field requires;
- notation, language, jurisdiction, organism/system, or other conventions that
  affect correctness.

If these decisions are unknown, research and propose them before producing a
large card set. Start with one foundational deck or chapter and revise it from
actual use before scaling the entire curriculum.

## Design the curriculum as a prerequisite graph

Organize decks around coherent capabilities, not arbitrary textbook length.
For each chapter, write outcomes and inbound prerequisite edges. Introduce
recurring concepts early and revisit them only when the later context demands a
new retrieval target.

A useful chapter arc, when the domain supports it, is:

1. motivating phenomenon and prerequisite bridge;
2. operational definitions, conventions, and boundary conditions;
3. causal mechanism, governing structure, or central argument;
4. translation among authentic representations;
5. qualitative prediction before calculation;
6. misconception, contrast, or error diagnosis;
7. analyzed or worked example;
8. faded then independent application;
9. mixed discrimination against neighboring ideas.

This is a design heuristic, not a mandatory card quota or parser order.

## Separate initial learning from later retrieval

Do not assume that seeing an answer after failure is always adequate teaching.
Before an application card, ensure the learner has encountered an explanation,
example, or prerequisite bridge that makes successful retrieval possible.

For a genuinely new concept:

1. orient: why the concept exists and what problem it solves;
2. explain: give the minimal model, definition, or worked example;
3. retrieve: ask for one core relationship with corrective feedback;
4. vary: change context or representation;
5. discriminate: contrast the nearest tempting alternative;
6. apply: fade support and require method selection.

The first cards should be learnable, not trick questions. Desirable difficulty
means effortful successful retrieval, not ambiguity or omitted instruction.

## Choose retrieval targets, not facts to transcribe

Inventory candidate targets across these modes:

- operational definitions and boundary conditions;
- causal mechanisms and “why” explanations;
- qualitative predictions;
- translation among words, symbols, diagrams, graphs, tables, code, maps, or
  other authentic representations;
- comparisons and discriminations between confusable concepts;
- misconception and error diagnosis;
- method selection, procedure steps, and checks;
- applications that reuse established prerequisites;
- source evaluation, uncertainty, and limits where epistemic judgment matters.

Create only independently useful targets. Source headings, glossaries, and
problem sets are candidate inventories—not obligations. More cards increase
future review cost; every card should justify that cost.

## Formulate cards for reliable grading

Write the cue before the answer. Ask what evidence would let the learner know
they succeeded. If different reasonable answers would receive different grades,
narrow the prompt or state the expected precision.

Prefer one cue for one grading decision. Use redundancy only when two cards
practice meaningfully different access paths or transfer contexts. Avoid reverse
cards that are trivial, many-to-one, or unnatural.

Put the direct answer first, then the smallest explanation needed to correct a
likely error. Do not turn answers into miniature textbook pages.

## Use examples and problems deliberately

Worked examples reduce unnecessary search for novices, but fully scaffolded
solutions can become passive once the method is familiar. Use a progression:

1. analyzed example: explain why each method choice is made;
2. completion problem: omit one meaningful step;
3. faded problem: remove planning support;
4. independent problem: require problem classification and execution;
5. mixed problem: discriminate among plausible methods.

Do not automatically convert every textbook example or end-of-chapter exercise.
Select or author examples that expose a transferable choice, misconception, or
check. Preserve extended, multi-step practice outside SRS when fragmenting it
would destroy the skill.

## Combat interference

Build an interference map for terms, formulas, structures, cases, or procedures
that share cues. Teach each item clearly, then add contrast cards asking for the
decisive distinction in context. Interleave neighboring problem types after
each has been introduced; early blocked practice may still be useful while a
novice learns the basic procedure.

Never “solve” interference by adding irrelevant wording to a cue. Context should
identify the real decision the learner must make in the world.

## Use figures only for visual retrieval

A figure is valuable when the visual relationship is itself learned. Good tasks
include predicting a graph, tracing a process, labeling from structure,
comparing configurations, reading scale, or translating between a diagram and a
formal model.

Prefer original SVGs for technical material. Put setup-only visuals on the
front; reserve answer-revealing labels, paths, and constructions for the back.
Use high contrast, redundant non-color cues, meaningful alt text, and responsive
geometry. Inspect every changed figure at phone width.

Do not add decorative imagery for a generic “dual coding” quota. If removing the
figure leaves retrieval unchanged, remove it.

## Research and source policy

Use a source hierarchy appropriate to the domain:

1. current consensus or professional frameworks;
2. primary literature and authoritative public agencies;
3. openly licensed university materials;
4. openly licensed textbooks compatible with the intended AI-assisted use and
   redistribution.

Curriculum frameworks choose capabilities; they do not automatically verify
individual claims. Verify consequential or unstable claims separately. Record
URLs, source role, license/terms, and access date in the deck README. Free access
is not permission to ingest, reproduce, modify, or redistribute a source.

Prefer original prose and figures derived from verified relationships. For an
external asset, record creator, source, license, attribution, and modification
notice next to the asset or in the source register.

## Audit from evidence, not model confidence

For an existing deck, inventory before rewriting. Check correctness,
prerequisites, cue quality, atomicity, representations, interference, figures,
identity, and source provenance chapter by chapter.

When study telemetry is available, prioritize cards with repeated failures,
slow responses, leech behavior, ambiguity reports, or suspiciously easy cues.
These signals locate likely problems but do not identify their cause: inspect
the card, prerequisite chain, and learner contract before editing.

Use the smallest correction that fixes the finding. Preserve a stable ID for
the same target and create a new ID for new knowledge. Record unresolved
uncertainty, intentional omissions, and the audit baseline so future models can
evaluate what actually changed.

## Document ownership

Keep each fact in one durable home:

| File | Owns | Must not duplicate |
|---|---|---|
| `CARD_STANDARD.md` | normative acceptance rules and parser/identity constraints | workflow essays or subject curricula |
| `AUTHORING_PLAYBOOK.md` | universal learning, curriculum, research, figure, and audit decisions | parser minutiae or domain encyclopedias |
| `templates/guides/<subject>.md` | reusable domain-specific epistemic and representation guidance | one learner's roadmap |
| subject `AGENTS.md` | short routing instructions | authoring content |
| subject `ROADMAP.md` | learner-specific deck sequence and prerequisite graph | universal card rules |
| subject `SUBJECT_BRIEF.md` | learner, depth, conventions, constraints, and evidence authorities | chapter map or universal rules |
| deck `README.md` | scope, chapter map, source register, and use | generic SRS advice |
| deck `CARD_README.md` | deck-specific retrieval design and justified deviations | copied research literature |
| deck `deck.toml` | machine-readable identity and standards paths | prose guidance |

`AGENTS.md` files should route an agent to the canonical documents and state
write/validation boundaries. They should remain short.

## Evidence base

These sources support the broad design principles; they do not imply that one
card template is optimal for every subject:

- Cepeda et al. (2006), distributed practice meta-analysis:
  https://doi.org/10.1037/0033-2909.132.3.354
- Roediger and Butler (2011), retrieval practice and feedback review:
  https://doi.org/10.1016/j.tics.2010.09.003
- Dunlosky et al. (2013), review of effective learning techniques:
  https://doi.org/10.1177/1529100612453266
- Weinstein, Madan, and Sumeracki (2018), synthesis of spacing, retrieval,
  interleaving, elaboration, examples, and dual coding:
  https://doi.org/10.1186/s41235-017-0087-y
- SuperMemo, *Twenty rules of formulating knowledge*:
  https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge

Treat evidence claims conservatively and update this section when a later audit
finds a stronger synthesis or a material boundary condition.

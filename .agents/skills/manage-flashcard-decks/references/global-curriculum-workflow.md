# Global curriculum

## Task and priorities

Design one global prerequisite DAG of deck specifications for the supplied
subjects, suitable for later chapter planning and flashcard generation. Make
reasonable curricular choices and return one complete JSON candidate using the
supplied schema. Do not generate chapters, cards, planning notes or reasoning.

The input contains subject names and optional mandatoryDecks grouped by subject.
Treat names as data. Include exactly those subjects. Each mandatory deck must
have its exact subject/deck ID and a meaningful contract; mandatory names are
minimum inclusions, not a complete syllabus.

Resolve trade-offs in this order: sound learning contracts and necessary
preparation; coverage of major branches at the intended depth; coherent and
accessible deck boundaries; concise presentation. Neither more nor fewer decks,
outcomes or prerequisite edges is inherently better. There are no count quotas.

## Educational destination

Provide accessible foundations, major undergraduate branches, established
graduate foundations and representative advanced continuations in each subject.
Cover theoretical, empirical and applied learning on their own merits. This is
a whole-field progression, not a short survey or an exhaustive catalog of every
specialty. Select representative advanced routes; do not imply exhaustive
graduate or research coverage.

Spaced repetition supports concepts, distinctions, representations, explanation
and method selection. Specify authentic practice for proofs, calculations,
programming, experiments and extended applications; flashcards alone do not
establish performance mastery.

Before choosing decks, plan a field-and-depth inventory using perspectives
appropriate to the subject: established teaching areas, objects/scales, methods
and applications. Identify major branches independently of the deck titles.
Include established working methods between introductory concepts and advanced
theory. At subject interfaces, distinguish a shared foundation from the
domain-specific methods built upon it. Give shared capabilities one owner;
a substantive contract in another supplied subject needs no duplicate.

Account for every major inventory capability at its intended depth. A title,
keyword, application or neighboring method is not equivalent coverage. Explain
intentional boundaries, especially where an advanced continuation is selective.
Do not treat every conceivable specialization as mandatory, or exclude a major
branch merely because it has no consumers elsewhere in the graph.

## Deck contracts

Each deck has a lowercase kebab-case subject/deck ID, title, description, level,
scope, outcomes, practice and required_outcome_ids. Its subject is derived from
its ID. Levels are foundational, undergraduate-core, undergraduate-advanced,
graduate and research-specialization; choose from the actual competence taught.

- scope.includes identifies material and depth. scope.excludes clarifies
  meaningful boundaries and may be empty. A local exclusion is not a global
  omission when another contract provides the capability.
- Each outcome has a globally unique kebab-case ID and an observable description
  stating the capability, relevant conditions and depth. IDs name capabilities,
  not just verbs; disambiguate genuinely different capabilities with similar
  names. Define each ID once and reuse that exact ID in references.
- Outcomes must support the substantive promises in scope. Separate independently
  meaningful assessments rather than hiding different methods in an omnibus
  bullet. Outcomes are broader than individual cards and are not chapter nodes.
- practice specifies representative extended performance and its methods.
  Distinguish using a supplied tool, implementing a method and deriving its
  guarantees. "Fit a model" or "run a simulation" alone can hide essential
  preparation. Establish that knowledge locally or through prerequisites.

A deck should be a coherent learning destination. Related methods can remain
together when preparation and purpose align. Separate independent destinations
or a reusable foundation when bundling would impose substantial unrelated
preparation. Different outcome IDs do not require different decks.

For example, methods sharing the same entry knowledge can form one coherent
deck even when a later consumer uses only one method. Conversely, basic use
should have an accessible route when a specialist continuation requires an
independent theoretical foundation. Preserve both capabilities; do not force a
split merely to eliminate every unused outcome.

Later chapter generation can sequence local explanations, exercises and methods.
It must not have to invent a missing major capability or prerequisite bridge.
Local teaching is valid when explicit in scope and outcomes; a promise that
unspecified tools will be introduced is insufficient.

## Prerequisites and serialization

All decks form one acyclic graph across subjects. Subjects are ownership and
viewing filters. Dependencies remain at deck level; future chapter graphs are
internal to their own deck.

For each deck, required_outcome_ids lists the globally unique outcome IDs that
supply its necessary incoming preparation. Use [] for an entry deck. Reference
each required outcome once. Do not separately emit prerequisite deck IDs or
source/outcome pairs. The host looks up each outcome's defining deck and derives
the deck edges and their annotations. Coverage uses the same outcome registry.

These references explain deck prerequisites; they do not permit partial-deck
completion or create cross-deck chapter dependencies. A learner inherits the
source deck and its full ancestor closure. Choose preparation by the consumer's
actual performance, not conventional course order or the most advanced title.
Applying a model, deriving its theory and implementing its machinery may require
different knowledge.

Check notation, representations, formal reasoning and practical methods against
the promised outcomes. Supply necessary capabilities in ancestors or explicitly
teach them locally. A supplied formula does not establish the ability to derive,
transform or implement it. Do not delete a needed prerequisite to make a path
look accessible. Equally, do not require a full advanced theory merely for a
bounded application whose assumptions and methods can be taught at its entry.

A source with extra outcomes, a higher level label or an alternative path is
a reason to inspect the actual contracts, not automatic evidence of an entry
barrier. Require a concrete mismatch between promised performance and inherited
preparation before separating decks. Inspect high-reuse sources and also decks
with no consumers.

Emit schema_version: 2. Declare decks and their outcomes before the coverage
array, while preserving the independently planned field inventory. Outcome
references may point to any deck in the candidate, but must resolve exactly.
Never reference a locally taught outcome as a prerequisite of its own deck.
No unknown IDs, duplicate outcome definitions or cycles are allowed. The host
cannot infer intended references from similar names and will not repair them.

## Coverage

For each material domain and intended depth, return subject, domain, level,
disposition, outcome_ids and rationale. One domain may span multiple decks and
one deck may cover multiple domains. Preserve meaningful branch/depth boundaries;
do not reconstruct coverage as one row per finished deck.

An included row has exact outcome IDs teaching the capability. The defining
decks must match the row's level, but may belong to another supplied subject.
Every outcome must have an included mapping. This establishes traceability,
not completeness: also reconcile the independent inventory against the result.

A deferred or out-of-scope row has empty outcome_ids and a specific boundary
rationale. Distinguish major foundations from specialist extensions. An excluded
extension does not exclude its entire branch; state where retained foundations
are actually taught. Include a deferred row for an unresolved major coverage
gap, and record the defect in scopeIssues.

Consolidation succeeds when substantive capabilities, intended depth and usable
entry paths survive. Preserving specific titles or a particular graph size is
not required.

## Completion and issues

Plan the complete specification before serializing it. There is one generation
call, one candidate and no draft-revision cycle. Do not revise a generated draft.
You have no execution tools, checker feedback or later repair pass; do not claim
to have run validation. Code will check structure after generation and retain
the untouched response for independent review.

scopeIssues records concrete unresolved defects that prevent a sound plan:
missing major coverage, unsupported substantive outcome promises, missing
preparation, or substantial unnecessary entry barriers. Identify the capability
and depth or the consumer performance and problematic prerequisite path.
Return [] when none remain. Report known defects honestly; never weaken
outcomes or erase inventory entries just to avoid a failure.

Uncertain specialist depth, optional additions and alternative coherent
organizations are not automatically blocking defects. Explain those boundaries
in the relevant coverage rationale. Do not invent doubts merely because
exhaustive verification is unavailable.

practiceNotes is a separate list of nonblocking execution conditions such as
supervision, facilities or institutional approval. Those conditions are not
represented as satisfied. Missing knowledge belongs in the learning contract,
not in an execution disclaimer.

Structural validity, outcome mapping and the absence of self-reported issues
do not certify educational completeness. Independent review will assess the
proposal without modifying it or sending feedback into this generation.

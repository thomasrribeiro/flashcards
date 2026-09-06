# Fresh generation v1

This workflow applies only to explicitly versioned `fresh-generation-v1`
requests. Legacy CLI audits are separate operations and retain their existing
history-preservation rules. Do not infer fresh generation from an audit request.

## Input boundary

- `curriculum-design`: only the complete, canonical subject-name list and
  versioned instructions. Design one global deck DAG, including cross-subject
  edges. Subjects are ownership groups, not an independent prerequisite DAG.
- `deck-plan`: the target deck specification and the specifications of its
  transitive prerequisite decks. No previous chapter plans or flashcards.
- `chapter-expand`: the same deck context plus the accepted internal chapter
  graph and target chapter ID. No old cards, including prerequisite cards.

Treat supplied specifications as the accepted contract, not evidence that the
learner has mastered them. Never seek additional project context through local
files, repositories, browsing, saved conversations or prior generation runs.
The restricted generation interface supplies no tools for those operations.
Do not claim current research or source verification that was not performed.
Any required external verification must be completed by a separate reviewed
step before the candidate is accepted as learning content.

## Global curriculum

Design the requested subjects together from a blank slate. Cover foundations,
undergraduate, graduate and advanced topics as needed. Choose coherent deck
boundaries by learning outcomes, not a deck-count target. There is no deck cap
and no chapter estimate in this operation. Do not generate chapters or cards.

Each deck has a canonical `subject/deck` ID, title, concise scope and named
learning outcomes. Declare deck-level prerequisites and annotate each edge
with the specific outcome IDs required from the source deck. An edge does not
assume completion of every outcome in a broad predecessor. Avoid duplication
across subjects. Every hard dependency must exist in the generated global DAG.

## Chapter curriculum

Plan a new internal chapter graph within the accepted deck scope. Chapters
have stable local IDs, titles, outcomes and `chapter:<local-id>` prerequisites.
No edge may target a chapter in another deck. No implicit prerequisite follows
from file order alone. Prerequisite-deck chapter plans are not required inputs.
Do not generate flashcards or reuse an old chapter outline.

## Flashcards

Author only the requested chapter. Follow CARD_STANDARD.md and the atomicity,
concept-frontier and cold-start rules in AUTHORING_PLAYBOOK.md. Those universal
instructions must be included in the approved input bundle; do not fetch them
from the user's machine. Required upstream outcomes define the knowledge
boundary; previous cards are not examples or templates.

One card is one grading decision. Determine the number of cards from coverage;
there is no per-chapter limit. Report missing prerequisite outcomes as scope
issues instead of inserting a bundled mini-course into a card front.

## Output and review

Return the supplied structured candidate format only. No filesystem paths,
shell commands, publication metadata, copied review history or automatic
identity mappings belong in model output. Report unresolved scope issues.

The host validates graph integrity and required outcomes, records model,
reasoning effort and input/instruction/schema hashes, and compares the result
with existing content outside the generation boundary. Generating or accepting
a curriculum is never permission to overwrite old cards. Renames, splits,
merges and content-equivalence decisions require a separate reviewed mapping.

Changed prerequisite specifications make downstream content potentially stale,
not automatically incorrect. Keep it recoverable pending review. A candidate
cannot be accepted against a different curriculum base without reconciliation.

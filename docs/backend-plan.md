# Backend restart: design proposal

This is a proposal for the next phase, not an implemented backend or a committed API contract.

## Product decisions first

Decide what the learner supplies (subject, goals, prior knowledge, time horizon), how much curriculum they approve before generation, and whether existing decks remain Git repositories or become exports. Set a cost ceiling and an acceptable wait time. Decide whether this remains a personal tool or serves multiple accounts. These decisions shape the system more than the model choice.

## Separate the learning model from the generation process

Use stable identities for subjects, concepts, chapters and cards. Represent prerequisite edges explicitly, distinguishing hard requirements from useful background. Give curricula immutable revisions. A published card's identity survives wording changes; a materially different retrieval target gets a new identity. Keep learner review history separate from generated content and curriculum revisions.

A concept graph, chapter sequence and card collection are distinct artifacts. A graph is not a chapter table of contents, and a chapter title is not an assessable learning objective. Each chapter should map to objectives, each objective to concepts, and each card to its retrieval target. Preserve these links so coverage can be inspected without re-running a model.

## A small, explicit generation pipeline

1. **Brief:** turn the learner's request into an editable goal and scope.
2. **Concept graph:** propose concepts and prerequisite edges, with reasons. Validate references and reject cycles in required dependencies. Let the learner review the scope and graph.
3. **Chapter plan:** group concepts into a teachable sequence. Record outcomes, prerequisite knowledge and coverage. Validate that prerequisites precede use.
4. **Cards:** generate one bounded chapter at a time from its accepted revision. Assign stable IDs, attach objective references and keep source/evidence metadata where needed.
5. **Review and publication:** run deterministic validation, then a separate pedagogical review. Present revisions for acceptance. Publish a validated snapshot atomically; never expose half-built content as the current curriculum.

Keep model requests and responses as versioned artifacts. Record input revision, prompt version, provider/model, usage and validation results. Model output is an untrusted candidate, not a database migration or an instruction to publish.

## Implementation boundaries

Start with one application service and one background worker, sharing deterministic domain code. Separate services are unnecessary until measured load or isolation needs justify them.

- **Frontend:** renders domain read models, edits drafts, starts jobs and shows status. No prompts, provider credentials, subprocess orchestration or GitHub publishing.
- **Application service:** authentication, ownership, accepted revisions, idempotent commands and job status.
- **Worker:** stage execution, provider calls, bounded retries and cancellation. A retry operates on the same input revision and idempotency key.
- **Domain code:** identity, schema validation, graph invariants, coverage checks and publication rules. No provider SDK imports.
- **Persistence:** transactional metadata and revision pointers; artifact storage for larger inputs, outputs and media. Credentials remain server-side.

Use an explicit job state machine: queued → running → awaiting review → completed, with failed/cancelled terminal states. Persist stage checkpoints. Cancellation stops subsequent work and prevents publication, even if an in-flight provider request cannot be interrupted. Enforce per-job token/cost limits and a maximum repair count; avoid indefinite self-repair loops.

Do not select providers, database products or hosting until the product and operational constraints are agreed. Keep the first provider adapter small rather than inventing a universal agent framework.

## Prove quality before scaling

Build a small, fixed evaluation set covering conceptual, procedural and mathematical topics. Include novice and advanced starting points. Evaluate dependency correctness, outcome coverage, card atomicity, answerability, factual accuracy, duplication and learner workload. Use expert judgment alongside deterministic checks; schema validity does not imply a useful course.

Track stage failure rate, cost, latency and acceptance rate. Keep held-out topics. Compare a simple staged baseline against added review/repair complexity; retain complexity only when it improves measured outcomes.

## Suggested delivery order

1. Agree on the domain model and acceptance criteria using a hand-authored curriculum.
2. Add authenticated content reads and review-history persistence; exercise the existing frontend through a narrow data boundary.
3. Implement one bounded chapter-generation job end to end, including review, cancellation and publication.
4. Add concept-graph and chapter-planning stages once the content lifecycle works.
5. Add version migration, exports and provider alternatives only when needed.

Before reconnecting existing accounts, design and test a migration preserving stable card IDs, aliases, review schedules and ownership. The isolated local preview is not a replacement for production review history.

# Whole-deck audit workflow

## Contents

1. Audit contract
2. Inventory
3. Chapter review
4. Identity decisions
5. Audit record
6. Exit gate

## Audit contract

Determine whether the request is report-only or editing. For editing, require a
machine-readable preflight report and a stable ID on every existing card block
before changing card content. Do not rewrite a whole deck in one mechanical
pass. Maintain the deck's declared learner, depth, exclusions, and prerequisite
boundaries unless evidence shows that the contract itself is defective.

## Inventory

Build a chapter-level inventory of:

- learning objectives and prerequisite edges;
- card count and types;
- concepts assumed before being established;
- definitions, mechanisms, predictions, representations, misconceptions,
  applications, and discrimination prompts;
- figures and the retrieval role of each;
- source coverage and claims requiring current verification;
- validator, parser, math, asset, cloze, metadata, and identity findings.

Rank findings as critical, major, or minor using `CARD_STANDARD.md`. Provide a
specific reason or counterexample for every factual-correctness finding.

## Chapter review

For each chapter:

1. Verify its objectives and inbound prerequisites.
2. Verify technical claims against authoritative sources.
3. Locate ambiguous, overbroad, cue-leaking, non-atomic, or passive cards.
4. Locate missing prerequisite bridges and high-value retrieval gaps.
5. Check whether applications test reasoning rather than omitted knowledge.
6. Inspect every figure for correctness, accessibility, scale, and answer leak.
7. Make the smallest changes that resolve the prioritized findings.
8. Validate before proceeding to the next chapter.

Do not preserve a bad card merely to preserve its history. Correct it while
making an explicit identity decision.

## Identity decisions

Classify every edited card as one of:

- **same target**: preserve `card-id`; use for corrections, clearer cues,
  improved explanation, formatting, accessibility, or a non-revealing figure;
- **new target**: assign a new `card-id`; use when the required retrieval or
  grading decision materially changes;
- **split**: preserve the original ID on the closest surviving target and give
  each additional independently scheduled target a new ID;
- **retire**: remove a redundant or harmful card and record the reason in the
  audit summary. Never reuse its ID.

Preserve all aliases. Never bulk-regenerate IDs.

## Audit record

For an editing audit, write
`.flashcards/audits/<ISO-date>-<scope>.md` containing:

- requested scope and learner contract;
- model identifier when available;
- commit or working-tree baseline;
- standards and subject-guide versions or paths;
- authoritative sources added or rechecked;
- findings by severity and chapter;
- identity decisions for splits, replacements, and retirements;
- card/figure counts before and after;
- validation commands and results;
- unresolved uncertainty and intentional omissions.

Do not claim that a model is state of the art. Record the actual model and date
so a future agent can decide whether another audit is worthwhile.

## Exit gate

An editing audit is complete only when:

- the parser drops no cards;
- required frontmatter and stable IDs are present;
- KaTeX and image paths are valid;
- new cloze violations are absent and existing ones are resolved or recorded;
- changed figures were inspected;
- the complete diff was reviewed;
- the audit record distinguishes corrected defects from expanded scope.

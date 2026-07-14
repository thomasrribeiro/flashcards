# {{DECK_TITLE}} card blueprint

This file records retrieval decisions specific to this deck. Do not copy the
universal standard, playbook, subject brief, roadmap, or research literature
here; link to a justified exception when one is necessary.

## Learner model

- Level: {{LEVEL}}
- Assumed prerequisites: TODO
- Capabilities this deck should produce: TODO
- Important exclusions: TODO

## Curriculum and prerequisite graph

Define the ordered chapter map and the prerequisite edges between chapters.
Establish terms and representations before asking the learner to apply them.

## Retrieval portfolio

For each chapter, decide which definitions, mechanisms, causal explanations,
predictions, representation translations, comparisons, misconceptions,
procedures, and applications genuinely deserve separate scheduling decisions.

Record likely interference pairs and the contrasts that distinguish them.

## Initial-learning path

Describe how a learner encounters explanations and prerequisite bridges before
applications test them. A failed card should reveal a retrieval or reasoning
gap, not missing instruction.

## Figure policy

Add a figure only when inspecting, predicting, labeling, comparing, tracing, or
translating it is part of learning. Prefer original responsive SVGs. Put setup
figures on the front and answer-revealing annotations on the back.

## Sources and accuracy

Record authoritative sources, licenses, access dates, contested points,
simplifications, and boundary conditions in `README.md`.

## Validation gate

Before handoff:

1. Run `flashcards deck stabilize . --check`.
2. Run `flashcards deck validate .`.
3. Inspect every changed figure at phone width.
4. Run `git diff --check` and review the complete diff.
5. Summarize additions, changes, omissions, and any unresolved uncertainty.

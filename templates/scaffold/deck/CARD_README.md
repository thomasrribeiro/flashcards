# {{DECK_TITLE}} card blueprint

This file records retrieval decisions specific to this deck. Do not copy the
universal standard, playbook, subject brief, roadmap, or research literature
here; link to a justified exception when one is necessary.

## Learner model

- Level: {{LEVEL}}
- Confirmed mathematical/tool prerequisites: TODO
- Confirmed subject prerequisites: none unless explicitly listed
- Capabilities this deck should produce: TODO
- Important exclusions: TODO

Unconfirmed subject knowledge is not mastered. A target level describes the
destination, not permission to assume its vocabulary.

## Curriculum and prerequisite graph

Define the ordered chapter map and the prerequisite edges between chapters.
Establish terms and representations before asking the learner to apply them.

## Concept-dependency ledger

Complete the pilot chapter before authoring later chapters. Add one row for
every technical term, symbol, convention, figure grammar, or procedure required
to understand a card front.

| Concept or representation | Front(s) requiring it | Confirmed inbound source or first explanation | First supported retrieval | Later application | Status |
|---|---|---|---|---|---|
| TODO | TODO | TODO | TODO | TODO | planned |

Record rejected examples that depended on future chapters. The answer revealed
after an uninformed failure is not a first explanation.

## Retrieval portfolio

For each chapter, decide which definitions, mechanisms, causal explanations,
predictions, representation translations, comparisons, misconceptions,
procedures, and applications genuinely deserve separate scheduling decisions.

Record likely interference pairs and the contrasts that distinguish them.

## Chapter design ledger

Complete this before large-scale authoring and reconcile it at handoff. Add rows
or split columns when a chapter has several distinct figures or problems.

| Chapter | Retrieval targets | Basic-card roles | Cloze candidates | Problem progression | Representations and figure opportunities |
|---|---|---|---|---|---|
| TODO | TODO | TODO | TODO or none with reason | TODO or none with reason | TODO; mark each candidate include/omit with reason |

Card-form diversity is not a goal by itself. Zero clozes can be correct. A
visually rich chapter may require several figures because diagrams, graphs,
before/after states, and spatial constructions serve different retrieval roles.

## Initial-learning path

Describe how a learner encounters explanations and prerequisite bridges before
applications test them. A failed card should reveal a retrieval or reasoning
gap, not missing instruction.

Before full-deck authoring, complete a front-by-front cold-start simulation for
the pilot and save it as `.flashcards/audits/pilot-cold-start.md`.

## Figure policy

Add a figure only when inspecting, predicting, labeling, comparing, tracing, or
translating it is part of learning. Author new technical figures in TikZ by
default, compile them to responsive SVG before handoff, and commit source and
output together under repository-root `figures/NN_chapter/`; keep the shared
style at `figures/tikz-style.tex` and never create `flashcards/figures/`. Since
rendering runs from the repository root, load it with
`\\input{figures/tikz-style.tex}` rather than a source-relative path. Put
setup figures on the front and answer-revealing
annotations on the back. Record why an authentic target requires another medium.

Do not treat one figure per chapter as a target or cap. Inventory every
plausible spatial, temporal, structural, graphical, relational, experimental,
and before/after representation, then include or explicitly omit it according
to its retrieval value.

## Sources and accuracy

Record authoritative sources, licenses, access dates, contested points,
simplifications, and boundary conditions in `README.md`.

## Validation gate

Before handoff:

1. Run `flashcards deck stabilize . --check`.
2. Run `flashcards deck validate .`.
3. Inspect every changed figure at phone width.
4. Reconcile planned versus actual card types, problems, and figures by chapter.
5. Run `git diff --check` and review the complete diff.
6. Summarize additions, changes, omissions, and any unresolved uncertainty.

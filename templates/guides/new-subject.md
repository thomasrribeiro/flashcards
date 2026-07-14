# New subject and deck workflow

Use this workflow whenever a new subject is added to the flashcard collection.
It is an execution guide for Codex agents, not a card-writing substitute for
the universal and subject-specific guides.

## 1. Define the curriculum before writing cards

Create a subject roadmap that answers:

- What should the learner be able to explain, predict, model, interpret, and do?
- Which ideas are true prerequisites for later decks?
- Which concepts recur across the subject and should be introduced early, then
  revisited with increasing depth?
- What authentic representations does the field use: diagrams, maps, source
  excerpts, proofs, graphs, code, tables, specimens, or data?
- Which skills require practice outside SRS?

Organize repositories by coherent problem domain, not by arbitrary textbook
chapter count. Start with one foundational deck and validate it in use before
creating the entire roadmap.

## 2. Research and source policy

Use a source hierarchy:

1. current consensus frameworks from scientific or professional bodies;
2. primary literature and authoritative public agencies;
3. openly licensed university course materials;
4. openly licensed textbooks whose current terms explicitly permit the planned
   AI-assisted use and redistribution.

Use curricular frameworks to choose coverage, not as prose to memorize. Verify
technical claims against primary or authoritative sources. Record URLs,
licenses, and access dates in the deck README. Never feed a source into an AI
workflow merely because it can be viewed for free; free access is not the same
as permission for AI ingestion or redistribution.

For figures, prefer original SVGs derived from facts and relationships rather
than copied layouts. When an external photograph or irreplaceable historical
figure is necessary, store attribution, creator, source URL, license, and any
required modification notice adjacent to the asset.

## 3. Repository scaffold

Each deck should contain:

```text
deck-name/
├── AGENTS.md
├── CARD_README.md
├── README.md
├── figures/
│   └── NN_chapter_name/
└── flashcards/
    └── NN_chapter_name.md
```

Repository, subject, and GitHub topic names use lowercase kebab-case. Chapter
filenames use zero-padded numeric prefixes and snake_case. Frontmatter uses the
canonical lowercase subject and kebab-case tags.

Before the app can display a new subject, verify that the flashcards frontend's
lightweight repository metadata recognizes the subject's GitHub topic. Do not
make home rendering depend on downloading card bodies.

## 4. Card architecture

Build a chapter in this order where applicable:

1. prerequisite bridge and motivating phenomenon;
2. operational definitions and boundary conditions;
3. causal mechanism or governing structure;
4. translation among the field's representations;
5. qualitative prediction;
6. misconception or error diagnosis;
7. worked example or analyzed case;
8. faded and independent application;
9. mixed discrimination with neighboring concepts.

One card should produce one scheduling decision. Create new cards for new
retrieval targets. Preserve stable IDs for corrections and presentation changes
that do not change the target.

## 5. Visual standard

A figure earns its place only if the learner must inspect, predict, label,
compare, trace, or translate it. Put setup-only visuals on the front and
completed explanatory visuals on the back. Technical figures should normally
be original SVGs with:

- a `viewBox` and responsive geometry;
- high contrast and a redundant cue beyond color;
- a short internal `<title>` and useful `<desc>`;
- meaningful Markdown alt text that supports accessibility without needlessly
  leaking the answer;
- a stable descriptive filename;
- no unexplained abbreviations, impossible geometry, or decorative detail.

Use generated raster illustrations only for non-quantitative scenes where exact
anatomy, geometry, labels, direction, and scale are not learning-critical.

## 6. Validation gate

Before handoff:

- parse every changed chapter and confirm the expected card count/type;
- ensure every card ID is unique across the deck;
- confirm every image path exists and inspect every new figure visually;
- check KaTeX and cloze parsing;
- run the collection validator and `git diff --check`;
- summarize new, modified, and intentionally omitted material;
- distinguish local changes from committed or deployed changes.


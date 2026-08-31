# Chapter curriculum workflow

Use this workflow when the requested output is the chapter curriculum for one
deck, without card or figure authoring.

## 0. Check prerequisite planning readiness

Before planning the target deck, inspect its complete hard-prerequisite deck
closure. If any prerequisite deck lacks a chapter curriculum, ask whether to
plan the missing prerequisite decks first in transitive dependency order or to
continue with only the requested deck. Do not ask again when the invocation
records that the user already chose the target-only path. Do not silently
expand the write scope.

When prerequisite plans are chosen, plan them one at a time in transitive
order. Wait until each plan is reviewed and available in the pinned curriculum
context before planning its consumer, including the original target.

When regenerating an existing curriculum, treat every existing card block,
stable card ID, alias, and figure as immutable. The workflow may revise chapter
metadata and the deck blueprint or add empty chapter scaffolds, but it must not
modify, move, replace, or delete existing learning content. Preserve the
deck's current build and approval status.

## 1. Freeze the deck contract

Read the subject roadmap, executable subject curriculum, subject brief, deck
manifest, deck scope, and the resolved cross-deck prerequisite graph. Treat the
deck's declared scope, learner level, and prerequisite closure as constraints.
Do not silently absorb material owned by another deck.

## 2. Research the capability progression

Research current authoritative sources appropriate to the domain. Map the
capabilities the finished deck must support before deciding chapter names or
count. Record the source register and any important uncertainty in `README.md`.

## 3. Design the chapter graph

Create the complete ordered chapter scaffold using canonical
`NN_snake_case.md` files. Every chapter must have valid TOML frontmatter with:

- stable subject and deck identity;
- order matching the filename;
- sparse, explicit `prerequisites` edges;
- `provides` capabilities that later chapters can reference;
- a concise human-readable chapter title.

Prefer the smallest set of hard edges that makes the learning order executable.
An earlier order number is not itself a prerequisite. Keep the first chapter
novice-first within the declared inbound deck prerequisites, and ensure every
later chapter's required capabilities resolve to an earlier provider.

## 4. Write the deck blueprint

Synchronize `README.md` and `CARD_README.md` with the planned chapter graph.
For each chapter, record:

- purpose and learner capability;
- major retrieval targets;
- planned problem or application progression;
- authentic representations;
- likely figure opportunities;
- exclusions or handoffs to neighboring decks.

This is a plan, not generated content. Do not create card blocks, worked
solutions, lesson prose, SVGs, TikZ, or other figures. Leave each ordered
chapter body empty after its frontmatter and title.

## 5. Validate and stop

Run the deterministic deck and prerequisite validation. Confirm that the graph
is acyclic, every explicit dependency resolves, chapter IDs and orders are
unique, and every ordered chapter contains zero scheduled cards. Then stop for
human review. Content generation begins only through a separate pilot or
single-chapter job.

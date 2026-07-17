# {{DECK_TITLE}} deck instructions

Read and follow, in order:

1. `{{FLASHCARDS_ROOT}}/templates/guides/CARD_STANDARD.md`
2. `{{FLASHCARDS_ROOT}}/templates/guides/AUTHORING_PLAYBOOK.md`
3. `{{FLASHCARDS_ROOT}}/.agents/skills/manage-flashcard-decks/references/cold-start-workflow.md`
4. `../DOMAIN_GUIDE.md` when present; otherwise
   `{{FLASHCARDS_ROOT}}/templates/guides/{{SUBJECT}}.md` when it exists
5. `../SUBJECT_BRIEF.md`, `../ROADMAP.md`, and `../subject.toml`
6. This repository's `deck.toml`, `README.md`, and `CARD_README.md`

Use the flashcards application's parser, stable-ID implementation, and
validator as executable truth. Establish prerequisites before applications.
Run `flashcards deck prerequisites .` and use only its resolved transitive
closure as inbound deck/chapter knowledge. Earlier file order alone is not a
prerequisite when explicit edges are present.
Create the smallest sufficient card set; do not optimize for card count.
“Smallest sufficient” means removing redundant retrieval decisions, not
minimizing authentic representations, problem progression, or useful figures.

Preserve every existing `card-id` when correcting or improving the same
retrieval target. Assign a new ID when a card tests materially new knowledge.
Author new technical figures in TikZ and compile them to ordinary SVG before
handoff. Commit each `.tex` source beside its same-named `.svg`, reuse a shared
deck style at `figures/tikz-style.tex`, and keep chapter assets under
`figures/NN_chapter/`, never `flashcards/figures/`. Document any authentic-target
exception that needs another medium. The renderer runs from the repository
root, so chapter sources must use `\\input{figures/tikz-style.tex}` rather than
a source-relative path.
Inventory figure opportunities by retrieval role before authoring; do not use
one figure per chapter as either a target or a cap.

For a new deck, author only the first chapter until its concept-dependency
ledger and `.flashcards/audits/pilot-cold-start.md` pass review and the pilot is
explicitly approved. Never use a later chapter's vocabulary to scaffold an
earlier one.

Run `flashcards deck validate .` before handoff. Do not commit, push, create a
remote repository, or deploy unless the user asks.

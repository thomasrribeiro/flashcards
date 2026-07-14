# Card Quality Standard

The acceptance checklist for every card in the collection. Distilled from `general.md`, `mathematics.md`, `physics.md` (which remain the detailed how-to guides), SuperMemo's 20 Rules of Formulating Knowledge, and the parser semantics in `src/parser.js`. This document is the source of truth for audits and for reviewing generated decks.

Each rule has an ID used in audit findings. Severity of a violation:

- **critical** — wrong answer, parser-breaking markup, or a spurious/mis-spanned cloze. The card actively teaches something false or doesn't render as intended.
- **major** — ambiguous cue, non-atomic card, bad cloze span, broken image or LaTeX, P:/S: without method. The card renders but drills poorly.
- **minor** — style, verbosity, tag hygiene, alt text. Worth fixing opportunistically.

## Universal rules (all card types)

- **U1 — Atomic.** One retrievable fact, idea, or step per card. An answer enumerating more than ~3 items must be split into separate cards or converted to overlapping clozes. Test: could the reviewer fail *half* the card? Then it's two cards.
- **U2 — Unambiguous cue.** Given the deck's context, the question admits exactly one correct answer. Ban "What about X?", "Explain X" with no scope, and cues where the reviewer must guess *which* fact the author meant.
- **U3 — No yes/no-only questions.** Any question answerable with "yes" or "no" must be rephrased as *why/what/which/when* (e.g., "Is $x^2 = 1$ linear?" → "Why is $x^2 = 1$ not linear?").
- **U4 — Correct.** The answer is technically correct; formulas are dimensionally consistent; every variable in a formula is defined on the card. Hedges ("usually", "generally") appear only when the hedge itself is the fact. Audit note: flag `incorrect-answer` only with a stated reason — a counterexample or the correct formula. "Sounds off" is a style finding, not a correctness finding.
- **U5 — Self-contained.** No "the above", "this chapter", "as we saw". The card must survive shuffled, solo review months later. Referencing concepts established by *earlier cards in the same deck* is fine (sequential learning); referencing the source textbook's prose is not.
- **U6 — Concise answer.** Definitional answers: 1–5 words ideal. Explanatory answers: ≤3 sentences. Length beyond that is a smell of non-atomicity (see U1) — not an automatic failure for genuinely conceptual "why" cards, but justify it.
- **U7 — Parse-safe.** No content line may begin with bare `Q:`, `A:`, `C:`, `P:`, or `S:` (the parser treats these as card-state transitions). No `---` inside a card body (it is a separator). Blank line between cards. Every file ends in a completed card, and parsing produces zero warnings.
- **U8 — Valid markup.** All LaTeX renders under KaTeX (`$...$` inline, `$$...$$` display). Every image link resolves relative to the file. Images carry meaningful alt text. No decorative images (if removing the image leaves the card equally good, remove it).

## Cloze rules (C: cards)

- **C1 — Small spans, few deletions.** At most 2 deletions per block; prefer 1. Each deletion ≤ ~6 words / ~60 characters. A deletion spanning half the sentence tests recall-of-prose, not recall-of-fact.
- **C2 — Delete the informative element.** The deletion is the term, number, name, symbol, or operator being learned — never filler ("the", "is called", connective phrases).
- **C3 — Context determines the deletion.** The visible text must uniquely determine the hidden text. "The [X] is important in physics" is unanswerable.
- **C4 — No brackets inside math or code (parser-specific).** Every `[...]` in a C: block becomes a cloze deletion except inside `![alt](...)` image syntax. Square brackets inside `$...$` — interval notation `$[0, \infty)$`, matrix literals, optional-argument syntax — create spurious or mis-spanned cards. Rewrite the notation in words, restructure the sentence, or convert the card to Q:/A:. Violations are **critical**.
- **C5 — Answer not leaked.** The deleted text must not appear verbatim elsewhere in the same block's visible text.

## Problem/Solution rules (P:/S: cards)

- **P1 — IPEE does its job.** Where the full IDENTIFY / PLAN / EXECUTE / EVALUATE scaffold is used, each section is non-empty and pulls its weight: IDENTIFY names the problem type, PLAN names the method *before* executing it, EXECUTE carries the steps, EVALUATE checks the result. Faded scaffolding (dropping IDENTIFY/PLAN on later cards of an established pattern) is deliberate and allowed — see `general.md` §A2.
- **P2 — Method over answer.** The problem teaches a transferable method; prefer symbolic/variable form over arithmetic unless the card explicitly drills computation fluency.
- **P3 — Genuine EVALUATE.** The check is real: limiting cases, units/dimensions, a sanity bound, differentiating back, an undo path. "The answer is correct ✓" alone fails.
- **P4 — Self-sufficient statement.** The P: block contains every given, constraint, and definition needed to attempt the problem cold.

## File and deck rules

- **F1 — Canonical frontmatter.** Exactly these fields in TOML `+++` frontmatter: `order` (integer, matches the filename prefix), `subject` (the collection's canonical lowercase kebab-case subject, such as `mathematics`, `physics`, `computer-science`, `law`, or `biology`), `tags` (array of kebab-case strings). The app makes one home-screen folder per recognized subject topic, so the spelling must match the frontend registry and GitHub topic exactly. Keep `[generation]` provenance tables where present (the parser ignores them). The `name` field is dead (the app overrides it with the repo name) — remove it.
- **F2 — Filenames.** `NN_snake_case.md`, zero-padded to 2 digits. The app sorts files with `localeCompare`, so unpadded prefixes break ordering (`10_` sorts before `1_`).
- **F3 — Deck hygiene.** Every deck has a `README.md` (topic, source text, chapter map) and a `.gitignore` covering `.DS_Store` and, where sources exist, `references/`.

## Editing cost warning

Legacy cards without an explicit `card-id` are keyed by a BLAKE3 hash of their content, so editing them resets their review history. Before revising a studied deck, run `npm run add-card-ids -- /path/to/deck/flashcards`. Keep the generated `card-id` and `card-alias` comments when editing: presentation changes, figures, formatting, and corrective wording will then preserve the FSRS schedule. A change that tests materially different knowledge must receive a new `card-id` rather than inheriting mastery it has not earned.

# Card quality standard

This is the normative acceptance rubric for cards and decks. Use its rule IDs
in audit findings. `AUTHORING_PLAYBOOK.md` explains the design workflow; subject
guides add domain-specific judgment. The parser and validator remain executable
truth where prose and behavior disagree.

Severity:

- **critical**: teaches a false claim, loses or corrupts a card, breaks parsing,
  or assigns review history to a materially different retrieval target;
- **major**: the card renders but drills poorly because its cue, scope,
  prerequisite, representation, or grading decision is defective;
- **minor**: style, metadata, accessibility, or concision issue that does not
  substantially distort retrieval.

## Universal card rules

- **U1 — One scheduling decision.** A card tests one independently gradable
  retrieval target. If the learner could know one half and fail the other, split
  it. An answer with more than about three independently gradable items is a
  strong split signal, not an automatic numerical rule.
- **U2 — Unambiguous cue.** The prompt identifies the requested relationship,
  scope, and level of precision. Ban prompts such as “What about X?” and
  unbounded “Explain X.”
- **U3 — Productive retrieval.** Ask the learner to recall, predict, interpret,
  discriminate, diagnose, or choose a method. Replace yes/no prompts with the
  reason or distinction that makes the answer true.
- **U4 — Correct and bounded.** Claims, formulas, diagrams, units, and variable
  definitions are correct. State conditions, organism/system, jurisdiction,
  convention, uncertainty, and important exceptions when they affect grading.
- **U5 — Self-contained in review.** The card survives shuffled review months
  later. Do not use “above,” “this chapter,” or an unlabeled source excerpt.
  Established prerequisite concepts may be referenced without re-teaching them.
- **U6 — Concise repair.** Put the direct answer first. Definitional answers are
  usually a phrase; explanations are usually no more than three short sentences.
  Include only what helps grade or repair the likely error.
- **U7 — Prerequisite-ready.** Do not make failure the learner's only
  introduction to an unexplained term, representation, or procedure. Every
  domain-specific word, symbol, convention, representation, and method required
  by a front must be either (a) explicitly listed as mastered inbound knowledge
  or (b) established by an earlier explanation or worked example in the learning
  path. An answer appearing after an uninformed guess does not satisfy this
  rule. Later-chapter concepts may not be borrowed to make an earlier exercise
  look realistic. The application schedules only `Q:/A:`, `C:`, and `P:/S:`
  blocks: headings, lesson prose, tables, equations, and figures outside those
  blocks are ignored by the parser and cannot establish a prerequisite. Put a
  minimal teaching bridge on a scheduled front or establish the concept in an
  earlier scheduled card.
- **U8 — No answer leak.** The front, filename, alt text, labels, neighboring
  wording, and units do not reveal the target unless that information is a
  deliberate cue.
- **U9 — Parse-safe.** No content line begins with bare `Q:`, `A:`, `C:`, `P:`,
  or `S:` unless it starts a parser block. Do not place `---` inside a card.
  Separate blocks with blank lines and finish every started block.
- **U10 — Valid markup and assets.** KaTeX renders, image paths resolve, and
  meaningful alt text is present. Remove decorative media.

## Card-form selection rules

- **R1 — Target determines form.** Choose `Q:/A:`, `C:`, or `P:/S:` from the
  retrieval decision rather than a desired type distribution. Report the final
  type mix, but do not add a weak card merely to diversify it.
- **R2 — Basic cards for bounded reasoning.** Use `Q:/A:` for explanations,
  relationships, predictions, discriminations, diagnoses, method choices, and
  figure interpretation. It is the safe default when the answer is not one
  short insertion.
- **R3 — Clozes for exact compact recall.** Use `C:` only when established
  context uniquely determines a short term, value, symbol, or relation whose
  exact recall is useful. A deck may legitimately contain no clozes; a cloze is
  not required merely because a statement contains a formula.
- **R4 — Problems for transfer and execution.** Use `P:/S:` when the learner
  must classify a situation, choose a method, execute a meaningful step, or
  evaluate a result. Do not recast a direct definition as a token problem.
- **R5 — Planned portfolio.** The deck blueprint accounts for the intended card
  forms, problem progression, and authentic representations chapter by chapter.
  Large unexplained differences between the plan and final inventory require
  review before handoff.

## Cloze rules

- **C1 — Small deletion.** Prefer one deletion and allow at most two per block.
  A deletion should normally be a term, value, symbol, or short relation—not a
  sentence fragment learned as prose.
- **C2 — Informative deletion.** Delete the knowledge target, never filler or a
  connective phrase.
- **C3 — Determinate context.** Visible text uniquely constrains the deletion at
  the intended precision.
- **C4 — Parser-safe brackets.** Every `[...]` in a `C:` block becomes a cloze
  except Markdown image syntax. Do not place deletion brackets *inside* a math
  span, because mathematical brackets and cloze markers become ambiguous. Use
  `Q:/A:` or delete the complete math span, for example
  `[\(v=v_0+at\)]` rather than `\(v=[v_0+at]\)`.
- **C5 — No duplicate reveal.** Hidden text does not appear elsewhere in the
  visible block.

## Problem/solution rules

- **P1 — Method before execution.** A full IPEE solution uses IDENTIFY to name
  the problem class, PLAN to choose a method, EXECUTE to carry it out, and
  EVALUATE to check it. Fade sections only after the pattern is established.
- **P2 — Transfer target.** The card practices method selection or execution,
  not merely a remembered final value. Use numbers when computation fluency is
  the target and variables when structure or transfer is the target.
- **P3 — Genuine check.** EVALUATE uses units, limiting cases, substitution, an
  inverse operation, a sanity bound, or another real verification. “Correct ✓”
  is not a check.
- **P4 — Sufficient givens.** The problem states every constraint and definition
  needed to attempt it cold.

## Figure rules

- **V1 — Retrieval role.** A figure earns its place only when the learner must
  inspect, predict, label, compare, trace, estimate, or translate it.
- **V2 — Front/back discipline.** Put setup information on the front and
  answer-revealing labels or constructions on the back.
- **V3 — Accurate and accessible.** Geometry, direction, axes, scale, legends,
  and labels are correct. Do not rely on color alone; inspect at phone width.
  SVG markers must declare `markerUnits` explicitly. For ordinary diagram
  arrows, prefer `markerUnits="userSpaceOnUse"` so thicker strokes do not also
  inflate the arrowheads; size the fixed marker in viewBox units and visually
  keep it proportional to the line (usually about 1.5 to 4 stroke widths).
  Marker-ended strokes must use `stroke-linecap="butt"`; rounded end caps can
  protrude through the triangular marker. Place `refX` inside the arrowhead
  body so the shaft terminates beneath it, and paint projection guides before
  the primary vector so guides cannot obscure its tip.
  Never rely on the SVG default `markerUnits="strokeWidth"` accidentally.
- **V4 — Appropriate medium.** Prefer original responsive SVG for technical
  diagrams. Native SVG is appropriate for simple geometry. For typography- or
  geometry-heavy technical figures, a deck may keep editable TikZ sources and
  compile them to ordinary SVG at authoring time. Reuse the deck's shared style
  and commit both source and output; never require TeX or TikZ compilation in
  the study client. Generated SVG must pass the same accessibility, phone-width,
  and stale-output checks as hand-authored SVG. Use licensed photographs or
  raster illustrations only when their visual content is the authentic learning
  target.
- **V5 — Representation coverage.** Before authoring, inventory each chapter's
  spatial, temporal, structural, graphical, relational, and other authentic
  visual targets. Include every figure that earns a distinct retrieval role;
  do not impose either a decorative quota or an implicit one-figure cap.
  Record why a visually important outcome is intentionally handled without a
  figure.

## Deck rules

- **D1 — Learning contract.** The roadmap and deck docs state the learner,
  assumed prerequisites, desired durable capabilities, depth, and exclusions.
  Unconfirmed domain knowledge defaults to **not mastered**; broad labels such
  as “introductory,” “college,” or “calculus-aware” are not prerequisite lists.
- **D2 — Prerequisite graph.** Chapters and applications follow explicit
  prerequisite edges. A failed card should expose a retrieval or reasoning gap,
  not missing instruction. Each chapter records its allowed inbound knowledge
  and a concept ledger mapping every new term or representation to its first
  explanation, first retrieval, and later application.
- **D3 — Competency coverage.** Coverage follows capabilities and high-value
  retrieval targets, not source page count, arbitrary cards-per-chapter quotas,
  or a requirement to convert every worked example and exercise.
- **D4 — Representation and interference.** Where the field requires it, the
  deck translates among authentic representations and discriminates commonly
  confused neighbors.
- **D5 — Evidence provenance.** Scope sources and claim-verification sources are
  distinguished. URLs, authority, license/terms, and access dates are recorded;
  uncertainty and simplifications are labeled.
- **D6 — Feedback loop.** Audits use study evidence when available—repeated
  `Again` ratings, leeches, slow responses, ambiguity reports, and unused cards—
  while treating telemetry as a diagnostic signal rather than proof of cause.
- **D7 — Cold-start gate.** Before a new deck or chapter is accepted, simulate
  a first-time learner reading every card front in order. Record every required
  concept and either its declared inbound source or its earlier establishment.
  Any unexplained dependency is a major defect. A full-deck build must not begin
  until the first authored chapter passes this gate and the learner or maintainer
  explicitly approves the pilot.

## File and identity rules

- **F1 — Canonical frontmatter.** Use TOML `+++` frontmatter with `order`,
  canonical lowercase kebab-case `subject`, and kebab-case `tags`. Preserve
  supported provenance tables. Remove the obsolete `name` field.
- **F2 — Ordered filenames.** Chapter files use zero-padded
  `NN_snake_case.md` names whose prefix matches `order`.
- **F3 — Deck metadata.** New and modernized decks contain `AGENTS.md`,
  `CARD_README.md`, `README.md`, and `deck.toml`; local reference material and
  `.DS_Store` remain ignored.
- **F4 — Stable identity.** Every card block has a unique `card-id`. Preserve it
  for the same retrieval target; assign a new ID when the knowledge or grading
  decision materially changes. Preserve aliases and never bulk-regenerate IDs.

Before revising a studied legacy deck, run
`flashcards deck stabilize <deck-path>`. A content hash is the fallback identity
for unstabilized cards, so editing one can otherwise reset its schedule.

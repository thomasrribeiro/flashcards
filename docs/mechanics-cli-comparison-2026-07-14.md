# Mechanics CLI comparison — revised blind trial, 2026-07-14

> **Correction after learner cold-start review:** The original verdict in this
> report overweighted transfer problems, concision, and representation counts.
> It did not simulate a zero-mechanics-knowledge learner reading fronts in
> order. The revised deck is **not a viable novice curriculum as generated**.
> Chapter 1 asks about force and energy accounting, velocity and vectors, and a
> mass–spring oscillator before those concepts are established. The existing
> mechanics deck remains the substantially better first-learning base. The
> quantitative inventory below remains useful; qualitative claims favoring the
> revised deck are superseded by the correction and verdict at the end.

## Question and method

How does a fresh mechanics deck produced after the representation-planning
changes compare with the working deck at
`/Users/thomasribeiro/notes/physics/mechanics`?

The revised CLI build was deliberately blind. Its authoring agent was forbidden
from inspecting either the existing mechanics deck or the first CLI trial. It
received the standard context manifest, the physics guide, and the same
12-chapter introductory-calculus-aware learner specification.

This assessment independently read every schedulable card in both decks:

- all 175 cards in the revised blind build;
- all 441 cards in the current existing mechanics working tree;
- all card answers and problem solutions, not only titles or aggregate counts;
- each chapter's representation and figure inventory;
- both validation reports and the revised build's phone-width visual QA record.

The existing deck was assessed as found, including its uncommitted card and
figure improvements. It was not modified by this experiment. Source-provenance
compliance is outside this comparison; the verdict below concerns curriculum,
retrieval design, correctness, representations, and implementation quality.

## Aggregate results

| Measure | Revised blind CLI deck | Existing mechanics deck |
|---|---:|---:|
| Schedulable cards | 175 | 441 |
| Basic cards | 125 | 263 |
| Cloze cards | 0 | 165 |
| Progressive problems | 50 | 13 |
| Original figure assets | 36 | 46 |
| Figure references | 36 | 46 |
| Median non-cloze front length | 18 words | 12 words |
| 90th-percentile non-cloze front length | 35 words | 22 words |
| Median non-cloze back length | 31 words | 32 words |
| 90th-percentile non-cloze back length | 41 words | 62 words |
| Non-cloze backs over 60 words | 0 | 30 |
| Duplicate normalized fronts | 0 | 0 |
| Parser/KaTeX/image/identity/frontmatter errors | 0 | 0 |
| Cloze lint findings | 0 | 47 |

The longer revised fronts are not generally verbosity: 50 of its 175 cards are
problems whose prompts include a situation and target. Its answers are tighter,
with no answer or solution over 60 words. The existing deck's long tail comes
from detailed explanations and its much longer worked solutions.

The first blind CLI trial produced 229 cards, 23 problems, and only 9 figures.
After the planning changes, the new trial produced 50 problems and 36 figures
without a quota. The authoring ledger identified distinct retrieval roles before
card creation and reconciled all planned versus actual representations after it.
This resolves the earlier underproduction of both transfer practice and figures.

## Chapter-by-chapter inventory

Counts are `basic / cloze / problem / figure`.

| Chapter | Revised CLI | Existing | Card-level conclusion |
|---|---:|---:|---|
| 01 Foundations | 9 / 0 / 3 / 2 | 22 / 11 / 1 / 3 | Existing is decisively better for novice entry. Revised uses force, energy, velocity, vectors, oscillators, and frequency before teaching them; its systems/model emphasis belongs only after an explicit bridge. |
| 02 Vectors | 10 / 0 / 3 / 3 | 20 / 15 / 1 / 4 | Revised has the better compact progression and application density. Existing adds determinant form, unit/polar vectors, and more exact factual retrieval. |
| 03 Kinematics 1D | 11 / 0 / 4 / 3 | 22 / 16 / 1 / 4 | Revised gives substantially better graph, area, constant-acceleration, and free-fall practice. Existing adds more equation-selection cases and formula retrieval. |
| 04 Kinematics 2D | 10 / 0 / 4 / 3 | 16 / 16 / 1 / 4 | Revised is cleaner and better practiced. Existing importantly adds non-uniform circular acceleration, range conditions, and more method discrimination. |
| 05 Newton's laws | 11 / 0 / 4 / 3 | 19 / 10 / 1 / 3 | Revised is the better core sequence: object isolation, net force, composite systems, elevator weight, and third-law diagnosis all transfer into problems. Existing adds non-inertial-frame context and a fuller procedural checklist. |
| 06 Forces | 11 / 0 / 4 / 3 | 23 / 11 / 1 / 4 | Revised has much better incline, pulley, friction-circle, and terminal-speed practice. Existing preserves valuable normal/friction nuance, spring combinations, quadratic drag, and terminal-velocity detail. |
| 07 Work and energy | 11 / 0 / 4 / 3 | 21 / 13 / 1 / 4 | Revised excels at system boundaries, force-position area, energy bars, potential landscapes, and short application. Existing gives fuller spring-work, elastic-potential, friction, and power coverage. |
| 08 Momentum | 10 / 0 / 4 / 3 | 22 / 16 / 1 / 4 | Revised is stronger for impulse, vector conservation, recoil, and center-of-mass transfer. Existing importantly covers one-dimensional elastic-collision formulas, mass-ratio limits, and kinetic-energy loss in more depth. |
| 09 Rotation | 13 / 0 / 5 / 4 | 27 / 18 / 1 / 4 | Revised fixes the first trial's missing constant-angular-acceleration and static-equilibrium practice. Existing remains broader on standard inertias, the parallel-axis theorem, rolling nuance, and angular momentum. |
| 10 Gravitation | 10 / 0 / 4 / 3 | 21 / 17 / 1 / 4 | Revised adds excellent field-superposition and scaling problems. Existing is more complete on altitude, orbital energy, all three Kepler laws, periapsis/apoapsis, and orbit method selection. |
| 11 Oscillations | 11 / 0 / 4 / 3 | 26 / 22 / 1 / 5 | Revised is a strong lean SHM sequence with real phase, energy, pendulum, and damping practice. Existing retains physical pendulums, initial-condition detail, quantitative damping regimes, and more precise resonance qualifications. |
| 12 Synthesis | 8 / 0 / 7 / 3 | 24 / 0 / 2 / 3 | Revised is decisively better for mixed transfer: method selection, ballistic pendulum, staged collision/spring motion, angular impact, loop contact, and dimensional diagnosis. Existing supplies more short misconception and graph-discrimination prompts. |

## What the revised CLI now gets right

### Problems are designed as a curriculum

The revised deck contains three to five problems in every content chapter and
seven in synthesis. They are not merely longer recall cards. Across the deck
they exercise:

- representation reading before arithmetic;
- model and system selection;
- signs, components, and limiting cases;
- force, energy, momentum, and angular-momentum discrimination;
- multistage method changes;
- concise evaluation after calculation.

The existing deck usually has one polished worked problem per chapter. Those
are valuable demonstrations, but one example is insufficient for procedural
retrieval and transfer. The revised problem portfolio is the largest genuine
quality improvement.

### Figures are planned by retrieval role

The revised build created 36 SVGs rather than the first trial's 9. The ledger
separately considered geometry, graphs, state transitions, before/after
comparisons, force/system diagrams, and representation translation. It did not
treat one figure per chapter as a cap.

All figures have a responsive `viewBox`, title, description, meaningful card alt
text, and a non-color cue. Phone-width review found and corrected incline
geometry, lever-arm geometry, collision vectors, equal-area geometry, SHM phase,
energy labeling, clipped text, and an invalid SVG attribute before final
validation. The visual QA gate therefore changed the output materially.

The existing deck still has the richer production visual library: 46 figures,
several of which are more detailed and already proven useful during actual
study. The revised set contributes different high-value views—especially the
system-boundary, elevator, potential-landscape, center-of-mass, orbital-energy,
and method-map figures—rather than making the existing library obsolete.

### Zero clozes is defensible here

The revised author explicitly chose no clozes because mechanics formulas are
better retrieved with meaning, conditions, coordinates, or method choice than
as context-free missing substrings. After inspecting every revised card, no
obvious target was harmed by using a bounded question or problem instead.

Zero is not a universal target. A cloze remains appropriate for an exact,
compact, unambiguous completion when surrounding context is the retrieval cue.
The existing deck's 165 clozes include useful factual prompts, but many duplicate
nearby basic formula cards and 47 place a deletion inside math delimiters. Those
47 parser-ambiguous cards should be converted to explicit question/answer cards
or whole-expression clozes while preserving stable identity where possible.

## Where the revised deck is still too lean

The 175-card deck is not a complete replacement for the 441-card deck. Its
economy sometimes becomes omission. The most important retained targets from
the existing deck are:

- significant-figure operations and fuller measurement foundations;
- non-uniform circular motion and projectile range boundaries;
- static-friction and normal-force edge cases;
- spring combinations, spring work, and quadratic drag;
- one-dimensional elastic-collision outcomes and mass-ratio limits;
- common moments of inertia and the parallel-axis theorem;
- the complete Kepler-law and orbital-geometry set;
- physical pendulums and quantitative damping regimes;
- several short misconception and method-discrimination cards.

Some existing cards are also better for a first encounter because they explain
one extra causal step. The revised deck assumes that its concise answer plus
external problem practice will be enough. That is efficient for review, but a
subset of novices would need a prerequisite bridge or slightly fuller repair.

## Cold-start failure found during actual study

The qualification above was too mild. The revised deck's own blueprint treats
reading an answer after the first failed attempt as its initial-learning path.
That contradicts the authoring playbook: an uninformed failure is not productive
retrieval and the revealed answer is corrective feedback, not prior instruction.

The first chapter contains several major prerequisite violations:

- system-boundary accounting assumes forces, energy, interactions, strings,
  and internal versus external interactions;
- frame selection assumes position, velocity, components, and physical vectors;
- post-calculation checking invokes limiting cases and conservation;
- the dimensional-analysis problem assumes period, frequency, spring constant,
  and a mass–spring oscillator from the much later oscillations chapter.

These are not cosmetic wording defects. They show that the declared
prerequisite graph was not applied to individual fronts. Parser, identity,
KaTeX, asset, card-count, and figure-count validation cannot detect that failure.
Future generation therefore requires a front-by-front concept-dependency ledger
and an explicitly approved one-chapter pilot before scaling.

## Corrected verdict

The **existing deck is both the correct production base and the better novice
curriculum**. It is not flawless—some definitional cards still use failure as a
first encounter, and it needs a targeted prerequisite audit—but it begins with
substantially more accessible ideas and has deeper explanatory scaffolding.

The **revised CLI deck is a useful failed experiment, not a replacement or merge
source by default**. Its figures and some later transfer problems may contain
valuable isolated designs, but each must independently pass a dependency audit
before reuse. Its clean technical implementation and polished blueprint did not
prevent a fundamental pedagogical failure.

The appropriate conclusion is to merge designs, not repositories:

1. preserve the existing deck, stable IDs, figure library, and review history;
2. repair the 47 math-internal cloze warnings and remove genuinely redundant
   formula/fact duplicates;
3. retain the existing second-pass topics listed above;
4. add the revised deck's strongest missing problem progressions and
   representation cards chapter by chapter;
5. add only revised figures with a distinct role not already served by an
   existing figure;
6. use learner telemetry to shorten, split, or retire existing cards that remain
   slow, ambiguous, or repeatedly failed after prerequisite repair;
7. validate identity changes before every production merge.

No material should be merged merely because the revised deck is shorter or has
more problems per card. First repair the generation workflow, audit the existing
deck from the learner's true prerequisites, and pilot improvements one chapter
at a time. The target should not be 175, 441, or any other card quota; it should
be a sequence in which every attempted retrieval is supported by established
knowledge.

## Reproducibility

The revised blind trial deck is local at:

`/tmp/flashcards-mechanics-comparison-20260714-v2/physics/mechanics`

The first blind trial remains at:

`/tmp/flashcards-mechanics-comparison-20260714/physics/mechanics`

Validation commands:

```sh
flashcards deck validate /tmp/flashcards-mechanics-comparison-20260714-v2/physics/mechanics
flashcards deck validate /Users/thomasribeiro/notes/physics/mechanics
```

The revised trial is intentionally not wired into the application collection
and was not committed or pushed to a deck repository.

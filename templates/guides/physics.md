# Physics flashcard writing guide

This guide supplements the universal card standard and authoring playbook. It
defines reusable physics-specific judgment. The subject roadmap, not this file,
chooses the course level and topic sequence.

## What competence looks like

A physics deck should develop connected retrieval across:

- operational definitions and measurable quantities;
- system choice, assumptions, frames, coordinates, and sign conventions;
- qualitative prediction before calculation;
- governing principles and their conditions of validity;
- translation among physical situations, diagrams, graphs, words, and
  equations;
- estimation, dimensional analysis, limiting cases, and sanity checks;
- model selection and discrimination between tempting alternatives;
- experimental inference, uncertainty, and what data can support.

SRS maintains concepts, representations, and method triggers. It does not
replace laboratories, derivations, extended problems, simulation, or the
physical judgment developed by working unfamiliar situations.

## Whole-field coverage and balance

This is a method guide, not a claim that all physics belongs in one deck. An
individual deck should cover only its declared scope. A subject-wide roadmap or
whole-collection audit, however, must not mistake the traditional introductory
mechanics sequence for a faithful map of physics.

When the learner's destination is broad physics competence, explicitly include,
sequence, or deliberately defer each applicable domain:

- measurement, classical mechanics, continuum mechanics, fluids, and nonlinear
  dynamics;
- oscillations, waves, acoustics, geometrical and physical optics;
- thermodynamics, kinetic theory, statistical physics, and nonequilibrium
  systems;
- electricity, magnetism, circuits, electromagnetic fields, and radiation;
- special relativity, gravitation, general relativity, and cosmology;
- quantum foundations, quantum mechanics, quantum information, and quantum
  field ideas at the target level;
- atomic, molecular, optical, laser, and chemical physics;
- condensed matter, solid-state, soft-matter, polymer, and materials physics;
- nuclear, particle, accelerator, beam, and plasma physics;
- astrophysics, biological physics, medical physics, climate physics, and other
  declared interdisciplinary applications.

Do not assign equal card counts to these labels mechanically. Weight them by the
learner's destination, prerequisite graph, explanatory reach, and authentic
practice. Record omissions in `ROADMAP.md` so that absence is a decision rather
than an artifact of whichever textbook or early course supplied the examples.

Across the selected domains, plan experimental design, instrumentation,
measurement, uncertainty, data analysis, modeling, approximation, computation,
simulation, visualization, and scientific communication as recurring practices.
These are modes of doing physics, not a final miscellaneous chapter. AAPT
specifically treats computation as complementary to theoretical and
experimental physics; reinforce it throughout a curriculum when it is part of
the learner's destination.

## Prerequisite and level policy

Declare whether the deck is conceptual, algebra-based, calculus-based, or
upper-level, and which mathematics is actually mastered. Do not explain an
introductory idea using a later principle merely because the later explanation
is elegant. Build only on explicit inbound prerequisites.

Before an application, establish the quantity, vector/scalar status, units,
frame, sign convention, and relevant representation. A learner should not fail
because a diagram convention or mathematical tool was never introduced.

For a zero-physics-knowledge learner, do not introduce foundations through
force, energy, momentum, velocity, vectors, oscillators, fields, or other later
mechanics ideas. Those may be elegant examples to an expert but are hidden
prerequisites to a novice. Begin with observable comparisons, measurement,
units, simple ratios, and explicitly defined everyday situations. Record every
technical quantity and diagram convention in the chapter concept ledger before
using it on a front.

Run the cold-start audit in chapter order. A concept established in chapter
`N` may support chapter `N+1`; a planned outcome in a later chapter does not
count as prior knowledge. When an early chapter genuinely needs a later idea,
either add a minimal non-circular bridge or choose a different example.

## Model-first progression

For a new physical model, prefer:

1. phenomenon and system boundary;
2. measurable quantities and representations;
3. assumptions and regime of validity;
4. causal or governing relationship;
5. qualitative prediction;
6. equation with variables and units defined;
7. analyzed example;
8. faded and mixed application;
9. breakdown case or competing model.

Avoid bare formula-recall cards when the real skill is deciding whether and how
the relation applies. Pair an equation with its physical meaning, conditions,
and at least one method-selection or prediction target.

## Problem cards and IPEE

Use IPEE when the solution teaches a transferable choice:

- **IDENTIFY** the system, model, knowns/unknowns, and applicable regime;
- **PLAN** the principle and representation before algebra;
- **EXECUTE** symbolically or numerically at the level appropriate to the
  learner;
- **EVALUATE** using units, sign, direction, limiting cases, order of magnitude,
  conservation, or comparison with a known case.

Variables are useful for structural transfer; numbers are useful for estimation,
units, and fluency. Neither is universally superior. Fade scaffolding as the
learner becomes able to classify the problem independently.

Do not automatically turn every worked example or end-of-chapter problem into a
card. Prefer examples that expose model selection, a common error, a
representation change, or a powerful check. Keep long synthesis problems in
external practice.

## Representations and figures

High-value visual retrieval includes:

- system and free-body diagrams;
- motion, field, ray, circuit, energy, state, and spacetime diagrams;
- position/time and other physical graphs with axes and units;
- vector components, coordinate choices, and sign conventions;
- experimental setups and measurement uncertainty;
- before/after states for conservation laws;
- qualitative comparison of model predictions.

Do not let free-body diagrams become the default meaning of a “physics figure.”
Audit the representational grammar of the actual subfield: ray and wavefront
constructions, spectra and energy-level diagrams, phase and state-space plots,
field and potential maps, spacetime and causal diagrams, circuit and signal
representations, crystal and reciprocal-space structures, Feynman or interaction
diagrams at the appropriate level, detector readouts, probability densities,
uncertainty visualizations, and simulation or data products may carry the real
retrieval target.

Author new technical figures in TikZ by default and compile them to ordinary
SVG at authoring time. This applies to vector geometry, mechanics diagrams,
plots, and other generated physics constructions. Use one restrained deck-level
visual grammar: consistent sans-serif labels, proportional `Stealth`
arrowheads, stable line weights, muted construction lines, and the deck accent
only for the primary quantity. Use another medium only when the authentic
visual target requires it, and document the exception. Never compile TikZ in
the study client.

Geometry, arrow direction, relative placement, axes, labels, and scale claims
must be physically correct. Use dashed paths or shape differences as well as
color. Keep solution forces, trajectories, labels, and constructions off the
front when they are the target. Inspect the rendered SVG—not merely its source—
at phone width and reject clipped labels, oversized tips, ambiguous endpoints,
excess whitespace, or inconsistent typography.

Before authoring each chapter, assess these as separate opportunities rather
than selecting one representative image: system boundaries, free-body or field
diagrams, coordinate/vector geometry, graph families, experimental or
measurement setups, before/after conservation states, model comparisons, and
translations between them. Include every distinct high-value target; record why
an expected representation is omitted.

Use clozes sparingly for compact quantities, units, notation, or relations that
are already understood and genuinely need exact recall. Do not place deletion
brackets inside a math span. Model choice, assumptions, equation meaning, and
derivation cues normally belong in `Q:/A:` or `P:/S:` cards.

## Interference and misconceptions

Contrast quantities and laws that share surface cues, for example:

- position/displacement/distance;
- speed/velocity/acceleration;
- mass/weight;
- force/energy/power/momentum;
- field/force/potential;
- temperature/heat/internal energy;
- path-dependent/process quantities and state functions;
- a real interaction pair and two forces acting on one object.

Also inventory interference that appears outside introductory mechanics, such
as wave speed/frequency/phase velocity, electric potential/potential energy,
heat/temperature/entropy, state vector/observable/measurement outcome,
classical mixture/quantum superposition, proper/coordinate quantities,
microscopic state/macroscopic state variable, lattice/reciprocal lattice,
accuracy/precision/resolution, and model uncertainty/measurement uncertainty.
Use only contrasts that belong to the deck's declared scope and establish both
members before testing discrimination.

Ask for the decisive system, direction, dependence, unit, or condition. Use
plausible wrong diagrams and reasoning only when the answer explicitly repairs
the misconception; do not rehearse a misconception without correction.

## Accuracy and audit checks

- Define every symbol and coordinate convention on the card.
- Check dimensions, units, signs, directions, limits, and numerical order of
  magnitude.
- State idealizations and the regime in which an approximation is valid.
- Distinguish vectors from magnitudes and exact equalities from approximations.
- Do not conflate a mathematical correlation with a physical mechanism.
- Verify constants, nomenclature, and unsettled or current empirical claims
  against authoritative sources.
- Inspect figures for hidden answer leaks and impossible geometry.

## Evidence and curriculum references

- American Association of Physics Teachers, curriculum and teaching resources:
  https://www.aapt.org/resources/
- American Physical Society, divisions and topical groups (a breadth check for
  physics subfields, not a prescribed course sequence):
  https://www.aps.org/membership/units
- AAPT, undergraduate physics curriculum resources, including laboratory and
  computational-physics recommendations:
  https://www.aapt.org/Resources/HigherEd/Undergraduate_Physics_Curriculum.cfm
- U.S. National Science Foundation, physics focus areas (an additional breadth
  check for contemporary research domains): https://www.nsf.gov/focus-areas/physics
- PhysPort, research-based physics teaching resources:
  https://www.physport.org/
- OpenStax Physics (openly licensed reference; verify the current license and
  edition before reuse): https://openstax.org/subjects/science

Use curricular references to determine level and representations. Verify
individual physics claims through authoritative texts, direct derivation, public
scientific agencies, or primary literature as appropriate.

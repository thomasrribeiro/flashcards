# Curriculum evaluation cases

Reviewer-only calibration and probe plan. Never supply this file, its expected
judgments, existing curricula or previous outputs to the generation model.
Use the fixed acceptance rubric in curriculum-evaluation-workflow.md. These
cases constrain evaluation, not the generated syllabus or deck count.

## Offline checks

Run `npm run test:curriculum` before a generation experiment. It checks the
single-source compiler, historical format compatibility, full ancestor traces,
publication gates, input isolation, raw artifact retention and the two-call bound
with synthetic data and mocked networking. Passing does not establish model
reliability or educational completeness.

## Reviewer calibration

Keep these expected judgments fixed. Evaluate the described contract, not an
imagined missing detail. They can also be used for an independently authorized,
read-only reviewer evaluation; no generator revision is involved.

| Case | Evidence supplied | Expected judgment |
| --- | --- | --- |
| Coherent consolidation | Two related working methods share preparation and remain explicit outcomes in one deck. A consumer needs only one. | No blocker; do not demand two decks. |
| False simplification | Scope promises two methods; only one has an outcome and the other is nowhere taught. | Teaching-contract blocker; cite the unsupported promise. |
| Real entry barrier | A basic geometric construction needs vectors; its only route inherits differential-equation theory solely because it is bundled with a specialist continuation. No accessible route exists. | Readiness blocker; show the complete inherited path and unnecessary preparation. |
| Harmless level difference | A consumer requires an advanced result whose proof is genuinely needed for its promised performance. | A higher-level source alone is not a blocker. |
| Local method | A bounded application explicitly teaches its notation, model assumptions, fitting method and limitations; practice requires only that method. | No missing-prerequisite blocker merely because a full theoretical course is absent. |
| Hidden method | Practice requires estimating a covariance model but neither local outcomes nor ancestors specify a suitable method. | Readiness blocker; identify the missing method, not merely a missing edge name. |
| Optional specialty | Representative advanced routes exist; a further narrow extension is deliberately excluded without being presumed elsewhere. | Optional, not a completeness failure. |
| Apparent rename loss | An old deck disappears, but another subject's explicit outcomes provide the same capability and preparation. | No coverage regression from the title/owner change. |
| Unknown scope | A reviewer suspects a specialist omission but cannot establish it as a major branch of the agreed destination. | Warning pending evidence, not an automatic blocker. |
| Broken reference | An outcome reference does not exist, even though a similarly named capability exists. | Structural blocker; no inferred repair. |

## Fixed small-generation probes

These are proposed evaluation-only subject sets, not additions to the user's
collection. Do not launch them through the production registry or substitute
them for its five-subject curriculum. A paid probe needs an explicit run budget;
record it before calling a provider. Preserve the requested model/reasoning.

1. **linear-algebra** — inspect coherent grouping, conceptual/computational/proof
   entry paths and representative advanced depth. No particular deck title or
   count is required.
2. **probability, statistics** — inspect shared ownership, working methods versus
   theoretical guarantees, local teaching and full cross-subject prerequisites.
3. **ecology** — hold out from prompt tuning; inspect empirical/applied branches,
   explicit quantitative preparation and external-practice conditions. A lack of
   mathematical subjects in the input requires local or ecology-owned foundations,
   not hidden assumptions or unrequested subject nodes.

For each authorized probe the generator receives only those subject names, the
canonical global instructions and the strict schema; mandatoryDecks is empty.
Its one revision receives only that same job's draft and deterministic checks.
The reviewer freezes the source-backed scope map before seeing its output.
Record the contract commit, rubric/scope-map version, raw/compiled hashes,
structural findings and the five review dimensions. If any probe has a
demonstrated blocker, review externally and update instructions before another
fresh job; never carry the failed candidate or external findings into another job.

Keep the same probe sets across compared instruction versions. They are small
task samples, not independent repeats estimating a failure rate. Do not claim
statistical significance or general reliability from a single pass. If the
holdout reveals a mechanism and is used for tuning, record that it is no longer
held out and define a new holdout before the next comparison.

Only after the fixed probes pass should an authorized full-subject run test
scale and cross-field integration. Passing either stage does not auto-apply a
curriculum. The production diff remains a proposal requiring user acceptance.

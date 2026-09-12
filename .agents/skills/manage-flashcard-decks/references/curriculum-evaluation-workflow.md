# Evaluate a global curriculum

Use this for external review, not as additional model-generation context.
Review alone does not authorize paid jobs, edits, pushes, or acceptance. Follow
the user's explicit scope. Never apply a proposal as part of an instruction
experiment unless acceptance itself was authorized.

## Record the experiment

Record the request ID, workflow commit, subjects and mandatory-deck inputs,
model/reasoning, candidate commit, and published baseline commit. Record the
initial and revision attempts (and distinguish historical one-call jobs). Compare
the complete specifications, not just deck IDs or
counts. Renames and changes of ownership are not automatically lost coverage.
Check remote job state before submission; never duplicate a pending job or
blindly repeat an ambiguously acknowledged paid request.

## Evaluate independently

Read the global generation contract. Before opening a new candidate, freeze a
field-and-depth review map and its source basis for the subject set, and record
its version alongside the instruction/schema hashes. Use authoritative curricula
and domain sources when needed. The published curriculum is comparison evidence,
not an unquestionable gold standard. Do not grade only topics mentioned in
earlier feedback. Keep new, previously unflagged branches and entry paths in
each review so instruction changes are tested for generalization.

Assess these dimensions separately:

- **Structural validity:** run the candidate validator; inspect references,
  cycles, outcome annotations, levels, and cross-subject prerequisite closure.
  Distinguish redundant graph edges from additional outcome requirements.
- **Breadth and depth:** map established branches, foundational entry,
  graduate foundations, and representative advanced continuations to explicit
  scope and outcomes. Test deferrals and adjacent-subject ownership. A title,
  keyword, or all-outcomes-covered statistic does not establish completeness.
- **Learner readiness:** trace entry paths across every subject and different
  learning modes. Look for missing bridges, unjustified prerequisites, and
  elementary capabilities trapped inside advanced decks. Inspect both the
  direct requirements and their full ancestor closure.
- **Teaching contract:** inspect scope/outcome agreement, assessability,
  bundled independent capabilities, and coherent deck boundaries. Uneven or
  uniform counts are diagnostic signals, never automatic pass/fail rules.
- **Learning usefulness:** distinguish what flashcards can maintain from
  proofs, projects, experiments, and other external practice. Ensure needed
  computational or practical knowledge is specified, not hidden in disclaimers.

For each finding, record the candidate IDs/outcomes, relevant old counterpart
if any, why it matters, severity, and a source or concrete dependency trace.
Separate demonstrated defects from unresolved questions and optional additions.
Inspect both gains and regressions; extra decks or longer descriptions alone
are not improvements. State limits of review rather than claiming exhaustive
subject-matter certification.

## Fixed acceptance rubric

Classify findings before making a verdict:

- **Structural blocker:** unresolved/ambiguous IDs, cycles, invalid contract
  fields or violation of the requested subject/mandatory-deck input. Code
  establishes these failures. Never guess, remove or repair a reference.
- **Educational blocker:** a demonstrated missing major branch in the frozen
  scope map, an unsupported substantive learning promise, a missing prerequisite
  bridge, or substantial unrelated preparation imposed on a promised entry
  capability. Cite the capability/depth and source basis, or the exact consumer
  outcome/practice and complete prerequisite trace. A missing old deck name,
  keyword or lower count is not evidence.
- **Warning:** a plausible concern about depth, ownership or preparation whose
  evidence is incomplete. Record what would resolve it; do not promote it to a
  blocker merely because another organization is possible.
- **Optional:** an additional specialty, stylistic preference, alternative
  coherent grouping or redundant-but-meaningful explicit annotation. These do
  not prevent acceptance. Nor do external-practice conditions alone.

Judge graduate foundations and representative advanced continuations against
the agreed destination, not every specialty offered by every source. A source
mentioning a topic does not prove that it is a required major branch. Consolidated
decks pass when their capabilities and usable entry paths survive. Different
outcome IDs and partly used source decks are not reasons to demand more decks.

Report structural validity, breadth/depth, readiness, teaching contract and
learning usefulness separately, with evidence and uncertainty. Do not invent a
weighted quality score or optimize deck/edge totals. A verdict requires review
of every dimension: accept when no demonstrated blockers remain; accept with
warnings for nonblocking concerns; otherwise needs revision. Empty scopeIssues
is not independent acceptance. Model-declared issues must be reviewed too; do
not silently alter them or bypass the production publication gate.

Keep the rubric and scope map fixed across a comparison batch. Newly discovered
substantial risks still deserve disclosure, but mark them as new criteria and
reassess both candidates before attributing a regression or improvement. Do not
silently move the goalposts or feed the map/review findings to the generator.

## Preflight and bounded experiments

Use [curriculum-evaluation-cases.md](curriculum-evaluation-cases.md) to calibrate
the reviewer and define small fresh-generation probes before another full run.
The offline suite tests compiler/runner invariants, not model quality. Probe
review criteria are external and never appended to the generation instructions.

Before spending, record the proposed instruction change and predicted effect,
fixed cases, rubric version, model/reasoning, and run budget. Change one mechanism
at a time when feasible. A coordinated schema/instruction migration is one
explicit experiment, not evidence of which individual change caused its effect.
Preserve raw/validated artifacts and their hashes, provider diagnostics, all
failures and all attempts (including historical compilation artifacts).
One result per version is exploratory evidence, not proof of reduced error rates.
Repeated identical-input trials would need explicit approval to relax the user's
instruction-update-between-iterations rule; never charge for them implicitly.

Full-run promotion requires passing structural checks and the fixed probe review
without demonstrated blockers. Do not claim reliability from synthetic fixtures
or promote a prompt merely because it improved the most recently flagged topic.
Keep paired gains/regressions visible and held-out fields separate from tuning.

## Deterministic inspection

For a fresh JSON candidate or retained attempt wrapper, run:

```bash
flashcards curriculum check-candidate <candidate.json> --subjects <subject-names...>
```

Repeat `--deck <subject/deck>` to limit detailed output to chosen entry paths.
The runner also saves `attempt-N-diagnostics.json` beside each completed draft.
These are read-only inspections: current output uses explicit deck/outcome
references; historical format-2 output is compiled from its single outcome
registry without changing the saved artifact.
They reuse the candidate validator, separate
structural errors from model-declared scope issues, and expose full cross-subject
ancestor closures, indirect consumer counts, exact required outcome IDs, other
source outcomes, alternative paths and level differences. Detailed external
review traces are not sent to the generator; the bounded revision receives only
its own draft and deterministic structural errors. The command exits unsuccessfully for structural errors or
declared scope issues; exit success is not educational acceptance.

Use these traces to test a concrete claim against the full source and consumer
contracts. Do not automatically remove a redundant edge (its outcome annotation
may matter), reject a higher-level source, or split every partially used source.
Coverage mappings prove traceability only; neither counts nor a one-deck-per-row
pattern can prove that the independently established field inventory is complete.

## Iterate when authorized

Fix the general failure mechanism in the canonical instructions. Avoid adding
each observed missing topic to a growing mandatory syllabus or copying the old
curriculum into the prompt. Preserve input isolation and the requested model.
Make the smallest supported revision, validate the skill, run relevant tests,
and push/deploy only when authorized. Pin the next job to the deployed commit.

Run one job at a time. Inspect its result before requesting another. Use the
same requested subjects and no mandatory additions unless the user requested
them. Every iteration follows review → update canonical instructions →
push/deploy → fresh generation. Each job makes an initial call using only the
input allowlist, followed by at most one revision using that same job's draft
and deterministic validation. Never supply skills, external reviewer feedback
or another job's proposal. Preserve both attempts and compare the revision
against its draft as well as earlier experiments. Never edit outputs to pass
the review. Express supported improvements in the versioned instructions;
do not launch another quality iteration without an instruction revision.
Read-only polling reconnects retrieve the same response, not a new generation.

Stop when structural checks pass and the broad review finds no unresolved
major coverage, readiness, or teaching-contract defects; report minor caveats
without chasing an exhaustive or stylistically perfect curriculum. If repeated
iterations do not improve those defects, pause and report the plateau rather
than spending indefinitely. Respect any user-specified cost or run limit and
report all paid attempts. A successful single-subject-set experiment does not
prove reliability for arbitrary subjects.

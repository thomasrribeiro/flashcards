# Computer science flashcard writing guide

This guide supplements the universal card standard and authoring playbook. It
contains reusable computer-science judgment; the subject roadmap chooses the
learner's actual path across software, systems, theory, and applications.

## What competence looks like

Computer-science cards should help the learner:

- explain an abstraction and the problem it solves;
- trace state through code, data structures, protocols, and machines;
- identify and maintain invariants;
- choose an algorithm, representation, or tool from constraints;
- analyze time, space, communication, reliability, and security tradeoffs;
- predict behavior before executing code;
- diagnose a bug, counterexample, race, failure mode, or violated assumption;
- translate among prose, code, pseudocode, diagrams, mathematics, and traces;
- evaluate societal, ethical, privacy, accessibility, and professional effects.

The ACM/IEEE-CS/AAAI CS2023 framework groups competencies broadly into
software, systems, and applications while treating mathematical foundations
and society/ethics as crosscutting. Use it to check curricular blind spots, not
as a requirement to turn every listed topic into a card.

## Code and execution cards

Keep code small enough to simulate mentally. State the language, relevant
version, inputs, and assumptions when they affect behavior. Ask for one target:
output, state change, invariant, complexity, error, missing test, or repair.

Prefer prompts that require prediction before execution. The back should show
the decisive trace or reason, not merely the observed output. Never treat
undefined, unspecified, implementation-defined, racy, or environment-dependent
behavior as one portable answer.

Use syntax clozes sparingly. Memorize an exact command or API only when rapid
recall is useful and the version is recorded. For programming fluency, pair SRS
with writing, running, testing, and debugging real programs.

## Algorithms and data structures

Separate these retrieval targets where useful:

- abstract operation and semantic contract;
- representation and invariant;
- method-selection cue;
- correctness idea or counterexample;
- asymptotic bound with its model and case assumptions;
- concrete trace on a minimal example;
- tradeoff against the nearest alternative.

Do not say that a structure “discards half” unless its invariant actually
guarantees that reduction. Distinguish worst-case, amortized, expected, and
average-case bounds. State the computational model and input assumptions when
they change a claim.

Proof cards should retrieve the invariant, induction measure, exchange
argument, adversary, reduction, or other decisive idea—not a memorized proof
transcript.

## Systems, concurrency, and networks

Model state and transitions explicitly. Identify layer, process/thread, address
space, authority boundary, failure model, consistency assumption, and observer
when relevant. High-value cards ask the learner to:

- predict a state transition or message sequence;
- locate where an invariant can fail;
- distinguish mechanism from policy;
- reason about ordering, atomicity, visibility, durability, and recovery;
- identify a race, deadlock condition, security boundary, or partial failure;
- compare guarantees rather than memorize product slogans.

Avoid a single deterministic answer for schedules or distributed executions
when several interleavings are legal. Ask which outcomes are possible, required,
or forbidden under the stated model.

## Tools and operational knowledge

For Git, shells, editors, operating systems, databases, and similar tools, cue
commands from a realistic goal and current state. The answer should include the
effect, important precondition, and recovery or safety distinction when the
operation can lose work.

Separate conceptual models from volatile flags. Record the tested version for
version-sensitive behavior and verify current documentation during audits.
Avoid cards that merely enumerate options a user could discover with `--help`;
retain commands whose fast recall prevents errors or supports frequent work.

## Security and professional judgment

Security cards must state the threat model, protected asset, trust boundary,
and relevant attacker capability. Do not teach a mitigation as universal when
it addresses only one attack class. Prefer defensive diagnosis and safe,
contained examples; never include live credentials or operational secrets.

Distinguish technical capability from ethical or legal permission. Include
privacy, accessibility, reliability, bias, energy/resource use, and downstream
human consequences where they are part of competent system design.

## Figures and representations

High-value original visuals include:

- memory/object/reference diagrams;
- stack, heap, tree, graph, and automaton states;
- recursion and execution traces;
- Git commit DAGs and branch movement;
- process, thread, scheduling, and synchronization timelines;
- packet, protocol, storage, compiler, and request pipelines;
- architecture and trust-boundary diagrams;
- asymptotic plots with honest axes and domains.

Put the initial state and givens on the front; keep the requested next state,
path, label, or invariant off the front. Use monospace labels, phone-width
legibility, and a non-color cue for every distinction.

## Accuracy and audit checks

- Execute or test code examples in the stated environment when practical.
- Verify language, command, API, and tool behavior against current official
  documentation.
- Check complexity claims and hidden input/model assumptions.
- Distinguish specification guarantees from common implementation behavior.
- Check whether a claimed industry example or default is still current.
- Treat “works on my machine” and one successful run as evidence, not proof.
- Remove obsolete trivia unless the deck explicitly teaches a historical system.

## Practice outside SRS

Use projects, implementation, debugging, code review, proof writing, profiling,
experiments, threat modeling, and unfamiliar problems. Cards maintain mental
models and fragile decisions; they cannot create engineering competence alone.

## Evidence and curriculum references

- ACM/IEEE-CS/AAAI, *Computer Science Curricula 2023*:
  https://csed.acm.org/
- CS2023 knowledge areas:
  https://csed.acm.org/knowledge-areas/
- NIST Computer Security Resource Center for security terminology and guidance:
  https://csrc.nist.gov/

Use official specifications and project documentation to verify individual
technical claims. Record versions and access dates in each deck's source
register.

# Cold-start and pilot workflow

Use this workflow when building a new deck, adding a prerequisite chapter, or
auditing reports that cards assume unseen knowledge.

## 1. Freeze the learner contract

List only prerequisites the learner or maintainer explicitly confirms as
mastered. Separate mathematical or tool prerequisites from domain knowledge.
Everything else is unknown. Do not infer physics knowledge from “calculus-aware”
or biology knowledge from “college-level.”

Resolve `deck.toml` and chapter frontmatter with
`flashcards deck prerequisites <deck> --chapter <number>`. The resulting
transitive closure is the maximum allowed inbound subject knowledge. Do not add
an undeclared earlier chapter to the learner contract during the audit.

## 2. Build the chapter dependency ledger

For every chapter, record:

| Concept, symbol, or representation | Required on which front? | Allowed inbound source or earlier establishment | First supported retrieval | Later application | Status |
|---|---|---|---|---|---|

Include vocabulary in figures, alt text, axes, units, equations, problem
contexts, and solution methods. Mark a dependency `blocked` if it comes from a
later chapter or is merely explained after the learner has already failed it.

## 3. Simulate the learner

Read only the fronts in their intended first-learning order. At each front ask:

1. What must the learner already understand to parse this prompt?
2. What must they know to make a plausible successful attempt?
3. Where was each dependency confirmed or established?
4. Does the prompt test the declared target, or mostly test hidden vocabulary?
5. Would a simpler, already-understood situation test the same target?

Do not inspect the answer until the dependency list for that front is complete.
Then inspect the answer for new terms that later fronts may assume.

## 4. Repair in dependency order

Prefer, in order:

1. replace an example that unnecessarily borrows future knowledge;
2. add minimal explanatory context to make inference possible;
3. add an analyzed example or prerequisite bridge before retrieval;
4. move the card to the chapter where its prerequisites exist;
5. retire the target if it does not justify its review cost.

Do not add a chain of glossary cards merely to preserve an over-advanced prompt.

## 5. Pilot gate

For a new deck, author only the first prerequisite chapter. Write the completed
ledger and front-by-front findings to
`.flashcards/audits/pilot-cold-start.md`. Validate and inspect figures, then stop.
Full-deck generation requires explicit approval recorded through the CLI.

A passing report contains these exact machine-readable lines:

```text
cold_start_status: pass
unresolved_dependencies: 0
```

Do not mark a report passing while any dependency row remains blocked or
unresolved.

For an approved full build, repeat the scan across every chapter boundary and
write `.flashcards/audits/full-cold-start.md` before handoff.

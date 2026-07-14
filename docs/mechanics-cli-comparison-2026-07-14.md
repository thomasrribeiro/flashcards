# Mechanics CLI comparison — 2026-07-14

## Question

How does a fresh mechanics deck produced by the current `flashcards` CLI compare
with the working deck at `/Users/thomasribeiro/notes/physics/mechanics`?

The CLI build was deliberately blind: its agent was told not to inspect the
existing deck. It used the standard context manifest, the physics guide, and a
12-chapter introductory-calculus-aware specification. The comparison used the
current local working tree of the existing deck, including its uncommitted card
and figure improvements.

## Results

| Measure | Fresh CLI deck | Existing mechanics deck |
|---|---:|---:|
| Schedulable cards | 229 | 441 |
| Basic cards | 206 | 263 |
| Cloze cards | 0 | 165 |
| Progressive problems | 23 | 13 |
| Original figure assets | 9 | 46 |
| Median question length | 12 words | 15 words |
| Median non-cloze answer length | 20 words | 28 words |
| 90th-percentile answer length | 32 words | 47 words |
| Answers over 60 words | 3 | 16 |
| Parser/KaTeX/image/identity errors | 0 | 0 |
| Cloze lint findings | 0 | 47 |

The existing deck's 47 findings are all C4 warnings for cloze deletions placed
inside math delimiters. They can yield confusing or spurious retrieval prompts
and should be repaired, but they do not imply that all 165 cloze cards are bad.

## Where the fresh CLI deck is better

- It has a clearer capability model: system and frame selection, model limits,
  representation translation, qualitative prediction, method selection, and
  independent checks recur throughout the chapters.
- It achieves more application with less review burden. Despite having roughly
  half as many cards, it contains 23 worked or faded problems rather than 13.
- Its prompts and answers are more compact and usually target one gradable
  decision. It avoids formula-only clozes and unnecessary fragmentation.
- The synthesis chapter is particularly strong. It discriminates force,
  energy, momentum, angular momentum, orbit, and oscillator methods through
  mixed situations rather than chapter labels.
- Its source register is materially better. It records what each authority was
  used for, reuse terms, access dates, and the decision not to ingest a source
  whose current terms prohibit generative-AI ingestion.
- It passes every current validation gate without warnings.

## Where the existing deck is better

- Its visual curriculum is substantially richer: 46 figures distributed across
  all chapters, compared with 9 figures in the fresh deck.
- It has broader introductory coverage. Examples missing or thinner in the
  fresh deck include significant-figure operations, constant-angular-
  acceleration equations, rotational static equilibrium, the physical
  pendulum, and quantitative one-dimensional elastic-collision cases.
- Several existing chapters provide more intermediate steps and representations
  for a true first encounter. The fresh deck can be too compressed for a learner
  who has not also read the non-schedulable chapter orientation or completed
  external problems.
- It already has stable identities, learner review history, and observed
  difficulty data. Those are durable learning assets that a blind replacement
  would discard or mis-map.
- Its current `CARD_README.md` is more operationally mature in several places,
  especially first-exposure sequencing, identity decisions, use of learner
  telemetry, and the mechanics-specific interference map.

## Honest verdict

The **fresh CLI deck is the better authored SRS deck card-for-card**. Its
retrieval design, concision, transfer emphasis, source discipline, and technical
cleanliness demonstrate that the new CLI and context system work well.

The **existing deck is the better production asset to keep**. Its visual depth,
broader coverage, stable IDs, and learner history outweigh the benefit of a
wholesale replacement. Replacing it with the fresh deck would optimize the
files while damaging continuity for the learner.

The best next step is therefore not to choose one repository wholesale. Use the
fresh deck as an independent audit blueprint and improve the existing deck in
place:

1. repair the 47 math-cloze lint findings;
2. preserve existing stable IDs whenever the retrieval target remains the same;
3. shorten or split the longest and most fragmented existing cards;
4. retain the 46-figure visual curriculum and broader topic coverage;
5. add the strongest missing model-selection, misconception, and faded-problem
   targets from the fresh deck as genuinely new cards;
6. keep the existing mechanics `CARD_README.md` as the base, incorporating only
   the fresh blueprint's stronger source and chapter-contract details.

## Reproducibility

The blind trial deck was created at:

`/tmp/flashcards-mechanics-comparison-20260714/physics/mechanics`

Validation commands:

```sh
flashcards deck validate /tmp/flashcards-mechanics-comparison-20260714/physics/mechanics
flashcards deck validate /Users/thomasribeiro/notes/physics/mechanics
```

The trial is intentionally not wired into the application collection and was
not pushed to a deck repository.

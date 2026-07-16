# Flashcards

An in-browser spaced-repetition system and a standards-driven CLI for building
durable flashcard decks.

**Live app:** https://thomasrribeiro.com/flashcards/

<img src="public/screenshots/gui.png" alt="Flashcard column viewer" width="600">

## Run the application

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

The production build is created with:

```bash
npm run build
```

When signed out, review state remains in browser storage. Signed-in users can
sync supported study state across devices.

## Install the CLI

From this repository:

```bash
npm install
npm link
flashcards doctor
```

The CLI separates deterministic operations from agent judgment:

- scaffolding, stable IDs, parsing, math, metadata, and asset checks are local
  deterministic commands;
- curriculum research, card writing, figures, and semantic audits use Codex and
  the versioned `$manage-flashcard-decks` skill in `.agents/skills/`.

By default every judgment-heavy command starts a fresh, non-resumable Codex
process in a temporary copy of the target. Only the ordered Markdown context
reported by `subject context` or `deck context`, the target chapter, and its
machine-resolved transitive prerequisite closure are staged. Unrelated chapters
are absent from bounded chapter workspaces. Live web research remains
available. A clean patch is applied back after the agent succeeds, and the
prompt, constrained target snapshot, prerequisite-closure hashes, ordered
context and vendored-skill hashes, model, Codex version, result, and patch are
recorded under
`~/.flashcards/runs/`.

The isolated run uses `codex exec --ephemeral --ignore-user-config
--ignore-rules`; it does not resume a prior conversation or persist a new one.
Codex platform instructions and the selected model still come from Codex itself,
while all repository- and learner-specific initial context is explicit and
inspectable. Use `--no-isolated` only when intentionally opting into the legacy
local interactive workspace.

This makes runs input-auditable, not bit-for-bit deterministic: model behavior,
live search results, and upstream web pages can change. The source register and
run manifest make those differences reviewable.

Normal local use relies on `codex login`; the CLI does not request, store, or
forward an API key. API-key authentication is only necessary if you separately
choose to run Codex in unattended automation.

## Create a subject and deck

Subjects and decks use lowercase kebab-case. By default, decks are created at
`~/notes/<subject>/<deck>/`; override this with `--notes-root` or the
`FLASHCARDS_NOTES_ROOT` environment variable.

```bash
flashcards subject create biology

flashcards deck create biology genetics \
  --description "Mechanistic genetics from inheritance to gene regulation" \
  --assumed-tool basic-statistics
```

When a prerequisite deck already exists in the same notes collection, declare
it with a repeatable flag such as
`--prerequisite-deck biology/cell-biology`.

Both commands launch a fresh isolated agent by default. `subject create`
researches and completes `SUBJECT_BRIEF.md` and `ROADMAP.md`; if the repository
does not already provide a reusable `templates/guides/<subject>.md`, it also
creates a subject-owned `DOMAIN_GUIDE.md`. `deck create` then researches the
deck, completes its README and card blueprint, and authors only the first
novice-first pilot chapter. Pass `--no-agent` to either command when only the
deterministic scaffold is wanted.

`deck build` intentionally authors only the first ordered chapter. The agent
may design the full roadmap, but it must complete a concept-dependency ledger
and `.flashcards/audits/pilot-cold-start.md` before stopping for review. This
prevents a syntactically valid full deck from scaling an incorrect learner
model.

After studying or inspecting the pilot:

```bash
flashcards deck approve-pilot ~/notes/biology/genetics
flashcards deck build ~/notes/biology/genetics --full
```

The full build is rejected unless `deck.toml` records explicit pilot approval.
It must produce `.flashcards/audits/full-cold-start.md` before the CLI marks the
deck built.

Create only the deterministic scaffold:

```bash
flashcards deck create biology genetics --no-agent
```

Create initial ordered chapters when the curriculum is already known:

```bash
flashcards deck create computer-science operating-systems \
  --chapter foundations \
  --chapter processes-and-threads \
  --chapter virtual-memory
```

Each deck is initialized as its own Git repository on `master` unless
`--no-git` is supplied. The scaffold includes:

```text
deck-name/
├── .flashcards/audits/
├── figures/
├── flashcards/
├── references/              # local source material; contents gitignored
├── AGENTS.md
├── CARD_README.md
├── README.md
└── deck.toml
```

The subject directory also receives `AGENTS.md`, `ROADMAP.md`, and
`SUBJECT_BRIEF.md` when they are missing. Existing files are never
overwritten.

## Maintain a deck

```bash
# Add a chapter with explicit edges and a concept it establishes
flashcards deck add-chapter ~/notes/biology/genetics gene-regulation \
  --prerequisite chapter:02_molecular_inheritance \
  --provides gene-regulation

# Inspect the graph or one chapter's transitive closure
flashcards deck prerequisites ~/notes/biology/genetics
flashcards deck prerequisites ~/notes/biology/genetics --chapter 3

# Upgrade schema-v1 metadata while preserving its effective closure
flashcards deck migrate-prerequisites ~/notes/biology/genetics

# Add stable IDs before revising studied legacy cards
flashcards deck stabilize ~/notes/biology/genetics

# Validate IDs, parser output, frontmatter, KaTeX, clozes, and image paths
flashcards deck validate ~/notes/biology/genetics

# Compile editable TikZ sources under figures/ to portable SVG assets
flashcards deck render-figures ~/notes/physics/mechanics

# Verify committed SVG assets exactly match their TikZ sources
flashcards deck render-figures ~/notes/physics/mechanics --check

# Save the complete machine-readable inventory
flashcards deck validate ~/notes/biology/genetics \
  --out ~/notes/biology/genetics/.flashcards/validation.json
```

TikZ is the default authoring path for new generated technical diagrams, not a
browser dependency. A source such as
`figures/02_vectors/components_grid.tex` compiles to the same-named `.svg`
using LuaLaTeX and `dvisvgm`; the app continues loading ordinary SVG files
without runtime compilation. Each source must declare `flashcards-title` and
`flashcards-desc` comments, which the renderer copies into accessible SVG
metadata. `deck validate` rejects stale generated figures. Install TeX Live
with LuaLaTeX, TikZ, the standalone class, and `dvisvgm` on authoring
machines that maintain decks with technical figures. Use another medium only
when the authentic visual target requires it and document that exception in the
deck's figure ledger.

## Build and audit with Codex

Fresh isolated runs are the default so the same declared inputs can be audited
and reproduced without hidden conversation history.

```bash
flashcards deck build ~/notes/biology/genetics
flashcards deck audit ~/notes/physics/mechanics
```

To compare a genuinely fresh pilot design against an existing chapter without
letting the agent paraphrase the old cards, blank chapter 1 only inside the
temporary sandbox:

```bash
flashcards deck build ~/notes/physics/mechanics --fresh-pilot
```

The original deck snapshot remains hashed in the run record. The resulting
chapter replaces the prior pilot and therefore receives new stable identities;
use this only when intentionally resetting that chapter's review history.

After approving the pilot, build or freshly regenerate one later chapter in a
bounded isolated run:

```bash
flashcards deck approve-pilot ~/notes/physics/mechanics
flashcards deck build ~/notes/physics/mechanics --chapter 2
flashcards deck build ~/notes/physics/mechanics --chapter 2 --fresh-chapter
```

A schema-v2 chapter build may read only scheduled cards in its resolved local
prerequisite closure, plus external decks and tools declared in `deck.toml`.
Earlier order alone does not grant access. Its patch is restricted to the
selected chapter, figures, chapter-boundary audit, and deck README/blueprint;
unrelated chapters are absent from the sandbox. Schema-v1 decks remain
compatible by inferring the former behavior—all earlier ordered chapters—until
they are migrated. Fresh regeneration gives the selected chapter new review
identities and should be used only after preserving any comparison baseline.

New builds follow a novice-first pilot lifecycle:

1. unconfirmed domain knowledge is treated as unseen;
2. the agent authors only the first chapter;
3. every front dependency is mapped to confirmed inbound knowledge or an
   earlier establishment point;
4. `deck approve-pilot` records the maintainer's explicit decision;
5. only then can `deck build --full` author later chapters.

Target-level labels such as “introductory-college” or “calculus-aware” do not
silently grant subject prerequisites. The pilot audit includes words, symbols,
figures, alt text, diagram conventions, and problem contexts—not only formulas.

Inspect the exact ordered Markdown context before launching an agent:

```bash
flashcards subject context ~/notes/biology
flashcards deck context ~/notes/biology/genetics --mode build
flashcards deck context ~/notes/biology/genetics --mode build --chapter 3
flashcards deck context ~/notes/physics/mechanics --mode audit --json
flashcards deck build ~/notes/biology/genetics --dry-run
```

The context commands report every declared Markdown file, its role and word
count, optional missing files, the resolved prerequisite graph, and the total
context. `--dry-run` also prints the prompt and resolved model without launching
an agent. Live runs additionally hash every accessible target, prerequisite,
and vendored skill file in the provenance record, so local inputs are visible
instead of implicit.

Before any editing agent starts, the CLI gives existing card blocks stable IDs
so later wording, figure, and correctness improvements cannot silently discard
their schedules.

`deck audit` writes a preflight inventory, loads the universal and
domain-specific standards, and asks Codex to audit and improve the entire deck
chapter by chapter. It validates again after Codex returns. Codex is explicitly
told not to commit or push.

Useful variants:

```bash
# Inspect without editing
flashcards deck audit ~/notes/physics/mechanics --report-only

# Opt into the legacy local interactive workspace
flashcards deck audit ~/notes/physics/mechanics --no-isolated

# Inspect the exact invocation and prompt
flashcards deck audit ~/notes/physics/mechanics --dry-run

# Add a temporary objective without changing durable standards
flashcards deck audit ~/notes/physics/mechanics \
  --instructions "Prioritize prerequisite gaps and graph interpretation"

# Explicitly proceed when the deck already has unrelated local changes
flashcards deck audit ~/notes/physics/mechanics --allow-dirty
```

The CLI does not pin a model in source. An isolated run resolves the model from
`--model`, then `FLASHCARDS_CODEX_MODEL`, then the current Codex configuration,
and records the resolved value in its run manifest. This permits future audits
to benefit from stronger models while preserving the inputs of each past run.
Use `--model` when exact cross-machine reproduction matters.

## Stable card identity

Every new card block should carry a repository-scoped stable ID:

```markdown
<!-- card-id: card-018f6c2a-7b1e-7000-8000-123456789abc -->
Q: Which forces act on a block resting on a level table?
A: Its weight and the table's normal force.
```

Preserve the ID for corrections, clearer wording, formatting, accessibility,
or figures when the retrieval target remains the same. Assign a new ID when the
learner must retrieve materially different knowledge. Keep generated
`card-alias` comments so devices can migrate legacy content-hash schedules.

## Card format

Canonical files use TOML frontmatter and ordered `NN_snake_case.md` filenames:

```markdown
+++
order = 1
subject = "physics"
tags = ["mechanics"]
prerequisites = []
provides = ["one-dimensional-coordinate"]
+++

<!-- card-id: card-... -->
Q: Why can acceleration be nonzero while speed is constant?
A: Acceleration measures change in the velocity vector, including direction.

<!-- card-id: card-... -->
C: The slope of a position-time graph is [velocity].

<!-- card-id: card-... -->
P: A symbolic problem statement with all required givens.
S: A transferable solution method with a genuine evaluation step.
```

Deck-wide edges and confirmed tools live in `deck.toml`:

```toml
[prerequisites]
decks = ["mathematics/algebra", "mathematics/trigonometry"]
assumed_tools = ["introductory-calculus"]
```

Chapter references support `chapter:NN_name`, `concept:kebab-name`,
`deck:subject/deck`, and `tool:kebab-name`. A concept must have exactly one
earlier local provider. Validation rejects missing or ambiguous references,
later-chapter edges, undeclared external dependencies/tools, and cycles.

Read these sources of truth before authoring manually:

- `templates/guides/CARD_STANDARD.md`
- `templates/guides/AUTHORING_PLAYBOOK.md`
- the applicable subject guide in `templates/guides/`

The context hierarchy deliberately avoids repetition:

| Document | Responsibility |
|---|---|
| `CARD_STANDARD.md` | Normative card, deck, parser, and identity acceptance rules |
| `AUTHORING_PLAYBOOK.md` | Universal curriculum, learning, source, figure, and audit decisions |
| `templates/guides/<subject>.md` | Reusable domain-specific judgment |
| subject `DOMAIN_GUIDE.md` | AI-researched domain guide only when no reusable repository guide exists |
| subject `SUBJECT_BRIEF.md` | Learner, depth, conventions, and evidence authorities |
| subject `ROADMAP.md` | Deck sequence, prerequisites, and durable outcomes |
| deck `deck.toml` | Machine-readable identity, external deck prerequisites, and assumed tools |
| deck `README.md` | Scope, chapter map, and source register |
| deck `CARD_README.md` | Deck-specific retrieval design and justified exceptions |
| chapter frontmatter | Machine-readable chapter edges and provided concepts |

## Development checks

```bash
npm test
npm run build
git diff --check
```

## Prior work

- [hashcards](https://github.com/eudoxia0/hashcards) inspired the plain-text
  card format.

## License

© 2025 Thomas Ribeiro. Licensed under the [Apache License 2.0](LICENSE).

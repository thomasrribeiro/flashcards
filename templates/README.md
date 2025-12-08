# {SUBJECT_NAME} - Flashcards

Spaced repetition flashcards for **{SUBJECT_NAME}** compatible with the [flashcards app](https://github.com/thomasrribeiro/flashcards).

## 📁 Structure

```
.
├── flashcards/          # Markdown flashcard files
│   └── example.md
├── sources/             # Parsed references
│   └── example/
│       ├── content.json # Document content
│       └── images/      # Extracted figures
├── references/
│   └── example.pdf
└── README.md
```

## 🚀 Quick Start: Generate Flashcards from PDFs

### Step 1: Set Up Authentication

```bash
flashcards auth
```

### Step 2: Add Your Reference

```bash
cp /path/to/example.pdf references/
```

### Step 3: Process reference → Structured Content

```bash
flashcards process references/example.pdf
```

This extracts text and figures into `sources/example/`:
- `content.json` — parsed document structure
- `images/` — extracted figures

### Step 4: Generate Flashcards

```bash
flashcards generate sources/example
```

Options:
```bash
--template <subject>    # Use subject-specific writing guide (physics, chemistry, etc.)
--prereqs <file.md>     # Reference prior flashcards for continuity
--order <number>        # Set order in TOML frontmatter
--tags <tag1> <tag2>    # Add topic tags
```

## 📋 CLI Reference

| Command | Description |
|---------|-------------|
| `flashcards auth` | Set up authentication |
| `flashcards process <pdf> --output <name>` | Extract PDF content to sources/ |
| `flashcards generate <source> --output <name>` | Generate flashcards from source |
| `flashcards show-prompt <file>` | Reconstruct generation prompt |
| `flashcards create <name>` | Create a new deck |

## 🎯 Using These Flashcards

1. **Clone** this repository or add it as a deck in the flashcards app
2. **Study** using the [flashcards app](https://github.com/thomasrribeiro/flashcards)
3. **Review** regularly using the FSRS spaced repetition algorithm

### Adding as a Deck

In the flashcards app, add this repository URL as a GitHub deck, or clone locally and add as a local collection.

## ✍️ Contributing

Contributions welcome! Follow these guidelines:

### Flashcard Quality Guidelines
- **One concept per card** (atomicity)
- **Use appropriate format**:
  - `C:` for cloze deletions (facts, formulas)
  - `Q:/A:` for questions and answers (concepts, "why" questions)
  - `P:/S:` for problems with step-by-step solutions (IPEE framework)
- **Self-contained cards**: Each card should make sense on its own
- **Define variables**: Every formula must define its symbols

See the [general writing guide](https://github.com/thomasrribeiro/flashcards/blob/master/templates/guides/general.md) for comprehensive principles.

## 📂 Figure References

Figures are stored in `sources/<name>/images/` and referenced from flashcards using relative paths:

```markdown
Q: What does this diagram show?

![Diagram description](../sources/example/images/abc123.jpg)

A: [Description of what the diagram illustrates]
```

Since flashcard files are in `flashcards/`, use `../sources/` to navigate up one directory.

## 🔗 Related Repositories

- **Flashcards App**: [thomasrribeiro/flashcards](https://github.com/thomasrribeiro/flashcards)
- **Organization**: [thomasrribeiro-flashcards](https://github.com/thomasrribeiro-flashcards)

## 📄 License

Educational materials for personal use. Reference materials in `references/` are subject to their original copyright.

---

**Created**: {DATE}
**Structure**: Follows [flashcards project](https://github.com/thomasrribeiro/flashcards) conventions

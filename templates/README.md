# {SUBJECT_NAME} - Flashcards

Spaced repetition flashcards for **{SUBJECT_NAME}** compatible with the [flashcards app](https://github.com/thomasrribeiro/flashcards).

## 📁 Structure

```
.
├── flashcards/          # Markdown flashcard files (Q:/A:, C:, P:/S: formats)
├── sources/             # Parsed document content for LLM generation (tracked in git)
│   └── chapter_name/
│       ├── content.json # Document content
│       └── images/      # Extracted figures
├── references/          # Source PDFs and textbooks (gitignored)
└── README.md            # This file
```

## 🎯 Using These Flashcards

1. **Clone** this repository or add it as a deck in the flashcards app
2. **Study** using the [flashcards app](https://github.com/thomasrribeiro/flashcards)
3. **Review** regularly using the FSRS spaced repetition algorithm

### Adding as a Deck

```bash
# In the flashcards app, add this repository as a GitHub deck
# Or clone locally and add as a local collection
```

## ✍️ Contributing

Contributions welcome! Follow these guidelines:

### Quick Start
1. Fork this repository
2. Create flashcards following the [universal SRS principles](https://github.com/thomasrribeiro/flashcards/blob/main/templates/guides/general.md)
3. Submit a pull request

### Flashcard Quality Guidelines
- **One concept per card** (atomicity)
- **Use appropriate format**:
  - `C:` for cloze deletions
  - `Q:/A:` for questions and answers
  - `P:/S:` for problems with step-by-step solutions (ISAE framework)
- **Self-contained cards**: Each card should make sense on its own
- **Include context**: Don't assume prior card knowledge

See the [flashcards repository](https://github.com/thomasrribeiro/flashcards) for universal SRS principles.

## 📚 Reference Materials

Source materials are stored in `references/` (gitignored for copyright reasons).

### Expected Materials
- [List textbooks or resources for this subject]

### Adding References
```bash
# Add your textbooks to references/
cp /path/to/textbook.pdf references/
```

## 📂 Figure References

Figures are stored in `sources/<chapter>/images/` and referenced from flashcards using relative paths:

```markdown
Q: What does this diagram show?

![Description](../sources/chapter_name/images/figure.jpg)

A: [Answer]
```

Since flashcard files are in `flashcards/`, use `../sources/` to navigate up one directory.

**Note:** Figures are extracted automatically when processing PDFs.
Run `flashcards process` to parse PDFs, then `flashcards generate` to create flashcards.

## 📖 Writing Guidelines

Flashcard writing guides are fetched automatically from the main [flashcards repository](https://github.com/thomasrribeiro/flashcards) when generating cards:

- **Universal SRS principles**: [general.md](https://github.com/thomasrribeiro/flashcards/blob/main/templates/guides/general.md)
- **Subject-specific guides**: Use `--template <subject>` (e.g., `--template physics`) when running `flashcards generate`

## 🔗 Related Repositories

- **Flashcards App**: [thomasrribeiro/flashcards](https://github.com/thomasrribeiro/flashcards)
- **Organization**: [thomasrribeiro-flashcards](https://github.com/thomasrribeiro-flashcards)

## 📄 License

Educational materials for personal use. Reference materials in `references/` are subject to their original copyright.

---

**Created**: {DATE}
**Structure**: Follows [flashcards project](https://github.com/thomasrribeiro/flashcards) conventions

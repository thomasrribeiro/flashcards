# {SUBJECT_NAME} - Flashcards

Spaced repetition flashcards for **{SUBJECT_NAME}** compatible with the [flashcards app](https://github.com/thomasrribeiro/flashcards).

## 📁 Structure

```
.
├── flashcards/          # Markdown flashcard files (Q:/A:, C:, P:/S: formats)
├── references/          # Source PDFs and textbooks (gitignored)
├── figures/             # Extracted diagrams and images (organized by flashcard filename)
├── CLAUDE.md            # Flashcard writing guide for this subject
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
2. Create flashcards following the format in [CLAUDE.md](CLAUDE.md)
3. Submit a pull request

### Flashcard Quality Guidelines
- **One concept per card** (atomicity)
- **Use appropriate format**:
  - `C:` for cloze deletions
  - `Q:/A:` for questions and answers
  - `P:/S:` for problems with step-by-step solutions (ISEE framework)
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

### Extracting Figures
```bash
# Use the extraction script from the flashcards repository
python3 /path/to/flashcards/scripts/extract_figures_from_pdf.py \
  --pdf references/textbook.pdf \
  --output figures/topic_name/
```

## 📂 Figure Organization

Figures are organized by flashcard filename for easy reference:

```
figures/
├── 01_topic_name/
│   ├── diagram_1.png
│   └── diagram_2.png
└── 02_another_topic/
    └── chart.png
```

In flashcards, reference figures using relative paths:
```markdown
Q: What does this diagram show?

![Description](../figures/01_topic_name/diagram_1.png)

A: [Answer]
```

## 📖 Writing Guidelines

For detailed flashcard writing guidelines specific to this subject, see [CLAUDE.md](CLAUDE.md).

For general spaced repetition principles and card formats, see [CLAUDE.md](CLAUDE.md) in this repository.

## 🔗 Related Repositories

- **Flashcards App**: [thomasrribeiro/flashcards](https://github.com/thomasrribeiro/flashcards)
- **Organization**: [thomasrribeiro-flashcards](https://github.com/thomasrribeiro-flashcards)

## 📄 License

Educational materials for personal use. Reference materials in `references/` are subject to their original copyright.

---

**Created**: {DATE}
**Structure**: Follows [flashcards project](https://github.com/thomasrribeiro/flashcards) conventions

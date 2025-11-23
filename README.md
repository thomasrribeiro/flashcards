# Flashcards

An in-browser spaced-repetition system for learning anything.

**Live Demo:** https://thomasrribeiro.com/flashcards/

<img src="public/screenshots/gui.png" alt="Flashcard interface" width="400">

*Master what's important to you and outsmart the forgetting curve.*

## Getting started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

**1. Install dependencies:**
```bash
npm install
```

**2. Link CLI globally (optional):**
```bash
npm link
```

**3. Build the collection index:**
```bash
npm run process-submodules
```

This scans `public/collection/` and generates an index of all markdown files.

**4. Run the app:**
```bash
npm run dev
```

Open your browser to the URL shown in the terminal.

**Note:** Whenever you add, remove, or move markdown files in `public/collection/`, run `npm run process-submodules` to update the card index.

### Creating Decks

Use the CLI to create a new deck with the proper structure:

```bash
# Create a deck (default: public/collection/<name>)
flashcards create intro-biology

# Create with subject template for specialized guidance
flashcards create quantum-mechanics --template physics
flashcards create organic-chem --template chemistry

# Create at custom path
flashcards create world-history --path ~/Documents/flashcards/world-history
```

**Available templates:**
- `physics` - For physics topics (mechanics, E&M, quantum, etc.)
- More templates coming soon (chemistry, biology, math, etc.)

This creates:
- `flashcards/` - Your markdown files containing cards
- `references/` - Reference materials such as PDFs
- `figures/` - Relevant images
- `CLAUDE.md` - Writing guidelines for creating effective flashcards
- `README.md` - Documentation template

### Creating flashcards

#### Card format
Flashcards are written in markdown files using Q:/A:, C:, or P:/S: formats.

**Question/Answer Cards:**
```markdown
Q: What is the capital of France?
A: Paris.

Q: Who wrote "1984"?
A: George Orwell (published 1949).
```

**Cloze Deletion Cards:**
```markdown
C: The [mitochondria] is called the powerhouse of the cell.

C: Shakespeare wrote [Hamlet], [Macbeth], and [Romeo and Juliet].
```

**Problem/Solution Cards (methodology-focused):**

Use for teaching systematic problem-solving approaches. Adapt the framework to your subject:

```markdown
# STEM example (ISAE framework):
P: How do you determine if a function f(x) is continuous at point x = a?

S:
**IDENTIFY**: Continuity definition problem
**SET UP**: Need three conditions satisfied
**APPROACH**:
  1. Check f(a) exists (function defined at a)
  2. Check limit exists as x → a
  3. Check limit equals f(a)
**EVALUATE**: All three must hold; if any fails, discontinuous at a

# Humanities example:
P: How do you analyze the causes of a historical event?

S:
**CONTEXT**: Identify time period, key actors, immediate circumstances
**FACTORS**: Categorize causes (political, economic, social, cultural)
**CONNECTIONS**: How factors interrelated and influenced each other
**CONCLUSION**: Multiple interconnected causes, distinguish triggers vs. conditions
```

**Supported Features:**
- **Multiline content** - Questions and answers can span multiple lines
- **LaTeX math** - Use `$inline math$` or `$$display math$$` for equations
- **Images** - Embed with `![alt text](image-url)`
- **Audio** - Embed with `![audio](audio-file.mp3)`

#### File Structure (Local Development)

```
public/collection/
├── biology-basics/
│   ├── flashcards/
│   │   ├── cell-biology.md
│   │   └── genetics.md
│   ├── figures/
│   ├── references/
│   └── CLAUDE.md
└── us-history/
    └── flashcards/
        └── civil-war.md
```

Each directory in `public/collection/` becomes a separate deck.

### ⚠️ Important

When running locally without GitHub authentication, your review progress is stored in **localStorage only**. This means:

- Progress is saved locally in your browser
- Your FSRS scheduler state will be lost if you clear browser data
- No cross-device sync

---

## Community Contributions

### Before Creating Your Flashcard Deck

Visit [thomasrribeiro-flashcards](https://github.com/thomasrribeiro-flashcards) organization to see if a deck for your subject already exists.

##### Deck Already Exists → Contribute! 🤝

- **Fork** the repository
- **Add** your flashcards following the existing structure
- **Submit a pull request** to contribute your cards
- Help build a comprehensive community resource!

##### Deck Doesn't Exist → Create It! 🚀

- **Share with community?** → Create public deck in organization
- **Personal/private study?** → Create private GitHub repository

---

### Guidelines

**Quality standards:**
1. Follow template/CLAUDE.md in the repository for subject-specific best practices
2. One concept per card, self-contained with context
3. Use proper format: Q:/A: (facts), C: (definitions), P:/S: (methodology)
4. Test cards before committing

**For public contributions:** Submit quality PRs, respect conventions, accept feedback.

---

## Prior Work
- [hashcards](https://github.com/eudoxia0/hashcards?tab=readme-ov-file) - Inspiration for the card format

## License
© 2025 by [Thomas Ribeiro](https://thomasrribeiro.com). Licensed under the [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.

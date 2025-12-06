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

#### AI-Assisted Flashcard Generation ✨

Generate flashcards automatically from PDF textbooks using Claude AI.

**Setup:**
1. Install a PDF processor (using uv for Python dependency management):
   ```bash
   uv venv
   source .venv/bin/activate
   uv pip install magic-pdf
   ```
2. Optionally set up authentication: `flashcards auth`

**Workflow:**
```bash
# Create a deck
flashcards create intro-physics --template physics
cd intro-physics

# Process PDF and generate flashcards
flashcards process references/textbook.pdf --output chapter1
flashcards generate sources/chapter1 --output chapter1

# Review and refine
nano flashcards/chapter1.md

# Study!
cd .. && npm run dev
```

**Commands:**
```bash
# Process PDF (creates sources/<name>/ directory)
flashcards process <pdf-path> [options]
  --output <name>    Output name for the source (default: derived from PDF)
  --deck <path>      Deck path (auto-detect from cwd)
  --keep-temp        Keep temporary processing output

# Generate flashcards from processed source
flashcards generate <source-dir> [options]
  --output <name>    Output filename (default: derived from input)
  --model <model>    Claude model (default: claude-sonnet-4-5-20250514)
  --template <name>  Subject-specific guide (e.g., physics, chemistry)
  --order <number>   Order number for TOML frontmatter
  --tags <tags...>   Tags for TOML frontmatter
  --verbose          Show detailed progress

# Reconstruct the prompt used to generate flashcards
flashcards show-prompt <flashcard-file>
  --output <file>    Write prompt to file instead of stdout
```

**Tips:**
- ✅ Generated flashcards need human review (AI isn't perfect!)
- ✅ Subject guides (physics, chemistry) improve generation quality
- ✅ Images are referenced from `sources/<name>/images/` directly
- ✅ Generation metadata is stored in TOML frontmatter for reproducibility
- ✅ Use `flashcards show-prompt` to see exactly what prompt was used

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
│   ├── sources/                    # Parsed document content (tracked in git)
│   │   └── chapter1/
│   │       ├── content.json        # Document content
│   │       └── images/             # Extracted figures
│   ├── references/                 # Original PDFs (gitignored)
│   └── README.md
└── us-history/
    └── flashcards/
        └── civil-war.md
```

Each directory in `public/collection/` becomes a separate deck.

**Key directories:**
- `flashcards/` - Generated markdown flashcard files
- `sources/` - Parsed document content (content.json + images/)
- `references/` - Original PDFs (gitignored, keep local)

**Note:** Flashcard writing guides are fetched automatically from this repo when generating cards.

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

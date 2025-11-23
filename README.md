# Flashcards

An in-browser spaced-repetition system.

**Live Demo:** https://thomasrribeiro.com/flashcards/ 

<img src="public/screenshots/gui.png" alt="Flashcard interface" width="400">

*Review what's important and outsmart the forgetting curve.*

## Getting started

### Prerequisites

- Node.js (v14 or higher)
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

**3. Run the app:**
```bash
npm run dev
```

Open your browser to the URL shown in the terminal.

### Creating Decks

Use the CLI to create a new deck with the proper structure:

```bash
# Create a deck (default: public/collection/<name>)
flashcards create intro-mechanics

# Create with subject template
flashcards create intro-mechanics --template physics

# Create at custom path
flashcards create intro-mechanics --path ~/Documents/flashcards/intro-mechanics
```

This creates:
- `flashcards/` - Your markdown files
- `references/` - Place to store reference materials as PDFs
- `figures/` - Place to store relevant images for use in flashcards
- `CLAUDE.md` - Writing guidelines for Claude
- `README.md` - Default template

### Creating flashcards

#### Card format
Flashcards are written in markdown files using Q:/A:, C:, or P:/S: formats.

**Question/Answer Cards:**
```markdown
Q: What is the capital of Italy?
A: Rome.
```

**Cloze Deletion Cards:**
```markdown
C: [Rome] is the capital of Italy.
```

**Problem/Solution Cards (methodology-focused, no numerical values):**
```markdown
P: A car accelerates uniformly from rest to final velocity v in time t. How do you find the distance traveled?

S:
**IDENTIFY**: Constant acceleration kinematics problem
**SET UP**: Known: v₀, v, t. Unknown: Δx
**APPROACH**: Need acceleration first, then use kinematic equation for displacement
**EXECUTE**:
  1. Find acceleration: a = (v - v₀)/t
  2. Apply displacement equation: Δx = v₀t + ½at²
  3. Result: Δx = v₀t + ½((v - v₀)/t)t²
**EVALUATE**: Check units (distance), sign (direction), limiting cases (if v₀=0, reduces correctly)
```

**Supported Features:**
- **Multiline content** - Questions and answers can span multiple lines
- **LaTeX math** - Use `$inline math$` or `$$display math$$` for equations
- **Images** - Embed with `![alt text](image-url)`
- **Audio** - Embed with `![audio](audio-file.mp3)`

#### File Structure

```
public/collection/
├── intro-mechanics/
│   ├── flashcards/
│   │   ├── topic1.md
│   │   └── topic2.md
│   ├── figures/
│   ├── references/
│   └── CLAUDE.md
└── another-deck/
    └── flashcards/
        └── cards.md
```

Each directory in `public/collection/` becomes a separate deck.

### ⚠️ Important

When running locally without GitHub authentication, your review progress is stored in **localStorage only**. This means:

- Progress is saved locally in your browser
- Your Free Spaced Repitition Scheduler (FSRS) will be lost if you clear browser data
- No cross-device sync

## Prior Work
- [hashcards](https://github.com/eudoxia0/hashcards?tab=readme-ov-file)

## License
© 2025 by [Thomas Ribeiro](https://thomasrribeiro.com). Licensed under the [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
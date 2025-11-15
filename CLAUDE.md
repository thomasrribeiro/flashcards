# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based spaced repetition flashcard system that parses markdown files in the hashcards Q:/A:/C: format and uses the FSRS algorithm for scheduling. The system is designed to be offline-first with optional cloud sync via a separate Cloudflare Worker.

## Essential Commands

```bash
# Development
npm install                # Install dependencies
npm run dev               # Start dev server on localhost:3000

# Build
npm run process-submodules # Generate card index from topics/ markdown files
npm run build             # Production build (runs vite build + process-submodules)
npm run preview           # Preview production build

# Adding flashcard content
git submodule add <repo-url> topics/<topic-name>  # Add topic as git submodule
git submodule update --init --recursive           # Initialize submodules after clone
```

## Architecture

### Core Processing Pipeline

1. **Markdown Files** (`topics/**/*.md`) → **Parser** (`src/parser.js`) → **Card Objects**
   - Parser implements exact hashcards format (Q:/A:/C:) with state machine
   - Supports TOML frontmatter for custom deck names
   - Handles cloze deletions with square brackets, excluding image syntax `![]()`

2. **Card Objects** → **Hasher** (`src/hasher.js`) → **Content-Addressable Cards**
   - BLAKE3 hashing makes cards content-addressable
   - Identical cards across files are deduplicated
   - Family hash groups cloze cards from same text

3. **Build Script** (`scripts/build.js`) → **Card Index** (`public/data/cards.json`)
   - Scans `topics/` directory recursively for `.md` files
   - Generates JSON index loaded by frontend
   - Must run after adding/updating markdown files

### Frontend Architecture

**Entry Points:**
- `index.html` + `src/main.js`: Topic listing page
- `app.html` + `src/app.js`: Study session interface

**Data Flow:**
1. `src/loader.js` fetches card index and markdown files
2. Cards parsed and hashed, then stored in IndexedDB (`src/storage.js`)
3. FSRS state tracked per card using ts-fsrs (`src/fsrs-client.js`)
4. Markdown rendered with KaTeX support (`src/markdown.js`)

### Storage Layers

1. **IndexedDB** (offline-first):
   - `cards` store: Card content and metadata
   - `reviews` store: FSRS scheduling state
   - `sessions` store: Review history

2. **Cloudflare Worker** (optional sync):
   - Separate repository: `/Users/thomasribeiro/code/my-flashcards-worker`
   - Connected via `VITE_WORKER_URL` environment variable
   - Handles authentication (magic links) and KV storage

## Card Format Specifications

The parser (`src/parser.js`) implements the exact hashcards format:

```markdown
Q: Question text (can be multiline)
A: Answer text (can be multiline)

C: Text with [cloze deletion] and [another deletion]

---  # Optional separator between cards
```

Special handling:
- Image syntax `![](path)` is NOT treated as cloze deletion
- LaTeX: `$inline$` and `$$display$$` rendered with KaTeX
- TOML frontmatter can override deck name
- Cards separated by blank lines or explicit `---`

## Key Implementation Details

### Parser State Machine
- States: `INITIAL`, `READING_QUESTION`, `READING_ANSWER`, `READING_CLOZE`
- Enforces valid transitions (Q→A, not Q→Q or A→Q)
- Errors on invalid sequences (question without answer, etc.)

### Cloze Processing
- Each `[deletion]` creates a separate card
- Byte-level position tracking for accurate text reconstruction
- Image brackets `![]()` explicitly excluded from cloze detection

### FSRS Integration
- Uses ts-fsrs with default optimal parameters
- Four grades: Again (1), Hard (2), Good (3), Easy (4)
- Cards due when `card.due <= now`
- New cards have `state === State.New`

### Build Process
1. Vite builds frontend assets to `dist/`
2. Build script scans `topics/` and creates `public/data/cards.json`
3. Frontend loads index and fetches markdown files on demand

## Development Workflow

When modifying card parsing:
1. Update `src/parser.js` following the state machine pattern
2. Update `src/hasher.js` if hash calculation changes
3. Run `npm run process-submodules` to regenerate index
4. Test with `npm run dev`

When adding new topics:
1. Add as git submodule: `git submodule add <url> topics/<name>`
2. Run `npm run process-submodules`
3. Cards appear in topic listing

When deploying:
1. Build: `npm run build`
2. Deploy `dist/` to GitHub Pages
3. Worker (if used) deployed separately via `wrangler deploy`

## Related Repositories

- **hashcards**: Original Rust implementation this parser replicates
- **ts-fsrs**: FSRS algorithm implementation
- **my-flashcards-worker**: Separate worker repository for auth/sync
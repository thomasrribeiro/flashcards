# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based spaced repetition flashcard system using the FSRS algorithm. The system parses markdown files in the hashcards Q:/A:/C: format and is designed to work with GitHub repositories as deck sources. All data is currently ephemeral (in-memory only) and will be migrated to Cloudflare D1 for persistence.

## Essential Commands

```bash
# Development
npm install                # Install dependencies
npm run dev               # Start dev server on localhost:3000

# Build
npm run build             # Production build (vite build + process-submodules)
npm run preview           # Preview production build
npm run process-submodules # Generate card index from topics/ markdown files

# Adding flashcard content (local files)
# Place markdown files in topics/ directory
# Build script will scan and index them

# Worker deployment (separate repository)
cd /Users/thomasribeiro/code/flashcards-worker
npx wrangler deploy       # Deploy OAuth worker
```

## Architecture Overview

### Data Flow: Markdown → Cards → Storage → FSRS

```
GitHub Repo → Parser → Cards (w/ BLAKE3 hash) → In-Memory Storage → FSRS Review
```

**Key principle:** Each GitHub repository = one deck containing all cards from all markdown files in that repo.

### Core Components

**1. Parser Pipeline** ([src/parser.js](src/parser.js))
- Implements exact hashcards format with state machine
- States: INITIAL → READING_QUESTION → READING_ANSWER → READING_CLOZE
- Enforces valid transitions (Q→A, not Q→Q or A→Q)
- Supports TOML frontmatter for metadata (`name`, `subject`, `topic`, `order`, `tags`)
- Cloze deletions: `[text]` (excludes image syntax `![]()`)
- Cards separated by blank lines or `---`

**2. Content-Addressable Hashing** ([src/hasher.js](src/hasher.js))
- BLAKE3 hashing makes cards content-addressable
- Identical cards across files/repos are deduplicated by hash
- Family hash groups cloze cards from same text
- Hash algorithm matches hashcards Rust implementation

**3. Storage Architecture** ([src/storage.js](src/storage.js))
- **Current:** Purely in-memory (ephemeral, lost on refresh)
  - `cardsCache`: All cards loaded from repos
  - `reposCache`: Repository/deck metadata
  - `reviewsCache`: FSRS review state per card hash
- **Future:** Will be replaced with Cloudflare D1
- **No localStorage, no IndexedDB, no KV** - all removed

**4. Deck Management** ([src/repo-manager.js](src/repo-manager.js))
- Loads GitHub repos via unauthenticated API (60 req/hour)
- One deck per repo (deck ID = `owner/repo`)
- Multiple markdown files in repo → single deck
- Aggregates metadata from first file with frontmatter

**5. FSRS Integration** ([src/fsrs-client.js](src/fsrs-client.js))
- Uses ts-fsrs with default optimal parameters
- Four grades: Again (1), Hard (2), Good (3), Easy (4)
- Cards due when `card.due <= now`
- New cards have `state === State.New`

### Entry Points

- `index.html` + `src/main.js`: Deck listing and management
- `app.html` + `src/app.js`: Study session interface

### Card Format Specifications

```markdown
Q: Question text (can be multiline)
A: Answer text (can be multiline)

C: Text with [cloze deletion] and [another deletion]

---  # Optional separator
```

**Special handling:**
- Image syntax `![](path)` is NOT treated as cloze deletion
- LaTeX: `$inline$` and `$$display$$` rendered with KaTeX
- Each `[deletion]` in cloze card creates a separate card
- Byte-level position tracking for text reconstruction

## GitHub OAuth & Worker

**Worker Location:** `/Users/thomasribeiro/code/flashcards-worker`

**Minimal Worker:** Only handles GitHub OAuth callback (all KV/storage removed)
- Exchanges OAuth code for GitHub access token
- Returns token to frontend via redirect params
- No persistence, purely stateless

**Frontend Auth:** ([src/github-auth.js](src/github-auth.js))
- In-memory only (lost on refresh)
- Callback params: `?github_token=...&user=...&name=...&avatar=...`
- Used for authenticated GitHub API calls (5000 req/hour)

## Environment Configuration

Copy `.env.example` to `.env` and configure:
```bash
VITE_WORKER_URL=http://localhost:8787  # or production worker URL
VITE_GITHUB_CLIENT_ID=your_client_id   # from GitHub OAuth app
```

## Important Implementation Details

### Parser State Machine
- Errors on invalid sequences (question without answer, etc.)
- File ending while reading question → error
- File ending while reading answer/cloze → finalizes card

### Deck Hierarchy Changes (Recent)
- **Old:** Each markdown file = separate deck (`owner/repo/filename`)
- **New:** Each GitHub repo = one deck (`owner/repo`)
- All markdown files in a repo contribute to the same deck
- Deck metadata comes from first file with frontmatter, or repo name

### Storage Migration (Recent)
- All localStorage, IndexedDB, and Cloudflare KV removed
- Everything is in-memory (ephemeral)
- Preparing for Cloudflare D1 integration
- Auth state not persisted (must re-authenticate on refresh)

### Build Process
1. `vite build` builds frontend assets to `dist/`
2. `scripts/build.js` scans `topics/` and creates `public/data/cards.json`
3. Frontend loads index and fetches markdown files on demand
4. Parser processes markdown → cards with hashes
5. Cards stored in-memory, FSRS state initialized

## Development Workflow

**When modifying card parsing:**
1. Update [src/parser.js](src/parser.js) following state machine pattern
2. Update [src/hasher.js](src/hasher.js) if hash calculation changes
3. Run `npm run process-submodules` to regenerate index
4. Test with `npm run dev`

**When adding new local content:**
1. Add markdown files to `topics/` directory
2. Run `npm run process-submodules`
3. Cards appear in deck listing

**When deploying:**
1. Frontend: `npm run build` → deploy `dist/` to GitHub Pages
2. Worker: `cd /Users/thomasribeiro/code/flashcards-worker && npx wrangler deploy`

## Related Repositories

- **hashcards**: Original Rust implementation this parser replicates
- **ts-fsrs**: FSRS algorithm implementation
- **flashcards-worker**: Separate Cloudflare Worker for GitHub OAuth (stateless)

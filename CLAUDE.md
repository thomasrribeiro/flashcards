# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based spaced repetition flashcard system using the FSRS algorithm. The system parses markdown files in the hashcards Q:/A:/C: format and is designed to work with GitHub repositories as deck sources. Review state is persisted to Cloudflare D1 for cross-device sync and persistence.

## Essential Commands

```bash
# Development
npm install                # Install dependencies
npm run dev               # Start dev server on localhost:3000
npm run dev:watch         # Dev server + auto-rebuild on file changes

# Build
npm run build             # Production build (vite build + process-submodules)
npm run preview           # Preview production build
npm run process-submodules # Generate card index from public/collection/ markdown files

# Worker deployment (separate repository: https://github.com/thomasrribeiro/flashcards-worker)
# Navigate to the flashcards-worker repository directory first
npx wrangler dev          # Local worker dev server on localhost:8787
npx wrangler deploy       # Deploy worker to production
npx wrangler tail         # Stream worker logs
npx wrangler d1 execute flashcards-db --remote --file=migrations/XXXX.sql  # Run D1 migration
```

## Architecture Overview

### Data Flow: GitHub → Parser → D1 Storage → FSRS Review

```
GitHub Repo → Parser → Cards (w/ BLAKE3 hash) → Local Cache + D1 Backend → FSRS Review
```

**Key principles:**
- Each GitHub repository = one deck containing all cards from all markdown files in that repo
- Cards are content-addressable via BLAKE3 hashing (identical content = same card across repos/files)
- Review state persisted to Cloudflare D1, keyed by (user_id, card_hash)
- Cards themselves are NOT stored in D1 (always loaded fresh from GitHub/collection)

### Storage Architecture

**Three-Layer System:**

1. **Cloudflare D1 (Persistence Layer)** - [Worker repository](https://github.com/thomasrribeiro/flashcards-worker)
   - `users` table: GitHub user profiles
   - `repos` table: User's deck collection (which repos they've added)
   - `card_hashes` table: Registry of all card hashes with content type
   - `reviews` table: FSRS state per (user_id, card_hash) - includes repo/filepath for context

2. **Frontend Cache (Performance Layer)** - [src/storage.js](src/storage.js)
   - `cardsCache`: All cards from loaded repos (in-memory, rebuilt on page load)
   - `reposCache`: Repository metadata (in-memory, populated from D1)
   - `reviewsCache`: Review states (in-memory, synced to/from D1)

3. **REST API** - [Worker endpoints](https://github.com/thomasrribeiro/flashcards-worker/blob/main/src/api.js)
   - `POST /api/users/ensure` - Create/verify user exists
   - `POST /api/repos/add` - Add repo to collection + register card hashes
   - `GET /api/repos/:userId` - Get user's repo collection
   - `DELETE /api/repos/:userId/:repoId` - Remove repo from collection
   - `POST /api/reviews/sync` - Batch sync review states after each study session
   - `GET /api/reviews/:userId` - Load all reviews for user
   - `POST /api/refresh/:userId/:deckId` - Reset deck (delete all reviews)
   - `DELETE /api/deck/:userId/:repo` - Delete all reviews for a deck
   - `POST /api/reviews/cleanup` - Remove orphaned reviews (cards no longer in repos)

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
- **Critical:** Hash is based ONLY on card content, not filepath/location
  - Reorganizing files doesn't lose progress
  - Natural deduplication across repos
  - Git-workflow friendly (move/rename without penalty)

**3. Deck Management** ([src/repo-manager.js](src/repo-manager.js))
- Loads GitHub repos via API (authenticated or unauthenticated)
- One deck per repo (deck ID = `owner/repo`)
- Multiple markdown files in repo → single deck
- Aggregates metadata from first file with frontmatter
- Builds hierarchical folder structure for navigation

**4. FSRS Integration** ([src/fsrs-client.js](src/fsrs-client.js))
- Uses ts-fsrs library with default optimal parameters
- Four grades: Again (1), Hard (2), Good (3), Easy (4)
- Cards due when `card.due <= now`
- New cards have `state === State.New`

**5. GitHub OAuth & Authentication** ([src/github-auth.js](src/github-auth.js))
- Worker handles OAuth flow, exchanges code for token
- Frontend stores token in localStorage (survives page refresh)
- User info synced to D1 on login via `POST /api/users/ensure`
- Unauthenticated mode: 60 req/hour (public repos only)
- Authenticated mode: 5000 req/hour (private repos allowed)

### Entry Points

- [index.html](index.html) + [src/main.js](src/main.js): Deck listing and management UI
- [app.html](app.html) + [src/app.js](src/app.js): Study session interface with FSRS review

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

## Environment Configuration

**Frontend** (`.env` in project root):
```bash
VITE_WORKER_URL=http://localhost:8787  # or https://flashcards-worker.yourname.workers.dev
VITE_GITHUB_CLIENT_ID=your_client_id   # from GitHub OAuth app
```

**Worker** (secrets set via wrangler in the flashcards-worker repository):
```bash
# In the flashcards-worker directory
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put ALLOWED_ORIGINS  # Comma-separated, e.g., http://localhost:3000,https://yourdomain.com
wrangler secret put FRONTEND_URL     # Redirect URL after OAuth
```

**Worker Development** (`.dev.vars` in worker directory):
```bash
GITHUB_CLIENT_ID=your_dev_client_id
GITHUB_CLIENT_SECRET=your_dev_client_secret
ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

## Important Implementation Details

### Content-Addressable Design Philosophy
- Cards identified by content hash ONLY, not filepath
- Editing a card creates a NEW hash (old review orphaned)
- Moving/renaming files preserves review history (same hash)
- Orphaned reviews cleaned up automatically via `cleanupOrphanedReviews()`

### Refresh Button Behavior
- **Deck-level refresh:** Deletes ALL reviews for that deck (resets everything to New)
- **Folder-level refresh:** Deletes reviews matching `filepath LIKE 'folder/%'`
- After deletion, cards show as "due" because they're in New state
- Does NOT modify cards themselves, only review history

### Orphaned Review Cleanup
- Happens automatically when loading repos in [src/main.js](src/main.js)
- Compares card hashes in D1 vs cards actually loaded
- Removes reviews for hashes that no longer exist
- Logged as `[Storage] Cleaned up N orphaned reviews`

### URL Encoding in API Calls
- Repo IDs contain `/` (e.g., `owner/repo`)
- MUST encode when putting in URL: `encodeURIComponent(repoId)`
- Worker MUST decode: `decodeURIComponent(repoId)`
- Applies to all endpoints with `:repoId` parameter

### Local Collection vs GitHub Repos
- **GitHub repos:** Added via "Add Repository" input (requires auth for private)
- **Local collection:** Markdown files in `public/collection/` (for offline/example content)
- Build script (`scripts/build.js`) scans `public/collection/` and generates `index.json`

## Development Workflow

### When modifying card parsing
1. Update [src/parser.js](src/parser.js) following state machine pattern
2. Update [src/hasher.js](src/hasher.js) if hash calculation changes
3. Test with various markdown files
4. Verify hash stability (same content = same hash)

### When adding new API endpoint
1. Add handler function in [flashcards-worker/src/api.js](https://github.com/thomasrribeiro/flashcards-worker/blob/main/src/api.js)
2. Add route in [flashcards-worker/src/index.js](https://github.com/thomasrribeiro/flashcards-worker/blob/main/src/index.js)
3. Update [src/storage.js](src/storage.js) to call the endpoint
4. Test locally with `wrangler dev` (worker) + `npm run dev` (frontend)
5. Deploy worker: In flashcards-worker directory, run `npx wrangler deploy`

### When modifying D1 schema
1. Create migration file in flashcards-worker: `migrations/XXXX_description.sql`
2. Test locally: `wrangler d1 execute flashcards-db --local --file=migrations/XXXX.sql`
3. Apply to production: `wrangler d1 execute flashcards-db --remote --file=migrations/XXXX.sql`
4. Update API handlers in `api.js` to use new schema
5. Update frontend code in `storage.js` if needed

### When deploying
1. **Frontend:** `npm run build` → deploy `dist/` to GitHub Pages or static host
2. **Worker:** In flashcards-worker directory, run `npx wrangler deploy`
3. Verify secrets are set: `wrangler secret list`
4. Test OAuth flow end-to-end
5. Monitor logs: `wrangler tail --format pretty`

## Related Repositories

- **hashcards** (https://github.com/kersh1337228/hashcards): Original Rust implementation this parser replicates
- **ts-fsrs** (https://github.com/open-spaced-repetition/ts-fsrs): FSRS algorithm implementation
- **flashcards-worker** (https://github.com/thomasrribeiro/flashcards-worker): Cloudflare Worker for OAuth + D1 API

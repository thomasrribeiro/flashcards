# D1 Storage Implementation Summary

## Overview

Successfully migrated from ephemeral in-memory storage to persistent Cloudflare D1 database for FSRS review state management.

## Key Principles

1. **Content-Addressable Cards**: Cards identified by BLAKE3 hash of content only (not filepath)
2. **GitHub as Source of Truth**: Card content never stored in D1, only SRS state
3. **Per-User Isolation**: Each GitHub user has isolated review state
4. **Repo-Level Management**: Entire repos can be deleted, folders/files managed via git

## Architecture Changes

### Before (Ephemeral)
```
┌─────────────────┐
│   Browser       │
│  ┌───────────┐  │
│  │ In-Memory │  │  ← Lost on refresh
│  │  Storage  │  │
│  └───────────┘  │
└─────────────────┘
```

### After (Persistent D1)
```
┌─────────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser       │────────▶│   Worker     │────────▶│     D1      │
│  ┌───────────┐  │  HTTPS  │  (API)       │  SQL    │  (SQLite)   │
│  │ Local     │  │         │              │         │             │
│  │  Cache    │  │         │ - Sync       │         │ - users     │
│  └───────────┘  │         │ - Get        │         │ - reviews   │
└─────────────────┘         │ - Delete     │         │ - hashes    │
                            │ - Refresh    │         └─────────────┘
                            └──────────────┘
```

## Files Modified

### Worker (flashcards-worker/)

1. **[migrations/0001_initial_schema.sql](../flashcards-worker/migrations/0001_initial_schema.sql)** (NEW)
   - Created `users` table (github_id PK, username, avatar_url)
   - Created `card_hashes` table (hash PK, content_type)
   - Created `reviews` table (user_id + card_hash composite PK, fsrs_state JSON, repo, filepath)
   - Indexes for efficient queries by user, repo, and filepath

2. **[src/api.js](../flashcards-worker/src/api.js)** (NEW)
   - `handleEnsureUser()` - Create user if not exists
   - `handleSyncReviews()` - Batch upsert review states
   - `handleGetReviews()` - Fetch reviews with optional repo/folder filter
   - `handleDeleteDeck()` - Delete all reviews for a repo
   - `handleRefreshDeck()` - Mark cards as due (refresh functionality)

3. **[src/index.js](../flashcards-worker/src/index.js)** (MODIFIED)
   - Added API route handlers
   - Integrated with D1 binding

4. **[wrangler.toml](../flashcards-worker/wrangler.toml)** (MODIFIED)
   - Added D1 database binding configuration

### Frontend (flashcards/)

5. **[src/storage.js](src/storage.js)** (REWRITTEN)
   - Added `setCurrentUser()` and `getCurrentUser()` for auth context
   - Modified `initDB()` to ensure user exists and load reviews from D1
   - Modified `saveReview()` to sync to D1 after each rating
   - Added `refreshDeck(deckId, folder)` for refresh button
   - Modified `clearReviewsByDeck()` to DELETE from D1
   - Modified `removeRepo()` to DELETE from D1
   - Kept cards and repos in-memory (not persisted)

6. **[src/github-auth.js](src/github-auth.js)** (MODIFIED)
   - Import `setCurrentUser` and `initDB` from storage
   - Call `setCurrentUser()` after successful OAuth
   - Call `initDB()` to load D1 state on auth
   - Added `id` field to user object for D1 queries

7. **[src/main.js](src/main.js)** (MODIFIED)
   - **Removed** delete buttons from folder cards (line 877-894)
   - **Removed** delete buttons from file cards (line 962-979)
   - **Updated** `resetDeck()` to call `refreshDeck()` API (line 488-492)
   - **Updated** folder reset button to use `refreshDeck(deckId, folderPath)` (line 850-861)
   - **Updated** file reset button to use `refreshDeck(deckId, filepath)` (line 936-946)

8. **[src/app.js](src/app.js)** (MODIFIED)
   - Added user restoration from localStorage on init (line 94-99)
   - Call `setCurrentUser()` before `initDB()` to provide auth context

## API Endpoints

### Worker Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/ensure` | Create user in D1 if not exists |
| POST | `/api/reviews/sync` | Batch sync review states to D1 |
| GET | `/api/reviews/:userId?repo=&folder=` | Fetch reviews with filters |
| DELETE | `/api/deck/:userId/:repo` | Delete all reviews for a repo |
| POST | `/api/refresh/:userId/:deckId` | Mark all cards as due |

## Data Flow

### 1. User Authentication
```
GitHub OAuth → Worker Callback → Frontend receives token
    ↓
Frontend: setCurrentUser(user) → initDB()
    ↓
Worker: POST /api/users/ensure → D1: INSERT user
    ↓
Worker: GET /api/reviews/:userId → D1: SELECT reviews
    ↓
Frontend: Cache reviews locally
```

### 2. Card Review
```
User rates card → saveReview(hash, fsrsState)
    ↓
Update local cache
    ↓
Worker: POST /api/reviews/sync
    ↓
D1: INSERT/UPDATE review (user_id, card_hash, fsrs_state, repo, filepath, due_date)
```

### 3. Refresh Deck
```
User clicks refresh → refreshDeck(deckId, folder?)
    ↓
Worker: POST /api/refresh/:userId/:deckId { folder }
    ↓
D1: UPDATE reviews SET due_date = NOW() WHERE ...
    ↓
Worker: GET /api/reviews/:userId → reload fresh state
```

### 4. Delete Deck
```
User deletes repo → removeRepo(repoId)
    ↓
Worker: DELETE /api/deck/:userId/:repo
    ↓
D1: DELETE FROM reviews WHERE user_id = ? AND repo = ?
    ↓
Update local cache
```

## Database Schema

### users
```sql
CREATE TABLE users (
    github_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### card_hashes
```sql
CREATE TABLE card_hashes (
    hash TEXT PRIMARY KEY,
    content_type TEXT CHECK(content_type IN ('qa', 'cloze')),
    created_at TEXT DEFAULT (datetime('now'))
);
```

### reviews
```sql
CREATE TABLE reviews (
    user_id TEXT,
    card_hash TEXT,
    repo TEXT NOT NULL,
    filepath TEXT NOT NULL,
    fsrs_state TEXT NOT NULL,  -- JSON blob
    last_reviewed TEXT NOT NULL,
    due_date TEXT NOT NULL,
    PRIMARY KEY (user_id, card_hash),
    FOREIGN KEY (user_id) REFERENCES users(github_id) ON DELETE CASCADE,
    FOREIGN KEY (card_hash) REFERENCES card_hashes(hash) ON DELETE CASCADE
);
```

## Benefits

✅ **Persistent State**: Reviews survive page refreshes
✅ **Multi-User Support**: Each GitHub user has isolated data
✅ **Content-Addressable**: Identical cards share review state
✅ **Flexible Filtering**: Review at repo, folder, or file level
✅ **Git-First**: Content managed via GitHub, only SRS state persisted
✅ **Refresh Functionality**: Reset cards to due state at any level
✅ **Clean Separation**: Cards derived from markdown, reviews in D1

## Testing Checklist

- [ ] Create D1 database: `wrangler d1 create flashcards-db`
- [ ] Apply migration: `wrangler d1 execute flashcards-db --remote --file=migrations/0001_initial_schema.sql`
- [ ] Update `wrangler.toml` with database_id
- [ ] Deploy worker: `wrangler deploy`
- [ ] Login via GitHub OAuth
- [ ] Review some cards
- [ ] Refresh page → reviews should persist
- [ ] Click refresh button → cards marked as due
- [ ] Delete repo → reviews deleted from D1
- [ ] Logout/login → state restored

## Future Enhancements

- Add sync conflict resolution
- Implement offline support with service worker
- Add review statistics and analytics
- Export/import review state
- Shared decks with separate per-user state

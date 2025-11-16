# Flashcards

A browswer-based spaced repetition flashcard system using the FSRS algorithm. Built to work with plain markdown files, with your learning progress synced to your GitHub account.

## Features

- **GitHub-centric**: Login with GitHub, sync progress to Cloudflare KV
- **Repository-based**: Each deck is a GitHub repository
- **Hashcards-compatible format**: Use Q:, A:, C: syntax for flashcards
- **FSRS scheduling**: Optimal spaced repetition using ts-fsrs
- **Content-addressable**: Cards identified by BLAKE3 hash
- **Cloze deletions**: Multiple deletions per card
- **LaTeX support**: KaTeX rendering for math
- **Media support**: Images in flashcards
- **Offline-first**: IndexedDB for local storage, cloud sync when online
- **Version controlled**: Your flashcard content lives in GitHub repos

## Card Format

### Basic Cards
```markdown
Q: What is the capital of France?
A: Paris
```

### Cloze Deletion
```markdown
C: The [order] of a group is [the cardinality of its underlying set].
```

### With LaTeX
```markdown
Q: What is Euler's identity?
A: $e^{i\pi} + 1 = 0$
```

### With Images
```markdown
Q: What is this structure?
A: ![](images/anatomy.png)
A mitochondrion
```

### TOML Frontmatter (Optional)
```markdown
---
name = "Cell Biology"
---

Q: What is a cell?
A: The basic unit of life.
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to access your flashcards.

### 3. Login with GitHub

Click "Login with GitHub" to authenticate. Your FSRS review state will sync to the Cloudflare Worker backend.

### 4. Add Flashcard Repositories

On the homepage, enter any GitHub repository in the format `owner/repository` (e.g., `facebook/react`). The app will:
1. Fetch all markdown files from the repository
2. Parse them for flashcards in hashcards format (Q:/A:/C:)
3. Store the cards in IndexedDB for offline study
4. Sync your review progress to the cloud

## How It Works

### Architecture

1. **Frontend (this repo)**: Browser-based SPA that loads flashcards from GitHub repos
2. **Worker Backend** (`/Users/thomasribeiro/code/flashcards-worker`): Cloudflare Worker handling GitHub OAuth and syncing FSRS state to KV

### Data Flow

```
User → Login with GitHub → Worker handles OAuth → JWT issued
User → Adds repo (owner/repo) → Frontend fetches markdown from GitHub
Frontend → Parses cards → Stores in IndexedDB
User → Studies cards → FSRS state updated locally
Frontend → Syncs review state → Worker stores in KV (keyed by GitHub username)
```

### GitHub OAuth Flow

1. User clicks "Login with GitHub"
2. Redirects to `https://github.com/login/oauth/authorize?client_id=...`
3. GitHub redirects to worker: `https://worker.dev/auth/github/callback?code=...`
4. Worker exchanges code for access token
5. Worker fetches user info, generates JWT
6. Worker redirects to frontend with JWT and user data
7. Frontend stores JWT, uses it for all worker API calls

### FSRS State Management

- **Local**: FSRS state stored in IndexedDB per card hash
- **Cloud**: Periodically synced to Cloudflare KV, keyed by GitHub username
- **Conflict resolution**: Most recent `lastReviewed` timestamp wins

## Project Structure

```
flashcards/
├── index.html              # Topic listing page with GitHub login
├── app.html               # Study session interface
├── style.css              # Styles
├── src/
│   ├── parser.js          # Hashcards-compatible parser
│   ├── hasher.js          # BLAKE3 content hashing
│   ├── fsrs-client.js     # ts-fsrs integration
│   ├── markdown.js        # Markdown + KaTeX rendering
│   ├── storage.js         # IndexedDB storage
│   ├── repo-manager.js    # GitHub repository fetching
│   ├── github-auth.js     # GitHub OAuth client
│   ├── main.js            # Topic listing
│   └── app.js             # Study interface
└── scripts/
    └── build.js           # Build script
```

## Study Interface

### Keyboard Shortcuts

- **Space**: Reveal answer
- **1**: Grade as "Again" (forgot)
- **2**: Grade as "Hard"
- **3**: Grade as "Good"
- **4**: Grade as "Easy"

### FSRS Grades

- **Again (1)**: Complete failure, review soon
- **Hard (2)**: Barely remembered, short interval
- **Good (3)**: Correct recall, standard interval
- **Easy (4)**: Effortless recall, long interval

## Worker Backend Setup

The worker handles GitHub OAuth and syncs FSRS state. See `/Users/thomasribeiro/code/flashcards-worker` for setup.

### Required Secrets

Set these via `wrangler secret put`:

```bash
wrangler secret put JWT_SECRET              # Random secret for JWT signing
wrangler secret put GITHUB_CLIENT_ID        # From GitHub OAuth app
wrangler secret put GITHUB_CLIENT_SECRET    # From GitHub OAuth app
wrangler secret put FRONTEND_URL            # http://localhost:3000 or production URL
wrangler secret put ALLOWED_ORIGINS         # Comma-separated CORS origins
```

### GitHub OAuth App Setup

1. Go to GitHub Settings → Developer Settings → OAuth Apps
2. Create new OAuth App:
   - **Application name**: `flashcards-dev` (or `flashcards` for production)
   - **Homepage URL**: `http://localhost:3000` (or production URL)
   - **Authorization callback URL**: `https://your-worker.workers.dev/auth/github/callback`
3. Copy Client ID and Client Secret to worker secrets

### Deploy Worker

```bash
cd /Users/thomasribeiro/code/flashcards-worker
npm install
wrangler deploy
```

### Configure Frontend

Create `.env` in the frontend repo:

```env
VITE_WORKER_URL=https://your-worker.workers.dev
VITE_GITHUB_CLIENT_ID=your_github_client_id
```

## Deployment

### Frontend (GitHub Pages)

```bash
npm run build
git add dist -f
git commit -m "Build for GitHub Pages"
git subtree push --prefix dist origin gh-pages
```

### Worker (Cloudflare)

```bash
cd /Users/thomasribeiro/code/flashcards-worker
wrangler deploy
```

## Future Enhancements

- [x] GitHub OAuth authentication
- [x] Cloud sync with Cloudflare KV
- [ ] Create GitHub repositories from GUI (for new flashcard decks)
- [ ] Audio support
- [ ] Statistics and progress charts
- [ ] Mobile app with same backend
- [ ] Export/import functionality
- [ ] Pull request workflow for collaborative decks

## Security

- **GitHub OAuth**: Secure authentication via standard OAuth flow
- **Separated Backend**: Worker repo is separate from frontend
- **No Secrets in Frontend**: All sensitive data in worker environment variables
- **Content Hashing**: Cards identified by BLAKE3 hash
- **Local-First**: Works fully offline, sync is optional
- **CORS Protection**: Worker validates origins

## License

MIT

## Acknowledgments

- **hashcards**: Original CLI tool inspiration
- **ts-fsrs**: FSRS algorithm implementation
- **FSRS**: Free Spaced Repetition Scheduler algorithm

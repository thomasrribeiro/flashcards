# Flashcards

Browser-based spaced repetition flashcard system using the FSRS algorithm.

Parses markdown files in the hashcards Q:/A:/C: format and uses GitHub repositories as deck sources.

## Getting Started (Local Development)

### Prerequisites

- Node.js (v14 or higher)
- npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (for local worker development)

### Installation

**1. Install frontend dependencies:**
```bash
npm install
```

**2. Set up the Cloudflare Worker (for OAuth and D1 storage):**
```bash
cd /Users/thomasribeiro/code/flashcards-worker
npm install
```

Create `.dev.vars` file in the worker directory:
```bash
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

To get GitHub OAuth credentials:
1. Go to https://github.com/settings/developers
2. Create a new OAuth App
3. Set **Authorization callback URL** to `http://localhost:8787/callback`
4. Copy the Client ID and generate a Client Secret

**3. Configure frontend environment:**
```bash
cd /Users/thomasribeiro/code/flashcards
cp .env.example .env
```

Edit `.env`:
```bash
VITE_WORKER_URL=http://localhost:8787
VITE_GITHUB_CLIENT_ID=your_github_oauth_client_id  # Same as worker
```

**4. Initialize D1 database (local):**
```bash
cd /Users/thomasribeiro/code/flashcards-worker
npx wrangler d1 execute flashcards-db --local --file=migrations/0001_initial_schema.sql
npx wrangler d1 execute flashcards-db --local --file=migrations/0002_add_repos_table.sql
```

### Running the App

**Start both services in separate terminals:**

Terminal 1 - Worker:
```bash
cd /Users/thomasribeiro/code/flashcards-worker
npx wrangler dev
```

Terminal 2 - Frontend:
```bash
cd /Users/thomasribeiro/code/flashcards
npm run dev
```

Open your browser to http://localhost:3000.

### Adding Flashcard Content

**Option 1: Local markdown files (offline/example content)**

Create directories in `public/collection/` and add markdown files:

```bash
mkdir -p public/collection/my-deck
```

Add markdown files in hashcards format:
```markdown
Q: What is spaced repetition?
A: A learning technique that presents information at gradually increasing intervals.

C: The FSRS algorithm adapts to your [personal memory patterns].
```

Then rebuild the index:
```bash
npm run process-submodules
```

**Option 2: GitHub repositories (recommended)**

1. Log in with GitHub (click "Login with GitHub" button)
2. Enter a public repo like `username/my-flashcards`
3. The app will load all markdown files from that repo
4. Your progress syncs to D1 and persists across devices

### Deploying

Build for production:
```bash
npm run build
```

Deploy the `dist/` folder to your static hosting provider (e.g., GitHub Pages).

For the OAuth worker, see `/Users/thomasribeiro/code/flashcards-worker`.

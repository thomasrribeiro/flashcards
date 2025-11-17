# Flashcards

Browser-based spaced repetition flashcard system using the FSRS algorithm.

Parses markdown files in the hashcards Q:/A:/C: format and uses GitHub repositories as deck sources.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and set:
- `VITE_WORKER_URL` - URL of the Cloudflare Worker for GitHub OAuth
- `VITE_GITHUB_CLIENT_ID` - GitHub OAuth Client ID (optional, for private repos)

### Running the App

```bash
npm run dev
```

Open your browser to the URL shown in the terminal (typically http://localhost:3000).

### Adding Flashcard Content

Place markdown files in the `topics/` directory in the hashcards format:

```markdown
Q: What is spaced repetition?
A: A learning technique that presents information at gradually increasing intervals.

C: The FSRS algorithm adapts to your [personal memory patterns].
```

Then run:
```bash
npm run process-submodules
```

### Deploying

Build for production:
```bash
npm run build
```

Deploy the `dist/` folder to your static hosting provider (e.g., GitHub Pages).

For the OAuth worker, see `/Users/thomasribeiro/code/flashcards-worker`.

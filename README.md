# Flashcards

A standalone browser frontend for local flashcard study and a read-only curriculum graph. AI generation and account sync are not implemented on `dev`.

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Import Markdown or use the bundled examples. Star decks for daily Learn/Review, or select a chapter to study it directly. Imports and progress use the browser storage key `flashcards.frontend.v1`, separate from the previous app's account data. Imports with the same filename replace the previous import. Relative image files are not imported alongside Markdown; use hosted image URLs. Study sessions do not resume after reload.

## Root files

| File | Purpose |
| --- | --- |
| `.gitignore` | Excludes dependencies, build output, local environment files and `/tests/` from Git. |
| `AGENTS.md` | Repository instructions for coding agents; not part of the website. |
| `LICENSE` | Apache-2.0 licensing terms. |
| `README.md` | Setup, architecture and file reference. |
| `index.html` | HTML entry point and application shell. |
| `package.json` | npm commands, dependency ranges and Node requirements. |
| `package-lock.json` | Exact dependency versions for reproducible `npm ci` installs. |
| `vite.config.js` | Development server, production URL prefix and unit-test discovery. |

These files stay at the root for conventional tool discovery. Application styles live under `src/styles/`. The Playwright configuration and root browser-test directory have been removed; unit tests remain beside the modules they cover.

## Source files

| Path under `src/` | Responsibility |
| --- | --- |
| `main.js` | Connects storage and views, handles navigation, imports and settings. |
| `cards/parser.js` | Parses Markdown card syntax, frontmatter, cloze deletions, problem/solution cards and identity annotations. |
| `cards/hasher.js` | Computes stable card identities, content hashes and legacy alias metadata. |
| `cards/markdown.js` | Renders card content and mathematical notation, resolves image paths, sanitizes HTML and splits solution steps. |
| `cards/deck-loader.js` | Converts parsed files into usable decks and loads the bundled examples. |
| `cards/card-identity.test.js` | Tests IDs, aliases, cloze identity and identity preservation across wording changes. |
| `cards/parser-frontmatter.test.js` | Tests parsing of frontmatter metadata. |
| `cards/markdown.test.js` | Tests prose wrapping and solution-step parsing. |
| `cards/deck-loader.test.js` | Tests partial success when a bundled file fails to load. |
| `curriculum/curriculum.js` | Projects the catalog into subject, deck and chapter graphs; reduces redundant edges and positions nodes. No AI generation. |
| `curriculum/curriculum.test.js` | Tests graph relationships, cycle handling and layout. |
| `storage/local-store.js` | Reads/writes local state, manages stars and imports, selects study queues and persists grades. |
| `storage/local-store.test.js` | Tests persistence, daily limits, identity continuity, corrupt data and failed writes. |
| `study/fsrs-client.js` | Wraps FSRS scheduling, due-date checks and date rehydration. |
| `ui/dom.js` | Small shared DOM construction helpers and status messages. |
| `ui/shell.js` | Theme switch, mobile sidebar and collapsible help. |
| `ui/library-view.js` | Subject/deck/chapter columns, filtering, stars and chapter selection. |
| `ui/study-view.js` | Card display, reveal, grading, keyboard controls and session completion. |
| `ui/curriculum-view.js` | Fetches the static catalog and renders the interactive graph. |
| `ui/progress-view.js` | Renders local total, reviewed and due-card counts. |
| `styles/app.css` | Shared visual design, dark theme, responsive layouts and view styling. |

Keep browser view code in `ui/`, persistence in `storage/`, and card interpretation in `cards/`. Provider credentials, generation prompts and backend orchestration do not belong in browser modules.

## Public files

Vite serves `public/` directly and copies it unchanged into `dist/`. For example, `public/data/curriculum.json` is served at `/flashcards/data/curriculum.json` in production. This directory contains downloadable static assets, not private data or executable backend code.

| Path under `public/` | Purpose |
| --- | --- |
| `collection/index.json` | Manifest of the bundled example card files. |
| `collection/example/flashcards/*.md` | Twelve example decks: arts, bible, biology, chemistry, computer-science, economics, history, languages, literature, mathematics, physics and sports. |
| `data/curriculum.json` | Historical catalog of subjects, decks, chapters and prerequisites for graph browsing. Catalog card counts do not imply that the cards are bundled. Retained metadata is display data, not the contract for a future backend. |
| `icons/icon-192.png` | Small installable-app icon. |
| `icons/icon-512.png` | Large installable-app icon. |
| `icons/icon-maskable-512.png` | Icon designed for platform-specific home-screen cropping. |
| `icons/apple-touch-icon-180.png` | Apple home-screen icon referenced by the HTML. |
| `manifest.webmanifest` | App name, launch URL, colors, display mode and icon references. No service worker is registered. |

## Deployment

`.github/workflows/deploy.yml` installs dependencies with `npm ci`, builds the static site, uploads `dist/`, and publishes it to GitHub Pages. Pushes to `master` trigger it automatically; `workflow_dispatch` also allows a manual run. A manual run can publish the selected branch, so the latest successful deployment record determines what is live.

`dev` is the frontend refactor branch and does not deploy on push. The public site at https://thomasrribeiro.com/flashcards/ uses the most recently published Pages artifact. The separate worker repository and stored deployment secrets are outside this frontend's runtime.

## Verification

```sh
npm test
npm run build
git diff --check
```

Unit tests are discovered only under `src/`. The root `/tests/` directory is deliberately ignored and is not shipped or maintained. For visual changes, inspect desktop and mobile rendering and exercise the affected interactions before publishing changes.

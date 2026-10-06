# Flashcards

A browser flashcard app with GitHub decks, spaced repetition, progress tracking, and an interactive curriculum graph.

The interface and non-AI features are restored from `archive/pre-refactor-main` (`d534e9d`). The AI generation backend is being rebuilt: generation controls remain visible but disabled. Provider connections, AI job submission and polling, generation previews/publication, CLI runners, and authoring prompts are not included.

## Development

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Public GitHub repositories and curriculum registries can be browsed without signing in. Login, account progress sync, and reminders use the existing worker. To run those integrations locally, provide the existing deployment's values in an ignored `.env.local`:

```dotenv
VITE_WORKER_URL=
VITE_GITHUB_CLIENT_ID=
VITE_VAPID_PUBLIC_KEY=
```

These are browser-visible service configuration values, not AI provider credentials. The worker implementation and stored deployment secrets are managed separately.

The original account and signed-out storage behavior is retained. Data saved by the temporary standalone frontend under `flashcards.frontend.v1` is left untouched and is not automatically migrated into account data.

## Structure

| Location | Responsibility |
| --- | --- |
| `index.html` | Original application shell, study controls, and dialogs. |
| `src/main.js` | Original navigation and view coordination, with AI execution removed. |
| `src/cards/` | Markdown parsing, rendering, stable card identities, and serialization for editing. |
| `src/curriculum/` | Registry loading, graph projection/layout, deck ordering, and progress overlays. |
| `src/services/` | GitHub authentication, repository reads/writes, collection reconciliation, and push subscriptions. |
| `src/storage/` | Account/local persistence, review identity handling, and browser-storage safeguards. |
| `src/study/` | FSRS scheduling, daily queues, resumable sessions, habits, and chapter progress. |
| `src/ui/` | Card browser/editor, deck/folder creation dialogs, confirmation dialog, and progress dashboard. |
| `src/styles/` | Original application and card-editor styles. |

Unit tests live beside the modules they cover. The root `tests/` directory remains ignored. `AGENTS.md`, the old redirect page, and the previous AI backend have not been restored.

The standard root files remain: `.gitignore` defines exclusions, `LICENSE` contains licensing terms, `package.json` defines scripts/dependencies, `package-lock.json` pins installed versions, and `vite.config.js` configures the development server, build URL prefix, and unit-test discovery.

## Public files

Vite serves `public/` directly and copies it into `dist/`. Everything here is publicly downloadable.

| Path | Purpose |
| --- | --- |
| `collection/index.json` | Manifest of the bundled example card files. |
| `collection/example/flashcards/*.md` | Twelve bundled subject examples, preserved unchanged. |
| `data/curriculum.json` | Bundled curriculum fallback; configured public registries supply current catalogs. |
| `icons/gavel.png`, `icons/refresh.png` | Original review and reset action icons. |
| `icons/icon-192.png`, `icons/icon-512.png` | Installable-app icons. |
| `icons/icon-maskable-512.png` | Home-screen icon supporting platform cropping. |
| `icons/apple-touch-icon-180.png` | Apple home-screen icon. |
| `manifest.webmanifest` | App name, launch URL, display settings, and icon references. |
| `sw.js` | Original app-shell caching and push-notification handling. |

## Deployment

`.github/workflows/deploy.yml` runs on pushes to `main` or manual dispatch. It installs dependencies with `npm ci`, supplies the existing GitHub/worker/push configuration to the build, builds `dist/`, and publishes that artifact to GitHub Pages.

`dev` does not deploy on push. `archive/pre-refactor-main` preserves the former production source. A manual workflow run can publish its selected branch, so the latest successful Pages deployment record determines what is live at https://thomasrribeiro.com/flashcards/.

## Verification

```sh
npm test
npm run build
git diff --check
```

For interface changes, compare desktop and mobile rendering against the archived interface using identical fixture data. Exercise studying, settings, progress, curriculum navigation, and authenticated integrations with mocked services; do not write to real accounts for verification.

# Flashcards frontend

A standalone frontend reset, preserving the yellow header, typography, theme, three-column collection browser, card presentation and curriculum graph styling.

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Use the bundled example decks or import Markdown. Star decks for daily Learn/Review, or select a chapter to study it directly. Local progress and imports use `flashcards.frontend.v1`, separate from the previous app's storage. Curriculum displays the bundled catalog read-only; its card counts describe that catalog, not locally installed cards.

## Boundaries

- `src/main.js`: application entry point and composition.
- `src/cards/`: card parsing, Markdown/math rendering, serialization and stable identity utilities.
- `src/curriculum/`: graph projections, prerequisites and layout.
- `src/study/`: browser-side spaced-repetition scheduling.
- `src/storage/`: local persistence and bundled collection loading; the boundary for a future service.
- `src/ui/`: collection, study and curriculum views, plus shared DOM helpers.
- Unit tests live beside the code they test; browser tests live in `tests/e2e/`.
- `style.css`: shared presentation.

## Public assets

Vite serves `public/` files directly and copies them unchanged into the build output. Paths are relative to the app base: `public/data/curriculum.json` becomes `/flashcards/data/curriculum.json` in production. These are downloadable static assets, not backend code or private storage.

- `collection/index.json`: the manifest listing the bundled example files.
- `collection/example/flashcards/`: 12 Markdown example decks, loaded by the local collection loader.
- `data/curriculum.json`: the retained curriculum catalog used by the read-only graph. It describes subjects, decks, chapters and prerequisites; it does not contain all their flashcards or generate anything.
- `icons/`: app/home-screen icons used by the web manifest and HTML, plus the retained `gavel.png` and `refresh.png` action icons, currently unused.
- `images/honeycombs.png`: a retained image asset, currently unused.
- `screenshots/gui.png`: a retained UI screenshot, currently unused.
- `manifest.webmanifest`: app name, launch URL, display mode, colors and icon references for browser installation. No service worker is currently registered.

Imported decks and review progress live in browser storage, not in `public/`.

No account login, server sync, push delivery, GitHub writes, AI generation, CLI, generation runner, provider adapters, publishing jobs or agent authoring workflows execute on this branch. The previous study analytics, remote deck editing and generation interfaces are removed. Progress is a local summary; imported Markdown replaces an earlier import with the same filename. Relative image assets are not imported with Markdown; use hosted image URLs. Local preview sessions are not resumed after reload.

The historical bundled catalog and example cards are retained as display data, not as a future backend schema. Git history still contains the old implementation. This is a source reset, not a history rewrite.

The separate worker repository, deployed service, original working tree and deployment/authentication configuration are unchanged. The existing Pages workflow remains historical deployment configuration; no deployment was performed. A backend migration and deployment review are required before replacing the live app.

## Checks

```sh
npm test
npm run build
npx playwright install chromium # once per browser version
npm run test:e2e
git diff --check
```

The former deck-authoring skill was removed with the generation workflow, so its validator has no remaining SKILL.md to validate.

The browser tests exercise study, persistence, graph navigation, import, themes and mobile layout, and reject requests to backend/GitHub endpoints. `app.html` redirects old entry-point links to the new collection page.

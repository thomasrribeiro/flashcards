# Flashcards frontend

A standalone frontend reset, preserving the yellow header, typography, theme, three-column collection browser, card presentation and curriculum graph styling.

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Use the bundled example decks or import Markdown. Star decks for daily Learn/Review, or select a chapter to study it directly. Local progress and imports use `flashcards.frontend.v1`, separate from the previous app's storage. Curriculum displays the bundled catalog read-only; its card counts describe that catalog, not locally installed cards.

## Boundaries

- `src/main.js`: application composition and shell controls.
- `src/library-view.js`, `src/study-view.js`, `src/curriculum-view.js`: view behavior.
- `src/local-store.js`: local persistence and bundled collection loading. Replace this boundary when connecting a new service.
- `src/parser.js`, `src/hasher.js`, `src/review-identity.js`: retained card syntax and identity utilities.
- `src/markdown.js`, `src/fsrs-client.js`, `src/curriculum.js`: rendering, browser scheduling and graph projection/layout.
- `style.css`: shared presentation; `public/`: static assets and example content.

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

See [the backend design proposal](docs/backend-plan.md) for the next phase.

# My Flashcards

Browser-based spaced repetition flashcard system using the FSRS algorithm. Built to work with plain markdown files in the hashcards Q:/A:/C: format.

## Features

- **Hashcards-compatible format**: Use Q:, A:, C: syntax for flashcards
- **FSRS scheduling**: Optimal spaced repetition using ts-fsrs
- **Content-addressable**: Cards identified by BLAKE3 hash
- **Cloze deletions**: Multiple deletions per card
- **LaTeX support**: KaTeX rendering for math
- **Media support**: Images in flashcards
- **Offline-first**: IndexedDB for local storage
- **Git submodules**: Organize topics as separate repos

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

### 2. Add Topic Submodules

Add your flashcard repositories as git submodules in the `topics/` directory:

```bash
git submodule add <repo-url> topics/<topic-name>
```

For example:
```bash
git submodule add https://github.com/user/my-flashcards-physics topics/physics
git submodule add https://github.com/user/my-flashcards-math topics/math
```

Each submodule should contain `.md` files with flashcards in the hashcards format.

### 3. Build Card Index

Process the markdown files and generate the card index:

```bash
npm run process-submodules
```

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to access your flashcards.

## Project Structure

```
my-flashcards/
├── index.html              # Topic listing page
├── app.html               # Study session interface
├── style.css              # Styles matching personal site
├── src/
│   ├── parser.js          # Hashcards-compatible parser
│   ├── hasher.js          # BLAKE3 content hashing
│   ├── fsrs-client.js     # ts-fsrs integration
│   ├── markdown.js        # Markdown + KaTeX rendering
│   ├── storage.js         # IndexedDB storage
│   ├── loader.js          # Card loading system
│   ├── main.js            # Topic listing
│   └── app.js             # Study interface
├── topics/                # Git submodules with flashcards
│   ├── physics/           # Example submodule
│   ├── math/              # Example submodule
│   └── ...
├── scripts/
│   └── build.js          # Build script for processing
└── public/
    └── data/
        └── cards.json    # Generated card index
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

## Deployment to GitHub Pages

### 1. Build for Production

```bash
npm run build
```

### 2. Deploy

The `dist/` directory contains the built static site. Deploy to GitHub Pages:

```bash
# Add dist to git
git add dist -f

# Commit and push
git commit -m "Build for GitHub Pages"
git subtree push --prefix dist origin gh-pages
```

### 3. Link from Personal Site

Update your personal website's [notes.html](https://thomasrribeiro.github.io/notes.html) to link to this repo's GitHub Pages URL.

## Authentication & Sync (Optional)

The application works fully offline. For cloud sync across devices, you can deploy the separate worker backend.

### Worker Backend

The authentication worker is in a **separate repository** for security:
- Secrets (JWT, API keys) isolated from frontend
- Independent deployment and versioning
- Can be private while frontend is public

Set up the worker from: `/Users/thomasribeiro/code/my-flashcards-worker`

### Configure Frontend for Auth

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Set your worker URL:
```env
VITE_WORKER_URL=https://your-worker.workers.dev
```

3. The auth features will automatically enable when the worker is configured.

## Security Best Practices

This project follows security best practices:

1. **Separated Backend**: Worker is in a separate repository
2. **No Secrets in Frontend**: All sensitive data in worker only
3. **Content Hashing**: Cards identified by BLAKE3 hash
4. **Local-First**: Works fully offline, sync is optional
5. **CORS Protection**: Worker validates origins

## Future Enhancements

- [x] Cloudflare Worker authentication (magic link) - Implemented in separate repo
- [x] Cloud sync with Cloudflare KV - Implemented in separate repo
- [ ] Audio support
- [ ] Statistics and progress charts
- [ ] Mobile app with same backend
- [ ] Export/import functionality

## License

MIT

## Acknowledgments

- **hashcards**: Original CLI tool inspiration
- **ts-fsrs**: FSRS algorithm implementation
- **FSRS**: Free Spaced Repetition Scheduler algorithm
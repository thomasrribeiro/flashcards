# Setup Guide

Complete setup guide for the flashcards application.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Topics Directory

```bash
mkdir -p topics
```

### 3. Add Example Flashcards (Optional)

Copy the example file to topics for testing:

```bash
mkdir -p topics/example
cp example.md topics/example/
```

### 4. Build Card Index

```bash
npm run process-submodules
```

### 5. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## Adding Topic Repositories

### Method 1: Git Submodules (Recommended)

This allows you to maintain flashcard collections as separate git repositories:

```bash
# Add a new topic as a submodule
git submodule add https://github.com/yourusername/my-flashcards-physics topics/physics

# After cloning this repo elsewhere, initialize submodules
git submodule update --init --recursive

# Update all submodules
git submodule update --remote
```

### Method 2: Regular Directories

Simply create directories in `topics/` and add markdown files:

```bash
mkdir -p topics/biology
echo "Q: What is a cell?
A: The basic unit of life." > topics/biology/cells.md
```

## Card Format Reference

### Basic Q&A

```markdown
Q: Question here
A: Answer here
```

### Cloze Deletions

```markdown
C: The [word to hide] will be replaced with dots.
C: You can have [multiple] [deletions] in one card.
```

### LaTeX Math

Use `$` for inline and `$$` for display mode:

```markdown
Q: What is the Pythagorean theorem?
A: $a^2 + b^2 = c^2$

Q: What is the quadratic formula?
A: $$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$
```

### Images

Use standard markdown image syntax:

```markdown
Q: What is this diagram showing?
A: ![](diagrams/cell-structure.png)
This shows a eukaryotic cell.
```

Images should be relative to the `topics/` directory.

### Custom Deck Names

Use TOML frontmatter to override the deck name:

```markdown
---
name = "Chapter 1: Introduction"
---

Q: First question
A: First answer
```

## GitHub Pages Deployment

### 1. Build for Production

```bash
npm run build
```

### 2. Configure GitHub Pages

1. Go to your repository settings
2. Navigate to Pages
3. Set source to "Deploy from a branch"
4. Select `gh-pages` branch
5. Save

### 3. Deploy

```bash
# Create gh-pages branch if it doesn't exist
git checkout -b gh-pages

# Add built files
cp -r dist/* .
git add .
git commit -m "Deploy to GitHub Pages"
git push origin gh-pages

# Return to main branch
git checkout main
```

### 4. Link from Personal Site

Update your personal website's navigation to link to:
```
https://yourusername.github.io/my-flashcards/
```

## Cloudflare Worker Setup (Optional)

For authentication and cloud sync:

### 1. Install Wrangler

```bash
cd worker
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create KV Namespace

```bash
npx wrangler kv:namespace create USER_DATA
npx wrangler kv:namespace create USER_DATA --preview
```

Update `wrangler.toml` with the returned IDs.

### 4. Set Secrets

```bash
# JWT secret for signing tokens
npx wrangler secret put JWT_SECRET

# Email API key (for Resend, SendGrid, etc.)
npx wrangler secret put EMAIL_API_KEY
```

### 5. Deploy Worker

```bash
npx wrangler deploy
```

### 6. Update Frontend

In `src/auth.js` (create this file), set your worker URL:

```javascript
const WORKER_URL = 'https://your-worker.your-subdomain.workers.dev';
```

## File Structure

```
my-flashcards/
├── index.html                 # Main topic listing
├── app.html                  # Study interface
├── style.css                 # Styles
├── vite.config.js           # Vite configuration
├── package.json             # Dependencies
├── src/
│   ├── parser.js            # Markdown parser
│   ├── hasher.js            # BLAKE3 hashing
│   ├── fsrs-client.js       # Spaced repetition
│   ├── markdown.js          # Markdown + LaTeX rendering
│   ├── storage.js           # IndexedDB storage
│   ├── loader.js            # Card loading
│   ├── main.js              # Topic listing logic
│   └── app.js               # Study session logic
├── topics/                  # Git submodules or directories
│   ├── physics/
│   │   ├── mechanics.md
│   │   └── thermodynamics.md
│   ├── math/
│   │   └── calculus.md
│   └── biology/
│       └── cells.md
├── scripts/
│   └── build.js            # Card index builder
├── worker/                 # Cloudflare Worker (optional)
│   ├── wrangler.toml
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── auth.js
│       └── sync.js
└── public/
    └── data/
        └── cards.json      # Generated card index
```

## Workflow

### Daily Use

1. Visit your deployed site
2. Click on a topic to study
3. Review due cards
4. Cards automatically scheduled via FSRS

### Adding New Cards

1. Edit markdown files in your topic repositories
2. Commit and push changes
3. Run `npm run process-submodules` to rebuild
4. Redeploy to GitHub Pages

### Syncing Across Devices (with Cloudflare Worker)

1. Log in with your email (magic link)
2. Your review progress syncs automatically
3. Study on any device with the same account

## Troubleshooting

### Cards Not Loading

- Check that `npm run process-submodules` was run
- Verify `public/data/cards.json` exists
- Check browser console for errors

### Markdown Not Rendering

- Ensure files use correct Q:/A:/C: format
- Check for unclosed cloze deletions `[...]`
- Verify image paths are relative to `topics/`

### LaTeX Not Rendering

- Check that KaTeX CDN is loaded (in app.html)
- Use `$` for inline, `$$` for display math
- Test with simple expression like `$x^2$`

### Submodules Not Updating

```bash
# Update all submodules to latest
git submodule update --remote

# Force update
git submodule foreach git pull origin main
```

## Tips

- **Keep topics focused**: One repository per subject
- **Use frontmatter**: Organize multi-chapter textbooks
- **Include images**: Visual learning is powerful
- **Review daily**: FSRS works best with consistency
- **Export regularly**: Backup your IndexedDB data

## Support

- Report issues: [GitHub Issues](https://github.com/yourusername/my-flashcards/issues)
- Hashcards format: [hashcards docs](https://github.com/eudoxia0/hashcards)
- FSRS algorithm: [FSRS wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki)

/**
 * Markdown rendering with KaTeX support for LaTeX math
 * and image support for media
 */

import { marked } from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';

// Allow MathML tags produced by KaTeX, plus aria/style attributes it needs
const PURIFY_CONFIG = {
    ADD_TAGS: [
        'math', 'mrow', 'mi', 'mn', 'mo', 'mfrac', 'msup', 'msub',
        'msubsup', 'mover', 'munder', 'munderover', 'mtable', 'mtr',
        'mtd', 'menclose', 'mspace', 'mtext', 'merror', 'msqrt',
        'mroot', 'semantics', 'annotation'
    ],
    ADD_ATTR: ['aria-hidden', 'encoding', 'xmlns'],
    FORCE_BODY: false
};

/**
 * Configure marked renderer
 */
const renderer = new marked.Renderer();

// Store current card context for image resolution
let currentCardContext = null;

// Custom image renderer to handle relative paths
renderer.image = function(href, title, text) {
    let src = href;

    // Handle absolute URLs
    if (href.startsWith('http')) {
        src = href;
    }
    // Handle relative paths from flashcards
    else if (currentCardContext) {
        // For local decks: collection/deck-name/figures/...
        // For GitHub repos: owner/repo/figures/...
        const deckName = currentCardContext.deckName;
        const filePath = currentCardContext.source?.file || '';

        if (deckName.startsWith('local/')) {
            // Local deck: collection/deck-name/relative-path
            const localDeckName = deckName.replace('local/', '');

            // Resolve relative path from the file's location
            // filePath is like "flashcards/file.md", so we need to resolve from that directory
            const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));

            // Build full path: collection/deck-name/file-directory/relative-href
            const fullPath = `collection/${localDeckName}/${fileDir}/${href}`;

            // Normalize path (resolve ../ and ./)
            src = normalizePath(fullPath);
        } else {
            // GitHub repo: use raw.githubusercontent.com URL
            // deckName is like "owner/repo", filePath is like "flashcards/file.md"
            const [owner, repo] = deckName.split('/');
            const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));

            // Build full path and normalize (resolve ../)
            const fullPath = `${fileDir}/${href}`;
            const normalizedPath = normalizePath(fullPath);

            // Use raw.githubusercontent.com with HEAD (resolves to the repo's default branch)
            src = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${normalizedPath}`;
        }
    }
    // Fallback to topics directory (legacy)
    else {
        src = `topics/${href}`;
    }

    const titleAttr = title ? ` title="${title}"` : '';
    const altAttr = text ? ` alt="${text}"` : '';
    return `<img src="${src}"${altAttr}${titleAttr}>`;
};

/**
 * Normalize a path by resolving . and .. segments
 */
function normalizePath(path) {
    const parts = path.split('/');
    const result = [];

    for (const part of parts) {
        if (part === '..') {
            result.pop(); // Go up one directory
        } else if (part !== '.' && part !== '') {
            result.push(part);
        }
    }

    return result.join('/');
}

marked.setOptions({
    renderer: renderer,
    // A source file may wrap prose for readability. Treat those newlines as
    // normal Markdown soft breaks so the browser can reflow the card to the
    // current laptop or phone width. Authors can still request a hard break
    // with Markdown's two trailing spaces or an explicit <br>.
    breaks: false,
    gfm: true
});

/**
 * Render LaTeX math using KaTeX
 * Supports inline $...$ and display $$...$$
 *
 * Pattern requirements for inline math:
 * - Must start with $ followed by non-whitespace
 * - Must end with non-whitespace followed by $
 * - This prevents matching currency like "$100 bills"
 */
export function renderMath(text) {
    // Standard TeX display delimiters (\[...\])
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (match, math) => {
        try {
            return katex.renderToString(math.trim(), {
                displayMode: true,
                throwOnError: false,
                output: 'html'
            });
        } catch (e) {
            return `<span class="katex-error">${e.message}</span>`;
        }
    });

    // Standard TeX inline delimiters (\(...\))
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (match, math) => {
        try {
            return katex.renderToString(math.trim(), {
                displayMode: false,
                throwOnError: false,
                output: 'html'
            });
        } catch (e) {
            return `<span class="katex-error">${e.message}</span>`;
        }
    });

    // Display math ($$...$$)
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
        try {
            return katex.renderToString(math.trim(), {
                displayMode: true,
                throwOnError: false,
                output: 'html'
            });
        } catch (e) {
            return `<span class="katex-error">${e.message}</span>`;
        }
    });

    // Inline math ($...$)
    // Pattern: $ + non-whitespace + content + non-whitespace + $
    // This prevents matching "$100 bills" as LaTeX
    text = text.replace(/\$([^\s$][^$\n]*?[^\s$])\$/g, (match, math) => {
        try {
            return katex.renderToString(math.trim(), {
                displayMode: false,
                throwOnError: false,
                output: 'html'
            });
        } catch (e) {
            return `<span class="katex-error">${e.message}</span>`;
        }
    });

    // Also handle single-character math like $x$ or $5$
    text = text.replace(/\$([^\s$])\$/g, (match, math) => {
        try {
            return katex.renderToString(math.trim(), {
                displayMode: false,
                throwOnError: false,
                output: 'html'
            });
        } catch (e) {
            return `<span class="katex-error">${e.message}</span>`;
        }
    });

    return text;
}

/**
 * Set the current card context for image path resolution
 */
export function setCardContext(card) {
    currentCardContext = card;
}

/**
 * Clear the current card context
 */
export function clearCardContext() {
    currentCardContext = null;
}

/**
 * Render markdown to HTML with math support
 */
export function markdownToHtml(markdown) {
    // First render LaTeX
    const withMath = renderMath(markdown);

    // Then render markdown and sanitize to prevent XSS
    const html = marked.parse(withMath);
    return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/**
 * Render inline markdown (for cloze deletions)
 */
export function markdownToHtmlInline(markdown) {
    const withMath = renderMath(markdown);
    const html = marked.parseInline(withMath);
    return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/**
 * Parse solution steps from P:/S: card
 * Returns array of {label, content} objects. A direct-answer prelude is held
 * until EXECUTE, or inserted immediately before EVALUATE in a faded solution,
 * so it cannot reveal the result during IDENTIFY or PLAN.
 */
export function parseSolutionSteps(solution) {
    const steps = [];
    const lines = solution.split('\n');
    let currentStep = null;
    const leadingContent = [];
    const plainStepLabels = new Set(['IDENTIFY', 'PLAN', 'EXECUTE', 'EVALUATE']);

    for (const line of lines) {
        // Accept both established spellings:
        //   **IDENTIFY**: content
        //   **IDENTIFY:** content
        // Some durable decks also use an unstyled IPEE heading:
        //   IDENTIFY: content
        const boldMatch = line.match(/^\*\*([^*]+?)(?::\*\*|\*\*:)\s*(.*)$/);
        const plainMatch = line.match(/^([A-Za-z]+):\s*(.*)$/);
        const plainLabel = plainMatch?.[1]?.toUpperCase();
        const match = boldMatch || (
            plainStepLabels.has(plainLabel)
                ? [plainMatch[0], plainLabel, plainMatch[2]]
                : null
        );

        if (match) {
            // Save previous step if exists
            if (currentStep) {
                steps.push(currentStep);
            }

            // Start new step
            currentStep = {
                label: match[1].trim(),
                content: match[2] || ''
            };
        } else if (currentStep) {
            // Continuation of current step
            currentStep.content += '\n' + line;
        } else {
            // Preserve a direct-answer prelude that appears before the first
            // structured heading instead of dropping it from the reveal flow.
            leadingContent.push(line);
        }
    }

    // Save last step
    if (currentStep) {
        steps.push(currentStep);
    }

    const prelude = leadingContent.join('\n').trim();
    if (prelude && steps.length > 0) {
        const executeIndex = steps.findIndex(step =>
            step.label?.toUpperCase() === 'EXECUTE'
        );
        if (executeIndex >= 0) {
            const execute = steps[executeIndex];
            execute.content = execute.content
                ? `${prelude}\n\n${execute.content.replace(/^\n+/, '')}`
                : prelude;
        } else {
            // A faded solution may leave its answer and working unlabelled
            // while retaining only later stages. Reveal that work after any
            // IDENTIFY/PLAN stages and immediately before EVALUATE.
            const evaluateIndex = steps.findIndex(step =>
                step.label?.toUpperCase() === 'EVALUATE'
            );
            const insertionIndex = evaluateIndex >= 0 ? evaluateIndex : steps.length;
            steps.splice(insertionIndex, 0, {
                label: null,
                content: prelude
            });
        }
    }

    return steps;
}

/**
 * Render card front (question or cloze with hidden deletion)
 */
export function renderCardFront(card) {
    // Set card context for image resolution
    currentCardContext = card;

    try {
        if (card.type === 'basic') {
            return markdownToHtml(card.content.question);
        } else if (card.type === 'problem') {
            return markdownToHtml(card.content.problem);
        } else if (card.type === 'cloze') {
            // Replace deletion with placeholder
            const CLOZE_TAG = 'CLOZE_DELETION';
            const textBytes = new TextEncoder().encode(card.content.text);
            const before = textBytes.slice(0, card.content.start);
            const after = textBytes.slice(card.content.end + 1);
            const clozeBytes = new TextEncoder().encode(CLOZE_TAG);

            const combined = new Uint8Array(before.length + clozeBytes.length + after.length);
            combined.set(before, 0);
            combined.set(clozeBytes, before.length);
            combined.set(after, before.length + clozeBytes.length);

            const textWithCloze = new TextDecoder().decode(combined);
            const html = markdownToHtml(textWithCloze);

            // Replace placeholder with styled cloze
            return html.replace(CLOZE_TAG, '<span class="cloze">.............</span>');
        }
    } finally {
        // Clear context after rendering
        currentCardContext = null;
    }
}

/**
 * Render card back (answer or cloze with revealed deletion)
 */
export function renderCardBack(card) {
    // Set card context for image resolution
    currentCardContext = card;

    try {
        if (card.type === 'basic') {
            const answerHtml = markdownToHtml(card.content.answer);
            return `<div class="answer-separator">${answerHtml}</div>`;
        } else if (card.type === 'problem') {
            // For problem cards, this is handled by step-by-step reveal
            // This function won't be called for problem cards
            return '';
        } else if (card.type === 'cloze') {
            // Extract deletion text and render it
            const textBytes = new TextEncoder().encode(card.content.text);
            const deletedBytes = textBytes.slice(card.content.start, card.content.end + 1);
            const deletedText = new TextDecoder().decode(deletedBytes);
            const deletedHtml = markdownToHtmlInline(deletedText);

            // Replace deletion with placeholder in full text
            const CLOZE_TAG = 'CLOZE_DELETION';
            const before = textBytes.slice(0, card.content.start);
            const after = textBytes.slice(card.content.end + 1);
            const clozeBytes = new TextEncoder().encode(CLOZE_TAG);

            const combined = new Uint8Array(before.length + clozeBytes.length + after.length);
            combined.set(before, 0);
            combined.set(clozeBytes, before.length);
            combined.set(after, before.length + clozeBytes.length);

            const textWithCloze = new TextDecoder().decode(combined);
            const html = markdownToHtml(textWithCloze);

            // Replace placeholder with revealed deletion
            return html.replace(CLOZE_TAG, `<span class="cloze-reveal">${deletedHtml}</span>`);
        }
    } finally {
        // Clear context after rendering
        currentCardContext = null;
    }
}

/**
 * Render a single solution step
 */
export function renderSolutionStep(step) {
    const html = markdownToHtml(step.content.trim());
    return `<div class="solution-step">
        ${step.label ? `<div class="solution-step-label">${step.label}:</div>` : ''}
        <div class="solution-step-content">${html}</div>
    </div>`;
}

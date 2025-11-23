/**
 * Markdown rendering with KaTeX support for LaTeX math
 * and image support for media
 */

import { marked } from 'marked';
import katex from 'katex';

/**
 * Configure marked renderer
 */
const renderer = new marked.Renderer();

// Custom image renderer to handle relative paths
renderer.image = function(href, title, text) {
    // Convert relative paths to absolute from topics directory
    const src = href.startsWith('http') ? href : `topics/${href}`;
    const titleAttr = title ? ` title="${title}"` : '';
    const altAttr = text ? ` alt="${text}"` : '';
    return `<img src="${src}"${altAttr}${titleAttr}>`;
};

marked.setOptions({
    renderer: renderer,
    breaks: true,
    gfm: true
});

/**
 * Render LaTeX math using KaTeX
 * Supports inline $...$ and display $$...$$
 */
function renderMath(text) {
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
    text = text.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
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
 * Render markdown to HTML with math support
 */
export function markdownToHtml(markdown) {
    // First render LaTeX
    const withMath = renderMath(markdown);

    // Then render markdown
    const html = marked.parse(withMath);

    return html;
}

/**
 * Render inline markdown (for cloze deletions)
 */
export function markdownToHtmlInline(markdown) {
    const withMath = renderMath(markdown);
    const html = marked.parseInline(withMath);
    return html;
}

/**
 * Parse solution steps from P:/S: card
 * Returns array of {label, content} objects
 */
export function parseSolutionSteps(solution) {
    const steps = [];
    const lines = solution.split('\n');
    let currentStep = null;

    for (const line of lines) {
        // Match lines like "**IDENTIFY**: content" or "**SET UP**: content"
        const match = line.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);

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
        }
    }

    // Save last step
    if (currentStep) {
        steps.push(currentStep);
    }

    return steps;
}

/**
 * Render card front (question or cloze with hidden deletion)
 */
export function renderCardFront(card) {
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
}

/**
 * Render card back (answer or cloze with revealed deletion)
 */
export function renderCardBack(card) {
    if (card.type === 'basic') {
        return markdownToHtml(card.content.answer);
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
}

/**
 * Render a single solution step
 */
export function renderSolutionStep(step) {
    const html = markdownToHtml(step.content.trim());
    return `<div class="solution-step">
        <div class="solution-step-label">${step.label}:</div>
        <div class="solution-step-content">${html}</div>
    </div>`;
}

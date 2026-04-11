/**
 * Card serialization - Convert card objects to/from markdown format
 * Supports Q:/A:, C:, and P:/S: card types
 */

import { Parser, parseDeck } from './parser.js';

/**
 * Serialize a single card to markdown string
 * @param {object} card - Card object with type and content
 * @returns {string} - Markdown representation
 */
export function serializeCard(card) {
    switch (card.type) {
        case 'basic':
            return `Q: ${card.content.question}\nA: ${card.content.answer}`;

        case 'cloze':
            // For cloze cards, we need to reconstruct the original text with brackets
            return `C: ${reconstructClozeText(card)}`;

        case 'problem':
            return `P: ${card.content.problem}\nS: ${card.content.solution}`;

        default:
            throw new Error(`Unknown card type: ${card.type}`);
    }
}

/**
 * Reconstruct cloze text with brackets from card content
 * Note: This works for cards being created/edited in the UI
 * where the text already contains brackets
 * @param {object} card - Cloze card object
 * @returns {string} - Text with [brackets] around deletions
 */
export function reconstructClozeText(card) {
    // If the card has originalText (from UI editing), use that
    if (card.originalText) {
        return card.originalText;
    }

    // For parsed cards, we need to insert brackets at the deletion position
    // The card.content.text is the clean text WITHOUT brackets
    // We need to insert brackets at start and end+1 positions
    const text = card.content.text;
    const textBytes = new TextEncoder().encode(text);

    const before = textBytes.slice(0, card.content.start);
    const deletion = textBytes.slice(card.content.start, card.content.end + 1);
    const after = textBytes.slice(card.content.end + 1);

    const openBracket = new TextEncoder().encode('[');
    const closeBracket = new TextEncoder().encode(']');

    const result = new Uint8Array(
        before.length + openBracket.length + deletion.length + closeBracket.length + after.length
    );

    let offset = 0;
    result.set(before, offset); offset += before.length;
    result.set(openBracket, offset); offset += openBracket.length;
    result.set(deletion, offset); offset += deletion.length;
    result.set(closeBracket, offset); offset += closeBracket.length;
    result.set(after, offset);

    return new TextDecoder().decode(result);
}

/**
 * Rebuild the original cloze text with brackets for a group of cloze cards
 * that all share the same content.text.
 * @param {object[]} clozeCards - Cards with identical content.text
 * @returns {string} - Text with all [brackets] re-inserted
 */
function rebuildClozeGroup(clozeCards) {
    const text = clozeCards[0].content.text;

    // If any card has originalText, prefer that (user-edited text with brackets)
    const withOriginal = clozeCards.find(c => c.originalText);
    if (withOriginal) {
        return withOriginal.originalText;
    }

    // Collect all (start, end) deletion positions and sort by start
    const deletions = clozeCards
        .map(c => ({ start: c.content.start, end: c.content.end }))
        .sort((a, b) => a.start - b.start);

    // Re-insert brackets into the clean text bytes
    const textBytes = new TextEncoder().encode(text);
    const result = [];
    let pos = 0;
    for (const { start, end } of deletions) {
        result.push(...textBytes.slice(pos, start));
        result.push(91); // '['
        result.push(...textBytes.slice(start, end + 1));
        result.push(93); // ']'
        pos = end + 1;
    }
    result.push(...textBytes.slice(pos));
    return new TextDecoder().decode(new Uint8Array(result));
}

/**
 * Serialize multiple cards to a markdown file content
 * Cloze cards sharing the same source text are grouped into a single C: block.
 * @param {object[]} cards - Array of card objects
 * @param {object} metadata - Optional TOML frontmatter metadata
 * @returns {string} - Full markdown file content
 */
export function serializeFile(cards, metadata = null) {
    let output = '';

    // Add TOML frontmatter if metadata provided
    if (metadata && (metadata.order !== null && metadata.order !== undefined || metadata.tags?.length > 0)) {
        output += '---\n';
        if (metadata.order !== null && metadata.order !== undefined) {
            output += `order = ${metadata.order}\n`;
        }
        if (metadata.tags && metadata.tags.length > 0) {
            const tagsStr = metadata.tags.map(t => `"${t}"`).join(', ');
            output += `tags = [${tagsStr}]\n`;
        }
        output += '---\n\n';
    }

    // Build an ordered list of "serializable units" — each unit is either a
    // single non-cloze card, or a group of cloze cards sharing the same text.
    const units = [];
    const seenClozeTexts = new Map(); // text → index in units[]

    for (const card of cards) {
        if (card.type !== 'cloze') {
            units.push({ type: 'card', card });
        } else {
            const key = card.content.text;
            if (seenClozeTexts.has(key)) {
                // Add to the existing group
                units[seenClozeTexts.get(key)].cards.push(card);
            } else {
                const idx = units.length;
                seenClozeTexts.set(key, idx);
                units.push({ type: 'cloze_group', cards: [card] });
            }
        }
    }

    // Serialize each unit
    const parts = units.map(unit => {
        if (unit.type === 'card') {
            return serializeCard(unit.card);
        } else {
            return `C: ${rebuildClozeGroup(unit.cards)}`;
        }
    });

    output += parts.join('\n\n---\n\n');
    return output + '\n';
}

/**
 * Create a card object from UI form data
 * @param {string} type - 'basic', 'cloze', or 'problem'
 * @param {object} formData - Form field values
 * @returns {object} - Card object ready for serialization
 */
export function createCardFromForm(type, formData) {
    switch (type) {
        case 'basic':
            return {
                type: 'basic',
                content: {
                    question: formData.question.trim(),
                    answer: formData.answer.trim()
                }
            };

        case 'cloze':
            // For cloze, formData.text contains the text with [brackets].
            // originalText preserves the bracketed form; content.text is a
            // placeholder — real start/end/text are computed by the parser on save.
            return {
                type: 'cloze',
                originalText: formData.text.trim(),
                content: {
                    text: formData.text.trim(),
                    start: 0,
                    end: 0
                }
            };

        case 'problem':
            return {
                type: 'problem',
                content: {
                    problem: formData.problem.trim(),
                    solution: formData.solution.trim()
                }
            };

        default:
            throw new Error(`Unknown card type: ${type}`);
    }
}

/**
 * Parse a markdown file and extract cards with their positions
 * @param {string} content - Markdown file content
 * @param {string} filePath - File path for error messages
 * @returns {object} - { cards, metadata, rawContent }
 */
export function parseFileContent(content, filePath = 'file.md') {
    const result = parseDeck(content, filePath);
    return {
        cards: result.cards,
        metadata: result.metadata,
        rawContent: content
    };
}

/**
 * Insert a new card into file content
 * @param {string} fileContent - Existing file content
 * @param {object} newCard - Card to insert
 * @param {number} index - Position to insert (default: end)
 * @returns {string} - Updated file content
 */
export function insertCard(fileContent, newCard, index = -1) {
    const { cards, metadata } = parseFileContent(fileContent);

    // Insert at specified position or end
    if (index < 0 || index >= cards.length) {
        cards.push(newCard);
    } else {
        cards.splice(index, 0, newCard);
    }

    return serializeFile(cards, metadata);
}

/**
 * Update a card in file content
 * @param {string} fileContent - Existing file content
 * @param {number} cardIndex - Index of card to update
 * @param {object} updatedCard - New card data
 * @returns {string} - Updated file content
 */
export function updateCard(fileContent, cardIndex, updatedCard) {
    const { cards, metadata } = parseFileContent(fileContent);

    if (cardIndex < 0 || cardIndex >= cards.length) {
        throw new Error(`Card index ${cardIndex} out of bounds`);
    }

    cards[cardIndex] = updatedCard;

    return serializeFile(cards, metadata);
}

/**
 * Remove a card from file content
 * @param {string} fileContent - Existing file content
 * @param {number} cardIndex - Index of card to remove
 * @returns {string} - Updated file content (or null if file should be deleted)
 */
export function removeCard(fileContent, cardIndex) {
    const { cards, metadata } = parseFileContent(fileContent);

    if (cardIndex < 0 || cardIndex >= cards.length) {
        throw new Error(`Card index ${cardIndex} out of bounds`);
    }

    cards.splice(cardIndex, 1);

    // If no cards left, signal that file should be deleted
    if (cards.length === 0) {
        return null;
    }

    return serializeFile(cards, metadata);
}

/**
 * Validate card form data
 * @param {string} type - Card type
 * @param {object} formData - Form field values
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validateCard(type, formData) {
    const errors = [];

    switch (type) {
        case 'basic':
            if (!formData.question?.trim()) {
                errors.push('Question is required');
            }
            if (!formData.answer?.trim()) {
                errors.push('Answer is required');
            }
            break;

        case 'cloze':
            if (!formData.text?.trim()) {
                errors.push('Cloze text is required');
            } else {
                // Check for at least one cloze deletion
                const hasDeletion = /\[[^\]]+\]/.test(formData.text);
                // But not image syntax
                const onlyImages = formData.text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
                const hasRealDeletion = /\[[^\]]+\]/.test(onlyImages);

                if (!hasRealDeletion) {
                    errors.push('Cloze text must contain at least one [deletion] in brackets');
                }
            }
            break;

        case 'problem':
            if (!formData.problem?.trim()) {
                errors.push('Problem is required');
            }
            if (!formData.solution?.trim()) {
                errors.push('Solution is required');
            }
            break;

        default:
            errors.push(`Unknown card type: ${type}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Extract form data from an existing card (for editing)
 * @param {object} card - Parsed card object
 * @returns {object} - Form data object
 */
export function cardToFormData(card) {
    switch (card.type) {
        case 'basic':
            return {
                question: card.content.question,
                answer: card.content.answer
            };

        case 'cloze':
            // Reconstruct the text with brackets
            return {
                text: reconstructClozeText(card)
            };

        case 'problem':
            return {
                problem: card.content.problem,
                solution: card.content.solution
            };

        default:
            throw new Error(`Unknown card type: ${card.type}`);
    }
}

/**
 * Count cloze deletions in text
 * @param {string} text - Text with [brackets]
 * @returns {number} - Number of deletions
 */
export function countClozeDeletions(text) {
    // Remove image syntax first
    const withoutImages = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    // Count remaining brackets
    const matches = withoutImages.match(/\[[^\]]+\]/g);
    return matches ? matches.length : 0;
}

import { parseDeck } from './parser.js';
import { hashCard } from './hasher.js';

function bodyLineOffset(markdown) {
    const lines = markdown.split('\n');
    const delimiter = ['+++', '---'].includes(lines[0]?.trim()) ? lines[0].trim() : null;
    if (!delimiter) return 0;
    const closing = lines.findIndex((line, index) => index > 0 && line.trim() === delimiter);
    return closing === -1 ? 0 : closing + 1;
}

/**
 * Insert stable IDs and legacy content-hash aliases without rewriting cards.
 * Existing IDs are left byte-for-byte intact, making this safe to rerun.
 */
export function annotateCardIds(markdown, filePath, idFactory) {
    const { cards } = parseDeck(markdown, filePath);
    const groups = new Map();
    for (const card of cards) {
        if (!groups.has(card.range[0])) groups.set(card.range[0], []);
        groups.get(card.range[0]).push(card);
    }

    const missing = [...groups.entries()]
        .filter(([, group]) => group.every(card => !card.stableId));
    if (missing.length === 0) return { markdown, addedBlocks: 0, addedCards: 0 };

    const lines = markdown.split('\n');
    const offset = bodyLineOffset(markdown);
    let addedCards = 0;
    for (const [startLine, group] of missing.sort((a, b) => b[0] - a[0])) {
        const stableId = idFactory();
        const annotations = [
            `<!-- card-id: ${stableId} -->`,
            ...group.map(card => `<!-- card-alias: ${hashCard(card)} -->`)
        ];
        lines.splice(offset + startLine, 0, ...annotations);
        addedCards += group.length;
    }

    return {
        markdown: lines.join('\n'),
        addedBlocks: missing.length,
        addedCards
    };
}

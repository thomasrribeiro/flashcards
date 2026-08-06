import { parseDeck } from './parser.js';
import { hashCard, hashCardIdentity } from './hasher.js';

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

/**
 * Add the stable hashes from a repository's previous namespace as aliases.
 *
 * Stable card IDs are intentionally namespaced by repository. Before a GitHub
 * repository is renamed, preserving the old namespace hash lets the normal
 * review-identity migration move saved FSRS state to the renamed repository.
 */
export function annotateNamespaceAliases(markdown, filePath, oldNamespace) {
    if (!oldNamespace || typeof oldNamespace !== 'string') {
        throw new Error('An old repository namespace is required');
    }

    const { cards } = parseDeck(markdown, filePath);
    const groups = new Map();
    for (const card of cards) {
        if (!groups.has(card.range[0])) groups.set(card.range[0], []);
        groups.get(card.range[0]).push(card);
    }

    const additions = [];
    for (const [startLine, group] of groups) {
        if (group.some(card => !card.stableId)) {
            throw new Error(`Cannot preserve a namespace before every card has a stable ID: ${filePath}`);
        }

        const aliases = group.map(card => hashCardIdentity(card, oldNamespace));
        if (aliases.every((alias, index) => group[index].legacyHashes?.includes(alias))) continue;

        // The current Markdown syntax assigns one alias to each deletion in a
        // multi-cloze block. It cannot safely encode a second alias set without
        // making deletion-to-alias order ambiguous.
        if (group.length > 1 && group.some(card => card.legacyHashes?.length)) {
            throw new Error(`Cannot append namespace aliases to a multi-cloze block with existing aliases: ${filePath}:${startLine + 1}`);
        }

        additions.push({
            startLine,
            aliases: aliases.filter((alias, index) => !group[index].legacyHashes?.includes(alias)),
            cardCount: group.length
        });
    }

    if (additions.length === 0) return { markdown, addedBlocks: 0, addedCards: 0 };

    const lines = markdown.split('\n');
    const offset = bodyLineOffset(markdown);
    let addedCards = 0;
    for (const addition of additions.sort((a, b) => b.startLine - a.startLine)) {
        lines.splice(
            offset + addition.startLine,
            0,
            ...addition.aliases.map(alias => `<!-- card-alias: ${alias} -->`)
        );
        addedCards += addition.cardCount;
    }

    return {
        markdown: lines.join('\n'),
        addedBlocks: additions.length,
        addedCards
    };
}

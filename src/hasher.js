/**
 * BLAKE3 hashing for content-addressable cards
 * Matches hashcards hash implementation
 */

import { blake3 } from '@noble/hashes/blake3';

const encoder = new TextEncoder();

/**
 * Create a BLAKE3 hash from card content
 * Returns hex string representation
 */
export function hashCard(card) {
    const hasher = blake3.create({});

    if (card.type === 'basic') {
        hasher.update(encoder.encode('Basic'));
        hasher.update(encoder.encode(card.content.question));
        hasher.update(encoder.encode(card.content.answer));
    } else if (card.type === 'problem') {
        hasher.update(encoder.encode('Problem'));
        hasher.update(encoder.encode(card.content.problem));
        hasher.update(encoder.encode(card.content.solution));
    } else if (card.type === 'cloze') {
        hasher.update(encoder.encode('Cloze'));
        hasher.update(encoder.encode(card.content.text));
        // Convert start/end to little-endian bytes
        const startBytes = new Uint8Array(8);
        const endBytes = new Uint8Array(8);
        new DataView(startBytes.buffer).setUint32(0, card.content.start, true);
        new DataView(endBytes.buffer).setUint32(0, card.content.end, true);
        hasher.update(startBytes);
        hasher.update(endBytes);
    }

    const hash = hasher.digest();
    return bytesToHex(hash);
}

/**
 * Get family hash for cloze cards
 * All cloze cards from same text share a family hash
 * Returns null for basic cards
 */
export function familyHash(card) {
    if (card.type !== 'cloze') {
        return null;
    }

    const hasher = blake3.create({});
    hasher.update(encoder.encode('Cloze'));
    hasher.update(encoder.encode(card.content.text));

    const hash = hasher.digest();
    return bytesToHex(hash);
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Add hash and familyHash to card object
 */
export function addHashToCard(card) {
    return {
        ...card,
        hash: hashCard(card),
        familyHash: familyHash(card)
    };
}

/**
 * Process array of cards, adding hashes and deduplicating
 */
export function processCards(cards) {
    const cardsWithHashes = cards.map(addHashToCard);

    // Sort by hash for determinism
    cardsWithHashes.sort((a, b) => a.hash.localeCompare(b.hash));

    // Deduplicate by hash
    const seen = new Set();
    return cardsWithHashes.filter(card => {
        if (seen.has(card.hash)) {
            return false;
        }
        seen.add(card.hash);
        return true;
    });
}

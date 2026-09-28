/**
 * BLAKE3 hashing for content-addressable cards
 * Matches hashcards hash implementation
 */

import { blake3 } from '@noble/hashes/blake3';

const encoder = new TextEncoder();

/**
 * Normalise a string before hashing so that identical content produces
 * the same hash regardless of platform line endings or Unicode form.
 * Matches the canonical form expected by the Rust hashcards implementation.
 */
function normalizeText(s) {
    return s.replace(/\r\n/g, '\n').normalize('NFC');
}

/**
 * Create a BLAKE3 hash from card content
 * Returns hex string representation
 */
function hashCard(card) {
    const hasher = blake3.create({});

    if (card.type === 'basic') {
        hasher.update(encoder.encode('Basic'));
        hasher.update(encoder.encode(normalizeText(card.content.question)));
        hasher.update(encoder.encode(normalizeText(card.content.answer)));
    } else if (card.type === 'problem') {
        hasher.update(encoder.encode('Problem'));
        hasher.update(encoder.encode(normalizeText(card.content.problem)));
        hasher.update(encoder.encode(normalizeText(card.content.solution)));
    } else if (card.type === 'cloze') {
        hasher.update(encoder.encode('Cloze'));
        hasher.update(encoder.encode(normalizeText(card.content.text)));
        // Rust stores start/end as u64 (8 bytes, little-endian).
        // All byte positions fit in u32 in practice, so the upper 4 bytes
        // remain zero — matching u64::to_le_bytes() for values < 2^32.
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
 * Return the persistent identity hash for a card.
 *
 * Legacy cards remain content-addressed. Cards with an explicit stableId are
 * instead keyed by that ID within their repository namespace, allowing
 * presentation-only content changes to retain their review history.
 */
function hashCardIdentity(card, namespace = '') {
    if (!card.stableId) return hashCard(card);

    const hasher = blake3.create({});
    hasher.update(encoder.encode('StableCardId'));
    hasher.update(encoder.encode(normalizeText(String(namespace))));
    hasher.update(encoder.encode('\0'));
    hasher.update(encoder.encode(normalizeText(String(card.stableId))));
    return bytesToHex(hasher.digest());
}

/**
 * Add both persistent identity and current content version information.
 * Legacy aliases remain part of the identity metadata for future migrations.
 */
export function identifyCard(card, namespace = '') {
    const contentHash = hashCard(card);
    const hash = hashCardIdentity(card, namespace);
    const legacyHashes = card.stableId
        ? [...new Set([...(card.legacyHashes || []), contentHash])]
            .filter(alias => alias !== hash)
        : [];

    return { hash, contentHash, legacyHashes };
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

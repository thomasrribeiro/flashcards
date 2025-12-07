/**
 * Prerequisites Module
 *
 * Handles resolution, fetching, and formatting of prerequisite flashcard files.
 * Supports:
 * - Local files (resolved relative to deck's flashcards/ directory)
 * - Remote GitHub URLs (blob, raw, and github: shorthand)
 * - Recursive chaining with cycle detection
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';

/**
 * Parse a prerequisite reference string into a normalized format
 * @param {string} prereq - Local filename, GitHub URL, or github: shorthand
 * @param {string} deckPath - Path to current deck (for resolving local files)
 * @returns {{ type: 'local'|'remote', path: string, originalRef: string, url?: string }}
 */
export function parsePrereqRef(prereq, deckPath) {
  const originalRef = prereq;

  // 1. GitHub shorthand: github:owner/repo/branch/path/to/file.md
  if (prereq.startsWith('github:')) {
    const path = prereq.slice(7); // Remove 'github:'
    const rawUrl = `https://raw.githubusercontent.com/${path}`;
    return { type: 'remote', path: prereq, originalRef, url: rawUrl };
  }

  // 2. GitHub blob URL: https://github.com/owner/repo/blob/branch/path
  if (prereq.includes('github.com') && prereq.includes('/blob/')) {
    const rawUrl = prereq
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
    return { type: 'remote', path: prereq, originalRef, url: rawUrl };
  }

  // 3. Raw GitHub URL: https://raw.githubusercontent.com/...
  if (prereq.includes('raw.githubusercontent.com')) {
    return { type: 'remote', path: prereq, originalRef, url: prereq };
  }

  // 4. Local file: resolve relative to deck's flashcards/ directory
  const localPath = join(deckPath, 'flashcards', prereq);
  return { type: 'local', path: localPath, originalRef };
}

/**
 * Parse TOML frontmatter from flashcard content to extract prereqs
 * @param {string} content - Flashcard markdown content
 * @returns {{ prereqs: string[], content: string }}
 */
function parsePrereqsFromContent(content) {
  // Extract frontmatter block
  const frontmatterMatch = content.match(/^\+\+\+([\s\S]*?)\+\+\+/);
  if (!frontmatterMatch) {
    return { prereqs: [], content };
  }

  const frontmatterText = frontmatterMatch[1];
  const cleanContent = content.replace(/^\+\+\+[\s\S]*?\+\+\+\s*/, '');

  // Parse prereqs from frontmatter (support both 'prereqs' and 'prerequisites')
  let prereqs = [];

  const prereqsMatch = frontmatterText.match(/^prereqs\s*=\s*\[(.*?)\]/m);
  if (prereqsMatch) {
    prereqs = prereqsMatch[1].split(',').map(p => p.trim().replace(/"/g, '')).filter(Boolean);
  }

  // Also check for 'prerequisites' (backwards compatibility)
  const prerequisitesMatch = frontmatterText.match(/^prerequisites\s*=\s*\[(.*?)\]/m);
  if (prerequisitesMatch && prereqs.length === 0) {
    prereqs = prerequisitesMatch[1].split(',').map(p => p.trim().replace(/"/g, '')).filter(Boolean);
  }

  return { prereqs, content: cleanContent };
}

/**
 * Fetch content of a single prerequisite file
 * @param {{ type: 'local'|'remote', path: string, url?: string }} prereqRef
 * @returns {Promise<{ content: string, prereqs: string[] }>}
 */
async function fetchPrereqContent(prereqRef) {
  if (prereqRef.type === 'local') {
    if (!existsSync(prereqRef.path)) {
      throw new Error(`Prerequisite file not found: ${prereqRef.path}`);
    }
    const rawContent = readFileSync(prereqRef.path, 'utf-8');
    const { prereqs, content } = parsePrereqsFromContent(rawContent);
    return { content, prereqs };
  }

  // Remote fetch
  try {
    const response = await fetch(prereqRef.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const rawContent = await response.text();
    const { prereqs, content } = parsePrereqsFromContent(rawContent);
    return { content, prereqs };
  } catch (error) {
    throw new Error(`Failed to fetch remote prerequisite ${prereqRef.url}: ${error.message}`);
  }
}

/**
 * Get a normalized key for cycle detection
 * @param {{ type: 'local'|'remote', path: string, url?: string }} prereqRef
 * @returns {string}
 */
function getNormalizedKey(prereqRef) {
  if (prereqRef.type === 'local') {
    return resolve(prereqRef.path);
  }
  return prereqRef.url;
}

/**
 * Recursively resolve all prerequisites with cycle detection
 * @param {string[]} directPrereqs - Direct prereq references
 * @param {string} deckPath - Current deck path
 * @param {Set<string>} seen - Already-processed prereqs (for cycle detection)
 * @param {number} depth - Current recursion depth
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Promise<Array<{ path: string, content: string, depth: number }>>}
 */
export async function resolvePrereqChain(directPrereqs, deckPath, seen = new Set(), depth = 0, verbose = false) {
  const results = [];

  for (const prereq of directPrereqs) {
    const ref = parsePrereqRef(prereq, deckPath);
    const normalizedKey = getNormalizedKey(ref);

    // Cycle detection
    if (seen.has(normalizedKey)) {
      console.warn(`\x1b[33m⚠ Circular dependency detected, skipping: ${prereq}\x1b[0m`);
      continue;
    }
    seen.add(normalizedKey);

    try {
      // Fetch content
      const { content, prereqs: nestedPrereqs } = await fetchPrereqContent(ref);

      if (verbose) {
        console.log(`  ✓ Loaded: ${ref.originalRef} (depth ${depth})`);
      }

      results.push({
        path: ref.originalRef,
        content,
        depth,
        type: ref.type
      });

      // Recurse into this prereq's dependencies
      if (nestedPrereqs && nestedPrereqs.length > 0) {
        if (verbose) {
          console.log(`    → Chaining: ${nestedPrereqs.join(', ')}`);
        }

        // For remote prereqs, we need to determine the deck path for their nested prereqs
        // Remote prereqs' nested local refs are relative to that remote repo
        // For simplicity, we only chain local refs from remote prereqs if they're also remote
        const nestedDeckPath = ref.type === 'local' ? deckPath : null;

        const nestedResults = await resolvePrereqChain(
          nestedPrereqs,
          nestedDeckPath || deckPath,
          seen,
          depth + 1,
          verbose
        );
        results.push(...nestedResults);
      }
    } catch (error) {
      console.error(`\x1b[31m✗ Failed to load prerequisite: ${prereq}\x1b[0m`);
      console.error(`  ${error.message}`);
      throw error;
    }
  }

  return results;
}

/**
 * Format resolved prerequisites for injection into Claude prompt
 * Sorts by depth descending (highest depth = most foundational = appears first)
 * @param {Array<{ path: string, content: string, depth: number }>} resolvedPrereqs
 * @returns {string} Formatted prerequisite section for prompt
 */
export function formatPrereqsForPrompt(resolvedPrereqs) {
  if (!resolvedPrereqs || resolvedPrereqs.length === 0) {
    return '';
  }

  // Sort by depth descending (highest depth = most foundational = first)
  const sorted = [...resolvedPrereqs].sort((a, b) => b.depth - a.depth);

  let output = `<prerequisite_flashcards>
These flashcards have already been created and cover foundational concepts.
You may reference these concepts without re-explaining them.
The prerequisite flashcards are ordered from most foundational to most recent.

**Guidelines:**
- Assume the reader has mastered all prerequisite content
- Reference prerequisite concepts naturally (e.g., "Using the definition of momentum...")
- Do NOT repeat definitions already covered in prerequisites
- DO introduce new connections between prerequisite concepts and new material

`;

  for (const prereq of sorted) {
    output += `<!-- ${prereq.path} (depth: ${prereq.depth}) -->\n`;
    output += `${prereq.content}\n\n`;
  }

  output += `</prerequisite_flashcards>`;
  return output;
}

/**
 * Main entry point: resolve prerequisites and format for prompt
 * @param {string[]} prereqRefs - Prerequisite references from CLI
 * @param {string} deckPath - Path to deck directory
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Promise<{ content: string, count: number, resolved: Array }>}
 */
export async function loadPrerequisites(prereqRefs, deckPath, verbose = false) {
  if (!prereqRefs || prereqRefs.length === 0) {
    return { content: '', count: 0, resolved: [] };
  }

  console.log(`\x1b[34m📚 Loading prerequisites...\x1b[0m`);

  const resolved = await resolvePrereqChain(prereqRefs, deckPath, new Set(), 0, verbose);
  const content = formatPrereqsForPrompt(resolved);

  console.log(`\x1b[32m✓ Loaded ${resolved.length} prerequisite file(s)${resolved.length > prereqRefs.length ? ` (${prereqRefs.length} direct + ${resolved.length - prereqRefs.length} chained)` : ''}\x1b[0m`);

  return { content, count: resolved.length, resolved };
}

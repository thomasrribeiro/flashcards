import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, chmodSync, mkdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { createHash, randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { loadPrerequisites } from './prerequisites.js';

const CONFIG_DIR = join(homedir(), '.flashcards');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Anthropic OAuth configuration
const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_AUTH_URL = 'https://claude.ai/oauth/authorize';
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';

// ==================== Configuration Management ====================

export function loadConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`\x1b[33m⚠\x1b[0m Warning: Could not load config: ${error.message}`);
    return null;
  }
}

export function saveConfig(data) {
  try {
    // Create config directory if it doesn't exist
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }

    // Write config file
    writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');

    // Set restrictive permissions (user-only read/write)
    try {
      chmodSync(CONFIG_FILE, 0o600);
    } catch (permError) {
      // Permissions setting might fail on some systems, that's okay
    }

    return true;
  } catch (error) {
    console.error(`\x1b[31m❌ Error saving config: ${error.message}\x1b[0m`);
    return false;
  }
}

export async function validateApiKey(apiKey) {
  try {
    const client = new Anthropic({ apiKey });

    // Make a minimal API call to test the key
    await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }]
    });

    return { valid: true, error: null };
  } catch (error) {
    if (error.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      return { valid: false, error: 'Network error - check your internet connection' };
    }
    return { valid: false, error: error.message };
  }
}

// ==================== OAuth Functions ====================

function generatePKCE() {
  // Generate code verifier (random 32 bytes)
  const verifier = randomBytes(32)
    .toString('base64url')
    .replace(/=/g, '');

  // Generate code challenge (SHA256 of verifier)
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url')
    .replace(/=/g, '');

  return { verifier, challenge };
}

export function generateOAuthURL() {
  const pkce = generatePKCE();

  const params = new URLSearchParams({
    code: 'true',
    client_id: ANTHROPIC_CLIENT_ID,
    response_type: 'code',
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    scope: ANTHROPIC_SCOPES,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state: pkce.verifier
  });

  return {
    url: `${ANTHROPIC_AUTH_URL}?${params.toString()}`,
    verifier: pkce.verifier
  };
}

export async function exchangeOAuthCode(code, verifier) {
  // Parse code (format: "code#state")
  const [authCode, state] = code.split('#');

  const payload = {
    code: authCode,
    state: state || null,
    grant_type: 'authorization_code',
    client_id: ANTHROPIC_CLIENT_ID,
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    code_verifier: verifier
  };

  try {
    const response = await fetch(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();

    const authInfo = {
      type: 'oauth',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in
    };

    saveConfig(authInfo);
    return authInfo;
  } catch (error) {
    throw new Error(`OAuth exchange failed: ${error.message}`);
  }
}

export async function refreshOAuthToken() {
  const config = loadConfig();
  if (!config || config.type !== 'oauth') {
    return null;
  }

  const payload = {
    grant_type: 'refresh_token',
    refresh_token: config.refresh_token,
    client_id: ANTHROPIC_CLIENT_ID
  };

  try {
    const response = await fetch(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    const tokenData = await response.json();

    const authInfo = {
      ...config,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in
    };

    saveConfig(authInfo);
    return tokenData.access_token;
  } catch (error) {
    return null;
  }
}

export async function isClaudeCodeCLIAvailable() {
  const { execSync } = await import('child_process');
  try {
    execSync('which claude', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function getAccessToken() {
  const config = loadConfig();

  // Prefer Claude Code CLI if available (works with Max/Pro subscription)
  if (await isClaudeCodeCLIAvailable()) {
    return 'USE_CLAUDE_CODE_CLI';  // Special marker
  }

  // Return OAuth access token if available
  if (config && config.type === 'oauth' && config.access_token) {
    return config.access_token;
  }

  // Return API key if available
  if (config && config.anthropic_api_key) {
    return config.anthropic_api_key;
  }

  return null;
}

export function isOAuthConfigured() {
  const config = loadConfig();
  return config && config.type === 'oauth';
}

// ==================== Deck Detection & Validation ====================

export function findDeckDirectory(startPath = process.cwd()) {
  let currentPath = resolve(startPath);
  const root = resolve('/');

  while (currentPath !== root) {
    // Check if this directory looks like a deck
    const hasFlashcards = existsSync(join(currentPath, 'flashcards'));
    const hasReferences = existsSync(join(currentPath, 'references'));

    if (hasFlashcards || hasReferences) {
      return currentPath;
    }

    currentPath = dirname(currentPath);
  }

  return null;
}

export function validateDeckStructure(deckPath) {
  const required = ['flashcards', 'references'];
  const missing = [];

  for (const folder of required) {
    if (!existsSync(join(deckPath, folder))) {
      missing.push(folder);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

export function listPDFsInReferences(deckPath) {
  const referencesPath = join(deckPath, 'references');

  if (!existsSync(referencesPath)) {
    return [];
  }

  try {
    const files = readdirSync(referencesPath);
    return files.filter(f => f.toLowerCase().endsWith('.pdf'));
  } catch (error) {
    return [];
  }
}

// ==================== Guides Loading ====================

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/thomasrribeiro/flashcards/master/templates/guides';

/**
 * Load guides from the public flashcards GitHub repository
 * Guides are always fetched fresh to ensure users have the latest version
 * @param {string|string[]} templates - Optional subject-specific template(s) (e.g., 'physics' or ['physics', 'chemistry'])
 * @returns {Promise<Object>} { content, files, warning }
 */
export async function loadGuides(templates = null) {
  // Normalize templates to array
  const templateList = templates
    ? (Array.isArray(templates) ? templates : [templates])
    : [];

  // Build list of guide files to fetch
  // Always include general.md first
  const filesToFetch = ['general.md'];

  // Add subject-specific templates
  for (const template of templateList) {
    const templateFile = `${template}.md`;
    if (!filesToFetch.includes(templateFile)) {
      filesToFetch.push(templateFile);
    }
  }

  let content = '';
  const loadedFiles = [];
  const warnings = [];

  for (const filename of filesToFetch) {
    try {
      const url = `${GITHUB_RAW_BASE}/${filename}`;
      const response = await fetch(url);

      if (response.ok) {
        const guideContent = await response.text();
        const guideName = filename.replace('.md', '');

        // Add section marker
        content += `\n\n# GUIDE: ${guideName.toUpperCase()} (${filename})\n\n`;
        content += guideContent;

        loadedFiles.push(filename);
      } else if (response.status === 404) {
        warnings.push(`Guide not found: ${filename}`);
      } else {
        warnings.push(`Failed to fetch ${filename}: HTTP ${response.status}`);
      }
    } catch (error) {
      warnings.push(`Failed to fetch ${filename}: ${error.message}`);
    }
  }

  if (loadedFiles.length === 0) {
    return {
      content: '',
      files: [],
      warning: warnings.length > 0 ? warnings.join('; ') : 'No guides could be loaded'
    };
  }

  return {
    content,
    files: loadedFiles,
    warning: warnings.length > 0 ? warnings.join('; ') : null
  };
}

// ==================== Source Content Loading ====================

/**
 * Load content from a parsed source directory (e.g., from PDF processing)
 * @param {string} sourceDir - Path to source directory containing content.json and images/
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} { content: Array, imagesDir: string, baseName: string }
 */
export function loadSourceContent(sourceDir, verbose = false) {
  // Find content.json (new format) or *_content_list.json (legacy format)
  const files = readdirSync(sourceDir);
  let contentListFile = files.find(f => f === 'content.json');
  if (!contentListFile) {
    contentListFile = files.find(f => f.endsWith('_content_list.json'));
  }

  if (!contentListFile) {
    throw new Error(`No content.json or *_content_list.json file found in ${sourceDir}`);
  }

  const contentListPath = join(sourceDir, contentListFile);
  const imagesDir = join(sourceDir, 'images');

  // Extract base name:
  // - For content.json (new format), use folder name
  // - For *_content_list.json (legacy format), strip suffix
  let baseName;
  if (contentListFile === 'content.json') {
    baseName = basename(sourceDir);
  } else {
    baseName = contentListFile.replace('_content_list.json', '');
  }

  if (verbose) {
    console.log(`[DEBUG] Loading source content from: ${contentListPath}`);
    console.log(`[DEBUG] Images directory: ${imagesDir}`);
    console.log(`[DEBUG] Base name: ${baseName}`);
  }

  // Load and parse the JSON
  const contentJson = readFileSync(contentListPath, 'utf-8');
  const content = JSON.parse(contentJson);

  if (verbose) {
    console.log(`[DEBUG] Loaded ${content.length} content blocks`);
    const imageBlocks = content.filter(b => b.type === 'image');
    console.log(`[DEBUG] Found ${imageBlocks.length} image blocks`);
  }

  // Check if images directory exists
  const hasImages = existsSync(imagesDir);
  if (verbose && hasImages) {
    const imageCount = readdirSync(imagesDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f)).length;
    console.log(`[DEBUG] Images directory contains ${imageCount} images`);
  }

  return {
    content,
    imagesDir: hasImages ? imagesDir : null,
    baseName,
    contentListPath
  };
}

/**
 * Convert source content array to formatted text for Claude
 * @param {Array} content - Source content.json array
 * @returns {string} Formatted text representation
 */
export function formatSourceContentForClaude(content) {
  let result = '';
  let currentPage = -1;

  for (const block of content) {
    // Add page marker when page changes
    if (block.page_idx !== undefined && block.page_idx !== currentPage) {
      currentPage = block.page_idx;
      result += `\n\n=== PAGE ${currentPage + 1} ===\n\n`;
    }

    switch (block.type) {
      case 'text':
        // Handle text with optional heading level
        if (block.text_level) {
          const headingPrefix = '#'.repeat(Math.min(block.text_level, 6));
          result += `${headingPrefix} ${block.text}\n\n`;
        } else {
          result += `${block.text}\n\n`;
        }
        break;

      case 'image':
        // Include image with caption info for Claude's context
        const imgPath = block.img_path || '';
        const caption = block.image_caption?.join(' ') || '';
        const footnote = block.image_footnote?.join(' ') || '';

        result += `[IMAGE: ${imgPath}]\n`;
        if (caption) result += `Caption: ${caption}\n`;
        if (footnote) result += `Note: ${footnote}\n`;
        result += '\n';
        break;

      case 'list':
        // Handle list items
        if (block.list_items && Array.isArray(block.list_items)) {
          for (const item of block.list_items) {
            result += `• ${item}\n`;
          }
          result += '\n';
        }
        break;

      case 'table':
        // Include table indicator
        result += `[TABLE]\n${block.text || ''}\n\n`;
        break;

      case 'header':
      case 'footer':
      case 'page_number':
        // Skip these metadata types
        break;

      default:
        // Handle any other type with text
        if (block.text) {
          result += `${block.text}\n\n`;
        }
    }
  }

  return result.trim();
}

/**
 * Extract list of all image paths from source content
 * @param {Array} content - Source content.json array
 * @returns {Array} List of image paths with metadata
 */
export function extractImageList(content) {
  return content
    .filter(block => block.type === 'image' && block.img_path)
    .map(block => ({
      path: block.img_path,
      caption: block.image_caption?.join(' ') || '',
      footnote: block.image_footnote?.join(' ') || '',
      page: block.page_idx
    }));
}

// ==================== JSON Chunking for Large Documents ====================

/**
 * Split source content array into chunks by page boundaries
 * @param {Array} content - Full content.json array
 * @param {number} maxCharsPerChunk - Target max chars per chunk (default: 120000)
 * @returns {Array<{content: Array, startPage: number, endPage: number}>}
 */
export function chunkContentByPages(content, maxCharsPerChunk = 120000) {
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  let chunkStartPage = 0;
  let lastPage = -1;

  for (const block of content) {
    // Estimate formatted size of this block
    const blockText = formatBlockForSize(block);
    const blockSize = blockText.length;
    const blockPage = block.page_idx ?? lastPage;

    // Initialize start page for first chunk
    if (currentChunk.length === 0) {
      chunkStartPage = blockPage >= 0 ? blockPage : 0;
    }

    // Start new chunk if:
    // 1. Adding this block would exceed limit AND
    // 2. We're at a page boundary (new page) AND
    // 3. Current chunk is not empty
    if (currentSize + blockSize > maxCharsPerChunk && blockPage !== lastPage && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk,
        startPage: chunkStartPage,
        endPage: lastPage >= 0 ? lastPage : chunkStartPage
      });
      currentChunk = [];
      currentSize = 0;
      chunkStartPage = blockPage >= 0 ? blockPage : 0;
    }

    currentChunk.push(block);
    currentSize += blockSize;
    if (blockPage >= 0) {
      lastPage = blockPage;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk,
      startPage: chunkStartPage,
      endPage: lastPage >= 0 ? lastPage : chunkStartPage
    });
  }

  return chunks;
}

/**
 * Estimate formatted size of a single content block
 * @param {Object} block - Content block from source
 * @returns {string} Formatted text representation
 */
function formatBlockForSize(block) {
  let result = '';

  switch (block.type) {
    case 'text':
      if (block.text_level) {
        result = `${'#'.repeat(Math.min(block.text_level, 6))} ${block.text}\n\n`;
      } else {
        result = `${block.text}\n\n`;
      }
      break;

    case 'image':
      const imgPath = block.img_path || '';
      const caption = block.image_caption?.join(' ') || '';
      const footnote = block.image_footnote?.join(' ') || '';
      result = `[IMAGE: ${imgPath}]\n${caption ? `Caption: ${caption}\n` : ''}${footnote ? `Note: ${footnote}\n` : ''}\n`;
      break;

    case 'list':
      if (block.list_items && Array.isArray(block.list_items)) {
        result = block.list_items.map(item => `• ${item}\n`).join('') + '\n';
      }
      break;

    case 'table':
      result = `[TABLE]\n${block.text || ''}\n\n`;
      break;

    default:
      if (block.text) {
        result = `${block.text}\n\n`;
      }
  }

  return result;
}

/**
 * Get git commit hash from the flashcards CLI repository
 * This captures the version of the CLI tool used to generate flashcards,
 * allowing reproducibility by checking out the same commit from
 * https://github.com/thomasrribeiro/flashcards
 * @returns {string} Git commit hash (short form) or empty string if not available
 */
export function getFlashcardsRepoCommit() {
  try {
    // Get the directory containing this file (bin/lib/), go up two levels to repo root
    // bin/lib/claude-client.js -> bin/lib -> bin -> repo root
    const filePath = new URL(import.meta.url).pathname;
    const cliRepoPath = dirname(dirname(dirname(filePath)));
    const commit = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      cwd: cliRepoPath,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return commit;
  } catch {
    return '';
  }
}

/**
 * Generate TOML frontmatter for flashcard files
 * Includes ordering/metadata fields and generation info for reproducibility
 * @param {Object} options - Frontmatter options
 * @param {number} options.order - Order number for sorting
 * @param {string[]} options.tags - Tags for categorization
 * @param {string[]} options.prereqs - Prerequisite flashcard files
 * @param {Object} options.generation - Generation metadata object
 * @returns {string} TOML frontmatter block
 */
export function generateFrontmatter(options = {}) {
  const { order, tags = [], prereqs = [], generation = null } = options;

  let frontmatter = '+++\n';

  // Add ordering/metadata fields if provided
  if (order !== undefined) {
    frontmatter += `order = ${order}\n`;
  }
  if (tags.length > 0) {
    frontmatter += `tags = [${tags.map(t => `"${t}"`).join(', ')}]\n`;
  }
  if (prereqs.length > 0) {
    frontmatter += `prereqs = [${prereqs.map(p => `"${p}"`).join(', ')}]\n`;
  }

  // Add generation metadata if provided
  if (generation) {
    frontmatter += `
[generation]
source = "${generation.source || ''}"
images_dir = "${generation.imagesDir || ''}"
generated_at = "${generation.generatedAt || new Date().toISOString()}"
flashcards_commit = "${generation.flashcardsCommit || getFlashcardsRepoCommit()}"
model = "${generation.model || ''}"
guides = [${(generation.guides || []).map(g => `"${g}"`).join(', ')}]
`;
  }

  frontmatter += '+++\n\n';
  return frontmatter;
}

/**
 * Prepend TOML frontmatter to flashcard content
 * @param {string} flashcards - Flashcard markdown content (without frontmatter)
 * @param {Object} options - Frontmatter options (order, tags, prereqs, generation)
 * @returns {string} Flashcards with frontmatter prepended
 */
export function prependFrontmatter(flashcards, options = {}) {
  // First strip any existing frontmatter Claude may have added
  const content = stripFrontmatter(flashcards);
  // Then prepend our deterministic frontmatter
  return generateFrontmatter(options) + content;
}

/**
 * Strip TOML frontmatter and preamble from flashcard content
 * @param {string} markdown - Flashcard markdown content
 * @returns {string} Content without frontmatter
 */
function stripFrontmatter(markdown) {
  // Remove +++ ... +++ block
  const frontmatterRegex = /^\+\+\+[\s\S]*?\+\+\+\s*/;
  let result = markdown.replace(frontmatterRegex, '');

  // Also strip any preamble text before first heading or card prefix
  // Look for first # heading or Q:/C:/P: prefix
  const contentStart = result.search(/^(#|Q:|C:|P:)/m);
  if (contentStart > 0) {
    result = result.substring(contentStart);
  }

  return result.trim();
}

/**
 * Parse TOML frontmatter from flashcard markdown file
 * Supports both old format (with cli_version, git_commit, [generation.options])
 * and new simplified format (with flashcards_commit only)
 * @param {string} filePath - Path to flashcard .md file
 * @returns {Object} { frontmatter: Object, content: string }
 */
export function parseFrontmatter(filePath) {
  const markdown = readFileSync(filePath, 'utf-8');

  // Extract frontmatter block
  const frontmatterMatch = markdown.match(/^\+\+\+([\s\S]*?)\+\+\+/);
  if (!frontmatterMatch) {
    return { frontmatter: {}, content: markdown };
  }

  const frontmatterText = frontmatterMatch[1];
  const content = markdown.replace(/^\+\+\+[\s\S]*?\+\+\+\s*/, '');

  // Simple TOML parser for our specific format
  const frontmatter = {};

  // Parse top-level keys (old format - still supported for backwards compatibility)
  const orderMatch = frontmatterText.match(/^order\s*=\s*(\d+)/m);
  if (orderMatch) frontmatter.order = parseInt(orderMatch[1]);

  const tagsMatch = frontmatterText.match(/^tags\s*=\s*\[(.*?)\]/m);
  if (tagsMatch) {
    frontmatter.tags = tagsMatch[1].split(',').map(t => t.trim().replace(/"/g, '')).filter(Boolean);
  }

  // Support both 'prereqs' (new format) and 'prerequisites' (old format)
  const prereqsMatch = frontmatterText.match(/^prereqs\s*=\s*\[(.*?)\]/m);
  const prerequisitesMatch = frontmatterText.match(/^prerequisites\s*=\s*\[(.*?)\]/m);
  const prereqMatch = prereqsMatch || prerequisitesMatch;
  if (prereqMatch) {
    frontmatter.prereqs = prereqMatch[1].split(',').map(p => p.trim().replace(/"/g, '')).filter(Boolean);
  }

  // Parse [generation] section
  const generationMatch = frontmatterText.match(/\[generation\]([\s\S]*?)(?=\[generation\.options\]|$)/);
  if (generationMatch) {
    frontmatter.generation = {};
    const genText = generationMatch[1];

    const sourceMatch = genText.match(/source\s*=\s*"([^"]*)"/);
    if (sourceMatch) frontmatter.generation.source = sourceMatch[1];

    const imagesDirMatch = genText.match(/images_dir\s*=\s*"([^"]*)"/);
    if (imagesDirMatch) frontmatter.generation.imagesDir = imagesDirMatch[1];

    const generatedAtMatch = genText.match(/generated_at\s*=\s*"([^"]*)"/);
    if (generatedAtMatch) frontmatter.generation.generatedAt = generatedAtMatch[1];

    // New format: flashcards_commit
    const flashcardsCommitMatch = genText.match(/flashcards_commit\s*=\s*"([^"]*)"/);
    if (flashcardsCommitMatch) frontmatter.generation.flashcardsCommit = flashcardsCommitMatch[1];

    // Old format: cli_version (for backwards compatibility)
    const cliVersionMatch = genText.match(/cli_version\s*=\s*"([^"]*)"/);
    if (cliVersionMatch) frontmatter.generation.cliVersion = cliVersionMatch[1];

    // Old format: git_commit (for backwards compatibility)
    const gitCommitMatch = genText.match(/git_commit\s*=\s*"([^"]*)"/);
    if (gitCommitMatch) frontmatter.generation.gitCommit = gitCommitMatch[1];

    const modelMatch = genText.match(/model\s*=\s*"([^"]*)"/);
    if (modelMatch) frontmatter.generation.model = modelMatch[1];

    const guidesMatch = genText.match(/guides\s*=\s*\[(.*?)\]/);
    if (guidesMatch) {
      frontmatter.generation.guides = guidesMatch[1].split(',').map(g => g.trim().replace(/"/g, '')).filter(Boolean);
    }

    const guidesHashMatch = genText.match(/guides_hash\s*=\s*"([^"]*)"/);
    if (guidesHashMatch) frontmatter.generation.guidesHash = guidesHashMatch[1];
  }

  // Parse [generation.options] section (old format - for backwards compatibility)
  const optionsMatch = frontmatterText.match(/\[generation\.options\]([\s\S]*?)$/);
  if (optionsMatch && frontmatter.generation) {
    frontmatter.generation.options = {};
    const optText = optionsMatch[1];

    const templateMatch = optText.match(/template\s*=\s*\[(.*?)\]/);
    if (templateMatch) {
      frontmatter.generation.options.template = templateMatch[1].split(',').map(t => t.trim().replace(/"/g, '')).filter(Boolean);
    }

    const optOrderMatch = optText.match(/order\s*=\s*(\d+)/);
    if (optOrderMatch) frontmatter.generation.options.order = parseInt(optOrderMatch[1]);

    const optTagsMatch = optText.match(/tags\s*=\s*\[(.*?)\]/);
    if (optTagsMatch) {
      frontmatter.generation.options.tags = optTagsMatch[1].split(',').map(t => t.trim().replace(/"/g, '')).filter(Boolean);
    }

    const optPrereqsMatch = optText.match(/prereqs\s*=\s*\[(.*?)\]/);
    if (optPrereqsMatch) {
      frontmatter.generation.options.prereqs = optPrereqsMatch[1].split(',').map(p => p.trim().replace(/"/g, '')).filter(Boolean);
    }
  }

  return { frontmatter, content };
}

/**
 * Build the prompt that would be sent to Claude
 * @param {string} contentText - Formatted document content
 * @param {string} guidesContext - Loaded guides content
 * @param {Array} imageList - Available images
 * @param {Object} options - { outputName, order, tags, chunkInfo }
 * @returns {string} The complete prompt
 */
export function buildPrompt(contentText, guidesContext, imageList, options = {}) {
  const { outputName = 'flashcards', chunkInfo, prerequisiteContent } = options;

  // Build guide instructions
  const guideInstructions = guidesContext && guidesContext.length > 0
    ? `Follow ALL principles in these guides EXACTLY.

${guidesContext}

=== END OF GUIDES ===`
    : 'Follow research-based spaced repetition principles for flashcard creation.';

  // Add chunk context information for multi-chunk processing
  const chunkContext = chunkInfo
    ? `\n\n## Document Context\nThis is chunk ${chunkInfo.current} of ${chunkInfo.total} (pages ${chunkInfo.startPage}-${chunkInfo.endPage}).
${chunkInfo.isLast ? 'This is the FINAL chunk.' : 'More content follows in subsequent chunks.'}`
    : '';

  // Build image instructions
  let imageInstructions = '';
  if (imageList && imageList.length > 0) {
    const labeledFigures = imageList.filter(img => img.caption);
    const unlabeledCount = imageList.length - labeledFigures.length;

    const figureList = labeledFigures.slice(0, 50).map(img => {
      const filename = img.path.split('/').pop();
      return `- ${filename}: ${img.caption}`;
    }).join('\n');

    imageInstructions = `\n\n## Available Figures

Reference syntax: ![Description](../sources/${outputName}/images/filename.jpg)

Labeled figures:
${figureList || '(none)'}
${labeledFigures.length > 50 ? `\n... and ${labeledFigures.length - 50} more labeled figures` : ''}
${unlabeledCount > 0 ? `\n(Plus ${unlabeledCount} unlabeled figures available)` : ''}

**Important:** Follow the figure verification guidelines in the guide when including figures. You cannot see actual images—only captions—so be cautious with multi-concept captions.`;
  }

  const frontmatterInstruction = 'Do NOT include TOML frontmatter (+++). Start directly with the # Chapter/Topic Title header.';

  // Build prerequisite section if we have prerequisites
  const prereqSection = prerequisiteContent ? `\n\n${prerequisiteContent}\n` : '';

  return `${guideInstructions}${chunkContext}${imageInstructions}${prereqSection}

<document_content>
${contentText}
</document_content>

Generate flashcards from the document content above, following ALL principles in the guides. ${frontmatterInstruction}`;
}

/**
 * Reconstruct the prompt that was used to generate flashcards
 * @param {string} flashcardPath - Path to flashcard .md file
 * @param {string} deckPath - Path to deck directory (unused, kept for backwards compatibility)
 * @returns {Promise<Object>} { prompt, metadata, warnings }
 */
export async function reconstructPrompt(flashcardPath, deckPath) {
  const warnings = [];

  // 1. Parse TOML frontmatter from flashcard file
  const { frontmatter } = parseFrontmatter(flashcardPath);

  if (!frontmatter.generation) {
    return {
      prompt: null,
      metadata: null,
      warnings: ['No [generation] metadata found in flashcard file. Cannot reconstruct prompt.']
    };
  }

  const gen = frontmatter.generation;

  // 2. Load source content from generation.source
  const sourcePath = join(deckPath, gen.source);
  if (!existsSync(sourcePath)) {
    warnings.push(`Source file not found: ${gen.source}`);
    return { prompt: null, metadata: gen, warnings };
  }

  // Support both content.json (new format) and *_content_list.json (old format)
  let content;
  if (sourcePath.endsWith('.json')) {
    content = JSON.parse(readFileSync(sourcePath, 'utf-8'));
  } else {
    // Assume it's a directory, find content.json or *_content_list.json
    const files = readdirSync(sourcePath);
    const contentFile = files.find(f => f === 'content.json' || f.endsWith('_content_list.json'));
    if (!contentFile) {
      warnings.push(`No content file found in: ${gen.source}`);
      return { prompt: null, metadata: gen, warnings };
    }
    content = JSON.parse(readFileSync(join(sourcePath, contentFile), 'utf-8'));
  }

  const contentText = formatSourceContentForClaude(content);

  // 3. Load guides (fetched fresh from GitHub)
  const guidesContext = await loadGuides(gen.guides?.map(g => g.replace('.md', '')));

  // 4. Extract image list
  const imageList = extractImageList(content);

  // 5. Reconstruct the prompt
  const outputName = basename(flashcardPath, '.md');
  const prompt = buildPrompt(contentText, guidesContext.content, imageList, {
    outputName,
    order: gen.options?.order,
    tags: gen.options?.tags
  });

  return {
    prompt,
    metadata: gen,
    warnings
  };
}

// ==================== Claude Code CLI Integration ====================

async function callClaudeCodeCLI(contentText, guidesContext, imageList, options = {}) {
  const { verbose, deckPath, prerequisiteFilenames = [], outputName = 'flashcards', chunkInfo, imagesDir } = options;
  const { spawn } = await import('child_process');

  // Load prerequisites if specified
  let prerequisiteContent = '';
  if (prerequisiteFilenames && prerequisiteFilenames.length > 0) {
    const { content } = await loadPrerequisites(prerequisiteFilenames, deckPath, verbose);
    prerequisiteContent = content;
  }

  // Note: Guides are fetched from GitHub and included directly in guidesContext
  // No local guides directory is needed anymore

  // Include guide content directly in prompt (don't rely on Claude choosing to read files)
  // This guarantees Claude sees the guide content
  const guideInstructions = guidesContext && guidesContext.length > 0
    ? `Follow ALL principles in these guides EXACTLY.

${guidesContext}

=== END OF GUIDES ===`
    : 'Follow research-based spaced repetition principles for flashcard creation.';

  // Add chunk context information for multi-chunk processing
  const chunkContext = chunkInfo
    ? `\n\n## Document Context\nThis is chunk ${chunkInfo.current} of ${chunkInfo.total} (pages ${chunkInfo.startPage}-${chunkInfo.endPage}).
${chunkInfo.isLast ? 'This is the FINAL chunk.' : 'More content follows in subsequent chunks.'}`
    : '';

  // Build image instructions if we have images
  let imageInstructions = '';
  if (imageList && imageList.length > 0) {
    // Separate labeled (with captions) and unlabeled figures
    const labeledFigures = imageList.filter(img => img.caption);
    const unlabeledCount = imageList.length - labeledFigures.length;

    // Build figure list showing filename: caption
    const figureList = labeledFigures.slice(0, 50).map(img => {
      const filename = img.path.split('/').pop();
      return `- ${filename}: ${img.caption}`;
    }).join('\n');

    // Check if Claude has access to images directory for visual verification
    const hasImageAccess = imagesDir && existsSync(imagesDir);

    const imageAccessNote = hasImageAccess
      ? `**You have access to the images directory.** When a caption is ambiguous or covers multiple concepts:
1. Use the Read tool to view the actual image file at: ${imagesDir}/<filename>
2. Verify the image matches your card's specific concept
3. Only include if it clearly enhances understanding

Follow the figure verification guidelines in the guide.`
      : `**Important:** Follow the figure verification guidelines in the guide when including figures. You cannot see actual images—only captions—so be cautious with multi-concept captions.`;

    imageInstructions = `\n\n## Available Figures

Reference syntax: ![Description](../sources/${outputName}/images/filename.jpg)

Labeled figures:
${figureList || '(none)'}
${labeledFigures.length > 50 ? `\n... and ${labeledFigures.length - 50} more labeled figures` : ''}
${unlabeledCount > 0 ? `\n(Plus ${unlabeledCount} unlabeled figures available)` : ''}

${imageAccessNote}`;
  }

  // Truncate content if too large for Claude CLI (keep under 150K chars to leave room for guides and instructions)
  const MAX_CONTENT_SIZE = 150000;
  let truncatedContent = contentText;
  let truncationWarning = '';

  if (contentText.length > MAX_CONTENT_SIZE) {
    // Find a good break point (end of a page marker)
    let breakPoint = contentText.lastIndexOf('\n=== PAGE', MAX_CONTENT_SIZE);
    if (breakPoint === -1 || breakPoint < MAX_CONTENT_SIZE * 0.5) {
      // Fall back to simple truncation at paragraph boundary
      breakPoint = contentText.lastIndexOf('\n\n', MAX_CONTENT_SIZE);
    }
    if (breakPoint === -1) {
      breakPoint = MAX_CONTENT_SIZE;
    }

    truncatedContent = contentText.substring(0, breakPoint);
    truncationWarning = `\n\n[NOTE: Document was truncated from ${contentText.length} to ${truncatedContent.length} characters due to size limits. Focus on creating high-quality flashcards for the content provided.]`;

    // Show truncation warning to user
    console.log(`\x1b[33m⚠  Content truncated: ${contentText.length} → ${truncatedContent.length} chars (Claude CLI limit)\x1b[0m`);
    console.log();
  }

  // Prepare the prompt - trust the guides completely
  // Claude should NOT output TOML frontmatter - we add it deterministically after generation
  const frontmatterInstruction = 'Do NOT include TOML frontmatter (+++). Start directly with the # Chapter/Topic Title header.';

  // Build prerequisite section if we have prerequisites
  const prereqSection = prerequisiteContent ? `\n\n${prerequisiteContent}\n` : '';

  const promptText = `${guideInstructions}${chunkContext}${imageInstructions}${prereqSection}

<document_content>
${truncatedContent}
</document_content>${truncationWarning}

Generate flashcards from the document content above, following ALL principles in the guides. ${frontmatterInstruction}`;

  if (verbose) {
    console.log(`[DEBUG] Prompt size: ${promptText.length} chars`);
  }

  return new Promise((resolve, reject) => {
    // Use Claude Code CLI with --print for non-interactive mode
    // Guides are fetched from GitHub and included directly in the prompt
    // Pipe the prompt through stdin to avoid command line length limits
    const args = ['--print', '--dangerously-skip-permissions'];

    // Add images directory access so Claude can visually verify figures before including them
    if (imagesDir && existsSync(imagesDir)) {
      args.push('--add-dir', imagesDir);
    }

    if (verbose) {
      console.log(`[DEBUG] Spawning claude CLI`);
      if (prerequisiteFilenames.length > 0) {
        console.log(`[DEBUG] Prerequisites (metadata only): ${prerequisiteFilenames.join(', ')}`);
      }
      console.log(`[DEBUG] Available images: ${imageList?.length || 0}`);
      if (imagesDir && existsSync(imagesDir)) {
        console.log(`[DEBUG] Images directory added: ${imagesDir}`);
      }
    }

    const claude = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe']  // pipe stdin, stdout, stderr
    });

    // Write prompt to stdin and close it
    claude.stdin.write(promptText);
    claude.stdin.end();

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Add 5 minute timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      claude.kill();
      reject(new Error('Claude Code CLI timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
      if (verbose) {
        process.stdout.write(data);
      }
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
      if (verbose) {
        process.stderr.write(data);
      }
    });

    claude.on('close', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        return; // Already rejected
      }

      if (code !== 0) {
        // Check if there's an API error in stdout (Claude returns errors on stdout sometimes)
        const errorOutput = stderr || stdout;
        reject(new Error(`Claude Code CLI failed (exit code ${code}): ${errorOutput.substring(0, 500)}`));
        return;
      }

      // Parse the output to extract flashcards
      let flashcards = stdout.trim();

      if (verbose) {
        console.log(`[DEBUG] Raw Claude output length: ${flashcards.length} chars`);
        console.log(`[DEBUG] First 200 chars: ${flashcards.substring(0, 200)}`);
      }

      // Extract from ANY markdown code block (try multiple patterns)
      if (flashcards.includes('```')) {
        // Try ```markdown first
        let match = flashcards.match(/```markdown\s*([\s\S]*?)\s*```/);
        if (match) {
          flashcards = match[1].trim();
          if (verbose) console.log('[DEBUG] Extracted from ```markdown block');
        } else {
          // Try plain ``` block
          match = flashcards.match(/```\s*([\s\S]*?)\s*```/);
          if (match) {
            flashcards = match[1].trim();
            if (verbose) console.log('[DEBUG] Extracted from ``` block');
          }
        }
      }

      // Remove common preambles that Claude might add
      const preamblePatterns = [
        /^Based on the (?:PDF|document) content.*?here are.*?flashcards.*?:\s*/is,
        /^Here are.*?flashcards.*?:\s*/is,
        /^I've created.*?flashcards.*?:\s*/is,
        /^I'll create.*?flashcards.*?:\s*/is,
        /^Let me create.*?flashcards.*?:\s*/is,
        /^Sure!.*?flashcards.*?:\s*/is,
        /^Now I'll (?:generate|create).*?\.\s*/is,
        /^Now I(?:'ll| will).*?flashcards.*?\.\s*/is
      ];

      for (const pattern of preamblePatterns) {
        const before = flashcards.length;
        flashcards = flashcards.replace(pattern, '');
        if (verbose && before !== flashcards.length) {
          console.log(`[DEBUG] Removed preamble, ${before - flashcards.length} chars`);
        }
      }

      // Aggressive cleanup: if there's text before +++, strip it
      const frontmatterStart = flashcards.indexOf('+++');
      if (frontmatterStart > 0) {
        if (verbose) {
          console.log(`[DEBUG] Stripping ${frontmatterStart} chars before +++`);
        }
        flashcards = flashcards.substring(frontmatterStart);
      }

      // Remove trailing summaries/conclusions
      flashcards = flashcards.replace(/\n\n#+\s*(Summary|Distribution|Statistics|Total|Note).*$/is, '');
      flashcards = flashcards.replace(/\n\n(This (?:set|deck|collection)|I(?:'ve| have)|The above).*$/is, '');

      // Trim again after all cleaning
      flashcards = flashcards.trim();

      if (verbose) {
        console.log(`[DEBUG] After cleanup length: ${flashcards.length} chars`);
        console.log(`[DEBUG] First 200 chars after cleanup: ${flashcards.substring(0, 200)}`);
      }

      // Return in the same format as the API version
      resolve({
        flashcards,
        usage: {
          input_tokens: 0,  // Not available from CLI
          output_tokens: 0  // Not available from CLI
        }
      });
    });

    claude.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Claude Code CLI: ${error.message}`));
    });
  });
}

// ==================== Claude API with Source Content ====================

// Maximum content size before chunking is needed (leave room for guides and instructions)
const MAX_CONTENT_SIZE_FOR_CHUNKING = 120000;

/**
 * Process large documents in chunks, aggregating results
 * @param {string} sourceDir - Source directory with content.json and images/
 * @param {string} guidesContext - Loaded guides
 * @param {Object} options - Generation options
 * @returns {Object} Aggregated {flashcards, usedImages, chunkCount}
 */
async function callClaudeWithChunkedSource(sourceDir, guidesContext, options = {}) {
  const {
    model = 'claude-sonnet-4-5-20250514',
    verbose = false,
    prerequisiteFilenames = [],
    order,
    tags = [],
    deckPath,
    outputName = 'flashcards'
  } = options;

  // Load source content
  const { content, imagesDir, baseName } = loadSourceContent(sourceDir, verbose);

  // Extract full image list (available to all chunks)
  const fullImageList = extractImageList(content);

  // Use the outputName or fall back to baseName
  const finalOutputName = outputName || baseName;

  // Chunk the content by page boundaries
  const chunks = chunkContentByPages(content, MAX_CONTENT_SIZE_FOR_CHUNKING);

  console.log(`📄 Document too large - splitting into ${chunks.length} chunks`);

  let allFlashcards = '';
  let allUsedImages = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkContent = formatSourceContentForClaude(chunk.content);
    const chunkImageList = extractImageList(chunk.content);

    console.log(`\n⏳ Processing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage + 1}-${chunk.endPage + 1})...`);

    if (verbose) {
      console.log(`[DEBUG] Chunk ${i + 1} size: ${chunkContent.length} chars`);
      console.log(`[DEBUG] Chunk ${i + 1} images: ${chunkImageList.length}`);
    }

    const chunkResult = await callClaudeCodeCLI(
      chunkContent,
      guidesContext,
      fullImageList,  // Provide full image list so Claude knows what's available
      {
        model,
        verbose,
        deckPath,
        prerequisiteFilenames,
        order,
        tags,
        outputName: finalOutputName,
        chunkInfo: {
          current: i + 1,
          total: chunks.length,
          startPage: chunk.startPage + 1,
          endPage: chunk.endPage + 1,
          isFirst: i === 0,
          isLast: i === chunks.length - 1
        }
      }
    );

    // Aggregate results
    if (i === 0) {
      allFlashcards = chunkResult.flashcards;
    } else {
      // Strip TOML frontmatter from subsequent chunks and append
      const strippedContent = stripFrontmatter(chunkResult.flashcards);
      allFlashcards += '\n\n' + strippedContent;
    }

    // Extract used images from this chunk
    const chunkUsedImages = extractUsedImages(chunkResult.flashcards, fullImageList);
    allUsedImages.push(...chunkUsedImages);

    // Count cards in this chunk
    const chunkCardCount = (chunkResult.flashcards.match(/^(Q:|C:|P:)/gm) || []).length;
    console.log(`✓ Generated ${chunkCardCount} cards from chunk ${i + 1}`);
  }

  return {
    flashcards: allFlashcards,
    usedImages: [...new Set(allUsedImages)], // Dedupe
    imagesDir,
    baseName,
    outputName: finalOutputName,
    chunkCount: chunks.length,
    usage: {
      input_tokens: 0,  // Not available from CLI
      output_tokens: 0  // Not available from CLI
    }
  };
}

/**
 * Generate flashcards from parsed source content using Claude
 * @param {string} sourceDir - Path to source directory with content.json and images/
 * @param {string} guidesContext - Loaded guides content
 * @param {Object} options - Generation options
 * @returns {Object} { flashcards, usage, usedImages }
 */
export async function callClaudeWithSource(sourceDir, guidesContext, options = {}) {
  const {
    apiKey,
    model = 'claude-sonnet-4-5-20250514',
    verbose = false,
    useClaudeCode = false,
    prerequisiteFilenames = [],
    order,
    tags = [],
    deckPath,
    outputName = 'flashcards'
  } = options;

  // Load source content
  const { content, imagesDir, baseName } = loadSourceContent(sourceDir, verbose);

  // Format content for Claude
  const contentText = formatSourceContentForClaude(content);

  // Extract image list
  const imageList = extractImageList(content);

  if (verbose) {
    console.log(`[DEBUG] Formatted content: ${contentText.length} chars`);
    console.log(`[DEBUG] Available images: ${imageList.length}`);
  }

  // Use the outputName or fall back to baseName
  const finalOutputName = outputName || baseName;

  // Check if content is too large and needs chunking (only for Claude Code CLI)
  if (useClaudeCode && contentText.length > MAX_CONTENT_SIZE_FOR_CHUNKING) {
    console.log(`\x1b[33m📊 Content size: ${Math.round(contentText.length / 1000)}K chars (exceeds ${Math.round(MAX_CONTENT_SIZE_FOR_CHUNKING / 1000)}K limit)\x1b[0m`);
    return callClaudeWithChunkedSource(sourceDir, guidesContext, options);
  }

  // If using Claude Code CLI, delegate to that
  if (useClaudeCode) {
    const result = await callClaudeCodeCLI(contentText, guidesContext, imageList, {
      model,
      verbose,
      deckPath,
      prerequisiteFilenames,
      order,
      tags,
      outputName: finalOutputName,
      imagesDir
    });

    // Extract used images from the flashcard content
    const usedImages = extractUsedImages(result.flashcards, imageList);

    return {
      ...result,
      usedImages,
      imagesDir,
      baseName,
      outputName: finalOutputName
    };
  }

  if (!apiKey) {
    throw new Error('API key is required');
  }

  // Load prerequisites if specified (for direct API path)
  let prerequisiteContent = '';
  if (prerequisiteFilenames && prerequisiteFilenames.length > 0 && deckPath) {
    const { content } = await loadPrerequisites(prerequisiteFilenames, deckPath, verbose);
    prerequisiteContent = content;
  }

  // Initialize Anthropic client with API key
  const client = new Anthropic({ apiKey });

  // Add TOML frontmatter instructions if order, tags, or prerequisites are specified
  const tomlInstructions = (order !== undefined || tags.length > 0 || prerequisiteFilenames.length > 0)
    ? `\n\n## TOML Frontmatter Requirements\n\nUse the following values in the TOML frontmatter:\n${order !== undefined ? `- order = ${order}` : '- order = (infer from content or use 1)'}\n${tags.length > 0 ? `- tags = [${tags.map(t => `"${t}"`).join(', ')}]` : '- tags = []'}\n- prerequisites = ${prerequisiteFilenames.length > 0 ? `[${prerequisiteFilenames.map(f => `"${f}"`).join(', ')}]` : '[]'}`
    : '';

  // Build image instructions
  let imageInstructions = '';
  if (imageList.length > 0) {
    imageInstructions = `\n\n## Available Figures

The document contains ${imageList.length} figures. When creating flashcards, reference relevant figures using:
![Description](sources/${finalOutputName}/images/filename.jpg)

Available images:
${imageList.slice(0, 50).map(img => `- ${img.path}${img.caption ? `: ${img.caption}` : ''}`).join('\n')}
${imageList.length > 50 ? `\n... and ${imageList.length - 50} more images` : ''}

IMPORTANT: Only reference figures that genuinely enhance understanding.`;
  }

  // Build prerequisite section if we have prerequisites
  const prereqSection = prerequisiteContent ? `\n\n${prerequisiteContent}` : '';

  // Prepare system prompt
  const systemPrompt = `You are an expert flashcard creator.

${guidesContext}${tomlInstructions}${imageInstructions}${prereqSection}

Generate flashcards from the document content below, following ALL principles in the guides above.`;

  // Prepare user message
  const userMessage = `<document_content>
${contentText}
</document_content>

Generate flashcards from the document content above, following ALL principles in the guides.`;

  // Make API call
  try {
    if (verbose) {
      console.log('\x1b[90mSystem prompt:\x1b[0m');
      console.log(systemPrompt.substring(0, 500) + '...');
      console.log();
    }

    const response = await client.messages.create({
      model,
      max_tokens: 32000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userMessage
      }]
    });

    // Extract text from response
    const flashcards = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Extract used images from the flashcard content
    const usedImages = extractUsedImages(flashcards, imageList);

    return {
      flashcards,
      usage: response.usage,
      model: response.model,
      usedImages,
      imagesDir,
      baseName,
      outputName: finalOutputName
    };
  } catch (error) {
    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    if (error.status === 401) {
      throw new Error('Invalid API key. Please run "flashcards auth login" again.');
    }
    if (error.status === 413) {
      throw new Error('Content is too large. Try a smaller document.');
    }
    throw new Error(`Claude API error: ${error.message}`);
  }
}

/**
 * Extract list of images used in flashcard content
 * @param {string} flashcards - Generated flashcard markdown
 * @param {Array} imageList - Available images from source
 * @returns {Array} List of used image paths
 */
function extractUsedImages(flashcards, imageList) {
  const usedImages = [];

  // Find all image references in the flashcard content
  // Pattern: ![...](sources/outputName/images/filename.jpg) or ![...](figures/outputName/filename.jpg) or ![...](images/filename.jpg)
  // Match image references with optional ../ prefix for relative paths from flashcards/ directory
  const imageRefPattern = /!\[[^\]]*\]\((?:\.\.\/)?(?:sources\/[^\/]+\/images\/|figures\/[^\/]+\/|images\/)([^)]+)\)/g;
  let match;

  while ((match = imageRefPattern.exec(flashcards)) !== null) {
    const filename = match[1];
    // Find corresponding image in the list
    const img = imageList.find(i => i.path.endsWith(filename) || i.path === `images/${filename}`);
    if (img && !usedImages.includes(img.path)) {
      usedImages.push(img.path);
    }
  }

  return usedImages;
}

// Legacy function for backwards compatibility - throws helpful error
export async function callClaudeWithPDF(pdfPath, guidesContext, options = {}) {
  throw new Error('PDF input is no longer supported. Please use "flashcards process" to preprocess your PDF first, then use callClaudeWithSource().');
}

// ==================== Figure Enhancement (Stage 2) ====================

export async function enhanceFlashcardsWithFigures(flashcardsContent, figuresPath, imageFiles, options = {}) {
  const { verbose = false, useClaudeCode = false, deckPath } = options;
  const { spawn } = await import('child_process');

  if (verbose) {
    console.log(`\n[DEBUG] Stage 2: Enhancing flashcards with figures`);
    console.log(`[DEBUG] Figures directory: ${figuresPath}`);
    console.log(`[DEBUG] Image files: ${imageFiles.length} total`);
  }

  // Build prompt for figure enhancement
  const imageListings = imageFiles.slice(0, 30).map(f => `- ${basename(f)}`).join('\n');
  const imageListingSuffix = imageFiles.length > 30 ? `\n... and ${imageFiles.length - 30} more` : '';

  const promptText = `CRITICAL: DO NOT CREATE ANY FILES. DO NOT USE THE Write TOOL. OUTPUT EVERYTHING DIRECTLY AS TEXT.

You are enhancing existing flashcards by adding figure references where pedagogically valuable.

## Task

Review the flashcards below and the available figures. For flashcards that would benefit from visual aids, add image references using the format: ![Description](../figures/subfolder/image.png)

IMPORTANT: Output the COMPLETE enhanced flashcards content directly. Do not create files, do not provide summaries, do not write preambles. Output ONLY the full flashcard content with figures added.

## Available Figures (${imageFiles.length} total):
${imageListings}${imageListingSuffix}

## Guidelines for Adding Figures

**Add figures when they:**
- Show complex diagrams (circuit diagrams, free-body diagrams, anatomical drawings, vector diagrams)
- Display graphs and charts with important data relationships
- Illustrate spatial/structural relationships difficult to describe in text
- Contain visual information that significantly enhances understanding

**DO NOT add figures when:**
- The concept is simple and easily described in text
- The image would be purely decorative
- Text is clearer and more searchable than the image

## CRITICAL RULES - MUST FOLLOW EXACTLY

1. **Preserve ALL existing content** - Only ADD figure references, NEVER remove or modify ANY existing text
2. **Preserve ALL formatting** - Keep EVERY Q:/A:/C:/P:/S: prefix, ALL spacing, ALL structure EXACTLY as-is
3. **Preserve TOML frontmatter** - Keep the +++ header EXACTLY as-is, including ALL fields (order, tags, prerequisites)
4. **Preserve ALL headers** - Keep EVERY # and ## header EXACTLY as written in the original
5. **Preserve ALL separators** - Keep ALL --- separators between cards
6. **Only ADD, never remove** - Your ONLY job is to INSERT figure references where helpful. Do NOT rewrite, rephrase, or reorganize ANYTHING.
7. **Use relative paths** - Format: ../figures/subfolder/image.png
8. **Write descriptive alt-text** - The text in ![...] should describe what the figure shows
9. **Be selective** - Only add figures where they genuinely add value

**Example of CORRECT enhancement:**

BEFORE:
\`\`\`
# Vectors

Q: What is a vector?
A: A quantity with magnitude and direction.
\`\`\`

AFTER (with figure added):
\`\`\`
# Vectors

Q: What is a vector?
A: A quantity with magnitude and direction.

![Vector diagram showing magnitude and direction](../figures/vectors/vector_basics.png)
\`\`\`

Notice: The # header is PRESERVED. The Q: and A: are PRESERVED. Only the figure was ADDED.

## Flashcards to Enhance

<flashcards>
${flashcardsContent}
</flashcards>

Return the COMPLETE enhanced flashcards with figure references added where appropriate. Preserve ALL existing content, ALL headers, ALL formatting - only ADD figure references.

FINAL REMINDER: DO NOT create any files. DO NOT use the Write tool. DO NOT output summaries or preambles. Output ONLY the complete flashcard content with figures added.`;

  if (useClaudeCode) {
    // Use Claude Code CLI
    return new Promise((resolve, reject) => {
      const args = [
        '--add-dir', figuresPath,
        '--print',
        '--dangerously-skip-permissions',
        promptText
      ];

      if (verbose) {
        console.log(`[DEBUG] Spawning claude for figure enhancement`);
      }

      const claude = spawn('claude', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        claude.kill();
        reject(new Error('Figure enhancement timed out after 5 minutes'));
      }, 5 * 60 * 1000);

      claude.stdout.on('data', (data) => {
        stdout += data.toString();
        if (verbose) {
          process.stdout.write(data);
        }
      });

      claude.stderr.on('data', (data) => {
        stderr += data.toString();
        if (verbose) {
          process.stderr.write(data);
        }
      });

      claude.on('close', (code) => {
        clearTimeout(timeout);

        if (timedOut) {
          return;
        }

        if (code !== 0) {
          reject(new Error(`Figure enhancement failed: ${stderr}`));
          return;
        }

        let enhanced = stdout.trim();

        // Extract from markdown code block if present
        if (enhanced.includes('```markdown')) {
          const match = enhanced.match(/```markdown\s*([\s\S]*?)\s*```/);
          if (match) {
            enhanced = match[1].trim();
          }
        }

        resolve(enhanced);
      });

      claude.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Claude Code CLI for enhancement: ${error.message}`));
      });
    });
  } else {
    // Use Anthropic API
    throw new Error('API-based figure enhancement not yet implemented. Use Claude Code CLI.');
  }
}

export function estimateCost(pdfSizeBytes, model = 'claude-sonnet-4-5-20250514') {
  // Rough estimation based on PDF size
  // Claude Sonnet 4.5: $3 per million input tokens, $15 per million output tokens
  // Assume ~1 token per 4 bytes for PDF content
  // Assume output is roughly 20% of input size

  const inputTokens = Math.ceil(pdfSizeBytes / 4);
  const outputTokens = Math.ceil(inputTokens * 0.2);

  const inputCostPer1M = model.includes('opus') ? 15 : 3;
  const outputCostPer1M = model.includes('opus') ? 75 : 15;

  const inputCost = (inputTokens / 1000000) * inputCostPer1M;
  const outputCost = (outputTokens / 1000000) * outputCostPer1M;

  const totalCost = inputCost + outputCost;

  return {
    min: Math.max(0.01, totalCost * 0.7),
    max: totalCost * 1.3,
    inputTokens,
    outputTokens
  };
}

// ==================== Image Extraction ====================

export async function extractImagesFromPDF(pdfPath, flashcardsContent, outputDir) {
  // Parse <!-- IMAGES_TO_EXTRACT --> section from flashcards
  const imageMatch = flashcardsContent.match(/<!--\s*IMAGES_TO_EXTRACT\s*([\s\S]*?)\s*-->/);

  if (!imageMatch) {
    return {
      extracted: [],
      message: 'No images to extract'
    };
  }

  const imageLines = imageMatch[1]
    .split('\n')
    .filter(line => line.trim().length > 0);

  if (imageLines.length === 0) {
    return {
      extracted: [],
      message: 'No images specified'
    };
  }

  // For now, just return the list - actual extraction would need pdf-lib or similar
  // This is a placeholder for future implementation
  console.log('\x1b[33m⚠\x1b[0m Image extraction from PDF not yet implemented.');
  console.log('\x1b[33m  Claude identified these images to extract:\x1b[0m');
  imageLines.forEach(line => console.log(`    ${line}`));
  console.log('\x1b[33m  Please extract these manually using extract_figures_from_pdf.py\x1b[0m');

  return {
    extracted: [],
    message: 'Manual extraction required',
    imageList: imageLines
  };
}

// ==================== Validation ====================

export function validateFlashcards(markdownText) {
  const warnings = [];
  const errors = [];

  const lines = markdownText.split('\n');
  let currentLine = 0;
  let cardCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    currentLine = i + 1;

    // Check for valid card prefixes
    if (line.startsWith('Q:') || line.startsWith('C:') || line.startsWith('P:')) {
      cardCount++;
    }

    // Check for common errors
    if (line.startsWith('A:') && i > 0) {
      const prevLine = lines[i-1].trim();
      if (!prevLine.startsWith('Q:') && prevLine.length > 0) {
        warnings.push(`Line ${currentLine}: A: without preceding Q:`);
      }
    }

    if (line.startsWith('S:') && i > 0) {
      const prevLine = lines[i-1].trim();
      if (!prevLine.startsWith('P:') && prevLine.length > 0) {
        warnings.push(`Line ${currentLine}: S: without preceding P:`);
      }
    }

    // Check for malformed cloze deletions
    if (line.includes('[') && !line.includes(']')) {
      warnings.push(`Line ${currentLine}: Unclosed cloze deletion bracket`);
    }

    // Check for image paths - they should be relative from flashcards/ directory
    if (line.includes('](') && (line.includes('figures/') || line.includes('sources/'))) {
      // For sources/ paths, they should be relative from flashcards/ like ../sources/name/images/
      if (line.includes('sources/') && !line.includes('../sources/')) {
        warnings.push(`Line ${currentLine}: Source image path should be relative (../sources/...)`);
      }
      // For legacy figures/ paths, they should be ../figures/
      if (line.includes('figures/') && !line.includes('../figures/')) {
        warnings.push(`Line ${currentLine}: Legacy figure path should be relative (../figures/...)`);
      }
    }
  }

  if (cardCount === 0) {
    errors.push('No valid flashcards found (no Q:/C:/P: prefixes detected)');
  }

  return {
    valid: errors.length === 0,
    cardCount,
    warnings,
    errors
  };
}

// ==================== Backwards Compatibility Aliases ====================
// These aliases allow existing code to continue working with the old function names

export const loadMineRUContent = loadSourceContent;
export const formatMineRUContentForClaude = formatSourceContentForClaude;
export const callClaudeWithMineRU = callClaudeWithSource;

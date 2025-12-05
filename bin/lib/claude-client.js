import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, chmodSync, mkdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { createHash, randomBytes } from 'crypto';

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
    const hasGuides = existsSync(join(currentPath, 'guides'));
    const hasReferences = existsSync(join(currentPath, 'references'));

    if (hasFlashcards || hasGuides || hasReferences) {
      return currentPath;
    }

    currentPath = dirname(currentPath);
  }

  return null;
}

export function validateDeckStructure(deckPath) {
  const required = ['flashcards', 'guides', 'references'];
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

/**
 * Load guides from deck's guides/ folder
 * @param {string} deckPath - Path to deck directory
 * @param {string|string[]} templates - Optional subject-specific template(s) (e.g., 'physics' or ['physics', 'chemistry'])
 * @returns {Object} { content, files, warning }
 */
export function loadGuides(deckPath, templates = null) {
  const guidesPath = join(deckPath, 'guides');

  if (!existsSync(guidesPath)) {
    return {
      content: '',
      files: [],
      warning: 'No guides/ folder found. Using minimal context.'
    };
  }

  try {
    const allFiles = readdirSync(guidesPath).filter(f => f.endsWith('.md'));

    if (allFiles.length === 0) {
      return {
        content: '',
        files: [],
        warning: 'No guide files found in guides/ folder.'
      };
    }

    // Normalize templates to array
    const templateList = templates
      ? (Array.isArray(templates) ? templates : [templates])
      : [];

    // Determine which files to load:
    // - Always load general.md if it exists
    // - If templates specified, also load each {template}.md
    const filesToLoad = [];

    // Always include general.md first
    if (allFiles.includes('general.md')) {
      filesToLoad.push('general.md');
    }

    // Include subject-specific templates if specified and exist
    for (const template of templateList) {
      const templateFile = `${template}.md`;
      if (allFiles.includes(templateFile) && !filesToLoad.includes(templateFile)) {
        filesToLoad.push(templateFile);
      }
    }

    // If no templates specified and no general.md, load all guides
    if (filesToLoad.length === 0) {
      filesToLoad.push(...allFiles.sort());
    }

    let content = '';
    const loadedFiles = [];

    for (const file of filesToLoad) {
      const filePath = join(guidesPath, file);
      const guideContent = readFileSync(filePath, 'utf-8');
      const guideName = file.replace('.md', '');

      // Add section marker
      content += `\n\n# GUIDE: ${guideName.toUpperCase()} (guides/${file})\n\n`;
      content += guideContent;

      loadedFiles.push(file);
    }

    return {
      content,
      files: loadedFiles,
      warning: null
    };
  } catch (error) {
    return {
      content: '',
      files: [],
      warning: `Error loading guides: ${error.message}`
    };
  }
}

// ==================== MineRU Content Loading ====================

/**
 * Load content from a MineRU output directory
 * @param {string} mineruDir - Path to MineRU output directory
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} { content: Array, imagesDir: string, baseName: string }
 */
export function loadMineRUContent(mineruDir, verbose = false) {
  // Find the content_list.json file
  const files = readdirSync(mineruDir);
  const contentListFile = files.find(f => f.endsWith('_content_list.json'));

  if (!contentListFile) {
    throw new Error(`No *_content_list.json file found in ${mineruDir}`);
  }

  const contentListPath = join(mineruDir, contentListFile);
  const imagesDir = join(mineruDir, 'images');

  // Extract base name (e.g., "1_units_physical_quantities_vectors" from "1_units_physical_quantities_vectors_content_list.json")
  const baseName = contentListFile.replace('_content_list.json', '');

  if (verbose) {
    console.log(`[DEBUG] Loading MineRU content from: ${contentListPath}`);
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
 * Convert MineRU content array to formatted text for Claude
 * @param {Array} content - MineRU content_list.json array
 * @returns {string} Formatted text representation
 */
export function formatMineRUContentForClaude(content) {
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
 * Extract list of all image paths from MineRU content
 * @param {Array} content - MineRU content_list.json array
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
 * Split MineRU content array into chunks by page boundaries
 * @param {Array} content - Full content_list.json array
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
 * @param {Object} block - Content block from MineRU
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
 * Generate TOML frontmatter deterministically from CLI options
 * @param {Object} options - { order, tags, prerequisites }
 * @returns {string} TOML frontmatter block
 */
export function generateFrontmatter(options = {}) {
  const { order = 1, tags = [], prerequisites = [] } = options;

  const tagsStr = tags.length > 0
    ? `[${tags.map(t => `"${t}"`).join(', ')}]`
    : '[]';

  const prereqsStr = prerequisites.length > 0
    ? `[${prerequisites.map(p => `"${p}"`).join(', ')}]`
    : '[]';

  return `+++
order = ${order}
tags = ${tagsStr}
prerequisites = ${prereqsStr}
+++

`;
}

/**
 * Prepend TOML frontmatter to flashcard content
 * @param {string} flashcards - Flashcard markdown content (without frontmatter)
 * @param {Object} options - { order, tags, prerequisites }
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

// ==================== Claude Code CLI Integration ====================

async function callClaudeCodeCLI(contentText, guidesContext, imageList, options = {}) {
  const { verbose, deckPath, prerequisiteFilenames = [], outputName = 'flashcards', chunkInfo } = options;
  const { spawn } = await import('child_process');

  // Get the guides directory path
  const guidesDir = join(deckPath, 'guides');

  // List available guide files
  const guideFiles = existsSync(guidesDir)
    ? readdirSync(guidesDir).filter(f => f.endsWith('.md'))
    : [];

  // Include guide content directly in prompt (don't rely on Claude choosing to read files)
  // This guarantees Claude sees the guide content
  const guideInstructions = guidesContext && guidesContext.length > 0
    ? `CRITICAL: Follow ALL principles in these guides EXACTLY.

${guidesContext}

=== END OF GUIDES ===

You MUST follow every principle above. Key reminders:
- Start with # Chapter/Topic Title, then use ## Section headers
- NO --- separators between cards - just blank lines
- Cover ALL sections comprehensively
- DEFINE concepts before referencing them (sequential learning)

**CRITICAL - END-OF-CHAPTER PROBLEMS**:
The document likely includes "Exercises" and "Problems" sections at the end (numbered like 1.1, 1.2, ..., 1.21, etc.).
These are ESSENTIAL practice material - convert 10-15 representative problems into P:/S: cards.
Include problems with figures (E1.21, E1.22, etc.) - reference the figure in the solution.
DO NOT SKIP the end-of-chapter problems section!`
    : 'Follow research-based spaced repetition principles for flashcard creation.';

  // Add chunk context information for multi-chunk processing
  const chunkContext = chunkInfo
    ? `\n\n## Document Context\nThis is chunk ${chunkInfo.current} of ${chunkInfo.total} (pages ${chunkInfo.startPage}-${chunkInfo.endPage}).
${chunkInfo.isLast
  ? 'This is the FINAL chunk - it likely contains the end-of-chapter Exercises and Problems sections. DO NOT SKIP these - convert 10-15 problems into P:/S: cards!'
  : 'More content follows in subsequent chunks.'}
Continue creating flashcards for this section, maintaining the same quality and format.`
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

    imageInstructions = `\n\n## Available Figures

Reference syntax: ![Description](figures/${outputName}/filename.jpg)

Labeled figures:
${figureList || '(none)'}
${labeledFigures.length > 50 ? `\n... and ${labeledFigures.length - 50} more labeled figures` : ''}
${unlabeledCount > 0 ? `\n(Plus ${unlabeledCount} unlabeled figures available)` : ''}

**IMPORTANT: Include figures liberally.**  Add figures when they:
- Illustrate concepts being tested (diagrams, graphs, systems)
- Are referenced in the source text (e.g., "as shown in Figure 1.11")
- Show relationships that are hard to describe in words
- Provide visual examples that reinforce understanding

When in doubt, include the figure. Visual learners benefit significantly from diagrams.`;
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

  const promptText = `${guideInstructions}${chunkContext}${imageInstructions}

<document_content>
${truncatedContent}
</document_content>${truncationWarning}

Generate flashcards from the document content above, following ALL principles in the guides. ${frontmatterInstruction}`;

  if (verbose) {
    console.log(`[DEBUG] Prompt size: ${promptText.length} chars`);
  }

  return new Promise((resolve, reject) => {
    // Use Claude Code CLI with --print for non-interactive mode
    // Use --add-dir to give Claude access to read the guides
    // Pipe the prompt through stdin to avoid command line length limits
    const args = ['--add-dir', guidesDir, '--print', '--dangerously-skip-permissions'];

    if (verbose) {
      console.log(`[DEBUG] Spawning claude with guides access from: ${guidesDir}`);
      if (prerequisiteFilenames.length > 0) {
        console.log(`[DEBUG] Prerequisites (metadata only): ${prerequisiteFilenames.join(', ')}`);
      }
      console.log(`[DEBUG] Available guides: ${guideFiles.join(', ')}`);
      console.log(`[DEBUG] Available images: ${imageList?.length || 0}`);
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

// ==================== Claude API with MineRU ====================

// Maximum content size before chunking is needed (leave room for guides and instructions)
const MAX_CONTENT_SIZE_FOR_CHUNKING = 120000;

/**
 * Process large documents in chunks, aggregating results
 * @param {string} mineruDir - MineRU output directory
 * @param {string} guidesContext - Loaded guides
 * @param {Object} options - Generation options
 * @returns {Object} Aggregated {flashcards, usedImages, chunkCount}
 */
async function callClaudeWithChunkedMineRU(mineruDir, guidesContext, options = {}) {
  const {
    model = 'claude-sonnet-4-5-20250514',
    verbose = false,
    prerequisiteFilenames = [],
    order,
    tags = [],
    deckPath,
    outputName = 'flashcards'
  } = options;

  // Load MineRU content
  const { content, imagesDir, baseName } = loadMineRUContent(mineruDir, verbose);

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
    const chunkContent = formatMineRUContentForClaude(chunk.content);
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
 * Generate flashcards from MineRU content using Claude
 * @param {string} mineruDir - Path to MineRU output directory
 * @param {string} guidesContext - Loaded guides content
 * @param {Object} options - Generation options
 * @returns {Object} { flashcards, usage, usedImages }
 */
export async function callClaudeWithMineRU(mineruDir, guidesContext, options = {}) {
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

  // Load MineRU content
  const { content, imagesDir, baseName } = loadMineRUContent(mineruDir, verbose);

  // Format content for Claude
  const contentText = formatMineRUContentForClaude(content);

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
    return callClaudeWithChunkedMineRU(mineruDir, guidesContext, options);
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
      outputName: finalOutputName
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
![Description](figures/${finalOutputName}/filename.jpg)

Available images:
${imageList.slice(0, 50).map(img => `- ${img.path}${img.caption ? `: ${img.caption}` : ''}`).join('\n')}
${imageList.length > 50 ? `\n... and ${imageList.length - 50} more images` : ''}

IMPORTANT: Only reference figures that genuinely enhance understanding.`;
  }

  // Prepare system prompt
  const systemPrompt = `You are an expert flashcard creator.

${guidesContext}${tomlInstructions}${imageInstructions}

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
 * @param {Array} imageList - Available images from MineRU
 * @returns {Array} List of used image paths
 */
function extractUsedImages(flashcards, imageList) {
  const usedImages = [];

  // Find all image references in the flashcard content
  // Pattern: ![...](figures/outputName/filename.jpg) or ![...](images/filename.jpg)
  const imageRefPattern = /!\[[^\]]*\]\((?:figures\/[^\/]+\/|images\/)([^)]+)\)/g;
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
  throw new Error('PDF input is no longer supported. Please use MineRU to preprocess your PDF first, then use callClaudeWithMineRU().');
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

    // Check for absolute image paths
    if (line.includes('](') && line.includes('figures/')) {
      if (!line.includes('../figures/')) {
        warnings.push(`Line ${currentLine}: Image path should be relative (../figures/...)`);
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

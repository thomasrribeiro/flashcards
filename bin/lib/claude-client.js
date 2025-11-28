import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, chmodSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
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

export function loadGuides(deckPath) {
  const guidesPath = join(deckPath, 'guides');

  if (!existsSync(guidesPath)) {
    return {
      content: '',
      files: [],
      warning: 'No guides/ folder found. Using minimal context.'
    };
  }

  try {
    const files = readdirSync(guidesPath)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => {
        // Prioritize general.md first
        if (a === 'general.md') return -1;
        if (b === 'general.md') return 1;
        return a.localeCompare(b);
      });

    if (files.length === 0) {
      return {
        content: '',
        files: [],
        warning: 'No guide files found in guides/ folder.'
      };
    }

    let content = '';
    const loadedFiles = [];

    for (const file of files) {
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

// ==================== PDF Text Extraction ====================

async function extractPDFText(pdfPath, verbose = false) {
  const { execSync } = await import('child_process');

  // import.meta.url is file:///path/to/bin/lib/claude-client.js
  const scriptDir = dirname(new URL(import.meta.url).pathname); // /path/to/bin/lib
  const projectRoot = dirname(dirname(scriptDir)); // /path/to (project root)
  const extractorScript = join(scriptDir, 'extract_pdf_text.py');
  const venvPython = join(projectRoot, '.venv/bin/python3');

  if (verbose) {
    console.log(`[DEBUG] Extracting text from PDF using: ${venvPython} ${extractorScript}`);
  }

  let pdfText;
  try {
    pdfText = execSync(`"${venvPython}" "${extractorScript}" "${pdfPath}"`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
  } catch (error) {
    throw new Error(`Failed to extract PDF text: ${error.message}`);
  }

  if (verbose) {
    console.log(`[DEBUG] Extracted text size: ${pdfText.length} characters`);
  }

  return pdfText;
}

// ==================== Claude Code CLI Integration ====================

async function callClaudeCodeCLI(pdfPath, guidesContext, options = {}) {
  const { model, verbose, deckPath, prerequisites = '', prerequisiteFilenames = [], order, tags = [] } = options;
  const { spawn } = await import('child_process');

  // Extract PDF text using shared function
  const pdfText = await extractPDFText(pdfPath, verbose);

  // Get the guides directory path
  const guidesDir = join(deckPath, 'guides');
  const flashcardsDir = join(deckPath, 'flashcards');

  // List available guide files
  const guideFiles = existsSync(guidesDir)
    ? readdirSync(guidesDir).filter(f => f.endsWith('.md'))
    : [];

  // Build comprehensive prompt combining condensed guidelines with guides directory access
  const guideInstructions = guideFiles.length > 0
    ? `First, read ALL the flashcard writing guides from the guides directory:
${guideFiles.map(f => `- Read guides/${f} for comprehensive flashcard creation principles`).join('\n')}

These guides contain research-based SRS principles and subject-specific strategies. Follow ALL principles exactly.`
    : 'Follow research-based spaced repetition principles for flashcard creation.';

  // Add prerequisites context if provided
  const prerequisitesSection = prerequisites
    ? `\n\n## Prerequisite Knowledge\n\nThe following flashcard files contain prerequisite knowledge that students will have already studied:\n${prerequisites}\n\nYou may reference concepts from these prerequisites without re-explaining them in detail. When listing prerequisites in the TOML frontmatter, include: ${prerequisiteFilenames.map(f => `"${f}"`).join(', ')}`
    : '';

  // Add TOML frontmatter instructions if order or tags are specified
  const tomlInstructions = (order !== undefined || tags.length > 0)
    ? `\n\n## TOML Frontmatter Requirements\n\nUse the following values in the TOML frontmatter:\n${order !== undefined ? `- order = ${order}` : '- order = (infer from content or use 1)'}\n${tags.length > 0 ? `- tags = [${tags.map(t => `"${t}"`).join(', ')}]` : '- tags = (infer from content)'}\n- prerequisites = ${prerequisiteFilenames.length > 0 ? `[${prerequisiteFilenames.map(f => `"${f}"`).join(', ')}]` : '[]'}`
    : '';

  // Prepare the prompt - trust the guides completely
  const promptText = `${guideInstructions}${prerequisitesSection}${tomlInstructions}

<pdf_text>
${pdfText}
</pdf_text>

Generate flashcards from the PDF text above, following ALL principles in the guides.`;

  return new Promise((resolve, reject) => {
    // Use Claude Code CLI with --print for non-interactive mode
    // Use --add-dir to give Claude access to read the guides and flashcards (for prerequisites)
    // PDF text is now included directly in the prompt
    const args = [
      '--add-dir', guidesDir,
      '--add-dir', flashcardsDir,
      '--print',
      '--dangerously-skip-permissions',
      promptText
    ];

    // Note: We don't pass --model to Claude CLI, it uses the default (latest sonnet)
    // The model parameter from options is only used for API calls

    if (verbose) {
      console.log(`[DEBUG] Spawning claude with guides access from: ${guidesDir}`);
      console.log(`[DEBUG] Flashcards directory for prerequisites: ${flashcardsDir}`);
      console.log(`[DEBUG] Available guides: ${guideFiles.join(', ')}`);
      if (prerequisiteFilenames.length > 0) {
        console.log(`[DEBUG] Prerequisites: ${prerequisiteFilenames.join(', ')}`);
      }
    }

    const claude = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe']  // ignore stdin, pipe stdout/stderr
    });

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
        reject(new Error(`Claude Code CLI failed: ${stderr}`));
        return;
      }

      // Parse the output to extract flashcards
      let flashcards = stdout.trim();

      // Extract from markdown code block if present
      if (flashcards.includes('```markdown')) {
        const match = flashcards.match(/```markdown\s*([\s\S]*?)\s*```/);
        if (match) {
          flashcards = match[1].trim();
        }
      }

      // Remove common preambles that Claude might add
      const preamblePatterns = [
        /^Based on the PDF content.*?here are.*?flashcards.*?:\s*/is,
        /^Here are.*?flashcards.*?:\s*/is,
        /^I've created.*?flashcards.*?:\s*/is,
        /^I'll create.*?flashcards.*?:\s*/is
      ];

      for (const pattern of preamblePatterns) {
        flashcards = flashcards.replace(pattern, '');
      }

      // Remove trailing summaries/conclusions
      flashcards = flashcards.replace(/\n\n#+\s*(Summary|Distribution|Statistics|Total|Note).*$/is, '');
      flashcards = flashcards.replace(/\n\n(This (?:set|deck|collection)|I(?:'ve| have)|The above).*$/is, '');

      // Trim again after all cleaning
      flashcards = flashcards.trim();

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

// ==================== Claude API ====================

export async function callClaudeWithPDF(pdfPath, guidesContext, options = {}) {
  const {
    apiKey,
    model = 'claude-sonnet-4-5-20250514',
    verbose = false,
    useClaudeCode = false,
    prerequisites = '',
    prerequisiteFilenames = [],
    order,
    tags = []
  } = options;

  // If using Claude Code CLI, delegate to that
  if (useClaudeCode) {
    // Extract deckPath from pdfPath (pdfPath is deckPath/references/filename.pdf)
    const deckPath = dirname(dirname(pdfPath));
    return await callClaudeCodeCLI(pdfPath, guidesContext, {
      model,
      verbose,
      deckPath,
      prerequisites,
      prerequisiteFilenames,
      order,
      tags
    });
  }

  if (!apiKey) {
    throw new Error('API key is required');
  }

  // Extract PDF text using shared function
  const pdfText = await extractPDFText(pdfPath, verbose);

  // Initialize Anthropic client with API key
  const client = new Anthropic({ apiKey });

  // Add prerequisites context if provided
  const prerequisitesSection = prerequisites
    ? `\n\n## Prerequisite Knowledge\n\nThe following flashcard files contain prerequisite knowledge that students will have already studied:\n${prerequisites}\n\nYou may reference concepts from these prerequisites without re-explaining them in detail. When listing prerequisites in the TOML frontmatter, include: ${prerequisiteFilenames.map(f => `"${f}"`).join(', ')}`
    : '';

  // Add TOML frontmatter instructions if order or tags are specified
  const tomlInstructions = (order !== undefined || tags.length > 0)
    ? `\n\n## TOML Frontmatter Requirements\n\nUse the following values in the TOML frontmatter:\n${order !== undefined ? `- order = ${order}` : '- order = (infer from content or use 1)'}\n${tags.length > 0 ? `- tags = [${tags.map(t => `"${t}"`).join(', ')}]` : '- tags = (infer from content)'}\n- prerequisites = ${prerequisiteFilenames.length > 0 ? `[${prerequisiteFilenames.map(f => `"${f}"`).join(', ')}]` : '[]'}`
    : '';

  // Prepare system prompt
  const systemPrompt = `You are an expert flashcard creator.

${guidesContext}${prerequisitesSection}${tomlInstructions}

Generate flashcards from the PDF text below, following ALL principles in the guides above.`;

  // Prepare user message with extracted text
  const userMessage = `<pdf_text>
${pdfText}
</pdf_text>

Generate flashcards from the PDF text above, following ALL principles in the guides.`;

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

    return {
      flashcards,
      usage: response.usage,
      model: response.model
    };
  } catch (error) {
    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    if (error.status === 401) {
      throw new Error('Invalid API key. Please run "flashcards auth login" again.');
    }
    if (error.status === 413) {
      throw new Error('PDF is too large. Try a smaller file or fewer pages.');
    }
    throw new Error(`Claude API error: ${error.message}`);
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

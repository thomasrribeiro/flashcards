#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync } from 'fs';
import { homedir } from 'os';
import * as readline from 'readline';
import * as claudeClient from './lib/claude-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FLASHCARDS_ROOT = resolve(__dirname, '..');

const program = new Command();

program
  .name('flashcards')
  .description('CLI tool for managing flashcard decks and generating cards from PDFs')
  .version('1.1.0');

program
  .command('create')
  .description('Create a new flashcard deck repository')
  .argument('<name>', 'Name of the deck (e.g., intro-mechanics)')
  .option('--path <path>', 'Custom path for the deck (default: public/collection/<name>)')
  .option('--template <template>', 'Copy subject-specific template (e.g., physics, chemistry)')
  .action((name, options) => {
    createDeck(name, options);
  });

program
  .command('add')
  .description('Add a new flashcard file to a deck')
  .argument('<path-to-deck>', 'Path to the deck directory')
  .argument('<card-name>', 'Name of the flashcard file (without .md extension)')
  .action((deckPath, cardName) => {
    addCard(deckPath, cardName);
  });

function createDeck(name, options) {
  // Determine deck path
  const basePath = options.path
    ? resolve(process.cwd(), options.path)
    : resolve(FLASHCARDS_ROOT, 'public', 'collection', name);

  // Check if directory already exists
  if (existsSync(basePath)) {
    console.error(`\x1b[31mError: Directory already exists: ${basePath}\x1b[0m`);
    process.exit(1);
  }

  // Extract subject name from folder name
  const subjectName = name
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  const currentDate = new Date().toISOString().split('T')[0];

  console.log('\x1b[34mCreating flashcard repository\x1b[0m');
  console.log(`\x1b[34mLocation: ${basePath}\x1b[0m`);
  console.log(`\x1b[34mSubject:  ${subjectName}\x1b[0m`);
  console.log(`\x1b[34mDate:     ${currentDate}\x1b[0m`);
  console.log();

  // Create directory structure
  try {
    mkdirSync(join(basePath, 'flashcards'), { recursive: true });
    mkdirSync(join(basePath, 'references'), { recursive: true });
    mkdirSync(join(basePath, 'figures'), { recursive: true });
    mkdirSync(join(basePath, 'guides'), { recursive: true });

    console.log('\x1b[32m✓\x1b[0m Created directory structure:');
    console.log('  - flashcards/   (markdown flashcard files)');
    console.log('  - references/   (source PDFs and textbooks, gitignored)');
    console.log('  - figures/      (extracted images and diagrams)');
    console.log('  - guides/       (flashcard writing guides for Claude)');
    console.log();
  } catch (error) {
    console.error(`\x1b[31mError creating directories: ${error.message}\x1b[0m`);
    process.exit(1);
  }

  // Copy and substitute README template
  try {
    const readmeTemplatePath = join(FLASHCARDS_ROOT, 'templates', 'README.md');
    if (existsSync(readmeTemplatePath)) {
      const readmeTemplate = readFileSync(readmeTemplatePath, 'utf-8');
      const readme = readmeTemplate
        .replace(/{SUBJECT_NAME}/g, subjectName)
        .replace(/{DATE}/g, currentDate);
      writeFileSync(join(basePath, 'README.md'), readme);
      console.log('\x1b[32m✓\x1b[0m Created README.md from template');
    } else {
      console.log('\x1b[33m⚠\x1b[0m Template not found: templates/README.md');
    }
  } catch (error) {
    console.error(`\x1b[31mError creating README.md: ${error.message}\x1b[0m`);
  }

  // Copy general guide (always included)
  try {
    const generalGuidePath = join(FLASHCARDS_ROOT, 'templates', 'guides', 'general.md');
    if (existsSync(generalGuidePath)) {
      const generalGuide = readFileSync(generalGuidePath, 'utf-8');
      const guide = generalGuide
        .replace(/{SUBJECT_NAME}/g, subjectName)
        .replace(/{DATE}/g, currentDate);
      writeFileSync(join(basePath, 'guides', 'general.md'), guide);
      console.log('\x1b[32m✓\x1b[0m Created guides/general.md (universal SRS principles)');
    } else {
      console.log('\x1b[33m⚠\x1b[0m Template not found: templates/guides/general.md');
    }
  } catch (error) {
    console.error(`\x1b[31mError creating guides/general.md: ${error.message}\x1b[0m`);
  }

  // Copy subject-specific guide if --template flag is provided
  if (options.template) {
    try {
      const templatePath = join(FLASHCARDS_ROOT, 'templates', 'guides', `${options.template}.md`);
      if (existsSync(templatePath)) {
        const templateContent = readFileSync(templatePath, 'utf-8');
        writeFileSync(join(basePath, 'guides', `${options.template}.md`), templateContent);
        console.log(`\x1b[32m✓\x1b[0m Created guides/${options.template}.md (subject-specific strategies)`);
        console.log(`   \x1b[90m(Provides ${subjectName}-specific flashcard strategies for Claude)\x1b[0m`);
      } else {
        console.log(`\x1b[33m⚠\x1b[0m Subject template not found: templates/guides/${options.template}.md (skipping)`);
      }
    } catch (error) {
      console.error(`\x1b[31mError copying subject guide: ${error.message}\x1b[0m`);
    }
  }

  // Create .gitignore
  try {
    const gitignoreContent = `# Reference materials (PDFs, textbooks - keep local for copyright)
references/

# macOS
.DS_Store

# Temporary files
*.tmp
*.swp
*~

# Editor directories
.vscode/
.idea/
`;
    writeFileSync(join(basePath, '.gitignore'), gitignoreContent);
    console.log('\x1b[32m✓\x1b[0m Created .gitignore (references/ folder ignored)');
    console.log();
  } catch (error) {
    console.error(`\x1b[31mError creating .gitignore: ${error.message}\x1b[0m`);
  }

  // Create example flashcard file
  try {
    const exampleContent = `Q: What is the purpose of this file?
A: To demonstrate the flashcard format. Delete this file and create your own!

C: Flashcards use [Q:/A:] for questions, [C:] for cloze deletions, and [P:/S:] for methodology.

Q: Where can I find flashcard writing guidelines?
A: See guides/general.md for universal SRS principles, and guides/ for subject-specific strategies.

Q: What is the difference between Q:/A: and P:/S: cards?
A: Q:/A: is for simple questions with direct answers. P:/S: is for teaching problem-solving methodology using the ISAE framework (Identify, Set Up, Approach, Evaluate) with variables only, not numerical computation.

---

# Delete this file when you're ready to create your own flashcards!
`;
    writeFileSync(join(basePath, 'flashcards', 'example.md'), exampleContent);
    console.log('\x1b[32m✓\x1b[0m Created example flashcard file (flashcards/example.md)');
    console.log();
  } catch (error) {
    console.error(`\x1b[31mError creating example file: ${error.message}\x1b[0m`);
  }

  // Final summary
  console.log('\x1b[32m======================================\x1b[0m');
  console.log('\x1b[32m✓ Repository created successfully!\x1b[0m');
  console.log('\x1b[32m======================================\x1b[0m');
  console.log();
  console.log(`📁 Location: ${basePath}`);
  console.log(`📚 Subject:  ${subjectName}`);
  console.log();
  console.log('📝 Next steps:');
  console.log(`  1. cd ${basePath}`);
  console.log('  2. Add source PDFs to references/');
  console.log('  3. Extract figures (if using PDFs):');
  console.log('     Get extract_figures_from_pdf.py from:');
  console.log('     https://github.com/thomasrribeiro/flashcards/blob/main/scripts/extract_figures_from_pdf.py');
  console.log('  4. Create flashcards in flashcards/*.md');
  console.log('  5. Read guides/general.md for universal flashcard best practices');
  if (options.template) {
    console.log(`  6. Read guides/${options.template}.md for ${subjectName}-specific strategies`);
  }
  console.log();

  // Only show GitHub instructions if not in public/collection
  if (!basePath.includes('public/collection')) {
    console.log('🔗 To push to GitHub organization (optional):');
    console.log(`  1. Create repo 'thomasrribeiro-flashcards/${name}' on GitHub`);
    console.log(`  2. cd ${basePath}`);
    console.log(`  3. git init`);
    console.log(`  4. git add .`);
    console.log(`  5. git commit -m "Initial commit: ${subjectName} flashcards"`);
    console.log(`  6. git remote add origin git@github.com:thomasrribeiro-flashcards/${name}.git`);
    console.log('  7. git push -u origin master');
    console.log();
  }

  console.log('🚀 To use with flashcards app:');
  if (basePath.includes('public/collection')) {
    console.log('  Your deck is already in public/collection/ and will be available in the app');
    console.log('  Run: npm run process-submodules');
  } else {
    console.log('  Add this repository as a deck in the flashcards app');
  }
  console.log();
  console.log('📖 Happy studying!');
}

// ==================== Add Command ====================

function addCard(deckPath, cardName) {
  // Resolve the deck path
  const resolvedDeckPath = resolve(process.cwd(), deckPath);

  // Validate deck structure
  const validation = claudeClient.validateDeckStructure(resolvedDeckPath);
  if (!validation.valid) {
    console.error(`\x1b[31mError: Not a valid deck directory: ${resolvedDeckPath}\x1b[0m`);
    console.log();
    console.log(`Missing folders: ${validation.missing.join(', ')}`);
    console.log();
    console.log('A deck must contain:');
    console.log('  flashcards/  - Markdown flashcard files');
    console.log('  guides/      - Flashcard writing guides');
    console.log('  references/  - Source PDFs');
    console.log();
    process.exit(1);
  }

  // Ensure card name doesn't have .md extension
  const cleanCardName = cardName.replace(/\.md$/, '');

  // Create paths
  const flashcardsDir = join(resolvedDeckPath, 'flashcards');
  const figuresDir = join(resolvedDeckPath, 'figures');
  const markdownFilePath = join(flashcardsDir, `${cleanCardName}.md`);
  const figuresFolderPath = join(figuresDir, cleanCardName);

  // Check if markdown file already exists
  if (existsSync(markdownFilePath)) {
    console.error(`\x1b[31mError: Flashcard file already exists: flashcards/${cleanCardName}.md\x1b[0m`);
    process.exit(1);
  }

  // Check if figures folder already exists
  if (existsSync(figuresFolderPath)) {
    console.error(`\x1b[31mError: Figures folder already exists: figures/${cleanCardName}/\x1b[0m`);
    process.exit(1);
  }

  console.log('\x1b[34mAdding new flashcard file\x1b[0m');
  console.log(`\x1b[34mDeck: ${resolvedDeckPath}\x1b[0m`);
  console.log(`\x1b[34mName: ${cleanCardName}\x1b[0m`);
  console.log();

  try {
    // Create empty markdown file
    writeFileSync(markdownFilePath, '', 'utf-8');
    console.log(`\x1b[32m✓\x1b[0m Created flashcards/${cleanCardName}.md`);

    // Create empty figures folder
    mkdirSync(figuresFolderPath, { recursive: true });
    console.log(`\x1b[32m✓\x1b[0m Created figures/${cleanCardName}/`);
    console.log();

    console.log('\x1b[32m✓ Done!\x1b[0m');
    console.log();
    console.log('📝 Next steps:');
    console.log(`  1. Edit flashcards/${cleanCardName}.md and add your flashcards`);
    console.log(`  2. Add any figures to figures/${cleanCardName}/`);
    console.log('  3. Run: \x1b[36mnpm run process-submodules\x1b[0m (to rebuild index)');
    console.log();
  } catch (error) {
    console.error(`\x1b[31mError: ${error.message}\x1b[0m`);
    process.exit(1);
  }
}
// ==================== Rename Figures Command ====================

program
  .command('rename-figures <folder-path>')
  .description('Rename all figures in a folder with descriptive names based on their content')
  .option('--dry-run', 'Preview renaming without actually renaming files')
  .option('--verbose', 'Show detailed progress')
  .action(async (folderPath, options) => {
    await renameFigures(folderPath, options);
  });

async function renameFigures(folderPath, options = {}) {
  const { dryRun = false, verbose = false } = options;

  console.log('\x1b[34m🖼️  Figure Renaming\x1b[0m');
  console.log('━'.repeat(50));
  console.log();

  // Resolve folder path
  const resolvedPath = resolve(process.cwd(), folderPath);

  // Validate folder exists
  if (!existsSync(resolvedPath)) {
    console.error(`\x1b[31m❌ Error: Folder not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  const stats = statSync(resolvedPath);
  if (!stats.isDirectory()) {
    console.error(`\x1b[31m❌ Error: Path is not a directory: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  // Get API key or Claude Code CLI
  const apiKey = await claudeClient.getAccessToken();
  if (!apiKey) {
    console.error('\x1b[31m❌ Error: No authentication configured\x1b[0m');
    console.error('   Run: flashcards auth');
    process.exit(1);
  }

  const useClaudeCode = apiKey === 'USE_CLAUDE_CODE_CLI';

  console.log(`📁 Scanning folder: ${resolvedPath}`);
  console.log();

  // Find all image files recursively
  const imageFiles = [];
  function scanDirectory(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = entry.name.toLowerCase().split('.').pop();
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
          imageFiles.push(fullPath);
        }
      }
    }
  }

  scanDirectory(resolvedPath);

  if (imageFiles.length === 0) {
    console.log('\x1b[33m⚠️  No image files found\x1b[0m');
    return;
  }

  console.log(`Found ${imageFiles.length} image(s)`);
  if (dryRun) {
    console.log('\x1b[33m[DRY RUN MODE - No files will be renamed]\x1b[0m');
  }
  console.log();

  // Process each image
  const renamings = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const imagePath = imageFiles[i];
    const relativePath = imagePath.replace(resolvedPath + '/', '');

    console.log(`[${i + 1}/${imageFiles.length}] Analyzing: ${relativePath}`);

    try {
      // Read image as base64
      const imageBuffer = readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const ext = imagePath.toLowerCase().split('.').pop();
      const mediaType = ext === 'png' ? 'image/png' :
                       ext === 'gif' ? 'image/gif' :
                       ext === 'webp' ? 'image/webp' : 'image/jpeg';

      // Analyze image with Claude
      let newName;
      if (useClaudeCode) {
        // Use Claude Code CLI with --add-dir to give access to the image
        const { execSync } = await import('child_process');
        const imageDir = dirname(imagePath);
        const imageFilename = basename(imagePath);

        if (verbose) {
          console.log(`   [DEBUG] imageDir: ${imageDir}`);
          console.log(`   [DEBUG] imageFilename: ${imageFilename}`);
        }

        const prompt = `Look at the image file "${imageFilename}" and provide a short, descriptive filename (lowercase, underscores for spaces, no extension). Focus on what the image shows (e.g., "force_diagram", "velocity_graph", "circuit_schematic"). Return ONLY the filename, nothing else.`;

        // Build command with proper quoting
        const cmd = `claude --add-dir "${imageDir}" --print --dangerously-skip-permissions '${prompt.replace(/'/g, "'\\''")}'`;

        if (verbose) {
          console.log(`   [DEBUG] Running: ${cmd.substring(0, 100)}...`);
        }

        let stdout;
        try {
          stdout = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 60000,
            maxBuffer: 1024 * 1024
          });
        } catch (error) {
          throw new Error(`Claude CLI failed: ${error.message}`);
        }

        newName = stdout.trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
      } else {
        // Use API
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });

        const response = await client.messages.create({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64
                }
              },
              {
                type: 'text',
                text: 'Analyze this image and provide a short, descriptive filename (lowercase, underscores for spaces, no extension). Focus on what the image shows (e.g., "force_diagram", "velocity_graph", "circuit_schematic"). Return ONLY the filename, nothing else.'
              }
            ]
          }]
        });

        newName = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text.trim())
          .join('')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
      }

      // Ensure we have a valid name
      if (!newName || newName.length === 0) {
        console.log(`   \x1b[33m⚠️  Could not generate name, skipping\x1b[0m`);
        continue;
      }

      // Build new path
      const dir = dirname(imagePath);
      const newPath = join(dir, `${newName}.${ext}`);

      // Check if new path already exists
      if (existsSync(newPath) && newPath !== imagePath) {
        console.log(`   \x1b[33m⚠️  Target exists: ${newName}.${ext} - skipping\x1b[0m`);
        continue;
      }

      renamings.push({ oldPath: imagePath, newPath, newName: `${newName}.${ext}` });
      console.log(`   \x1b[32m→\x1b[0m ${newName}.${ext}`);

    } catch (error) {
      console.log(`   \x1b[31m❌ Error: ${error.message}\x1b[0m`);
      if (verbose) {
        console.error(error);
      }
    }
  }

  console.log();
  console.log('━'.repeat(50));
  console.log();

  if (renamings.length === 0) {
    console.log('\x1b[33mNo files to rename\x1b[0m');
    return;
  }

  // Show summary
  console.log(`\x1b[32m✓ Generated ${renamings.length} new name(s)\x1b[0m`);
  console.log();

  if (!dryRun) {
    // Actually rename files
    console.log('Renaming files...');
    for (const { oldPath, newPath } of renamings) {
      try {
        const fs = await import('fs');
        fs.renameSync(oldPath, newPath);
        if (verbose) {
          console.log(`  ✓ ${basename(oldPath)} → ${basename(newPath)}`);
        }
      } catch (error) {
        console.error(`  \x1b[31m❌ Failed to rename ${basename(oldPath)}: ${error.message}\x1b[0m`);
      }
    }
    console.log();
    console.log('\x1b[32m✨ Renaming complete!\x1b[0m');
  } else {
    console.log('\x1b[90m(Use without --dry-run to actually rename files)\x1b[0m');
  }
}

// ==================== Auth Command ====================

program
  .command('auth')
  .description('Set up Anthropic API key for AI flashcard generation')
  .action(async () => {
    await authLogin();
  });

async function authLogin() {
  console.log('\x1b[34m🔐 Authentication Setup\x1b[0m');
  console.log('━'.repeat(50));
  console.log();

  // Check if Claude Code CLI is available
  const claudeCLIAvailable = await claudeClient.isClaudeCodeCLIAvailable();
  if (claudeCLIAvailable) {
    console.log('\x1b[32m✓ Claude Code CLI detected\x1b[0m');
    console.log();
    console.log('Your CLI tool will use your Claude Max/Pro subscription.');
    console.log('No additional setup required!');
    console.log();
    console.log('📚 Generate flashcards with:');
    console.log('   \x1b[36mflashcards generate references/<pdf-filename>\x1b[0m');
    console.log();
    console.log('💡 Example:');
    console.log('   cd my-deck');
    console.log('   flashcards generate references/textbook.pdf --output chapter-1');
    console.log();
    return;
  }

  // No Claude Code token, offer API key option
  console.log('No Claude Code authentication detected.');
  console.log();
  console.log('You have two options:');
  console.log();
  console.log('\x1b[36m1. Use Claude Code (Recommended)\x1b[0m');
  console.log('   - If you have Claude Max/Pro, run this command in the Claude Code terminal');
  console.log('   - Your subscription includes API access for this tool');
  console.log();
  console.log('\x1b[36m2. Use API Key (Alternative)\x1b[0m');
  console.log('   - Get an API key from: https://console.anthropic.com/settings/keys');
  console.log('   - Note: Requires separate API credits (billed separately from Claude Max/Pro)');
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  try {
    const choice = await question('Enter API key? (y/n) [n]: ');
    console.log();

    if (choice.toLowerCase() !== 'y') {
      console.log('To use Claude Code authentication, run this command in the Claude Code terminal.');
      rl.close();
      return;
    }

    const apiKey = await question('Enter your Anthropic API key: ');
    console.log();

    if (!apiKey || apiKey.trim().length === 0) {
      console.log('\x1b[31m❌ No API key provided\x1b[0m');
      rl.close();
      process.exit(1);
    }

    // Validate API key format
    const trimmedKey = apiKey.trim();
    if (!trimmedKey.startsWith('sk-ant-')) {
      console.log('\x1b[33m⚠  Warning: API key should start with "sk-ant-"\x1b[0m');
      const confirm = await question('Continue anyway? (y/n) [n]: ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('Cancelled.');
        rl.close();
        process.exit(0);
      }
    }

    console.log('⏳ Validating API key...');
    const validation = await claudeClient.validateApiKey(trimmedKey);

    if (!validation.valid) {
      console.log(`\x1b[31m❌ Invalid API key: ${validation.error}\x1b[0m`);
      console.log();
      console.log('💡 Make sure you copied the entire key from the console.');
      rl.close();
      process.exit(1);
    }

    // Save API key
    claudeClient.saveConfig({
      type: 'api_key',
      anthropic_api_key: trimmedKey
    });

    console.log('\x1b[32m✓ API key saved successfully!\x1b[0m');
    console.log();
    console.log('📚 You\'re all set! Generate flashcards with:');
    console.log('   \x1b[36mflashcards generate references/<pdf-filename>\x1b[0m');
    console.log();

  } catch (error) {
    console.log(`\x1b[31m❌ Error: ${error.message}\x1b[0m`);
    console.log();
    rl.close();
    process.exit(1);
  }

  rl.close();
}

// ==================== Generate Command ====================

program
  .command('generate <pdf-path>')
  .description('Generate flashcards from PDF using Claude AI (path relative to deck root)')
  .option('--output <filename>', 'Output markdown filename (default: PDF name)')
  .option('--model <model>', 'Claude model to use', 'claude-sonnet-4-5-20250514')
  .option('--api-key <key>', 'Override stored API key')
  .option('--deck <path>', 'Deck path (auto-detect from cwd if not specified)')
  .option('--prerequisites <files...>', 'Prerequisite markdown files for context (space-separated)')
  .option('--order <number>', 'Order number for TOML frontmatter (e.g., 1 for Chapter 1)', parseInt)
  .option('--tags <tags...>', 'Tags for TOML frontmatter (space-separated, e.g., vectors kinematics)')
  .option('--verbose', 'Show detailed progress and prompt')
  .action(async (pdfFilename, options) => {
    await generateFlashcards(pdfFilename, options);
  });

async function generateFlashcards(pdfFilename, options) {
  console.log('\x1b[34m🤖 AI Flashcard Generation\x1b[0m');
  console.log('━'.repeat(50));
  console.log();

  try {
    // Step 1: Get API key or OAuth token
    let apiKey = options.apiKey;
    if (!apiKey) {
      apiKey = await claudeClient.getAccessToken();
      if (!apiKey) {
        console.log('\x1b[31m❌ Not authenticated\x1b[0m');
        console.log();
        console.log('Run: \x1b[36mflashcards auth\x1b[0m');
        console.log();
        process.exit(1);
      }
    }

    // Step 2: Find deck directory
    let deckPath = options.deck;
    if (!deckPath) {
      deckPath = claudeClient.findDeckDirectory();
      if (!deckPath) {
        console.log('\x1b[31m❌ Not in a flashcard deck directory\x1b[0m');
        console.log();
        console.log('A deck must contain:');
        console.log('  flashcards/  - Markdown flashcard files');
        console.log('  guides/      - Flashcard writing guides');
        console.log('  references/  - Source PDFs');
        console.log();
        console.log('Create a deck first: \x1b[36mflashcards create <name>\x1b[0m');
        console.log('Or specify deck path: \x1b[36m--deck <path>\x1b[0m');
        console.log();
        process.exit(1);
      }
    } else {
      deckPath = resolve(deckPath);
    }

    // Step 3: Validate deck structure
    const validation = claudeClient.validateDeckStructure(deckPath);
    if (!validation.valid) {
      console.log(`\x1b[31m❌ Invalid deck structure\x1b[0m`);
      console.log();
      console.log(`Missing folders: ${validation.missing.join(', ')}`);
      console.log();
      process.exit(1);
    }

    // Step 4: Locate PDF file (use relative path from deck root)
    const pdfPath = join(deckPath, pdfFilename);
    if (!existsSync(pdfPath)) {
      console.log(`\x1b[31m❌ PDF not found: ${pdfFilename}\x1b[0m`);
      console.log();

      const availablePDFs = claudeClient.listPDFsInReferences(deckPath);
      if (availablePDFs.length > 0) {
        console.log('Available PDFs in references/:');
        availablePDFs.forEach(pdf => console.log(`  • references/${pdf}`));
        console.log();
        console.log('Did you mean one of these?');
      } else {
        console.log('No PDFs found in references/ folder.');
        console.log();
        console.log('Add your PDF: \x1b[36mcp ~/file.pdf references/\x1b[0m');
      }
      console.log();
      process.exit(1);
    }

    // Step 5: Load guides
    console.log('📚 Loading flashcard writing guides...');
    const guides = claudeClient.loadGuides(deckPath);

    if (guides.warning) {
      console.log(`\x1b[33m⚠  ${guides.warning}\x1b[0m`);
    }

    if (guides.files.length > 0) {
      console.log(`✓ Loaded guides: ${guides.files.join(', ')}`);
    }
    console.log();

    // Step 5.5: Load prerequisite files (if specified)
    let prerequisitesContent = '';
    const prerequisiteFilenames = [];

    if (options.prerequisites && options.prerequisites.length > 0) {
      console.log('📖 Loading prerequisite files...');
      const flashcardsDir = join(deckPath, 'flashcards');

      for (const prereqFile of options.prerequisites) {
        const prereqPath = join(flashcardsDir, prereqFile);

        if (!existsSync(prereqPath)) {
          console.log(`\x1b[33m⚠  Prerequisite not found: ${prereqFile} (skipping)\x1b[0m`);
          continue;
        }

        try {
          const prereqContent = readFileSync(prereqPath, 'utf-8');
          prerequisitesContent += `\n\n# PREREQUISITE FILE: ${prereqFile}\n\n${prereqContent}`;
          prerequisiteFilenames.push(prereqFile);
          console.log(`✓ Loaded prerequisite: ${prereqFile}`);
        } catch (error) {
          console.log(`\x1b[33m⚠  Error reading ${prereqFile}: ${error.message}\x1b[0m`);
        }
      }

      if (prerequisiteFilenames.length > 0) {
        console.log(`✓ Loaded ${prerequisiteFilenames.length} prerequisite file(s)`);
      }
      console.log();
    }

    // Step 6: Show cost estimate
    const pdfStats = statSync(pdfPath);
    const pdfSizeMB = (pdfStats.size / 1024 / 1024).toFixed(2);
    const costEstimate = claudeClient.estimateCost(pdfStats.size, options.model);

    console.log(`📄 PDF: ${pdfFilename} (${pdfSizeMB} MB)`);
    console.log(`🤖 Model: ${options.model}`);
    console.log(`💰 Estimated cost: $${costEstimate.min.toFixed(2)} - $${costEstimate.max.toFixed(2)}`);
    console.log();

    // Confirm for large PDFs
    if (pdfStats.size > 10 * 1024 * 1024) { // > 10MB
      console.log('\x1b[33m⚠  Large PDF detected\x1b[0m');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question('Continue? (y/n) [y]: ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() === 'n') {
        console.log('Cancelled.');
        process.exit(0);
      }
      console.log();
    }

    // Step 7: Call Claude API or Claude Code CLI
    const useClaudeCode = apiKey === 'USE_CLAUDE_CODE_CLI';

    if (useClaudeCode) {
      console.log('✨ Using Claude Code (your Max/Pro subscription)');
    }
    console.log(`⏳ Generating flashcards... (this may take 1-3 minutes)`);
    console.log();

    const result = await claudeClient.callClaudeWithPDF(pdfPath, guides.content, {
      apiKey: useClaudeCode ? null : apiKey,
      model: options.model,
      verbose: options.verbose,
      useClaudeCode,
      prerequisites: prerequisitesContent,
      prerequisiteFilenames,
      order: options.order,
      tags: options.tags
    });

    // Step 8: Validate flashcards
    const validationResult = claudeClient.validateFlashcards(result.flashcards);

    if (validationResult.warnings.length > 0 && options.verbose) {
      console.log('\x1b[33m⚠  Validation warnings:\x1b[0m');
      validationResult.warnings.forEach(w => console.log(`   ${w}`));
      console.log();
    }

    if (!validationResult.valid) {
      console.log('\x1b[31m❌ Generated flashcards have errors:\x1b[0m');
      validationResult.errors.forEach(e => console.log(`   ${e}`));
      console.log();
      console.log('Saving anyway - please review and fix manually.');
      console.log();
    }

    // Step 9: Save output
    const outputFilename = options.output || basename(pdfFilename).replace('.pdf', '') + '.md';
    const outputPath = join(deckPath, 'flashcards', outputFilename);

    // Ensure .md extension
    const finalOutputPath = outputPath.endsWith('.md') ? outputPath : outputPath + '.md';

    // Debug logging
    if (options.verbose) {
      console.log(`[DEBUG] deckPath: ${deckPath}`);
      console.log(`[DEBUG] outputFilename: ${outputFilename}`);
      console.log(`[DEBUG] finalOutputPath: ${finalOutputPath}`);
      console.log(`[DEBUG] Content length: ${result.flashcards.length} chars`);
    }

    // Ensure flashcards directory exists
    const flashcardsDir = join(deckPath, 'flashcards');
    if (!existsSync(flashcardsDir)) {
      mkdirSync(flashcardsDir, { recursive: true });
      if (options.verbose) {
        console.log(`[DEBUG] Created directory: ${flashcardsDir}`);
      }
    }

    // Write file with error handling
    try {
      writeFileSync(finalOutputPath, result.flashcards, 'utf-8');
      if (options.verbose) {
        console.log(`[DEBUG] Successfully wrote file to: ${finalOutputPath}`);
      }
    } catch (error) {
      console.error(`\x1b[31m❌ Failed to write flashcards file:\x1b[0m`);
      console.error(`   Path: ${finalOutputPath}`);
      console.error(`   Error: ${error.message}`);
      process.exit(1);
    }

    // Step 10: Extract images (if any)
    const imageResult = await claudeClient.extractImagesFromPDF(
      pdfPath,
      result.flashcards,
      join(deckPath, 'figures', outputFilename.replace('.md', ''))
    );

    // Step 11: Show summary
    console.log(`\x1b[32m✓ Generated ${validationResult.cardCount} flashcards → flashcards/${outputFilename}\x1b[0m`);
    if (imageResult.extracted.length > 0) {
      console.log(`\x1b[32m✓ Extracted ${imageResult.extracted.length} images → figures/${outputFilename.replace('.md', '')}/\x1b[0m`);
    }

    if (useClaudeCode) {
      console.log(`\x1b[32m✓ Cost: Included in your Claude subscription\x1b[0m`);
    } else {
      const actualCost = ((result.usage.input_tokens / 1000000) * 3 +
                          (result.usage.output_tokens / 1000000) * 15).toFixed(2);
      console.log(`\x1b[32m✓ Cost: $${actualCost}\x1b[0m`);
    }
    console.log();

    console.log('📝 Next steps:');
    console.log(`  1. Review generated flashcards (AI may have errors!)`);
    console.log(`  2. Edit flashcards/${outputFilename} to refine wording`);
    console.log('  3. Verify image references are correct');
    console.log('  4. Run: \x1b[36mnpm run process-submodules\x1b[0m (to rebuild index)');
    console.log('  5. Study in the flashcards app!');
    console.log();

    console.log('💡 \x1b[33mGenerated flashcards need human review. Check for:\x1b[0m');
    console.log('   • Factual accuracy (AI can hallucinate)');
    console.log('   • Appropriate difficulty');
    console.log('   • Atomic concepts (one idea per card)');
    console.log('   • Proper formatting (Q:/A:/C:/P:/S:)');
    console.log();

    if (guides.files.length > 0) {
      console.log(`📚 Guides used: ${guides.files.join(', ')}`);
      console.log();
    }

  } catch (error) {
    console.log(`\x1b[31m❌ Error: ${error.message}\x1b[0m`);
    console.log();

    if (error.message.includes('Rate limit')) {
      console.log('💡 Wait a moment and try again.');
    } else if (error.message.includes('Invalid API key')) {
      console.log('💡 Run: \x1b[36mflashcards auth login\x1b[0m');
    } else if (error.message.includes('too large')) {
      console.log('💡 Try a smaller PDF');
    }
    console.log();
    process.exit(1);
  }
}

program.parse();

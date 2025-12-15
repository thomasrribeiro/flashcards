#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync, renameSync } from 'fs';
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
  .option('--path <path>', 'Custom path for the deck (default: current directory)')
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
  // Default: create in current directory (e.g., ./test/)
  // With --path: create in specified path (e.g., --path ~/decks creates ~/decks/test/)
  const basePath = options.path
    ? resolve(process.cwd(), options.path, name)
    : resolve(process.cwd(), name);

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
    mkdirSync(join(basePath, 'sources'), { recursive: true });

    console.log('\x1b[32m✓\x1b[0m Created directory structure:');
    console.log('  - flashcards/   (markdown flashcard files)');
    console.log('  - references/   (source PDFs and textbooks, gitignored)');
    console.log('  - sources/      (processed PDF content and images)');
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
  console.log('  3. Process PDFs: flashcards process references/<pdf-file> --output <name>');
  console.log('  4. Generate flashcards: flashcards generate sources/<name> --output <name>');
  console.log('     (Use --template physics for subject-specific guidance)');
  console.log('  5. Review and edit flashcards/*.md');
  console.log();

  console.log('🔗 To push to GitHub (optional):');
  console.log(`  git init && git add . && git commit -m "Initial commit"`);
  console.log(`  git remote add origin git@github.com:YOUR_ORG/${name}.git`);
  console.log('  git push -u origin master');
  console.log();

  console.log('🚀 To use with flashcards app:');
  console.log('  Add this repository as a deck in the flashcards app');
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

// ==================== Analyze Figures Command ====================

/**
 * Generate a slug from description text.
 * @param {string} description - Figure description
 * @param {number} maxLength - Maximum slug length (default 40)
 * @returns {string} Slug (e.g., "step-by-step-addition-showing-1683")
 */
function descriptionToSlug(description, maxLength = 40) {
  if (!description) return '';

  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
    .slice(0, maxLength)           // Limit length
    .replace(/-+$/, '');           // Trim trailing hyphen if cut mid-word
}

/**
 * Detect multi-part figure groups from filenames.
 * Multi-part figures have pattern: base-N.ext (e.g., "6-1.png", "6-2.png")
 * @param {string[]} filenames - List of filenames
 * @returns {Object} Map of base -> [filenames] for groups with 2+ parts
 */
function detectMultiPartGroups(filenames) {
  const grouped = {};

  for (const filename of filenames) {
    // Match pattern: anything-N.ext where N is a digit
    const match = filename.match(/^(.+)-(\d+)\.[^.]+$/);
    if (match) {
      const base = match[1];
      if (!grouped[base]) grouped[base] = [];
      grouped[base].push({ filename, partNum: parseInt(match[2], 10) });
    }
  }

  // Only keep groups with 2+ parts, sorted by part number
  const multiPartGroups = {};
  for (const [base, parts] of Object.entries(grouped)) {
    if (parts.length >= 2) {
      multiPartGroups[base] = parts.sort((a, b) => a.partNum - b.partNum);
    }
  }

  return multiPartGroups;
}

/**
 * Build a lookup for which files belong to multi-part groups.
 * @param {Object} multiPartGroups - Output from detectMultiPartGroups
 * @returns {Map<string, {base: string, partNum: number}>} filename -> group info
 */
function buildMultiPartLookup(multiPartGroups) {
  const lookup = new Map();
  for (const [base, parts] of Object.entries(multiPartGroups)) {
    for (const { filename, partNum } of parts) {
      lookup.set(filename, { base, partNum });
    }
  }
  return lookup;
}

program
  .command('analyze-figures <figures-dir>')
  .description('Analyze figures, generate manifest, and rename files with descriptive names')
  .option('--verbose', 'Show detailed progress')
  .option('--force', 'Recompute even if manifest.json already exists')
  .option('--batch-size <n>', 'Number of figures to process in each Claude call', parseInt)
  .option('--no-rename', 'Skip renaming files (only generate manifest)')
  .action(async (figuresDir, options) => {
    await analyzeFigures(figuresDir, options);
  });

async function analyzeFigures(figuresDirInput, options = {}) {
  const { verbose = false, force = false, batchSize = 20, rename = true } = options;

  console.log('\x1b[34m🔍 Figure Analysis\x1b[0m');
  console.log('━'.repeat(50));
  console.log();

  // Resolve figures directory path
  const figuresDir = resolve(process.cwd(), figuresDirInput);

  // Validate directory exists
  if (!existsSync(figuresDir)) {
    console.error(`\x1b[31m❌ Error: Directory not found: ${figuresDir}\x1b[0m`);
    process.exit(1);
  }

  const stats = statSync(figuresDir);
  if (!stats.isDirectory()) {
    console.error(`\x1b[31m❌ Error: Path is not a directory: ${figuresDir}\x1b[0m`);
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

  console.log(`📁 Figures directory: ${figuresDir}`);
  console.log();

  // Find all image files (non-recursive, just the figures directory)
  const imageFiles = readdirSync(figuresDir)
    .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
    .sort((a, b) => {
      // Sort numerically by extracting leading numbers
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  if (imageFiles.length === 0) {
    console.log('\x1b[33m⚠️  No image files found\x1b[0m');
    return;
  }

  console.log(`Found ${imageFiles.length} figure(s)`);

  // Step 1: Detect multi-part groups DETERMINISTICALLY from filenames
  const multiPartGroups = detectMultiPartGroups(imageFiles);
  const multiPartLookup = buildMultiPartLookup(multiPartGroups);

  if (Object.keys(multiPartGroups).length > 0) {
    console.log(`Detected ${Object.keys(multiPartGroups).length} multi-part figure group(s):`);
    for (const [base, parts] of Object.entries(multiPartGroups)) {
      console.log(`   ${base}: ${parts.map(p => p.filename).join(', ')}`);
    }
  }
  console.log();

  // Check for existing manifest
  const manifestPath = join(figuresDir, 'manifest.json');
  let existingManifest = {};
  if (existsSync(manifestPath) && !force) {
    try {
      existingManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      console.log(`📋 Found existing manifest with ${Object.keys(existingManifest).length} entries`);

      // Find figures that need analysis
      const newFigures = imageFiles.filter(f => !existingManifest[f]);
      if (newFigures.length === 0) {
        console.log('\x1b[32m✓ All figures already analyzed\x1b[0m');
        console.log(`  Manifest: ${manifestPath}`);
        console.log('  Use --force to recompute');
        return;
      }
      console.log(`   ${newFigures.length} new figure(s) to analyze`);
      console.log();
    } catch (e) {
      console.log('\x1b[33m⚠️  Could not parse existing manifest, will regenerate\x1b[0m');
      existingManifest = {};
    }
  } else if (force && existsSync(manifestPath)) {
    console.log('📋 --force specified, recomputing all figures');
    console.log();
  }

  // Filter to only figures that need analysis (all if force)
  const figuresToAnalyze = force ? imageFiles : imageFiles.filter(f => !existingManifest[f]);

  if (figuresToAnalyze.length === 0) {
    console.log('\x1b[32m✓ All figures already analyzed\x1b[0m');
    return;
  }

  // Process figures in batches using Claude
  const manifest = { ...existingManifest };
  const totalBatches = Math.ceil(figuresToAnalyze.length / batchSize);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, figuresToAnalyze.length);
    const batchFigures = figuresToAnalyze.slice(batchStart, batchEnd);

    console.log(`[Batch ${batchIdx + 1}/${totalBatches}] Analyzing ${batchFigures.length} figures...`);

    try {
      if (useClaudeCode) {
        // Use Claude Code CLI with --add-dir to give access to figures
        const { execSync } = await import('child_process');

        const figureListStr = batchFigures.join(', ');
        const prompt = `Analyze each of these figures in the current directory and describe what they show.

Figures to analyze: ${figureListStr}

For EACH figure, provide a JSON object with:
- "filename": the exact filename
- "type": one of "worked_example", "diagram", "chart", "table", "concept_illustration", "decorative", "other"
- "description": comprehensive description including what the figure shows AND any specific values/data (e.g., "Step-by-step addition showing 1,683 + 479 = 2,162 with carrying")
- "flashcard_suggestion": brief suggestion for how to use this in a flashcard (e.g., "P:/S: card asking to solve 1,683 + 479") or null if decorative

Return ONLY a JSON array of these objects, no other text. Example:
[
  {"filename": "37.png", "type": "worked_example", "description": "Step-by-step addition showing 1,683 + 479 = 2,162 with carrying", "flashcard_suggestion": "P:/S: card: Add 1,683 + 479"},
  {"filename": "38.png", "type": "decorative", "description": "Chapter header image of a calculator", "flashcard_suggestion": null}
]`;

        const result = execSync(
          `claude --add-dir "${figuresDir}" -p "${prompt.replace(/"/g, '\\"')}"`,
          {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            timeout: 300000 // 5 minutes per batch
          }
        ).trim();

        // Parse JSON from result
        let jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const batchResults = JSON.parse(jsonMatch[0]);
          for (const item of batchResults) {
            if (item.filename && batchFigures.includes(item.filename)) {
              manifest[item.filename] = {
                type: item.type || 'other',
                description: item.description || '',
                flashcard_suggestion: item.flashcard_suggestion || null
              };
              if (verbose) {
                console.log(`   ✓ ${item.filename}: ${item.type} - ${item.description?.substring(0, 50)}...`);
              }
            }
          }
        } else {
          console.log(`\x1b[33m⚠️  Could not parse batch ${batchIdx + 1} results\x1b[0m`);
          if (verbose) console.log(`   Raw result: ${result.substring(0, 200)}...`);
        }
      } else {
        // Use Claude API with vision
        const messages = [];
        const content = [];

        // Add images to the message
        for (const figureFile of batchFigures) {
          const imagePath = join(figuresDir, figureFile);
          const imageBuffer = readFileSync(imagePath);
          const imageBase64 = imageBuffer.toString('base64');
          const ext = figureFile.toLowerCase().split('.').pop();
          const mediaType = ext === 'png' ? 'image/png' :
                           ext === 'gif' ? 'image/gif' :
                           ext === 'webp' ? 'image/webp' : 'image/jpeg';

          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64
            }
          });
          content.push({
            type: 'text',
            text: `[Image: ${figureFile}]`
          });
        }

        content.push({
          type: 'text',
          text: `Analyze each of the ${batchFigures.length} figures shown above.

For EACH figure (${batchFigures.join(', ')}), provide a JSON object with:
- "filename": the exact filename
- "type": one of "worked_example", "diagram", "chart", "table", "concept_illustration", "decorative", "other"
- "description": comprehensive description including what the figure shows AND any specific values/data
- "flashcard_suggestion": brief suggestion for how to use this in a flashcard or null if decorative

Return ONLY a JSON array of these objects, no other text.`
        });

        messages.push({ role: 'user', content });

        const response = await claudeClient.callClaudeAPI(apiKey, {
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 4096,
          messages
        });

        const resultText = response.content[0].text;
        let jsonMatch = resultText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const batchResults = JSON.parse(jsonMatch[0]);
          for (const item of batchResults) {
            if (item.filename) {
              manifest[item.filename] = {
                type: item.type || 'other',
                description: item.description || '',
                flashcard_suggestion: item.flashcard_suggestion || null
              };
              if (verbose) {
                console.log(`   ✓ ${item.filename}: ${item.type}`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`\x1b[31m❌ Error processing batch ${batchIdx + 1}: ${error.message}\x1b[0m`);
      if (verbose) console.error(error);
    }

    // Save manifest after each batch (in case of interruption)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`   Saved progress (${Object.keys(manifest).length} total entries)`);
  }

  console.log();
  console.log('\x1b[32m✨ Figure analysis complete!\x1b[0m');
  console.log(`   Manifest saved: ${manifestPath}`);
  console.log(`   Total figures: ${Object.keys(manifest).length}`);

  // Summary by type
  const typeCounts = {};
  for (const entry of Object.values(manifest)) {
    typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
  }
  console.log('   By type:');
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     - ${type}: ${count}`);
  }

  // Step 2: Rename files DETERMINISTICALLY
  if (rename) {
    console.log();
    console.log('\x1b[34m📝 Renaming figures...\x1b[0m');

    // Track used filenames to handle collisions
    const usedFilenames = new Set();
    const renamedManifest = {};
    let renameCount = 0;
    let skipCount = 0;

    // For multi-part groups, we need to use description from FIRST part for ALL parts
    // First pass: collect base descriptions for multi-part groups
    const groupBaseDescriptions = {};
    for (const [base, parts] of Object.entries(multiPartGroups)) {
      // Use description from the first part (lowest part number)
      const firstPart = parts[0];
      if (manifest[firstPart.filename]) {
        groupBaseDescriptions[base] = manifest[firstPart.filename].description;
      }
    }

    // Process files in deterministic order (sorted by original filename)
    const sortedFilenames = Object.keys(manifest).sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    for (const oldFilename of sortedFilenames) {
      const entry = manifest[oldFilename];
      const ext = oldFilename.split('.').pop();

      // Check if file still exists (might have been renamed in previous run)
      const oldPath = join(figuresDir, oldFilename);
      if (!existsSync(oldPath)) {
        if (verbose) console.log(`   ⚠️  Skip ${oldFilename}: file not found`);
        skipCount++;
        continue;
      }

      // Determine the base slug for this file
      let baseSlug;
      let partSuffix = '';

      const multiPartInfo = multiPartLookup.get(oldFilename);
      if (multiPartInfo) {
        // This is part of a multi-part group - use group's base description
        const groupDescription = groupBaseDescriptions[multiPartInfo.base];
        baseSlug = descriptionToSlug(groupDescription || entry.description);
        partSuffix = `-${multiPartInfo.partNum}`;
      } else {
        // Single figure - use its own description
        baseSlug = descriptionToSlug(entry.description);
      }

      if (!baseSlug) {
        // Can't generate slug, keep original
        renamedManifest[oldFilename] = entry;
        usedFilenames.add(oldFilename);
        skipCount++;
        continue;
      }

      // Generate new filename with collision handling
      let newFilename = `${baseSlug}${partSuffix}.${ext}`;
      let collisionCounter = 0;

      while (usedFilenames.has(newFilename) || (existsSync(join(figuresDir, newFilename)) && newFilename !== oldFilename)) {
        collisionCounter++;
        newFilename = `${baseSlug}${partSuffix}-${collisionCounter}.${ext}`;
      }

      if (newFilename === oldFilename) {
        // No rename needed
        renamedManifest[oldFilename] = entry;
        usedFilenames.add(oldFilename);
        skipCount++;
        continue;
      }

      const newPath = join(figuresDir, newFilename);

      try {
        renameSync(oldPath, newPath);
        renamedManifest[newFilename] = {
          ...entry,
          original_filename: oldFilename
        };
        usedFilenames.add(newFilename);
        renameCount++;
        if (verbose) console.log(`   ✓ ${oldFilename} → ${newFilename}`);
      } catch (err) {
        console.log(`   \x1b[31m❌ Failed to rename ${oldFilename}: ${err.message}\x1b[0m`);
        renamedManifest[oldFilename] = entry;
        usedFilenames.add(oldFilename);
        skipCount++;
      }
    }

    // Save updated manifest with new filenames
    writeFileSync(manifestPath, JSON.stringify(renamedManifest, null, 2));

    console.log(`   Renamed: ${renameCount} files`);
    if (skipCount > 0) console.log(`   Skipped: ${skipCount} files`);
    console.log(`   Updated manifest saved`);
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

// ==================== Show-Prompt Command ====================

program
  .command('show-prompt <flashcard-file>')
  .description('Reconstruct and display the prompt used to generate a flashcard file')
  .option('--deck <path>', 'Deck path (auto-detect from cwd if not specified)')
  .option('--output <file>', 'Write prompt to file instead of stdout')
  .action(async (flashcardFile, options) => {
    await showPrompt(flashcardFile, options);
  });

async function showPrompt(flashcardFileInput, options) {
  console.log('\x1b[34m📝 Prompt Reconstruction\x1b[0m');
  console.log('━'.repeat(50));
  console.log();

  try {
    // Step 1: Find deck directory
    let deckPath = options.deck;
    if (!deckPath) {
      deckPath = claudeClient.findDeckDirectory();
      if (!deckPath) {
        console.log('\x1b[31m❌ Not in a flashcard deck directory\x1b[0m');
        console.log();
        console.log('Specify deck path: \x1b[36m--deck <path>\x1b[0m');
        console.log();
        process.exit(1);
      }
    } else {
      deckPath = resolve(deckPath);
    }

    // Step 2: Resolve flashcard file path
    const flashcardPath = resolve(flashcardFileInput);
    if (!existsSync(flashcardPath)) {
      // Try relative to flashcards/ directory
      const altPath = join(deckPath, 'flashcards', flashcardFileInput);
      if (existsSync(altPath)) {
        flashcardFileInput = altPath;
      } else {
        console.log(`\x1b[31m❌ Flashcard file not found: ${flashcardFileInput}\x1b[0m`);
        process.exit(1);
      }
    }

    const resolvedPath = existsSync(flashcardPath) ? flashcardPath : join(deckPath, 'flashcards', flashcardFileInput);

    console.log(`📂 Deck: ${deckPath}`);
    console.log(`📄 File: ${resolvedPath}`);
    console.log();

    // Step 3: Reconstruct the prompt (guides are fetched fresh from GitHub)
    const result = await claudeClient.reconstructPrompt(resolvedPath, deckPath);

    // Show warnings
    if (result.warnings.length > 0) {
      console.log('\x1b[33m⚠  Warnings:\x1b[0m');
      result.warnings.forEach(w => console.log(`   ${w}`));
      console.log();
    }

    if (!result.prompt) {
      console.log('\x1b[31m❌ Could not reconstruct prompt\x1b[0m');
      process.exit(1);
    }

    // Show metadata
    if (result.metadata) {
      console.log('\x1b[36m📋 Generation Metadata:\x1b[0m');
      console.log(`   Source: ${result.metadata.source}`);
      console.log(`   Generated: ${result.metadata.generatedAt}`);
      if (result.metadata.flashcardsCommit) {
        console.log(`   Flashcards Commit: ${result.metadata.flashcardsCommit}`);
      }
      if (result.metadata.model) {
        console.log(`   Model: ${result.metadata.model}`);
      }
      console.log(`   Guides: ${result.metadata.guides?.join(', ') || '(none)'}`);
      console.log();
    }

    // Output prompt
    if (options.output) {
      writeFileSync(options.output, result.prompt, 'utf-8');
      console.log(`\x1b[32m✓ Prompt written to: ${options.output}\x1b[0m`);
      console.log(`   Size: ${result.prompt.length} characters`);
    } else {
      console.log('\x1b[36m━'.repeat(50) + '\x1b[0m');
      console.log('\x1b[36mReconstructed Prompt:\x1b[0m');
      console.log('\x1b[36m━'.repeat(50) + '\x1b[0m');
      console.log();
      console.log(result.prompt);
      console.log();
      console.log('\x1b[36m━'.repeat(50) + '\x1b[0m');
      console.log(`\x1b[90mPrompt size: ${result.prompt.length} characters\x1b[0m`);
    }

  } catch (error) {
    console.log(`\x1b[31m❌ Error: ${error.message}\x1b[0m`);
    process.exit(1);
  }
}

// ==================== Process Command ====================

program
  .command('process <path>')
  .description('Process a PDF (or all PDFs in a directory) and prepare for flashcard generation')
  .option('--output <name>', 'Output name for the source (default: derived from PDF filename). Ignored when processing a directory.')
  .option('--deck <path>', 'Deck path (auto-detect from cwd if not specified)')
  .option('--keep-temp', 'Keep temporary processing output (default: clean up)')
  .option('--force', 'Force reprocessing even if existing output is found')
  .option('--use-existing', 'Automatically use existing temp output if found')
  .option('--verbose', 'Show detailed progress')
  .option('-b, --backend <engine>', 'PDF processing backend: pipeline, vlm-transformers, vlm-vllm-engine, vlm-lmdeploy-engine, vlm-http-client, vlm-mlx-engine', 'vlm-mlx-engine')
  .option('-m, --method <method>', 'PDF processing method: auto, txt, ocr', 'ocr')
  .option('-l, --lang <lang>', 'Document language: ch, ch_server, ch_lite, en, korean, japan, chinese_cht, ta, te, ka, th, el, latin, arabic, east_slavic, cyrillic, devanagari', 'en')
  .action(async (inputPath, options) => {
    const resolvedPath = resolve(inputPath);

    // Check if input is a directory
    if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
      // Find all PDFs in the directory with natural sorting (1, 2, 10 not 1, 10, 2)
      const pdfFiles = readdirSync(resolvedPath)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => join(resolvedPath, f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      if (pdfFiles.length === 0) {
        console.log(`\x1b[31m❌ No PDF files found in: ${inputPath}\x1b[0m`);
        process.exit(1);
      }

      console.log(`\x1b[34m📁 Batch Processing: ${pdfFiles.length} PDFs\x1b[0m`);
      console.log('━'.repeat(50));
      console.log();

      for (const pdfFile of pdfFiles) {
        console.log(`\x1b[34m▶ Processing: ${basename(pdfFile)}\x1b[0m`);
        console.log();
      }
      console.log();

      let successful = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < pdfFiles.length; i++) {
        const pdfFile = pdfFiles[i];
        console.log(`\x1b[34m[${ i + 1}/${pdfFiles.length}] Processing: ${basename(pdfFile)}\x1b[0m`);
        console.log('─'.repeat(50));

        try {
          // Don't use --output for batch processing (derive from filename)
          const batchOptions = { ...options, output: undefined, _batchMode: true };
          await processPDF(pdfFile, batchOptions);
          successful++;
        } catch (err) {
          if (err.message === 'SKIPPED') {
            skipped++;
          } else {
            console.log(`\x1b[31m❌ Failed: ${err.message}\x1b[0m`);
            failed++;
          }
        }
        console.log();
      }

      console.log('━'.repeat(50));
      console.log(`\x1b[34m📊 Batch Complete\x1b[0m`);
      console.log(`   ✓ Successful: ${successful}`);
      if (skipped > 0) console.log(`   ⊘ Skipped (already exist): ${skipped}`);
      if (failed > 0) console.log(`   ✗ Failed: ${failed}`);
      console.log();
    } else {
      // Single PDF processing
      await processPDF(inputPath, options);
    }
  });

async function processPDF(pdfPathInput, options) {
  const { execSync, spawn } = await import('child_process');
  const { tmpdir } = await import('os');
  const { rmSync } = await import('fs');

  console.log('\x1b[34m📄 PDF Processing\x1b[0m');
  console.log('━'.repeat(50));
  console.log();

  // Track state for error recovery
  let tempDir = null;
  let processingCompleted = false;
  let deckPath = null;
  let outputName = null;

  try {
    // Step 1: Find deck directory
    deckPath = options.deck;
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

    // Step 2: Resolve PDF path
    const pdfPath = resolve(pdfPathInput);
    if (!existsSync(pdfPath)) {
      console.log(`\x1b[31m❌ PDF not found: ${pdfPathInput}\x1b[0m`);
      process.exit(1);
    }

    // Step 3: Check if PDF processor (mineru or magic-pdf) is installed
    let processorCmd = 'mineru';
    try {
      execSync('which mineru', { stdio: 'ignore' });
    } catch {
      try {
        execSync('which magic-pdf', { stdio: 'ignore' });
        processorCmd = 'magic-pdf';
      } catch {
        console.log('\x1b[31m❌ PDF processor not found\x1b[0m');
        console.log();
        console.log('Install a PDF processor:');
        console.log('  pip install magic-pdf');
        console.log();
        console.log('Or see: https://github.com/opendatalab/MinerU');
        console.log();
        process.exit(1);
      }
    }

    // Step 4: Determine output name
    const pdfBasename = basename(pdfPath, '.pdf').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    outputName = options.output || pdfBasename;

    console.log(`📂 Deck: ${deckPath}`);
    console.log(`📄 PDF: ${pdfPath}`);
    console.log(`📝 Output: sources/${outputName}/`);
    console.log();

    // Step 4b: Check if source already exists in deck
    const existingSourceDir = join(deckPath, 'sources', outputName);
    const existingContentJson = join(existingSourceDir, 'content.json');
    if (existsSync(existingContentJson) && !options.force) {
      console.log('\x1b[32m✓ Source already exists - skipping\x1b[0m');
      console.log(`   ${existingSourceDir}/`);
      console.log();
      // Throw special error for batch processing to track skips
      throw new Error('SKIPPED');
    }

    // Step 4c: Check for existing temp directories from previous runs
    const tempBase = tmpdir();
    const existingTempDirs = readdirSync(tempBase)
      .filter(d => d.startsWith('mineru-'))
      .map(d => join(tempBase, d))
      .filter(d => {
        try {
          return statSync(d).isDirectory();
        } catch {
          return false;
        }
      });

    // Helper to find content_list.json in a directory tree
    const findContentListInDir = (dir, maxDepth = 3) => {
      if (maxDepth <= 0) return null;
      try {
        const files = readdirSync(dir);
        // Check current directory
        const contentFile = files.find(f => f.endsWith('_content_list.json'));
        if (contentFile) return { dir, file: contentFile };
        // Check subdirectories
        for (const subdir of files) {
          const subdirPath = join(dir, subdir);
          try {
            if (statSync(subdirPath).isDirectory()) {
              const result = findContentListInDir(subdirPath, maxDepth - 1);
              if (result) return result;
            }
          } catch {
            // Skip inaccessible directories
          }
        }
      } catch {
        // Skip inaccessible directories
      }
      return null;
    };

    // Check each temp directory for matching PDF output
    for (const existingTemp of existingTempDirs) {
      const found = findContentListInDir(existingTemp);
      if (found) {
        // Check if this temp dir contains output for our PDF
        const tempContents = readdirSync(existingTemp);
        const matchesPdf = tempContents.some(d =>
          d.toLowerCase().includes(pdfBasename.replace(/_/g, '')) ||
          pdfBasename.includes(d.toLowerCase().replace(/[^a-z0-9]/g, ''))
        );

        if (matchesPdf) {
          console.log('\x1b[33m⚠  Found existing output from previous run!\x1b[0m');
          console.log(`   ${existingTemp}`);
          console.log();

          const imagesDir = join(found.dir, 'images');

          // If --use-existing, automatically copy the files
          if (options.useExisting) {
            console.log('\x1b[32m✓ Using existing output (--use-existing)\x1b[0m');
            console.log();

            // Copy files to sources directory
            const sourcesDir = join(deckPath, 'sources', outputName);
            const imagesDestDir = join(sourcesDir, 'images');
            mkdirSync(imagesDestDir, { recursive: true });

            // Copy content_list.json → content.json
            copyFileSync(join(found.dir, found.file), join(sourcesDir, 'content.json'));
            console.log('✓ Copied content.json');

            // Copy images
            if (existsSync(imagesDir)) {
              const imageFiles = readdirSync(imagesDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
              for (const imgFile of imageFiles) {
                copyFileSync(join(imagesDir, imgFile), join(imagesDestDir, imgFile));
              }
              console.log(`✓ Copied ${imageFiles.length} images`);
            }

            console.log();
            console.log('\x1b[32m━'.repeat(50) + '\x1b[0m');
            console.log(`\x1b[32m✓ Source recovered from temp!\x1b[0m`);
            console.log('\x1b[32m━'.repeat(50) + '\x1b[0m');
            console.log();
            console.log(`📁 Source created: sources/${outputName}/`);
            console.log();
            console.log('📝 Next step - generate flashcards:');
            console.log(`   \x1b[36mflashcards generate sources/${outputName} --output ${outputName}\x1b[0m`);
            console.log();
            return; // Success - recovered from temp
          }

          // In batch mode, auto-use existing temp output
          if (options._batchMode) {
            console.log('\x1b[33m⚠  Found temp output, use --use-existing to recover\x1b[0m');
            throw new Error('SKIPPED');
          }

          console.log('This appears to be output for your PDF. Options:');
          console.log();
          console.log('1. Use existing output (recommended):');
          console.log(`   \x1b[36mflashcards process ${pdfPathInput} --use-existing\x1b[0m`);
          console.log();
          console.log('2. Or copy manually:');
          console.log(`   mkdir -p ${join(deckPath, 'sources', outputName, 'images')}`);
          console.log(`   cp ${join(found.dir, found.file)} ${join(deckPath, 'sources', outputName, 'content.json')}`);
          if (existsSync(imagesDir)) {
            console.log(`   cp ${imagesDir}/* ${join(deckPath, 'sources', outputName, 'images/')}`);
          }
          console.log();
          console.log('3. To reprocess from scratch:');
          console.log(`   \x1b[36mflashcards process ${pdfPathInput} --force\x1b[0m`);
          console.log();

          if (!options.force) {
            process.exit(0);
          }
          console.log('\x1b[33m--force specified, reprocessing...\x1b[0m');
          console.log();
        }
      }
    }

    // Step 5: Create temp directory for processing output
    tempDir = join(tmpdir(), `mineru-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    if (options.verbose) {
      console.log(`[DEBUG] Temp dir: ${tempDir}`);
    }

    // Step 6: Run PDF processor
    console.log(`⏳ Running PDF processor (${processorCmd})... this may take a few minutes`);
    console.log();

    // Build processor arguments with configurable options
    // Defaults: -b vlm-mlx-engine -m ocr -l en
    const processorArgs = processorCmd === 'mineru'
      ? ['-p', pdfPath, '-o', tempDir, '-b', options.backend, '-m', options.method, '-l', options.lang]
      : ['-p', pdfPath, '-o', tempDir];  // magic-pdf has different arg format

    if (options.verbose) {
      console.log(`[DEBUG] Command: ${processorCmd} ${processorArgs.join(' ')}`);
    }

    await new Promise((resolve, reject) => {
      const proc = spawn(processorCmd, processorArgs, {
        stdio: options.verbose ? 'inherit' : 'pipe'
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`PDF processor failed with exit code ${code}`));
        } else {
          resolve();
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run PDF processor: ${err.message}`));
      });
    });

    console.log('\x1b[32m✓ PDF processing complete\x1b[0m');
    console.log();
    processingCompleted = true;  // Mark that processing finished - preserve temp on subsequent errors

    // Step 7: Find the processor output directory
    // Processor creates different structures based on version/backend:
    // - Newer: <temp>/<pdf-name>/<method>/ (e.g., .../chapter1/vlm/)
    // - Older: <temp>/<method>/<pdf-name>/ (e.g., .../ocr/chapter1/)
    const tempContents = readdirSync(tempDir);
    let processorOutputDir = tempDir;

    // Helper to find content_list.json in a directory
    const hasContentList = (dir) => {
      try {
        return readdirSync(dir).some(f => f.endsWith('_content_list.json'));
      } catch {
        return false;
      }
    };

    // Strategy 1: Check <temp>/<pdf-name>/<method>/ structure (newer versions with VLM)
    // e.g., /tmp/mineru-xxx/1_units_physical_quantities_vectors/vlm/
    for (const pdfSubdir of tempContents) {
      const pdfSubdirPath = join(tempDir, pdfSubdir);
      if (statSync(pdfSubdirPath).isDirectory()) {
        // Check for method subdirectories (vlm, ocr, auto, txt)
        for (const method of ['vlm', 'ocr', 'auto', 'txt']) {
          const methodPath = join(pdfSubdirPath, method);
          if (existsSync(methodPath) && statSync(methodPath).isDirectory() && hasContentList(methodPath)) {
            processorOutputDir = methodPath;
            break;
          }
        }
        if (processorOutputDir !== tempDir) break;

        // Also check if content is directly in the pdf subdirectory
        if (hasContentList(pdfSubdirPath)) {
          processorOutputDir = pdfSubdirPath;
          break;
        }
      }
    }

    // Strategy 2: Check <temp>/<method>/<pdf-name>/ structure (older versions)
    if (processorOutputDir === tempDir) {
      for (const method of ['vlm', 'ocr', 'auto', 'txt']) {
        const methodPath = join(tempDir, method);
        if (existsSync(methodPath) && statSync(methodPath).isDirectory()) {
          const methodContents = readdirSync(methodPath);
          const pdfSubdir = methodContents.find(d => {
            const p = join(methodPath, d);
            return statSync(p).isDirectory() && hasContentList(p);
          });
          if (pdfSubdir) {
            processorOutputDir = join(methodPath, pdfSubdir);
            break;
          }
        }
      }
    }

    // Strategy 3: Check if content is directly in temp (fallback)
    if (processorOutputDir === tempDir && hasContentList(tempDir)) {
      // Content is directly in temp dir
    } else if (processorOutputDir === tempDir) {
      // Last resort: find any subdirectory with content_list.json
      const pdfSubdir = tempContents.find(d => {
        const p = join(tempDir, d);
        return statSync(p).isDirectory() && hasContentList(p);
      });
      if (pdfSubdir) {
        processorOutputDir = join(tempDir, pdfSubdir);
      }
    }

    if (options.verbose) {
      console.log(`[DEBUG] Processor output dir: ${processorOutputDir}`);
    }

    // Step 8: Find content_list.json
    const outputFiles = readdirSync(processorOutputDir);
    const contentListFile = outputFiles.find(f => f.endsWith('_content_list.json'));

    if (!contentListFile) {
      console.log('\x1b[31m❌ Could not find content output\x1b[0m');
      console.log(`   Expected *_content_list.json in: ${processorOutputDir}`);
      console.log(`   Found: ${outputFiles.join(', ') || '(empty)'}`);
      console.log();
      console.log('\x1b[33m⚠  Processing output preserved at:\x1b[0m');
      console.log(`   ${tempDir}`);
      console.log();
      console.log('To manually recover, find the content_list.json and run:');
      console.log(`   mkdir -p ${join(deckPath, 'sources', outputName, 'images')}`);
      console.log(`   cp <path-to-content_list.json> ${join(deckPath, 'sources', outputName, 'content.json')}`);
      console.log(`   cp <path-to-images>/* ${join(deckPath, 'sources', outputName, 'images/')}`);
      console.log();
      console.log('Then generate flashcards:');
      console.log(`   \x1b[36mflashcards generate sources/${outputName} --output ${outputName}\x1b[0m`);
      process.exit(1);
    }

    // Step 9: Create sources directory and copy files
    const sourcesDir = join(deckPath, 'sources', outputName);
    const imagesDestDir = join(sourcesDir, 'images');

    console.log('📁 Creating sources directory...');

    if (existsSync(sourcesDir)) {
      console.log(`\x1b[33m⚠  Overwriting existing: sources/${outputName}/\x1b[0m`);
    }

    mkdirSync(imagesDestDir, { recursive: true });

    // Copy content_list.json → content.json
    const srcContentList = join(processorOutputDir, contentListFile);
    const destContentJson = join(sourcesDir, 'content.json');
    copyFileSync(srcContentList, destContentJson);
    console.log(`✓ Copied content.json`);

    // Copy images directory
    const srcImagesDir = join(processorOutputDir, 'images');
    if (existsSync(srcImagesDir)) {
      const imageFiles = readdirSync(srcImagesDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
      for (const imgFile of imageFiles) {
        copyFileSync(join(srcImagesDir, imgFile), join(imagesDestDir, imgFile));
      }
      console.log(`✓ Copied ${imageFiles.length} images`);
    } else {
      console.log('   (no images found)');
    }

    // Step 10: Clean up temp directory
    if (!options.keepTemp) {
      rmSync(tempDir, { recursive: true, force: true });
      if (options.verbose) {
        console.log(`[DEBUG] Cleaned up temp dir`);
      }
    } else {
      console.log(`   Temp files kept at: ${tempDir}`);
    }

    console.log();
    console.log('\x1b[32m━'.repeat(50) + '\x1b[0m');
    console.log(`\x1b[32m✓ PDF processed successfully!\x1b[0m`);
    console.log('\x1b[32m━'.repeat(50) + '\x1b[0m');
    console.log();
    console.log(`📁 Source created: sources/${outputName}/`);
    console.log();
    console.log('📝 Next step - generate flashcards:');
    console.log(`   \x1b[36mflashcards generate sources/${outputName} --output ${outputName}\x1b[0m`);
    console.log();

  } catch (error) {
    console.log(`\x1b[31m❌ Error: ${error.message}\x1b[0m`);
    if (options.verbose) {
      console.error(error);
    }

    // If processing completed but we failed afterward, preserve the output
    if (processingCompleted && tempDir) {
      console.log();
      console.log('\x1b[33m⚠  Processing output preserved at:\x1b[0m');
      console.log(`   ${tempDir}`);
      console.log();
      if (deckPath && outputName) {
        console.log('To manually recover, find the content_list.json and run:');
        console.log(`   mkdir -p ${join(deckPath, 'sources', outputName, 'images')}`);
        console.log(`   cp <path-to-content_list.json> ${join(deckPath, 'sources', outputName, 'content.json')}`);
        console.log(`   cp <path-to-images>/* ${join(deckPath, 'sources', outputName, 'images/')}`);
        console.log();
        console.log('Then generate flashcards:');
        console.log(`   \x1b[36mflashcards generate sources/${outputName} --output ${outputName}\x1b[0m`);
      }
    }

    process.exit(1);
  }
}

// ==================== Generate Command ====================

program
  .command('generate <source-dir>')
  .description('Generate flashcards from processed source content')
  .option('--output <name>', 'Output filename (default: derived from source input)')
  .option('--model <model>', 'Claude model to use', 'claude-sonnet-4-5-20250514')
  .option('--api-key <key>', 'Override stored API key')
  .option('--prereqs <refs...>', 'Prerequisite flashcard files (space-separated). Local: "chapter_1.md", Remote: "github:owner/repo/branch/path.md" or GitHub URL')
  .option('--order <number>', 'Order number for TOML frontmatter (e.g., 1 for Chapter 1)', parseInt)
  .option('--tags <tags...>', 'Tags for TOML frontmatter (space-separated, e.g., vectors kinematics)')
  .option('--template <subjects...>', 'Subject-specific guide templates (space-separated, e.g., physics chemistry)')
  .option('--verbose', 'Show detailed progress and prompt')
  .action(async (sourceDir, options) => {
    await generateFlashcards(sourceDir, options);
  });

async function generateFlashcards(sourceDirInput, options) {
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

    // Step 2: Output directory is ./flashcards/ in current working directory
    const outputDir = join(process.cwd(), 'flashcards');

    // Create flashcards directory if it doesn't exist
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
      console.log(`✓ Created flashcards/ directory`);
    }

    // Step 3: Validate source directory
    const sourceDir = resolve(sourceDirInput);
    if (!existsSync(sourceDir)) {
      console.log(`\x1b[31m❌ Source directory not found: ${sourceDirInput}\x1b[0m`);
      console.log();
      console.log('Process your PDF first:');
      console.log('  flashcards process your-file.pdf --output chapter1');
      console.log();
      process.exit(1);
    }

    // Check for content.json (new format) or *_content_list.json (legacy format)
    const sourceFiles = readdirSync(sourceDir);
    let contentListFile = sourceFiles.find(f => f === 'content.json');
    if (!contentListFile) {
      contentListFile = sourceFiles.find(f => f.endsWith('_content_list.json'));
    }
    if (!contentListFile) {
      console.log(`\x1b[31m❌ No content.json or *_content_list.json found in: ${sourceDir}\x1b[0m`);
      console.log();
      console.log('This directory does not appear to be a valid source.');
      console.log('Expected files: content.json (or *_content_list.json), images/');
      console.log();
      process.exit(1);
    }

    // Check for images directory
    const imagesDir = join(sourceDir, 'images');
    const hasImages = existsSync(imagesDir);
    let imageCount = 0;
    if (hasImages) {
      imageCount = readdirSync(imagesDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f)).length;
    }

    console.log(`📂 Source: ${sourceDir}`);
    console.log(`   Content: ${contentListFile}`);
    console.log(`   Images: ${imageCount} found`);
    console.log();

    // Step 5: Load guides from GitHub (with optional subject-specific template)
    console.log('📚 Fetching flashcard writing guides from GitHub...');
    const guides = await claudeClient.loadGuides(options.template);

    if (guides.warning) {
      console.log(`\x1b[33m⚠  ${guides.warning}\x1b[0m`);
    }

    if (guides.files.length > 0) {
      console.log(`✓ Loaded guides: ${guides.files.join(', ')}`);
    }

    if (options.template && options.template.length > 0) {
      const foundTemplates = [];
      const missingTemplates = [];
      for (const t of options.template) {
        if (guides.files.includes(`${t}.md`)) {
          foundTemplates.push(t);
        } else {
          missingTemplates.push(t);
        }
      }
      if (foundTemplates.length > 0) {
        console.log(`✓ Using templates: ${foundTemplates.join(', ')}`);
      }
      if (missingTemplates.length > 0) {
        console.log(`\x1b[33m⚠  Templates not found: ${missingTemplates.join(', ')}\x1b[0m`);
      }
    }
    console.log();

    // Step 5.5: Collect prerequisite references (if specified)
    const prerequisiteFilenames = [];

    if (options.prereqs && options.prereqs.length > 0) {
      console.log('📋 Prerequisites specified:');

      for (const prereqRef of options.prereqs) {
        prerequisiteFilenames.push(prereqRef);
        // Determine type for display
        const isRemote = prereqRef.startsWith('github:') ||
                        prereqRef.includes('github.com') ||
                        prereqRef.includes('raw.githubusercontent.com');
        const typeLabel = isRemote ? '🌐 remote' : '📁 local';
        console.log(`   ${typeLabel}: ${prereqRef}`);
      }

      console.log(`\n   Prerequisites will be loaded and injected into Claude's context.`);
      console.log(`   Chained dependencies will be resolved automatically.`);
      console.log();
    }

    // Step 6: Determine output name
    // If content.json (new format), use folder name; otherwise strip _content_list.json suffix
    let baseName;
    if (contentListFile === 'content.json') {
      // Use the folder name (e.g., sources/1_units_physical_quantities_vectors → 1_units_physical_quantities_vectors)
      baseName = basename(sourceDir);
    } else {
      baseName = contentListFile.replace('_content_list.json', '');
    }
    const outputName = options.output || baseName;

    console.log(`🤖 Model: ${options.model}`);
    console.log(`📝 Output: flashcards/${outputName}.md`);
    console.log();

    // Step 7: Call Claude API or Claude Code CLI
    const useClaudeCode = apiKey === 'USE_CLAUDE_CODE_CLI';

    if (useClaudeCode) {
      console.log('✨ Using Claude Code (your Max/Pro subscription)');
    }
    console.log(`⏳ Generating flashcards... (this may take 1-3 minutes)`);
    console.log();

    // Determine deck path (the directory containing flashcards/, sources/, etc.)
    const deckPath = process.cwd();

    const result = await claudeClient.callClaudeWithSource(sourceDir, guides.content, {
      apiKey: useClaudeCode ? null : apiKey,
      model: options.model,
      verbose: options.verbose,
      useClaudeCode,
      prerequisiteFilenames,
      order: options.order,
      tags: options.tags,
      outputName,
      deckPath
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

    // Step 9: Determine source path (for new sources/ structure)
    const finalOutputName = result.outputName || outputName;

    // Compute relative source path for frontmatter
    // Check if sourceDir is within current directory (sources/ structure) or external
    const cwd = process.cwd();
    const relSourceDir = sourceDir.startsWith(cwd)
      ? sourceDir.replace(cwd + '/', '')
      : sourceDirInput;

    // Determine source content path
    let sourceContentPath;
    if (existsSync(join(sourceDir, 'content.json'))) {
      sourceContentPath = join(relSourceDir, 'content.json');
    } else {
      sourceContentPath = join(relSourceDir, contentListFile);
    }

    // Determine images and figures directory paths
    const imagesPath = existsSync(join(sourceDir, 'images'))
      ? join(relSourceDir, 'images')
      : '';
    const figuresPath = existsSync(join(sourceDir, 'figures'))
      ? join(relSourceDir, 'figures')
      : '';

    if (result.usedImages && result.usedImages.length > 0) {
      console.log(`🖼️  ${result.usedImages.length} image(s) referenced from ${relSourceDir}/images/`);
      console.log();
    }

    // Step 10: Add TOML frontmatter with generation metadata and save flashcards
    const outputFilename = `${finalOutputName}.md`;
    const finalOutputPath = join(outputDir, outputFilename);

    // Build simplified generation metadata for reproducibility
    const generationMetadata = {
      source: sourceContentPath,
      imagesDir: imagesPath,
      figuresDir: figuresPath,  // Prefer figures/ over images/ when available
      generatedAt: new Date().toISOString(),
      flashcardsCommit: claudeClient.getFlashcardsRepoCommit(),
      model: useClaudeCode ? 'claude-code-cli' : options.model,
      guides: guides.files
    };

    // Add TOML frontmatter with order, tags, prereqs, and generation metadata
    const finalContent = claudeClient.prependFrontmatter(result.flashcards, {
      order: options.order,
      tags: options.tags || [],
      prereqs: prerequisiteFilenames,
      generation: generationMetadata
    });

    console.log('💾 Preparing to save flashcards...');
    if (options.verbose) {
      console.log(`[DEBUG] CWD: ${process.cwd()}`);
      console.log(`[DEBUG] outputDir: ${outputDir}`);
      console.log(`[DEBUG] finalOutputPath: ${finalOutputPath}`);
      console.log(`[DEBUG] Content length: ${finalContent.length} chars`);
    }

    // Ensure output directory exists (already created earlier, but just in case)
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write file
    try {
      console.log(`💾 Writing ${finalContent.length} characters to: ${finalOutputPath}`);
      writeFileSync(finalOutputPath, finalContent, 'utf-8');
      console.log(`\x1b[32m✓ File saved successfully\x1b[0m`);
      console.log();
    } catch (error) {
      console.error(`\x1b[31m❌ Failed to write flashcards file:\x1b[0m`);
      console.error(`   Path: ${finalOutputPath}`);
      console.error(`   Error: ${error.message}`);
      process.exit(1);
    }

    // Step 11: Show summary
    const chunkSuffix = result.chunkCount ? ` (${result.chunkCount} chunks)` : '';
    console.log(`\x1b[32m✓ Generated ${validationResult.cardCount} flashcards → flashcards/${outputFilename}${chunkSuffix}\x1b[0m`);

    if (result.usedImages && result.usedImages.length > 0) {
      console.log(`\x1b[32m✓ Referenced ${result.usedImages.length} figures from ${relSourceDir}/images/\x1b[0m`);
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
      console.log('💡 Try processing a smaller document');
    }
    console.log();
    process.exit(1);
  }
}

program.parse();

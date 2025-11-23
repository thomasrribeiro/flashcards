#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FLASHCARDS_ROOT = resolve(__dirname, '..');

const program = new Command();

program
  .name('flashcards')
  .description('CLI tool for managing flashcard deck repositories')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new flashcard deck repository')
  .argument('<name>', 'Name of the deck (e.g., intro-mechanics)')
  .option('--path <path>', 'Custom path for the deck (default: public/collection/<name>)')
  .option('--template <template>', 'Copy subject-specific template (e.g., physics, chemistry)')
  .action((name, options) => {
    createDeck(name, options);
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

    console.log('\x1b[32m✓\x1b[0m Created directory structure:');
    console.log('  - flashcards/   (markdown flashcard files)');
    console.log('  - references/   (source PDFs and textbooks, gitignored)');
    console.log('  - figures/      (extracted images and diagrams)');
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

  // Copy and substitute CLAUDE.md template
  try {
    const claudeTemplatePath = join(FLASHCARDS_ROOT, 'templates', 'CLAUDE.md');
    if (existsSync(claudeTemplatePath)) {
      const claudeTemplate = readFileSync(claudeTemplatePath, 'utf-8');
      const claude = claudeTemplate
        .replace(/{SUBJECT_NAME}/g, subjectName)
        .replace(/{DATE}/g, currentDate);
      writeFileSync(join(basePath, 'CLAUDE.md'), claude);
      console.log('\x1b[32m✓\x1b[0m Created CLAUDE.md from template');
    } else {
      console.log('\x1b[33m⚠\x1b[0m Template not found: templates/CLAUDE.md');
    }
  } catch (error) {
    console.error(`\x1b[31mError creating CLAUDE.md: ${error.message}\x1b[0m`);
  }

  // Copy subject-specific template if --template flag is provided
  if (options.template) {
    try {
      const templatePath = join(FLASHCARDS_ROOT, 'templates', `${options.template}.md`);
      if (existsSync(templatePath)) {
        const templateContent = readFileSync(templatePath, 'utf-8');
        writeFileSync(join(basePath, `${options.template}.md`), templateContent);
        console.log(`\x1b[32m✓\x1b[0m Copied subject-specific template: ${options.template}.md`);
      } else {
        console.log(`\x1b[33m⚠\x1b[0m Subject template not found: templates/${options.template}.md (skipping)`);
      }
    } catch (error) {
      console.error(`\x1b[31mError copying template: ${error.message}\x1b[0m`);
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
A: See CLAUDE.md in this repository for ${subjectName}-specific guidelines.

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
  console.log(`  5. Read CLAUDE.md for ${subjectName}-specific guidelines`);
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

program.parse();

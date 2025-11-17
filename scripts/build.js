#!/usr/bin/env node

/**
 * Build script to process git submodules and generate card data
 * Scans topics/ directory for markdown files and creates a card index
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const COLLECTION_DIR = path.join(ROOT_DIR, 'public', 'collection');
const OUTPUT_FILE = path.join(COLLECTION_DIR, 'index.json');

/**
 * Recursively find all .md files in a directory
 */
function findMarkdownFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            findMarkdownFiles(filePath, fileList);
        } else if (file.endsWith('.md')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

/**
 * Scan collection directory for repos and their markdown files
 */
function scanCollection() {
    const repos = [];

    // Read all directories in collection/
    const entries = fs.readdirSync(COLLECTION_DIR, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const repoName = entry.name;
        const repoPath = path.join(COLLECTION_DIR, repoName);

        // Find all markdown files in this repo
        const markdownFiles = findMarkdownFiles(repoPath);

        // Convert to relative paths from repo root
        const relativeFiles = markdownFiles.map(file => {
            const rel = path.relative(repoPath, file);
            // Normalize path separators to forward slashes for web
            return rel.replace(/\\/g, '/');
        });

        if (relativeFiles.length > 0) {
            repos.push({
                name: repoName,
                files: relativeFiles
            });
        }
    }

    return repos;
}

/**
 * Main build function
 */
function build() {
    console.log('Building collection index...');

    // Create collection directory if it doesn't exist
    if (!fs.existsSync(COLLECTION_DIR)) {
        fs.mkdirSync(COLLECTION_DIR, { recursive: true });
        console.log('Created public/collection/ directory');
        console.log('Add repo directories to public/collection/ for your flashcard collections');
        return;
    }

    // Scan collection for repos
    const repos = scanCollection();

    if (repos.length === 0) {
        console.log('No repos found in public/collection/');
        console.log('Add directories with .md files to get started:');
        console.log('  mkdir -p public/collection/my-repo/flashcards');
        console.log('  # or add git submodules');

        // Write empty index
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ repos: [] }, null, 2));
        return;
    }

    // Write collection index
    const totalFiles = repos.reduce((sum, repo) => sum + repo.files.length, 0);

    const output = {
        generatedAt: new Date().toISOString(),
        repoCount: repos.length,
        fileCount: totalFiles,
        repos: repos
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`Written collection index to ${OUTPUT_FILE}`);

    // Print summary
    console.log(`\nCollection Summary:`);
    console.log(`  Total repos: ${repos.length}`);
    console.log(`  Total files: ${totalFiles}`);
    repos.forEach(repo => {
        console.log(`  - ${repo.name}: ${repo.files.length} files`);
    });
}

// Run build
try {
    build();
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}

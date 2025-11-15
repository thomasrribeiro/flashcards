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
const TOPICS_DIR = path.join(ROOT_DIR, 'topics');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'cards.json');

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
 * Extract relative path from topics directory
 */
function getRelativePath(filePath) {
    return path.relative(TOPICS_DIR, filePath);
}

/**
 * Main build function
 */
function build() {
    console.log('Building flashcard index...');

    // Create topics directory if it doesn't exist
    if (!fs.existsSync(TOPICS_DIR)) {
        fs.mkdirSync(TOPICS_DIR, { recursive: true });
        console.log('Created topics/ directory');
        console.log('Add git submodules to topics/ for your flashcard collections');
        return;
    }

    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Find all markdown files
    const markdownFiles = findMarkdownFiles(TOPICS_DIR);

    if (markdownFiles.length === 0) {
        console.log('No markdown files found in topics/');
        console.log('Add git submodules with .md files to get started:');
        console.log('  git submodule add <repo-url> topics/<topic-name>');

        // Write empty index
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ files: [] }, null, 2));
        return;
    }

    // Create file index
    const fileIndex = markdownFiles.map(filePath => ({
        path: getRelativePath(filePath),
        name: path.basename(filePath, '.md'),
        fullPath: filePath
    }));

    console.log(`Found ${fileIndex.length} markdown files`);

    // Write index
    const output = {
        generatedAt: new Date().toISOString(),
        fileCount: fileIndex.length,
        files: fileIndex
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`Written card index to ${OUTPUT_FILE}`);

    // Print summary by topic
    const topicMap = new Map();
    fileIndex.forEach(file => {
        const topic = file.path.split(path.sep)[0];
        if (!topicMap.has(topic)) {
            topicMap.set(topic, 0);
        }
        topicMap.set(topic, topicMap.get(topic) + 1);
    });

    console.log('\nTopics summary:');
    topicMap.forEach((count, topic) => {
        console.log(`  ${topic}: ${count} file(s)`);
    });
}

// Run build
try {
    build();
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}

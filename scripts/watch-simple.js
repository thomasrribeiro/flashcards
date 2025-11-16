#!/usr/bin/env node

/**
 * Simple watch script for auto-rebuilding card index
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const TOPICS_DIR = path.join(ROOT_DIR, 'topics');

console.log('🔍 Watching for changes in:', TOPICS_DIR);

// Track file modification times
const fileTimestamps = new Map();

function getFileTimestamp(filepath) {
    try {
        return fs.statSync(filepath).mtimeMs;
    } catch {
        return null;
    }
}

function scanFiles(dir) {
    const changes = [];

    function scanDir(currentDir) {
        const files = fs.readdirSync(currentDir);

        files.forEach(file => {
            const filepath = path.join(currentDir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory() && !file.startsWith('.')) {
                scanDir(filepath);
            } else if (file.endsWith('.md')) {
                const currentTime = stat.mtimeMs;
                const lastTime = fileTimestamps.get(filepath);

                if (!lastTime || currentTime > lastTime) {
                    changes.push(path.relative(TOPICS_DIR, filepath));
                    fileTimestamps.set(filepath, currentTime);
                }
            }
        });
    }

    scanDir(dir);
    return changes;
}

function rebuild() {
    console.log('🔄 Rebuilding card index...');

    exec('node scripts/build.js', { cwd: ROOT_DIR }, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Build failed:', error);
            return;
        }

        // Extract file count from output
        const match = stdout.match(/Found (\d+) markdown files/);
        const count = match ? match[1] : '?';

        console.log(`✅ Build complete! Processed ${count} file(s)`);
        console.log('💡 Refresh your browser to see changes');
    });
}

// Initial scan
scanFiles(TOPICS_DIR);
console.log(`📊 Tracking ${fileTimestamps.size} markdown files`);

// Initial build
rebuild();

// Poll for changes every second
setInterval(() => {
    const changes = scanFiles(TOPICS_DIR);

    if (changes.length > 0) {
        console.log('📝 Changes detected:', changes.join(', '));
        rebuild();
    }
}, 1000);

console.log('✨ Watching for changes... (Press Ctrl+C to stop)');
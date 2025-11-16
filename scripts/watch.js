#!/usr/bin/env node

/**
 * Watch script for auto-rebuilding card index when markdown files change
 */

import chokidar from 'chokidar';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const TOPICS_DIR = path.join(ROOT_DIR, 'topics');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = '') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

function runBuild() {
    return new Promise((resolve, reject) => {
        log('🔄 Rebuilding card index...', colors.yellow);

        const build = spawn('node', [path.join(__dirname, 'build.js')], {
            cwd: ROOT_DIR,
            stdio: 'pipe'
        });

        let output = '';

        build.stdout.on('data', (data) => {
            output += data.toString();
        });

        build.stderr.on('data', (data) => {
            console.error(data.toString());
        });

        build.on('close', (code) => {
            if (code === 0) {
                // Parse output for file count
                const fileMatch = output.match(/Found (\d+) markdown files/);
                const fileCount = fileMatch ? fileMatch[1] : 'unknown';
                log(`✅ Build complete! Processed ${fileCount} file(s)`, colors.green);
                resolve();
            } else {
                log('❌ Build failed!', colors.red);
                reject(new Error(`Build process exited with code ${code}`));
            }
        });
    });
}

// Initial build
log('👀 Starting file watcher...', colors.cyan);
log(`📁 Watching: ${TOPICS_DIR}`, colors.dim);

// Run initial build
runBuild().catch(console.error);

// Set up watcher
const watcher = chokidar.watch('**/*.md', {
    cwd: TOPICS_DIR,
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
    }
});

// Debounce mechanism to avoid multiple rebuilds
let buildTimeout;
const DEBOUNCE_MS = 500;

function scheduleBuild() {
    clearTimeout(buildTimeout);
    buildTimeout = setTimeout(() => {
        runBuild().catch(console.error);
    }, DEBOUNCE_MS);
}

// Watch events
watcher
    .on('add', (filePath) => {
        log(`📝 Added: ${filePath}`, colors.blue);
        scheduleBuild();
    })
    .on('change', (filePath) => {
        log(`✏️  Modified: ${filePath}`, colors.blue);
        scheduleBuild();
    })
    .on('unlink', (filePath) => {
        log(`🗑️  Deleted: ${filePath}`, colors.blue);
        scheduleBuild();
    })
    .on('error', (error) => {
        console.error('Watcher error:', error);
    })
    .on('ready', () => {
        log('✨ Ready! Watching for changes...', colors.bright + colors.green);
        log('💡 Tip: Edit any .md file in topics/ to auto-rebuild', colors.dim);
    });

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('\n👋 Stopping watcher...', colors.yellow);
    watcher.close().then(() => {
        process.exit(0);
    });
});
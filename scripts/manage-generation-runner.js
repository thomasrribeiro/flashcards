#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    GENERATION_RUNNER_LABEL,
    generationRunnerPaths,
    generationRunnerPlist
} from '../bin/lib/generation-runner-service.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const cliPath = path.join(repositoryRoot, 'bin', 'flashcards.js');
const domain = `gui/${process.getuid()}`;
const service = `${domain}/${GENERATION_RUNNER_LABEL}`;

function parseArguments(values) {
    const [command = 'status', ...rest] = values;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const argument = rest[index];
        if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
        const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const value = rest[index + 1];
        if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
        options[key] = value;
        index += 1;
    }
    return { command, options };
}

function launchctl(args, { allowFailure = false } = {}) {
    const result = spawnSync('launchctl', args, { encoding: 'utf8' });
    if (!allowFailure && result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `launchctl ${args[0]} failed`).trim());
    }
    return result;
}

function assertRunnerCredential() {
    const result = spawnSync('security', [
        'find-generic-password',
        '-a', process.env.USER || '',
        '-s', 'flashcards-generation-runner',
        '-w'
    ], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.trim()) {
        throw new Error('Missing flashcards-generation-runner token in the macOS Keychain.');
    }
}

async function install(options) {
    const home = os.homedir();
    const paths = generationRunnerPaths(home);
    const workerUrl = options.workerUrl || process.env.FLASHCARDS_WORKER_URL;
    if (!workerUrl) throw new Error('--worker-url is required for installation.');
    assertRunnerCredential();

    const notesRoot = path.resolve(options.notesRoot || path.join(home, 'notes'));
    const registryRoot = path.resolve(options.registryRoot || path.resolve(repositoryRoot, '..', 'curricula'));
    for (const [label, target] of [['notes root', notesRoot], ['registry root', registryRoot]]) {
        if (!existsSync(target)) throw new Error(`Runner ${label} does not exist: ${target}`);
    }
    await mkdir(path.dirname(paths.plistPath), { recursive: true });
    await mkdir(paths.stateDirectory, { recursive: true });
    const plist = generationRunnerPlist({
        nodePath: process.execPath,
        cliPath,
        workingDirectory: repositoryRoot,
        workerUrl: workerUrl.replace(/\/$/, ''),
        notesRoot,
        registryRoot,
        intervalSeconds: Number(options.interval || 60),
        executablePath: [
            path.dirname(process.execPath),
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin',
            '/usr/sbin',
            '/sbin'
        ].filter((value, index, all) => all.indexOf(value) === index).join(':'),
        stdoutPath: paths.stdoutPath,
        stderrPath: paths.stderrPath
    });

    launchctl(['bootout', service], { allowFailure: true });
    await writeFile(paths.plistPath, plist, { encoding: 'utf8', mode: 0o600 });
    launchctl(['bootstrap', domain, paths.plistPath]);
    launchctl(['enable', service]);
    launchctl(['kickstart', '-k', service]);
    console.log(`Installed production generation runner: ${GENERATION_RUNNER_LABEL}`);
    console.log(`Queue: ${workerUrl.replace(/\/$/, '')}`);
    console.log(`Logs: ${paths.stdoutPath} and ${paths.stderrPath}`);
}

async function uninstall() {
    const paths = generationRunnerPaths();
    launchctl(['bootout', service], { allowFailure: true });
    if (existsSync(paths.plistPath)) await unlink(paths.plistPath);
    console.log(`Uninstalled generation runner: ${GENERATION_RUNNER_LABEL}`);
    console.log(`Logs remain in ${paths.stateDirectory}`);
}

async function status() {
    const paths = generationRunnerPaths();
    const result = launchctl(['print', service], { allowFailure: true });
    if (result.status !== 0) {
        console.log(`Generation runner is not loaded (${GENERATION_RUNNER_LABEL}).`);
        if (existsSync(paths.plistPath)) console.log(`Configuration exists at ${paths.plistPath}.`);
        process.exitCode = 1;
        return;
    }
    const configuration = existsSync(paths.plistPath) ? await readFile(paths.plistPath, 'utf8') : '';
    const worker = /<string>(https?:\/\/[^<]+)<\/string>/.exec(configuration)?.[1] || 'unknown';
    console.log(`Generation runner is loaded: ${GENERATION_RUNNER_LABEL}`);
    console.log(`Queue: ${worker}`);
    console.log(`Logs: ${paths.stdoutPath} and ${paths.stderrPath}`);
    process.stdout.write(result.stdout);
}

async function main() {
    const { command, options } = parseArguments(process.argv.slice(2));
    if (command === 'install') return install(options);
    if (command === 'uninstall') return uninstall();
    if (command === 'status') return status();
    throw new Error(`Unknown command: ${command}. Use install, status, or uninstall.`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});

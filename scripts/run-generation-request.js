#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workflowRoot = path.resolve(scriptDirectory, '..');

function parseArguments(values) {
    const options = {};
    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];
        if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
        const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const value = values[index + 1];
        if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
        options[key] = value;
        index += 1;
    }
    return options;
}

function command(executable, args, { cwd = workflowRoot, allowFailure = false } = {}) {
    const result = spawnSync(executable, args, {
        cwd,
        encoding: 'utf8',
        stdio: allowFailure ? 'pipe' : 'inherit'
    });
    if (result.error) throw result.error;
    if (!allowFailure && result.status !== 0) {
        throw new Error(`${executable} exited with status ${result.status}.`);
    }
    return result;
}

function captured(executable, args, cwd = workflowRoot) {
    const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `${executable} failed`).trim());
    }
    return result.stdout.trim();
}

function latestSuccessfulDeployment(repository) {
    const deployments = JSON.parse(captured('gh', [
        'api', `repos/${repository}/deployments?environment=github-pages&per_page=10`
    ]) || '[]');
    for (const deployment of deployments) {
        const statuses = JSON.parse(captured('gh', [
            'api', `repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`
        ]) || '[]');
        if (statuses[0]?.state === 'success' && /^[a-f0-9]{40}$/i.test(deployment.sha || '')) {
            return deployment.sha;
        }
    }
    throw new Error(`No successful GitHub Pages deployment was found for ${repository}.`);
}

function prepareWorkflowCheckout(repository) {
    const trackedChanges = captured('git', [
        'status', '--porcelain', '--untracked-files=no'
    ]);
    if (trackedChanges) {
        throw new Error('Production workflow checkout has unexpected tracked changes.');
    }

    const deployedCommit = latestSuccessfulDeployment(repository);
    const currentCommit = captured('git', ['rev-parse', 'HEAD']);
    if (currentCommit === deployedCommit) return;

    const previousLock = captured('git', ['rev-parse', 'HEAD:package-lock.json']);
    captured('git', ['fetch', 'origin', deployedCommit]);
    captured('git', ['switch', '--detach', deployedCommit]);
    const currentLock = captured('git', ['rev-parse', 'HEAD:package-lock.json']);
    if (previousLock !== currentLock || !existsSync(path.join(workflowRoot, 'node_modules', 'commander'))) {
        command('npm', ['ci', '--omit=dev']);
    }
}

function runRequest(options) {
    const required = ['workerUrl', 'notesRoot', 'registryRoot', 'deploymentRepository'];
    for (const name of required) {
        if (!String(options[name] || '').trim()) throw new Error(`--${name} is required.`);
    }
    prepareWorkflowCheckout(options.deploymentRepository);
    const cliPath = path.join(workflowRoot, 'bin', 'flashcards.js');
    command(process.execPath, [
        cliPath,
        'requests',
        'run',
        '--worker-url', options.workerUrl,
        '--notes-root', options.notesRoot,
        '--registry-root', options.registryRoot
    ]);
}

try {
    runRequest(parseArguments(process.argv.slice(2)));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

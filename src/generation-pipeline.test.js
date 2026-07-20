import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { providerRunner, runExternalProviderJob } from '../bin/lib/agent-provider.js';
import {
    abandonRegistryDraft,
    assertCleanRegistryWorktree,
    beginRegistryDraft
} from '../bin/lib/github-publisher.js';

const roots = [];
const temporaryRoot = async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'flashcards-generation-'));
    roots.push(root);
    return root;
};
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe('local generation pipeline', () => {
    it('runs a generic provider with a temporary secret-free manifest', async () => {
        const root = await temporaryRoot();
        const runner = path.join(root, 'runner.sh');
        await writeFile(runner, '#!/bin/sh\ncp "$1" received.json\n');
        await chmod(runner, 0o755);
        expect(providerRunner('codex')).toBeNull();
        expect(() => providerRunner('custom')).toThrow(/FLASHCARDS_AGENT_RUNNER/);
        const result = runExternalProviderJob({ job_type: 'subject-design', payload: { subject: 'biology' } }, {
            workspacePath: root,
            command: runner
        });
        expect(result.status).toBe(0);
        const received = JSON.parse(await readFile(path.join(root, 'received.json'), 'utf8'));
        expect(received.payload.subject).toBe('biology');
        await expect(readFile(path.join(root, '.flashcards-generation-job.json'))).rejects.toThrow();
    });

    it('creates an isolated draft branch and refuses a dirty registry', async () => {
        const root = await temporaryRoot();
        spawnSync('git', ['init', '-b', 'master'], { cwd: root });
        await writeFile(path.join(root, 'README.md'), 'registry\n');
        spawnSync('git', ['add', '.'], { cwd: root });
        spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial'], { cwd: root });
        const draft = beginRegistryDraft(root, 42);
        expect(draft).toEqual({ base: 'master', branch: 'flashcards/request-42' });
        abandonRegistryDraft(root, draft);
        await writeFile(path.join(root, 'README.md'), 'dirty\n');
        expect(() => assertCleanRegistryWorktree(root)).toThrow(/uncommitted changes/);
    });
});

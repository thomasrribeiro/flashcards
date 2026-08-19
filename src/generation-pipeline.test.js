import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { providerRunner, runExternalProviderJob } from '../bin/lib/agent-provider.js';
import { executionOptionsForGenerationJob } from '../bin/lib/generation-job.js';
import {
    abandonRegistryDraft,
    assertCleanRegistryWorktree,
    assertRepositoryCommit,
    beginRegistryDraft,
    registryCatalogHash
} from '../bin/lib/github-publisher.js';

const roots = [];
const temporaryRoot = async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'flashcards-generation-'));
    roots.push(root);
    return root;
};
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe('local generation pipeline', () => {
    it('maps the queued model and approved build scope into the standard CLI options', () => {
        const options = executionOptionsForGenerationJob({
            job_type: 'deck-build',
            model_id: 'gpt-example'
        }, {
            buildScope: 'full',
            reasoningEffort: 'xhigh'
        }, {
            model: 'local-default',
            isolated: true
        });
        expect(options).toMatchObject({
            model: 'gpt-example',
            reasoningEffort: 'xhigh',
            full: true,
            isolated: true
        });
    });

    it('keeps pilot jobs partial and resolves chapter expansion deterministically', () => {
        expect(executionOptionsForGenerationJob({ job_type: 'deck-build' }, {
            buildScope: 'pilot'
        }).full).toBe(false);
        expect(executionOptionsForGenerationJob({ job_type: 'chapter-expand' }, {
            chapterId: '03_kinematics_1d'
        }).chapter).toBe(3);
        expect(executionOptionsForGenerationJob({ job_type: 'chapter-expand' }, {
            chapterId: '01_measurement', buildScope: 'pilot'
        }).chapter).toBeUndefined();
        expect(() => executionOptionsForGenerationJob({ job_type: 'chapter-expand' }, {
            chapterId: '02_motion', buildScope: 'pilot'
        })).toThrow(/first ordered chapter/);
        expect(executionOptionsForGenerationJob({ job_type: 'deck-plan' }, {}))
            .toMatchObject({ chapterCurriculum: true, full: false });
    });

    it('runs a generic provider with a temporary secret-free manifest', async () => {
        const root = await temporaryRoot();
        const runner = path.join(root, 'runner.sh');
        await writeFile(runner, '#!/bin/sh\ncp "$1" received.json\n');
        await chmod(runner, 0o755);
        expect(providerRunner('codex')).toBeNull();
        expect(providerRunner('google')).toBeNull();
        expect(() => providerRunner('custom')).toThrow(/FLASHCARDS_AGENT_RUNNER/);
        const result = runExternalProviderJob({ job_type: 'subject-design', payload: { subject: 'biology' } }, {
            workspacePath: root,
            command: runner,
            agentEnv: { GEMINI_API_KEY: 'provider-secret-never-in-manifest' }
        });
        expect(result.status).toBe(0);
        const received = JSON.parse(await readFile(path.join(root, 'received.json'), 'utf8'));
        expect(received.payload.subject).toBe('biology');
        expect(JSON.stringify(received)).not.toContain('provider-secret-never-in-manifest');
        await expect(readFile(path.join(root, '.flashcards-generation-job.json'))).rejects.toThrow();
    });

    it('creates an isolated draft branch and refuses a dirty registry', async () => {
        const root = await temporaryRoot();
        spawnSync('git', ['init', '-b', 'master'], { cwd: root });
        await writeFile(path.join(root, 'README.md'), 'registry\n');
        spawnSync('git', ['add', '.'], { cwd: root });
        spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial'], { cwd: root });
        const baseCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
        expect(assertRepositoryCommit(root, baseCommit)).toBe(baseCommit);
        expect(() => assertRepositoryCommit(root, 'f'.repeat(40))).toThrow(/requires/);
        const draft = beginRegistryDraft(root, 42, { baseCommit });
        expect(draft).toEqual({
            base: 'master',
            prBase: 'master',
            baseCommit,
            branch: 'flashcards/request-42'
        });
        expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim())
            .toBe(baseCommit);
        abandonRegistryDraft(root, draft);
        await writeFile(path.join(root, 'README.md'), 'dirty\n');
        expect(() => assertCleanRegistryWorktree(root)).toThrow(/uncommitted changes/);
    });

    it('hashes the pinned registry catalog bytes', async () => {
        const root = await temporaryRoot();
        await mkdir(path.join(root, 'dist'));
        await writeFile(path.join(root, 'dist', 'curriculum.json'), 'catalog\n');
        expect(registryCatalogHash(root))
            .toBe('sha256:d2d094cc7007ecc4ebf7e234d7b36246b1ed64e9f6c18f7b3673378666476c11');
        expect(() => registryCatalogHash(root, '../outside.json')).toThrow(/inside/);
    });
});

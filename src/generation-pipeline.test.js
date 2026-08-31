import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { providerRunner, runExternalProviderJob } from '../bin/lib/agent-provider.js';
import { executionOptionsForGenerationJob } from '../bin/lib/generation-job.js';
import {
    beginDeckDraft,
    deckRepositoryCoordinates,
    publishDeckDraft
} from '../bin/lib/deck-github-publisher.js';
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
    it('accepts only canonical GitHub deck repository URLs', () => {
        expect(deckRepositoryCoordinates('https://github.com/example-decks/mechanics')).toEqual({
            owner: 'example-decks',
            repository: 'mechanics',
            url: 'https://github.com/example-decks/mechanics'
        });
        expect(() => deckRepositoryCoordinates('https://example.com/example-decks/mechanics'))
            .toThrow(/github.com/);
    });

    it('initializes a missing deck repository and publishes a review branch', async () => {
        const root = await temporaryRoot();
        const deckPath = path.join(root, 'deck');
        const binPath = path.join(root, 'bin');
        const remotePath = path.join(root, 'remote.git');
        await mkdir(deckPath, { recursive: true });
        await mkdir(binPath, { recursive: true });
        spawnSync('git', ['init', '-b', 'master'], { cwd: deckPath });
        await writeFile(path.join(deckPath, 'README.md'), 'planned deck\n');
        const ghPath = path.join(binPath, 'gh');
        await writeFile(ghPath, `#!/bin/sh
set -eu
if [ "$1 $2" = "repo view" ]; then
  [ -d "$FAKE_GH_REMOTE" ] || exit 1
  printf '%s\\n' '{"nameWithOwner":"example/deck","defaultBranchRef":{"name":"master"}}'
elif [ "$1 $2" = "repo create" ]; then
  git init --bare "$FAKE_GH_REMOTE" >/dev/null
  git -C "$6" remote add origin "$FAKE_GH_REMOTE"
  git -C "$6" push -u origin master >/dev/null
elif [ "$1 $2" = "pr create" ]; then
  printf '%s\\n' 'https://github.com/example/deck/pull/12'
else
  exit 2
fi
`);
        await chmod(ghPath, 0o755);
        const previousPath = process.env.PATH;
        const previousRemote = process.env.FAKE_GH_REMOTE;
        process.env.PATH = `${binPath}:${previousPath}`;
        process.env.FAKE_GH_REMOTE = remotePath;
        try {
            const draft = beginDeckDraft(
                deckPath,
                'https://github.com/example/deck',
                12,
                { visibility: 'public' }
            );
            expect(draft).toMatchObject({ base: 'master', branch: 'flashcards/request-12', createdRepository: true });
            await writeFile(path.join(deckPath, 'flashcards.md'), 'Q: Generated?\nA: Yes.\n');
            expect(publishDeckDraft(deckPath, draft, {
                title: 'Generate chapter', body: 'Test pull request'
            })).toBe('https://github.com/example/deck/pull/12');
            expect(spawnSync('git', ['branch', '--show-current'], { cwd: deckPath, encoding: 'utf8' }).stdout.trim())
                .toBe('master');
            expect(spawnSync('git', ['show-ref', '--verify', 'refs/remotes/origin/flashcards/request-12'], {
                cwd: deckPath, encoding: 'utf8'
            }).status).toBe(0);
        } finally {
            process.env.PATH = previousPath;
            if (previousRemote == null) delete process.env.FAKE_GH_REMOTE;
            else process.env.FAKE_GH_REMOTE = previousRemote;
        }
    });

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
        expect(executionOptionsForGenerationJob({ job_type: 'chapter-expand' }, {
            chapterId: '01_measurement', buildScope: 'pilot', generationMode: 'replace'
        })).toMatchObject({ freshPilot: true, freshChapter: false });
        expect(executionOptionsForGenerationJob({ job_type: 'chapter-expand' }, {
            chapterId: '03_kinematics_1d', buildScope: 'chapter', generationMode: 'replace'
        })).toMatchObject({ chapter: 3, freshChapter: true, freshPilot: false });
        expect(() => executionOptionsForGenerationJob({ job_type: 'chapter-expand' }, {
            chapterId: '02_motion', buildScope: 'pilot'
        })).toThrow(/first ordered chapter/);
        expect(executionOptionsForGenerationJob({ job_type: 'deck-plan' }, {}))
            .toMatchObject({ chapterCurriculum: true, full: false });
        expect(executionOptionsForGenerationJob({ job_type: 'deck-plan' }, {
            prerequisitePlanPolicy: 'continue-target-only'
        }).instructions).toContain('user explicitly chose to continue planning only the requested deck');
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
        expect(draft).toMatchObject({
            base: 'master',
            prBase: 'master',
            baseCommit,
            branch: 'flashcards/request-42',
            sourceRoot: root
        });
        expect(draft.worktreeRoot).not.toBe(root);
        expect(spawnSync('git', ['branch', '--show-current'], { cwd: draft.worktreeRoot, encoding: 'utf8' }).stdout.trim())
            .toBe('flashcards/request-42');
        expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: draft.worktreeRoot, encoding: 'utf8' }).stdout.trim())
            .toBe(baseCommit);
        await writeFile(path.join(draft.worktreeRoot, 'generated.txt'), 'temporary\n');
        abandonRegistryDraft(draft.worktreeRoot, draft);
        await expect(readFile(path.join(draft.worktreeRoot, 'generated.txt'), 'utf8')).rejects.toThrow();
        expect(spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim())
            .toBe('');
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

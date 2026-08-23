import { describe, expect, it } from 'vitest';
import {
    GENERATION_RUNNER_LABEL,
    generationRunnerPaths,
    generationRunnerPlist
} from '../bin/lib/generation-runner-service.js';

describe('production generation runner service', () => {
    it('builds stable per-user service paths', () => {
        expect(generationRunnerPaths('/Users/example')).toEqual({
            plistPath: `/Users/example/Library/LaunchAgents/${GENERATION_RUNNER_LABEL}.plist`,
            stateDirectory: '/Users/example/.flashcards/runner',
            workflowDirectory: '/Users/example/.flashcards/runner/flashcards-runtime',
            registryDirectory: '/Users/example/.flashcards/runner/curricula-runtime',
            stdoutPath: '/Users/example/.flashcards/runner/stdout.log',
            stderrPath: '/Users/example/.flashcards/runner/stderr.log'
        });
    });

    it('renders a recurring runner without embedding credentials', () => {
        const plist = generationRunnerPlist({
            nodePath: '/opt/homebrew/bin/node',
            runnerScriptPath: '/Users/example/.flashcards/runner/flashcards-runtime/scripts/run-generation-request.js',
            workingDirectory: '/Users/example/.flashcards/runner/flashcards-runtime',
            workerUrl: 'https://worker.example.test',
            notesRoot: '/Users/example/notes',
            registryRoot: '/Users/example/.flashcards/runner/curricula-runtime',
            deploymentRepository: 'example/flashcards',
            intervalSeconds: 45,
            executablePath: '/opt/homebrew/bin:/usr/bin:/bin',
            stdoutPath: '/Users/example/.flashcards/runner/stdout.log',
            stderrPath: '/Users/example/.flashcards/runner/stderr.log'
        });

        expect(plist).toContain('<key>RunAtLoad</key>');
        expect(plist).toContain('<integer>45</integer>');
        expect(plist).toContain('<string>/Users/example/.flashcards/runner/flashcards-runtime/scripts/run-generation-request.js</string>');
        expect(plist).toContain('<string>--deployment-repository</string>');
        expect(plist).toContain('<string>example/flashcards</string>');
        expect(plist).toContain('<string>https://worker.example.test</string>');
        expect(plist).not.toContain('RUNNER_TOKEN');
        expect(plist).not.toContain('API_KEY');
    });

    it('rejects a tight restart loop', () => {
        expect(() => generationRunnerPlist({ intervalSeconds: 5 }))
            .toThrow(/at least 15 seconds/);
    });
});

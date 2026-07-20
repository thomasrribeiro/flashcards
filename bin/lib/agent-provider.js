import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function providerRunner(providerId, explicitCommand) {
    if (!providerId || providerId === 'codex') return null;
    const command = explicitCommand || process.env.FLASHCARDS_AGENT_RUNNER;
    if (!command) {
        throw new Error(`Provider ${providerId} requires FLASHCARDS_AGENT_RUNNER or --agent-runner.`);
    }
    return command;
}

/**
 * Generic local runner protocol. The executable receives one JSON manifest
 * path. It may edit only workspacePath and must return exit code zero. API
 * credentials remain in the runner's environment and never enter the job.
 */
export function runExternalProviderJob(job, { workspacePath, command }) {
    if (!existsSync(workspacePath)) throw new Error(`Provider workspace does not exist: ${workspacePath}`);
    const manifestPath = path.join(workspacePath, '.flashcards-generation-job.json');
    writeFileSync(manifestPath, `${JSON.stringify({
        schemaVersion: 1,
        ...job,
        workspacePath
    }, null, 2)}\n`);
    try {
        const result = spawnSync(command, [manifestPath], { cwd: workspacePath, stdio: 'inherit' });
        if (result.error) throw new Error(`Unable to launch provider runner: ${result.error.message}`);
        return { status: result.status ?? 1 };
    } finally {
        rmSync(manifestPath, { force: true });
    }
}

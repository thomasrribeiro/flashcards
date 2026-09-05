import { describe, expect, it } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { descendantPids, stopGenerationProcessTree } from './generation-cancellation.js';

describe('generation cancellation', () => {
    it('observes server cancellation while the job event loop is blocked', async () => {
        let cancelled = false;
        let checks = 0;
        const server = createServer((req, res) => {
            expect(req.url).toBe('/api/generation-runner/requests/32');
            expect(req.headers['x-flashcards-runner-token']).toBe('test-only-token');
            checks++;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ request: { id: 32, status: cancelled ? 'cancelled' : 'running' } }));
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const moduleUrl = new URL('./generation-cancellation.js', import.meta.url).href;
        const job = spawn(process.execPath, ['--input-type=module', '-e', `
            import { startGenerationCancellationMonitor } from ${JSON.stringify(moduleUrl)};
            import { spawnSync } from 'node:child_process';
            startGenerationCancellationMonitor(32, {
                trustedRunner: true, workerUrl: 'http://127.0.0.1:${server.address().port}', runnerToken: 'test-only-token'
            });
            spawnSync(process.execPath, ['-e', 'console.log(process.pid); setInterval(()=>{},1000)'], {stdio: 'inherit'});
        `], { stdio: ['ignore', 'pipe', 'ignore'] });
        const exited = once(job, 'exit');
        let agentPid;
        try {
            const [data] = await once(job.stdout, 'data');
            agentPid = Number(String(data).trim());
            cancelled = true;
            const [, signal] = await exited;
            expect(signal).toBe('SIGTERM');
            expect(checks).toBeGreaterThan(0);
        } finally {
            job.kill('SIGKILL');
            if (agentPid) { try { process.kill(agentPid, 'SIGKILL'); } catch {} }
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    }, 15_000);

    it('selects only the job process tree, excluding its monitor', () => {
        expect(descendantPids([
            { pid: 8, ppid: 4 }, { pid: 4, ppid: 2 },
            { pid: 6, ppid: 2 }, { pid: 9, ppid: 6 },
            { pid: 3, ppid: 1 }, { pid: 2, ppid: 1 }
        ], 2, 6)).toEqual([2, 4, 8]);
    });

    it('terminates a disposable job and its subprocess, leaving the caller alive', async () => {
        const child = spawn(process.execPath, ['-e', `
            const {spawn}=require('node:child_process');
            const agent=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);
            console.log(agent.pid);
            setInterval(()=>{},1000);
        `], { stdio: ['ignore', 'pipe', 'ignore'] });
        let agentPid;
        try {
            const [data] = await once(child.stdout, 'data');
            agentPid = Number(String(data).trim());
            expect(agentPid).toBeGreaterThan(1);
            await stopGenerationProcessTree(child.pid, { graceMs: 100 });
            const pids = execFileSync('ps', ['-axo', 'pid='], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
            expect(pids).not.toContain(child.pid);
            expect(pids).not.toContain(agentPid);
            expect(pids).toContain(process.pid);
        } finally {
            child.kill('SIGKILL');
            if (agentPid) { try { process.kill(agentPid, 'SIGKILL'); } catch {} }
        }
    });
});

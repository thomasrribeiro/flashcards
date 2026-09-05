import { fork, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getClaimedGenerationRequest, listGenerationRequests } from './generation-requests.js';

export function descendantPids(rows, parentPid, excludedPid) {
    const descendants = new Set([parentPid]);
    for (let changed = true; changed;) {
        changed = false;
        for (const row of rows) {
            if (row.pid !== excludedPid && descendants.has(row.ppid) && !descendants.has(row.pid)) {
                descendants.add(row.pid);
                changed = true;
            }
        }
    }
    return [...descendants];
}

function processRows() {
    return execFileSync('ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8' })
        .trim().split('\n').map(line => {
            const [, pid, ppid, started] = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/) || [];
            return { pid: Number(pid), ppid: Number(ppid), started };
        });
}

function signal(pid, name) {
    try { process.kill(pid, name); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
    }
}

export async function stopGenerationProcessTree(parentPid, { graceMs = 5000 } = {}) {
    if (!Number.isInteger(parentPid) || parentPid <= 1 || parentPid === process.pid) {
        throw new Error('Invalid generation process ID');
    }
    const rows = processRows();
    const ids = descendantPids(rows, parentPid, process.pid);
    const targets = rows.filter(row => ids.includes(row.pid));
    // Stop the job supervisor first, so failed children cannot publish or
    // overwrite cancellation while unwinding. Do not stop the queue service.
    for (const pid of ids) signal(pid, 'SIGTERM');
    await new Promise(resolve => setTimeout(resolve, graceMs));
    const remaining = processRows();
    for (const target of targets) {
        // Guard against PID reuse during the grace period.
        if (remaining.some(row => row.pid === target.pid && row.started === target.started)) {
            signal(target.pid, 'SIGKILL');
        }
    }
}

export function startGenerationCancellationMonitor(requestId, options = {}) {
    if (process.platform === 'win32') throw new Error('Generation job cancellation requires a POSIX runner.');
    const monitor = fork(fileURLToPath(import.meta.url), [
        '--watch', String(process.pid), String(requestId), options.workerUrl || '',
        options.trustedRunner ? 'trusted' : 'user'
    ], {
        detached: true,
        execArgv: [],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        env: {
            ...process.env,
            ...(options.runnerToken ? { FLASHCARDS_RUNNER_TOKEN: options.runnerToken } : {})
        }
    });
    monitor.on('error', error => console.error(`Cancellation monitor: ${error.message}`));
    monitor.unref();
    monitor.disconnect();
    return () => monitor.kill('SIGTERM');
}

async function watch(parentPid, requestId, options) {
    // A separate process is necessary because the authoring CLI uses spawnSync.
    // Polling in its event loop would be blocked throughout generation.
    while (process.ppid === parentPid) {
        try {
            const current = options.trustedRunner
                ? (await getClaimedGenerationRequest(requestId, options)).request
                : (await listGenerationRequests(options)).requests.find(row => row.id === requestId);
            if (process.ppid !== parentPid) return;
            if (current?.status === 'cancelled') {
                console.error(`Stopping cancelled generation job ${requestId}.`);
                await stopGenerationProcessTree(parentPid);
                return;
            }
            if (current && !['queued', 'running'].includes(current.status)) return;
        } catch (error) {
            console.error(`Cancellation check for job ${requestId} failed: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--watch') {
    const [, , , parent, request, workerUrl, mode] = process.argv;
    await watch(Number(parent), Number(request), { workerUrl, trustedRunner: mode === 'trusted' });
}

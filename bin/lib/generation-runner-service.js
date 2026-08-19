import os from 'node:os';
import path from 'node:path';

export const GENERATION_RUNNER_LABEL = 'com.thomasribeiro.flashcards-generation-runner';

function xml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function stringNode(value, indent = '        ') {
    return `${indent}<string>${xml(value)}</string>`;
}

export function generationRunnerPaths(home = os.homedir()) {
    const stateDirectory = path.join(home, '.flashcards', 'runner');
    return {
        plistPath: path.join(home, 'Library', 'LaunchAgents', `${GENERATION_RUNNER_LABEL}.plist`),
        stateDirectory,
        stdoutPath: path.join(stateDirectory, 'stdout.log'),
        stderrPath: path.join(stateDirectory, 'stderr.log')
    };
}

export function generationRunnerPlist({
    nodePath,
    cliPath,
    workingDirectory,
    workerUrl,
    notesRoot,
    registryRoot,
    intervalSeconds = 60,
    executablePath = process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    stdoutPath,
    stderrPath
}) {
    const interval = Number(intervalSeconds);
    if (!Number.isInteger(interval) || interval < 15) {
        throw new Error('Runner interval must be an integer of at least 15 seconds.');
    }
    const required = { nodePath, cliPath, workingDirectory, workerUrl, notesRoot, registryRoot, stdoutPath, stderrPath };
    for (const [name, value] of Object.entries(required)) {
        if (!String(value || '').trim()) throw new Error(`Runner ${name} is required.`);
    }
    const argumentsList = [
        nodePath,
        cliPath,
        'requests',
        'run',
        '--worker-url',
        workerUrl,
        '--notes-root',
        notesRoot,
        '--registry-root',
        registryRoot
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${xml(GENERATION_RUNNER_LABEL)}</string>
    <key>ProgramArguments</key>
    <array>
${argumentsList.map(value => stringNode(value)).join('\n')}
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(workingDirectory)}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${xml(executablePath)}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>${interval}</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${xml(stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(stderrPath)}</string>
</dict>
</plist>
`;
}

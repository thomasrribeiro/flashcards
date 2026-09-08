import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateGlobalCurriculumCandidate } from '../../src/fresh-generation.js';
import { freshGenerationInstructions } from './fresh-generation-instructions.js';
import { requestFreshGeneration } from './fresh-generation-provider.js';

// Retain completed outputs outside the disposable publication worktree. Never
// persist credentials, old catalogs, or arbitrary request/transport objects.
export async function generateRecoverableCurriculum(options, { draftsRoot, requestId, beforeAttempt = async () => {} }) {
    if (options.jobType !== 'curriculum-design') throw new Error('Recovery is supported only for global curricula.');
    if (!Number.isSafeInteger(Number(requestId)) || Number(requestId) < 1) throw new Error('Invalid generation request ID.');
    mkdirSync(draftsRoot, { recursive: true, mode: 0o700 });
    const directory = mkdtempSync(path.join(draftsRoot, `request-${requestId}-`));
    const save = (name, value) => writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    try {
        await beforeAttempt();
        // Retention and read-only reconnects do not authorize another generation.
        save('attempt-1-started.json', { requestId, attempt: 1, startedAt: new Date().toISOString() });
        const generated = await requestFreshGeneration({ ...options,
            instructions: freshGenerationInstructions('curriculum-design'),
            onResponseCreated: responseId => save('attempt-1-response.json', {
                requestId, attempt: 1, responseId, background: true, recordedAt: new Date().toISOString()
            }) });
        save('attempt-1.json', { candidate: generated.candidate, provenance: generated.provenance });
        const issues = [];
        let candidate;
        try {
            if (!Array.isArray(generated.candidate.practiceNotes)) throw new Error('Missing practice notes report.');
            candidate = validateGlobalCurriculumCandidate(generated.candidate, options.subjects,
                { requireCoverage: true, mandatoryDecks: options.mandatoryDecks });
            issues.push(...candidate.scopeIssues);
        } catch (error) {
            issues.push(error.message);
        }
        save('attempt-1-validation.json', { issues });
        if (issues.length) throw new Error('Curriculum needs revision. Review the draft and update the instructions before a fresh job.');
        return { candidate, provenance: { ...generated.provenance, attempts: [generated.provenance] }, draftDirectory: directory };
    } catch (error) {
        // The detailed issues remain in validation artifacts, not a wall of UI text.
        throw new Error(`${error.message} Drafts: ${directory}`, { cause: error });
    }
}

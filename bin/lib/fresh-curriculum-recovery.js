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
    const attempts = [];
    let repair;
    try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            await beforeAttempt();
            // A durable marker distinguishes a started/uncertain request from a
            // completed response. There is no automatic replay after transport failure.
            save(`attempt-${attempt + 1}-started.json`, { requestId, attempt: attempt + 1, startedAt: new Date().toISOString() });
            const generated = await requestFreshGeneration({ ...options,
                instructions: freshGenerationInstructions('curriculum-design', { repair: Boolean(repair) }), repair });
            save(`attempt-${attempt + 1}.json`, { candidate: generated.candidate, provenance: generated.provenance });
            attempts.push(generated.provenance);
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
            save(`attempt-${attempt + 1}-validation.json`, { issues });
            if (!issues.length) return { candidate, provenance: { ...generated.provenance, attempts }, draftDirectory: directory };
            repair = { draft: generated.candidate, issues };
        }
        throw new Error('Curriculum still needs repair after one repair pass.');
    } catch (error) {
        // The detailed issues remain in validation artifacts, not a wall of UI text.
        throw new Error(`${error.message} Drafts: ${directory}`, { cause: error });
    }
}

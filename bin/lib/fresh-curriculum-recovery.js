import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compileGlobalCurriculumCandidate, GLOBAL_CURRICULUM_COMPILER } from '../../src/global-curriculum-compiler.js';
import { freshGenerationInstructions } from './fresh-generation-instructions.js';
import { requestFreshGeneration } from './fresh-generation-provider.js';
import { inspectCurriculumCandidate } from '../../src/curriculum-diagnostics.js';
import { retainedGenerationFailure } from './retained-generation-failure.js';

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
            candidate = compileGlobalCurriculumCandidate(generated.candidate, options.subjects,
                { mandatoryDecks: options.mandatoryDecks });
            issues.push(...candidate.scopeIssues);
        } catch (error) {
            issues.push(...(error.structuralErrors || [error.message]));
        }
        save('attempt-1-validation.json', { issues });
        // Evidence for external review, not feedback into this model run. Keep
        // structural failures separate from self-reported educational defects.
        save('attempt-1-diagnostics.json', inspectCurriculumCandidate(generated.candidate,
            options.subjects, { mandatoryDecks: options.mandatoryDecks, requireModelFormat: true }));
        // Only structurally valid graphs can enter the viewer. Scope failures
        // still prevent publication, but no longer discard a completed graph.
        if (!candidate) {
            const failure = new Error('Curriculum needs revision. Review the returned output.');
            failure.reviewResult = retainedGenerationFailure(generated, issues);
            throw failure;
        }
        const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
        const compilation = { compilerVersion: GLOBAL_CURRICULUM_COMPILER,
            rawCandidateHash: hash(generated.candidate), compiledCandidateHash: hash(candidate) };
        save('attempt-1-compiled.json', { candidate, compilation });
        return { candidate, issues, provenance: { ...generated.provenance, compilation,
            attempts: [generated.provenance] }, draftDirectory: directory };
    } catch (error) {
        // The detailed issues remain in validation artifacts, not a wall of UI text.
        const failure = new Error(`${error.message} Drafts: ${directory}`, { cause: error });
        if (error.reviewResult) failure.reviewResult = error.reviewResult;
        throw failure;
    }
}

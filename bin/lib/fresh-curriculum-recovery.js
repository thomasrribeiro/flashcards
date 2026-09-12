import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateGlobalCurriculumCandidate } from '../../src/fresh-generation.js';
import { freshGenerationInstructions } from './fresh-generation-instructions.js';
import { requestFreshGeneration, requestCurriculumRevision } from './fresh-generation-provider.js';
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
    const attempts = [];
    let generated;
    try {
        for (let attempt = 1; attempt <= 2; attempt++) {
            await beforeAttempt();
            // One draft plus one same-job revision. Transport failures never restart either call.
            save(`attempt-${attempt}-started.json`, { requestId, attempt, startedAt: new Date().toISOString() });
            const callbacks = {
                onResponseCreated: responseId => save(`attempt-${attempt}-response.json`, {
                    requestId, attempt, responseId, background: true, recordedAt: new Date().toISOString()
                }),
                onResponseDiagnostics: diagnostics => save(`attempt-${attempt}-provider.json`, diagnostics)
            };
            generated = attempt === 1
                ? await requestFreshGeneration({ ...options,
                    instructions: freshGenerationInstructions('curriculum-design'), ...callbacks })
                : await requestCurriculumRevision(generated, callbacks);
            attempts.push(generated.provenance);
            save(`attempt-${attempt}.json`, { candidate: generated.candidate, provenance: generated.provenance });
            const issues = [];
            let candidate;
            try {
                // New jobs use the request-58 contract. Format-2 compilation remains
                // available for read-only inspection of historical outputs only.
                if (generated.candidate?.schema_version !== undefined) throw new Error('Unexpected model output format.');
                if (!Array.isArray(generated.candidate?.practiceNotes)) throw new Error('Missing practice notes report.');
                candidate = validateGlobalCurriculumCandidate(generated.candidate, options.subjects,
                    { requireCoverage: true, mandatoryDecks: options.mandatoryDecks });
                issues.push(...candidate.scopeIssues);
            } catch (error) {
                issues.push(...(error.structuralErrors || [error.message]));
            }
            save(`attempt-${attempt}-validation.json`, { issues });
            // Detailed traces remain external; revision receives deterministic errors only. Keep
            // structural failures separate from self-reported educational defects.
            save(`attempt-${attempt}-diagnostics.json`, candidate
                ? inspectCurriculumCandidate(candidate, options.subjects, { mandatoryDecks: options.mandatoryDecks })
                : { structuralValid: false, structuralErrors: issues, educationalReviewRequired: true });
            // Only structurally valid graphs can enter the viewer. Scope failures
            // still prevent publication, but no longer discard a completed graph.
            if (!candidate && attempt === 1) continue;
            if (!candidate) {
                const failure = new Error('Curriculum needs revision. Review the returned output.');
                failure.reviewResult = retainedGenerationFailure({ ...generated, provenance: { ...generated.provenance, attempts } }, issues);
                throw failure;
            }
            const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
            const validation = { contractVersion: 1,
                rawCandidateHash: hash(generated.candidate), validatedCandidateHash: hash(candidate) };
            save(`attempt-${attempt}-validated.json`, { candidate, validation });
            if (attempt === 1) continue;
            return { candidate, issues, provenance: { ...generated.provenance, validation,
                attempts }, draftDirectory: directory };
        }
    } catch (error) {
        // The detailed issues remain in validation artifacts, not a wall of UI text.
        const failure = new Error(`${error.message} Drafts: ${directory}`, { cause: error });
        if (error.reviewResult) failure.reviewResult = error.reviewResult;
        throw failure;
    }
}

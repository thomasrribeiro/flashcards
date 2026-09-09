import { FRESH_GENERATION_VERSION } from './fresh-generation.js';
import { globalCurriculumTarget, canonicalSubjectNames } from './global-curriculum-input.js';

export function curriculumProbeJob(subjects, preferences, workflowCommit) {
    const job = { jobType: 'curriculum-design', providerId: preferences.providerId, modelId: preferences.modelId,
        payload: { workflowVersion: FRESH_GENERATION_VERSION, workflowCommit,
            reasoningEffort: preferences.reasoningEffort, evaluationOnly: true, subjects: canonicalSubjectNames(subjects) } };
    validateCurriculumProbeJob(job);
    return job;
}

export function validateCurriculumProbeJob(job) {
    const payload = job.payload || {};
    const fields = ['workflowVersion', 'workflowCommit', 'reasoningEffort', 'evaluationOnly', 'subjects'];
    if ((job.jobType || job.job_type) !== 'curriculum-design' || payload.evaluationOnly !== true
        || payload.workflowVersion !== FRESH_GENERATION_VERSION
        || Object.keys(payload).some(key => !fields.includes(key))
        || fields.some(key => !Object.hasOwn(payload, key))
        || job.registryId || job.registry_id || job.targetRepository || job.target_repository) {
        throw new Error('An evaluation must be a registry-free curriculum probe.');
    }
    if ((job.providerId || job.provider_id) !== 'openai' || !(job.modelId || job.model_id)
        || !['low', 'medium', 'high', 'xhigh', 'max'].includes(payload.reasoningEffort)
        || !/^[a-f0-9]{40}$/i.test(payload.workflowCommit)) throw new Error('Pin the probe model, reasoning and workflow.');
    canonicalSubjectNames(payload.subjects);
    return payload;
}

export function freshGenerationJob(jobType, target, preferences, registry, workflowCommit) {
    if (preferences.providerId !== 'openai') throw new Error('Fresh generation currently requires OpenAI.');
    if (!preferences.modelId || !preferences.reasoningEffort) throw new Error('Choose a model and reasoning level.');
    const payload = {
        workflowVersion: FRESH_GENERATION_VERSION,
        workflowCommit,
        registryBaseCommit: registry?.resolved_commit,
        catalogHash: registry?.catalog_hash,
        registryRef: registry?.ref || 'master',
        catalogPath: registry?.path || 'dist/curriculum.json',
        reasoningEffort: preferences.reasoningEffort,
        ...(jobType === 'curriculum-design' ? globalCurriculumTarget(target)
            : { deckId: target.deckId, ...(jobType === 'chapter-expand' ? { chapterId: target.chapterId } : {}) })
    };
    validateFreshProvenance(payload);
    return { jobType, registryId: registry.id, targetRepository: registry.repository, providerId: preferences.providerId, modelId: preferences.modelId, payload };
}

export function validateFreshProvenance(payload) {
    if (payload.workflowVersion !== FRESH_GENERATION_VERSION) throw new Error('Unsupported fresh workflow.');
    if (![payload.workflowCommit, payload.registryBaseCommit].every(value => /^[a-f0-9]{40}$/i.test(value || ''))
        || !/^sha256:[a-f0-9]{64}$/i.test(payload.catalogHash || '')) throw new Error('Refresh the curriculum before generating.');
    for (const value of [payload.registryRef, payload.catalogPath]) {
        if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(value || '') || value.includes('..')) throw new Error('Invalid registry path.');
    }
    return payload;
}

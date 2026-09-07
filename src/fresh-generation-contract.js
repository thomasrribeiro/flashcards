import { FRESH_GENERATION_VERSION } from './fresh-generation.js';
import { globalCurriculumTarget } from './global-curriculum-input.js';

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

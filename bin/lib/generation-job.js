import { TARGET_ONLY_PREREQUISITE_PLAN_INSTRUCTION } from '../../src/deck-generation-contract.js';

export function executionOptionsForGenerationJob(queued, payload, options = {}) {
    const jobType = queued?.job_type || 'deck-build';
    const prerequisitePlanInstruction = jobType === 'deck-plan'
        && payload?.prerequisitePlanPolicy === 'continue-target-only'
        ? TARGET_ONLY_PREREQUISITE_PLAN_INSTRUCTION
        : null;
    const executionOptions = {
        nonInteractive: options.nonInteractive,
        reportOnly: options.reportOnly,
        model: queued?.model_id || options.model,
        instructions: [options.instructions, prerequisitePlanInstruction].filter(Boolean).join('\n\n') || undefined,
        dryRun: options.dryRun,
        allowDirty: options.allowDirty,
        isolated: options.isolated,
        reasoningEffort: payload?.reasoningEffort || options.reasoningEffort,
        agentEnv: options.agentEnv || {},
        chapterCurriculum: jobType === 'deck-plan',
        full: jobType === 'deck-build' && payload?.buildScope === 'full',
        freshChapter: false,
        freshPilot: false
    };
    if (jobType === 'chapter-expand') {
        const chapter = Number.parseInt(String(payload?.chapterId || queued?.chapter_id).slice(0, 2), 10);
        if (!Number.isInteger(chapter)) throw new Error('Chapter job has no ordered chapter identifier.');
        if (payload?.buildScope === 'pilot') {
            if (chapter !== 1) throw new Error('A pilot content job must target the first ordered chapter.');
        } else {
            executionOptions.chapter = chapter;
        }
        if (payload?.generationMode === 'replace') {
            if (payload?.buildScope === 'pilot') executionOptions.freshPilot = true;
            else executionOptions.freshChapter = true;
        }
    }
    return executionOptions;
}

export function executionOptionsForGenerationJob(queued, payload, options = {}) {
    const jobType = queued?.job_type || 'deck-build';
    const executionOptions = {
        nonInteractive: options.nonInteractive,
        reportOnly: options.reportOnly,
        model: queued?.model_id || options.model,
        instructions: options.instructions,
        dryRun: options.dryRun,
        allowDirty: options.allowDirty,
        isolated: options.isolated,
        reasoningEffort: payload?.reasoningEffort || options.reasoningEffort,
        full: jobType === 'deck-build' && payload?.buildScope === 'full',
        freshChapter: false,
        freshPilot: false
    };
    if (jobType === 'chapter-expand') {
        const chapter = Number.parseInt(String(payload?.chapterId || queued?.chapter_id).slice(0, 2), 10);
        if (!Number.isInteger(chapter)) throw new Error('Chapter job has no ordered chapter identifier.');
        executionOptions.chapter = chapter;
    }
    return executionOptions;
}

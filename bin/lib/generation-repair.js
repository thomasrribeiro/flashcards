const SUBJECT_VALIDATION_FAILURES = [
    'Codex finished, but subject curriculum validation failed:',
    'Codex finished, but ROADMAP.md is not synchronized:',
    'Codex finished, but global curriculum validation failed:'
];

export function subjectValidationRepairInstructions(error) {
    const message = String(error?.message || '');
    if (!SUBJECT_VALIDATION_FAILURES.some(prefix => message.startsWith(prefix))) return null;
    return [
        'The first subject-design pass completed, but deterministic validation rejected the draft.',
        'Repair the existing subject artifacts in place. Address every error below, keep the requested scope and stable deck identities, keep hard prerequisite edges direct and minimal, synchronize ROADMAP.md with subject.toml, and rerun the subject and global curriculum validators before finishing.',
        '',
        message
    ].join('\n');
}

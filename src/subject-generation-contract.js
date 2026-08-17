export const SUBJECT_DESIGN_WORKFLOW_VERSION = 'subject-design-v1';

const GIT_COMMIT = /^[a-f0-9]{40}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;

export function subjectDesignProvenance({
    workflowCommit,
    registryBaseCommit,
    catalogHash,
    registryRef = 'master',
    catalogPath = 'dist/curriculum.json'
} = {}) {
    const provenance = {
        workflowVersion: SUBJECT_DESIGN_WORKFLOW_VERSION,
        workflowCommit: String(workflowCommit || '').toLowerCase(),
        registryBaseCommit: String(registryBaseCommit || '').toLowerCase(),
        catalogHash: String(catalogHash || '').toLowerCase(),
        registryRef: String(registryRef || 'master'),
        catalogPath: String(catalogPath || 'dist/curriculum.json')
    };
    const errors = [];
    if (!GIT_COMMIT.test(provenance.workflowCommit)) {
        errors.push('The deployed subject workflow does not have a pinned Git commit.');
    }
    if (!GIT_COMMIT.test(provenance.registryBaseCommit)) {
        errors.push('The active curriculum registry does not have a pinned Git commit. Refresh it before generating.');
    }
    if (!SHA256.test(provenance.catalogHash)) {
        errors.push('The active curriculum catalog does not have a reproducible SHA-256. Refresh it before generating.');
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(provenance.registryRef) || provenance.registryRef.includes('..')) {
        errors.push('The curriculum registry ref is invalid.');
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(provenance.catalogPath)
        || provenance.catalogPath.includes('..')
        || provenance.catalogPath.startsWith('/')) {
        errors.push('The curriculum catalog path is invalid.');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    return provenance;
}

export function validateSubjectDesignProvenance(input) {
    if (input?.workflowVersion !== SUBJECT_DESIGN_WORKFLOW_VERSION) {
        throw new Error(`Unsupported subject-design workflow: ${input?.workflowVersion || '(missing)'}`);
    }
    return subjectDesignProvenance(input);
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    appendGenerationProvenance,
    GENERATION_PROVENANCE_FILE
} from './generation-provenance.js';

function requireValue(record, key) {
    const value = String(record[key] ?? '').trim();
    if (!value) throw new Error(`Subject generation provenance requires ${key}.`);
    return value;
}

export function appendSubjectGenerationProvenance(subjectPath, record) {
    const target = path.join(subjectPath, GENERATION_PROVENANCE_FILE);
    const requestId = requireValue(record, 'requestId');
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (existing.split(/\r?\n/).includes(`request_id = ${JSON.stringify(requestId)}`)) {
        throw new Error(`Subject generation request ${requestId} is already recorded in ${target}.`);
    }
    return appendGenerationProvenance(subjectPath, {
        ...record,
        runId: record.runId || `request-${requestId}`,
        requestId,
        operation: requireValue(record, 'operation'),
        providerId: requireValue(record, 'providerId'),
        modelId: requireValue(record, 'modelId'),
        reasoningEffort: requireValue(record, 'reasoningEffort'),
        workflowVersion: requireValue(record, 'workflowVersion'),
        workflowCommit: requireValue(record, 'workflowCommit'),
        registryBaseCommit: requireValue(record, 'registryBaseCommit'),
        catalogHash: requireValue(record, 'catalogHash'),
        artifacts: record.artifacts || ['ROADMAP.md', 'SUBJECT_BRIEF.md', 'subject.toml']
    });
}

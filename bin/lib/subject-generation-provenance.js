import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PROVENANCE_FILE = 'generation.toml';

function tomlString(value) {
    return JSON.stringify(String(value ?? ''));
}

function requireValue(record, key) {
    const value = String(record[key] ?? '').trim();
    if (!value) throw new Error(`Subject generation provenance requires ${key}.`);
    return value;
}

export function appendSubjectGenerationProvenance(subjectPath, record) {
    const target = path.join(subjectPath, PROVENANCE_FILE);
    const requestId = requireValue(record, 'requestId');
    const values = {
        request_id: requestId,
        operation: requireValue(record, 'operation'),
        provider_id: requireValue(record, 'providerId'),
        model_id: requireValue(record, 'modelId'),
        reasoning_effort: requireValue(record, 'reasoningEffort'),
        workflow_version: requireValue(record, 'workflowVersion'),
        workflow_commit: requireValue(record, 'workflowCommit'),
        registry_base_commit: requireValue(record, 'registryBaseCommit'),
        catalog_hash: requireValue(record, 'catalogHash')
    };
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : 'schema_version = 1\n';
    if (!/^schema_version = 1\s*$/m.test(existing)) {
        throw new Error(`Unsupported subject generation provenance file: ${target}`);
    }
    const requestLine = `request_id = ${tomlString(requestId)}`;
    if (existing.split(/\r?\n/).includes(requestLine)) {
        throw new Error(`Subject generation request ${requestId} is already recorded in ${target}.`);
    }
    const block = [
        '[[runs]]',
        ...Object.entries(values).map(([key, value]) => `${key} = ${tomlString(value)}`)
    ].join('\n');
    writeFileSync(target, `${existing.trimEnd()}\n\n${block}\n`, 'utf8');
    return target;
}

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const GENERATION_PROVENANCE_FILE = 'generation.toml';

function required(record, key) {
    const value = String(record[key] ?? '').trim();
    if (!value) throw new Error(`Generation provenance requires ${key}.`);
    return value;
}

function optional(record, key) {
    const value = String(record[key] ?? '').trim();
    return value || null;
}

function tomlString(value) {
    return JSON.stringify(String(value));
}

function tomlStringArray(values) {
    return `[${values.map(tomlString).join(', ')}]`;
}

export function generationProviderId(providerId, invocation = null) {
    if (providerId) return String(providerId);
    if (invocation?.provider === 'claude-cli') return 'anthropic';
    if (invocation?.provider === 'gemini-cli') return 'google';
    return 'openai';
}

export function createGenerationRunId(prefix = 'local') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function changedGenerationArtifacts(patch) {
    return [...String(patch || '').matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)]
        .map(match => match[2])
        .filter(relativePath => relativePath !== GENERATION_PROVENANCE_FILE)
        .sort();
}

export function appendGenerationProvenance(rootPath, record) {
    const runId = required(record, 'runId');
    const artifacts = [...new Set((record.artifacts || [])
        .map(value => String(value).trim())
        .filter(Boolean))].sort();
    if (!artifacts.length) throw new Error('Generation provenance requires at least one artifact.');

    const target = path.join(rootPath, GENERATION_PROVENANCE_FILE);
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : 'schema_version = 1\n';
    if (!/^schema_version = 1\s*$/m.test(existing)) {
        throw new Error(`Unsupported generation provenance file: ${target}`);
    }
    if (existing.split(/\r?\n/).includes(`run_id = ${tomlString(runId)}`)) {
        throw new Error(`Generation run ${runId} is already recorded in ${target}.`);
    }

    const fields = [
        ['run_id', runId],
        ['request_id', optional(record, 'requestId')],
        ['operation', required(record, 'operation')],
        ['provider_id', required(record, 'providerId')],
        ['model_id', required(record, 'modelId')],
        ['reasoning_effort', required(record, 'reasoningEffort')],
        ['generated_at', optional(record, 'generatedAt') || new Date().toISOString()],
        ['generation_mode', optional(record, 'generationMode')],
        ['chapter_id', optional(record, 'chapterId')],
        ['workflow_version', optional(record, 'workflowVersion')],
        ['workflow_commit', optional(record, 'workflowCommit')],
        ['registry_base_commit', optional(record, 'registryBaseCommit')],
        ['catalog_hash', optional(record, 'catalogHash')],
        ['context_hash', optional(record, 'contextHash')],
        ['base_commit', optional(record, 'baseCommit')],
        ['provenance_source', optional(record, 'provenanceSource')]
    ];
    const block = [
        '[[runs]]',
        `artifacts = ${tomlStringArray(artifacts)}`,
        ...fields
            .filter(([, value]) => value !== null)
            .map(([key, value]) => `${key} = ${tomlString(value)}`)
    ].join('\n');
    writeFileSync(target, `${existing.trimEnd()}\n\n${block}\n`, 'utf8');
    return target;
}

export function validateGenerationProvenance(rootPath) {
    const target = path.join(rootPath, GENERATION_PROVENANCE_FILE);
    if (!existsSync(target)) return [];
    const content = readFileSync(target, 'utf8');
    const errors = [];
    if (!/^schema_version = 1\s*$/m.test(content)) {
        errors.push(`${GENERATION_PROVENANCE_FILE}: unsupported or missing schema_version`);
    }
    const blocks = content.split(/^\[\[runs\]\]\s*$/m).slice(1);
    const runIds = new Set();
    blocks.forEach((block, index) => {
        const label = `${GENERATION_PROVENANCE_FILE} run ${index + 1}`;
        for (const field of [
            'run_id', 'operation', 'artifacts', 'provider_id',
            'model_id', 'reasoning_effort', 'generated_at'
        ]) {
            if (!new RegExp(`^${field}\\s*=`, 'm').test(block)) errors.push(`${label}: missing ${field}`);
        }
        const runId = /^run_id\s*=\s*"([^"]+)"\s*$/m.exec(block)?.[1];
        if (runId) {
            if (runIds.has(runId)) errors.push(`${label}: duplicate run_id ${runId}`);
            runIds.add(runId);
        }
        const artifacts = /^artifacts\s*=\s*\[(.*)\]\s*$/m.exec(block)?.[1] || '';
        if (!artifacts.trim()) errors.push(`${label}: artifacts must not be empty`);
        if (/(?:^|[,\s])"(?:\/|\.\.(?:\/|\\\\))/.test(artifacts)) {
            errors.push(`${label}: artifacts must remain inside the repository`);
        }
    });
    if (!blocks.length) errors.push(`${GENERATION_PROVENANCE_FILE}: no generation runs recorded`);
    return errors;
}

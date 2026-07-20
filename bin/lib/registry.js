import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePath } from './paths.js';
import {
    formatGlobalCurriculum,
    resolveGlobalCurriculum,
    writeGlobalCurriculumIndex
} from './global-curriculum.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function scalar(content, key, fallback = null) {
    const match = new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|(\\d+))\\s*$`, 'm').exec(content);
    return match ? (match[1] ?? Number(match[2])) : fallback;
}

export function resolveRegistry(inputPath) {
    const root = resolvePath(inputPath);
    const manifestPath = path.join(root, 'registry.toml');
    const errors = [];
    if (!existsSync(manifestPath)) {
        return { root, manifestPath, errors: [`Missing registry.toml: ${root}`], warnings: [] };
    }
    const content = readFileSync(manifestPath, 'utf8');
    const registry = {
        schemaVersion: scalar(content, 'schema_version'),
        id: scalar(content, 'id'),
        name: scalar(content, 'name'),
        repository: scalar(content, 'repository'),
        defaultRef: scalar(content, 'default_ref', 'master'),
        subjectsDir: scalar(content, 'subjects_dir', 'subjects'),
        output: scalar(content, 'output', 'dist/curriculum.json'),
        deckMetadataPath: scalar(content, 'deck_metadata', null),
        deckOwner: scalar(content, 'deck_owner')
    };
    if (registry.schemaVersion !== 1) errors.push('registry.toml: schema_version must be 1');
    if (!SLUG.test(String(registry.id || ''))) errors.push('registry.toml: id must use lowercase kebab-case');
    if (!registry.name) errors.push('registry.toml: name is required');
    if (!GITHUB_REPOSITORY.test(String(registry.repository || ''))) {
        errors.push('registry.toml: repository must use owner/repository form');
    }
    if (!SLUG.test(String(registry.defaultRef || ''))) errors.push('registry.toml: default_ref must be a safe branch name');
    if (path.isAbsolute(registry.subjectsDir) || registry.subjectsDir.includes('..')) {
        errors.push('registry.toml: subjects_dir must remain inside the registry');
    }
    if (path.isAbsolute(registry.output) || registry.output.includes('..') || !registry.output.endsWith('.json')) {
        errors.push('registry.toml: output must be a JSON path inside the registry');
    }
    if (registry.deckMetadataPath
        && (path.isAbsolute(registry.deckMetadataPath) || registry.deckMetadataPath.includes('..') || !registry.deckMetadataPath.endsWith('.json'))) {
        errors.push('registry.toml: deck_metadata must be a JSON path inside the registry');
    }
    let deckMetadata = new Map();
    if (registry.deckMetadataPath && !errors.length) {
        const metadataPath = path.join(root, registry.deckMetadataPath);
        if (!existsSync(metadataPath)) {
            errors.push(`Missing deck metadata snapshot: ${metadataPath}`);
        } else {
            try {
                const parsed = JSON.parse(readFileSync(metadataPath, 'utf8'));
                if (!Array.isArray(parsed.decks)) throw new Error('expected a decks array');
                deckMetadata = new Map(parsed.decks.map(deck => [deck.id, deck]));
                if (deckMetadata.size !== parsed.decks.length) errors.push('deck metadata snapshot contains duplicate deck IDs');
            } catch (error) {
                errors.push(`Invalid deck metadata snapshot: ${error.message}`);
            }
        }
    }
    if (!registry.deckOwner) registry.deckOwner = registry.repository?.split('/')[0] || null;
    const subjectsRoot = path.join(root, registry.subjectsDir);
    const graph = errors.length
        ? null
        : resolveGlobalCurriculum(subjectsRoot, { requireSubjects: true });
    if (graph) errors.push(...graph.errors);
    return {
        ...registry,
        root,
        manifestPath,
        subjectsRoot,
        outputPath: path.join(root, registry.output),
        graph,
        deckMetadata,
        errors: [...new Set(errors)],
        warnings: graph?.warnings || []
    };
}

export function formatRegistry(registry) {
    const lines = [
        `Curriculum registry: ${registry.root}`,
        `Registry id: ${registry.id || 'invalid'}`,
        `Repository: ${registry.repository || 'invalid'}`
    ];
    if (registry.graph) lines.push(formatGlobalCurriculum(registry.graph));
    if (registry.errors.length) lines.push('', 'Errors:', ...registry.errors.map(error => `- ${error}`));
    return lines.join('\n');
}

export function buildRegistry(inputPath) {
    const registry = resolveRegistry(inputPath);
    if (registry.errors.length) {
        throw new Error(`Invalid curriculum registry:\n- ${registry.errors.join('\n- ')}`);
    }
    const source = {
        id: registry.id,
        name: registry.name,
        repository: registry.repository,
        ref: registry.defaultRef
    };
    writeGlobalCurriculumIndex(registry.graph, registry.outputPath, {
        deckOwner: registry.deckOwner,
        deckMetadata: registry.deckMetadata,
        registry: source
    });
    return { registry, outputPath: registry.outputPath };
}

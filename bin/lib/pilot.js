import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePath } from './paths.js';

const PASS_MARKER = 'cold_start_status: pass';
const ZERO_UNRESOLVED_MARKER = 'unresolved_dependencies: 0';

function manifestPath(deckPath) {
    return path.join(deckPath, 'deck.toml');
}

export function readDeckStatus(inputPath) {
    const deckPath = resolvePath(inputPath);
    const target = manifestPath(deckPath);
    if (!existsSync(target)) return null;
    return /^status\s*=\s*"([^"]+)"/m.exec(readFileSync(target, 'utf8'))?.[1] || null;
}

export function writeDeckStatus(inputPath, status) {
    const deckPath = resolvePath(inputPath);
    const target = manifestPath(deckPath);
    if (!existsSync(target)) throw new Error(`Missing deck.toml: ${deckPath}`);
    const current = readFileSync(target, 'utf8');
    if (!/^status\s*=\s*"[^"]*"/m.test(current)) {
        throw new Error(`deck.toml has no status field: ${target}`);
    }
    writeFileSync(target, current.replace(/^status\s*=\s*"[^"]*"/m, `status = "${status}"`));
    return status;
}

function firstChapter(deckPath) {
    const directory = path.join(deckPath, 'flashcards');
    if (!existsSync(directory)) return null;
    const name = readdirSync(directory)
        .filter(entry => /^\d{2}_.+\.md$/.test(entry))
        .sort((a, b) => a.localeCompare(b))[0];
    return name ? path.join(directory, name) : null;
}

function auditPasses(deckPath, filename) {
    const target = path.join(deckPath, '.flashcards', 'audits', filename);
    if (!existsSync(target)) return { ok: false, target, reason: `missing ${filename}` };
    const content = readFileSync(target, 'utf8');
    if (!content.includes(PASS_MARKER)) {
        return { ok: false, target, reason: `${filename} does not contain ${PASS_MARKER}` };
    }
    if (!content.includes(ZERO_UNRESOLVED_MARKER)) {
        return { ok: false, target, reason: `${filename} does not contain ${ZERO_UNRESOLVED_MARKER}` };
    }
    return { ok: true, target };
}

export function inspectPilot(inputPath) {
    const deckPath = resolvePath(inputPath);
    const chapter = firstChapter(deckPath);
    if (!chapter) return { ok: false, reason: 'no ordered pilot chapter exists' };
    const markdown = readFileSync(chapter, 'utf8');
    const stableCards = (markdown.match(/<!--\s*card-id:\s*[^>]+-->/g) || []).length;
    if (stableCards === 0) return { ok: false, reason: 'the pilot chapter has no stable card IDs', chapter };
    const audit = auditPasses(deckPath, 'pilot-cold-start.md');
    if (!audit.ok) return { ok: false, reason: audit.reason, chapter, audit: audit.target };
    return { ok: true, deckPath, chapter, audit: audit.target, stableCards };
}

export function markPilotBuilt(inputPath) {
    const result = inspectPilot(inputPath);
    if (!result.ok) throw new Error(`Pilot build is incomplete: ${result.reason}`);
    writeDeckStatus(result.deckPath, 'pilot-built');
    return result;
}

export function approvePilot(inputPath) {
    const deckPath = resolvePath(inputPath);
    const status = readDeckStatus(deckPath);
    if (status !== 'pilot-built' && status !== 'pilot-approved') {
        throw new Error(`Pilot cannot be approved from status "${status || 'missing'}"; run flashcards deck build first.`);
    }
    const result = inspectPilot(deckPath);
    if (!result.ok) throw new Error(`Pilot cannot be approved: ${result.reason}`);
    writeDeckStatus(deckPath, 'pilot-approved');
    return result;
}

export function requireFullBuildApproval(inputPath) {
    const deckPath = resolvePath(inputPath);
    const status = readDeckStatus(deckPath);
    if (status !== 'pilot-approved') {
        throw new Error(
            `Full build requires an approved pilot (current status: "${status || 'missing'}"). `
            + `Run flashcards deck build ${deckPath}, review the first chapter, then run flashcards deck approve-pilot ${deckPath}.`
        );
    }
}

export function markFullBuilt(inputPath) {
    const deckPath = resolvePath(inputPath);
    const audit = auditPasses(deckPath, 'full-cold-start.md');
    if (!audit.ok) throw new Error(`Full build is incomplete: ${audit.reason}`);
    writeDeckStatus(deckPath, 'built');
    return { deckPath, audit: audit.target };
}

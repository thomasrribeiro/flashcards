import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FLASHCARDS_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_NOTES_ROOT = path.join(os.homedir(), 'notes');

export function expandHome(value) {
    if (!value) return value;
    if (value === '~') return os.homedir();
    if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
    return value;
}

export function resolvePath(value, cwd = process.cwd()) {
    return path.resolve(cwd, expandHome(value));
}

export function resolveNotesRoot(value) {
    return resolvePath(value || process.env.FLASHCARDS_NOTES_ROOT || DEFAULT_NOTES_ROOT);
}

export function requireKebabSlug(value, label) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value || '')) {
        throw new Error(`${label} must use lowercase kebab-case: ${value || '(empty)'}`);
    }
    return value;
}

export function normalizeChapterName(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!normalized) throw new Error('Chapter name must contain letters or numbers.');
    return normalized;
}

export function titleFromSlug(value) {
    return String(value)
        .split(/[-_]/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function tomlString(value) {
    return JSON.stringify(String(value));
}

export function shellQuote(value) {
    const text = String(value);
    if (/^[A-Za-z0-9_./:=+-]+$/.test(text)) return text;
    return `'${text.replaceAll("'", `'"'"'`)}'`;
}

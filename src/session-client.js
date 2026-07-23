/** Cross-device persistence for one resumable primary study session. */

import { getCurrentUser } from './storage.js';
import { setCriticalLocalStorageItem } from './browser-storage.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';
const LOCAL_KEY = 'flashcards_study_session';
let remoteQueue = Promise.resolve();

function userId() {
    const user = getCurrentUser();
    return user ? (user.github_id || user.id) : null;
}

export function normalizePersistedStudySession(session) {
    if (!session || !['due', 'new'].includes(session.mode)) return null;
    const queue = (Array.isArray(session.queue) ? session.queue : []).map(entry => ({
        cardHash: String(entry?.cardHash || ''),
        repo: String(entry?.repo || ''),
        filepath: String(entry?.filepath || '')
    })).filter(entry => entry.cardHash && entry.repo && entry.filepath);
    if (queue.length === 0) return null;
    const completedCards = Math.max(0, Math.floor(Number(session.completedCards) || 0));
    const activeDecks = Array.isArray(session.activeDecks)
        ? [...new Set(session.activeDecks.map(scope => String(scope || '')).filter(Boolean))]
        : null;
    return {
        mode: session.mode,
        queue,
        completedCards,
        totalCards: completedCards + queue.length,
        ...(activeDecks !== null && { activeDecks }),
        ...(session.updatedAt && { updatedAt: session.updatedAt })
    };
}

/**
 * A resumable queue is valid only for the exact starred scope that created it.
 * Comparing sets keeps harmless ordering differences from invalidating a session.
 * Legacy sessions without a scope snapshot are intentionally retired once.
 */
export function studySessionMatchesActiveScope(session, activeDecks = []) {
    if (!session || !Array.isArray(session.activeDecks)) return false;
    const saved = new Set(session.activeDecks);
    const current = new Set((activeDecks || []).map(scope => String(scope || '')).filter(Boolean));
    if (saved.size !== current.size) return false;
    return [...saved].every(scope => current.has(scope));
}

function readLocal() {
    try {
        return normalizePersistedStudySession(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'));
    } catch {
        return null;
    }
}

function writeLocal(session) {
    try {
        if (session) setCriticalLocalStorageItem(LOCAL_KEY, JSON.stringify(session));
        else localStorage.removeItem(LOCAL_KEY);
    } catch (error) {
        console.error('[Session] Failed to persist local session:', error);
    }
}

function enqueueRemote(operation) {
    remoteQueue = remoteQueue.catch(() => {}).then(operation);
    return remoteQueue;
}

function clearLegacySignedInLocalSession() {
    try {
        localStorage.removeItem(LOCAL_KEY);
        localStorage.removeItem('flashcards_study_session_pending');
    } catch { /* optional cleanup */ }
}

export async function getStudySession() {
    const id = userId();
    if (!id) return readLocal();
    clearLegacySignedInLocalSession();
    const response = await fetch(`${WORKER_URL}/api/study-session/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(response.statusText);
    const { session } = await response.json();
    return normalizePersistedStudySession(session);
}

export async function saveStudySession(rawSession) {
    const session = normalizePersistedStudySession(rawSession);
    if (!session) return clearStudySession();
    const id = userId();
    if (!id) {
        writeLocal(session);
        return session;
    }

    clearLegacySignedInLocalSession();
    await enqueueRemote(async () => {
        const response = await fetch(`${WORKER_URL}/api/study-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: id, session }),
            keepalive: true
        });
        if (!response.ok) throw new Error(response.statusText);
    });
    return session;
}

export async function clearStudySession() {
    const id = userId();
    if (!id) {
        writeLocal(null);
        return;
    }
    clearLegacySignedInLocalSession();
    await enqueueRemote(async () => {
        const response = await fetch(
            `${WORKER_URL}/api/study-session/${encodeURIComponent(id)}`,
            { method: 'DELETE', keepalive: true }
        );
        if (!response.ok) throw new Error(response.statusText);
    });
}

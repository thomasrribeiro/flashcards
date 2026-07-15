/** Cross-device persistence for one resumable primary study session. */

import { getCurrentUser } from './storage.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';
const LOCAL_KEY = 'flashcards_study_session';
const PENDING_KEY = 'flashcards_study_session_pending';
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
        if (session) localStorage.setItem(LOCAL_KEY, JSON.stringify(session));
        else localStorage.removeItem(LOCAL_KEY);
    } catch (error) {
        console.error('[Session] Failed to persist local session:', error);
    }
}

function readPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); }
    catch { return null; }
}

function writePending(action, session = null) {
    const pending = {
        version: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        action,
        session
    };
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); }
    catch (error) { console.error('[Session] Failed to queue session sync:', error); }
    return pending;
}

function clearPending(version) {
    try {
        if (readPending()?.version === version) localStorage.removeItem(PENDING_KEY);
    } catch { /* local fallback remains safe */ }
}

function enqueueRemote(operation) {
    remoteQueue = remoteQueue.catch(() => {}).then(operation);
    return remoteQueue;
}

async function syncPending(id, pending) {
    if (!id || !pending) return;
    await enqueueRemote(async () => {
        const isSave = pending.action === 'save';
        const response = await fetch(
            isSave
                ? `${WORKER_URL}/api/study-session`
                : `${WORKER_URL}/api/study-session/${encodeURIComponent(id)}`,
            isSave ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id, session: pending.session }),
                keepalive: true
            } : { method: 'DELETE', keepalive: true }
        );
        if (!response.ok) throw new Error(response.statusText);
        clearPending(pending.version);
    });
}

async function flushPendingSession() {
    const pending = readPending();
    const id = userId();
    if (!pending || !id || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    try { await syncPending(id, pending); }
    catch (error) { console.error('[Session] Pending session sync failed:', error); }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', flushPendingSession);
}

export async function getStudySession() {
    const local = readLocal();
    const id = userId();
    if (!id) return local;
    const pending = readPending();
    if (pending) {
        flushPendingSession();
        return local;
    }
    try {
        const response = await fetch(`${WORKER_URL}/api/study-session/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error(response.statusText);
        const { session } = await response.json();
        const normalized = normalizePersistedStudySession(session);
        writeLocal(normalized);
        return normalized;
    } catch (error) {
        console.error('[Session] Failed to load remote session, using local fallback:', error);
        return local;
    }
}

export async function saveStudySession(rawSession) {
    const session = normalizePersistedStudySession(rawSession);
    if (!session) return clearStudySession();
    writeLocal(session);
    const pending = writePending('save', session);
    const id = userId();
    if (!id) return session;
    try {
        await syncPending(id, pending);
    } catch (error) {
        console.error('[Session] Failed to save remote session:', error);
    }
    return session;
}

export async function clearStudySession() {
    writeLocal(null);
    const pending = writePending('clear');
    const id = userId();
    if (!id) return;
    try {
        await syncPending(id, pending);
    } catch (error) {
        console.error('[Session] Failed to clear remote session:', error);
    }
}

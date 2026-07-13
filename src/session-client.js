/** Cross-device persistence for one resumable primary study session. */

import { getCurrentUser } from './storage.js';

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
    return {
        mode: session.mode,
        queue,
        completedCards,
        totalCards: completedCards + queue.length,
        ...(session.updatedAt && { updatedAt: session.updatedAt })
    };
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

function enqueueRemote(operation) {
    remoteQueue = remoteQueue.catch(() => {}).then(operation);
    return remoteQueue;
}

export async function getStudySession() {
    const local = readLocal();
    const id = userId();
    if (!id) return local;
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
    const id = userId();
    if (!id) return session;
    try {
        await enqueueRemote(async () => {
            const response = await fetch(`${WORKER_URL}/api/study-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id, session }),
                keepalive: true
            });
            if (!response.ok) throw new Error(response.statusText);
        });
    } catch (error) {
        console.error('[Session] Failed to save remote session:', error);
    }
    return session;
}

export async function clearStudySession() {
    writeLocal(null);
    const id = userId();
    if (!id) return;
    try {
        await enqueueRemote(async () => {
            const response = await fetch(`${WORKER_URL}/api/study-session/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                keepalive: true
            });
            if (!response.ok) throw new Error(response.statusText);
        });
    } catch (error) {
        console.error('[Session] Failed to clear remote session:', error);
    }
}

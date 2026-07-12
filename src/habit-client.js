/**
 * Habit client — settings (active decks, daily goal), streak/daily status.
 * Logged-in: Worker + D1 is the source of truth (accounting happens server-side
 * in /api/reviews/sync). Logged-out: everything lives in localStorage here.
 */

import { getCurrentUser } from './storage.js';
import { getLocalDate } from './today-queue.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';
const LOCAL_KEY = 'flashcards_habit';
let settingsSaveQueue = Promise.resolve();
const settingsRequests = new Map();

const DEFAULT_SETTINGS = {
    activeDecks: [],
    newPerDay: 10,
    dailyGoal: 10,
    timezone: null
};

// XP per review by rating — mirror of the worker's XP_BY_RATING
const XP_BY_RATING = { 1: 2, 2: 6, 3: 10, 4: 10 };

/**
 * Streak walk over goal-met dates (desc). Today not yet met doesn't break
 * the streak. Mirror of the worker's computeStreak — unit tested there.
 */
export function computeStreak(sortedDatesDesc, todayLocalDate) {
    if (sortedDatesDesc.length === 0) return 0;
    const dayMs = 24 * 60 * 60 * 1000;
    const toUtc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    const today = toUtc(todayLocalDate);

    let expected;
    if (toUtc(sortedDatesDesc[0]) === today) expected = today;
    else if (toUtc(sortedDatesDesc[0]) === today - dayMs) expected = today - dayMs;
    else return 0;

    let streak = 0;
    for (const d of sortedDatesDesc) {
        const t = toUtc(d);
        if (t === expected) { streak++; expected -= dayMs; }
        else if (t > expected) continue;
        else break;
    }
    return streak;
}

function loadLocal() {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        const data = raw ? JSON.parse(raw) : {};
        return {
            settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
            days: data.days || {},
            pendingSettings: data.pendingSettings || null
        };
    } catch {
        return { settings: { ...DEFAULT_SETTINGS }, days: {}, pendingSettings: null };
    }
}

function saveLocal(data) {
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    } catch (error) {
        console.error('[Habit] Failed to persist local habit data:', error);
    }
}

function userId() {
    const user = getCurrentUser();
    return user ? (user.github_id || user.id) : null;
}

/**
 * Get habit settings (active decks, new/day, daily goal).
 */
export async function getSettings() {
    const id = userId();
    const local = loadLocal();
    if (!id) return local.settings;

    if (local.pendingSettings) {
        enqueueSettingsPersistence(id, local.pendingSettings);
        return local.settings;
    }

    try {
        const response = await fetch(`${WORKER_URL}/api/settings/${id}`);
        if (!response.ok) throw new Error(response.statusText);
        const { settings } = await response.json();
        const current = loadLocal();
        if (current.pendingSettings) return current.settings;
        current.settings = { ...DEFAULT_SETTINGS, ...settings };
        saveLocal(current);
        return current.settings;
    } catch (error) {
        console.error('[Habit] Failed to load settings, using local fallback:', error);
        return loadLocal().settings;
    }
}

/**
 * Save habit settings (partial update). Always mirrors to localStorage so the
 * unlogged/offline path stays coherent.
 */
export async function saveSettings(partial) {
    const local = loadLocal();
    local.settings = { ...local.settings, ...partial };
    const pending = {
        version: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        partial
    };
    local.pendingSettings = pending;
    saveLocal(local);

    const id = userId();
    if (!id) {
        local.pendingSettings = null;
        saveLocal(local);
        return local.settings;
    }

    try {
        return await enqueueSettingsPersistence(id, pending);
    } catch (error) {
        console.error('[Habit] Failed to save settings to worker:', error);
        return local.settings;
    }
}

function enqueueSettingsPersistence(id, pending) {
    if (settingsRequests.has(pending.version)) return settingsRequests.get(pending.version);

    const request = settingsSaveQueue = settingsSaveQueue
        .catch(() => {})
        .then(async () => {
            const response = await fetch(`${WORKER_URL}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id, ...pending.partial }),
                keepalive: true
            });
            if (!response.ok) throw new Error(response.statusText);
            const { settings } = await response.json();
            const current = loadLocal();
            if (current.pendingSettings?.version === pending.version) {
                current.settings = { ...DEFAULT_SETTINGS, ...settings };
                current.pendingSettings = null;
                saveLocal(current);
            }
            return { ...DEFAULT_SETTINGS, ...settings };
        })
        .finally(() => settingsRequests.delete(pending.version));

    settingsRequests.set(pending.version, request);
    return request;
}

/**
 * Get today's habit status: streak, today's counts, total XP, settings.
 */
export async function getHabitStatus(now = new Date()) {
    const date = getLocalDate(now);
    const id = userId();

    if (id) {
        try {
            const response = await fetch(`${WORKER_URL}/api/habit/${id}?date=${date}`);
            if (!response.ok) throw new Error(response.statusText);
            const status = await response.json();
            const local = loadLocal();
            if (local.pendingSettings) {
                enqueueSettingsPersistence(id, local.pendingSettings);
                status.settings = local.settings;
            } else {
                status.settings = { ...DEFAULT_SETTINGS, ...status.settings };
                local.settings = status.settings;
                saveLocal(local);
            }
            return status;
        } catch (error) {
            console.error('[Habit] Failed to load habit status, using local fallback:', error);
        }
    }

    const { settings, days } = loadLocal();
    const today = days[date] || { reviews: 0, newCards: 0, xp: 0, goalMet: false };
    const goalDates = Object.keys(days).filter(d => days[d].goalMet).sort().reverse();
    const totalXp = Object.values(days).reduce((a, d) => a + (d.xp || 0), 0);
    return { streak: computeStreak(goalDates, date), today, totalXp, settings };
}

/**
 * Record a review for habit purposes. Called from the grade path.
 * Logged-in users are accounted server-side via the sync payload, so this
 * only maintains the localStorage ledger for the unlogged/offline case.
 */
export function recordReviewLocally(log, now = new Date()) {
    if (userId()) return; // worker handles accounting

    const date = getLocalDate(now);
    const data = loadLocal();
    const day = data.days[date] || { reviews: 0, newCards: 0, xp: 0, goalMet: false };

    day.reviews += 1;
    if (Number(log?.state) === 0) day.newCards += 1;
    day.xp += XP_BY_RATING[Number(log?.rating)] || 0;
    if (day.reviews >= data.settings.dailyGoal) day.goalMet = true;

    data.days[date] = day;
    saveLocal(data);
}

/**
 * XP → level curve. Level 1 at 100 XP, 2 at 400, 3 at 900, …
 */
export function levelForXp(totalXp) {
    return Math.floor(Math.sqrt(Math.max(0, totalXp) / 100));
}

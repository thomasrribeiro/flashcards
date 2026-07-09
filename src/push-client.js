/**
 * Web Push client. iOS only delivers push to home-screen PWAs (16.4+), and the
 * permission prompt must be triggered by a user gesture — the UI in main.js
 * gates on standalone display-mode and calls subscribeToPush() from a tap.
 */

import { getCurrentUser } from './storage.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

function userId() {
    const user = getCurrentUser();
    return user ? (user.github_id || user.id) : null;
}

/**
 * Current subscription state: 'unsupported' | 'needs-install' | 'default'
 * | 'denied' | 'subscribed'.
 */
export async function getPushState() {
    if (!pushSupported()) return 'unsupported';
    if (!isStandalone()) return 'needs-install';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) return 'subscribed';
    return 'default';
}

/**
 * Request permission and subscribe. Must be called from a user gesture.
 * Returns true on success.
 */
export async function subscribeToPush() {
    if (!pushSupported() || !VAPID_PUBLIC_KEY) return false;
    const id = userId();
    if (!id) {
        console.warn('[Push] Cannot subscribe: not logged in');
        return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
    }

    const resp = await fetch(`${WORKER_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, subscription: sub.toJSON() })
    });
    return resp.ok;
}

/**
 * Unsubscribe from push on this device.
 */
export async function unsubscribeFromPush() {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try {
        await fetch(`${WORKER_URL}/api/push/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint })
        });
    } catch (error) {
        console.error('[Push] Failed to notify worker of unsubscribe:', error);
    }
}

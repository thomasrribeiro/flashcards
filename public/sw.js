/**
 * Service worker for the Flashcards PWA.
 *
 * Runtime-caching strategy (no build-time precache manifest — content-hashed
 * assets make cache-first safe, and the app is essentially always online at
 * review time; full offline study is intentionally out of scope for v1):
 *   - Worker origin (*.workers.dev)   → network-only  (never cache review/habit state)
 *   - GitHub API (api.github.com)     → stale-while-revalidate (decks load fast/offline)
 *   - same-origin navigations (HTML)  → network-first, fall back to cached shell
 *   - same-origin static assets       → cache-first (hashed filenames)
 *   - CDN (katex, google fonts)       → stale-while-revalidate
 *
 * Also handles Web Push (see B3): a push shows a notification; a tap opens the app.
 */

const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const GH_CACHE = `github-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, ASSET_CACHE, GH_CACHE]);
        const names = await caches.keys();
        await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

function isNavigation(request) {
    return request.mode === 'navigate';
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request).then(resp => {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
    }).catch(() => cached);
    return cached || network;
}

async function networkFirst(request, cacheName, fallbackUrl) {
    const cache = await caches.open(cacheName);
    try {
        const resp = await fetch(request);
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (fallbackUrl) {
            const shell = await cache.match(fallbackUrl);
            if (shell) return shell;
        }
        throw new Error('offline and no cache');
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    let url;
    try { url = new URL(request.url); } catch { return; }

    // Never cache the sync/habit worker
    if (url.hostname.endsWith('.workers.dev')) return;

    // GitHub API — deck content
    if (url.hostname === 'api.github.com' || url.hostname === 'raw.githubusercontent.com') {
        event.respondWith(staleWhileRevalidate(request, GH_CACHE));
        return;
    }

    // CDN assets (katex css/fonts, google fonts)
    if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
        event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
        return;
    }

    // Same-origin
    if (url.origin === self.location.origin) {
        if (isNavigation(request)) {
            // scope root (e.g. /flashcards/) is the shell fallback
            const shellUrl = new URL('./', self.registration.scope).toString();
            event.respondWith(networkFirst(request, SHELL_CACHE, shellUrl));
            return;
        }
        event.respondWith(cacheFirst(request, ASSET_CACHE));
    }
});

// ── Web Push (B3) ──

self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    const title = data.title || 'Flashcards';
    const body = data.body || 'Cards are due — keep your streak going.';
    const url = data.url || new URL('./?source=push', self.registration.scope).toString();
    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: new URL('icons/icon-192.png', self.registration.scope).toString(),
            badge: new URL('icons/icon-192.png', self.registration.scope).toString(),
            data: { url },
            tag: 'daily-review'
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url || self.registration.scope;
    event.waitUntil((async () => {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
            if ('focus' in client) { client.focus(); client.navigate(url); return; }
        }
        await self.clients.openWindow(url);
    })());
});

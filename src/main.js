/**
 * Main entry point for topic listing page
 */

import {
    clearReviewsByDeck,
    getAllCards,
    getAllChapterProgress,
    getAllDecks,
    getAllRepos,
    getAllReviews,
    getAllTopics,
    getStats,
    initDB,
    saveCards,
    saveRepoMetadata,
    syncChapterProgress
} from './storage.js';
import { loadRepository, loadRepositoryFiles, loadRepositoryMetadata, removeRepository } from './repo-manager.js';
import { parseDeck } from './parser.js';
import { identifyCard } from './hasher.js';
import { getAuthenticatedUser, getUserRepositories, getOrgRepositories, mergeRepositoryLists } from './github-client.js';
import { githubAuth } from './github-auth.js';
import { startSession, startTodaySession, revealAnswer, gradeCard, getState, cleanup as cleanupStudySession, GradeKeys } from './study-session.js';
import {
    buildTodayQueue,
    cardChapterScope,
    freshCardAvailability,
    getLocalDate,
    interleaveDueCards,
    newLearningPlan,
    SCOPE_SEP
} from './today-queue.js';
import { getSettings, saveSettings, getHabitStatus } from './habit-client.js';
import { clearStudySession, getStudySession, saveStudySession, studySessionMatchesActiveScope } from './session-client.js';
import { renderDashboard } from './dashboard.js';
import { getReminderPreferences, isIOSDevice, isStandalone, subscribeToPush, unsubscribeFromPush, updateAppBadge } from './push-client.js';
import { renderBrowsableCards } from './card-browser.js';
import { evictLegacyBlobLocalStorage } from './browser-storage.js';
import { sortDeckIdsByCurriculum } from './deck-order.js';
import {
    buildChapterProgressSnapshot,
    chapterProgressTargets
} from './chapter-progress.js';

// Card editor imports
import { initDeckCreator, openDeckCreator } from './deck-creator.js';
import { initFolderCreator, openFolderCreator } from './folder-creator.js';
import { initCardEditor, openCardEditorCreate, openCardEditorEdit } from './card-editor.js';
import { confirmDialog } from './confirm-modal.js';
import './card-editor.css';

/**
 * Initialize the application
 */
/**
 * Register the service worker (PWA install + offline shell + push).
 * Scope is the app base path so it works under /flashcards/ in production.
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // Vite's source files are not content-hashed. A production service worker
    // left behind on localhost can otherwise keep serving an obsolete UI.
    if (import.meta.env.DEV) {
        navigator.serviceWorker.getRegistrations()
            .then(registrations => Promise.all(registrations.map(reg => reg.unregister())))
            .catch(() => {});
        if ('caches' in window) {
            caches.keys()
                .then(names => Promise.all(names.map(name => caches.delete(name))))
                .catch(() => {});
        }
        return;
    }

    window.addEventListener('load', () => {
        const swUrl = `${import.meta.env.BASE_URL}sw.js`;
        navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL })
            .then(reg => console.log('[PWA] Service worker registered:', reg.scope))
            .catch(err => console.error('[PWA] Service worker registration failed:', err));
    });
}

function isOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function requireOnlineStudy() {
    if (isOnline()) return true;
    alert('Studying is paused while offline so every grade can be saved safely. Reconnect, then try again.');
    return false;
}

function updateConnectionStatus() {
    const status = document.getElementById('connection-status');
    const online = isOnline();
    if (status) {
        status.classList.toggle('online', online);
        status.classList.toggle('offline', !online);
        status.querySelector('.connection-status-label').textContent = online ? 'Online' : 'Offline';
        status.title = online
            ? 'Connected — study progress can sync'
            : 'Offline — studying is paused until the connection returns';
    }

    document.getElementById('reveal-btn')?.toggleAttribute('disabled', !online);
    document.querySelectorAll('.grade-btn').forEach(button => {
        button.toggleAttribute('disabled', !online);
    });
    if (!online) {
        document.getElementById('review-due-btn')?.setAttribute('disabled', '');
        document.getElementById('learn-new-btn')?.setAttribute('disabled', '');
    }
}

function setupConnectionStatus() {
    updateConnectionStatus();
    for (const eventName of ['online', 'offline']) {
        window.addEventListener(eventName, () => {
            updateConnectionStatus();
            if (habitSettings) {
                renderReviewButton({ refreshStatus: false }).catch(error =>
                    console.warn('[Main] Failed to refresh study controls after connection change:', error));
            }
        });
    }
}

async function init() {
    console.log('=== INIT START ===');
    // Older releases stored full Markdown blobs in localStorage. Reclaim that
    // space before reviews, stars, and resumable sessions need to persist.
    const evictedLegacyBlobs = evictLegacyBlobLocalStorage();
    if (evictedLegacyBlobs > 0) {
        console.log(`[Storage] Removed ${evictedLegacyBlobs} legacy Markdown cache item(s)`);
    }
    setupThemeToggle();
    configureMobileAppShell();
    setupConnectionStatus();
    registerServiceWorker();
    try {
        await initDB();
        console.log('DB initialized');

        const grid = document.getElementById('topics-grid');
        if (grid) grid.innerHTML = '<div class="loading">Loading collection...</div>';

        const isAuthenticated = githubAuth.isAuthenticated();
        // Fetch the saved scope alongside repository metadata, but do not render
        // columns until both are ready. Otherwise the first paint shows no stars.
        const habitSettingsPromise = getSettings();
        const pausedSessionPromise = getStudySession();

        if (!isAuthenticated) {
            // Seed the example deck on first unlogged visit so new users see
            // something immediately. A separate flag ensures we don't re-add
            // it if the user explicitly removes it later.
            seedExampleRepoOnFirstVisit();

            // Re-fetch any GitHub repos the user added while logged out
            await loadUnloggedGitHubRepos();
        } else {
            // Load user's repos from D1
            console.log('About to load user repos from D1...');
            await loadUserRepos();
            console.log('User repos loaded from D1');
        }

        habitSettings = await habitSettingsPromise;
        pausedPrimaryStudySession = await pausedSessionPromise;
        if (pausedPrimaryStudySession
            && !studySessionMatchesActiveScope(pausedPrimaryStudySession, habitSettings?.activeDecks)) {
            // A session built for an older scope must never override the stars
            // restored on this device (or changed on another signed-in device).
            pausedPrimaryStudySession = null;
            clearStudySession().catch(error => console.warn('[Main] Failed to retire stale study session:', error));
        }

        console.log('About to load repositories...');
        await loadRepositories();
        console.log('Repositories loaded');

        // Render the primary action and streak after the starred scope is shown.
        await renderReviewButton();
        renderPwaInstallPrompt();
        scheduleDailyPreparation();

        // Deep links from reminders enter due review or a persisted session.
        const launchUrl = new URL(window.location);
        const resumeMode = launchUrl.searchParams.get('resume');
        if (['due', 'new'].includes(resumeMode) && pausedPrimaryStudySession?.mode === resumeMode) {
            startPrimaryStudySession(resumeMode);
        } else if (launchUrl.searchParams.get('today') === '1') {
            startPrimaryStudySession('due');
        }

        // On a fresh page load (refresh or direct visit), always land at home —
        // strip our nav params from prior pushState so the breadcrumb resets.
        // Only strip nav params; leave OAuth params (github_token, user, state, …)
        // intact so github-auth.js can complete the callback.
        const url = new URL(window.location);
        let stripped = false;
        for (const key of ['deck', 'path', 'category', 'study', 'file', 'today', 'resume']) {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                stripped = true;
            }
        }
        if (stripped) {
            history.replaceState(null, '', url.pathname + (url.search || ''));
        }

        setupEventListeners();

        // Repo input is available in both states; data source differs.
        // Logged-in: searches the user's own repos. Logged-out: searches the
        // thomasrribeiro-flashcards org's public decks.
        await setupRepoInput();

        if (githubAuth.isAuthenticated()) {
            // Initialize card editor components (logged-in only — they write to GitHub)
            initDeckCreator(onDeckCreated);
            initFolderCreator(onFolderCreated);
            initCardEditor(onCardSaved);
        }

        // Handle browser back/forward navigation
        window.addEventListener('popstate', handlePopState);

        console.log('=== INIT COMPLETE ===');
    } catch (error) {
        console.error('=== INIT ERROR ===', error);
    }
}

const THEME_KEY = 'flashcards_theme';

function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    const button = document.getElementById('theme-toggle');
    if (button) {
        const dark = resolved === 'dark';
        button.textContent = dark ? 'Light mode' : 'Dark mode';
        button.setAttribute('aria-pressed', String(dark));
        button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }
    document.getElementById('theme-color')?.setAttribute('content', resolved === 'dark' ? '#111416' : '#F5C842');
}

function setupThemeToggle() {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(current);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch { /* persistence is optional */ }
        applyTheme(next);
    });
}

/** Keep installed phone launches focused on the study actions, not onboarding. */
function configureMobileAppShell() {
    const compactPhone = Math.min(window.screen?.width || innerWidth, window.screen?.height || innerHeight) <= 600;
    const studyFirst = isStandalone() && compactPhone;
    document.body.classList.toggle('standalone-phone', studyFirst);
    if (!studyFirst) return;

    const open = document.getElementById('mobile-sidebar-open');
    const close = document.getElementById('mobile-sidebar-close');
    const setOpen = expanded => {
        document.body.classList.toggle('mobile-sidebar-expanded', expanded);
        open?.setAttribute('aria-expanded', String(expanded));
        if (expanded) window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    open?.addEventListener('click', () => setOpen(true));
    close?.addEventListener('click', () => setOpen(false));
}

/**
 * Load user's repos from D1 and fetch their cards
 */
async function loadUserRepos() {
    const { loadReposFromD1 } = await import('./storage.js');
    const { loadRepositoryMetadata, removeRepository } = await import('./repo-manager.js');

    const repos = await loadReposFromD1();
    if (!repos || repos.length === 0) {
        console.log('[Main] No repos found in D1');
        return;
    }

    console.log(`[Main] Loading ${repos.length} repos from D1:`, repos.map(r => r.id));

    const failedRepos = [];
    const evicted = [];

    // Load only repo metadata + file trees in parallel. Card bodies are lazy.
    await Promise.all(repos.map(async (repo) => {
        const displayName = repo.id.split('/').pop();
        try {
            await loadRepositoryMetadata(repo.id);
            console.log(`[Main] Loaded repo metadata: ${repo.id}`);
        } catch (error) {
            if (error.status === 404) {
                // Repo is gone or has moved — silently evict the stale D1 entry
                const reason = error.movedTo ? `moved to ${error.movedTo}` : 'not found';
                console.warn(`[Main] Auto-removed stale repo ${repo.id} (${reason})`);
                evicted.push({ id: repo.id, name: displayName, movedTo: error.movedTo || null });
                try { await removeRepository(repo.id); } catch (e) { /* best-effort */ }
            } else {
                // Transient failure (rate limit, auth, network) — keep the row, show placeholder
                console.error(`[Main] Failed to load repo ${repo.id}:`, error);
                failedRepos.push({ id: repo.id, name: displayName, error: error.message });
            }
        }
    }));

    // Stash broken repos and evictions so loadRepositories can surface them
    window.__failedRepos = failedRepos;
    window.__evictedRepos = evicted;

    // Orphan cleanup requires complete card hashes, so it runs only after a
    // repository has been fully loaded for review.
}

const EXAMPLE_REPO_ID = 'thomasrribeiro-flashcards/example';
const EXAMPLE_SEEDED_KEY = 'flashcards_example_seeded';

/**
 * On the very first unlogged visit, add the example deck to the user's
 * list so they see content immediately. The seeded flag is set unconditionally
 * so removing the deck afterwards is respected (no re-seeding on next load).
 */
function seedExampleRepoOnFirstVisit() {
    try {
        if (localStorage.getItem(EXAMPLE_SEEDED_KEY)) return;
        const raw = localStorage.getItem('flashcards_unlogged_repos');
        const list = raw ? JSON.parse(raw) : [];
        if (!list.includes(EXAMPLE_REPO_ID)) {
            list.push(EXAMPLE_REPO_ID);
            localStorage.setItem('flashcards_unlogged_repos', JSON.stringify(list));
        }
        localStorage.setItem(EXAMPLE_SEEDED_KEY, '1');
    } catch (error) {
        console.error('[Main] Failed to seed example repo:', error);
    }
}

/**
 * Re-fetch GitHub repos the user added while logged out.
 * Repo IDs are persisted in localStorage; cards/metadata are not.
 */
async function loadUnloggedGitHubRepos() {
    const { getUnloggedRepoList } = await import('./storage.js');
    const { loadRepositoryMetadata } = await import('./repo-manager.js');

    const ids = getUnloggedRepoList();
    if (ids.length === 0) return;

    console.log(`[Main] Re-fetching ${ids.length} unlogged repos:`, ids);

    const failed = [];

    await Promise.all(ids.map(async (id) => {
        try {
            await loadRepositoryMetadata(id);
        } catch (error) {
            console.error(`[Main] Failed to reload unlogged repo ${id}:`, error);
            failed.push({ id, name: id.split('/').pop(), error: error.message });
        }
    }));

    window.__failedRepos = failed;
}

/**
 * Populate the category filter dropdown from available deck subjects.
 * Preserves the current selection if still valid.
 */
function populateCategoryFilter(decks) {
    const select = document.getElementById('category-filter');
    if (!select) return;

    const subjects = [...new Set(
        decks.map(d => d.subject).filter(s => typeof s === 'string' && s.trim())
    )].sort((a, b) => a.localeCompare(b));

    const prev = select.value;

    select.innerHTML = '<option value="">All categories</option>' +
        subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    // Restore prior selection if it still exists among available subjects
    if (prev && subjects.includes(prev)) {
        select.value = prev;
    } else {
        select.value = '';
    }
}

/**
 * Load and display repositories
 */
async function loadRepositories() {
    const grid = document.getElementById('topics-grid');
    const controlsBar = document.getElementById('controls-bar');

    // Rebuilding the columns after a star change must not jump any of the
    // independently scrolling panes back to the top.
    const previousColumnScroll = grid
        ? [...grid.querySelectorAll('.columns-view .col-pane')].map(pane => ({
            top: pane.scrollTop,
            left: pane.scrollLeft
        }))
        : [];
    const previousColumnsLeft = grid?.querySelector('.columns-view')?.scrollLeft || 0;

    try {
        // Get all data
        console.log('Loading repositories...');
        let allCards = await getAllCards();
        console.log('All cards:', allCards.length);
        const allReviews = await getAllReviews();
        console.log('All reviews:', allReviews.length);
        const allDecks = await getAllDecks();
        console.log('All decks:', allDecks.length);
        let allChapterProgress = await getAllChapterProgress();
        console.log('Chapter progress snapshots:', allChapterProgress.length);

        // D1 is the durable source for chapter completion. Before rendering,
        // explicitly backfill any reviewed/starred chapter whose snapshot is
        // missing or tied to an older GitHub blob.
        if (githubAuth.isAuthenticated()) {
            const targets = chapterProgressTargets(
                allDecks,
                allReviews,
                allChapterProgress,
                resolveActiveScopes(allCards, allDecks)
            );
            if (targets.length > 0) {
                await mapWithConcurrency(targets, 4, async target => {
                    try {
                        await loadRepositoryFiles(target.repo, [target.filepath]);
                    } catch (error) {
                        console.warn('[Main] Failed to backfill chapter progress:', target, error);
                    }
                });
                allCards = await getAllCards();
                const snapshots = targets
                    .map(target => buildChapterProgressSnapshot(
                        allCards,
                        allReviews,
                        target
                    ))
                    .filter(Boolean);
                if (snapshots.length > 0) {
                    await syncChapterProgress(snapshots);
                    allChapterProgress = await getAllChapterProgress();
                    console.log(`[Main] Backfilled ${snapshots.length} chapter progress snapshot(s)`);
                }
            }
        }

        // Clear loading message
        grid.innerHTML = '';

        // Check login status
        const isLoggedIn = githubAuth.isAuthenticated();

        // Filter out local decks when logged in
        let displayDecks = allDecks;
        if (isLoggedIn) {
            displayDecks = allDecks.filter(deck => !deck.id.startsWith('local/'));
            console.log(`[Main] Filtered out local decks. Showing ${displayDecks.length} GitHub decks`);
        }

        // Show message if no decks
        if (displayDecks.length === 0) {
            controlsBar.classList.add('hidden');
            document.getElementById('view-tabs')?.classList.add('hidden');
            if (isLoggedIn) {
                grid.innerHTML = '<div class="loading">Search for a GitHub repository and click + to add it.</div>';
            } else {
                grid.innerHTML = '<div class="loading">No example deck found.</div>';
            }
            return;
        }

        // Show controls when there are decks
        controlsBar.classList.remove('hidden');
        document.getElementById('view-tabs')?.classList.remove('hidden');

        const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
        const breadcrumb = document.getElementById('deck-breadcrumb');

        if (currentCategory === null) {
            // HOME LEVEL: tree (default), columns, or legacy category-card grid
            grid.classList.toggle('tree-mode', deckViewMode === 'tree');
            grid.classList.toggle('columns-mode', deckViewMode === 'columns');
            if (deckViewMode === 'tree') {
                renderDeckTree(displayDecks, allCards, allReviews, searchTerm, grid);
            } else if (deckViewMode === 'columns') {
                renderColumnsView(displayDecks, allCards, allReviews, allChapterProgress, searchTerm, grid, {
                    panes: previousColumnScroll,
                    left: previousColumnsLeft
                });
            } else {
                _renderCategoryGrid(displayDecks, allCards, allReviews, searchTerm, grid);
            }
        } else {
            grid.classList.remove('tree-mode', 'columns-mode');
            // CATEGORY LEVEL: render deck cards for the current category
            const filteredDecks = displayDecks.filter(deck => {
                const subject = subjectSlug(deck.subject);
                return subject === currentCategory;
            });

            for (const deck of filteredDecks) {
                const deckCards = allCards.filter(c => c.deckName === deck.id);
                const deckReviews = allReviews.filter(r => deckCards.some(c => c.hash === r.cardHash));
                grid.appendChild(createDeckCard({
                    ...deck,
                    cards: deckCards,
                    reviews: new Map(deckReviews.map(r => [r.cardHash, r]))
                }));
            }

            // Render placeholders for repos that failed to load
            const failedRepos = window.__failedRepos || [];
            for (const failed of failedRepos) {
                grid.appendChild(createFailedRepoCard(failed));
            }

            renderEvictedNotice();
        }

        updateDeckBreadcrumb();

        // Refresh the Today hero whenever the grid re-renders (no-op until
        // habit settings have loaded in init)
        if (habitSettings) renderReviewButton({ refreshStatus: false });

    } catch (error) {
        console.error('Error loading repositories:', error);
        grid.innerHTML = `
            <div class="loading">
                Error loading repositories. Please check the console for details.
            </div>
        `;
    }
}

// Tree expand state: key -> explicit open/closed. Default: open only for
// subjects/decks that contain active (starred) decks.
const treeExpand = new Map();
function treeIsOpen(key, hasActive) {
    return treeExpand.has(key) ? treeExpand.get(key) : hasActive;
}
function treeToggle(key, hasActive) {
    treeExpand.set(key, !treeIsOpen(key, hasActive));
    loadRepositories();
}

const GAVEL_IMG = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review" style="width:13px;height:13px;">`;
const RESET_IMG = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset" style="width:13px;height:13px;">`;
const BROWSE_IMG = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;

/** Match the lowercase kebab-case convention used by deck names. */
function subjectSlug(subject) {
    return (subject || 'misc')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'misc';
}

/** Progress over a set of cards: retained (reviewed & not due) / total. */
function scopeProgress(cards, reviewMap, now) {
    let due = 0, fresh = 0, retained = 0;
    for (const c of cards) {
        const r = reviewMap.get(c.hash);
        if (!r) fresh++;
        else if (new Date(r.fsrsCard.due) <= now) due++;
        else retained++;
    }
    const total = cards.length;
    const introduced = total - fresh;
    return {
        total,
        due,
        fresh,
        retained,
        introduced,
        pct: total ? Math.round(retained / total * 100) : 0,
        completionPct: total ? Math.round(introduced / total * 100) : 0
    };
}

function treeActionBtn(cls, title, html, onclick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = html;
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onclick(); };
    return b;
}

/**
 * Enter the shared study surface. Renders the scope breadcrumb (with a clickable
 * "home" that returns to the study view).
 * @param {Array<string>} breadcrumb - path segments, first is "home"
 */
function enterStudyArea(breadcrumb) {
    isInStudySession = true;
    setHomeReviewVisible(false);
    document.getElementById('topics-grid')?.classList.add('hidden');
    document.getElementById('dashboard')?.classList.add('hidden');
    document.getElementById('study-area')?.classList.remove('hidden');
    document.getElementById('session-complete')?.classList.add('hidden');

    renderStudyBreadcrumb(breadcrumb || ['home']);

    setupStudyEventListeners();
}

function setHomeReviewVisible(visible) {
    document.getElementById('controls-bar')?.classList.toggle('hidden', !visible);
    document.querySelector('.review-row')?.classList.toggle('hidden', !visible);
}

/** Render the study path with a permanently clickable home segment. */
function renderStudyBreadcrumb(segments) {
    const bc = document.getElementById('study-breadcrumb');
    if (bc) {
        bc.innerHTML = '';
        const root = document.createElement('span');
        root.className = 'study-bc-root';
        root.textContent = '~';
        bc.appendChild(root);
        const rootSep = document.createElement('span');
        rootSep.className = 'study-bc-sep';
        rootSep.textContent = '/';
        bc.appendChild(rootSep);
        (segments || ['home']).forEach((seg, i, arr) => {
            if (i === 0) {
                const home = document.createElement('button');
                home.className = 'study-home-btn';
                home.textContent = seg;
                home.onclick = () => showMainView('decks');
                bc.appendChild(home);
            } else {
                const s = document.createElement('span');
                s.className = 'study-bc-seg';
                s.textContent = seg;
                bc.appendChild(s);
            }
            if (i < arr.length - 1) {
                const sep = document.createElement('span');
                sep.className = 'study-bc-sep';
                sep.textContent = '/';
                bc.appendChild(sep);
            }
        });
    }
}

/** Keep the breadcrumb synchronized with the chapter of the visible card. */
function renderStudyCardBreadcrumb(card) {
    if (!card) return;
    const deckId = card.source?.repo || card.deckName || '';
    const deckName = deckId.split('/').pop();
    const subject = subjectSlug(card.deckMetadata?.subject);
    const chapter = (card.source?.file || '')
        .split('/').pop().replace(/\.md$/, '');
    renderStudyBreadcrumb(['home', subject, deckName, chapter].filter(Boolean));
}

/**
 * Review any scope (subject / deck / chapter / starred): its due + new cards.
 * @param {Function} filterFn - selects the cards in scope
 * @param {string} label - short scope label
 * @param {Array<string>} breadcrumb - path for the study header
 * @param {Array<string>} repoIds - repositories whose card bodies are needed
 */
let scopedReviewLoading = false;

async function startScopedReview(filterFn, label, breadcrumb, repoIds = [], fileSpecs = null) {
    if (!requireOnlineStudy()) return;
    if (scopedReviewLoading) return;
    scopedReviewLoading = true;
    showReviewLoading(label);
    try {
        await ensureRepositoriesLoaded(repoIds, updateReviewLoading, fileSpecs);
    } catch (error) {
        console.error('[Main] Failed to load scoped review:', error);
        alert('Review content could not be loaded. Check your connection and try again.');
        return;
    } finally {
        scopedReviewLoading = false;
        hideReviewLoading();
    }
    const allCards = await getAllCards();
    const allReviews = await getAllReviews();
    const reviewMap = new Map(allReviews.map(r => [r.cardHash, r]));
    const now = new Date();
    const due = [], fresh = [];
    for (const card of allCards) {
        if (!filterFn(card)) continue;
        const r = reviewMap.get(card.hash);
        if (!r) fresh.push({ card, fsrsCard: null, cardHash: card.hash });
        else {
            const d = new Date(r.fsrsCard.due);
            if (d <= now) due.push({ card, fsrsCard: r.fsrsCard, cardHash: card.hash, dueDate: d });
        }
    }
    const queue = [...interleaveDueCards(due), ...fresh];
    if (queue.length === 0) {
        alert('Nothing to review here right now — all caught up.');
        return;
    }
    discardPausedPrimaryStudySession();
    enterStudyArea(breadcrumb || ['home', label]);
    startTodaySession(queue, onSessionComplete, renderStudyCardBreadcrumb);
}

/** Fetch and parse card bodies only when a review action needs them. */
async function ensureRepositoriesLoaded(repoIds, onProgress = null, fileSpecs = null) {
    const unique = [...new Set((repoIds || []).filter(Boolean))];
    if (unique.length === 0) {
        onProgress?.({ completed: 0, total: 0 });
        return;
    }
    const decks = new Map((await getAllDecks()).map(deck => [deck.id, deck]));
    const loadedCards = await getAllCards();
    const loadedFiles = new Set(loadedCards.map(card =>
        `${card.source?.repo || card.deckName}\0${card.source?.file || ''}`));
    const requestedFiles = fileSpecs || unique.filter(repoId => !repoId.startsWith('local/')).flatMap(repoId =>
        (decks.get(repoId)?.files || []).map(file => ({
            repo: repoId,
            path: typeof file === 'string' ? file : file.path
        }))
    );
    const files = requestedFiles.filter(({ repo, path }) =>
        !repo.startsWith('local/') && !loadedFiles.has(`${repo}\0${path}`));
    let completed = 0;
    onProgress?.({ completed, total: files.length });
    await mapWithConcurrency(files, 4, async ({ repo, path }) => {
        await loadRepositoryFiles(repo, [path]);
        completed++;
        onProgress?.({ completed, total: files.length });
    });
}

function showReviewLoading(label) {
    const loader = document.getElementById('review-loading');
    const labelEl = document.getElementById('review-loading-label');
    const count = document.getElementById('review-loading-count');
    const fill = document.getElementById('review-loading-fill');
    if (labelEl) labelEl.textContent = `Loading ${label || 'review'}...`;
    if (count) count.textContent = '0/0';
    if (fill) fill.style.width = '0%';
    loader?.classList.remove('hidden');
}

function updateReviewLoading({ completed, total }) {
    const count = document.getElementById('review-loading-count');
    const fill = document.getElementById('review-loading-fill');
    if (count) count.textContent = `${completed}/${total}`;
    if (fill) fill.style.width = `${total ? Math.round(completed / total * 100) : 100}%`;
}

function hideReviewLoading() {
    document.getElementById('review-loading')?.classList.add('hidden');
}

let chapterBrowserLoading = false;
let chapterBrowserReturnFocus = null;

/**
 * Load one chapter and display every scheduled card with its answer. This is a
 * deliberately read-only path: it never starts a study session or saves an
 * FSRS review.
 */
async function openChapterBrowser({ deckId, file, subject, deckName, chapterName }) {
    if (chapterBrowserLoading) return;
    chapterBrowserLoading = true;
    chapterBrowserReturnFocus = document.activeElement;
    showReviewLoading(`${chapterName} preview`);

    try {
        await ensureRepositoriesLoaded(
            [deckId],
            updateReviewLoading,
            [{ repo: deckId, path: file }]
        );
        const cards = (await getAllCards()).filter(card =>
            (card.source?.repo || card.deckName) === deckId
            && card.source?.file === file
        );
        if (cards.length === 0) {
            alert('This chapter does not contain any flashcards yet.');
            return;
        }

        const modal = document.getElementById('card-browser-modal');
        const title = document.getElementById('card-browser-title');
        const path = document.getElementById('card-browser-path');
        const summary = document.getElementById('card-browser-summary');
        const body = document.getElementById('card-browser-body');
        if (!modal || !title || !path || !summary || !body) return;

        title.textContent = chapterName;
        path.textContent = `~ / ${subject} / ${deckName} / ${chapterName}`;
        summary.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'} · read-only preview · review progress will not change`;
        body.innerHTML = renderBrowsableCards(cards);
        modal.classList.remove('hidden');
        document.getElementById('card-browser-close')?.focus();
    } catch (error) {
        console.error('[Main] Failed to browse chapter:', error);
        alert('The chapter preview could not be loaded. Check your connection and try again.');
    } finally {
        chapterBrowserLoading = false;
        hideReviewLoading();
    }
}

function closeChapterBrowser() {
    const modal = document.getElementById('card-browser-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    const body = document.getElementById('card-browser-body');
    if (body) body.innerHTML = '';
    if (chapterBrowserReturnFocus?.isConnected) chapterBrowserReturnFocus.focus();
    chapterBrowserReturnFocus = null;
}

async function mapWithConcurrency(items, limit, worker) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length) await worker(queue.shift());
    });
    await Promise.all(runners);
}

let dailyPreparationPromise = Promise.resolve();
const NEW_CHAPTER_ROTATION_PREFIX = 'flashcards_last_new_chapter:';

function newChapterRotationKey() {
    const user = githubAuth.getUser();
    return NEW_CHAPTER_ROTATION_PREFIX + (user?.username || user?.id || 'local');
}

function lastNewChapterScope() {
    try { return localStorage.getItem(newChapterRotationKey()); }
    catch { return null; }
}

function rememberNewChapterScope(scope) {
    if (!scope) return;
    try { localStorage.setItem(newChapterRotationKey(), scope); }
    catch { /* rotation is a convenience; studying must still proceed */ }
}

/** Queue preparation serially so star changes never duplicate active fetches. */
function queueDailyPreparation() {
    dailyPreparationPromise = dailyPreparationPromise
        .catch(error => console.warn('[Main] Prior daily preparation failed:', error))
        .then(() => prepareDailyContent());
    return dailyPreparationPromise;
}

function scheduleDailyPreparation() {
    const begin = () => queueDailyPreparation()
        .then(() => renderReviewButton({ refreshStatus: false }))
        .catch(error => console.warn('[Main] Background review preparation failed:', error));
    if ('requestIdleCallback' in window) window.requestIdleCallback(begin, { timeout: 1000 });
    else setTimeout(begin, 0);
}

/**
 * Prepare exact overdue files first, then starred files until today's new-card
 * allowance is satisfied. No unrelated card bodies are downloaded.
 */
async function prepareDailyContent({ includeDue = true, includeNew = true, allowBeyondTarget = false } = {}) {
    const currentSettings = habitSettings;
    const [reviews, decks, status] = await Promise.all([
        getAllReviews(),
        getAllDecks(),
        getHabitStatus()
    ]);
    habitSettings = currentSettings
        ? { ...status.settings, ...currentSettings, activeDecks: currentSettings.activeDecks || [] }
        : status.settings;
    const deckMap = new Map(decks.map(deck => [deck.id, deck]));
    const now = new Date();
    const dueReviews = reviews.filter(review => new Date(review.fsrsCard.due) <= now);
    const allFiles = deck => (deck?.files || [])
        .map(file => typeof file === 'string' ? file : file.path)
        .sort((a, b) => a.localeCompare(b));

    const dueFileKeys = new Map();
    for (const review of dueReviews) {
        if (review.repo && review.filepath) {
            dueFileKeys.set(`${review.repo}\0${review.filepath}`, { repo: review.repo, file: review.filepath });
        } else if (review.repo) {
            for (const file of allFiles(deckMap.get(review.repo))) {
                dueFileKeys.set(`${review.repo}\0${file}`, { repo: review.repo, file });
            }
        } else {
            // Truly legacy local rows cannot be mapped without their hashes.
            for (const deck of decks) for (const file of allFiles(deck)) {
                dueFileKeys.set(`${deck.id}\0${file}`, { repo: deck.id, file });
            }
        }
    }

    if (includeDue) {
        await mapWithConcurrency([...dueFileKeys.values()], 4,
            ({ repo, file }) => loadRepositoryFiles(repo, [file]));
    }

    if (!includeNew) return;

    const active = new Set(habitSettings.activeDecks || []);
    const activeFiles = [];
    for (const scope of active) {
        const split = scope.indexOf(SCOPE_SEP);
        const repo = split >= 0 ? scope.slice(0, split) : scope;
        if (split >= 0) {
            activeFiles.push({ repo, file: scope.slice(split + SCOPE_SEP.length) });
        } else {
            for (const file of allFiles(deckMap.get(repo))) activeFiles.push({ repo, file });
        }
    }

    const orderedActiveFiles = [...new Map(activeFiles.map(spec => [
        `${spec.repo}\0${spec.file}`,
        spec
    ])).values()];
    const previousScope = lastNewChapterScope();
    const previousIndex = orderedActiveFiles.findIndex(({ repo, file }) =>
        `${repo}\0${file}` === previousScope);
    const rotatedActiveFiles = previousIndex >= 0
        ? [
            ...orderedActiveFiles.slice(previousIndex + 1),
            ...orderedActiveFiles.slice(0, previousIndex + 1)
        ]
        : orderedActiveFiles;

    const reviewHashes = new Set(reviews.map(review => review.cardHash));
    const loadedCards = await getAllCards();
    const cardsByFile = new Map();
    for (const card of loadedCards) {
        const key = `${card.source?.repo || card.deckName}\0${card.source?.file || ''}`;
        if (!cardsByFile.has(key)) cardsByFile.set(key, []);
        cardsByFile.get(key).push(card);
    }

    // Fetch only enough to find the next coherent chapter. Previously, unseen
    // cards already cached from the first chapter could prevent a later starred
    // chapter from ever loading, which made inter-session rotation impossible.
    for (const { repo, file } of rotatedActiveFiles) {
        const key = `${repo}\0${file}`;
        let chapterCards = cardsByFile.get(key) || [];
        if (chapterCards.length === 0 && !repo.startsWith('local/')) {
            chapterCards = await loadRepositoryFiles(repo, [file]);
        }
        if (chapterCards.some(card => !reviewHashes.has(card.hash))) break;
    }
}

async function resetScope(specs, message) {
    const ok = await confirmDialog({ title: 'Reset progress', message, confirmText: 'Reset', danger: true });
    if (!ok) return;
    const { refreshDeck } = await import('./storage.js');
    for (const s of specs) await refreshDeck(s.deckId, s.file || null);
    await loadRepositories();
}

async function deleteScope(deckIds, message) {
    const ok = await confirmDialog({ title: 'Remove from collection', message, confirmText: 'Remove', danger: true });
    if (!ok) return;
    for (const id of deckIds) {
        try { await removeRepository(id); } catch (e) { console.error('[Main] delete failed', id, e); }
    }
    await loadRepositories();
}

/**
 * One tree row: name cell (flex, indented by DOM nesting) + fixed-width meta +
 * a fixed 4-column action grid, so meta/% and every action icon line up in
 * columns regardless of nesting depth. Pass null in `actions` for an empty cell.
 */
function treeRow({ caret, name, nameCls, meta, actions, onBody, rowCls, title }) {
    const row = document.createElement('div');
    row.className = 'tree-row ' + (rowCls || '');

    const cell = document.createElement('div');
    cell.className = 'tree-name-cell';
    if (title) cell.title = title;
    if (onBody) cell.onclick = onBody;
    const caretEl = document.createElement('span');
    caretEl.className = 'tree-caret';
    caretEl.textContent = caret == null ? '' : caret;
    const nameEl = document.createElement('span');
    nameEl.className = 'tree-name ' + (nameCls || '');
    nameEl.textContent = name;
    cell.append(caretEl, nameEl);

    const metaEl = document.createElement('span');
    metaEl.className = 'tree-meta';
    metaEl.textContent = meta;

    const acts = document.createElement('div');
    acts.className = 'tree-actions';
    for (const a of actions) {
        if (!a) { const s = document.createElement('span'); s.className = 'tree-act-empty'; acts.appendChild(s); }
        else acts.appendChild(treeActionBtn(a.cls, a.title, a.html, a.onclick));
    }

    row.append(cell, metaEl, acts);
    return row;
}

/**
 * Home-level hierarchical tree: Subject → Deck → Chapter, with connector rails.
 * Stars (Subject/Deck) + gavel + reset at those levels; delete at Subject/Deck.
 * Chapters get gavel + reset. Collapsed by default: subjects auto-expand only
 * when they contain an active deck; decks never auto-expand (leaves stay hidden)
 * unless manually opened or revealed by a search match.
 */
function renderDeckTree(displayDecks, allCards, allReviews, searchTerm, grid) {
    const reviewMap = new Map(allReviews.map(r => [r.cardHash, r]));
    const now = new Date();
    const active = new Set(habitSettings?.activeDecks || []);
    const term = (searchTerm || '').trim().toLowerCase();
    const fileBase = f => f.split('/').pop().replace(/\.md$/, '');

    // Build Subject → Deck → File → cards from loaded cards
    const deckById = new Map(displayDecks.map(d => [d.id, d]));
    const subjects = new Map();
    for (const card of allCards) {
        const deckId = card.source?.repo || card.deckName;
        const deck = deckById.get(deckId);
        if (!deck) continue;
        const subject = subjectSlug(deck.subject);
        if (!subjects.has(subject)) subjects.set(subject, new Map());
        const decks = subjects.get(subject);
        if (!decks.has(deckId)) decks.set(deckId, new Map());
        const file = card.source?.file || 'unknown';
        const files = decks.get(deckId);
        if (!files.has(file)) files.set(file, []);
        files.get(file).push(card);
    }
    const subjectNames = [...subjects.keys()].sort((a, b) =>
        a === 'misc' ? 1 : b === 'misc' ? -1 : a.localeCompare(b));

    grid.innerHTML = '';
    const tree = document.createElement('div');
    tree.className = 'deck-tree';
    let anyShown = false;

    for (const subject of subjectNames) {
        const decks = subjects.get(subject);
        const subjectMatch = term && subject.toLowerCase().includes(term);
        let deckIds = sortDeckIdsByCurriculum(decks.keys(), deckById);
        if (term && !subjectMatch) {
            deckIds = deckIds.filter(id => {
                if (id.split('/').pop().toLowerCase().includes(term)) return true;
                for (const f of decks.get(id).keys()) if (fileBase(f).toLowerCase().includes(term)) return true;
                return false;
            });
        }
        if (deckIds.length === 0) continue;
        anyShown = true;

        const subjCards = deckIds.flatMap(id => [...decks.get(id).values()].flat());
        const prog = scopeProgress(subjCards, reviewMap, now);
        const starState = subjectStarState(deckIds);
        const hasActive = deckIds.some(id => active.has(id));
        const skey = 'subj:' + subject;
        const open = term ? true : treeIsOpen(skey, hasActive);

        const group = document.createElement('div');
        group.className = 'tree-group';
        group.appendChild(treeRow({
            caret: open ? '▾' : '▸',
            name: subject, nameCls: 'tree-subject-name', rowCls: 'tree-subject-row',
            meta: `${deckIds.length} deck${deckIds.length === 1 ? '' : 's'} · ${prog.pct}%`,
            onBody: () => treeToggle(skey, hasActive),
            actions: [
                { cls: 'tree-star tree-star-parent' + (starState === 'none' ? '' : ' active'), title: starState === 'all' ? 'Unfocus subject' : 'Focus all decks in subject', html: subjectStarGlyph(starState), onclick: () => toggleActiveSubject(deckIds) },
                { cls: 'tree-act', title: `Review ${subject} (due + new)`, html: GAVEL_IMG, onclick: () => startScopedReview(c => deckIds.includes(c.source?.repo || c.deckName), subject, null, deckIds) },
                { cls: 'tree-act', title: `Reset all progress in ${subject}`, html: RESET_IMG, onclick: () => resetScope(deckIds.map(id => ({ deckId: id })), `Reset progress for all ${deckIds.length} decks in "${subject}"?`) },
                null // no delete at subject level (a subject isn't a repo)
            ]
        }));

        if (open) {
            const subjChildren = document.createElement('div');
            subjChildren.className = 'tree-children';

            for (const deckId of deckIds) {
                const files = decks.get(deckId);
                const deckName = deckId.split('/').pop();
                const deckMatch = term && deckName.toLowerCase().includes(term);
                const deckCards = [...files.values()].flat();
                const dProg = scopeProgress(deckCards, reviewMap, now);
                const isActive = active.has(deckId);
                const dkey = 'deck:' + deckId;
                const nCh = files.size;

                // Search: only reveal chapters that match (unless deck/subject matched)
                const fileList = [...files.keys()].sort((a, b) => a.localeCompare(b));
                const matchingFiles = (term && !deckMatch && !subjectMatch)
                    ? fileList.filter(f => fileBase(f).toLowerCase().includes(term)) : fileList;
                // Decks never auto-open on active (leaves hidden by default);
                // search opens a deck only to reveal matching chapters.
                const dOpen = term ? (matchingFiles.length > 0 && !deckMatch && !subjectMatch)
                    : treeIsOpen(dkey, false);

                const deckBlock = document.createElement('div');
                deckBlock.className = 'tree-deck-block';
                deckBlock.appendChild(treeRow({
                    caret: dOpen ? '▾' : '▸',
                    name: deckName, rowCls: 'tree-deck-row',
                    meta: `${nCh} chapter${nCh === 1 ? '' : 's'} · ${dProg.pct}%`,
                    onBody: () => treeToggle(dkey, false),
                    actions: [
                        { cls: 'tree-star' + (isActive ? ' active' : ''), title: isActive ? 'Remove from daily focus' : 'Add to daily focus', html: isActive ? '★' : '☆', onclick: () => toggleActiveDeck(deckId) },
                        { cls: 'tree-act', title: 'Review this deck (due + new)', html: GAVEL_IMG, onclick: () => startScopedReview(c => (c.source?.repo || c.deckName) === deckId, deckName, null, [deckId]) },
                        { cls: 'tree-act', title: 'Reset progress in this deck', html: RESET_IMG, onclick: () => resetScope([{ deckId }], `Reset all progress in "${deckName}"?`) },
                        { cls: 'tree-act tree-del', title: 'Remove this deck', html: '×', onclick: () => deleteScope([deckId], `Remove "${deckName}" from your collection?`) }
                    ]
                }));

                if (dOpen) {
                    const deckChildren = document.createElement('div');
                    deckChildren.className = 'tree-children';
                    for (const file of matchingFiles) {
                        const chCards = files.get(file);
                        const cProg = scopeProgress(chCards, reviewMap, now);
                        const chName = fileBase(file);
                        deckChildren.appendChild(treeRow({
                            caret: null,
                            name: chName, nameCls: 'tree-chapter-name', rowCls: 'tree-chapter-row',
                            meta: `${chCards.length} card${chCards.length === 1 ? '' : 's'} · ${cProg.pct}%`,
                            title: 'Review this chapter (due + new)',
                            onBody: () => startScopedReview(c => (c.source?.repo || c.deckName) === deckId && c.source?.file === file, chName, null, [deckId], [{ repo: deckId, path: file }]),
                            actions: [
                                { cls: 'tree-act', title: 'Browse all cards in this chapter (read-only)', html: BROWSE_IMG, onclick: () => openChapterBrowser({ deckId, file, subject, deckName, chapterName: chName }) },
                                { cls: 'tree-act', title: 'Review this chapter (due + new)', html: GAVEL_IMG, onclick: () => startScopedReview(c => (c.source?.repo || c.deckName) === deckId && c.source?.file === file, chName, null, [deckId], [{ repo: deckId, path: file }]) },
                                { cls: 'tree-act', title: 'Reset progress in this chapter', html: RESET_IMG, onclick: () => resetScope([{ deckId, file }], `Reset progress in "${chName}"?`) },
                                null
                            ]
                        }));
                    }
                    deckBlock.appendChild(deckChildren);
                }
                subjChildren.appendChild(deckBlock);
            }
            group.appendChild(subjChildren);
        }
        tree.appendChild(group);
    }

    if (!anyShown) {
        grid.innerHTML = `<div class="loading">${term ? 'No decks match your search.' : 'No decks yet.'}</div>`;
        return;
    }
    grid.appendChild(tree);
    for (const failed of (window.__failedRepos || [])) grid.appendChild(createFailedRepoCard(failed));
    renderEvictedNotice();
}

// ── Columns (Miller / Finder) view ──────────────────────────────────────────

// Selection path for the columns view (persists across re-renders)
let columnsSel = { subject: null, deck: null, chapter: null };

/**
 * One columns row: optional inline star (left), name and compact metadata,
 * then inline action icons (gavel / reset / delete) + a chevron for drillable
 * items.
 */
function colRow({ name, meta, star, actions, hasChildren, selected, onClick }) {
    const row = document.createElement('div');
    row.className = 'col-row' + (selected ? ' selected' : '');
    row.onclick = onClick;

    if (star) {
        const s = document.createElement('button');
        s.className = 'col-star'
            + (star.active ? ' active' : '')
            + (star.complete ? ' complete' : '');
        s.title = star.title;
        s.setAttribute('aria-label', star.title);
        s.textContent = star.glyph;
        s.onclick = (e) => { e.stopPropagation(); star.onClick(); };
        row.appendChild(s);
    } else {
        const sp = document.createElement('span'); sp.className = 'col-star-spacer'; row.appendChild(sp);
    }

    const label = document.createElement('span'); label.className = 'col-label';
    const nm = document.createElement('span');
    nm.className = 'col-name';
    nm.textContent = name;
    // Native tooltip preserves the full subject/deck/chapter name when the
    // flex column has to truncate it with an ellipsis.
    nm.title = name;
    label.appendChild(nm);
    if (meta) {
        const md = document.createElement('span'); md.className = 'col-meta'; md.textContent = meta;
        label.appendChild(md);
    }
    row.appendChild(label);

    const acts = document.createElement('div'); acts.className = 'col-row-actions';
    for (const a of (actions || [])) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'col-act' + (a.danger ? ' col-act-del' : '');
        b.title = a.title;
        b.setAttribute('aria-label', a.title);
        b.innerHTML = a.html;
        b.onclick = (e) => { e.stopPropagation(); a.onClick(); };
        acts.appendChild(b);
    }
    // Chevron only for drillable rows — leaves have nothing to the right
    if (hasChildren) {
        const chev = document.createElement('span');
        chev.className = 'col-chevron';
        chev.textContent = '›';
        acts.appendChild(chev);
    }
    row.appendChild(acts);
    return row;
}

/**
 * Columns view: Subject | Deck | Chapter | (blank filler). Each pane is a pure
 * list with all actions inline; panes scroll vertically on their own; the whole
 * strip scrolls horizontally if it's too wide. Height fits the tallest column
 * up to a max, then that column scrolls.
 */
function renderColumnsView(displayDecks, allCards, allReviews, allChapterProgress, searchTerm, grid, scroll = {}) {
    const scopes = resolveActiveScopes(allCards, displayDecks);
    const term = (searchTerm || '').toLowerCase();
    const fileBase = f => f.split('/').pop().replace(/\.md$/, '');
    const filesOf = decksMap => id => ({ repo: id, files: [...decksMap.get(id).keys()] });
    const reviewMap = new Map(allReviews.map(review => [review.cardHash, review]));
    const reviewedFileKeys = new Set(allReviews
        .filter(review => review.repo && review.filepath)
        .map(review => `${review.repo}\0${review.filepath}`));
    const hasUnmappedReviews = allReviews.some(review => !review.repo || !review.filepath);
    const now = new Date();
    const deckById = new Map(displayDecks.map(deck => [deck.id, deck]));
    const chapterProgressByScope = new Map((allChapterProgress || []).map(progress => [
        chapterScope(progress.repo, progress.filepath),
        progress
    ]));
    const chapterSourceSha = (deckId, file) => {
        const descriptor = (deckById.get(deckId)?.files || []).find(candidate =>
            (typeof candidate === 'string' ? candidate : candidate.path) === file);
        return typeof descriptor === 'string' ? null : descriptor?.sha || null;
    };
    const storedChapterProgress = (deckId, file) => {
        const stored = chapterProgressByScope.get(chapterScope(deckId, file));
        if (!stored) return null;
        const currentSha = chapterSourceSha(deckId, file);
        if (currentSha && stored.sourceSha && currentSha !== stored.sourceSha) return null;
        const total = Math.max(0, Number(stored.totalCards) || 0);
        const reviewed = Math.min(total, Math.max(0, Number(stored.reviewedCards) || 0));
        return {
            completionPct: total ? Math.round(reviewed / total * 100) : 0,
            total,
            fresh: total - reviewed,
            sourceSha: stored.sourceSha || null
        };
    };
    const progressUpdates = [];

    // Build Subject → Deck → File from lightweight Git-tree metadata. Loaded
    // cards are not required to render or search the columns.
    const subjects = new Map();
    for (const deck of displayDecks) {
        const deckId = deck.id;
        const subject = subjectSlug(deck.subject);
        if (!subjects.has(subject)) subjects.set(subject, new Map());
        const decks = subjects.get(subject);
        if (!decks.has(deckId)) decks.set(deckId, new Map());
        const files = decks.get(deckId);
        const metadataFiles = (deck.files || []).map(file => typeof file === 'string' ? file : file.path);
        const loadedCards = allCards.filter(card =>
            (card.source?.repo || card.deckName) === deckId && card.source?.file
        );
        const loadedFiles = loadedCards.map(card => card.source.file);
        for (const file of new Set([...metadataFiles, ...loadedFiles])) {
            if (!files.has(file)) files.set(file, []);
        }
        for (const card of loadedCards) files.get(card.source.file).push(card);
    }
    const subjectNames = [...subjects.keys()].sort((a, b) => a === 'misc' ? 1 : b === 'misc' ? -1 : a.localeCompare(b));
    const completedActiveScopes = new Set();
    for (const decks of subjects.values()) {
        for (const [deckId, files] of decks) {
            for (const [file, cards] of files) {
                const scope = chapterScope(deckId, file);
                let savedProgress = storedChapterProgress(deckId, file);
                if (cards.length > 0) {
                    const progress = scopeProgress(cards, reviewMap, now);
                    const sourceSha = cards[0]?.source?.sha || chapterSourceSha(deckId, file);
                    const nextSnapshot = {
                        repo: deckId,
                        filepath: file,
                        sourceSha,
                        totalCards: progress.total,
                        reviewedCards: progress.introduced
                    };
                    const stored = chapterProgressByScope.get(scope);
                    if (!stored
                        || stored.sourceSha !== nextSnapshot.sourceSha
                        || Number(stored.totalCards) !== nextSnapshot.totalCards
                        || Number(stored.reviewedCards) !== nextSnapshot.reviewedCards) {
                        progressUpdates.push(nextSnapshot);
                    }
                    savedProgress = progress;
                }
                if (chapterIsActive(scopes, deckId, file)
                    && savedProgress?.total > 0
                    && savedProgress.fresh === 0) {
                    completedActiveScopes.add(scope);
                }
            }
        }
    }
    if (progressUpdates.length > 0) {
        syncChapterProgress(progressUpdates)
            .catch(error => console.warn('[Main] Failed to persist chapter progress:', error));
    }

    const sortedDeckIds = subject =>
        sortDeckIdsByCurriculum(subjects.get(subject).keys(), deckById);
    const matchingDecks = new Map(subjectNames.map(subject => [
        subject,
        sortedDeckIds(subject).filter(id => id.split('/').pop().toLowerCase().includes(term))
    ]));
    const visibleSubjectNames = term
        ? subjectNames.filter(subject => matchingDecks.get(subject).length > 0)
        : subjectNames;

    // Open the first starred chapter whenever the view has no selection. This
    // deliberately keeps trying across startup renders: repository metadata
    // can arrive before the restored starred scope. Once a path is selected,
    // later renders preserve the user's navigation.
    if (!columnsSel.subject && !term) {
        starredChapter:
        for (const subject of subjectNames) {
            const decks = subjects.get(subject);
            for (const deckId of sortedDeckIds(subject)) {
                const files = [...decks.get(deckId).keys()].sort((a, b) => a.localeCompare(b));
                for (const file of files) {
                    const scope = chapterScope(deckId, file);
                    if (!chapterIsActive(scopes, deckId, file) || completedActiveScopes.has(scope)) continue;
                    columnsSel = { subject, deck: deckId, chapter: file };
                    break starredChapter;
                }
            }
        }
    }

    // Prune a stale selection (e.g. after a delete).
    if (columnsSel.subject && !subjects.has(columnsSel.subject)) columnsSel = { subject: null, deck: null, chapter: null };
    if (columnsSel.deck && !subjects.get(columnsSel.subject)?.has(columnsSel.deck)) { columnsSel.deck = null; columnsSel.chapter = null; }
    if (columnsSel.chapter && !subjects.get(columnsSel.subject)?.get(columnsSel.deck)?.has(columnsSel.chapter)) columnsSel.chapter = null;

    // Search is global across deck names. Keep every subject containing a
    // match, and default the remaining panes to the first matching deck.
    if (term) {
        if (!visibleSubjectNames.includes(columnsSel.subject)) {
            columnsSel = { subject: visibleSubjectNames[0] || null, deck: null, chapter: null };
        }
        const subjectMatches = columnsSel.subject ? matchingDecks.get(columnsSel.subject) || [] : [];
        if (!subjectMatches.includes(columnsSel.deck)) {
            columnsSel.deck = subjectMatches[0] || null;
            columnsSel.chapter = null;
        }
    }

    grid.innerHTML = '';
    if (subjectNames.length === 0) { grid.innerHTML = `<div class="loading">No decks yet.</div>`; return; }

    const wrap = document.createElement('div');
    wrap.className = 'columns-view';
    const makePane = (rows, label) => {
        const pane = document.createElement('div');
        pane.className = 'col-pane';
        const heading = document.createElement('div');
        heading.className = 'col-pane-label';
        heading.textContent = label;
        pane.appendChild(heading);
        if (rows.length === 0) { const e = document.createElement('div'); e.className = 'col-empty'; e.textContent = term ? 'No matches' : ''; pane.appendChild(e); }
        rows.forEach(r => pane.appendChild(r));
        return pane;
    };

    // Pane 1 — subjects
    const p1 = visibleSubjectNames
        .map(subject => {
            const decks = subjects.get(subject);
            const deckIds = [...decks.keys()];
            const deckFiles = deckIds.map(filesOf(decks));
            const starState = scopeStarState(scopes, deckFiles, completedActiveScopes);
            return colRow({
                name: subject,
                star: { glyph: subjectStarGlyph(starState), active: starState !== 'none', title: starState === 'all' ? 'Unfocus subject' : 'Focus all decks in subject', onClick: () => toggleScopes(deckFiles) },
                actions: [
                    { html: GAVEL_IMG, title: `Review ${subject} (due + new)`, onClick: () => startScopedReview(c => deckIds.includes(c.source?.repo || c.deckName), subject, ['home', subject], deckIds) }
                ],
                hasChildren: true, selected: columnsSel.subject === subject,
                onClick: () => { columnsSel = { subject, deck: null, chapter: null }; loadRepositories(); }
            });
        });
    wrap.appendChild(makePane(p1, 'Subjects'));

    // Pane 2 — decks in the selected subject (blank until a subject is picked)
    let p2 = [];
    if (columnsSel.subject && subjects.has(columnsSel.subject)) {
        const decks = subjects.get(columnsSel.subject);
        const deckIds = term ? matchingDecks.get(columnsSel.subject) : sortedDeckIds(columnsSel.subject);
        p2 = deckIds.map(deckId => {
            const deckName = deckId.split('/').pop();
            const deckFiles = [filesOf(decks)(deckId)];
            const starState = scopeStarState(scopes, deckFiles, completedActiveScopes);
            return colRow({
                name: deckName,
                star: { glyph: subjectStarGlyph(starState), active: starState !== 'none', title: starState === 'all' ? 'Remove deck from daily focus' : 'Add deck to daily focus', onClick: () => toggleScopes(deckFiles) },
                actions: [
                    { html: GAVEL_IMG, title: 'Review this deck (due + new)', onClick: () => startScopedReview(c => (c.source?.repo || c.deckName) === deckId, deckName, ['home', columnsSel.subject, deckName], [deckId]) },
                    { html: RESET_IMG, title: 'Reset progress in this deck', onClick: () => resetScope([{ deckId }], `Reset all progress in "${deckName}"?`) },
                    { html: '×', danger: true, title: 'Remove this deck', onClick: () => deleteScope([deckId], `Remove "${deckName}" from your collection?`) }
                ],
                hasChildren: true, selected: columnsSel.deck === deckId,
                onClick: () => { columnsSel = { subject: columnsSel.subject, deck: deckId, chapter: null }; loadRepositories(); }
            });
        });
    }
    wrap.appendChild(makePane(p2, 'Decks'));

    // Pane 3 — chapters in the selected deck (blank until a deck is picked)
    let p3 = [];
    if (columnsSel.subject && columnsSel.deck && subjects.get(columnsSel.subject)?.has(columnsSel.deck)) {
        const deckId = columnsSel.deck;
        const files = subjects.get(columnsSel.subject).get(deckId);
        const fileList = [...files.keys()].sort((a, b) => a.localeCompare(b));
        const deckName = deckId.split('/').pop();
        p3 = fileList.map(file => {
            const chName = fileBase(file);
            const cards = files.get(file);
            const progress = scopeProgress(cards, reviewMap, now);
            const scope = chapterScope(deckId, file);
            const savedProgress = cards.length > 0
                ? progress
                : storedChapterProgress(deckId, file);
            const completed = savedProgress?.completionPct || 0;
            const review = () => startScopedReview(c => (c.source?.repo || c.deckName) === deckId && c.source?.file === file, chName, ['home', columnsSel.subject, deckName, chName], [deckId], [{ repo: deckId, path: file }]);
            const browse = () => openChapterBrowser({
                deckId,
                file,
                subject: columnsSel.subject,
                deckName,
                chapterName: chName
            });
            const chActive = chapterIsActive(scopes, deckId, file);
            const chComplete = savedProgress?.total > 0 && savedProgress.fresh === 0;
            const progressPending = cards.length === 0
                && !savedProgress
                && (chActive || reviewedFileKeys.has(scope) || hasUnmappedReviews);
            return colRow({
                name: chName,
                meta: progressPending ? '(…)' : `(${completed}%)`,
                star: {
                    glyph: chComplete ? '✓' : chActive ? '★' : '☆',
                    active: chActive,
                    complete: chComplete,
                    title: chComplete
                        ? chActive
                            ? 'Completed — remove chapter from daily focus'
                            : 'Completed — add chapter to daily focus'
                        : chActive
                            ? 'Remove chapter from daily focus'
                            : 'Add chapter to daily focus',
                    onClick: () => toggleChapterScope(deckId, file)
                },
                actions: [
                    { html: BROWSE_IMG, title: 'Browse all cards in this chapter (read-only)', onClick: browse },
                    { html: GAVEL_IMG, title: 'Review this chapter (due + new)', onClick: review },
                    { html: RESET_IMG, title: 'Reset progress in this chapter', onClick: () => resetScope([{ deckId, file }], `Reset progress in "${chName}"?`) }
                ],
                hasChildren: false, selected: columnsSel.chapter === file,
                onClick: review
            });
        });
    }
    wrap.appendChild(makePane(p3, 'Chapters'));

    grid.appendChild(wrap);
    wrap.scrollLeft = scroll.left || 0;
    [...wrap.querySelectorAll('.col-pane')].forEach((pane, index) => {
        const saved = scroll.panes?.[index];
        if (!saved) return;
        pane.scrollTop = saved.top;
        pane.scrollLeft = saved.left;
    });
    for (const failed of (window.__failedRepos || [])) grid.appendChild(createFailedRepoCard(failed));
    renderEvictedNotice();

}

/**
 * Render the home-level category grid (legacy; kept for reference/fallback)
 */
function _renderCategoryGrid(displayDecks, allCards, allReviews, searchTerm, grid) {
    // When unlogged, surface local/* decks (the example deck) directly on the
    // front page instead of burying them inside a "Misc" folder.
    const isLoggedIn = githubAuth.isAuthenticated();
    const flatDecks = isLoggedIn ? [] : displayDecks.filter(d => d.id.startsWith('local/'));
    const groupedDecks = isLoggedIn ? displayDecks : displayDecks.filter(d => !d.id.startsWith('local/'));

    // Group decks by subject
    const categoryMap = new Map();
    for (const deck of groupedDecks) {
        const subject = subjectSlug(deck.subject);
        if (!categoryMap.has(subject)) categoryMap.set(subject, []);
        categoryMap.get(subject).push(deck);
    }

    // Named categories alphabetically, misc last
    const sorted = [...categoryMap.keys()].sort((a, b) => {
        if (a === 'misc') return 1;
        if (b === 'misc') return -1;
        return a.localeCompare(b);
    });

    const filteredCategories = searchTerm
        ? sorted.filter(name => name.toLowerCase().includes(searchTerm))
        : sorted;

    const filteredFlatDecks = searchTerm
        ? flatDecks.filter(d => d.id.split('/').pop().toLowerCase().includes(searchTerm))
        : flatDecks;

    if (filteredCategories.length === 0 && filteredFlatDecks.length === 0) {
        grid.innerHTML = '<div class="loading">No matches.</div>';
        return;
    }

    // Render flat (ungrouped) decks first
    for (const deck of filteredFlatDecks) {
        const deckCards = allCards.filter(c => c.deckName === deck.id);
        const deckReviews = allReviews.filter(r => deckCards.some(c => c.hash === r.cardHash));
        grid.appendChild(createDeckCard({
            ...deck,
            cards: deckCards,
            reviews: new Map(deckReviews.map(r => [r.cardHash, r]))
        }));
    }

    for (const categoryName of filteredCategories) {
        grid.appendChild(createCategoryCard(categoryName, categoryMap.get(categoryName), allCards, allReviews));
    }

    // Failed/evicted repos show at home level in Misc area
    renderEvictedNotice();
    updateDeckBreadcrumb();
}

/**
 * Create a category folder card (aggregate of all decks in that category)
 */
function createCategoryCard(categoryName, decks, allCards, allReviews) {
    let totalCards = 0;
    let reviewedCards = 0;
    let dueCards = 0;
    const now = new Date();

    for (const deck of decks) {
        const deckCards = allCards.filter(c => c.deckName === deck.id);
        totalCards += deckCards.length;

        const deckReviews = allReviews.filter(r => deckCards.some(c => c.hash === r.cardHash));
        reviewedCards += deckReviews.length;

        const newCount = deckCards.length - deckReviews.length;
        dueCards += newCount;
        deckReviews.forEach(r => {
            if (new Date(r.fsrsCard.due) <= now) dueCards++;
        });
    }

    const retainedCards = totalCards - dueCards;
    const progressPercent = totalCards > 0 ? Math.round((retainedCards / totalCards) * 100) : 0;
    const deckCount = decks.length;
    const description = `${deckCount} deck${deckCount !== 1 ? 's' : ''} · ${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.cursor = 'pointer';
    card.onclick = () => navigateToCategory(categoryName);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Parent star: focus/unfocus all decks in this subject
    const deckIds = decks.map(d => d.id);
    const starState = subjectStarState(deckIds);
    const starBtn = document.createElement('button');
    starBtn.className = 'card-star-btn' + (starState === 'none' ? '' : ' active');
    starBtn.title = starState === 'all' ? 'Unfocus this whole subject' : 'Focus all decks in this subject';
    starBtn.textContent = subjectStarGlyph(starState);
    starBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleActiveSubject(deckIds); };
    btnContainer.appendChild(starBtn);

    // Review all decks in this subject (due + new)
    const catGavel = document.createElement('button');
    catGavel.className = 'card-review-btn';
    catGavel.title = `Review ${categoryName} (due + new)`;
    catGavel.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    catGavel.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startScopedReview(c => deckIds.includes(c.source?.repo || c.deckName), categoryName, null, deckIds);
    };
    btnContainer.appendChild(catGavel);

    // Reset all decks in category
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress for all decks in this category';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirmDialog({
            title: 'Reset category',
            message: `Reset all ${totalCards} card${totalCards !== 1 ? 's' : ''} in "${categoryName}"? This marks everything as new.`,
            confirmText: 'Reset',
            danger: true,
        });
        if (ok) {
            for (const deck of decks) await resetDeck(deck.id);
            await loadRepositories();
        }
    };
    btnContainer.appendChild(resetBtn);

    // No delete at the subject level: a subject is just a grouping, not a repo.
    // Removal happens per-deck (each deck is a GitHub repo).

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(categoryName)}</h3>
        <p class="project-description">${escapeHtml(description)}</p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Navigate into a category folder
 */
function navigateToCategory(categoryName) {
    currentCategory = categoryName;

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const url = new URL(window.location);
    url.searchParams.set('category', categoryName);
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    history.pushState({ category: categoryName }, '', url);

    updateDeckBreadcrumb();
    loadRepositories();
}

/**
 * Exit category view back to home (category grid)
 */
function exitCategoryNavigation() {
    currentCategory = null;

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const url = new URL(window.location);
    url.searchParams.delete('category');
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    history.pushState({}, '', url);

    updateDeckBreadcrumb();
    loadRepositories();
}

/**
 * Exit deck view back to the category's deck list (stay inside category)
 */
function exitToCategoryView() {
    currentDeck = null;
    currentPath = [];
    folderHierarchy = null;
    allReviewsCache = null;

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const url = new URL(window.location);
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    if (currentCategory) url.searchParams.set('category', currentCategory);
    history.pushState({ category: currentCategory }, '', url);

    updateDeckBreadcrumb();
    loadRepositories();
}

/**
 * Create a deck card element
 */
function createDeckCard(deck) {
    const totalCards = deck.cards.length;
    const reviewedCards = deck.reviews.size;

    // Count new cards (never reviewed) - these are always due
    const newCards = totalCards - reviewedCards;

    // Count due cards (reviewed cards that are due now)
    const now = new Date();
    let dueReviewedCards = 0;
    deck.reviews.forEach(review => {
        if (new Date(review.fsrsCard.due) <= now) {
            dueReviewedCards++;
        }
    });

    // Total due = new cards + reviewed cards that are due
    const dueCards = newCards + dueReviewedCards;

    const card = document.createElement('div');

    // All decks can have hierarchy/modal navigation
    const isLocalRepo = deck.id.startsWith('local/');

    card.className = 'project-card';

    // All decks are clickable for inline navigation
    card.style.cursor = 'pointer';
    card.onclick = () => navigateToDeck(deck);

    // Extract repo name from deck.id (e.g., "owner/repo" -> "repo", "local/my-deck" -> "my-deck")
    const displayName = deck.id.includes('/') ? deck.id.split('/').pop() : deck.id;
    // Show only card count in description (due count shown in stats below)
    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Active-deck (focus) star toggle — active decks feed the Today session
    const isActive = (habitSettings?.activeDecks || []).includes(deck.id);
    const starBtn = document.createElement('button');
    starBtn.className = 'card-star-btn' + (isActive ? ' active' : '');
    starBtn.title = isActive ? 'Remove from daily focus' : 'Add to daily focus';
    starBtn.textContent = isActive ? '★' : '☆';
    starBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleActiveDeck(deck.id);
    };
    btnContainer.appendChild(starBtn);

    // Add reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirmDialog({
            title: 'Reset deck',
            message: `Reset all cards in "${displayName}"? This will mark all cards as new.`,
            confirmText: 'Reset',
            danger: true,
        });
        if (ok) {
            await resetDeck(deck.id);
            await loadRepositories();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Add review button (gavel)
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'card-review-btn';
    reviewBtn.title = 'Review';
    reviewBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    reviewBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Navigate into deck first, then start study session for entire deck
        await navigateToDeck(deck, [], true);
        startStudySession(deck.id, null, 'all');
    };
    btnContainer.appendChild(reviewBtn);

    // Show delete button for any GitHub-backed deck (local/* example decks ship
    // with the app and can't be removed). Unlogged users can also remove repos
    // they added — the removal updates flashcards_unlogged_repos in localStorage.
    const isLocalDeck = deck.id.startsWith('local/');
    if (!isLocalDeck) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.title = 'Remove from collection';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const ok = await confirmDialog({
                title: 'Remove deck',
                message: `Remove "${displayName}" from your collection?`,
                confirmText: 'Remove',
                danger: true,
            });
            if (ok) {
                try {
                    await removeRepository(deck.id);
                    await loadRepositories();
                } catch (error) {
                    console.error('[Main] Error removing deck:', error);
                    alert(`Failed to remove deck: ${error.message}`);
                }
            }
        };
        btnContainer.appendChild(deleteBtn);
    }

    // Retained = reviewed cards whose due date is still in the future
    const retainedCards = reviewedCards - dueReviewedCards;
    const progressPercent = totalCards > 0 ? Math.round((retainedCards / totalCards) * 100) : 0;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(displayName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Create a placeholder card for a repo that failed to load (non-404 error)
 */
function createFailedRepoCard(failed) {
    const card = document.createElement('div');
    card.className = 'project-card';

    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-delete-btn';
    deleteBtn.title = 'Remove from list';
    deleteBtn.innerHTML = '×';
    deleteBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirmDialog({
            title: 'Remove deck',
            message: `Remove "${failed.name}" from your list? The deck failed to load and will stop appearing.`,
            confirmText: 'Remove',
            danger: true,
        });
        if (ok) {
            try {
                await removeRepository(failed.id);
                window.__failedRepos = (window.__failedRepos || []).filter(r => r.id !== failed.id);
                await loadRepositories();
            } catch (err) {
                alert(`Failed to remove: ${err.message}`);
            }
        }
    };
    btnContainer.appendChild(deleteBtn);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(failed.name)}</h3>
        <p class="project-description" style="color:#c00">Failed to load</p>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Render a dismissible notice above the grid listing repos that were auto-evicted
 * (either deleted on GitHub or transferred to a new owner/org).
 */
function renderEvictedNotice() {
    const evicted = window.__evictedRepos || [];
    if (evicted.length === 0) return;

    const grid = document.getElementById('topics-grid');
    if (!grid) return;

    // Avoid stacking notices if this function runs multiple times
    const existing = document.getElementById('evicted-notice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.id = 'evicted-notice';
    notice.className = 'evicted-notice';

    const items = evicted.map(r => {
        if (r.movedTo) return `<li><code>${escapeHtml(r.id)}</code> → <code>${escapeHtml(r.movedTo)}</code></li>`;
        return `<li><code>${escapeHtml(r.id)}</code></li>`;
    }).join('');

    notice.innerHTML = `
        <div class="evicted-notice-body">
            <strong>Removed ${evicted.length} deck${evicted.length !== 1 ? 's' : ''} that could no longer be loaded:</strong>
            <ul>${items}</ul>
            <p class="evicted-notice-hint">These were transferred or deleted. Re-add them from their new location if needed.</p>
        </div>
        <button class="evicted-notice-dismiss" title="Dismiss">×</button>
    `;

    notice.querySelector('.evicted-notice-dismiss').addEventListener('click', () => {
        window.__evictedRepos = [];
        notice.remove();
    });

    grid.parentNode.insertBefore(notice, grid);
    window.__evictedRepos = [];
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    const addBtn = document.getElementById('add-repo-btn');
    const repoInput = document.getElementById('github-repo-input');
    const createDeckBtn = document.getElementById('create-deck-btn');

    // Add repository when + button is clicked
    if (addBtn) {
        addBtn.addEventListener('click', () => handleAddRepository());
    }

    // Add repository when Enter is pressed in input
    if (repoInput) {
        repoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAddRepository();
            }
        });
    }

    // Create Deck button
    if (createDeckBtn) {
        createDeckBtn.addEventListener('click', () => openDeckCreator());
    }

    // Collapsible sections
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.dataset.section;
            const content = document.getElementById(`${section}-content`);
            const icon = header.querySelector('.toggle-icon');

            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.style.transform = 'rotate(90deg)';
            } else {
                content.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
        });
    });

    // Search handler - context-aware (decks at home, folders/files inside a deck)
    const searchInput = document.getElementById('search-input');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            // Tree view filters the tree in place; only the card view's
            // in-deck level uses renderCurrentLevel.
            if (deckViewMode === 'cards' && currentDeck) {
                renderCurrentLevel();
            } else {
                loadRepositories();
            }
        });
    }

    // Separate time-sensitive reviews from deliberate new learning.
    const reviewDueBtn = document.getElementById('review-due-btn');
    const learnNewBtn = document.getElementById('learn-new-btn');
    if (reviewDueBtn) {
        reviewDueBtn.addEventListener('click', () => {
            if (!reviewDueBtn.disabled) startPrimaryStudySession('due');
        });
    }
    if (learnNewBtn) {
        learnNewBtn.addEventListener('click', () => {
            if (!learnNewBtn.disabled) startPrimaryStudySession('new', {
                allowBeyondTarget: learnNewBtn.dataset.allowBeyondTarget === 'true'
            });
        });
    }

    document.getElementById('study-settings-btn')?.addEventListener('click', openStudySettings);
    document.getElementById('study-settings-cancel')?.addEventListener('click', closeStudySettings);
    document.getElementById('study-settings-close')?.addEventListener('click', closeStudySettings);
    document.querySelector('#study-settings-modal .modal-overlay')?.addEventListener('click', closeStudySettings);
    document.getElementById('daily-new-target')?.addEventListener('change', reflectCustomTargetField);
    document.getElementById('study-settings-panel')?.addEventListener('submit', saveStudySettingsFromForm);
    document.getElementById('pwa-install-btn')?.addEventListener('click', openPwaInstallGuide);
    document.getElementById('pwa-install-close')?.addEventListener('click', closePwaInstallGuide);
    document.getElementById('pwa-install-done')?.addEventListener('click', closePwaInstallGuide);
    document.querySelector('#pwa-install-modal .modal-overlay')?.addEventListener('click', closePwaInstallGuide);
    document.getElementById('card-browser-close')?.addEventListener('click', closeChapterBrowser);
    document.querySelector('#card-browser-modal .modal-overlay')?.addEventListener('click', closeChapterBrowser);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!document.getElementById('study-settings-modal')?.classList.contains('hidden')) closeStudySettings();
            if (!document.getElementById('pwa-install-modal')?.classList.contains('hidden')) closePwaInstallGuide();
            if (!document.getElementById('card-browser-modal')?.classList.contains('hidden')) closeChapterBrowser();
        }
    });
    document.getElementById('session-back-home')?.addEventListener('click', () => showMainView('decks'));
    document.getElementById('session-learn-more')?.addEventListener('click', event => {
        startPrimaryStudySession('new', {
            allowBeyondTarget: event.currentTarget.dataset.allowBeyondTarget === 'true'
        });
    });

    // Tree / Cards / Columns view toggle
    document.getElementById('view-tree')?.addEventListener('click', () => setDeckView('tree'));
    document.getElementById('view-cards')?.addEventListener('click', () => setDeckView('cards'));
    document.getElementById('view-columns')?.addEventListener('click', () => setDeckView('columns'));
    reflectViewToggle();

    // View tabs: Study / Progress
    const tabDecks = document.getElementById('tab-decks');
    const tabProgress = document.getElementById('tab-progress');
    if (tabDecks) tabDecks.addEventListener('click', () => showMainView('decks'));
    if (tabProgress) tabProgress.addEventListener('click', () => showMainView('progress'));

    // Back-to-decks button shown during a study session
    const studyBackBtn = document.getElementById('study-back-btn');
    if (studyBackBtn) studyBackBtn.addEventListener('click', () => showMainView('decks'));
}

/**
 * Deck view mode: 'tree' (default), 'cards' (category grid + breadcrumb),
 * or 'columns' (Miller/Finder-style panes).
 */
const DECK_VIEW_KEY = 'flashcards_deck_view';
// Columns is the single active view. Tree/Cards renderers are kept in the code
// for potential revert but are no longer reachable (the toggle was removed).
let deckViewMode = 'columns';

function reflectViewToggle() {
    document.getElementById('view-tree')?.classList.toggle('active', deckViewMode === 'tree');
    document.getElementById('view-cards')?.classList.toggle('active', deckViewMode === 'cards');
    document.getElementById('view-columns')?.classList.toggle('active', deckViewMode === 'columns');
}

function setDeckView(mode) {
    deckViewMode = (mode === 'cards' || mode === 'columns') ? mode : 'tree';
    try { localStorage.setItem(DECK_VIEW_KEY, deckViewMode); } catch { /* ignore */ }
    reflectViewToggle();
    // Switching view resets to home so navigation state stays coherent
    currentDeck = null;
    currentCategory = null;
    loadRepositories();
}

/**
 * Central switcher between the Study view and the Progress dashboard.
 * Exits any in-progress study session first so returning is always clean.
 */
let currentMainView = 'decks';
async function showMainView(view) {
    const dashboard = document.getElementById('dashboard');
    const grid = document.getElementById('topics-grid');
    const hero = document.getElementById('today-hero');
    const breadcrumb = document.getElementById('deck-breadcrumb');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');
    const tabDecks = document.getElementById('tab-decks');
    const tabProgress = document.getElementById('tab-progress');

    // Leaving the drill surface pauses an unfinished primary session. Decks
    // and Progress are both temporary views, so neither should discard work.
    if (isInStudySession) {
        const paused = await pausePrimaryStudySession();
        if (!paused) await exitStudySession(true);
    }

    currentMainView = view;
    tabDecks?.classList.toggle('active', view === 'decks');
    tabProgress?.classList.toggle('active', view === 'progress');

    const controlsBar = document.getElementById('controls-bar');
    setHomeReviewVisible(view === 'decks');

    if (view === 'progress') {
        grid?.classList.add('hidden');
        hero?.classList.add('hidden');
        breadcrumb?.classList.add('hidden');
        studyArea?.classList.add('hidden');
        sessionComplete?.classList.add('hidden');
        controlsBar?.classList.add('hidden');   // Review + toggle + search belong to Decks
        dashboard?.classList.remove('hidden');
        await renderDashboard();
    } else {
        dashboard?.classList.add('hidden');
        studyArea?.classList.add('hidden');
        sessionComplete?.classList.add('hidden');
        controlsBar?.classList.remove('hidden');
        grid?.classList.remove('hidden');
        updateDeckBreadcrumb();
        // The existing columns are a snapshot of review state from their last
        // render. Grades are saved immediately, so rebuild from the current
        // in-memory card/review caches whenever Decks becomes visible. Without
        // this, chapter completion percentages remain stale until a hard reload.
        await loadRepositories();
    }
}

/**
 * Setup repository input with dropdown.
 * Logged-in: dropdown shows the user's own repos.
 * Logged-out: dropdown shows public decks from the thomasrribeiro-flashcards org.
 */
const PUBLIC_DECKS_ORG = 'thomasrribeiro-flashcards';

async function setupRepoInput() {
    const repoInput = document.getElementById('github-repo-input');
    const suggestions = document.getElementById('repo-suggestions');
    if (!repoInput || !suggestions) return;

    let availableRepos = [];
    let selectedIndex = -1;

    repoInput.value = '';
    repoInput.placeholder = 'Add decks...';

    // Signed-in users see repositories available to their GitHub account
    // (including private repositories) alongside the public deck catalog.
    // Keep either source useful when the other one is temporarily unavailable.
    const sources = [
        { name: `public decks from ${PUBLIC_DECKS_ORG}`, promise: getOrgRepositories(PUBLIC_DECKS_ORG) }
    ];
    if (githubAuth.isAuthenticated()) {
        sources.unshift({ name: 'authenticated GitHub repositories', promise: getUserRepositories() });
    }
    const results = await Promise.allSettled(sources.map(source => source.promise));
    const repositoryLists = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            repositoryLists.push(result.value);
            console.log(`[Main] Loaded ${result.value.length} ${sources[index].name}`);
        } else {
            console.error(`[Main] Failed to load ${sources[index].name}:`, result.reason);
        }
    });
    availableRepos = mergeRepositoryLists(...repositoryLists);
    if (githubAuth.isAuthenticated()) {
        console.log(`[Main] ${availableRepos.length} unique repositories available in add-deck search`);
    }

    // Input event for filtering
    repoInput.addEventListener('input', () => {
        const value = repoInput.value;
        updateDropdownDisplay(availableRepos, value, suggestions);
        selectedIndex = -1;
    });

    // Focus event to show dropdown
    repoInput.addEventListener('focus', () => {
        if (availableRepos.length > 0) {
            updateDropdownDisplay(availableRepos, repoInput.value, suggestions);
        }
    });

    // Click outside to hide dropdown
    document.addEventListener('click', (e) => {
        if (!repoInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.classList.add('hidden');
        }
    });

    // Keyboard navigation
    repoInput.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('.repo-suggestion-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelectedItem(items, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelectedItem(items, selectedIndex);
        } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < items.length) {
            e.preventDefault();
            const selectedRepo = items[selectedIndex].dataset.repo;
            repoInput.value = selectedRepo;
            suggestions.classList.add('hidden');
            selectedIndex = -1;
        } else if (e.key === 'Escape') {
            suggestions.classList.add('hidden');
            selectedIndex = -1;
        }
    });
}

/**
 * Update dropdown display based on filter
 */
function updateDropdownDisplay(repos, filter, container) {
    const filterLower = filter.toLowerCase();

    // Filter repos based on input
    const filteredRepos = repos.filter(repo => {
        const fullName = repo.full_name.toLowerCase();
        const name = repo.name.toLowerCase();
        return fullName.includes(filterLower) || name.includes(filterLower);
    });

    if (filteredRepos.length === 0) {
        container.innerHTML = '<div class="repo-loading">No matching repositories</div>';
        container.classList.remove('hidden');
        return;
    }

    // Build HTML for suggestions
    const html = filteredRepos.slice(0, 20).map(repo => `
        <div class="repo-suggestion-item" data-repo="${repo.full_name}">
            <div class="repo-suggestion-name">${repo.full_name}</div>
            ${repo.description ? `<div class="repo-suggestion-desc">${escapeHtml(repo.description)}</div>` : ''}
            <div class="repo-suggestion-meta">
                ${repo.private ? '<span>🔒 Private</span>' : ''}
                ${repo.stargazers_count > 0 ? `<span>⭐ ${repo.stargazers_count}</span>` : ''}
                ${repo.language ? `<span>${repo.language}</span>` : ''}
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
    container.classList.remove('hidden');

    // Add click handlers
    container.querySelectorAll('.repo-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const repoInput = document.getElementById('github-repo-input');
            repoInput.value = item.dataset.repo;
            container.classList.add('hidden');
        });
    });
}

/**
 * Update selected item highlighting
 */
function updateSelectedItem(items, index) {
    items.forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

/**
 * Callback when a new deck is created
 */
async function onDeckCreated(deckId) {
    console.log(`[Main] New deck created: ${deckId}`);
    try {
        // Load the new repository
        await loadRepository(deckId);
        // Reload the display
        await loadRepositories();
    } catch (error) {
        console.error('[Main] Error loading new deck:', error);
        alert(`Deck created but failed to load: ${error.message}`);
    }
}

/**
 * Callback when a folder is created
 */
async function onFolderCreated(deckId, folderPath) {
    console.log(`[Main] Folder created: ${deckId}/${folderPath}`);
    try {
        // Reload the repository to get updated structure
        await loadRepository(deckId);
        // Refresh the current view
        if (currentDeck && currentDeck.id === deckId) {
            await navigateToDeck(currentDeck, currentPath, false);
        }
    } catch (error) {
        console.error('[Main] Error refreshing after folder creation:', error);
    }
}

/**
 * Callback when a card is saved
 */
async function onCardSaved(deckId, filePath) {
    console.log(`[Main] Card saved: ${deckId}/${filePath}`);
    try {
        // Reload the repository to get updated cards
        await loadRepository(deckId);
        // Refresh the current view
        if (currentDeck && currentDeck.id === deckId) {
            await navigateToDeck(currentDeck, currentPath, false);
        } else {
            await loadRepositories();
        }
    } catch (error) {
        console.error('[Main] Error refreshing after card save:', error);
    }
}

/**
 * Handle adding a new repository
 */
async function handleAddRepository() {
    const input = document.getElementById('github-repo-input');
    const addBtn = document.getElementById('add-repo-btn');
    const repoString = input.value.trim();

    if (!repoString) {
        alert('Please enter a repository in the format: owner/repository');
        return;
    }

    // Validate format
    if (!repoString.includes('/') || repoString.split('/').length !== 2) {
        alert('Invalid format. Please use: owner/repository');
        return;
    }

    const originalText = addBtn.textContent;
    addBtn.textContent = '...';
    addBtn.disabled = true;
    input.disabled = true;

    try {
        // Adding a deck reads only repository metadata and the flashcards tree.
        // Card bodies remain lazy until the first review.
        await loadRepositoryMetadata(repoString, { sync: true });
        console.log(`[Main] Added metadata-only deck ${repoString}`);

        // Clear input
        input.value = '';

        // Reload the display
        await loadRepositories();

    } catch (error) {
        console.error('Error loading repository:', error);
        alert(`Failed to load repository: ${error.message}`);
    } finally {
        addBtn.textContent = originalText;
        addBtn.disabled = false;
        input.disabled = false;
    }
}

/**
 * Reset all cards in a deck - marks all as due for review
 */
async function resetDeck(deckId) {
    const { refreshDeck } = await import('./storage.js');
    await refreshDeck(deckId);
    console.log(`Refreshed all cards in deck: ${deckId}`);

    // Reload repositories to update due counts
    await loadRepositories();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Load all local collection repos from public/collection/
 */
export async function loadLocalCollectionRepos() {
    try {
        console.log('[Main] Loading local collection repos...');

        // Load the collection index
        const indexResponse = await fetch(`${import.meta.env.BASE_URL}collection/index.json`);
        if (!indexResponse.ok) {
            console.log('[Main] No collection index found');
            return;
        }

        const index = await indexResponse.json();
        console.log(`[Main] Found ${index.repos.length} repos in collection`);

        // Load each repo from the index
        for (let i = 0; i < index.repos.length; i++) {
            const repoInfo = index.repos[i];
            await loadLocalRepo(repoInfo);
        }

        console.log(`[Main] Loaded all local collection repos`);
    } catch (error) {
        console.error('[Main] Failed to load local collection repos:', error);
    }
}

/**
 * Load a single local repo from public/collection/
 */
async function loadLocalRepo(repoInfo) {
    try {
        console.log(`[Main] Loading local repo: ${repoInfo.name}`);

        const allCards = [];
        let firstMetadata = null;

        // Load each markdown file in the repo
        for (const file of repoInfo.files) {
            const filePath = `${import.meta.env.BASE_URL}collection/${repoInfo.name}/${file}`;
            const response = await fetch(filePath);

            if (!response.ok) {
                console.warn(`[Main] Failed to fetch ${filePath}: ${response.status}`);
                continue;
            }

            const markdown = await response.text();
            const { cards, metadata } = parseDeck(markdown, file);

            // Save first metadata we encounter
            if (!firstMetadata && metadata) {
                firstMetadata = metadata;
            }

            // Add cards with proper deck info
            const cardsWithMeta = cards.map(card => {
                const deckId = `local/${repoInfo.name}`;
                const identity = identifyCard(card, deckId);
                return {
                    ...card,
                    ...identity,
                    deckName: deckId,
                    deckMetadata: metadata || firstMetadata,
                    chapterMetadata: metadata || firstMetadata,
                    source: {
                        repo: deckId,
                        file
                    }
                };
            });

            allCards.push(...cardsWithMeta);
        }

        if (allCards.length > 0) {
            await saveCards(allCards);
            await saveRepoMetadata({
                id: `local/${repoInfo.name}`,
                name: firstMetadata?.name || repoInfo.name,
                repo: `local/${repoInfo.name}`,
                cardCount: allCards.length,
                fileCount: repoInfo.files.length,
                createdAt: new Date().toISOString(),
                ...(firstMetadata?.subject && { subject: firstMetadata.subject }),
                ...(firstMetadata?.topic && { topic: firstMetadata.topic })
            });

            console.log(`[Main] Loaded ${allCards.length} cards from local repo: ${repoInfo.name}`);
        }
    } catch (error) {
        console.error(`[Main] Failed to load local repo ${repoInfo.name}:`, error);
    }
}

// Deck navigation state (inline breadcrumb navigation)
let currentCategory = null; // The currently selected category folder (null = at home level)
let currentDeck = null;
let habitSettings = null; // Cached habit settings (active decks, daily goal)
let lastHabitStatus = null;
let currentPath = [];
let folderHierarchy = null;
let allReviewsCache = null; // Cache for reviews during navigation
let isInStudySession = false; // Track if we're in study mode
let currentStudyFile = null; // The file being studied (for breadcrumb)
let isDrillAll = false; // Track if we're in a cross-deck drill-all session
let dueWarningAcknowledgedDate = null;
let currentPrimaryStudyMode = null;
let pausedPrimaryStudySession = null;

/**
 * Restore navigation state from URL parameters
 */
async function restoreNavigationFromURL() {
    const url = new URL(window.location);
    const deckId = url.searchParams.get('deck');
    const pathParam = url.searchParams.get('path');
    const studyParam = url.searchParams.get('study');
    const fileParam = url.searchParams.get('file');
    const categoryParam = url.searchParams.get('category');

    console.log('[Navigation] restoreNavigationFromURL called:', {
        fullURL: window.location.href,
        deckId,
        pathParam,
        studyParam,
        fileParam,
        categoryParam,
        historyLength: history.length
    });

    if (deckId) {
        // Find the deck object
        const allDecks = await getAllDecks();
        console.log('[Navigation] Looking for deck:', deckId, 'in', allDecks.map(d => d.id));
        const deck = allDecks.find(d => d.id === deckId);
        currentCategory = categoryParam || null;

        if (deck) {
            console.log('[Navigation] Found deck, restoring navigation');
            const path = pathParam ? pathParam.split('/') : [];
            // Use updateHistory=false since we're restoring, not navigating
            await navigateToDeck(deck, path, false);

            // If study session was active, restore it
            if (studyParam === 'true' && fileParam) {
                if (!requireOnlineStudy()) return;
                console.log('[Navigation] Restoring study session for file:', fileParam);
                const displayName = fileParam.split('/').pop().replace('.md', '');
                isInStudySession = true;
                setHomeReviewVisible(false);
                currentStudyFile = displayName;

                const topicsGrid = document.getElementById('topics-grid');
                const studyArea = document.getElementById('study-area');
                const sessionComplete = document.getElementById('session-complete');

                topicsGrid.classList.add('hidden');
                studyArea.classList.remove('hidden');
                sessionComplete.classList.add('hidden');

                setupStudyEventListeners();
                updateDeckBreadcrumb();
                await ensureRepositoriesLoaded([deck.id]);
                await startSession(deck.id, fileParam, onSessionComplete, renderStudyCardBreadcrumb);
            }
        } else {
            console.log('[Navigation] Deck not found!');
        }
    } else if (categoryParam) {
        currentCategory = categoryParam;
        await loadRepositories();
    } else {
        console.log('[Navigation] No deck in URL, showing home');
    }
}

/**
 * Handle browser back/forward navigation
 */
async function handlePopState(event) {
    const state = event.state;

    // Clear search on any navigation
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // If we're in a study session and navigating away, clean up
    if (isInStudySession) {
        isInStudySession = false;
        currentStudyFile = null;
        currentPrimaryStudyMode = null;
        pausedPrimaryStudySession = null;
        clearStudySession();
        cleanupStudySession();
        removeStudyEventListeners();

        // Hide study UI
        const topicsGrid = document.getElementById('topics-grid');
        const studyArea = document.getElementById('study-area');
        const sessionComplete = document.getElementById('session-complete');
        studyArea.classList.add('hidden');
        sessionComplete.classList.add('hidden');
        topicsGrid.classList.remove('hidden');
    }

    if (state && state.deck) {
        // Find the deck object
        const allDecks = await getAllDecks();
        const deck = allDecks.find(d => d.id === state.deck);
        currentCategory = state.category || null;

        if (deck) {
            const path = state.path || [];


            // Check if we're navigating to a study session
            if (state.study && state.file) {
                if (!requireOnlineStudy()) return;
                // First navigate to the deck/path
                await navigateToDeck(deck, path, false);
                // Then start study session (without pushing history)
                isInStudySession = true;
                setHomeReviewVisible(false);
                currentStudyFile = state.file.replace('.md', '');

                const topicsGrid = document.getElementById('topics-grid');
                const studyArea = document.getElementById('study-area');
                const sessionComplete = document.getElementById('session-complete');

                topicsGrid.classList.add('hidden');
                studyArea.classList.remove('hidden');
                sessionComplete.classList.add('hidden');

                setupStudyEventListeners();
                updateDeckBreadcrumb();
                await ensureRepositoriesLoaded([deck.id]);
                await startSession(deck.id, state.file, onSessionComplete, renderStudyCardBreadcrumb);
            } else {
                // Use updateHistory=false to avoid pushing duplicate history entry
                await navigateToDeck(deck, path, false);
            }
        }
    } else {
        // No deck in state - show home view
        currentCategory = state?.category || null;
        currentDeck = null;
        currentPath = [];
        folderHierarchy = null;
        allReviewsCache = null;

        setHomeReviewVisible(true);
        await loadRepositories();
    }
}

/**
 * Build folder hierarchy from file paths
 * Returns a tree structure: { folders: {}, files: {} }
 * Skips the "flashcards/" prefix if all files start with it
 */
function buildFolderHierarchy(fileGroups) {
    const root = { folders: {}, files: {} };

    // Check if all files start with "flashcards/"
    const allPaths = Object.keys(fileGroups);
    const allStartWithFlashcards = allPaths.every(path => path.startsWith('flashcards/'));

    for (const [filePath, cards] of Object.entries(fileGroups)) {
        // Remove "flashcards/" prefix if all files have it
        let normalizedPath = filePath;
        if (allStartWithFlashcards && filePath.startsWith('flashcards/')) {
            normalizedPath = filePath.substring(11); // Remove "flashcards/"
        }

        const parts = normalizedPath.split('/');
        let current = root;

        // Navigate through folders
        for (let i = 0; i < parts.length - 1; i++) {
            const folderName = parts[i];
            if (!current.folders[folderName]) {
                current.folders[folderName] = { folders: {}, files: {} };
            }
            current = current.folders[folderName];
        }

        // Add file at the end
        const fileName = parts[parts.length - 1];
        current.files[fileName] = cards;
    }

    return root;
}

/**
 * Get content at a specific path in the hierarchy
 */
function getContentAtPath(hierarchy, path) {
    let current = hierarchy;
    for (const segment of path) {
        if (current.folders[segment]) {
            current = current.folders[segment];
        } else {
            return null;
        }
    }
    return current;
}

/**
 * Navigate into a deck (inline breadcrumb navigation, replaces modal)
 */
async function navigateToDeck(deck, path = [], updateHistory = true) {
    currentDeck = deck;
    currentPath = path;

    // Update URL to persist navigation state
    if (updateHistory) {
        const url = new URL(window.location);
        url.searchParams.set('deck', deck.id);
        if (path.length > 0) {
            url.searchParams.set('path', path.join('/'));
        } else {
            url.searchParams.delete('path');
        }
        console.log('[Navigation] pushState:', url.toString(), 'historyLength before:', history.length);
        // Use pushState to create a new history entry
        // When user navigates to app.html and presses back, they return to this URL
        history.pushState({ deck: deck.id, path: [...path], category: currentCategory }, '', url);
        console.log('[Navigation] historyLength after:', history.length);
    }

    // Show search bar (keep same placeholder)
    const controlsBar = document.getElementById('controls-bar');
    const searchInput = document.getElementById('search-input');
    controlsBar.classList.remove('hidden');
    if (searchInput) {
        searchInput.value = ''; // Clear search when navigating
    }

    // Get all cards for this deck and group by file
    const allCards = await getAllCards();
    const deckCards = allCards.filter(c => c.deckName === deck.id);
    allReviewsCache = await getAllReviews();

    // Group cards by file
    const fileGroups = {};
    deckCards.forEach(card => {
        const fileName = card.source?.file || 'unknown';
        if (!fileGroups[fileName]) {
            fileGroups[fileName] = [];
        }
        fileGroups[fileName].push(card);
    });

    // Build folder hierarchy
    folderHierarchy = buildFolderHierarchy(fileGroups);

    // Update breadcrumb and render content inline
    updateDeckBreadcrumb();
    renderCurrentLevel();
}

/**
 * Update the deck navigation breadcrumb
 */
function updateDeckBreadcrumb() {
    const breadcrumb = document.getElementById('deck-breadcrumb');

    // The persistent deck breadcrumb belongs to the legacy card view only.
    // Columns (the active view) uses the in-session study breadcrumb instead.
    if (deckViewMode !== 'cards' || !currentDeck) {
        breadcrumb.classList.add('hidden');
        return;
    }

    breadcrumb.classList.remove('hidden');
    breadcrumb.innerHTML = '';

    const tildeSpan = document.createElement('span');
    tildeSpan.className = 'breadcrumb-separator';
    tildeSpan.textContent = '~';
    breadcrumb.appendChild(tildeSpan);
    breadcrumb.appendChild(createBreadcrumbSeparator());

    // "home" segment
    const homeSpan = document.createElement('span');
    const homeClickable = currentDeck !== null || currentCategory !== null || isDrillAll;
    homeSpan.className = 'breadcrumb-segment' + (homeClickable ? ' breadcrumb-clickable' : ' current');
    homeSpan.textContent = 'home';
    if (homeClickable) {
        homeSpan.onclick = () => {
            if (isDrillAll) {
                exitStudySession();
                return;
            }
            if (isInStudySession) exitStudySession(true);
            exitDeckNavigation();
        };
    }
    breadcrumb.appendChild(homeSpan);

    // Drill-all tail
    if (isDrillAll && !currentDeck) {
        breadcrumb.appendChild(createBreadcrumbSeparator());
        const drillSegment = document.createElement('span');
        drillSegment.className = 'breadcrumb-segment current';
        drillSegment.textContent = 'drill all';
        breadcrumb.appendChild(drillSegment);
        return;
    }

    // Category segment (if inside a category)
    if (currentCategory) {
        breadcrumb.appendChild(createBreadcrumbSeparator());
        const catSegment = document.createElement('span');
        // Clickable if we're also inside a deck
        const catClickable = currentDeck !== null;
        catSegment.className = 'breadcrumb-segment' + (catClickable ? ' breadcrumb-clickable' : ' current');
        catSegment.textContent = currentCategory;
        if (catClickable) {
            catSegment.onclick = () => {
                if (isInStudySession) exitStudySession(true);
                exitToCategoryView();
            };
        }
        breadcrumb.appendChild(catSegment);
    }

    // Deck segment (if inside a deck)
    if (currentDeck) {
        breadcrumb.appendChild(createBreadcrumbSeparator());
        const repoName = currentDeck.id.split('/').pop();
        const deckSegment = document.createElement('span');
        const isDeckClickable = currentPath.length > 0 || isInStudySession;
        deckSegment.className = 'breadcrumb-segment' + (isDeckClickable ? ' breadcrumb-clickable' : ' current');
        deckSegment.textContent = repoName;
        if (isDeckClickable) {
            deckSegment.onclick = () => {
                if (isInStudySession) exitStudySession();
                navigateToPath([]);
            };
        }
        breadcrumb.appendChild(deckSegment);

        // Folder path segments
        currentPath.forEach((folder, index) => {
            breadcrumb.appendChild(createBreadcrumbSeparator());
            const segment = document.createElement('span');
            const isLast = index === currentPath.length - 1 && !isInStudySession;
            segment.className = 'breadcrumb-segment' + (!isLast ? ' breadcrumb-clickable' : ' current');
            segment.textContent = folder;
            if (!isLast) {
                segment.onclick = () => {
                    if (isInStudySession) exitStudySession();
                    navigateToPath(currentPath.slice(0, index + 1));
                };
            }
            breadcrumb.appendChild(segment);
        });

        if (isInStudySession && currentStudyFile) {
            breadcrumb.appendChild(createBreadcrumbSeparator());
            const fileSegment = document.createElement('span');
            fileSegment.className = 'breadcrumb-segment current';
            fileSegment.textContent = currentStudyFile;
            breadcrumb.appendChild(fileSegment);
        }
    }
}

/**
 * Create a breadcrumb separator element
 */
function createBreadcrumbSeparator() {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-separator';
    sep.textContent = '/';
    return sep;
}

/**
 * Render the current level of folders/files in the main grid
 */
function renderCurrentLevel() {
    const grid = document.getElementById('topics-grid');
    grid.innerHTML = '';

    const content = getContentAtPath(folderHierarchy, currentPath);
    if (!content) {
        console.error('Invalid path:', currentPath);
        return;
    }

    // Get search term for filtering
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';

    // Show folders first (filtered by search)
    const sortedFolders = Object.keys(content.folders).sort();
    for (const folderName of sortedFolders) {
        // Filter by search term
        if (searchTerm && !folderName.toLowerCase().includes(searchTerm)) {
            continue;
        }
        const folderCard = createFolderCard(folderName, content.folders[folderName], allReviewsCache);
        grid.appendChild(folderCard);
    }

    // Then show files (filtered by search)
    const sortedFiles = Object.keys(content.files).sort();
    for (const fileName of sortedFiles) {
        // Filter by search term (match filename without .md)
        const displayName = fileName.replace('.md', '');
        if (searchTerm && !displayName.toLowerCase().includes(searchTerm)) {
            continue;
        }

        const cards = content.files[fileName];
        const fileReviews = allReviewsCache.filter(r => {
            const card = cards.find(c => c.hash === r.cardHash);
            return !!card;
        });

        // Build full file path for subdeck
        const fullPath = [...currentPath, fileName].join('/');
        const subdeckData = {
            id: `${currentDeck.id}/${fullPath}`,
            fileName: fileName,
            fullPath: fullPath,
            deckId: currentDeck.id,
            cards: cards,
            reviews: new Map(fileReviews.map(r => [r.cardHash, r]))
        };

        const subdeckCard = createSubdeckCard(subdeckData);
        grid.appendChild(subdeckCard);
    }

    // Show message if no results after filtering
    if (grid.children.length === 0 && searchTerm) {
        grid.innerHTML = '<div class="loading">No matches found</div>';
    }
}

/**
 * Exit deck navigation and return to deck list
 */
function exitDeckNavigation() {
    currentDeck = null;
    currentCategory = null;
    currentPath = [];
    folderHierarchy = null;
    allReviewsCache = null;

    // Clear search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // Clear URL parameters and add to history
    const url = new URL(window.location);
    url.searchParams.delete('deck');
    url.searchParams.delete('path');
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    // Use pushState so this becomes a new history entry
    history.pushState({}, '', url);

    loadRepositories();
}

/**
 * Start an inline study session
 */
/** Update the independent due-review and new-learning actions. */
async function renderReviewButton({ refreshStatus = true } = {}) {
    const dueBtn = document.getElementById('review-due-btn');
    const newBtn = document.getElementById('learn-new-btn');
    if (!dueBtn || !newBtn) return;

    dueBtn.classList.remove('recommended-study-action');
    newBtn.classList.remove('recommended-study-action');

    try {
        if (refreshStatus) {
            const status = await getHabitStatus();
            lastHabitStatus = status;
            habitSettings = status.settings;
            updateStreakBadge(status);
        }

        const active = habitSettings.activeDecks || [];

        const [allReviews, allCards, allDecks] = await Promise.all([
            getAllReviews(),
            getAllCards(),
            getAllDecks()
        ]);
        const now = new Date();
        const due = allReviews.filter(review => new Date(review.fsrsCard.due) <= now).length;
        const introducedToday = lastHabitStatus?.today?.newCards || 0;
        const { batchSize, unlimited, targetReached, nextBatch } = newLearningPlan({
            newPerDay: habitSettings.newPerDay,
            newBatchSize: habitSettings.newBatchSize,
            newIntroducedToday: introducedToday
        });
        const availability = freshCardAvailability({
            cards: allCards,
            reviews: allReviews,
            activeDeckIds: active,
            decks: allDecks
        });
        const requestedBatch = targetReached ? batchSize : nextBatch;
        const visibleBatch = availability.fullyKnown
            ? Math.min(requestedBatch, availability.freshCount)
            : requestedBatch;
        const online = isOnline();

        dueBtn.disabled = !online || due === 0;
        dueBtn.textContent = 'Review';
        dueBtn.title = !online
            ? 'Reconnect to review cards'
            : due > 0
            ? `${due} learned card${due === 1 ? '' : 's'} due now`
            : 'No learned cards are due';

        const activeScopeComplete = availability.fullyKnown && availability.freshCount === 0;
        newBtn.disabled = !online || active.length === 0 || activeScopeComplete;
        newBtn.dataset.allowBeyondTarget = targetReached ? 'true' : 'false';
        newBtn.textContent = activeScopeComplete
            ? 'No new cards'
            : 'Learn';
        newBtn.title = !online
            ? 'Reconnect to learn cards'
            : active.length === 0
            ? 'Star items (★) to choose new material'
            : activeScopeComplete
                ? 'Every card in the starred scope has been introduced; star another chapter to continue learning'
            : targetReached
                ? `Daily target reached; deliberately introduce another batch of up to ${visibleBatch}`
                : unlimited
                    ? `Introduce up to ${visibleBatch} new cards in this session; no daily target`
                    : `Introduce up to ${visibleBatch} new card${visibleBatch === 1 ? '' : 's'} in this session`;

        if (online && pausedPrimaryStudySession) {
            const remaining = pausedPrimaryStudySession.queue?.length || 0;
            if (remaining > 0 && pausedPrimaryStudySession.mode === 'due') {
                dueBtn.disabled = false;
                dueBtn.textContent = 'Resume';
                dueBtn.title = 'Continue the review session where you left off';
            } else if (remaining > 0 && pausedPrimaryStudySession.mode === 'new') {
                newBtn.disabled = false;
                newBtn.textContent = 'Resume';
                newBtn.title = 'Continue the new-card session where you left off';
            }
        }

        let recommended;
        const pausedRemaining = pausedPrimaryStudySession?.queue?.length || 0;
        if (pausedRemaining > 0) {
            recommended = pausedPrimaryStudySession.mode === 'due' ? dueBtn : newBtn;
        } else if (!dueBtn.disabled) {
            recommended = dueBtn;
        } else if (!newBtn.disabled) {
            recommended = newBtn;
        }
        recommended?.classList.add('recommended-study-action');
        updateAppBadge(pausedPrimaryStudySession?.queue?.length || due);

    } catch (error) {
        console.error('[Main] Failed to render study buttons:', error);
        dueBtn.disabled = true;
        newBtn.disabled = true;
        updateAppBadge(0);
    }
}

function currentPrimarySessionSnapshot() {
    if (!currentPrimaryStudyMode) return null;
    const sessionState = getState();
    const queue = sessionState.dueCards.slice(sessionState.currentCardIndex).map(({ card, cardHash }) => ({
        cardHash,
        repo: card.source?.repo || card.deckName || '',
        filepath: card.source?.file || ''
    })).filter(entry => entry.cardHash && entry.repo && entry.filepath);
    if (queue.length === 0) return null;
    return {
        mode: currentPrimaryStudyMode,
        queue,
        completedCards: sessionState.reviewedCards + sessionState.currentCardIndex,
        activeDecks: [...(habitSettings?.activeDecks || [])]
    };
}

function persistCurrentPrimaryStudySession() {
    const snapshot = currentPrimarySessionSnapshot();
    return snapshot ? saveStudySession(snapshot) : clearStudySession();
}

async function pausePrimaryStudySession() {
    if (!currentPrimaryStudyMode) return false;
    const snapshot = currentPrimarySessionSnapshot();
    if (!snapshot) return false;

    pausedPrimaryStudySession = { ...snapshot, inMemory: true };
    isInStudySession = false;
    removeStudyEventListeners();
    document.getElementById('study-area')?.classList.add('hidden');
    document.getElementById('session-complete')?.classList.add('hidden');
    document.getElementById('topics-grid')?.classList.remove('hidden');
    await saveStudySession(snapshot);
    return true;
}

async function resumePrimaryStudySession(mode) {
    if (!pausedPrimaryStudySession || pausedPrimaryStudySession.mode !== mode) return false;
    if (!studySessionMatchesActiveScope(pausedPrimaryStudySession, habitSettings?.activeDecks)) {
        // Scope changed while this queue was paused. Grades already submitted
        // remain saved; the next queue is rebuilt from the current stars.
        discardPausedPrimaryStudySession();
        return false;
    }
    const paused = pausedPrimaryStudySession;
    const sessionState = getState();
    if (paused.inMemory && sessionState.currentCardIndex < sessionState.dueCards.length) {
        pausedPrimaryStudySession = null;
        isInStudySession = true;
        setHomeReviewVisible(false);
        document.getElementById('topics-grid')?.classList.add('hidden');
        document.getElementById('dashboard')?.classList.add('hidden');
        document.getElementById('session-complete')?.classList.add('hidden');
        document.getElementById('study-area')?.classList.remove('hidden');
        renderStudyCardBreadcrumb(sessionState.currentCard);
        setupStudyEventListeners();
        return true;
    }

    showReviewLoading('paused session');
    try {
        const fileSpecs = paused.queue.map(entry => ({ repo: entry.repo, path: entry.filepath }));
        await ensureRepositoriesLoaded(
            [...new Set(fileSpecs.map(entry => entry.repo))],
            updateReviewLoading,
            fileSpecs
        );
    } catch (error) {
        console.error('[Main] Failed to restore paused session:', error);
        alert('The paused session could not be loaded. Check your connection and try again.');
        return true;
    } finally {
        hideReviewLoading();
    }

    const [cards, reviews] = await Promise.all([getAllCards(), getAllReviews()]);
    const cardMap = new Map(cards.map(card => [card.hash, card]));
    const reviewMap = new Map(reviews.map(review => [review.cardHash, review]));
    const queue = paused.queue.map(entry => {
        const card = cardMap.get(entry.cardHash);
        const review = reviewMap.get(entry.cardHash);
        if (!card || (mode === 'new' && review) || (mode === 'due' && !review)) return null;
        return { card, cardHash: entry.cardHash, fsrsCard: review?.fsrsCard || null };
    }).filter(Boolean);

    if (queue.length === 0) {
        discardPausedPrimaryStudySession();
        await renderReviewButton({ refreshStatus: true });
        return true;
    }

    currentPrimaryStudyMode = mode;
    pausedPrimaryStudySession = null;
    enterStudyArea(['home', mode === 'due' ? 'Due review' : 'New learning']);
    startTodaySession(queue, onSessionComplete, renderStudyCardBreadcrumb, {
        completedCards: paused.completedCards,
        onProgress: persistCurrentPrimaryStudySession
    });
    persistCurrentPrimaryStudySession();
    return true;
}

function discardPausedPrimaryStudySession() {
    if (pausedPrimaryStudySession) cleanupStudySession();
    pausedPrimaryStudySession = null;
    currentPrimaryStudyMode = null;
    clearStudySession();
}

function closeStudySettings() {
    document.getElementById('study-settings-modal')?.classList.add('hidden');
    document.getElementById('study-settings-btn')?.setAttribute('aria-expanded', 'false');
}

function reflectCustomTargetField() {
    const select = document.getElementById('daily-new-target');
    const custom = document.getElementById('daily-new-custom');
    if (!select || !custom) return;
    custom.classList.toggle('hidden', select.value !== 'custom');
    custom.required = select.value === 'custom';
}

async function openStudySettings() {
    const modal = document.getElementById('study-settings-modal');
    const button = document.getElementById('study-settings-btn');
    const target = document.getElementById('daily-new-target');
    const custom = document.getElementById('daily-new-custom');
    const batch = document.getElementById('new-session-size');
    const reminderEnabled = document.getElementById('daily-reminder-enabled');
    const reminderTime = document.getElementById('daily-reminder-time');
    const reminderHelp = document.getElementById('reminder-settings-help');
    if (!modal || !button || !target || !custom || !batch || !reminderEnabled || !reminderTime) return;

    if (!modal.classList.contains('hidden')) {
        closeStudySettings();
        return;
    }

    const savedTarget = Number(habitSettings?.newPerDay ?? 10);
    if (savedTarget === -1) target.value = 'unlimited';
    else if ([5, 10, 20].includes(savedTarget)) target.value = String(savedTarget);
    else {
        target.value = 'custom';
        custom.value = String(Math.max(1, savedTarget || 10));
    }
    batch.value = String([5, 10, 20].includes(Number(habitSettings?.newBatchSize))
        ? Number(habitSettings.newBatchSize)
        : 10);
    reflectCustomTargetField();
    reminderEnabled.value = 'false';
    reminderTime.value = '18:00';
    modal.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    target.focus();

    const reminder = await getReminderPreferences();
    if (modal.classList.contains('hidden')) return;
    reminderEnabled.value = String(reminder.enabled);
    reminderTime.value = reminder.reminderTime;
    if (reminderHelp) {
        if (reminder.state === 'needs-install') {
            reminderHelp.textContent = 'Install the app on your Home Screen before enabling reminders on this device.';
        } else if (reminder.state === 'denied') {
            reminderHelp.textContent = 'Notifications are blocked in this device’s system settings.';
        } else if (reminder.state === 'unsupported') {
            reminderHelp.textContent = 'This browser does not support app reminders.';
        } else {
            reminderHelp.textContent = 'Uses this device’s timezone and only nudges you when cards are due or a session is paused.';
        }
    }
}

async function saveStudySettingsFromForm(event) {
    event.preventDefault();
    const targetSelect = document.getElementById('daily-new-target');
    const custom = document.getElementById('daily-new-custom');
    const batchSelect = document.getElementById('new-session-size');
    const reminderEnabled = document.getElementById('daily-reminder-enabled');
    const reminderTime = document.getElementById('daily-reminder-time');
    if (!targetSelect || !custom || !batchSelect || !reminderEnabled || !reminderTime) return;

    let newPerDay;
    if (targetSelect.value === 'unlimited') newPerDay = -1;
    else if (targetSelect.value === 'custom') {
        newPerDay = Math.min(500, Math.max(1, Math.floor(Number(custom.value) || 10)));
    } else newPerDay = Number(targetSelect.value);
    const newBatchSize = Number(batchSelect.value);

    const wantsReminder = reminderEnabled.value === 'true';
    if (wantsReminder && !isStandalone()) {
        closeStudySettings();
        openPwaInstallGuide();
    } else if (wantsReminder) {
        const enabled = await subscribeToPush({
            reminderTime: reminderTime.value,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        if (!enabled) {
            alert('The reminder could not be enabled. Make sure you are signed in and allow notifications when prompted.');
        }
    } else {
        await unsubscribeFromPush();
        updateAppBadge(0);
    }

    habitSettings = { ...(habitSettings || {}), newPerDay, newBatchSize };
    closeStudySettings();
    await renderReviewButton({ refreshStatus: false });
    const saved = await saveSettings({ newPerDay, newBatchSize });
    habitSettings = { ...habitSettings, ...saved, newPerDay, newBatchSize };
    await renderReviewButton({ refreshStatus: false });
    queueDailyPreparation()
        .then(() => renderReviewButton({ refreshStatus: false }))
        .catch(error => console.warn('[Main] Settings prefetch failed:', error));
}

function renderPwaInstallPrompt() {
    const prompt = document.getElementById('pwa-install-prompt');
    if (!prompt) return;
    prompt.classList.toggle('hidden', !isIOSDevice() || isStandalone());
}

function openPwaInstallGuide() {
    closeStudySettings();
    document.getElementById('pwa-install-modal')?.classList.remove('hidden');
    document.getElementById('pwa-install-close')?.focus();
}

function closePwaInstallGuide() {
    document.getElementById('pwa-install-modal')?.classList.add('hidden');
}

/**
 * Update the streak badge in the controls bar.
 */
function updateStreakBadge(status) {
    const badge = document.getElementById('streak-badge');
    if (!badge) return;
    if (status.streak <= 0) {
        badge.classList.add('hidden');
        return;
    }
    badge.textContent = `\u{1F525} ${status.streak} ${status.streak === 1 ? 'day' : 'days'}`;
    badge.classList.remove('hidden');
}

/**
 * Toggle a deck's membership in the active (focus) set
 */
async function toggleActiveDeck(deckId) {
    const active = new Set(habitSettings?.activeDecks || []);
    if (active.has(deckId)) {
        active.delete(deckId);
    } else {
        active.add(deckId);
    }
    await applyActiveScopes(active);
}

/**
 * Tri-state of a subject's decks in the active set: all / some / none.
 */
function subjectStarState(deckIds) {
    const active = new Set(habitSettings?.activeDecks || []);
    const on = deckIds.filter(id => active.has(id)).length;
    if (on === 0) return 'none';
    if (on === deckIds.length) return 'all';
    return 'some';
}

/** Glyph for a tri-state star. */
function subjectStarGlyph(state) {
    return state === 'all' ? '★' : state === 'some' ? '◐' : '☆';
}

// ── Chapter-level active scope model ─────────────────────────────────────────
// The active set (habitSettings.activeDecks) can hold whole-deck ids (repo)
// and/or chapter scopes ("repo<SEP>file"). Columns stars operate at chapter
// granularity; deck/subject stars are bulk operations over their chapters.

const chapterScope = (repo, file) => repo + SCOPE_SEP + (file || '');

/** Resolve the stored active list into a Set of chapter scopes. */
function resolveActiveScopes(cards, decks = []) {
    const raw = habitSettings?.activeDecks || [];
    const filesByRepo = new Map();
    for (const c of cards) {
        const repo = c.source?.repo || c.deckName;
        if (!filesByRepo.has(repo)) filesByRepo.set(repo, new Set());
        filesByRepo.get(repo).add(c.source?.file || '');
    }
    for (const deck of decks) {
        if (!filesByRepo.has(deck.id)) filesByRepo.set(deck.id, new Set());
        for (const file of deck.files || []) {
            filesByRepo.get(deck.id).add(typeof file === 'string' ? file : file.path);
        }
    }
    const scopes = new Set();
    for (const entry of raw) {
        if (entry.includes(SCOPE_SEP)) { scopes.add(entry); continue; }
        const files = filesByRepo.get(entry);
        if (files && files.size) files.forEach(f => scopes.add(chapterScope(entry, f)));
        else scopes.add(entry); // repo not loaded — keep as-is
    }
    return scopes;
}

/** Tri-state over an array of { repo, files } deck descriptors. */
function scopeStarState(scopes, deckFiles, ignoredScopes = new Set()) {
    let total = 0, on = 0;
    for (const { repo, files } of deckFiles) {
        for (const f of files) {
            const scope = chapterScope(repo, f);
            if (ignoredScopes.has(scope)) continue;
            total++;
            if (scopes.has(scope)) on++;
        }
    }
    if (total === 0 || on === 0) return 'none';
    if (on === total) return 'all';
    return 'some';
}

function chapterIsActive(scopes, repo, file) {
    return scopes.has(chapterScope(repo, file));
}

async function applyActiveScopes(scopes) {
    const activeDecks = [...scopes];
    const scopeChanged = !studySessionMatchesActiveScope(
        { activeDecks: habitSettings?.activeDecks || [] },
        activeDecks
    );
    // Paint first. Persistence and content preparation must never block a star.
    habitSettings = { ...(habitSettings || {}), activeDecks };
    if (scopeChanged && pausedPrimaryStudySession) {
        // A paused batch is a snapshot of its original scope. Retire it instead
        // of allowing Resume to surface cards that the user just unstarred (or
        // omit cards they just starred). Completed reviews are already durable.
        discardPausedPrimaryStudySession();
    }
    const persistence = saveSettings({ activeDecks });
    const render = loadRepositories();
    queueDailyPreparation()
        .then(() => renderReviewButton({ refreshStatus: false }))
        .catch(error => console.warn('[Main] Star prefetch failed:', error));
    persistence.then(saved => {
        const stillCurrent = JSON.stringify(habitSettings?.activeDecks || []) === JSON.stringify(activeDecks);
        if (stillCurrent) habitSettings = { ...habitSettings, ...saved, activeDecks };
    }).catch(error => console.warn('[Main] Failed to persist starred scope:', error));
    await render;
}

async function saveActiveScopes(scopes) {
    await applyActiveScopes(scopes);
}

async function toggleChapterScope(repo, file) {
    const scopes = resolveActiveScopes(await getAllCards(), await getAllDecks());
    const sc = chapterScope(repo, file);
    if (scopes.has(sc)) scopes.delete(sc); else scopes.add(sc);
    await saveActiveScopes(scopes);
}

/** Bulk toggle over decks: if all their chapters are active, clear; else set. */
async function toggleScopes(deckFiles) {
    const scopes = resolveActiveScopes(await getAllCards(), await getAllDecks());
    const activate = scopeStarState(scopes, deckFiles) !== 'all';
    for (const { repo, files } of deckFiles) {
        files.forEach(f => activate ? scopes.add(chapterScope(repo, f)) : scopes.delete(chapterScope(repo, f)));
    }
    await saveActiveScopes(scopes);
}

/**
 * Bulk activate/deactivate every deck in a subject. Clicking a parent star
 * activates all if not all active, else clears them.
 */
async function toggleActiveSubject(deckIds) {
    const active = new Set(habitSettings?.activeDecks || []);
    const state = subjectStarState(deckIds);
    if (state === 'all') {
        deckIds.forEach(id => active.delete(id));
    } else {
        deckIds.forEach(id => active.add(id));
    }
    await applyActiveScopes(active);
}

/** Start either scheduled reviews or one finite new-learning batch; never mix the two. */
async function startPrimaryStudySession(mode, { allowBeyondTarget = false } = {}) {
    if (!requireOnlineStudy()) return;
    const isDueReview = mode === 'due';
    const dueBtn = document.getElementById('review-due-btn');
    const newBtn = document.getElementById('learn-new-btn');
    const activeBtn = isDueReview ? dueBtn : newBtn;

    if (await resumePrimaryStudySession(mode)) return;

    if (pausedPrimaryStudySession && pausedPrimaryStudySession.mode !== mode) {
        const replace = await confirmDialog({
            title: 'Replace paused session?',
            message: 'Your completed cards are already saved, but the unfinished queue will be replaced by this session.',
            confirmText: 'Replace session',
            cancelText: 'Keep paused session'
        });
        if (!replace) return;
        discardPausedPrimaryStudySession();
    }

    if (!isDueReview) {
        const reviews = await getAllReviews();
        const due = reviews.filter(review => new Date(review.fsrsCard.due) <= new Date()).length;
        const today = getLocalDate();
        if (due > 0 && dueWarningAcknowledgedDate !== today) {
            const proceed = await confirmDialog({
                title: 'Reviews are waiting',
                message: `${due} learned card${due === 1 ? ' is' : 's are'} due now. Clearing due reviews first protects older memories and keeps the future workload smaller. You can still learn new material if that is your deliberate choice.`,
                confirmText: 'Learn anyway',
                cancelText: 'Not now'
            });
            if (!proceed) return;
            dueWarningAcknowledgedDate = today;
        }
    }

    if (dueBtn) dueBtn.disabled = true;
    if (newBtn) newBtn.disabled = true;
    if (activeBtn) activeBtn.textContent = 'Loading...';
    try {
        await prepareDailyContent({
            includeDue: isDueReview,
            includeNew: !isDueReview,
            allowBeyondTarget
        });
    } catch (error) {
        console.error(`[Main] Failed to prepare ${mode} session:`, error);
        alert('Review content could not be loaded. Check your connection and try again.');
        await renderReviewButton({ refreshStatus: false });
        return;
    } finally {
        if (activeBtn) activeBtn.textContent = isDueReview ? 'Review' : 'Learn';
    }

    const allReviews = await getAllReviews();
    const currentSettings = habitSettings;
    const status = await getHabitStatus();
    lastHabitStatus = status;
    habitSettings = currentSettings
        ? { ...status.settings, ...currentSettings, activeDecks: currentSettings.activeDecks || [] }
        : status.settings;
    const allCards = await getAllCards();

    const combinedQueue = buildTodayQueue({
        cards: allCards,
        reviews: allReviews,
        activeDeckIds: habitSettings.activeDecks,
        newPerDay: habitSettings.newPerDay,
        newBatchSize: habitSettings.newBatchSize,
        newIntroducedToday: status.today.newCards,
        allowBeyondTarget,
        lastNewChapterScope: lastNewChapterScope()
    });
    const queue = combinedQueue.filter(entry =>
        isDueReview ? entry.fsrsCard !== null : entry.fsrsCard === null);

    if (queue.length === 0) {
        await renderReviewButton({ refreshStatus: false });
        if (!isDueReview) {
            alert('There are no unseen cards left in the starred scope. Star another chapter or deck to continue learning new material.');
        }
        return;
    }

    enterStudyArea(['home', isDueReview ? 'Due review' : 'New learning']);
    currentPrimaryStudyMode = mode;
    pausedPrimaryStudySession = null;
    if (!isDueReview) rememberNewChapterScope(cardChapterScope(queue[0].card));
    startTodaySession(queue, onSessionComplete, renderStudyCardBreadcrumb, {
        onProgress: persistCurrentPrimaryStudySession
    });
    persistCurrentPrimaryStudySession();
}

/**
 * Review a single deck's due + new cards (used by the tree — no breadcrumb nav).
 * The Study tab is the exit back to the deck list.
 */
async function reviewDeck(deck) {
    if (!requireOnlineStudy()) return;
    discardPausedPrimaryStudySession();
    const allCards = await getAllCards();
    const hasCards = allCards.some(c => c.deckName === deck.id || c.source?.repo === deck.id);
    if (!hasCards) return;

    isInStudySession = true;
    setHomeReviewVisible(false);
    currentStudyFile = deck.id.split('/').pop();

    document.getElementById('topics-grid')?.classList.add('hidden');
    document.getElementById('dashboard')?.classList.add('hidden');
    document.getElementById('study-area')?.classList.remove('hidden');
    document.getElementById('session-complete')?.classList.add('hidden');

    updateDeckBreadcrumb();
    setupStudyEventListeners();

    await startSession(deck.id, null, onSessionComplete, renderStudyCardBreadcrumb);
}

async function startStudySession(deckId, fileFilter, displayFileName) {
    if (!requireOnlineStudy()) return;
    discardPausedPrimaryStudySession();
    isInStudySession = true;
    setHomeReviewVisible(false);
    currentStudyFile = displayFileName;

    // Update URL with study state
    const url = new URL(window.location);
    url.searchParams.set('study', 'true');
    url.searchParams.set('file', fileFilter);
    history.pushState({
        deck: currentDeck.id,
        path: [...currentPath],
        study: true,
        file: fileFilter
    }, '', url);

    // Update breadcrumb to show filename
    updateDeckBreadcrumb();

    // Hide topics grid, show study area
    const topicsGrid = document.getElementById('topics-grid');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    topicsGrid.classList.add('hidden');
    document.getElementById('today-hero')?.classList.add('hidden');
    studyArea.classList.remove('hidden');
    sessionComplete.classList.add('hidden');

    // Setup event listeners for study session
    setupStudyEventListeners();

    // Callback when current card changes - update breadcrumb with file name
    const onCardChange = (card) => {
        renderStudyCardBreadcrumb(card);
        if (card && card.source?.file) {
            // Extract filename without extension from card's source
            const filePath = card.source.file;
            const fileName = filePath.split('/').pop().replace('.md', '');
            currentStudyFile = fileName;
            updateDeckBreadcrumb();
        }
    };

    // Start the session
    await startSession(deckId, fileFilter, onSessionComplete, onCardChange);
}

/**
 * Exit study session and return to folder view
 * @param {boolean} skipRender - If true, skip rendering (used when navigating away entirely)
 */
async function exitStudySession(skipRender = false) {
    const wasDrillAll = isDrillAll;

    isInStudySession = false;
    currentStudyFile = null;
    isDrillAll = false;
    currentPrimaryStudyMode = null;
    pausedPrimaryStudySession = null;
    clearStudySession();

    // Cleanup study session state
    cleanupStudySession();

    // Remove study listeners
    removeStudyEventListeners();

    // Hide study area, show topics grid
    const topicsGrid = document.getElementById('topics-grid');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    studyArea.classList.add('hidden');
    sessionComplete.classList.add('hidden');
    topicsGrid.classList.remove('hidden');

    // If skipping render, just cleanup and return (used when navigating to home)
    if (skipRender) {
        return;
    }

    // Drill-all runs from the home level with no currentDeck — always return home
    if (wasDrillAll || !currentDeck) {
        setHomeReviewVisible(true);
        updateDeckBreadcrumb();
        await loadRepositories();
        return;
    }

    // Update URL - remove study params but keep deck/path
    const url = new URL(window.location);
    url.searchParams.delete('study');
    url.searchParams.delete('file');
    history.pushState({ deck: currentDeck.id, path: [...currentPath] }, '', url);

    // Update breadcrumb (removes filename)
    updateDeckBreadcrumb();

    // Refresh reviews cache to get updated progress from study session
    allReviewsCache = await getAllReviews();

    // Refresh the folder view to show updated progress
    renderCurrentLevel();
}

/**
 * Called when study session is complete
 */
function onSessionComplete() {
    currentPrimaryStudyMode = null;
    pausedPrimaryStudySession = null;
    clearStudySession();
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');

    studyArea.classList.add('hidden');
    sessionComplete.classList.remove('hidden');

    // Show streak/XP/goal status on the complete screen (best-effort)
    const habitLine = document.getElementById('session-habit-line');
    if (habitLine) {
        habitLine.textContent = '';
        getHabitStatus().then(status => {
            lastHabitStatus = status;
            const currentSettings = habitSettings;
            habitSettings = currentSettings
                ? { ...status.settings, ...currentSettings, activeDecks: currentSettings.activeDecks || [] }
                : status.settings;
            updateStreakBadge(status);
            const parts = [];
            if (status.streak > 0) parts.push(`\u{1F525} ${status.streak}-day streak`);
            parts.push(`+${status.today.xp} XP today`);
            parts.push(status.today.goalMet ? 'daily goal met ✓' : `${status.today.reviews}/${status.settings.dailyGoal} toward daily goal`);
            habitLine.textContent = parts.join(' · ');
            updateSessionCompletionActions(status);
            renderReviewButton({ refreshStatus: false }).catch(() => {});
        }).catch(() => {});
    }
}

async function updateSessionCompletionActions(status) {
    const learnMore = document.getElementById('session-learn-more');
    if (!learnMore) return;
    const active = habitSettings?.activeDecks || [];
    if (active.length === 0) {
        learnMore.classList.add('hidden');
        return;
    }

    const { batchSize, targetReached, nextBatch } = newLearningPlan({
        newPerDay: habitSettings?.newPerDay,
        newBatchSize: habitSettings?.newBatchSize,
        newIntroducedToday: status?.today?.newCards
    });

    const [cards, reviews, decks] = await Promise.all([getAllCards(), getAllReviews(), getAllDecks()]);
    const availability = freshCardAvailability({
        cards,
        reviews,
        activeDeckIds: active,
        decks
    });
    if (availability.fullyKnown && availability.freshCount === 0) {
        learnMore.classList.add('hidden');
        return;
    }

    const requestedBatch = targetReached ? batchSize : nextBatch;
    const visibleBatch = availability.fullyKnown
        ? Math.min(requestedBatch, availability.freshCount)
        : requestedBatch;

    learnMore.textContent = 'Learn';
    learnMore.title = `Introduce up to ${visibleBatch} new card${visibleBatch === 1 ? '' : 's'}`;
    learnMore.dataset.allowBeyondTarget = targetReached ? 'true' : 'false';
    learnMore.classList.remove('hidden');
}

/**
 * Setup event listeners for study mode
 */
function setupStudyEventListeners() {
    // Reveal button
    const revealBtn = document.getElementById('reveal-btn');
    if (revealBtn) {
        revealBtn.onclick = () => {
            if (requireOnlineStudy()) revealAnswer();
        };
    }

    // Grade buttons
    document.querySelectorAll('.grade-btn').forEach(btn => {
        btn.onclick = () => {
            if (!requireOnlineStudy()) return;
            const grade = parseInt(btn.dataset.grade);
            gradeCard(grade);
        };
    });

    updateConnectionStatus();
    // Keyboard listener
    document.addEventListener('keydown', handleStudyKeydown);
}

/**
 * Remove study event listeners
 */
function removeStudyEventListeners() {
    document.removeEventListener('keydown', handleStudyKeydown);
}

/**
 * Handle keyboard events during study session
 */
function handleStudyKeydown(event) {
    if (!isInStudySession) return;

    const sessionComplete = document.getElementById('session-complete');
    if (event.code === 'Space' && !sessionComplete?.classList.contains('hidden')) {
        // Preserve native Space activation when the user has deliberately
        // focused one of the completion-screen actions.
        if (event.target?.closest?.('#session-complete button, #session-complete a')) return;
        event.preventDefault();
        if (!event.repeat) document.getElementById('session-back-home')?.click();
        return;
    }

    const state = getState();

    if (event.code === 'Space') {
        event.preventDefault();
        if (!state.isRevealed) {
            if (!requireOnlineStudy()) return;
            revealAnswer();
        }
    } else if (state.isRevealed && GradeKeys[event.key]) {
        event.preventDefault();
        if (!requireOnlineStudy()) return;
        gradeCard(GradeKeys[event.key]);
    }
}

/**
 * Navigate to a folder (inline breadcrumb navigation)
 */
function navigateToFolder(folderName) {
    currentPath.push(folderName);

    // Clear search when navigating to a folder
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // Update URL to persist navigation state
    const url = new URL(window.location);
    url.searchParams.set('path', currentPath.join('/'));
    console.log('[Navigation] navigateToFolder pushState:', url.toString());
    // Use pushState to create a new history entry for folder navigation
    history.pushState({ deck: currentDeck.id, path: [...currentPath], category: currentCategory }, '', url);

    updateDeckBreadcrumb();
    renderCurrentLevel();
}

/**
 * Navigate to a specific path (for breadcrumb clicks)
 */
function navigateToPath(targetPath) {
    currentPath = [...targetPath];

    // Clear search when navigating via breadcrumb
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // Update URL to persist navigation state
    const url = new URL(window.location);
    if (targetPath.length > 0) {
        url.searchParams.set('path', targetPath.join('/'));
    } else {
        url.searchParams.delete('path');
    }
    // Use pushState to create a new history entry for breadcrumb navigation
    history.pushState({ deck: currentDeck.id, path: [...currentPath], category: currentCategory }, '', url);

    updateDeckBreadcrumb();
    renderCurrentLevel();
}

/**
 * Create a folder card element
 */
function createFolderCard(folderName, folderContent, allReviews) {
    // Recursively count all cards in this folder and subfolders
    function countCardsInFolder(content) {
        let total = 0;

        // Count cards in files
        for (const cards of Object.values(content.files)) {
            total += cards.length;
        }

        // Count cards in subfolders
        for (const subfolder of Object.values(content.folders)) {
            total += countCardsInFolder(subfolder);
        }

        return total;
    }

    // Recursively get all cards in this folder and subfolders
    function getAllCardsInFolder(content) {
        let allCards = [];

        // Get cards from files
        for (const cards of Object.values(content.files)) {
            allCards.push(...cards);
        }

        // Get cards from subfolders
        for (const subfolder of Object.values(content.folders)) {
            allCards.push(...getAllCardsInFolder(subfolder));
        }

        return allCards;
    }

    // Count reviewed cards in this folder (cards that have been reviewed at least once)
    function countReviewedCardsInFolder(content) {
        let reviewedCount = 0;

        // Count reviewed cards in files
        for (const cards of Object.values(content.files)) {
            reviewedCount += cards.filter(card => allReviews.find(r => r.cardHash === card.hash)).length;
        }

        // Count reviewed cards in subfolders
        for (const subfolder of Object.values(content.folders)) {
            reviewedCount += countReviewedCardsInFolder(subfolder);
        }

        return reviewedCount;
    }

    const totalCards = countCardsInFolder(folderContent);
    const reviewedCards = countReviewedCardsInFolder(folderContent);
    const allCardsInFolder = getAllCardsInFolder(folderContent);

    const card = document.createElement('div');
    card.className = 'project-card folder-card';
    card.style.cursor = 'pointer';
    card.onclick = () => navigateToFolder(folderName);

    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Add reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirmDialog({
            title: 'Reset folder',
            message: `Reset all cards in "${folderName}"? This will mark all cards as due for review.`,
            confirmText: 'Reset',
            danger: true,
        });
        if (ok) {
            // Build folder path
            const folderPath = [...currentPath, folderName].join('/');
            const { refreshDeck } = await import('./storage.js');
            await refreshDeck(currentDeck.id, folderPath);
            // Refresh reviews cache and re-render
            allReviewsCache = await getAllReviews();
            renderCurrentLevel();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Add review button (gavel)
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'card-review-btn';
    reviewBtn.title = 'Review';
    reviewBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/gavel.png" alt="Review">`;
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Build folder path for filtering and start inline study session
        const folderPath = [...currentPath, folderName].join('/');
        startStudySession(currentDeck.id, folderPath, folderName);
    };
    btnContainer.appendChild(reviewBtn);

    // No delete button for folders - managed via git

    // Retained = cards with a review whose due date is still in the future
    const now = new Date();
    const retainedCards = allCardsInFolder.filter(card => {
        const review = allReviews.find(r => r.cardHash === card.hash);
        return review && new Date(review.fsrsCard.due) > now;
    }).length;
    const progressPercent = totalCards > 0 ? Math.round((retainedCards / totalCards) * 100) : 0;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(folderName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

/**
 * Create a subdeck card element (for individual markdown files)
 */
function createSubdeckCard(subdeck) {
    const totalCards = subdeck.cards.length;
    const reviewedCards = subdeck.reviews.size;

    // Count new cards (never reviewed) - these are always due
    const newCards = totalCards - reviewedCards;

    // Count due cards (reviewed cards that are due now)
    const now = new Date();
    let dueReviewedCards = 0;
    subdeck.reviews.forEach(review => {
        if (new Date(review.fsrsCard.due) <= now) {
            dueReviewedCards++;
        }
    });

    // Total due = new cards + reviewed cards that are due
    const dueCards = newCards + dueReviewedCards;

    const card = document.createElement('div');
    card.className = 'project-card file-card';
    card.style.cursor = 'pointer'; // File cards are clickable to start review
    card.onclick = () => {
        // Start inline study session (no page navigation)
        const displayName = subdeck.fileName.replace('.md', '');
        startStudySession(subdeck.deckId, subdeck.fullPath, displayName);
    };

    // Extract just the filename from the path
    const displayName = subdeck.fileName.split('/').pop().replace('.md', '');
    const description = `${totalCards} card${totalCards !== 1 ? 's' : ''}`;

    // Add button container (top right)
    const btnContainer = document.createElement('div');
    btnContainer.className = 'card-buttons';

    // Add reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset-btn';
    resetBtn.title = 'Reset progress';
    resetBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}icons/refresh.png" alt="Reset">`;
    resetBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await confirmDialog({
            title: 'Reset file',
            message: `Reset all cards in "${displayName}"? This will mark all cards as due for review.`,
            confirmText: 'Reset',
            danger: true,
        });
        if (ok) {
            // Use file path for filtering
            const { refreshDeck } = await import('./storage.js');
            await refreshDeck(subdeck.deckId, subdeck.fullPath);
            // Refresh reviews cache and re-render
            allReviewsCache = await getAllReviews();
            renderCurrentLevel();
        }
    };
    btnContainer.appendChild(resetBtn);

    // Retained = reviewed cards whose due date is still in the future
    const retainedCards = reviewedCards - dueReviewedCards;
    const progressPercent = totalCards > 0 ? Math.round((retainedCards / totalCards) * 100) : 0;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'project-content';
    contentDiv.innerHTML = `
        <h3 class="project-title">${escapeHtml(displayName)}</h3>
        <p class="project-description">
            ${escapeHtml(description)}
        </p>
        <div class="project-stats">
            <span class="progress-label">Progress:</span>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-percent">${progressPercent}%</span>
        </div>
    `;

    card.appendChild(btnContainer);
    card.appendChild(contentDiv);
    return card;
}

// Initialize on load - only if topics-grid element exists (i.e., we're on index.html)
if (document.getElementById('topics-grid')) {
    init();
}

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
    getSupersededRepos,
    getAllTopics,
    getStats,
    initDB,
    saveCards,
    saveRepoMetadata,
    syncChapterProgress
} from './storage.js';
import {
    loadRepository,
    loadRepositoryFiles,
    loadRepositoryMetadata,
    removeRepository,
    syncRepository
} from './repo-manager.js';
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
import {
    clearStudySession,
    getStudySession,
    remapStudySessionRepositories,
    saveStudySession,
    studySessionMatchesActiveScope
} from './session-client.js';
import { renderDashboard } from './dashboard.js';
import { getReminderPreferences, isIOSDevice, isStandalone, subscribeToPush, unsubscribeFromPush, updateAppBadge } from './push-client.js';
import { renderBrowsableCards } from './card-browser.js';
import { evictLegacyBlobLocalStorage } from './browser-storage.js';
import { sortDeckIdsByCurriculum } from './deck-order.js';
import {
    buildChapterProgressSnapshot,
    chapterProgressTargets
} from './chapter-progress.js';
import { buildChapterContinuation, partitionScopedReviewCards } from './scoped-review.js';
import {
    collectionSnapshotForRender,
    commitCollectionSnapshot
} from './collection-navigation.js';
import { installAvailableDependencyDecks } from './dependency-install.js';
import { remapRepositoryScopes, scopesWithoutRepositories } from './collection-reconciliation.js';
import {
    chapterForFile,
    chapterGraph,
    curriculumDirectory,
    curriculumGraph,
    curriculumLayerGraph,
    curriculumLayerWindow,
    curriculumMaps,
    curriculumNeighborhood,
    dependencyPlan,
    focusedCurriculumGraph,
    layoutCurriculumGraphElk,
    layoutCurriculumGraph,
    loadCurriculumIndex,
    reloadCurriculumIndex,
    subjectDeckGraph,
    subjectOverviewGraph
} from './curriculum.js';
import {
    curriculumRegistryForView,
    getCurriculumRegistrySources,
    saveCurriculumRegistrySources
} from './curriculum-registry.js';
import { generationJobForDraft, titleForSubject, validateCurriculumDraft } from './curriculum-builder.js';
import {
    generationPullRequestActionLabel,
    generationRequestName,
    generationStatusLabel,
    loadPullRequestCurriculum,
    normalizeGenerationRequest,
    pullRequestCoordinates,
    reconcileGenerationRequestStatuses,
    sortGenerationRequestsByInitiatedAt,
    summarizeGenerationActivity
} from './generation-activity.js';
import { curriculumDeckProgressStates } from './curriculum-progress.js';
import {
    chapterContentGenerationScope,
    deckNeedsChapterCurriculum
} from './deck-generation-contract.js';
import {
    generationJobForChapterContent,
    generationJobForChapterCurriculum,
    generationJobForDeck,
    getGenerationPreferences,
    saveGenerationPreferences
} from './generation-preferences.js';
import {
    AI_PROVIDER_DEFINITIONS,
    connectAIProvider,
    disconnectAIProvider,
    generationEligibleModels,
    listAIProviders,
    loadAIProviderModels,
    reasoningEffortsForProvider
} from './ai-provider-client.js';

// Card editor imports
import { initDeckCreator, openDeckCreator } from './deck-creator.js';
import { initFolderCreator, openFolderCreator } from './folder-creator.js';
import { initCardEditor, openCardEditorCreate, openCardEditorEdit } from './card-editor.js';
import { confirmDialog } from './confirm-modal.js';
import './card-editor.css';

const WORKFLOW_COMMIT = import.meta.env.VITE_APP_COMMIT || '0000000000000000000000000000000000000000';

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
        const curriculumIndexPromise = loadCurriculumIndex()
            .catch(error => {
                console.warn('[Curriculum] Public index unavailable:', error);
                return null;
            });
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
        curriculumIndex = await curriculumIndexPromise;
        const repositoryRenames = window.__repositoryRenames || [];
        const renameHashMapping = window.__repositoryRenameHashMapping || new Map();
        const remappedSession = remapStudySessionRepositories(
            pausedPrimaryStudySession,
            repositoryRenames,
            renameHashMapping
        );
        const sessionWasRemapped = JSON.stringify(remappedSession) !== JSON.stringify(pausedPrimaryStudySession);
        pausedPrimaryStudySession = remappedSession;
        const retiredRepoIds = window.__retiredRepoIds || [];
        const activeDecks = remapRepositoryScopes(
            scopesWithoutRepositories(habitSettings?.activeDecks || [], retiredRepoIds),
            repositoryRenames
        );
        if (JSON.stringify(activeDecks) !== JSON.stringify(habitSettings?.activeDecks || [])) {
            habitSettings = await saveSettings({ activeDecks });
        }
        if (sessionWasRemapped && pausedPrimaryStudySession) {
            await saveStudySession(pausedPrimaryStudySession);
        }
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

        const initialCurriculumState = curriculumStateFromUrl();
        if (initialCurriculumState) {
            const restored = restoreCurriculumNavigationHistory(history.state, initialCurriculumState);
            Object.assign(curriculumViewState, restored || initialCurriculumState);
            await showMainView('curriculum');
            writeCurriculumHistory({ replace: true });
        }

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
        const grid = document.getElementById('topics-grid');
        if (grid) {
            grid.innerHTML = '<div class="error">Account data could not be loaded. Check your connection and reload.</div>';
        }
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
    const { loadReposFromD1, removeRepo } = await import('./storage.js');
    const { loadRepository, loadRepositoryMetadata } = await import('./repo-manager.js');

    const repos = await loadReposFromD1();
    if (!repos || repos.length === 0) {
        console.log('[Main] No repos found in D1');
        return;
    }

    console.log(`[Main] Loading ${repos.length} repos from D1:`, repos.map(r => r.id));

    const failedRepos = [];
    const evicted = [];
    const repositoryRenames = [];
    const renameHashMapping = new Map();

    // Load only repo metadata + file trees in parallel. Card bodies are lazy.
    await Promise.all(repos.map(async (repo) => {
        const displayName = repo.id.split('/').pop();
        try {
            await loadRepositoryMetadata(repo.id);
            console.log(`[Main] Loaded repo metadata: ${repo.id}`);
        } catch (error) {
            if (error.status === 404) {
                const reason = error.movedTo ? `moved to ${error.movedTo}` : 'not found';
                if (error.movedTo) {
                    try {
                        // A one-time full load is intentional: old namespace
                        // aliases migrate review hashes before membership moves.
                        const moved = await loadRepository(error.movedTo);
                        repositoryRenames.push({ from: repo.id, to: moved.deck.id });
                        for (const card of moved.cards) {
                            for (const alias of card.legacyHashes || []) {
                                renameHashMapping.set(alias, card.hash);
                            }
                        }
                        await removeRepo(repo.id, { preserveReviews: true });
                        console.log(`[Main] Migrated renamed repository ${repo.id} -> ${moved.deck.id}`);
                        return;
                    } catch (moveError) {
                        console.error(`[Main] Failed to migrate renamed repo ${repo.id}:`, moveError);
                        failedRepos.push({ id: repo.id, name: displayName, error: moveError.message });
                        return;
                    }
                }

                console.warn(`[Main] Auto-removed stale repo ${repo.id} (${reason})`);
                evicted.push({ id: repo.id, name: displayName, movedTo: null });
                try { await removeRepo(repo.id); } catch (e) { /* best-effort */ }
            } else {
                // Transient failure (rate limit, auth, network) — keep the row, show placeholder
                console.error(`[Main] Failed to load repo ${repo.id}:`, error);
                failedRepos.push({ id: repo.id, name: displayName, error: error.message });
            }
        }
    }));

    const superseded = await getSupersededRepos();
    const retiredRepoIds = [];
    for (const repo of superseded) {
        try {
            await removeRepo(repo.id, { preserveReviews: true });
            retiredRepoIds.push(repo.id);
            console.log(`[Main] Retired superseded repository membership: ${repo.id}`);
        } catch (error) {
            console.error(`[Main] Failed to retire superseded repository ${repo.id}:`, error);
        }
    }

    // Stash broken repos and evictions so loadRepositories can surface them
    window.__failedRepos = failedRepos;
    window.__evictedRepos = evicted;
    window.__retiredRepoIds = retiredRepoIds;
    window.__repositoryRenames = repositoryRenames;
    window.__repositoryRenameHashMapping = renameHashMapping;

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
let repositoryRenderGeneration = 0;
let collectionRenderSnapshot = null;
async function loadRepositories({ refreshCollection = true } = {}) {
    const renderGeneration = ++repositoryRenderGeneration;
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
        const navigationSnapshot = collectionSnapshotForRender(
            collectionRenderSnapshot,
            refreshCollection
        );
        let allCards;
        let allReviews;
        let allDecks;
        let allChapterProgress;
        let nextCollectionSnapshot = null;
        if (navigationSnapshot) {
            ({ allCards, allReviews, allDecks, allChapterProgress } = navigationSnapshot);
        } else {
            // Get a fresh collection snapshot only for startup or an explicit
            // collection/state mutation. Plain row navigation reuses it.
            console.log('Loading repositories...');
            allCards = await getAllCards();
            console.log('All cards:', allCards.length);
            allReviews = await getAllReviews();
            console.log('All reviews:', allReviews.length);
            allDecks = await getAllDecks();
            console.log('All decks:', allDecks.length);
            allChapterProgress = await getAllChapterProgress();
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
            nextCollectionSnapshot = { allCards, allReviews, allDecks, allChapterProgress };
        }

        // Startup, navigation, and scope mutations may overlap repository
        // refreshes. Only the newest invocation may render; otherwise a stale
        // legacy category render can append cards beneath the column viewer.
        const renderIsCurrent = renderGeneration === repositoryRenderGeneration
            && currentMainView === 'decks';
        collectionRenderSnapshot = commitCollectionSnapshot(
            collectionRenderSnapshot,
            nextCollectionSnapshot,
            {
                renderGeneration,
                latestGeneration: repositoryRenderGeneration,
                isDeckView: currentMainView === 'decks'
            }
        );
        if (!renderIsCurrent) return;

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
            document.getElementById('view-tabs')?.classList.toggle('hidden', !curriculumIndex);
            if (isLoggedIn) {
                grid.innerHTML = '<div class="loading">Search for a GitHub repository and click + to add it.</div>';
            } else {
                grid.innerHTML = '<div class="loading">No example deck found.</div>';
            }
            return;
        }

        // Show controls when there are decks
        controlsBar.classList.toggle('hidden', currentMainView !== 'decks');
        document.getElementById('view-tabs')?.classList.remove('hidden');

        const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
        const breadcrumb = document.getElementById('deck-breadcrumb');

        // Columns is the sole collection view. Legacy tree/card renderers stay
        // available only to restore old in-flight study URLs and can no longer
        // be selected by stale category state.
        deckViewMode = 'columns';
        currentCategory = null;
        currentDeck = null;
        grid.classList.remove('tree-mode');
        grid.classList.add('columns-mode');
        renderColumnsView(displayDecks, allCards, allReviews, allChapterProgress, searchTerm, grid, {
            panes: previousColumnScroll,
            left: previousColumnsLeft
        });

        updateDeckBreadcrumb();

        // Refresh the Today hero whenever the grid re-renders (no-op until
        // habit settings have loaded in init)
        if (habitSettings) renderReviewButton({ refreshStatus: false });

    } catch (error) {
        console.error('Error loading repositories:', error);
        if (renderGeneration !== repositoryRenderGeneration
            || currentMainView !== 'decks') return;
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
const SETTINGS_IMG = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
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
    const scopedCards = allCards.filter(filterFn);
    const isChapterContinuation = Array.isArray(fileSpecs) && fileSpecs.length === 1;
    const continuation = isChapterContinuation
        ? buildChapterContinuation(scopedCards, allReviews)
        : null;
    const queue = continuation
        ? continuation.queue
        : (() => {
            const { due, fresh } = partitionScopedReviewCards(scopedCards, allReviews);
            return [...interleaveDueCards(due), ...fresh];
        })();
    if (queue.length === 0) {
        alert(isChapterContinuation
            ? 'You have introduced every card in this chapter. Scheduled cards will appear under Review when they are due.'
            : 'Nothing to review here right now — all caught up.');
        return;
    }
    discardPausedPrimaryStudySession();
    try {
        // Prepare and render the first card while the collection remains on
        // screen. If parsing/rendering ever fails, the learner should see a
        // useful error at home, never an empty 0/0 study shell.
        startTodaySession(queue, onSessionComplete, renderStudyCardBreadcrumb, continuation
            ? {
                fileFilter: fileSpecs[0].path,
                scopeTotalCards: continuation.totalCards,
                introducedCards: continuation.introducedCards
            }
            : {});
        enterStudyArea(breadcrumb || ['home', label]);
    } catch (error) {
        cleanupStudySession();
        console.error('[Main] Failed to start scoped review:', error);
        alert('This chapter could not be opened. Sync the deck and try again.');
    }
}

/** Fetch and parse card bodies only when a review action needs them. */
async function ensureRepositoriesLoaded(repoIds, onProgress = null, fileSpecs = null) {
    const unique = [...new Set((repoIds || []).filter(Boolean))];
    if (unique.length === 0) {
        onProgress?.({ completed: 0, total: 0 });
        return;
    }
    const decks = new Map((await getAllDecks()).map(deck => [deck.id, deck]));
    const requestedFiles = fileSpecs || unique.filter(repoId => !repoId.startsWith('local/')).flatMap(repoId =>
        (decks.get(repoId)?.files || []).map(file => ({
            repo: repoId,
            path: typeof file === 'string' ? file : file.path
        }))
    );
    const files = requestedFiles.filter(({ repo }) => !repo.startsWith('local/'));
    let completed = 0;
    onProgress?.({ completed, total: files.length });
    await mapWithConcurrency(files, 4, async ({ repo, path }) => {
        const cards = await loadRepositoryFiles(repo, [path]);
        if (cards.length === 0) {
            throw new Error(`No flashcards were loaded from ${repo}:${path}`);
        }
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

function showTransientStatus(message) {
    const status = document.getElementById('connection-status');
    if (!status) return;
    const previous = status.textContent;
    status.textContent = message;
    window.setTimeout(() => {
        if (status.textContent === message) status.textContent = previous;
    }, 4000);
}

async function syncDeckFromGitHub(deckId, button = null) {
    if (!deckId || deckId.startsWith('local/')) return;
    const previousHtml = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.textContent = '…';
        button.setAttribute('aria-label', 'Syncing latest version from GitHub');
    }
    try {
        const { changes } = await syncRepository(deckId);
        const changedFiles = new Set([
            ...(changes?.changed || []),
            ...(changes?.removed || [])
        ]);
        if (pausedPrimaryStudySession?.queue?.some(entry =>
            entry.repo === deckId && changedFiles.has(entry.filepath)
        )) {
            cleanupStudySession();
            pausedPrimaryStudySession = {
                ...pausedPrimaryStudySession,
                inMemory: false
            };
            currentPrimaryStudyMode = null;
            await saveStudySession(pausedPrimaryStudySession);
        }
        await loadRepositories();
        const updated = (changes?.added?.length || 0)
            + (changes?.changed?.length || 0)
            + (changes?.removed?.length || 0);
        showTransientStatus(updated
            ? `Synced ${deckId.split('/').pop()}: ${updated} chapter file${updated === 1 ? '' : 's'} updated`
            : `${deckId.split('/').pop()} is already current`);
        return true;
    } catch (error) {
        console.error('[Main] Failed to sync repository:', deckId, error);
        showTransientStatus(`Could not sync ${deckId.split('/').pop()}`);
        alert(`Could not sync the latest GitHub version: ${error.message}`);
        return false;
    } finally {
        if (button?.isConnected) {
            button.disabled = false;
            button.innerHTML = previousHtml;
            button.setAttribute('aria-label', 'Sync latest version from GitHub');
        }
    }
}

function closeDeckActionsModal({ restoreFocus = true } = {}) {
    document.getElementById('deck-actions-modal')?.classList.add('hidden');
    const trigger = activeDeckActionsTrigger;
    activeDeckActions = null;
    activeDeckActionsTrigger = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function appendDeckAction(body, {
    label,
    description,
    danger = false,
    onClick
}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `deck-action-button${danger ? ' danger' : ''}`;
    const labelElement = document.createElement('span');
    labelElement.className = 'deck-action-label';
    labelElement.textContent = label;
    const descriptionElement = document.createElement('span');
    descriptionElement.className = 'deck-action-description';
    descriptionElement.textContent = description;
    button.append(labelElement, descriptionElement);
    button.onclick = () => onClick(button);
    body.appendChild(button);
    return button;
}

function openDeckActionsModal({ deckId, deckName, subject, curriculumDeck }, trigger = null) {
    const modal = document.getElementById('deck-actions-modal');
    const title = document.getElementById('deck-actions-title');
    const path = document.getElementById('deck-actions-path');
    const body = document.getElementById('deck-actions-body');
    if (!modal || !title || !path || !body) return;

    activeDeckActions = { deckId, deckName, subject, curriculumDeck };
    activeDeckActionsTrigger = trigger;
    title.textContent = deckName;
    path.textContent = `~ / home / ${subject} / ${deckName}`;
    body.innerHTML = '';

    const review = () => {
        const target = activeDeckActions;
        closeDeckActionsModal({ restoreFocus: false });
        startScopedReview(
            card => (card.source?.repo || card.deckName) === target.deckId,
            target.deckName,
            ['home', target.subject, target.deckName],
            [target.deckId]
        );
    };
    const firstAction = appendDeckAction(body, {
        label: 'Review this deck',
        description: 'Study due and new cards from every chapter in this deck.',
        onClick: review
    });

    if (hasCurriculumDependencies(curriculumDeck)) {
        appendDeckAction(body, {
            label: 'View prerequisite path',
            description: 'See required and recommended preparation in the curriculum.',
            onClick: () => {
                const target = activeDeckActions;
                closeDeckActionsModal({ restoreFocus: false });
                openDependencyModal(target.curriculumDeck.id);
            }
        });
    }

    if (!deckId.startsWith('local/')) {
        appendDeckAction(body, {
            label: 'Sync latest version from GitHub',
            description: 'Update changed chapters and figures without resetting review history.',
            onClick: async button => {
                if (await syncDeckFromGitHub(deckId, button)) {
                    closeDeckActionsModal({ restoreFocus: false });
                }
            }
        });
    }

    appendDeckAction(body, {
        label: 'Reset learning progress',
        description: 'Mark every card in this deck as new.',
        danger: true,
        onClick: () => {
            closeDeckActionsModal({ restoreFocus: false });
            resetScope([{ deckId }], `Reset all progress in "${deckName}"?`);
        }
    });

    if (!deckId.startsWith('local/')) {
        appendDeckAction(body, {
            label: 'Remove from collection',
            description: 'Remove this GitHub deck from your collection.',
            danger: true,
            onClick: () => {
                closeDeckActionsModal({ restoreFocus: false });
                deleteScope([deckId], `Remove "${deckName}" from your collection?`);
            }
        });
    }

    modal.classList.remove('hidden');
    firstAction.focus();
}

async function clearRepositoryScopes(deckIds) {
    if (!habitSettings || deckIds.length === 0) return;
    const activeDecks = scopesWithoutRepositories(
        habitSettings.activeDecks || [],
        deckIds
    );
    if (activeDecks.length === (habitSettings.activeDecks || []).length) return;
    habitSettings = await saveSettings({ activeDecks });
    if (pausedPrimaryStudySession
        && !studySessionMatchesActiveScope(pausedPrimaryStudySession, activeDecks)) {
        pausedPrimaryStudySession = null;
        await clearStudySession();
    }
}

async function deleteScope(deckIds, message) {
    const ok = await confirmDialog({ title: 'Remove from collection', message, confirmText: 'Remove', danger: true });
    if (!ok) return;
    const removedDeckIds = [];
    for (const id of deckIds) {
        try {
            await removeRepository(id);
            removedDeckIds.push(id);
        } catch (e) {
            console.error('[Main] delete failed', id, e);
        }
    }
    await clearRepositoryScopes(removedDeckIds);
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
                            title: 'Drill every card in this chapter',
                            onBody: () => startScopedReview(c => (c.source?.repo || c.deckName) === deckId && c.source?.file === file, chName, null, [deckId], [{ repo: deckId, path: file }]),
                            actions: [
                                { cls: 'tree-act', title: 'Browse all cards in this chapter (read-only)', html: BROWSE_IMG, onclick: () => openChapterBrowser({ deckId, file, subject, deckName, chapterName: chName }) },
                                { cls: 'tree-act', title: 'Drill every card in this chapter', html: GAVEL_IMG, onclick: () => startScopedReview(c => (c.source?.repo || c.deckName) === deckId && c.source?.file === file, chName, null, [deckId], [{ repo: deckId, path: file }]) },
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
let curriculumIndex = null;
let pendingCurriculumSources = [];
let generationRequests = [];
let generationActivityRefreshPromise = null;
let generationActivityPollTimer = null;
let generationActivityLastReconciledAt = 0;
let curriculumPreview = null;
let activeDependencyTarget = null;
let activeDeckActions = null;
let activeDeckActionsTrigger = null;
const curriculumViewState = {
    query: '',
    subject: '',
    includeRecommended: false,
    mode: 'overview',
    hierarchy: 'subject',
    targetId: '',
    parentId: '',
    layerStart: 0,
    anchorId: '',
    position: null
};
let curriculumNavigationHistory = [];
let curriculumNavigationHistoryIndex = -1;

function curriculumDeckForRepository(deckId, subject = null) {
    if (!curriculumIndex) return null;
    const repoName = String(deckId || '').split('/').pop();
    return curriculumIndex.decks.find(deck =>
        deck.deck === repoName && (!subject || deck.subject === subject)) || null;
}

function hasCurriculumDependencies(deck, chapter = null) {
    if (!deck) return false;
    if (chapter && (chapter.prerequisites?.length || chapter.resolved_dependencies?.length)) return true;
    return Boolean(deck.prerequisites?.length || deck.recommended_after?.length);
}

/**
 * One columns row: optional inline star (left), name and compact metadata,
 * then compact contextual actions and a chevron for drillable items. Deck-level
 * commands live behind one labeled settings modal to keep narrow rows legible.
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
        b.onclick = (e) => { e.stopPropagation(); a.onClick(b); };
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
                onClick: () => {
                    columnsSel = { subject, deck: null, chapter: null };
                    loadRepositories({ refreshCollection: false });
                }
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
            const curriculumDeck = curriculumDeckForRepository(deckId, columnsSel.subject);
            return colRow({
                name: deckName,
                star: { glyph: subjectStarGlyph(starState), active: starState !== 'none', title: starState === 'all' ? 'Remove deck from daily focus' : 'Add deck to daily focus', onClick: () => toggleScopes(deckFiles) },
                actions: [{
                    html: SETTINGS_IMG,
                    title: 'Deck settings and actions',
                    onClick: trigger => openDeckActionsModal({
                        deckId,
                        deckName,
                        subject: columnsSel.subject,
                        curriculumDeck
                    }, trigger)
                }],
                hasChildren: true, selected: columnsSel.deck === deckId,
                onClick: () => {
                    columnsSel = { subject: columnsSel.subject, deck: deckId, chapter: null };
                    loadRepositories({ refreshCollection: false });
                }
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
        const curriculumDeck = curriculumDeckForRepository(deckId, columnsSel.subject);
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
            const curriculumChapter = curriculumDeck
                ? chapterForFile(curriculumIndex, curriculumDeck.id, file)
                : null;
            const dependencyAction = hasCurriculumDependencies(curriculumDeck, curriculumChapter)
                ? [{
                    html: '↳',
                    title: 'View chapter prerequisites',
                    onClick: () => openDependencyModal(curriculumDeck.id, curriculumChapter?.id || null)
                }]
                : [];
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
                    ...dependencyAction,
                    { html: BROWSE_IMG, title: 'Browse all cards in this chapter (read-only)', onClick: browse },
                    { html: GAVEL_IMG, title: 'Drill every card in this chapter', onClick: review },
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
                    await clearRepositoryScopes([deck.id]);
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
                await clearRepositoryScopes([failed.id]);
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
    ensureGenerationActivityPolling();

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

    document.getElementById('study-settings-btn')?.addEventListener('click', () => openStudySettings());
    document.getElementById('study-settings-cancel')?.addEventListener('click', closeStudySettings);
    document.getElementById('study-settings-close')?.addEventListener('click', closeStudySettings);
    document.querySelector('#study-settings-modal .modal-overlay')?.addEventListener('click', closeStudySettings);
    document.getElementById('daily-new-target')?.addEventListener('change', reflectCustomTargetField);
    const settingsTabs = [...document.querySelectorAll('[data-settings-tab]')];
    settingsTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activateStudySettingsTab(tab.dataset.settingsTab));
        tab.addEventListener('keydown', event => {
            let nextIndex = null;
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % settingsTabs.length;
            else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + settingsTabs.length) % settingsTabs.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = settingsTabs.length - 1;
            if (nextIndex === null) return;
            event.preventDefault();
            activateStudySettingsTab(settingsTabs[nextIndex].dataset.settingsTab, { focus: true });
        });
    });
    document.addEventListener('generationactivitychange', () => renderGenerationActivitySettings());
    document.getElementById('generation-provider')?.addEventListener('change', () => {
        updateGenerationModelChoices().catch(error => showGenerationModelError(error));
    });
    document.getElementById('generation-model')?.addEventListener('change', syncGenerationReasoningChoices);
    document.getElementById('ai-provider-connect-save')?.addEventListener('click', saveAIProviderConnection);
    document.getElementById('ai-provider-connect-cancel')?.addEventListener('click', closeAIProviderConnectPanel);
    document.getElementById('curriculum-settings-add-source')?.addEventListener('click', () => {
        pendingCurriculumSources.push({
            id: 'new-source',
            name: 'New source',
            repository: '',
            ref: 'master',
            path: 'dist/curriculum.json',
            enabled: true
        });
        renderCurriculumSettingsSources();
    });
    document.getElementById('study-settings-panel')?.addEventListener('submit', saveStudySettingsFromForm);
    document.getElementById('pwa-install-btn')?.addEventListener('click', openPwaInstallGuide);
    document.getElementById('pwa-install-close')?.addEventListener('click', closePwaInstallGuide);
    document.getElementById('pwa-install-done')?.addEventListener('click', closePwaInstallGuide);
    document.querySelector('#pwa-install-modal .modal-overlay')?.addEventListener('click', closePwaInstallGuide);
    document.getElementById('card-browser-close')?.addEventListener('click', closeChapterBrowser);
    document.querySelector('#card-browser-modal .modal-overlay')?.addEventListener('click', closeChapterBrowser);
    document.getElementById('dependency-close')?.addEventListener('click', closeDependencyModal);
    document.querySelector('#dependency-modal .modal-overlay')?.addEventListener('click', closeDependencyModal);
    document.getElementById('deck-actions-close')?.addEventListener('click', closeDeckActionsModal);
    document.querySelector('#deck-actions-modal .modal-overlay')?.addEventListener('click', closeDeckActionsModal);
    document.getElementById('dependency-add-path')?.addEventListener('click', addActiveDependencyPath);
    document.getElementById('dependency-copy-command')?.addEventListener('click', copyMissingGenerationCommands);
    document.getElementById('dependency-request-generation')?.addEventListener('click', requestMissingGeneration);
    document.getElementById('dependency-generate-deck')?.addEventListener('click', requestTargetChapterGeneration);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!document.getElementById('study-settings-modal')?.classList.contains('hidden')) closeStudySettings();
            if (!document.getElementById('pwa-install-modal')?.classList.contains('hidden')) closePwaInstallGuide();
            if (!document.getElementById('card-browser-modal')?.classList.contains('hidden')) closeChapterBrowser();
            if (!document.getElementById('dependency-modal')?.classList.contains('hidden')) closeDependencyModal();
            if (!document.getElementById('deck-actions-modal')?.classList.contains('hidden')) closeDeckActionsModal();
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

    // Main views
    const tabDecks = document.getElementById('tab-decks');
    const tabCurriculum = document.getElementById('tab-curriculum');
    const tabProgress = document.getElementById('tab-progress');
    if (tabDecks) tabDecks.addEventListener('click', () => navigateMainView('decks'));
    if (tabCurriculum) tabCurriculum.addEventListener('click', () => navigateMainView('curriculum'));
    if (tabProgress) tabProgress.addEventListener('click', () => navigateMainView('progress'));

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
async function navigateMainView(view) {
    if (currentMainView === view) return;
    await showMainView(view);
    if (view === 'curriculum') {
        writeCurriculumHistory();
        return;
    }
    const url = new URL(window.location.href);
    for (const key of [
        'view', 'curriculum-mode', 'curriculum-level', 'curriculum-target',
        'curriculum-parent', 'curriculum-subject', 'recommended'
    ]) url.searchParams.delete(key);
    history.pushState({ mainView: view }, '', `${url.pathname}${url.search}${url.hash}`);
}

async function showMainView(view) {
    const dashboard = document.getElementById('dashboard');
    const curriculumView = document.getElementById('curriculum-view');
    const grid = document.getElementById('topics-grid');
    const hero = document.getElementById('today-hero');
    const breadcrumb = document.getElementById('deck-breadcrumb');
    const studyArea = document.getElementById('study-area');
    const sessionComplete = document.getElementById('session-complete');
    const tabDecks = document.getElementById('tab-decks');
    const tabCurriculum = document.getElementById('tab-curriculum');
    const tabProgress = document.getElementById('tab-progress');

    // Leaving the drill surface pauses an unfinished primary session. Decks
    // and Progress are both temporary views, so neither should discard work.
    if (isInStudySession) {
        const paused = await pausePrimaryStudySession();
        if (!paused) await exitStudySession(true);
    }

    currentMainView = view;
    tabDecks?.classList.toggle('active', view === 'decks');
    tabCurriculum?.classList.toggle('active', view === 'curriculum');
    tabProgress?.classList.toggle('active', view === 'progress');

    const controlsBar = document.getElementById('controls-bar');
    setHomeReviewVisible(view === 'decks');

    if (view === 'progress') {
        grid?.classList.add('hidden');
        curriculumView?.classList.add('hidden');
        hero?.classList.add('hidden');
        breadcrumb?.classList.add('hidden');
        studyArea?.classList.add('hidden');
        sessionComplete?.classList.add('hidden');
        controlsBar?.classList.add('hidden');   // Review + toggle + search belong to Decks
        dashboard?.classList.remove('hidden');
        await renderDashboard();
    } else if (view === 'curriculum') {
        grid?.classList.add('hidden');
        dashboard?.classList.add('hidden');
        hero?.classList.add('hidden');
        breadcrumb?.classList.add('hidden');
        studyArea?.classList.add('hidden');
        sessionComplete?.classList.add('hidden');
        controlsBar?.classList.add('hidden');
        curriculumView?.classList.remove('hidden');
        await renderCurriculumView();
    } else {
        dashboard?.classList.add('hidden');
        curriculumView?.classList.add('hidden');
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

function installedCurriculumIds(decks) {
    const ids = new Set();
    for (const deck of decks || []) {
        if (deck.curriculumId) ids.add(deck.curriculumId);
        const subject = subjectSlug(deck.subject);
        const name = String(deck.id || '').split('/').pop();
        if (subject && name) ids.add(`${subject}/${name}`);
    }
    return ids;
}

function curriculumStatus(deck, progressStates) {
    if (deck.nodeType === 'subject') return `${deck.deck_count || 0} decks`;
    if (progressStates.has(deck.id)) {
        return typeof progressStates.get === 'function'
            ? progressStates.get(deck.id)
            : 'learning';
    }
    return deck.repository?.configured || deck.materialized ? 'learning' : 'unavailable';
}

function curriculumEdgeGeometry(source, target, sourceY = null, targetY = null) {
    const x1 = source.x + source.width;
    const y1 = sourceY ?? source.y + source.height / 2;
    const x2 = target.x;
    const y2 = targetY ?? target.y + target.height / 2;
    const headLength = 10;
    const headHalfHeight = 4.25;
    const baseX = x2 - headLength;
    const available = Math.max(1, baseX - x1);
    // Keep the two control handles on their own sides of the inter-column
    // gap. A fixed 44 px minimum made them cross in narrow gaps, producing an
    // abrupt hook on edges with a large vertical displacement.
    const bend = Math.max(12, Math.min(72, available * 0.42));
    return {
        line: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${baseX - bend} ${y2}, ${baseX} ${y2}`,
        head: `M ${baseX} ${y2 - headHalfHeight} L ${x2} ${y2} L ${baseX} ${y2 + headHalfHeight} Z`
    };
}

function curriculumCableEdgeGeometry(source, target, sourceY, targetY, route) {
    const anchorX = route.riseX ?? target.x + 10;
    const targetBottom = target.y + target.height;
    const arrowBaseY = targetBottom + 10;
    // The shared source trunk is rendered separately. Long dependencies rise
    // vertically from the receiving bus stack and enter near the target's
    // bottom-left corner, leaving left-edge ports exclusively to direct edges.
    return {
        line: `M ${anchorX} ${route.y} V ${arrowBaseY}`,
        head: `M ${anchorX - 4.25} ${arrowBaseY} L ${anchorX} ${targetBottom} L ${anchorX + 4.25} ${arrowBaseY} Z`
    };
}

const CURRICULUM_CABLE_LANE_SPACING = 4;
const CURRICULUM_CABLE_TURN_RADIUS = 8;

function curriculumCableTrunkGeometry(trunk) {
    const firstPoint = trunk.rankPoints[0];
    const radius = CURRICULUM_CABLE_TURN_RADIUS;
    const commands = [
        `M ${trunk.descentX} ${trunk.sourceY}`,
        `V ${firstPoint.y - radius}`,
        `C ${trunk.descentX} ${firstPoint.y - radius * 0.4},`,
        `${trunk.descentX + radius * 0.4} ${firstPoint.y},`,
        `${trunk.descentX + radius} ${firstPoint.y}`
    ];
    let currentX = trunk.descentX + radius;
    let currentY = firstPoint.y;
    for (const transition of trunk.transitions) {
        const direction = Math.sign(transition.y - currentY);
        if (!direction) continue;
        const transitionRun = Math.max(1, transition.x - currentX);
        const transitionHeight = Math.abs(transition.y - currentY);
        // Gutter events are spaced one compact lane apart. Keep each turn
        // inside half that spacing so a branch assigned to the following
        // event can join the settled horizontal lane, not the turn itself.
        const transitionRadius = Math.max(1, Math.min(
            CURRICULUM_CABLE_LANE_SPACING / 2,
            transitionRun / 3,
            transitionHeight / 3
        ));
        commands.push(
            `H ${transition.x - transitionRadius}`,
            `Q ${transition.x} ${currentY}, ${transition.x} ${currentY + direction * transitionRadius}`,
            `V ${transition.y - direction * transitionRadius}`,
            `Q ${transition.x} ${transition.y}, ${transition.x + transitionRadius} ${transition.y}`
        );
        currentX = transition.x + transitionRadius;
        currentY = transition.y;
    }
    commands.push(`H ${trunk.x2}`);
    return commands.join(' ');
}

function curriculumCableRouting(layout) {
    const positioned = new Map(layout.nodes.map(node => [node.id, node]));
    const sourceGroups = new Map();
    for (const entry of layout.edges
        .map(edge => ({ edge, source: positioned.get(edge.source), target: positioned.get(edge.target) }))
        .filter(({ source, target }) => Number.isInteger(source?.rank)
            && Number.isInteger(target?.rank)
            && target.rank - source.rank > 1)) {
        const group = sourceGroups.get(entry.source.id) || { source: entry.source, entries: [] };
        group.entries.push(entry);
        sourceGroups.set(entry.source.id, group);
    }
    const groups = [...sourceGroups.values()]
        .map(group => ({
            ...group,
            start: group.source.x + group.source.width,
            end: Math.max(...group.entries.map(({ target }) => target.x)),
            maxTargetRank: Math.max(...group.entries.map(({ target }) => target.rank))
        }))
        .sort((a, b) => (b.maxTargetRank - b.source.rank) - (a.maxTargetRank - a.source.rank)
            || a.start - b.start
            || a.end - b.end);
    const trackOrder = new Map([...groups]
        .sort((a, b) => a.source.rank - b.source.rank
            // Within one column, higher sources are older. Their buses settle
            // into lower tracks and use anchors farther to the left, preserving
            // the convention that the bottommost horizontal lane is oldest.
            || a.source.y - b.source.y
            || a.source.id.localeCompare(b.source.id))
        .map((group, index) => [group.source.id, index]));
    const rankBottom = new Map();
    const rankLeft = new Map();
    const rankRight = new Map();
    for (const node of layout.nodes) {
        if (!Number.isInteger(node.rank)) continue;
        rankBottom.set(node.rank, Math.max(rankBottom.get(node.rank) || 0, node.y + node.height));
        rankLeft.set(node.rank, Math.min(rankLeft.get(node.rank) ?? Infinity, node.x));
        rankRight.set(node.rank, Math.max(rankRight.get(node.rank) || 0, node.x + node.width));
    }
    const entriesByTargetRank = new Map();
    for (const group of groups) {
        for (const entry of group.entries) {
            const peers = entriesByTargetRank.get(entry.target.rank) || [];
            peers.push(entry);
            entriesByTargetRank.set(entry.target.rank, peers);
        }
    }
    for (const peers of entriesByTargetRank.values()) {
        peers.sort((a, b) => a.target.y - b.target.y
            || a.source.y - b.source.y
            || a.source.id.localeCompare(b.source.id));
    }
    const rankYsBySource = new Map(groups.map(group => [group.source.id, new Map()]));
    const transitionXBySourceAndRank = new Map(groups.map(group => [group.source.id, new Map()]));
    const maximumRank = Math.max(0, ...layout.nodes.map(node => node.rank || 0));
    // A rank's y values describe the compact bus stack underneath that column.
    // New buses are inserted above every older continuing bus in their source
    // column.
    for (let rank = 0; rank <= maximumRank; rank += 1) {
        const active = groups
            // Keep a bus in the receiving column through its final target so
            // every long connection can rise into that node's bottom edge.
            .filter(group => group.source.rank <= rank && group.maxTargetRank >= rank)
            // Buses form a persistent stack: the first/oldest bus stays at
            // the bottom, and each bus introduced later is inserted above it.
            .sort((a, b) => trackOrder.get(b.source.id) - trackOrder.get(a.source.id));
        const boundaryBottom = rankBottom.get(rank) || 0;
        active.forEach((group, index) => {
            rankYsBySource.get(group.source.id).set(
                rank,
                boundaryBottom + 18 + index * CURRICULUM_CABLE_LANE_SPACING
            );
        });
    }
    for (let rank = 0; rank < maximumRank; rank += 1) {
        const currentRight = rankRight.get(rank) || 0;
        const nextLeft = rankLeft.get(rank + 1) ?? currentRight + 96;
        const gap = Math.max(24, nextLeft - currentRight);
        const starters = groups
            .filter(group => group.source.rank === rank)
            .sort((a, b) => trackOrder.get(b.source.id) - trackOrder.get(a.source.id));
        const continuing = groups
            .filter(group => group.source.rank <= rank && group.maxTargetRank > rank)
            .sort((a, b) => trackOrder.get(b.source.id) - trackOrder.get(a.source.id));
        // Start new buses on the bottom edge in narrow, staggered lanes near
        // the right side of the source nodes. Newest/lower sources stay closest
        // to the right edge; higher, older sources occupy progressively deeper
        // inner lanes. Any lower cards conceal the continuing vertical run
        // through the column.
        const anchorInset = Math.min(8, Math.max(5, gap * 0.08));
        const anchorStep = starters.length > 1 ? CURRICULUM_CABLE_LANE_SPACING : 0;
        starters.forEach((group, index) => {
            group.descentX = currentRight - anchorInset - anchorStep * index;
        });

        const descending = continuing.filter(group => {
            const rankYs = rankYsBySource.get(group.source.id);
            return rankYs.get(rank + 1) > rankYs.get(rank) + 0.5;
        });
        const rising = continuing.filter(group => {
            const rankYs = rankYsBySource.get(group.source.id);
            return rankYs.get(rank + 1) < rankYs.get(rank) - 0.5;
        });
        // Keep rising stack changes out of the direct-connection gutter. The
        // newest/top bus waits until the receiving column's left edge; older
        // buses follow to its right. Falling buses turn in collision-safe age
        // order inside the current column, with the newest at its right edge.
        descending
            .sort((a, b) => trackOrder.get(a.source.id) - trackOrder.get(b.source.id))
            .forEach((group, index) => {
                const offset = (descending.length - 1 - index) * CURRICULUM_CABLE_LANE_SPACING;
                transitionXBySourceAndRank.get(group.source.id).set(rank, currentRight - offset);
            });
        rising
            .sort((a, b) => trackOrder.get(b.source.id) - trackOrder.get(a.source.id))
            .forEach((group, index) => {
                transitionXBySourceAndRank.get(group.source.id).set(
                    rank,
                    nextLeft + index * CURRICULUM_CABLE_LANE_SPACING
                );
            });
        const incomingEntries = [...(entriesByTargetRank.get(rank + 1) || [])]
            .sort((a, b) => rankYsBySource.get(a.source.id).get(rank + 1)
                - rankYsBySource.get(b.source.id).get(rank + 1)
                || a.target.y - b.target.y
                || a.source.id.localeCompare(b.source.id));
        // Long connections enter near the destination's bottom-left corner.
        // Place their vertical receiving lanes after any rising turns at that
        // edge, then stagger every incoming wire by the standard compact gap.
        const targetAnchorInset = Math.max(
            8,
            rising.length * CURRICULUM_CABLE_LANE_SPACING + 4
        );
        incomingEntries.forEach((entry, index) => {
            entry.riseX = nextLeft + targetAnchorInset
                + index * CURRICULUM_CABLE_LANE_SPACING;
        });
    }
    let routedHeight = layout.height;
    const routes = new Map();
    const trunks = [];
    for (const group of groups) {
        const rankYs = rankYsBySource.get(group.source.id);
        const rankPoints = [...rankYs].map(([rank, y]) => ({ rank, y }));
        routedHeight = Math.max(routedHeight, ...rankPoints.map(point => point.y + 24));
        const transitions = rankPoints.slice(0, -1).flatMap((point, index) => {
            const nextPoint = rankPoints[index + 1];
            if (Math.abs(nextPoint.y - point.y) < 0.5) return [];
            return [{
                rank: point.rank,
                x: transitionXBySourceAndRank.get(group.source.id).get(point.rank),
                y: nextPoint.y
            }];
        });
        trunks.push({
            source: group.source.id,
            targets: group.entries.map(({ target }) => target.id),
            descentX: group.descentX,
            // Stop at the farthest actual rising lane. Extending to the
            // arrowhead base would leave a visible dead-end tail beyond the
            // final branch because rising lanes are intentionally staggered.
            x2: Math.max(...group.entries.map(entry => entry.riseX)),
            rankPoints,
            transitions,
            sourceY: group.source.y + group.source.height
        });
        for (const entry of group.entries) {
            const edgeCrossedRanks = [];
            for (let rank = group.source.rank + 1; rank < entry.target.rank; rank += 1) edgeCrossedRanks.push(rank);
            const edgeRankYs = new Map();
            for (let rank = group.source.rank + 1; rank < entry.target.rank; rank += 1) {
                edgeRankYs.set(rank, rankYs.get(rank));
            }
            // Every long branch now rises from the receiving column's own bus
            // lane into a bottom-edge target port.
            const joinRank = entry.target.rank;
            edgeRankYs.set(joinRank, rankYs.get(joinRank));
            routes.set(entry.edge, {
                y: rankYs.get(joinRank),
                steps: edgeCrossedRanks.map(rank => ({
                    x: rankLeft.get(rank) ?? entry.target.x,
                    y: rankYs.get(rank),
                    rank
                })),
                rankYs: edgeRankYs,
                trunkSource: group.source.id,
                riseX: entry.riseX
            });
        }
    }
    return {
        routes,
        trunks,
        height: routedHeight
    };
}

function curriculumElkEdgeGeometry(edge, source, target) {
    const section = edge.sections?.[0];
    if (!section) return curriculumEdgeGeometry(source, target);
    const points = [section.startPoint, ...(section.bendPoints || []), section.endPoint];
    const tip = points.at(-1);
    const previous = points.at(-2) || { x: tip.x - 1, y: tip.y };
    const dx = tip.x - previous.x;
    const dy = tip.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const unitX = dx / length;
    const unitY = dy / length;
    const headLength = Math.max(1, Math.min(10, length * 0.45));
    const headHalfWidth = 4.25;
    const base = {
        x: tip.x - unitX * headLength,
        y: tip.y - unitY * headLength
    };
    const linePoints = [...points.slice(0, -1), base];
    const perpendicular = { x: -unitY * headHalfWidth, y: unitX * headHalfWidth };
    return {
        line: linePoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
        head: `M ${base.x + perpendicular.x} ${base.y + perpendicular.y} L ${tip.x} ${tip.y} L ${base.x - perpendicular.x} ${base.y - perpendicular.y} Z`
    };
}

async function renderCurriculumGraphCanvas(root, graph, progressStates, {
    ranked = false,
    focusRanks = null
} = {}) {
    const isSubjectOverview = !ranked && graph.nodes.every(node => node.nodeType === 'subject');
    const layout = ranked
        ? layoutCurriculumGraph(graph)
        : await layoutCurriculumGraphElk(graph, {
            direction: graph.nodes.every(node => node.nodeType === 'subject') ? 'DOWN' : 'RIGHT'
        });
    if (ranked) {
        const boundaryPadding = layout.nodeWidth + layout.columnGap;
        layout.nodes.forEach(node => { node.x += boundaryPadding; });
        layout.width += boundaryPadding * 2;
    }
    const stage = document.createElement('div');
    stage.className = 'curriculum-graph-stage';
    if (ranked) stage.classList.add('is-layered');
    if (isSubjectOverview) stage.classList.add('is-subject-overview');
    if (graph.nodes.length > 12) stage.classList.add('is-dense');
    stage.setAttribute('aria-label', 'Interactive curriculum prerequisite graph');
    const cableRouting = ranked
        ? curriculumCableRouting(layout)
        : { routes: new Map(), height: layout.height };
    const positioned = new Map(layout.nodes.map(node => [node.id, node]));
    const canvasHeight = Math.max(layout.height, cableRouting.height);
    const scrollExtentNodes = ranked && focusRanks
        ? layout.nodes.filter(node => node.rank >= focusRanks.start && node.rank < focusRanks.end)
        : layout.nodes;
    const scrollExtentNodeBottom = scrollExtentNodes.length
        ? Math.max(...scrollExtentNodes.map(node => node.y + node.height))
        : 0;
    const scrollExtentRouteBottom = ranked && focusRanks
        ? Math.max(0, ...[...cableRouting.routes.values()]
            .flatMap(route => [...(route.rankYs || [])]
                .filter(([rank]) => rank >= focusRanks.start && rank < focusRanks.end)
                .map(([, y]) => y)))
        : 0;
    const scrollExtentHeight = ranked && focusRanks && scrollExtentNodes.length
        ? Math.max(scrollExtentNodeBottom + 36, scrollExtentRouteBottom + 24)
        : canvasHeight;
    if (ranked && focusRanks) {
        stage.dataset.scrollRankStart = String(focusRanks.start);
        stage.dataset.scrollRankEnd = String(focusRanks.end);
        stage.dataset.scrollLayer = String(focusRanks.layer);
        stage.dataset.scrollExtent = String(scrollExtentHeight);
        stage.dataset.scrollRouteBottom = String(scrollExtentRouteBottom);
    }
    const scrollCanvas = document.createElement('div');
    scrollCanvas.className = 'curriculum-graph-scroll-canvas';
    const viewport = document.createElement('div');
    viewport.className = 'curriculum-graph-viewport';
    const horizontalGutter = ranked && focusRanks ? 48 : 0;
    viewport.style.left = `${horizontalGutter}px`;
    viewport.style.width = `${layout.width}px`;
    viewport.style.height = `${canvasHeight}px`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('curriculum-graph-edges');
    svg.setAttribute('width', String(layout.width));
    svg.setAttribute('height', String(canvasHeight));
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${canvasHeight}`);
    const portAssignments = new Map();
    const assignPorts = (direction, nodeId, edges, otherId) => {
        const node = positioned.get(nodeId);
        if (!node) return;
        edges
            .sort((a, b) => {
                const first = positioned.get(otherId(a));
                const second = positioned.get(otherId(b));
                return (first?.y || 0) - (second?.y || 0);
            })
            .forEach((edge, index) => {
                const inset = Math.min(18, node.height * 0.22);
                const usable = Math.max(1, node.height - inset * 2);
                const y = node.y + inset + usable * (index + 1) / (edges.length + 1);
                const assignment = portAssignments.get(edge) || {};
                assignment[direction] = y;
                portAssignments.set(edge, assignment);
            });
    };
    for (const node of layout.nodes) {
        // Long edges leave through the source's single shared bus trunk. Do
        // not include them in ordinary source-port spacing: the bus starts on
        // the bottom edge and direct outgoing edges use the right edge.
        assignPorts('sourceY', node.id, layout.edges.filter(edge =>
            edge.source === node.id && !cableRouting.routes.has(edge)), edge => edge.target);
        assignPorts('targetY', node.id, layout.edges.filter(edge =>
            edge.target === node.id && !cableRouting.routes.has(edge)), edge => edge.source);
    }
    for (const trunk of cableRouting.trunks || []) {
        const connection = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        connection.classList.add('curriculum-graph-connection', 'is-cable-trunk');
        connection.dataset.source = trunk.source;
        connection.dataset.targets = trunk.targets.join('|');
        connection.dataset.rankYs = trunk.rankPoints.map(point => `${point.rank}:${point.y}`).join(',');
        connection.dataset.transitionXs = trunk.transitions
            .map(transition => `${transition.rank}:${transition.x}`)
            .join(',');
        connection.dataset.descentX = String(trunk.descentX);
        const source = positioned.get(trunk.source);
        if (Number.isInteger(source?.rank)) connection.dataset.sourceRank = String(source.rank);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.classList.add('curriculum-graph-edge');
        line.setAttribute('d', curriculumCableTrunkGeometry(trunk));
        const highlightLine = line.cloneNode();
        highlightLine.classList.add('curriculum-graph-edge-highlight');
        connection.append(line, highlightLine);
        svg.appendChild(connection);
    }
    for (const edge of layout.edges) {
        const source = positioned.get(edge.source);
        const target = positioned.get(edge.target);
        if (!source || !target) continue;
        const connection = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        connection.classList.add('curriculum-graph-connection', `is-${edge.type}`);
        const rankDistance = Number.isInteger(source.rank) && Number.isInteger(target.rank)
            ? Math.abs(target.rank - source.rank)
            : 1;
        if (rankDistance > 1) {
            connection.classList.add('is-long');
        } else {
            connection.classList.add('is-primary');
        }
        connection.dataset.source = edge.source;
        connection.dataset.target = edge.target;
        const ports = portAssignments.get(edge) || {};
        const cableRoute = cableRouting.routes.get(edge);
        if (cableRoute) {
            connection.dataset.cableYs = [...cableRoute.rankYs]
                .filter(([rank]) => rank > source.rank)
                .map(([, y]) => y)
                .join(',');
            connection.dataset.cableTrunkSource = cableRoute.trunkSource;
            connection.dataset.riseX = String(cableRoute.riseX);
        }
        const geometry = cableRoute
            ? curriculumCableEdgeGeometry(
                source,
                target,
                ports.sourceY ?? source.y + source.height / 2,
                ports.targetY ?? target.y + target.height / 2,
                cableRoute
            )
            : edge.sections?.length
                ? curriculumElkEdgeGeometry(edge, source, target)
                : curriculumEdgeGeometry(source, target, ports.sourceY, ports.targetY);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.classList.add('curriculum-graph-edge');
        line.setAttribute('d', geometry.line);
        const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowhead.classList.add('curriculum-graph-arrowhead');
        arrowhead.setAttribute('d', geometry.head);
        connection.append(line, arrowhead);
        svg.appendChild(connection);
    }
    viewport.appendChild(svg);

    const nodeElements = [];
    const highlightsMatches = graph.seedIds.length < graph.nodes.length;
    for (const deck of layout.nodes) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'curriculum-graph-node';
        const progressState = deck.nodeType === 'deck'
            ? curriculumStatus(deck, progressStates)
            : null;
        if (progressState) {
            node.classList.add(`is-${progressState}`);
            node.dataset.progressState = progressState;
        }
        if (curriculumViewState.targetId === deck.id) node.classList.add('is-target');
        if (highlightsMatches && graph.seedIds.includes(deck.id)) node.classList.add('is-match');
        node.dataset.deckId = deck.id;
        if (Number.isInteger(deck.rank)) node.dataset.rank = String(deck.rank);
        node.style.left = `${deck.x}px`;
        node.style.top = `${deck.y}px`;
        node.style.width = `${deck.width}px`;
        node.style.height = `${deck.height}px`;
        node.title = `${deck.id}\n${deck.description || ''}`;
        const nodeName = deck.nodeType === 'subject'
            ? deck.id
            : deck.nodeType === 'chapter'
                ? `${deck.order}. ${deck.deck}`
                : `${deck.order}. ${deck.deck}`;
        const nodeMeta = deck.nodeType === 'subject'
            ? `${deck.deck_count} decks`
            : deck.nodeType === 'chapter'
                ? `${deck.card_count || 0} cards`
                : '';
        node.innerHTML = `
            <span class="curriculum-graph-node-subject">${escapeHtml(deck.nodeType === 'subject' ? 'subject' : deck.subject)}</span>
            <span class="curriculum-graph-node-name">${escapeHtml(nodeName)}</span>
            <span class="curriculum-graph-node-status">${escapeHtml(nodeMeta)}</span>
        `;
        node.onclick = () => {
            if (deck.nodeType === 'subject') {
                navigateCurriculum({
                    mode: 'subject',
                    hierarchy: 'deck',
                    subject: deck.id,
                    targetId: '',
                    parentId: deck.id,
                    query: '',
                    layerStart: 0
                });
            } else if (deck.nodeType === 'chapter') {
                const separator = deck.id.indexOf('#');
                openDependencyModal(deck.id.slice(0, separator), deck.id.slice(separator + 1));
            } else {
                navigateCurriculum({
                    mode: 'chapters',
                    hierarchy: 'chapter',
                    subject: deck.subject,
                    targetId: '',
                    parentId: deck.id,
                    query: '',
                    layerStart: 0
                });
            }
        };
        nodeElements.push(node);
        viewport.appendChild(node);
    }
    scrollCanvas.appendChild(viewport);
    stage.appendChild(scrollCanvas);
    root.appendChild(stage);

    const edgeElements = [...svg.querySelectorAll('.curriculum-graph-connection')];
    const clipCableTrunk = (trunk, related) => {
        if (!trunk.classList.contains('is-cable-trunk')) return;
        const line = trunk.querySelector('.curriculum-graph-edge-highlight');
        if (!line) return;
        const relatedBranches = edgeElements.filter(edge =>
            !edge.classList.contains('is-cable-trunk')
            && edge.dataset.cableTrunkSource === trunk.dataset.source
            && related.has(edge.dataset.source)
            && related.has(edge.dataset.target));
        const cutoffX = Math.max(-Infinity, ...relatedBranches.map(edge => Number(edge.dataset.riseX)));
        const fullEndX = line.getPointAtLength(line.getTotalLength()).x;
        if (!Number.isFinite(cutoffX) || cutoffX >= fullEndX - 0.5) {
            line.style.removeProperty('stroke-dasharray');
            trunk.dataset.highlightCutoffX = '';
            return;
        }

        // A shared bus may continue toward branches that are unrelated to the
        // hovered node. Clip only its emphasized overlay at the last related
        // branch. The complete base stroke remains faintly visible, keeping
        // every unhighlighted branch joined to its trunk during hover tracing.
        // Cable paths advance monotonically from left to right, including
        // their vertical floor transitions, so a length binary search finds
        // the precise join without rebuilding the route.
        const totalLength = line.getTotalLength();
        let lower = 0;
        let upper = totalLength;
        for (let iteration = 0; iteration < 30; iteration += 1) {
            const middle = (lower + upper) / 2;
            if (line.getPointAtLength(middle).x <= cutoffX) lower = middle;
            else upper = middle;
        }
        const visibleLength = Math.min(totalLength, lower + 3);
        line.style.strokeDasharray = `${visibleLength} ${Math.max(1, totalLength - visibleLength + 1)}`;
        trunk.dataset.highlightCutoffX = String(cutoffX);
    };
    const setRelated = deckId => {
        const related = new Set([deckId]);
        const visit = (initial, direction) => {
            const pending = [initial];
            while (pending.length) {
                const current = pending.pop();
                for (const edge of layout.edges) {
                    const from = direction === 'upstream' ? edge.target : edge.source;
                    const to = direction === 'upstream' ? edge.source : edge.target;
                    if (from !== current || related.has(to)) continue;
                    related.add(to);
                    pending.push(to);
                }
            }
        };
        visit(deckId, 'upstream');
        visit(deckId, 'downstream');
        nodeElements.forEach(node => {
            node.classList.toggle('is-dimmed', !related.has(node.dataset.deckId));
            node.classList.toggle('is-related', related.has(node.dataset.deckId));
        });
        edgeElements.forEach(edge => {
            const trunkTargets = edge.dataset.targets?.split('|').filter(Boolean) || [];
            const active = edge.classList.contains('is-cable-trunk')
                ? related.has(edge.dataset.source) && trunkTargets.some(target => related.has(target))
                : related.has(edge.dataset.source) && related.has(edge.dataset.target);
            edge.classList.toggle('is-dimmed', !active);
            edge.classList.toggle('is-related', active);
            clipCableTrunk(edge, related);
        });
    };
    const clearRelated = () => {
        [...nodeElements, ...edgeElements].forEach(element => {
            element.classList.remove('is-dimmed', 'is-related');
            if (!element.classList.contains('is-cable-trunk')) return;
            element.querySelector('.curriculum-graph-edge-highlight')?.style.removeProperty('stroke-dasharray');
            element.dataset.highlightCutoffX = '';
        });
    };
    let hoveredNode = null;
    let hoverTimer = null;
    let scrollIdleTimer = null;
    let isScrolling = false;
    const cancelHoverTimer = () => {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    };
    const scheduleRelated = node => {
        cancelHoverTimer();
        if (!node || isScrolling) return;
        hoverTimer = setTimeout(() => {
            if (node === hoveredNode && !isScrolling) setRelated(node.dataset.deckId);
        }, 450);
    };
    nodeElements.forEach(node => {
        node.addEventListener('pointerenter', () => {
            hoveredNode = node;
            scheduleRelated(node);
        });
        node.addEventListener('pointerleave', () => {
            if (hoveredNode === node) hoveredNode = null;
            cancelHoverTimer();
            clearRelated();
        });
        node.addEventListener('focus', () => setRelated(node.dataset.deckId));
        node.addEventListener('blur', clearRelated);
    });

    let scale = 1;
    let subjectPanX = 0;
    let subjectPanY = 0;
    const subjectBaseOffset = () => ({
        x: Math.max(0, (stage.clientWidth - layout.width * scale) / 2),
        y: Math.max(0, (stage.clientHeight - scrollExtentHeight * scale) / 2)
    });
    const applyScale = () => {
        viewport.style.transform = `scale(${scale})`;
        const renderedWidth = layout.width * scale;
        const renderedHeight = scrollExtentHeight * scale;
        if (isSubjectOverview) {
            const base = subjectBaseOffset();
            viewport.style.left = `${base.x + subjectPanX}px`;
            viewport.style.top = `${base.y + subjectPanY}px`;
            scrollCanvas.style.width = `${stage.clientWidth}px`;
            scrollCanvas.style.height = `${stage.clientHeight}px`;
            return;
        }
        viewport.style.left = `${horizontalGutter}px`;
        viewport.style.top = '0px';
        scrollCanvas.style.width = `${renderedWidth + horizontalGutter * 2}px`;
        scrollCanvas.style.height = `${renderedHeight}px`;
    };
    const fitBounds = (bounds, { horizontal = false } = {}) => {
        const padding = 48;
        const width = Math.max(1, stage.clientWidth - padding * 2);
        const height = Math.max(1, stage.clientHeight - padding * 2);
        scale = horizontal
            ? Math.min(3, width / bounds.width)
            : Math.min(1, width / bounds.width, height / bounds.height);
        if (isSubjectOverview) {
            subjectPanX = 0;
            subjectPanY = 0;
        }
        applyScale();
        if (isSubjectOverview) {
            stage.scrollTo({ left: 0, top: 0 });
            return;
        }
        const left = bounds.x * scale + horizontalGutter
            - (stage.clientWidth - bounds.width * scale) / 2;
        const top = horizontal
            ? bounds.y * scale - padding
            : bounds.y * scale - (stage.clientHeight - bounds.height * scale) / 2;
        stage.scrollTo({ left: Math.max(0, left), top: Math.max(0, top) });
    };
    const graphBounds = { x: 0, y: 0, width: layout.width, height: layout.height };
    const rankBounds = range => {
        if (!range) return graphBounds;
        const nodes = layout.nodes.filter(node =>
            Number.isInteger(node.rank)
            && node.rank >= range.start
            && node.rank < range.end);
        if (!nodes.length) return graphBounds;
        const minX = Math.min(...nodes.map(node => node.x));
        const minY = Math.min(...nodes.map(node => node.y));
        const maxX = Math.max(...nodes.map(node => node.x + node.width));
        const maxY = Math.max(...nodes.map(node => node.y + node.height));
        const focalNodes = Number.isInteger(range.layer)
            ? layout.nodes.filter(node => node.rank === range.layer)
            : [];
        const columnStep = layout.nodeWidth + (layout.columnGap || 0);
        const focalX = focalNodes.length ? Math.min(...focalNodes.map(node => node.x)) : minX;
        return {
            x: Number.isInteger(range.layer) ? focalX - columnStep : minX,
            y: minY,
            width: Number.isInteger(range.layer)
                ? layout.nodeWidth + columnStep * 2
                : Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY)
        };
    };
    const fit = () => fitBounds(rankBounds(focusRanks), { horizontal: Boolean(focusRanks) });
    const zoom = (factor, originX = stage.clientWidth / 2, originY = stage.clientHeight / 2) => {
        if (!isSubjectOverview) return;
        const oldScale = scale;
        const oldBase = subjectBaseOffset();
        const graphOriginX = oldBase.x + subjectPanX;
        const graphOriginY = oldBase.y + subjectPanY;
        const graphPointX = (originX - graphOriginX) / oldScale;
        const graphPointY = (originY - graphOriginY) / oldScale;
        scale = Math.max(0.45, Math.min(2.5, scale * factor));
        const newBase = subjectBaseOffset();
        subjectPanX = originX - graphPointX * scale - newBase.x;
        subjectPanY = originY - graphPointY * scale - newBase.y;
        applyScale();
    };
    const zoomIn = () => zoom(1.2);
    const zoomOut = () => zoom(1 / 1.2);
    if (isSubjectOverview) {
        let dragState = null;
        stage.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.curriculum-graph-node')) return;
            dragState = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                panX: subjectPanX,
                panY: subjectPanY
            };
            stage.classList.add('is-panning');
            stage.setPointerCapture(event.pointerId);
        });
        stage.addEventListener('pointermove', event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            subjectPanX = dragState.panX + event.clientX - dragState.x;
            subjectPanY = dragState.panY + event.clientY - dragState.y;
            applyScale();
        });
        const stopPanning = event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            dragState = null;
            stage.classList.remove('is-panning');
            if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
        };
        stage.addEventListener('pointerup', stopPanning);
        stage.addEventListener('pointercancel', stopPanning);
        stage.addEventListener('wheel', event => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            const stageRect = stage.getBoundingClientRect();
            zoom(
                event.deltaY < 0 ? 1.12 : 1 / 1.12,
                event.clientX - stageRect.left,
                event.clientY - stageRect.top
            );
        }, { passive: false });
    }
    const fitVisibleViewport = () => {
        const top = stage.getBoundingClientRect().top;
        const available = Math.floor(window.innerHeight - top - 16);
        const pageContentStartsBelowViewport = top >= window.innerHeight - 160;
        const height = pageContentStartsBelowViewport
            ? Math.min(480, Math.max(320, Math.floor(window.innerHeight * 0.62)))
            : Math.max(160, available);
        stage.style.height = `${height}px`;
        fit();
    };
    stage.addEventListener('scroll', () => {
        isScrolling = true;
        cancelHoverTimer();
        clearRelated();
        clearTimeout(scrollIdleTimer);
        scrollIdleTimer = setTimeout(() => {
            isScrolling = false;
            scheduleRelated(hoveredNode);
        }, 180);
    }, { passive: true });
    const onViewportResize = () => {
        if (!stage.isConnected) {
            window.removeEventListener('resize', onViewportResize);
            return;
        }
        fitVisibleViewport();
    };
    window.addEventListener('resize', onViewportResize);
    requestAnimationFrame(fitVisibleViewport);
    return { fit, zoomIn, zoomOut };
}

function curriculumStateSnapshot() {
    const {
        mode, hierarchy, targetId, parentId, subject, includeRecommended,
        layerStart, anchorId, position
    } = curriculumViewState;
    return {
        mode, hierarchy, targetId, parentId, subject, includeRecommended,
        layerStart, anchorId, position: position ? structuredClone(position) : null
    };
}

function curriculumNavigationKey(state) {
    if (!state) return '';
    return [state.mode, state.hierarchy, state.subject, state.parentId,
        state.targetId, state.layerStart || 0].join(':');
}

function captureCurriculumPosition() {
    const stage = document.querySelector('#curriculum-view .curriculum-graph-stage');
    if (stage) return { type: 'graph', left: stage.scrollLeft, top: stage.scrollTop };
    const neighborhood = document.querySelector('#curriculum-view .curriculum-neighborhood');
    if (!neighborhood) return null;
    return {
        type: 'neighborhood',
        top: neighborhood.scrollTop
    };
}

function curriculumNavigationSnapshot(state, position = state?.position || null) {
    return {
        ...state,
        query: '',
        position: position ? structuredClone(position) : null
    };
}

function ensureCurriculumNavigationHistory() {
    const current = curriculumNavigationSnapshot(curriculumStateSnapshot(), captureCurriculumPosition());
    const currentKey = curriculumNavigationKey(current);
    const activeKey = curriculumNavigationKey(curriculumNavigationHistory[curriculumNavigationHistoryIndex]);
    if (activeKey === currentKey) return;
    const existingIndex = curriculumNavigationHistory.findLastIndex(item =>
        curriculumNavigationKey(item) === currentKey);
    if (existingIndex >= 0) {
        curriculumNavigationHistoryIndex = existingIndex;
    } else {
        curriculumNavigationHistory = [current];
        curriculumNavigationHistoryIndex = 0;
    }
}

function recordCurriculumNavigation(previous, next) {
    const previousSnapshot = curriculumNavigationSnapshot(previous, captureCurriculumPosition());
    const previousKey = curriculumNavigationKey(previousSnapshot);
    const activeKey = curriculumNavigationKey(curriculumNavigationHistory[curriculumNavigationHistoryIndex]);
    if (activeKey !== previousKey) ensureCurriculumNavigationHistory();
    if (curriculumNavigationHistoryIndex >= 0) {
        curriculumNavigationHistory[curriculumNavigationHistoryIndex] = previousSnapshot;
    } else {
        curriculumNavigationHistory = [previousSnapshot];
        curriculumNavigationHistoryIndex = 0;
    }
    curriculumNavigationHistory = curriculumNavigationHistory.slice(0, curriculumNavigationHistoryIndex + 1);
    curriculumNavigationHistory.push(curriculumNavigationSnapshot(next, null));
    curriculumNavigationHistoryIndex += 1;
}

function restoreCurriculumNavigationHistory(state, currentState = null) {
    const items = Array.isArray(state?.curriculumNavigationHistory)
        ? state.curriculumNavigationHistory.filter(item => curriculumNavigationKey(item))
        : [];
    if (items.length) {
        curriculumNavigationHistory = items.map(item => curriculumNavigationSnapshot(item));
    }
    const requestedIndex = Number(state?.curriculumNavigationHistoryIndex);
    const key = curriculumNavigationKey(currentState || state?.curriculum);
    if (Number.isInteger(requestedIndex)
        && curriculumNavigationKey(curriculumNavigationHistory[requestedIndex]) === key) {
        curriculumNavigationHistoryIndex = requestedIndex;
        return curriculumNavigationHistory[requestedIndex];
    }
    const existingIndex = curriculumNavigationHistory.findLastIndex(item =>
        curriculumNavigationKey(item) === key);
    if (existingIndex >= 0) {
        curriculumNavigationHistoryIndex = existingIndex;
        return curriculumNavigationHistory[existingIndex];
    }
    return null;
}

function curriculumDeckLayer(subject, deckId) {
    if (!subject || !deckId || !curriculumIndex) return 0;
    const layout = layoutCurriculumGraph(subjectDeckGraph(curriculumIndex, subject));
    return layout.nodes.find(node => node.id === deckId)?.rank || 0;
}

function restoreCurriculumPosition() {
    const position = curriculumViewState.position;
    const stage = document.querySelector('#curriculum-view .curriculum-graph-stage');
    if (stage && position?.type === 'graph') {
        stage.scrollLeft = position.left || 0;
        stage.scrollTop = position.top || 0;
        return;
    }
    if (stage && curriculumViewState.anchorId) {
        const anchor = [...stage.querySelectorAll('.curriculum-graph-node')]
            .find(node => node.dataset.deckId === curriculumViewState.anchorId);
        if (!anchor) return;
        const stageRect = stage.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const delta = anchorRect.top + anchorRect.height / 2
            - (stageRect.top + stage.clientHeight / 2);
        const desiredTop = stage.scrollTop + delta;
        stage.scrollTop = Math.max(0, Math.min(
            desiredTop,
            stage.scrollHeight - stage.clientHeight
        ));
        return;
    }
    if (position?.type === 'neighborhood') {
        const neighborhood = document.querySelector('#curriculum-view .curriculum-neighborhood');
        if (neighborhood) neighborhood.scrollTop = position.top || 0;
    }
}

function curriculumStateFromUrl(url = new URL(window.location.href)) {
    if (url.searchParams.get('view') !== 'curriculum') return null;
    const hierarchy = ['subject', 'deck', 'chapter'].includes(url.searchParams.get('curriculum-level'))
        ? url.searchParams.get('curriculum-level')
        : 'subject';
    const mode = ['overview', 'subject', 'chapters', 'focus', 'full'].includes(url.searchParams.get('curriculum-mode'))
        ? url.searchParams.get('curriculum-mode')
        : 'overview';
    return {
        mode,
        hierarchy,
        targetId: url.searchParams.get('curriculum-target') || '',
        parentId: url.searchParams.get('curriculum-parent') || '',
        subject: url.searchParams.get('curriculum-subject') || '',
        includeRecommended: false,
        layerStart: Math.max(0, Number(url.searchParams.get('curriculum-layer')) || 0),
        query: ''
    };
}

function writeCurriculumHistory({ replace = false } = {}) {
    const url = new URL(window.location.href);
    const state = curriculumStateSnapshot();
    url.searchParams.set('view', 'curriculum');
    url.searchParams.set('curriculum-mode', state.mode);
    url.searchParams.set('curriculum-level', state.hierarchy);
    const optional = [
        ['curriculum-target', state.targetId],
        ['curriculum-parent', state.parentId],
        ['curriculum-subject', state.subject],
        ['curriculum-layer', state.layerStart || '']
    ];
    for (const [key, value] of optional) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
    }
    url.searchParams.delete('recommended');
    const historyState = {
        mainView: 'curriculum',
        curriculum: state,
        curriculumNavigationHistory: structuredClone(curriculumNavigationHistory),
        curriculumNavigationHistoryIndex
    };
    history[replace ? 'replaceState' : 'pushState'](historyState, '', `${url.pathname}${url.search}${url.hash}`);
}

async function navigateCurriculum(options, { replace = false, trackHistory = true } = {}) {
    const previous = curriculumStateSnapshot();
    const next = {
        ...previous,
        ...options,
        anchorId: Object.hasOwn(options, 'anchorId') ? options.anchorId : '',
        position: Object.hasOwn(options, 'position') ? options.position : null
    };
    if (trackHistory) recordCurriculumNavigation(previous, next);
    Object.assign(curriculumViewState, next);
    writeCurriculumHistory({ replace });
    await renderCurriculumView();
}

async function moveCurriculumNavigationHistory(offset) {
    const nextIndex = curriculumNavigationHistoryIndex + offset;
    if (nextIndex < 0 || nextIndex >= curriculumNavigationHistory.length) return;
    if (curriculumNavigationHistoryIndex >= 0) {
        curriculumNavigationHistory[curriculumNavigationHistoryIndex] = curriculumNavigationSnapshot(
            curriculumStateSnapshot(),
            captureCurriculumPosition()
        );
    }
    curriculumNavigationHistoryIndex = nextIndex;
    Object.assign(curriculumViewState, structuredClone(curriculumNavigationHistory[nextIndex]));
    writeCurriculumHistory({ replace: true });
    await renderCurriculumView();
}

function curriculumItemName(item) {
    if (item.nodeType === 'subject') return item.title || item.id;
    if (item.nodeType === 'chapter') return item.title || item.deck || item.id.split('#').pop();
    return item.deck || item.id.split('/').pop();
}

function curriculumItemMeta(item, progressStates) {
    if (item.nodeType === 'subject') return `${item.deck_count || 0} decks`;
    if (item.nodeType === 'chapter') return `${item.card_count || 0} cards · ${item.deckId}`;
    return item.subject;
}

function curriculumFocusOptions(item) {
    if (item.nodeType === 'subject') {
        return { mode: 'subject', hierarchy: 'deck', subject: item.id, parentId: item.id, targetId: '', query: '', layerStart: 0 };
    }
    if (item.nodeType === 'chapter') {
        return { mode: 'focus', hierarchy: 'chapter', subject: item.subject, parentId: item.deckId, targetId: item.id, query: '' };
    }
    return {
        mode: 'chapters', hierarchy: 'chapter', subject: item.subject,
        parentId: item.id, targetId: '', query: '', layerStart: 0
    };
}

function makeCurriculumItemButton(item, progressStates, extra = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'curriculum-explorer-item';
    if (item.nodeType === 'deck') {
        const progressState = curriculumStatus(item, progressStates);
        button.classList.add(`is-${progressState}`);
        button.dataset.progressState = progressState;
    }
    button.innerHTML = `
        <span class="curriculum-explorer-item-name">${escapeHtml(curriculumItemName(item))}</span>
        <span class="curriculum-explorer-item-meta">${escapeHtml(curriculumItemMeta(item, progressStates))}${extra ? ` · ${escapeHtml(extra)}` : ''}</span>
    `;
    button.dataset.curriculumNodeId = item.id;
    button.title = `${item.id}${item.description ? `\n${item.description}` : ''}`;
    button.onclick = () => navigateCurriculum(curriculumFocusOptions(item));
    return button;
}

function appendCurriculumRelationshipGroups(column, entries, progressStates, emptyText, direction) {
    const direct = entries.filter(entry => entry.distance === 1);
    const indirect = entries.filter(entry => entry.distance > 1);
    const appendGroup = (title, items) => {
        if (!items.length) return;
        const heading = document.createElement('h4');
        heading.textContent = title;
        column.appendChild(heading);
        for (const entry of items) {
            const button = makeCurriculumItemButton(
                entry.item,
                progressStates,
                entry.distance === 1 ? 'direct' : `${entry.distance} steps ${direction}`
            );
            button.dataset.relationship = direction === 'earlier' ? 'prerequisite' : 'unlock';
            button.dataset.distance = String(entry.distance);
            column.appendChild(button);
        }
    };
    appendGroup(direction === 'earlier' ? 'Direct prerequisites' : 'Directly unlocks', direct);
    appendGroup(direction === 'earlier' ? 'Earlier prerequisites' : 'Later unlocks', indirect);
    if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'curriculum-explorer-empty';
        empty.textContent = emptyText;
        column.appendChild(empty);
    }
}

function makeCurriculumNeighborhoodScroll(label) {
    const scroll = document.createElement('div');
    scroll.className = 'curriculum-neighborhood-scroll';
    scroll.dataset.scrollLabel = label;
    return scroll;
}

function fitCurriculumNeighborhoodViewport(explorer) {
    const updateOverflow = () => {
        const mobile = window.matchMedia('(max-width: 760px)').matches;
        const canScroll = !mobile && explorer.scrollHeight > explorer.clientHeight + 1;
        explorer.classList.toggle('is-scrollable', canScroll);
        explorer.tabIndex = canScroll ? 0 : -1;
        if (canScroll) {
            explorer.setAttribute('aria-label', 'Scrollable curriculum dependencies');
        } else {
            explorer.removeAttribute('aria-label');
            explorer.scrollTop = 0;
        }
    };
    const fit = () => {
        if (window.matchMedia('(max-width: 760px)').matches) {
            explorer.style.removeProperty('height');
        } else {
            const top = explorer.getBoundingClientRect().top;
            const available = Math.floor(window.innerHeight - top - 16);
            const pageContentStartsBelowViewport = top >= window.innerHeight - 160;
            const height = pageContentStartsBelowViewport
                ? Math.min(680, Math.max(420, Math.floor(window.innerHeight * 0.68)))
                : Math.max(320, available);
            explorer.style.height = `${height}px`;
        }
        requestAnimationFrame(updateOverflow);
    };
    const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(updateOverflow)
        : null;
    resizeObserver?.observe(explorer);
    const onViewportResize = () => {
        if (!explorer.isConnected) {
            window.removeEventListener('resize', onViewportResize);
            resizeObserver?.disconnect();
            return;
        }
        fit();
    };
    window.addEventListener('resize', onViewportResize);
    requestAnimationFrame(fit);
}

function renderCurriculumDirectory(root, progressStates) {
    const { hierarchy, parentId, query } = curriculumViewState;
    const items = curriculumDirectory(curriculumIndex, { hierarchy, parentId, query });
    const directory = document.createElement('div');
    directory.className = 'curriculum-directory';
    for (const item of items) directory.appendChild(makeCurriculumItemButton(item, progressStates));
    if (!items.length) {
        directory.innerHTML = '<p class="curriculum-explorer-empty">No curriculum items match this search.</p>';
    }
    root.appendChild(directory);
}

function renderCurriculumNeighborhood(root, progressStates) {
    const neighborhood = curriculumNeighborhood(curriculumIndex, {
        hierarchy: curriculumViewState.hierarchy,
        targetId: curriculumViewState.targetId,
        includeRecommended: false
    });
    if (!neighborhood) {
        root.insertAdjacentHTML('beforeend', '<p class="curriculum-explorer-empty">This curriculum item is no longer available.</p>');
        return;
    }
    const explorer = document.createElement('div');
    explorer.className = 'curriculum-neighborhood';
    const prerequisites = document.createElement('section');
    prerequisites.className = 'curriculum-neighborhood-column is-prerequisites';
    prerequisites.innerHTML = `<h3>Prerequisites <span>${neighborhood.prerequisites.length}</span></h3>`;
    const prerequisiteScroll = makeCurriculumNeighborhoodScroll('Scrollable prerequisite decks');
    appendCurriculumRelationshipGroups(prerequisiteScroll, neighborhood.prerequisites, progressStates, 'No required prerequisites.', 'earlier');
    prerequisites.appendChild(prerequisiteScroll);
    const selected = document.createElement('section');
    selected.className = 'curriculum-neighborhood-column is-selected';
    const selectedProgress = neighborhood.hierarchy === 'deck'
        ? curriculumStatus(neighborhood.target, progressStates)
        : null;
    selected.innerHTML = `<h3 class="curriculum-selected-header"><span>Selected ${escapeHtml(neighborhood.hierarchy)}</span></h3>`;
    const selectedScroll = makeCurriculumNeighborhoodScroll(`Scrollable selected ${neighborhood.hierarchy}`);
    selectedScroll.innerHTML = `
        <h4 class="curriculum-selected-spacer" aria-hidden="true">Selected item</h4>
        <article class="curriculum-explorer-item curriculum-selected-item${selectedProgress ? ` is-${selectedProgress}` : ''}" data-curriculum-node-id="${escapeHtml(neighborhood.target.id)}">
            <span class="curriculum-explorer-item-name">${escapeHtml(curriculumItemName(neighborhood.target))}</span>
            <span class="curriculum-explorer-item-meta">${escapeHtml(curriculumItemMeta(neighborhood.target, progressStates))}</span>
        </article>
    `;
    selected.appendChild(selectedScroll);
    const selectedCard = selectedScroll.querySelector('.curriculum-selected-item');
    if (neighborhood.hierarchy === 'subject') {
        selectedCard.classList.add('is-openable');
        selectedCard.tabIndex = 0;
        selectedCard.setAttribute('role', 'button');
        selectedCard.setAttribute('aria-label', `Open decks for ${curriculumItemName(neighborhood.target)}`);
        const openDecks = () => navigateCurriculum({
            mode: 'subject', hierarchy: 'deck', subject: neighborhood.target.id,
            parentId: neighborhood.target.id, targetId: '', query: ''
        });
        selectedCard.onclick = openDecks;
        selectedCard.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDecks();
            }
        };
    } else if (neighborhood.hierarchy === 'deck') {
        selectedCard.classList.add('is-openable');
        selectedCard.tabIndex = 0;
        selectedCard.setAttribute('role', 'button');
        selectedCard.setAttribute('aria-label', `Open chapters for ${curriculumItemName(neighborhood.target)}`);
        const openChapters = () => navigateCurriculum({
            mode: 'chapters', hierarchy: 'chapter', subject: neighborhood.target.subject,
            parentId: neighborhood.target.id, targetId: '', query: '', layerStart: 0
        });
        selectedCard.onclick = openChapters;
        selectedCard.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openChapters();
            }
        };
    }
    if (neighborhood.interdependent.length) {
        const block = document.createElement('div');
        block.className = 'curriculum-interdependent';
        block.innerHTML = '<h4>Interdependent at the deck level</h4><p>These subjects feed one another in different advanced paths. Open their decks to see the actual ordering.</p>';
        neighborhood.interdependent.forEach(item => block.appendChild(makeCurriculumItemButton(item, progressStates)));
        selectedScroll.appendChild(block);
    }
    if (neighborhood.cycle.length) {
        const block = document.createElement('div');
        block.className = 'curriculum-cycle-warning';
        block.innerHTML = '<h4>Invalid required cycle</h4><p>This strict prerequisite loop must be resolved in the curriculum source before it can define a learning order.</p>';
        neighborhood.cycle.forEach(item => block.appendChild(makeCurriculumItemButton(item, progressStates)));
        selectedScroll.appendChild(block);
    }

    const unlocks = document.createElement('section');
    unlocks.className = 'curriculum-neighborhood-column is-unlocks';
    unlocks.innerHTML = `<h3>Unlocks <span>${neighborhood.unlocks.length}</span></h3>`;
    const unlockScroll = makeCurriculumNeighborhoodScroll('Scrollable unlocked decks');
    appendCurriculumRelationshipGroups(unlockScroll, neighborhood.unlocks, progressStates, 'Nothing currently declares this as a prerequisite.', 'later');
    unlocks.appendChild(unlockScroll);
    const mobileTabs = document.createElement('div');
    mobileTabs.className = 'curriculum-mobile-relation-tabs';
    mobileTabs.innerHTML = '<button type="button" class="active" data-relation="prerequisites">Prerequisites</button><button type="button" data-relation="unlocks">Unlocks</button>';
    prerequisites.classList.add('is-mobile-active');
    mobileTabs.querySelectorAll('button').forEach(button => {
        button.onclick = () => {
            const showPrerequisites = button.dataset.relation === 'prerequisites';
            prerequisites.classList.toggle('is-mobile-active', showPrerequisites);
            unlocks.classList.toggle('is-mobile-active', !showPrerequisites);
            mobileTabs.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        };
    });
    explorer.append(prerequisites, selected, mobileTabs, unlocks);
    root.appendChild(explorer);
    fitCurriculumNeighborhoodViewport(explorer);
}

function curriculumGraphControls({ windowState = null, interactive = false } = {}) {
    const controls = document.createElement('div');
    controls.className = `curriculum-graph-controls${windowState ? ' is-layered' : ''}`;
    const layerNavigation = windowState ? `
        <span class="curriculum-graph-navigation">
            <button type="button" data-action="previous-layer" aria-label="Show previous dependency layer"${windowState.layer <= windowState.minLayer ? ' disabled' : ''}>←</button>
            <span class="curriculum-layer-label">Layer ${windowState.layer + 1} of ${windowState.layerCount}</span>
            <button type="button" data-action="next-layer" aria-label="Show next dependency layer"${windowState.layer >= windowState.maxLayer ? ' disabled' : ''}>→</button>
        </span>` : '';
    controls.innerHTML = `
        ${layerNavigation}
        <span class="curriculum-graph-view-actions">
            ${interactive ? '<button type="button" data-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>' : ''}
            <button type="button" data-action="fit">Fit</button>
        </span>`;
    return controls;
}

function connectCurriculumGraphControls(controls, controller) {
    controls.querySelector('[data-action="fit"]').onclick = controller.fit;
    const zoomIn = controls.querySelector('[data-action="zoom-in"]');
    const zoomOut = controls.querySelector('[data-action="zoom-out"]');
    if (zoomIn) zoomIn.onclick = controller.zoomIn;
    if (zoomOut) zoomOut.onclick = controller.zoomOut;
}

async function renderCurriculumGraph(root, progressStates, graph, { layered = false, emptyMessage = 'No curriculum items are available.' } = {}) {
    if (!graph.nodes.length) {
        const empty = document.createElement('p');
        empty.className = 'curriculum-explorer-empty curriculum-graph-empty';
        empty.textContent = emptyMessage;
        root.appendChild(empty);
        return;
    }
    const windowState = layered
        ? curriculumLayerWindow(graph, curriculumViewState.layerStart, 3)
        : null;
    if (windowState) curriculumViewState.layerStart = windowState.layer;
    const subjectOverview = !layered && graph.nodes.every(node => node.nodeType === 'subject');
    const controls = curriculumGraphControls({ windowState, interactive: subjectOverview });
    root.appendChild(controls);
    const controller = await renderCurriculumGraphCanvas(root, graph, progressStates, {
        ranked: layered,
        focusRanks: windowState ? {
            start: windowState.start,
            end: windowState.end,
            layer: windowState.layer
        } : null
    });
    connectCurriculumGraphControls(controls, controller);
    if (!windowState) return;
    const previous = controls.querySelector('[data-action="previous-layer"]');
    const next = controls.querySelector('[data-action="next-layer"]');
    previous.onclick = () => navigateCurriculum({ layerStart: windowState.layer - 1 });
    next.onclick = () => navigateCurriculum({ layerStart: windowState.layer + 1 });
}

function deckJobProvenance(registry) {
    return {
        registryId: registry?.id,
        workflowCommit: WORKFLOW_COMMIT,
        registryBaseCommit: registry?.resolved_commit,
        catalogHash: registry?.catalog_hash
    };
}

async function queueCurriculumAgentJob(job, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Queueing…';
    try {
        const result = await githubAuth.apiRequest('/api/generation-requests', {
            method: 'POST',
            body: JSON.stringify(job)
        });
        const initialRequest = {
            ...result.request,
            job_type: job.jobType,
            registry_id: job.registryId,
            provider_id: job.providerId,
            model_id: job.modelId,
            payload: job.payload
        };
        button.textContent = result.existing ? 'Already queued' : 'Agent queued';
        openGenerationActivity({
            focusRequestId: result.request.id,
            initialRequest
        });
        return result;
    } catch (error) {
        button.disabled = false;
        button.textContent = originalText;
        throw error;
    }
}

function renderEmptyChapterCurriculum(root, deck, registry) {
    const empty = document.createElement('section');
    empty.className = 'curriculum-chapter-empty';
    const title = document.createElement('h2');
    title.textContent = 'No chapter curriculum yet';
    const description = document.createElement('p');
    description.textContent = 'Create an AI-authored ordered chapter plan and dependency graph before generating any chapter content.';
    empty.append(title, description);
    if (deckNeedsChapterCurriculum(deck) && !curriculumPreview) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'curriculum-toolbar-action is-primary';
        button.textContent = 'Create chapter curriculum';
        button.disabled = true;
        button.onclick = async () => {
            try {
                const job = generationJobForChapterCurriculum(
                    deck,
                    await connectedWebsiteGenerationPreferences(),
                    deckJobProvenance(registry)
                );
                await queueCurriculumAgentJob(job, button);
            } catch (error) {
                console.error('[Curriculum] Chapter curriculum request failed:', error);
                alert(`Could not queue chapter curriculum: ${error.message}`);
            }
        };
        empty.appendChild(button);
        configureWebsiteGenerationButton(button, { registry });
    }
    root.appendChild(empty);
}

async function renderCurriculumView(options = {}) {
    const root = document.getElementById('curriculum-view');
    if (!root) return;
    if (!curriculumIndex) {
        root.innerHTML = '<div class="loading">Curriculum data is unavailable.</div>';
        return;
    }
    Object.assign(curriculumViewState, options);
    curriculumViewState.includeRecommended = false;
    if (curriculumViewState.mode === 'full') {
        curriculumViewState.mode = curriculumViewState.hierarchy === 'subject'
            ? 'overview'
            : curriculumViewState.hierarchy === 'chapter' ? 'chapters' : 'subject';
    }
    const [decks, cards, reviews, chapterProgress] = await Promise.all([
        getAllDecks(), getAllCards(), getAllReviews(), getAllChapterProgress()
    ]);
    const progressStates = curriculumDeckProgressStates(
        decks, cards, reviews, chapterProgress, new Date()
    );
    const { mode, hierarchy, subject, parentId } = curriculumViewState;
    ensureCurriculumNavigationHistory();
    root.innerHTML = '';

    const breadcrumbRow = document.createElement('div');
    breadcrumbRow.className = 'curriculum-breadcrumb-row';
    const breadcrumbs = document.createElement('nav');
    breadcrumbs.className = 'curriculum-breadcrumb';
    breadcrumbs.setAttribute('aria-label', 'Curriculum hierarchy');
    breadcrumbs.innerHTML = '<span class="curriculum-breadcrumb-home">~</span><span aria-hidden="true">/</span>';
    const deckId = hierarchy === 'chapter' ? parentId : hierarchy === 'deck' && mode === 'focus' ? curriculumViewState.targetId : '';
    const activeRegistry = curriculumRegistryForView(curriculumIndex, { subjectId: subject, deckId });
    const registryLabel = activeRegistry?.repository || activeRegistry?.name || activeRegistry?.id || 'curricula';
    const repositoryParts = String(registryLabel).split('/');
    const repositoryOwner = repositoryParts.length === 2 ? repositoryParts[0] : '';
    const repositoryName = repositoryParts.length === 2 ? repositoryParts[1] : registryLabel;
    let crumbCount = 0;
    const addCrumbSeparator = () => {
        if (crumbCount === 0) return;
        const separator = document.createElement('span');
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '/';
        breadcrumbs.appendChild(separator);
    };
    const addCrumbLabel = label => {
        addCrumbSeparator();
        const item = document.createElement('span');
        item.className = 'curriculum-breadcrumb-label';
        item.textContent = label;
        breadcrumbs.appendChild(item);
        crumbCount += 1;
    };
    const addCrumb = (label, options, active = false) => {
        addCrumbSeparator();
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        if (active) button.setAttribute('aria-current', 'page');
        else button.onclick = () => navigateCurriculum(options);
        breadcrumbs.appendChild(button);
        crumbCount += 1;
    };
    if (repositoryOwner) addCrumbLabel(repositoryOwner);
    addCrumb(repositoryName, { mode: 'overview', hierarchy: 'subject', subject: '', parentId: '', targetId: '', query: '', layerStart: 0 }, hierarchy === 'subject');
    if (subject) {
        const subjectAnchor = deckId || '';
        addCrumb(subject, {
            mode: 'subject', hierarchy: 'deck', subject, parentId: subject,
            targetId: '', query: '',
            layerStart: curriculumDeckLayer(subject, subjectAnchor),
            anchorId: subjectAnchor
        }, hierarchy === 'deck' && mode === 'subject');
    }
    if (deckId) addCrumb(deckId.split('/').pop(), {
        mode: 'chapters', hierarchy: 'chapter', subject: subject || deckId.split('/')[0],
        parentId: deckId, targetId: '', query: '', layerStart: 0
    }, hierarchy === 'chapter' || (hierarchy === 'deck' && mode === 'focus'));
    const historyControls = document.createElement('span');
    historyControls.className = 'curriculum-history-controls';
    historyControls.innerHTML = `
        <button type="button" aria-label="Back in curriculum" title="Back"${curriculumNavigationHistoryIndex <= 0 ? ' disabled' : ''}>←</button>
        <button type="button" aria-label="Forward in curriculum" title="Forward"${curriculumNavigationHistoryIndex >= curriculumNavigationHistory.length - 1 ? ' disabled' : ''}>→</button>
    `;
    historyControls.firstElementChild.onclick = () => moveCurriculumNavigationHistory(-1);
    historyControls.lastElementChild.onclick = () => moveCurriculumNavigationHistory(1);
    const breadcrumbActions = document.createElement('span');
    breadcrumbActions.className = 'curriculum-breadcrumb-actions';
    if (hierarchy === 'subject' && mode === 'overview') {
        if (!curriculumPreview) {
            const createSubject = document.createElement('button');
            createSubject.type = 'button';
            createSubject.className = 'curriculum-toolbar-action is-primary';
            createSubject.textContent = 'Create subject';
            createSubject.disabled = true;
            createSubject.onclick = () => openCurriculumBuilder('', activeRegistry);
            breadcrumbActions.append(createSubject);
            configureWebsiteGenerationButton(createSubject, { registry: activeRegistry });
        }
    }
    if (hierarchy === 'chapter' && deckId) {
        const dependencies = document.createElement('button');
        dependencies.type = 'button';
        dependencies.className = 'curriculum-toolbar-action';
        dependencies.textContent = 'Prerequisites & unlocks';
        dependencies.onclick = () => navigateCurriculum({
            mode: 'focus', hierarchy: 'deck', subject: subject || deckId.split('/')[0],
            parentId: subject || deckId.split('/')[0], targetId: deckId, query: ''
        });
        breadcrumbActions.append(dependencies);
    }
    breadcrumbRow.append(breadcrumbs, historyControls);
    if (breadcrumbActions.childElementCount) breadcrumbRow.append(breadcrumbActions);
    root.appendChild(breadcrumbRow);
    const previewBanner = curriculumPreviewBanner();
    if (previewBanner) root.appendChild(previewBanner);

    if (mode === 'focus') renderCurriculumNeighborhood(root, progressStates);
    else if (mode === 'overview') {
        await renderCurriculumGraph(root, progressStates, subjectOverviewGraph(curriculumIndex));
    } else if (mode === 'subject') {
        await renderCurriculumGraph(root, progressStates, subjectDeckGraph(curriculumIndex, subject), { layered: true });
    } else {
        const graph = chapterGraph(curriculumIndex, parentId);
        const deck = curriculumMaps(curriculumIndex).decks.get(parentId);
        if (!graph.nodes.length && deck) renderEmptyChapterCurriculum(root, deck, activeRegistry);
        else await renderCurriculumGraph(root, progressStates, graph, { layered: true });
    }
    requestAnimationFrame(() => requestAnimationFrame(restoreCurriculumPosition));
}

async function renderLegacyCurriculumView(options = {}) {
    const root = document.getElementById('curriculum-view');
    if (!root) return;
    if (!curriculumIndex) {
        root.innerHTML = '<div class="loading">Curriculum data is unavailable.</div>';
        return;
    }
    Object.assign(curriculumViewState, options);
    const { query, subject, includeRecommended, mode, targetId, graphView } = curriculumViewState;
    const installed = installedCurriculumIds(await getAllDecks());
    const subjects = [...new Set(curriculumIndex.decks.map(deck => deck.subject))].sort();
    const completeGraph = mode === 'overview'
        ? subjectOverviewGraph(curriculumIndex, { query, includeRecommended })
        : mode === 'path'
            ? focusedCurriculumGraph(curriculumIndex, targetId, { includeRecommended })
            : mode === 'chapters'
                ? chapterGraph(curriculumIndex, targetId)
                : curriculumGraph(curriculumIndex, {
                    subject: subject || null,
                    query,
                    includeRecommended
                });
    const useLayerExplorer = mode === 'subject' && graphView !== 'full' && !query.trim();
    const layerState = useLayerExplorer
        ? curriculumLayerGraph(completeGraph, curriculumViewState.layer)
        : null;
    if (layerState) curriculumViewState.layer = layerState.layer;
    const graph = layerState?.graph || completeGraph;

    root.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'curriculum-toolbar';
    const modes = document.createElement('div');
    modes.className = 'curriculum-mode-tabs';
    const modeOptions = [
        ['overview', 'Subjects'],
        ...(subject ? [['subject', subject]] : []),
        ...(targetId ? [['path', 'Path']] : []),
        ...(targetId && curriculumMaps(curriculumIndex).decks.get(targetId)?.chapters?.length ? [['chapters', 'Chapters']] : [])
    ];
    for (const [value, label] of modeOptions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.classList.toggle('active', mode === value);
        button.onclick = () => renderCurriculumView({
            mode: value,
            query: '',
            ...(value === 'subject' ? { graphView: 'layers', layer: null } : {})
        });
        modes.appendChild(button);
    }
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search the curriculum...';
    search.value = query;
    search.setAttribute('aria-label', 'Search curriculum');
    if (mode === 'path' || mode === 'chapters') search.classList.add('hidden');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Filter curriculum by subject');
    select.innerHTML = `<option value="">All subjects</option>${subjects
        .map(item => `<option value="${escapeHtml(item)}"${item === subject ? ' selected' : ''}>${escapeHtml(item)}</option>`)
        .join('')}`;
    const recommendedLabel = document.createElement('label');
    recommendedLabel.className = 'curriculum-recommended-toggle';
    const recommended = document.createElement('input');
    recommended.type = 'checkbox';
    recommended.checked = includeRecommended;
    recommendedLabel.append(recommended, document.createTextNode('Recommended paths'));
    const sourcesButton = document.createElement('button');
    sourcesButton.type = 'button';
    sourcesButton.className = 'curriculum-toolbar-action';
    sourcesButton.textContent = 'Sources';
    sourcesButton.onclick = openCurriculumSources;
    const generationSettingsButton = document.createElement('button');
    generationSettingsButton.type = 'button';
    generationSettingsButton.className = 'curriculum-toolbar-action';
    generationSettingsButton.textContent = 'Generation settings';
    generationSettingsButton.onclick = openStudySettings;
    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'curriculum-toolbar-action is-primary';
    createButton.textContent = subject ? 'Edit subject' : 'Create curriculum';
    createButton.onclick = () => openCurriculumBuilder(subject || '');
    if (mode === 'overview') select.classList.add('hidden');
    toolbar.append(
        modes,
        search,
        select,
        recommendedLabel,
        sourcesButton,
        generationSettingsButton,
        createButton
    );
    root.appendChild(toolbar);

    const summary = document.createElement('div');
    summary.className = 'curriculum-summary';
    summary.textContent = mode === 'overview'
        ? `${graph.nodes.length} subjects · select one to explore its decks`
        : mode === 'path'
            ? `${graph.nodes.length} decks in the prerequisite path · select the highlighted target for details`
            : mode === 'chapters'
                ? `${graph.nodes.length} chapters · arrows point from prerequisite to dependent chapter`
                : layerState
                    ? `Layer ${layerState.layer + 1} of ${layerState.layerCount} · ${layerState.focusIds.length} deck${layerState.focusIds.length === 1 ? '' : 's'} highlighted · direct prerequisites and dependents are shown`
                : `${graph.nodes.length} decks · external prerequisites are retained as entry portals`;
    root.appendChild(summary);

    const controls = document.createElement('div');
    controls.className = 'curriculum-graph-controls';
    controls.innerHTML = `
        <span class="curriculum-graph-legend">
            <span><i class="required"></i>Required</span>
            <span><i class="recommended"></i>Recommended</span>
        </span>
        ${mode === 'subject' && !query.trim() ? `
            <span class="curriculum-graph-navigation">
                ${layerState ? `
                    <button type="button" data-action="previous-layer" aria-label="Previous curriculum layer"${layerState.layer === 0 ? ' disabled' : ''}>←</button>
                    <span class="curriculum-layer-label">Layer ${layerState.layer + 1} / ${layerState.layerCount}</span>
                    <button type="button" data-action="next-layer" aria-label="Next curriculum layer"${layerState.layer >= layerState.layerCount - 1 ? ' disabled' : ''}>→</button>
                    <button type="button" data-action="full-graph">Full graph</button>
                ` : '<button type="button" data-action="layer-graph">Explore layers</button>'}
            </span>
        ` : ''}
        <span class="curriculum-graph-view-actions">
            <button type="button" data-action="fit">Fit</button>
        </span>
    `;
    root.appendChild(controls);
    const controller = graph.nodes.length
        ? await renderCurriculumGraphCanvas(root, graph, installed)
        : null;
    if (!controller) {
        const empty = document.createElement('div');
        empty.className = 'loading curriculum-graph-empty';
        empty.textContent = 'No curriculum matches.';
        root.appendChild(empty);
    } else {
        controls.querySelector('[data-action="fit"]').onclick = controller.fit;
        const rerenderLayer = layer => renderCurriculumView({
            graphView: 'layers',
            layer,
            query: ''
        });
        const previousLayer = controls.querySelector('[data-action="previous-layer"]');
        const nextLayer = controls.querySelector('[data-action="next-layer"]');
        if (previousLayer) previousLayer.onclick = () => rerenderLayer(layerState.layer - 1);
        if (nextLayer) nextLayer.onclick = () => rerenderLayer(layerState.layer + 1);
        const fullGraph = controls.querySelector('[data-action="full-graph"]');
        if (fullGraph) fullGraph.onclick = () => renderCurriculumView({ graphView: 'full' });
        const layerGraph = controls.querySelector('[data-action="layer-graph"]');
        if (layerGraph) layerGraph.onclick = () => rerenderLayer(null);
    }

    let timer = null;
    search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => renderCurriculumView({
            query: search.value,
            subject: select.value,
            includeRecommended: recommended.checked,
            mode
        }), 120);
    });
    select.addEventListener('change', () => renderCurriculumView({
        query: search.value,
        subject: select.value,
        includeRecommended: recommended.checked,
        mode: select.value ? 'subject' : 'overview',
        graphView: 'layers',
        layer: null
    }));
    recommended.addEventListener('change', () => renderCurriculumView({
        query: search.value,
        subject: select.value,
        includeRecommended: recommended.checked,
        mode
    }));
}

function curriculumOverlay(title) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay curriculum-builder-overlay';
    overlay.innerHTML = `<div class="curriculum-builder-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <header><h2>${escapeHtml(title)}</h2><button type="button" data-close aria-label="Close">×</button></header>
        <div class="curriculum-builder-content"></div>
    </div>`;
    const close = () => {
        overlay.dispatchEvent(new Event('close'));
        overlay.remove();
    };
    overlay.querySelector('[data-close]').onclick = close;
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.body.appendChild(overlay);
    return { overlay, content: overlay.querySelector('.curriculum-builder-content'), close };
}

function generationActivityButtonText() {
    const { active, review } = summarizeGenerationActivity(generationRequests);
    if (active) return `Agents (${active} active)`;
    if (review) return `Agents (${review} review)`;
    return 'Agents';
}

function updateGenerationActivityButtons() {
    const label = generationActivityButtonText();
    document.querySelectorAll('[data-generation-activity]').forEach(button => {
        button.textContent = label;
        button.setAttribute('aria-label', `AI generation activity. ${label}.`);
    });
}

function upsertGenerationRequest(input) {
    const request = normalizeGenerationRequest(input);
    generationRequests = [
        request,
        ...generationRequests.filter(item => item.id !== request.id)
    ];
    generationRequests = sortGenerationRequestsByInitiatedAt(generationRequests);
    updateGenerationActivityButtons();
    return request;
}

async function refreshGenerationActivity({ forceReconcile = false } = {}) {
    if (!githubAuth.isAuthenticated()) return [];
    if (generationActivityRefreshPromise) return generationActivityRefreshPromise;
    generationActivityRefreshPromise = githubAuth.apiRequest('/api/generation-requests')
        .then(async result => {
            const requests = (result.requests || []).map(normalizeGenerationRequest);
            const shouldReconcile = forceReconcile
                || Date.now() - generationActivityLastReconciledAt >= 60_000;
            generationRequests = shouldReconcile
                ? await reconcileGenerationRequestStatuses(requests, {
                    token: githubAuth.getToken(),
                    updateRequest: (id, partial) => githubAuth.apiRequest(`/api/generation-requests/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(partial)
                    })
                })
                : requests;
            if (shouldReconcile) generationActivityLastReconciledAt = Date.now();
            generationRequests = sortGenerationRequestsByInitiatedAt(generationRequests);
            updateGenerationActivityButtons();
            document.dispatchEvent(new CustomEvent('generationactivitychange'));
            return generationRequests;
        })
        .finally(() => { generationActivityRefreshPromise = null; });
    return generationActivityRefreshPromise;
}

function ensureGenerationActivityPolling() {
    if (!githubAuth.isAuthenticated()) return;
    refreshGenerationActivity({ forceReconcile: true })
        .catch(error => console.warn('[Generation] Activity refresh failed:', error));
    if (generationActivityPollTimer) return;
    generationActivityPollTimer = setInterval(() => {
        if (document.hidden || !document.querySelector('[data-generation-activity], [data-generation-activity-list]')) return;
        refreshGenerationActivity().catch(error => console.warn('[Generation] Activity refresh failed:', error));
    }, 5000);
}

function generationRequestMeta(request) {
    const parts = [`Request ${request.id}`];
    if (request.requestedAt) {
        const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(request.requestedAt)
            ? `${request.requestedAt.replace(' ', 'T')}Z`
            : request.requestedAt;
        const started = new Date(normalized);
        if (!Number.isNaN(started.getTime())) parts.push(`started ${started.toLocaleString()}`);
    }
    if (request.providerId) parts.push(request.providerId);
    if (request.modelId) parts.push(request.modelId);
    if (request.payload?.reasoningEffort) parts.push(`${request.payload.reasoningEffort} reasoning`);
    return parts.join(' · ');
}

async function enterCurriculumPreview(request, close, trigger) {
    const originalText = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = 'Loading…';
    try {
        const { catalog, commit, pull } = await loadPullRequestCurriculum(request, {
            token: githubAuth.getToken()
        });
        const publishedIndex = curriculumPreview?.publishedIndex || curriculumIndex;
        curriculumPreview = { publishedIndex, request, commit, pull };
        curriculumIndex = catalog;
        curriculumNavigationHistory = [];
        curriculumNavigationHistoryIndex = -1;
        close();
        await showMainView('curriculum');
        await navigateCurriculum({
            mode: 'subject', hierarchy: 'deck', subject: request.subject,
            parentId: request.subject, targetId: '', query: '', layerStart: 0
        }, { replace: true, trackHistory: false });
    } catch (error) {
        trigger.disabled = false;
        trigger.textContent = originalText;
        const row = trigger.closest('.generation-activity-item');
        const message = row?.querySelector('[data-preview-error]');
        if (message) message.textContent = error.message;
    }
}

async function exitCurriculumPreview() {
    if (!curriculumPreview) return;
    curriculumIndex = curriculumPreview.publishedIndex;
    curriculumPreview = null;
    curriculumNavigationHistory = [];
    curriculumNavigationHistoryIndex = -1;
    await navigateCurriculum({
        mode: 'overview', hierarchy: 'subject', subject: '', parentId: '',
        targetId: '', query: '', layerStart: 0
    }, { replace: true, trackHistory: false });
}

function appendGenerationRequestRow(list, request, close) {
    const item = document.createElement('article');
    item.className = 'generation-activity-item';
    item.dataset.requestId = String(request.id);

    const header = document.createElement('div');
    header.className = 'generation-activity-item-header';
    const identity = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = generationRequestName(request);
    const meta = document.createElement('p');
    meta.textContent = generationRequestMeta(request);
    identity.append(title, meta);
    const status = document.createElement('span');
    status.className = `generation-activity-status is-${request.status}`;
    status.textContent = generationStatusLabel(request.status);
    header.append(identity, status);
    item.appendChild(header);

    if (request.error) {
        const error = document.createElement('p');
        error.className = 'generation-activity-error';
        error.textContent = request.error;
        item.appendChild(error);
    }

    const actions = document.createElement('div');
    actions.className = 'generation-activity-actions';
    if (request.jobType === 'subject-design' && request.status === 'needs-review' && request.resultUrl) {
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.textContent = 'Preview curriculum';
        preview.onclick = () => enterCurriculumPreview(request, close, preview);
        actions.appendChild(preview);
    }
    if (request.resultUrl) {
        try {
            pullRequestCoordinates(request.resultUrl);
            const link = document.createElement('a');
            link.href = request.resultUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = generationPullRequestActionLabel(request.status);
            actions.appendChild(link);
        } catch { /* The worker result is not a pull request. */ }
    }
    if (actions.childElementCount) item.appendChild(actions);
    const previewError = document.createElement('p');
    previewError.className = 'generation-activity-error';
    previewError.dataset.previewError = '';
    previewError.setAttribute('aria-live', 'polite');
    item.appendChild(previewError);
    list.appendChild(item);
}

function renderGenerationActivitySettings({ focusRequestId = null } = {}) {
    const content = document.getElementById('study-settings-pane-agents');
    if (!content || content.hidden) return;
    content.replaceChildren();
    const summary = summarizeGenerationActivity(generationRequests);
    const summaryText = document.createElement('p');
    summaryText.className = 'generation-activity-summary';
    summaryText.textContent = summary.active
        ? `${summary.active} agent${summary.active === 1 ? '' : 's'} currently running or queued. ${summary.review} awaiting review.`
        : `No agents currently running. ${summary.review} result${summary.review === 1 ? '' : 's'} awaiting review.`;
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'generation-activity-refresh';
    refresh.textContent = 'Refresh';
    refresh.onclick = async () => {
        refresh.disabled = true;
        await refreshGenerationActivity({ forceReconcile: true })
            .catch(error => { summaryText.textContent = error.message; });
        renderGenerationActivitySettings({ focusRequestId });
    };
    const list = document.createElement('div');
    list.className = 'generation-activity-list';
    const requests = sortGenerationRequestsByInitiatedAt(generationRequests);
    if (!requests.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No generation requests yet.';
        list.appendChild(empty);
    } else {
        requests.forEach(request => appendGenerationRequestRow(list, request, closeStudySettings));
    }
    content.append(summaryText, refresh, list);
    if (focusRequestId != null) {
        list.querySelector(`[data-request-id="${CSS.escape(String(focusRequestId))}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }
}

function openGenerationActivity({ focusRequestId = null, initialRequest = null } = {}) {
    if (!githubAuth.isAuthenticated()) {
        alert('Sign in with GitHub to view generation activity.');
        return;
    }
    if (initialRequest) upsertGenerationRequest(initialRequest);
    openStudySettings({ tab: 'agents', focusRequestId });
    ensureGenerationActivityPolling();
}

function curriculumPreviewBanner() {
    if (!curriculumPreview) return null;
    const banner = document.createElement('aside');
    banner.className = 'curriculum-preview-banner';
    const text = document.createElement('p');
    text.textContent = `Previewing unmerged ${curriculumPreview.request.subject} curriculum from pull request #${curriculumPreview.pull.number} at ${curriculumPreview.commit.slice(0, 12)}.`;
    const actions = document.createElement('div');
    const link = document.createElement('a');
    link.href = curriculumPreview.request.resultUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Review pull request';
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.textContent = 'Exit preview';
    exit.onclick = exitCurriculumPreview;
    actions.append(link, exit);
    banner.append(text, actions);
    return banner;
}

function openCurriculumSources() {
    const { content, close } = curriculumOverlay('Curriculum sources');
    const sources = getCurriculumRegistrySources();
    content.innerHTML = `<p class="curriculum-builder-help">Registries are public GitHub repositories. The first enabled source wins if two registries publish the same subject/deck ID.</p>
        <div data-sources></div>
        <button type="button" class="curriculum-add-row" data-add>Add source</button>
        <div class="curriculum-builder-actions"><button type="button" data-save>Save and reload</button></div>`;
    const list = content.querySelector('[data-sources]');
    const render = () => {
        list.innerHTML = '';
        sources.forEach((source, index) => {
            const row = document.createElement('div');
            row.className = 'curriculum-source-row';
            row.innerHTML = `<input type="checkbox" ${source.enabled !== false ? 'checked' : ''} aria-label="Enable source">
                <input value="${escapeHtml(source.repository)}" placeholder="owner/curricula" aria-label="GitHub repository">
                <input value="${escapeHtml(source.ref || 'master')}" placeholder="branch" aria-label="Branch">
                <button type="button" aria-label="Remove source">×</button>`;
            const inputs = row.querySelectorAll('input');
            inputs[0].onchange = () => { source.enabled = inputs[0].checked; };
            inputs[1].oninput = () => { source.repository = inputs[1].value.trim(); source.id = source.repository.replace('/', '-'); source.name = source.repository; };
            inputs[2].oninput = () => { source.ref = inputs[2].value.trim(); };
            row.querySelector('button').onclick = () => { sources.splice(index, 1); render(); };
            list.appendChild(row);
        });
    };
    render();
    content.querySelector('[data-add]').onclick = () => {
        sources.push({ id: 'new-source', name: 'New source', repository: '', ref: 'master', path: 'dist/curriculum.json', enabled: true });
        render();
    };
    content.querySelector('[data-save]').onclick = () => {
        try {
            saveCurriculumRegistrySources(sources);
            close();
            location.reload();
        } catch (error) {
            alert(error.message);
        }
    };
}

function renderCurriculumSettingsSources() {
    const list = document.getElementById('curriculum-settings-sources');
    if (!list) return;
    list.innerHTML = '';
    pendingCurriculumSources.forEach((source, index) => {
        const row = document.createElement('div');
        row.className = 'curriculum-source-row';
        row.innerHTML = `<input type="checkbox" ${source.enabled !== false ? 'checked' : ''} aria-label="Enable curriculum source ${index + 1}">
            <input value="${escapeHtml(source.repository)}" placeholder="owner/curricula" aria-label="Curriculum source repository ${index + 1}">
            <input value="${escapeHtml(source.ref || 'master')}" placeholder="branch" aria-label="Curriculum source branch ${index + 1}">
            <button type="button" aria-label="Remove curriculum source ${index + 1}">×</button>`;
        const inputs = row.querySelectorAll('input');
        inputs[0].onchange = () => { source.enabled = inputs[0].checked; };
        inputs[1].oninput = () => {
            source.repository = inputs[1].value.trim();
            source.id = source.repository.replace('/', '-');
            source.name = source.repository;
        };
        inputs[2].oninput = () => { source.ref = inputs[2].value.trim(); };
        row.querySelector('button').onclick = () => {
            pendingCurriculumSources.splice(index, 1);
            renderCurriculumSettingsSources();
        };
        list.appendChild(row);
    });
}

function openCurriculumBuilder(subjectId = '', registry = null) {
    const targetRegistry = registry || curriculumRegistryForView(curriculumIndex, { subjectId });
    const targetRepository = targetRegistry?.repository || 'the active curriculum registry';
    const existing = subjectId ? curriculumMaps(curriculumIndex).decks : new Map();
    const subjectMeta = curriculumIndex.subjects?.find(item => item.id === subjectId) || {};
    const draft = {
        subject: subjectId,
        title: subjectId ? subjectId.replaceAll('-', ' ').replace(/\b\w/g, value => value.toUpperCase()) : '',
        destination: subjectMeta.destination || 'whole-field',
        deckGranularity: subjectMeta.deck_granularity || 'course',
        focus: Array.isArray(subjectMeta.focus) ? subjectMeta.focus.join(', ') : (subjectMeta.focus || ''),
        instructions: '',
        proposedDecks: [...existing.values()]
            .filter(deck => deck.subject === subjectId)
            .sort((a, b) => a.order - b.order)
            .map(deck => ({
                id: deck.deck,
                description: deck.description || '',
                prerequisites: (deck.prerequisites || []).map(id => id.startsWith(`${subjectId}/`) ? id.split('/')[1] : id)
            }))
    };
    const { content, close } = curriculumOverlay(subjectId ? `Edit ${subjectId}` : 'Create subject');
    content.innerHTML = `<form class="curriculum-builder-form">
            <div class="curriculum-builder-grid">
                <div class="curriculum-builder-field">
                    <label>Subject name<input name="subject" value="${escapeHtml(draft.subject)}" placeholder="earth-science" aria-describedby="curriculum-subject-name-hint" ${subjectId ? 'readonly' : ''}></label>
                    <p id="curriculum-subject-name-hint" class="curriculum-builder-field-error" data-subject-errors aria-live="polite"></p>
                </div>
                <label>Destination<select name="destination"><option>literacy</option><option>undergraduate-core</option><option>graduate-core</option><option>whole-field</option><option>research-specialization</option></select></label>
                <label>Deck size<select name="deckGranularity"><option value="module">module</option><option value="course">course</option><option value="broad-area">broad-area</option></select></label>
            </div>
            <details class="curriculum-builder-advanced">
                <summary>Advanced options</summary>
                <div class="curriculum-builder-grid">
                    <label>Focus areas<input name="focus" value="${escapeHtml(draft.focus)}" placeholder="neuroscience, genomics"></label>
                </div>
                <label>Optional exceptions or emphasis<textarea name="instructions" rows="3" placeholder="Leave blank for the versioned workflow"></textarea></label>
                <div class="curriculum-builder-decks-head"><h3>Draft decks and prerequisite edges</h3><button type="button" data-add-deck>Add deck</button></div>
                <div data-decks class="curriculum-builder-decks"></div>
            </details>
            <div data-errors class="curriculum-builder-errors" aria-live="polite"></div>
            <div class="curriculum-builder-actions"><button type="submit">Queue AI draft</button></div>
        </form>`;
    const form = content.querySelector('form');
    const field = name => form.elements.namedItem(name);
    field('destination').value = draft.destination;
    field('deckGranularity').value = draft.deckGranularity;
    const deckList = content.querySelector('[data-decks]');
    const readDraft = () => ({
        subject: field('subject').value,
        title: titleForSubject(field('subject').value),
        destination: field('destination').value,
        deckGranularity: field('deckGranularity').value,
        focus: field('focus').value,
        instructions: field('instructions').value,
        proposedDecks: draft.proposedDecks
    });
    const validate = () => {
        const result = validateCurriculumDraft(readDraft());
        const subjectErrorMessages = new Set([
            'Subject must use lowercase kebab-case.',
            'Subject title is required.'
        ]);
        content.querySelector('[data-subject-errors]').textContent = result.errors
            .filter(error => subjectErrorMessages.has(error))
            .join(' ');
        content.querySelector('[data-errors]').textContent = result.errors
            .filter(error => !subjectErrorMessages.has(error))
            .join(' ');
        return result;
    };
    const renderDecks = () => {
        deckList.innerHTML = '';
        draft.proposedDecks.forEach((deck, index) => {
            const row = document.createElement('div');
            row.className = 'curriculum-builder-deck';
            row.innerHTML = `<span class="curriculum-builder-order">${index + 1}</span>
                <input value="${escapeHtml(deck.id)}" placeholder="deck-id" aria-label="Deck ID">
                <input value="${escapeHtml(deck.description)}" placeholder="Purpose" aria-label="Deck purpose">
                <input value="${escapeHtml((deck.prerequisites || []).join(', '))}" placeholder="requires: earlier-deck" aria-label="Prerequisites">
                <span class="curriculum-builder-row-actions"><button type="button" data-up aria-label="Move up">↑</button><button type="button" data-down aria-label="Move down">↓</button><button type="button" data-remove aria-label="Remove">×</button></span>`;
            const inputs = row.querySelectorAll('input');
            inputs[0].oninput = () => { deck.id = inputs[0].value; validate(); };
            inputs[1].oninput = () => { deck.description = inputs[1].value; };
            inputs[2].oninput = () => { deck.prerequisites = inputs[2].value.split(',').map(value => value.trim()).filter(Boolean); validate(); };
            row.querySelector('[data-up]').onclick = () => { if (index) [draft.proposedDecks[index - 1], draft.proposedDecks[index]] = [deck, draft.proposedDecks[index - 1]]; renderDecks(); };
            row.querySelector('[data-down]').onclick = () => { if (index < draft.proposedDecks.length - 1) [draft.proposedDecks[index + 1], draft.proposedDecks[index]] = [deck, draft.proposedDecks[index + 1]]; renderDecks(); };
            row.querySelector('[data-remove]').onclick = () => { draft.proposedDecks.splice(index, 1); renderDecks(); };
            deckList.appendChild(row);
        });
        validate();
    };
    content.querySelector('[data-add-deck]').onclick = () => {
        draft.proposedDecks.push({ id: '', description: '', prerequisites: [] });
        renderDecks();
    };
    form.addEventListener('input', validate);
    form.onsubmit = async event => {
        event.preventDefault();
        if (!githubAuth.isAuthenticated()) return alert('Sign in with GitHub to queue a curriculum draft.');
        try {
            const generationPreferences = await connectedWebsiteGenerationPreferences();
            const job = generationJobForDraft(readDraft(), {
                registryId: targetRegistry?.id,
                targetRepository: targetRegistry?.repository,
                providerId: generationPreferences.providerId,
                modelId: generationPreferences.modelId,
                reasoningEffort: generationPreferences.reasoningEffort,
                workflowCommit: WORKFLOW_COMMIT,
                registryBaseCommit: targetRegistry?.resolved_commit,
                catalogHash: targetRegistry?.catalog_hash,
                registryRef: targetRegistry?.ref,
                catalogPath: targetRegistry?.path
            });
            const button = form.querySelector('[type="submit"]');
            button.disabled = true;
            button.textContent = 'Queueing…';
            const result = await githubAuth.apiRequest('/api/generation-requests', {
                method: 'POST', body: JSON.stringify(job)
            });
            console.info('[Curriculum] Subject-design request queued', {
                requestId: result.request.id,
                subject: job.payload.subject,
                registryId: job.registryId,
                targetRepository: job.targetRepository,
                providerId: job.providerId,
                modelId: job.modelId,
                workflowVersion: job.payload.workflowVersion,
                registryBaseCommit: job.payload.registryBaseCommit,
                catalogHash: job.payload.catalogHash
            });
            close();
            openGenerationActivity({
                focusRequestId: result.request.id,
                initialRequest: {
                    ...result.request,
                    job_type: job.jobType,
                    registry_id: job.registryId,
                    target_repository: job.targetRepository,
                    provider_id: job.providerId,
                    model_id: job.modelId,
                    payload: job.payload
                }
            });
        } catch (error) {
            content.querySelector('[data-errors]').textContent = error.message;
        }
    };
    renderDecks();
}

function dependencyItemMarkup(name, meta, command = null) {
    return `<div class="dependency-item">
        <div class="dependency-item-name">${escapeHtml(name)}</div>
        <div class="dependency-item-meta">${escapeHtml(meta)}</div>
        ${command ? `<code class="dependency-command">${escapeHtml(command)}</code>` : ''}
    </div>`;
}

async function renderDependencyModal() {
    if (!activeDependencyTarget || !curriculumIndex) return;
    const { deckId, chapterId } = activeDependencyTarget;
    const plan = dependencyPlan(curriculumIndex, deckId, chapterId);
    const installed = installedCurriculumIds(await getAllDecks());
    const targetChapter = chapterId
        ? curriculumMaps(curriculumIndex).chapters.get(`${deckId}#${chapterId}`)
        : null;
    const title = document.getElementById('dependency-title');
    const path = document.getElementById('dependency-path');
    const body = document.getElementById('dependency-body');
    const add = document.getElementById('dependency-add-path');
    const copy = document.getElementById('dependency-copy-command');
    const request = document.getElementById('dependency-request-generation');
    const generate = document.getElementById('dependency-generate-deck');
    if (!title || !path || !body || !add || !copy || !request || !generate || !plan.target) return;

    title.textContent = targetChapter?.title || plan.target.deck;
    path.textContent = `~ / curriculum / ${deckId}${targetChapter ? ` / ${targetChapter.id}` : ''}`;
    const exact = plan.exactChapters.map(chapter => dependencyItemMarkup(
        `${chapter.deckId} / ${chapter.id}`,
        `${installed.has(chapter.deckId) ? '✓ in collection' : 'required provider chapter'} · ${chapter.card_count ?? '?'} cards`
    )).join('');
    const whole = plan.wholeDecks.map(deck => dependencyItemMarkup(
        deck.id,
        installed.has(deck.id) ? 'in collection' : 'not in collection',
        !deck.repository?.configured ? deck.generation_command : null
    )).join('');
    const recommended = plan.recommendedDecks.map(deck => dependencyItemMarkup(
        deck.id,
        `${installed.has(deck.id) ? 'in collection' : 'not in collection'} · optional preparation`
    )).join('');
    const generationScope = targetChapter
        ? chapterContentGenerationScope(plan.target, targetChapter)
        : null;
    const generationNote = targetChapter
        ? generationScope === 'pilot'
            ? 'This first chapter is the novice-first pilot. Generate and review it before authoring any later chapter.'
            : generationScope === 'chapter'
                ? 'The pilot is approved. This job will author only the selected chapter from its resolved prerequisite closure.'
                : Number(targetChapter.card_count || 0) > 0
                    ? 'This chapter already has generated content.'
                    : ['pilot-built', 'needs-review'].includes(String(plan.target.status || '').toLowerCase())
                        ? 'The pilot is awaiting explicit approval before another chapter can be generated.'
                        : 'This chapter is not currently eligible for content generation.'
        : plan.target.chapters?.length
            ? 'Open a chapter to generate its content as a separate agent job.'
            : 'Create the deck chapter curriculum before generating chapter content.';

    body.innerHTML = `
        <section class="dependency-section">
            <h4>Required path</h4>
            <div class="dependency-chain">${exact || whole
                ? `${exact}${whole}`
                : '<div class="dependency-item dependency-empty">No declared prerequisite.</div>'}</div>
        </section>
        ${recommended ? `<section class="dependency-section"><h4>Recommended preparation</h4><div class="dependency-chain">${recommended}</div></section>` : ''}
        <section class="dependency-section">
            <h4>Deck generation</h4>
            <p class="dependency-generation-note">${escapeHtml(generationNote)}</p>
        </section>
    `;
    const availablePrerequisites = plan.requiredDecks.filter(deck =>
        deck.repository?.configured && !installed.has(deck.id)
    );
    add.disabled = availablePrerequisites.length === 0;
    add.textContent = availablePrerequisites.length
        ? 'Add available prerequisites'
        : plan.requiredDecks.length
            ? 'Prerequisites installed'
            : 'No prerequisites';
    copy.classList.toggle('hidden', plan.missingDecks.length === 0);
    request.classList.toggle('hidden', plan.missingDecks.length === 0 || !githubAuth.isAuthenticated());
    generate.classList.toggle('hidden', !targetChapter || !generationScope);
    const targetRegistry = curriculumRegistryForView(curriculumIndex, {
        subjectId: plan.target.subject,
        deckId: plan.target.id
    });
    const generationAvailability = await configureWebsiteGenerationButton(generate, {
        registry: targetRegistry
    });
    request.disabled = !generationAvailability.enabled;
    request.title = generationAvailability.reason;
    generate.textContent = 'Generate chapter content';
}

async function openDependencyModal(deckId, chapterId = null) {
    activeDependencyTarget = { deckId, chapterId };
    await renderDependencyModal();
    document.getElementById('dependency-modal')?.classList.remove('hidden');
    document.getElementById('dependency-close')?.focus();
}

function closeDependencyModal() {
    document.getElementById('dependency-modal')?.classList.add('hidden');
    activeDependencyTarget = null;
}

async function copyMissingGenerationCommands() {
    if (!activeDependencyTarget || !curriculumIndex) return;
    const plan = dependencyPlan(
        curriculumIndex,
        activeDependencyTarget.deckId,
        activeDependencyTarget.chapterId
    );
    const commands = plan.missingDecks.map(deck => deck.generation_command).join('\n');
    if (!commands) return;
    await navigator.clipboard.writeText(commands);
    const button = document.getElementById('dependency-copy-command');
    if (button) {
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy generation command'; }, 1200);
    }
}

async function requestMissingGeneration() {
    if (!activeDependencyTarget || !curriculumIndex || !githubAuth.isAuthenticated()) return;
    const plan = dependencyPlan(
        curriculumIndex,
        activeDependencyTarget.deckId,
        activeDependencyTarget.chapterId
    );
    const button = document.getElementById('dependency-request-generation');
    if (button) {
        button.disabled = true;
        button.textContent = 'Requesting...';
    }
    try {
        const preferences = await connectedWebsiteGenerationPreferences();
        for (const deck of plan.missingDecks) {
            const registry = curriculumRegistryForView(curriculumIndex, {
                subjectId: deck.subject,
                deckId: deck.id
            });
            const job = deckNeedsChapterCurriculum(deck)
                ? generationJobForChapterCurriculum(deck, preferences, deckJobProvenance(registry))
                : generationJobForDeck(deck, preferences);
            await githubAuth.apiRequest('/api/generation-requests', {
                method: 'POST',
                body: JSON.stringify(job)
            });
        }
        if (button) button.textContent = 'Requested';
    } catch (error) {
        console.error('[Curriculum] Generation request failed:', error);
        alert(`Could not queue generation: ${error.message}`);
        if (button) button.textContent = 'Request generation';
    } finally {
        if (button) button.disabled = false;
    }
}

async function requestTargetChapterGeneration() {
    if (!activeDependencyTarget || !curriculumIndex || !githubAuth.isAuthenticated()) return;
    const maps = curriculumMaps(curriculumIndex);
    const deck = maps.decks.get(activeDependencyTarget.deckId);
    const chapter = activeDependencyTarget.chapterId
        ? maps.chapters.get(`${activeDependencyTarget.deckId}#${activeDependencyTarget.chapterId}`)
        : null;
    const button = document.getElementById('dependency-generate-deck');
    if (!deck || !chapter || !button) return;
    try {
        const registry = curriculumRegistryForView(curriculumIndex, {
            subjectId: deck.subject,
            deckId: deck.id
        });
        const job = generationJobForChapterContent(
            deck,
            chapter,
            await connectedWebsiteGenerationPreferences(),
            deckJobProvenance(registry)
        );
        closeDependencyModal();
        await queueCurriculumAgentJob(job, button);
    } catch (error) {
        console.error('[Curriculum] Chapter content request failed:', error);
        alert(`Could not queue chapter content: ${error.message}`);
        if (button.isConnected) {
            button.disabled = false;
            button.textContent = 'Generate chapter content';
        }
    }
}

async function addActiveDependencyPath() {
    if (!activeDependencyTarget || !curriculumIndex) return;
    const plan = dependencyPlan(
        curriculumIndex,
        activeDependencyTarget.deckId,
        activeDependencyTarget.chapterId
    );
    const installed = installedCurriculumIds(await getAllDecks());
    const installPlan = {
        ...plan,
        requiredDecks: plan.requiredDecks.filter(deck => !installed.has(deck.id))
    };
    const failures = await installAvailableDependencyDecks(
        installPlan,
        repo => loadRepositoryMetadata(repo, { sync: true })
    );
    // Installing prerequisite repositories must not star them. Refresh the
    // collection explicitly; the learner can choose a study scope afterward.
    await loadRepositories();
    await renderDependencyModal();
    if (failures.length) alert(`Some prerequisite decks could not be added:\n${failures.join('\n')}`);
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
        const installedBefore = new Set((await getAllRepos()).map(repo => repo.id.toLowerCase()));
        // Adding a deck reads only repository metadata and the flashcards tree.
        // Card bodies remain lazy until the first review.
        const { deck: addedDeck } = await loadRepositoryMetadata(repoString, { sync: true });
        console.log(`[Main] Added metadata-only deck ${repoString}`);

        if (!installedBefore.has(addedDeck.id.toLowerCase())) {
            await clearRepositoryScopes([addedDeck.id]);
        }

        const superseded = await getSupersededRepos();
        if (superseded.length > 0) {
            const { removeRepo } = await import('./storage.js');
            const retiredRepoIds = [];
            for (const repo of superseded) {
                await removeRepo(repo.id, { preserveReviews: true });
                retiredRepoIds.push(repo.id);
            }
            const activeDecks = scopesWithoutRepositories(
                habitSettings?.activeDecks || [],
                retiredRepoIds
            );
            if (activeDecks.length !== (habitSettings?.activeDecks || []).length) {
                habitSettings = await saveSettings({ activeDecks });
            }
            if (pausedPrimaryStudySession
                && !studySessionMatchesActiveScope(pausedPrimaryStudySession, activeDecks)) {
                pausedPrimaryStudySession = null;
                await clearStudySession();
            }
        }

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
let aiProviderConnections = [];
let aiProviderModelCatalogs = new Map();
let pendingAIProviderId = null;
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

    const curriculumState = state?.curriculum || curriculumStateFromUrl();
    if (state?.mainView === 'curriculum' || curriculumState) {
        const restored = restoreCurriculumNavigationHistory(state, curriculumState);
        if (curriculumState) Object.assign(curriculumViewState, restored || curriculumState, { query: '' });
        await showMainView('curriculum');
        return;
    }
    if (state?.mainView === 'progress') {
        await showMainView('progress');
        return;
    }
    if (state?.mainView === 'decks') {
        await showMainView('decks');
        return;
    }
    if (!state && currentMainView !== 'decks') {
        await showMainView('decks');
        return;
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
    closeAIProviderConnectPanel();
}

function activateStudySettingsTab(name, { focus = false } = {}) {
    const tabs = [...document.querySelectorAll('[data-settings-tab]')];
    const panes = [...document.querySelectorAll('[data-settings-pane]')];
    const active = tabs.find(tab => tab.dataset.settingsTab === name) || tabs[0];
    if (!active) return;
    for (const tab of tabs) {
        const selected = tab === active;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    }
    for (const pane of panes) pane.hidden = pane.dataset.settingsPane !== active.dataset.settingsTab;
    const panel = document.getElementById('study-settings-panel');
    if (panel) panel.dataset.activeSettingsTab = active.dataset.settingsTab;
    if (active.dataset.settingsTab === 'agents') renderGenerationActivitySettings();
    if (focus) active.focus();
}

function generationApiRequest(endpoint, options) {
    return githubAuth.apiRequest(endpoint, options);
}

async function connectedWebsiteGenerationPreferences() {
    const preferences = getGenerationPreferences();
    const definition = providerDefinition(preferences.providerId);
    if (!definition) {
        throw new Error('Connect an AI provider in Settings, then choose its model before requesting generation.');
    }
    const providers = await listAIProviders(generationApiRequest);
    const connection = providers.find(provider => provider.id === preferences.providerId);
    if (!connection?.connected) {
        throw new Error(`Connect ${definition.name} in Settings before requesting generation.`);
    }
    if (!preferences.modelId) {
        throw new Error(`Choose a ${definition.name} model in Settings before requesting generation.`);
    }
    return preferences;
}

async function websiteGenerationAvailability() {
    if (!githubAuth.isAuthenticated()) {
        return {
            enabled: false,
            reason: 'Sign in with GitHub, then connect an API provider and choose a model in Settings.'
        };
    }
    try {
        const preferences = await connectedWebsiteGenerationPreferences();
        return { enabled: true, preferences, reason: '' };
    } catch (error) {
        return { enabled: false, reason: error.message };
    }
}

async function configureWebsiteGenerationButton(button, { registry = null } = {}) {
    const availability = await websiteGenerationAvailability();
    if (availability.enabled && registry
        && (!registry.resolved_commit || !registry.catalog_hash)) {
        availability.enabled = false;
        availability.reason = 'Refresh the curriculum registry to pin its Git commit and catalog SHA-256 before generating.';
    }
    if (!button.isConnected) return availability;
    button.disabled = !availability.enabled;
    button.title = availability.reason;
    return availability;
}

function providerDefinition(providerId) {
    return AI_PROVIDER_DEFINITIONS.find(provider => provider.id === providerId) || null;
}

function showGenerationModelError(error) {
    const status = document.getElementById('generation-model-status');
    if (status) status.textContent = error?.message || 'Could not load provider models.';
}

function renderAIProviderConnections() {
    const container = document.getElementById('ai-provider-list');
    if (!container) return;
    container.replaceChildren();
    if (!githubAuth.isAuthenticated()) {
        const help = document.createElement('p');
        help.className = 'study-settings-help';
        help.textContent = 'Sign in with GitHub to connect AI providers across your devices.';
        container.append(help);
        return;
    }
    for (const provider of aiProviderConnections) {
        const row = document.createElement('div');
        row.className = 'ai-provider-row';
        const name = document.createElement('span');
        name.textContent = provider.name;
        const state = document.createElement('span');
        state.className = `ai-provider-state${provider.connected ? ' connected' : ''}`;
        state.textContent = provider.connected
            ? `Connected ${provider.keyHint || ''}`.trim()
            : 'Not connected';
        const actions = document.createElement('span');
        actions.className = 'ai-provider-actions';
        const connect = document.createElement('button');
        connect.type = 'button';
        connect.textContent = provider.connected ? 'Replace' : 'Connect';
        connect.onclick = () => openAIProviderConnectPanel(provider.id);
        actions.append(connect);
        if (provider.connected) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.onclick = () => removeAIProviderConnection(provider.id);
            actions.append(remove);
        }
        row.append(name, state, actions);
        container.append(row);
    }
}

function rebuildGenerationProviderOptions(preferredProvider) {
    const select = document.getElementById('generation-provider');
    if (!select) return;
    select.replaceChildren();
    const connectedProviders = aiProviderConnections.filter(item => item.connected);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = connectedProviders.length
        ? 'Choose a connected provider'
        : 'Connect a provider above';
    select.append(placeholder);
    for (const provider of connectedProviders) {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        select.append(option);
    }
    select.disabled = connectedProviders.length === 0;
    select.value = [...select.options].some(option => option.value === preferredProvider)
        ? preferredProvider
        : '';
}

function disableGenerationReasoningChoices(reasoning) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a model first';
    reasoning.replaceChildren(placeholder);
    reasoning.disabled = true;
}

function syncGenerationReasoningChoices(preferredEffort = null) {
    const provider = document.getElementById('generation-provider');
    const modelSelect = document.getElementById('generation-model');
    const reasoning = document.getElementById('generation-reasoning');
    if (!provider || !modelSelect || !reasoning) return;
    if (!providerDefinition(provider.value) || !modelSelect.value) {
        disableGenerationReasoningChoices(reasoning);
        return;
    }
    reasoning.disabled = false;
    const catalog = aiProviderModelCatalogs.get(provider.value) || [];
    const model = catalog.find(item => item.id === modelSelect.value) || null;
    const choices = reasoningEffortsForProvider(provider.value, model);
    const previous = preferredEffort || reasoning.value;
    reasoning.replaceChildren(...choices.map(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === 'xhigh'
            ? 'Extra high'
            : `${value[0].toUpperCase()}${value.slice(1)}`;
        return option;
    }));
    reasoning.value = choices.includes(previous) ? previous : choices.includes('high') ? 'high' : choices[0];
}

async function updateGenerationModelChoices() {
    const provider = document.getElementById('generation-provider');
    const modelSelect = document.getElementById('generation-model');
    const status = document.getElementById('generation-model-status');
    if (!provider || !modelSelect || !status) return;
    const preferredModel = modelSelect.value;
    modelSelect.replaceChildren();
    const reasoning = document.getElementById('generation-reasoning');
    const preferredReasoning = reasoning?.value || getGenerationPreferences().reasoningEffort || null;
    if (reasoning) disableGenerationReasoningChoices(reasoning);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    modelSelect.append(placeholder);
    if (!providerDefinition(provider.value)) {
        placeholder.textContent = 'Connect a provider above';
        modelSelect.disabled = true;
        const reasoning = document.getElementById('generation-reasoning');
        if (reasoning) reasoning.disabled = true;
        status.textContent = 'Connect an AI provider above, then choose its provider, model, and reasoning level.';
        return;
    }
    const connection = aiProviderConnections.find(item => item.id === provider.value);
    if (!connection?.connected) {
        placeholder.textContent = 'Connect this provider first';
        modelSelect.disabled = true;
        const reasoning = document.getElementById('generation-reasoning');
        if (reasoning) reasoning.disabled = true;
        status.textContent = 'Connect this provider before selecting a model.';
        return;
    }
    placeholder.textContent = 'Loading available models…';
    modelSelect.disabled = true;
    status.textContent = `Loading models available to your ${connection.name} API key…`;
    let models = aiProviderModelCatalogs.get(provider.value);
    if (!models) {
        models = await loadAIProviderModels(generationApiRequest, provider.value);
        aiProviderModelCatalogs.set(provider.value, models);
    }
    placeholder.textContent = models.length ? 'Choose an available model' : 'No eligible models returned';
    for (const model of models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.append(option);
    }
    modelSelect.value = models.some(model => model.id === preferredModel) ? preferredModel : '';
    modelSelect.disabled = models.length === 0;
    status.textContent = models.length
        ? `${models.length} generation-capable model${models.length === 1 ? '' : 's'} available. Choose the exact model ID for reproducibility.`
        : 'The provider returned no models eligible for the flashcard-generation pipeline.';
    syncGenerationReasoningChoices(preferredReasoning);
}

async function loadAIProviderConnections(preferredProvider) {
    if (!githubAuth.isAuthenticated()) {
        aiProviderConnections = AI_PROVIDER_DEFINITIONS.map(provider => ({ ...provider, connected: false }));
        rebuildGenerationProviderOptions(preferredProvider);
        renderAIProviderConnections();
        await updateGenerationModelChoices();
        return;
    }
    const container = document.getElementById('ai-provider-list');
    if (container) container.innerHTML = '<p class="study-settings-help">Loading provider connections…</p>';
    aiProviderConnections = await listAIProviders(generationApiRequest);
    rebuildGenerationProviderOptions(preferredProvider);
    renderAIProviderConnections();
    await updateGenerationModelChoices();
}

function openAIProviderConnectPanel(providerId) {
    const definition = providerDefinition(providerId);
    const panel = document.getElementById('ai-provider-connect-panel');
    const label = document.getElementById('ai-provider-key-label');
    const key = document.getElementById('ai-provider-key');
    const status = document.getElementById('ai-provider-connect-status');
    if (!definition || !panel || !label || !key || !status) return;
    pendingAIProviderId = providerId;
    label.textContent = `${definition.name} API key`;
    key.placeholder = definition.keyPlaceholder;
    key.value = '';
    status.textContent = 'The key will be validated before it is encrypted and stored.';
    panel.classList.remove('hidden');
    key.focus();
}

function closeAIProviderConnectPanel() {
    pendingAIProviderId = null;
    document.getElementById('ai-provider-connect-panel')?.classList.add('hidden');
    const key = document.getElementById('ai-provider-key');
    const status = document.getElementById('ai-provider-connect-status');
    if (key) key.value = '';
    if (status) status.textContent = '';
}

async function saveAIProviderConnection() {
    const providerId = pendingAIProviderId;
    const keyInput = document.getElementById('ai-provider-key');
    const status = document.getElementById('ai-provider-connect-status');
    const button = document.getElementById('ai-provider-connect-save');
    if (!providerId || !keyInput || !status || !button) return;
    if (!keyInput.value.trim()) {
        status.textContent = 'Enter an API key.';
        return;
    }
    button.disabled = true;
    status.textContent = 'Validating the key and loading models…';
    try {
        const result = await connectAIProvider(generationApiRequest, providerId, keyInput.value);
        aiProviderModelCatalogs.set(providerId, generationEligibleModels(result.models));
        aiProviderConnections = aiProviderConnections.map(provider => (
            provider.id === providerId ? { ...provider, ...result.provider } : provider
        ));
        closeAIProviderConnectPanel();
        renderAIProviderConnections();
        rebuildGenerationProviderOptions(providerId);
        const modelSelect = document.getElementById('generation-model');
        if (modelSelect) modelSelect.value = '';
        await updateGenerationModelChoices();
    } catch (error) {
        status.textContent = error.message;
    } finally {
        button.disabled = false;
        keyInput.value = '';
    }
}

async function removeAIProviderConnection(providerId) {
    const definition = providerDefinition(providerId);
    if (!definition) return;
    const approved = await confirmDialog({
        title: `Remove ${definition.name}`,
        message: `Delete the encrypted ${definition.name} API key from your flashcards account? Queued jobs using it will not run until another key is connected.`,
        confirmText: 'Remove key',
        danger: true
    });
    if (!approved) return;
    await disconnectAIProvider(generationApiRequest, providerId);
    aiProviderModelCatalogs.delete(providerId);
    const preferences = getGenerationPreferences();
    if (preferences.providerId === providerId) {
        saveGenerationPreferences({ providerId: 'none', modelId: '', reasoningEffort: preferences.reasoningEffort });
    }
    await loadAIProviderConnections(preferences.providerId === providerId ? '' : preferences.providerId);
}

function reflectCustomTargetField() {
    const select = document.getElementById('daily-new-target');
    const custom = document.getElementById('daily-new-custom');
    if (!select || !custom) return;
    custom.classList.toggle('hidden', select.value !== 'custom');
    custom.required = select.value === 'custom';
}

async function openStudySettings({ tab = 'study', focusRequestId = null } = {}) {
    const modal = document.getElementById('study-settings-modal');
    const button = document.getElementById('study-settings-btn');
    const target = document.getElementById('daily-new-target');
    const custom = document.getElementById('daily-new-custom');
    const batch = document.getElementById('new-session-size');
    const reminderEnabled = document.getElementById('daily-reminder-enabled');
    const reminderTime = document.getElementById('daily-reminder-time');
    const reminderHelp = document.getElementById('reminder-settings-help');
    const generationProvider = document.getElementById('generation-provider');
    const generationModel = document.getElementById('generation-model');
    const generationReasoning = document.getElementById('generation-reasoning');
    if (!modal || !button || !target || !custom || !batch || !reminderEnabled || !reminderTime
        || !generationProvider || !generationModel || !generationReasoning) return;

    if (!modal.classList.contains('hidden')) {
        if (tab === 'study') closeStudySettings();
        else {
            activateStudySettingsTab(tab);
            renderGenerationActivitySettings({ focusRequestId });
        }
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
    const generation = getGenerationPreferences();
    generationModel.value = generation.modelId;
    generationReasoning.value = generation.reasoningEffort;
    pendingCurriculumSources = getCurriculumRegistrySources().map(source => ({ ...source }));
    renderCurriculumSettingsSources();
    modal.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    activateStudySettingsTab(tab);
    if (tab === 'agents') renderGenerationActivitySettings({ focusRequestId });
    else target.focus();

    loadAIProviderConnections(generation.providerId).catch(error => {
        renderAIProviderConnections();
        showGenerationModelError(error);
    });

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
    const generationProvider = document.getElementById('generation-provider');
    const generationModel = document.getElementById('generation-model');
    const generationReasoning = document.getElementById('generation-reasoning');
    if (!targetSelect || !custom || !batchSelect || !reminderEnabled || !reminderTime
        || !generationProvider || !generationModel || !generationReasoning) return;

    let newPerDay;
    if (targetSelect.value === 'unlimited') newPerDay = -1;
    else if (targetSelect.value === 'custom') {
        newPerDay = Math.min(500, Math.max(1, Math.floor(Number(custom.value) || 10)));
    } else newPerDay = Number(targetSelect.value);
    const newBatchSize = Number(batchSelect.value);
    let normalizedCurriculumSources;
    try {
        normalizedCurriculumSources = saveCurriculumRegistrySources(pendingCurriculumSources, null);
    } catch (error) {
        alert(error.message);
        return;
    }
    const curriculumSourcesChanged = JSON.stringify(normalizedCurriculumSources)
        !== JSON.stringify(getCurriculumRegistrySources());
    try {
        const apiProvider = providerDefinition(generationProvider.value);
        const connection = aiProviderConnections.find(item => item.id === generationProvider.value);
        if (apiProvider && !connection?.connected) {
            throw new Error(`Connect ${apiProvider.name} before saving it as the generation provider.`);
        }
        if (apiProvider && !generationModel.value.trim()) {
            throw new Error(`Choose a ${apiProvider.name} model before saving.`);
        }
        const availableModels = aiProviderModelCatalogs.get(generationProvider.value) || [];
        if (apiProvider && !availableModels.some(model => model.id === generationModel.value.trim())) {
            throw new Error(`Choose a model returned by your ${apiProvider.name} account.`);
        }
        saveGenerationPreferences(apiProvider ? {
            providerId: generationProvider.value,
            modelId: generationModel.value,
            reasoningEffort: generationReasoning.value
        } : {
            providerId: 'none',
            modelId: '',
            reasoningEffort: generationReasoning.value || 'high'
        });
        if (curriculumSourcesChanged) saveCurriculumRegistrySources(normalizedCurriculumSources);
    } catch (error) {
        alert(error.message);
        return;
    }

    const wantsReminder = reminderEnabled.value === 'true';
    // Keep settings responsive even when the service-worker readiness promise
    // takes time (notably in a fresh browser or an iOS standalone launch).
    closeStudySettings();
    if (curriculumSourcesChanged) {
        curriculumIndex = await reloadCurriculumIndex().catch(error => {
            console.warn('[Curriculum] Updated sources could not be loaded:', error);
            return curriculumIndex;
        });
        if (!document.getElementById('curriculum-view')?.classList.contains('hidden')) {
            await renderCurriculumView();
        }
    }
    if (wantsReminder && !isStandalone()) {
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

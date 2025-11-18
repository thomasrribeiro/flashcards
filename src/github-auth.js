/**
 * GitHub OAuth authentication
 * Auth state persisted in localStorage
 */

import { clearLocalStorage, setCurrentUser, initDB } from './storage.js';

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const WORKER_URL = import.meta.env.VITE_WORKER_URL;

class GitHubAuth {
    constructor() {
        this.user = null;
        this.token = null;
        this.init();
    }

    async init() {
        // Check if we're returning from OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('github_token')) {
            await this.handleCallback(urlParams);
            return;
        }

        // Restore auth from localStorage
        const storedUser = localStorage.getItem('github_user');
        const storedToken = localStorage.getItem('github_token');
        if (storedUser && storedToken) {
            this.user = JSON.parse(storedUser);
            this.token = storedToken;

            // Set user in storage and initialize D1
            setCurrentUser(this.user);
            await initDB();
        }

        // Set up event listeners
        this.attachListeners();

        // Update UI if already authenticated
        this.updateUI(this.isAuthenticated());
    }

    async handleCallback(urlParams) {
        const githubToken = urlParams.get('github_token'); // GitHub access token
        const username = urlParams.get('user');
        const name = urlParams.get('name');
        const avatar = urlParams.get('avatar');

        if (githubToken && username) {
            const user = {
                username,
                name: name || username,
                avatar,
                id: username // Use username as ID for D1
            };

            this.user = user;
            this.token = githubToken;

            // Store in localStorage (persists across sessions)
            localStorage.setItem('github_user', JSON.stringify(user));
            localStorage.setItem('github_token', githubToken);

            console.log('[GitHub Auth] Authenticated with GitHub token');

            // Set user in storage and initialize D1
            // localStorage reviews will be preserved and synced when cards are loaded
            setCurrentUser(user);
            await initDB();

            // Reload page to refresh UI and content
            // Clean URL by redirecting to root
            window.location.href = window.location.pathname;
        }
    }

    attachListeners() {
        const loginBtn = document.getElementById('btn-github-login');
        const logoutBtn = document.getElementById('btn-logout');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.login());
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    login() {
        if (!GITHUB_CLIENT_ID) {
            console.error('VITE_GITHUB_CLIENT_ID not configured');
            alert('GitHub OAuth not configured. Please set VITE_GITHUB_CLIENT_ID in .env');
            return;
        }

        // Redirect to GitHub OAuth
        const redirectUri = `${WORKER_URL}/auth/github/callback`;
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }

    logout() {
        this.user = null;
        this.token = null;

        // Clear localStorage
        localStorage.removeItem('github_user');
        localStorage.removeItem('github_token');

        // Reload page to reset UI state
        window.location.reload();
    }

    updateUI(isLoggedIn) {
        const loginBtn = document.getElementById('btn-github-login');
        const userInfo = document.getElementById('user-info');
        const userName = document.getElementById('user-name');

        if (isLoggedIn && this.user) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userInfo) userInfo.classList.remove('hidden');
            if (userName) {
                // Show only first name
                const fullName = this.user.name || this.user.username;
                const firstName = fullName.split(' ')[0];
                userName.textContent = firstName;
            }
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userInfo) userInfo.classList.add('hidden');
        }
    }

    isAuthenticated() {
        return !!(this.user && this.token);
    }

    getUser() {
        return this.user;
    }

    getToken() {
        return this.token;
    }

    /**
     * Make an authenticated request to the worker API
     */
    async apiRequest(endpoint, options = {}) {
        if (!this.token) {
            throw new Error('Not authenticated');
        }

        const url = `${WORKER_URL}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired, log out
                this.logout();
                throw new Error('Session expired. Please log in again.');
            }
            throw new Error(`API request failed: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Sync review data to the worker
     */
    async syncReviews(reviews) {
        if (!this.isAuthenticated()) {
            console.log('Not authenticated, skipping sync');
            return;
        }

        try {
            const result = await this.apiRequest('/sync', {
                method: 'POST',
                body: JSON.stringify({ reviews })
            });
            console.log('Synced reviews:', result);
            return result;
        } catch (error) {
            console.error('Failed to sync reviews:', error);
            throw error;
        }
    }

    /**
     * Get review data from the worker
     */
    async getReviews() {
        if (!this.isAuthenticated()) {
            return { reviews: [] };
        }

        try {
            const result = await this.apiRequest('/data', {
                method: 'GET'
            });
            return result;
        } catch (error) {
            console.error('Failed to get reviews:', error);
            throw error;
        }
    }
}

// Initialize on load
const githubAuth = new GitHubAuth();
export { githubAuth };

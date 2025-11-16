/**
 * GitHub OAuth authentication
 */

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const WORKER_URL = import.meta.env.VITE_WORKER_URL;

class GitHubAuth {
    constructor() {
        this.user = null;
        this.token = null;
        this.init();
    }

    init() {
        // Check if we're returning from OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('token')) {
            this.handleCallback(urlParams);
            return;
        }

        // Check if user is already logged in
        const storedUser = localStorage.getItem('github_user');
        const storedToken = localStorage.getItem('github_token');
        if (storedUser && storedToken) {
            this.user = JSON.parse(storedUser);
            this.token = storedToken;
            this.updateUI(true);
        }

        // Set up event listeners
        this.attachListeners();
    }

    handleCallback(urlParams) {
        const token = urlParams.get('token');
        const username = urlParams.get('user');
        const name = urlParams.get('name');
        const avatar = urlParams.get('avatar');

        if (token && username) {
            const user = {
                username,
                name: name || username,
                avatar
            };

            localStorage.setItem('github_user', JSON.stringify(user));
            localStorage.setItem('github_token', token);

            this.user = user;
            this.token = token;
            this.updateUI(true);

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
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
        localStorage.removeItem('github_user');
        localStorage.removeItem('github_token');
        this.user = null;
        this.token = null;
        this.updateUI(false);
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
/**
 * Simple GitHub authentication
 */

// For now, we'll use localStorage to track login state
// In production, this will redirect to GitHub OAuth

class GitHubAuth {
    constructor() {
        this.user = null;
        this.init();
    }

    init() {
        // Check if user is logged in
        const storedUser = localStorage.getItem('github_user');
        if (storedUser) {
            this.user = JSON.parse(storedUser);
            this.updateUI(true);
        }

        // Set up event listeners
        this.attachListeners();
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
        // For MVP, we'll just store a mock user
        // In production, this will redirect to:
        // https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&scope=repo

        // Mock login for now
        const mockUser = {
            username: 'guest',
            name: 'Guest User',
            avatar: null
        };

        localStorage.setItem('github_user', JSON.stringify(mockUser));
        this.user = mockUser;
        this.updateUI(true);

        // In production:
        // window.location.href = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=repo`;
    }

    logout() {
        localStorage.removeItem('github_user');
        this.user = null;
        this.updateUI(false);
    }

    updateUI(isLoggedIn) {
        const loginBtn = document.getElementById('btn-github-login');
        const userInfo = document.getElementById('user-info');
        const userName = document.getElementById('user-name');

        if (isLoggedIn && this.user) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userInfo) userInfo.classList.remove('hidden');
            if (userName) userName.textContent = this.user.name || this.user.username;
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userInfo) userInfo.classList.add('hidden');
        }
    }

    isAuthenticated() {
        return !!this.user;
    }

    getUser() {
        return this.user;
    }
}

// Initialize on load
const githubAuth = new GitHubAuth();
export { githubAuth };
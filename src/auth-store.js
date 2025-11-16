/**
 * Authentication state management
 */

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

class AuthStore {
    constructor() {
        this.user = null;
        this.isAuthenticated = false;
        this.isLoading = true;
        this.accessToken = null;
        this.refreshToken = null;

        // Token storage keys
        this.ACCESS_TOKEN_KEY = 'flashcards_access_token';
        this.REFRESH_TOKEN_KEY = 'flashcards_refresh_token';
        this.USER_KEY = 'flashcards_user';
    }

    async init() {
        // Load stored tokens
        this.accessToken = localStorage.getItem(this.ACCESS_TOKEN_KEY);
        this.refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
        const storedUser = localStorage.getItem(this.USER_KEY);

        if (storedUser) {
            this.user = JSON.parse(storedUser);
        }

        // Validate and refresh if needed
        if (this.refreshToken) {
            try {
                await this.refreshAccessToken();
                this.isAuthenticated = true;
            } catch (error) {
                console.error('Failed to refresh token:', error);
                this.logout();
            }
        }

        this.isLoading = false;
    }

    async signup(email, password) {
        const response = await fetch(`${WORKER_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Signup failed');
        }

        return data;
    }

    async login(email, password) {
        const response = await fetch(`${WORKER_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store tokens and user
        this.setTokens(data.accessToken, data.refreshToken);
        this.setUser(data.user);
        this.isAuthenticated = true;

        return data;
    }

    async logout() {
        // Invalidate refresh token on server
        if (this.refreshToken) {
            try {
                await fetch(`${WORKER_URL}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: this.refreshToken })
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }

        // Clear local state
        this.clearTokens();
        this.user = null;
        this.isAuthenticated = false;
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token');
        }

        const response = await fetch(`${WORKER_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: this.refreshToken })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Token refresh failed');
        }

        this.accessToken = data.accessToken;
        localStorage.setItem(this.ACCESS_TOKEN_KEY, data.accessToken);

        return data.accessToken;
    }

    async forgotPassword(email) {
        const response = await fetch(`${WORKER_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    async resetPassword(token, newPassword) {
        const response = await fetch(`${WORKER_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Reset failed');
        }

        return data;
    }

    async changePassword(currentPassword, newPassword) {
        const response = await fetch(`${WORKER_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Change password failed');
        }

        return data;
    }

    async verifyEmail(token) {
        const response = await fetch(`${WORKER_URL}/auth/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Verification failed');
        }

        // Auto-login after verification
        this.setTokens(data.accessToken, data.refreshToken);
        this.setUser(data.user);
        this.isAuthenticated = true;

        return data;
    }

    async deleteAccount(password) {
        const response = await fetch(`${WORKER_URL}/account/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Delete failed');
        }

        // Clear everything
        this.logout();

        return data;
    }

    async getProfile() {
        const response = await fetch(`${WORKER_URL}/account/profile`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to get profile');
        }

        return data;
    }

    // Helper methods
    setTokens(accessToken, refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    }

    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    }

    setUser(user) {
        this.user = user;
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }

    // API request wrapper with auto-refresh
    async authenticatedFetch(url, options = {}) {
        // Add auth header
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`
        };

        let response = await fetch(url, options);

        // If 401, try refreshing token
        if (response.status === 401 && this.refreshToken) {
            try {
                await this.refreshAccessToken();
                options.headers['Authorization'] = `Bearer ${this.accessToken}`;
                response = await fetch(url, options);
            } catch (error) {
                this.logout();
                throw error;
            }
        }

        return response;
    }

    // Check authentication status
    async checkAuth() {
        // Initialize if not done
        if (this.isLoading) {
            await this.init();
        }
        return this.isAuthenticated;
    }

    // Sync methods for flashcards
    async syncReviews(reviews) {
        const response = await this.authenticatedFetch(`${WORKER_URL}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviews })
        });

        if (!response.ok) {
            throw new Error('Sync failed');
        }

        return await response.json();
    }

    async getReviews() {
        const response = await this.authenticatedFetch(`${WORKER_URL}/data`);

        if (!response.ok) {
            throw new Error('Failed to get reviews');
        }

        return await response.json();
    }
}

// Export singleton instance
export const authStore = new AuthStore();
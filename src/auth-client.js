/**
 * Authentication client for connecting to the worker
 *
 * The worker URL should be configured based on your deployment:
 * - Development: http://localhost:8787
 * - Production: https://flashcards-worker.your-subdomain.workers.dev
 */

// Configure your worker URL here
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

// Token storage
const TOKEN_KEY = 'flashcards_jwt';
const EMAIL_KEY = 'flashcards_email';

/**
 * Request magic link
 */
export async function requestMagicLink(email) {
    const response = await fetch(`${WORKER_URL}/auth/request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send magic link');
    }

    return await response.json();
}

/**
 * Verify magic link token
 */
export async function verifyMagicLink(token) {
    const response = await fetch(`${WORKER_URL}/auth/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Invalid token');
    }

    const data = await response.json();

    // Store token and email
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(EMAIL_KEY, data.email);

    return data;
}

/**
 * Get current authentication status
 */
export function getAuth() {
    const token = localStorage.getItem(TOKEN_KEY);
    const email = localStorage.getItem(EMAIL_KEY);

    if (!token) {
        return null;
    }

    // Check if token is expired (basic check)
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            logout();
            return null;
        }
    } catch (e) {
        logout();
        return null;
    }

    return { token, email };
}

/**
 * Logout
 */
export function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
}

/**
 * Sync reviews with cloud
 */
export async function syncReviews(reviews) {
    const auth = getAuth();
    if (!auth) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`${WORKER_URL}/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({ reviews })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Sync failed');
    }

    return await response.json();
}

/**
 * Get user data from cloud
 */
export async function getUserData() {
    const auth = getAuth();
    if (!auth) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`${WORKER_URL}/data`, {
        headers: {
            'Authorization': `Bearer ${auth.token}`
        }
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get data');
    }

    return await response.json();
}

/**
 * Check if authenticated
 */
export function isAuthenticated() {
    return getAuth() !== null;
}
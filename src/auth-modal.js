/**
 * Authentication modal component
 */

import { authStore } from './auth-store.js';

class AuthModal {
    constructor() {
        this.modal = null;
        this.currentView = 'login';
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        // Use existing modal from HTML or create one
        this.modal = document.getElementById('auth-modal');
        if (!this.modal) {
            this.createModal();
        }
        this.attachEventListeners();
        this.attachButtonListeners();
    }

    createModal() {
        const modalHtml = `
            <div id="auth-modal" class="auth-modal hidden">
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <button class="modal-close">&times;</button>
                    <div class="modal-body" id="modal-body">
                        <!-- Content will be dynamically inserted -->
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = document.getElementById('auth-modal');
    }

    attachEventListeners() {
        // Close modal
        const closeBtn = this.modal.querySelector('.modal-close');
        const overlay = this.modal.querySelector('.modal-overlay');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        if (overlay) {
            overlay.addEventListener('click', () => this.close());
        }

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    attachButtonListeners() {
        // Login button
        const loginBtn = document.getElementById('btn-login');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.open('login'));
        }

        // Signup button
        const signupBtn = document.getElementById('btn-signup');
        if (signupBtn) {
            signupBtn.addEventListener('click', () => this.open('signup'));
        }

        // Logout button
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await authStore.logout();
                window.location.reload();
            });
        }

        // Account settings button
        const accountBtn = document.getElementById('btn-account');
        if (accountBtn) {
            accountBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.open('settings');
            });
        }

        // User menu toggle
        const userMenuBtn = document.getElementById('user-menu-button');
        const userDropdown = document.getElementById('user-menu-dropdown');
        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', () => {
                userDropdown.classList.toggle('hidden');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                    userDropdown.classList.add('hidden');
                }
            });
        }

        // Check auth status and update UI
        this.updateAuthUI();
    }

    async updateAuthUI() {
        const authButtons = document.getElementById('auth-buttons');
        const userMenu = document.getElementById('user-menu');
        const userEmail = document.getElementById('user-email');

        if (await authStore.checkAuth()) {
            // User is logged in
            if (authButtons) authButtons.classList.add('hidden');
            if (userMenu) userMenu.classList.remove('hidden');
            if (userEmail && authStore.user) {
                userEmail.textContent = authStore.user.email;
            }
        } else {
            // User is not logged in
            if (authButtons) authButtons.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
        }
    }

    open(view = 'login') {
        this.currentView = view;
        this.render();
        this.modal.classList.remove('hidden');
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);
    }

    close() {
        this.modal.classList.remove('show');
        setTimeout(() => {
            this.modal.classList.add('hidden');
        }, 300);
    }

    render() {
        const modalBody = this.modal.querySelector('.modal-body');

        switch (this.currentView) {
            case 'login':
                modalBody.innerHTML = this.renderLogin();
                break;
            case 'signup':
                modalBody.innerHTML = this.renderSignup();
                break;
            case 'forgot':
                modalBody.innerHTML = this.renderForgotPassword();
                break;
            case 'reset':
                modalBody.innerHTML = this.renderResetPassword();
                break;
            case 'verify':
                modalBody.innerHTML = this.renderVerifyEmail();
                break;
            case 'settings':
                modalBody.innerHTML = this.renderSettings();
                break;
        }

        this.attachFormListeners();
    }

    renderLogin() {
        return `
            <div class="auth-form">
                <h2>Welcome Back</h2>
                <p class="auth-subtitle">Log in to save your progress</p>

                <form id="login-form">
                    <div class="form-group">
                        <label for="login-email">Email</label>
                        <input
                            type="email"
                            id="login-email"
                            name="email"
                            required
                            autocomplete="email"
                            placeholder="you@example.com"
                        >
                    </div>

                    <div class="form-group">
                        <label for="login-password">Password</label>
                        <input
                            type="password"
                            id="login-password"
                            name="password"
                            required
                            autocomplete="current-password"
                            placeholder="••••••••"
                        >
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Log In</button>
                    </div>

                    <div class="form-links">
                        <a href="#" data-view="forgot">Forgot password?</a>
                        <span class="separator">•</span>
                        <span>Don't have an account?
                            <a href="#" data-view="signup">Sign up</a>
                        </span>
                    </div>
                </form>

                <div id="auth-error" class="auth-error hidden"></div>
            </div>
        `;
    }

    renderSignup() {
        return `
            <div class="auth-form">
                <h2>Create Account</h2>
                <p class="auth-subtitle">Start tracking your learning progress</p>

                <form id="signup-form">
                    <div class="form-group">
                        <label for="signup-email">Email</label>
                        <input
                            type="email"
                            id="signup-email"
                            name="email"
                            required
                            autocomplete="email"
                            placeholder="you@example.com"
                        >
                    </div>

                    <div class="form-group">
                        <label for="signup-password">Password</label>
                        <input
                            type="password"
                            id="signup-password"
                            name="password"
                            required
                            autocomplete="new-password"
                            placeholder="At least 8 characters"
                            minlength="8"
                        >
                        <small class="form-help">Must be at least 8 characters</small>
                    </div>

                    <div class="form-group">
                        <label for="signup-confirm">Confirm Password</label>
                        <input
                            type="password"
                            id="signup-confirm"
                            name="confirmPassword"
                            required
                            autocomplete="new-password"
                            placeholder="••••••••"
                        >
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Sign Up</button>
                    </div>

                    <div class="form-links">
                        <span>Already have an account?
                            <a href="#" data-view="login">Log in</a>
                        </span>
                    </div>
                </form>

                <div id="auth-error" class="auth-error hidden"></div>
                <div id="auth-success" class="auth-success hidden"></div>
            </div>
        `;
    }

    renderForgotPassword() {
        return `
            <div class="auth-form">
                <h2>Reset Password</h2>
                <p class="auth-subtitle">We'll send you a reset link</p>

                <form id="forgot-form">
                    <div class="form-group">
                        <label for="forgot-email">Email</label>
                        <input
                            type="email"
                            id="forgot-email"
                            name="email"
                            required
                            autocomplete="email"
                            placeholder="you@example.com"
                        >
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Send Reset Link</button>
                    </div>

                    <div class="form-links">
                        <a href="#" data-view="login">Back to login</a>
                    </div>
                </form>

                <div id="auth-error" class="auth-error hidden"></div>
                <div id="auth-success" class="auth-success hidden"></div>
            </div>
        `;
    }

    renderResetPassword() {
        return `
            <div class="auth-form">
                <h2>Set New Password</h2>
                <p class="auth-subtitle">Choose a new password for your account</p>

                <form id="reset-form">
                    <div class="form-group">
                        <label for="reset-password">New Password</label>
                        <input
                            type="password"
                            id="reset-password"
                            name="password"
                            required
                            autocomplete="new-password"
                            placeholder="At least 8 characters"
                            minlength="8"
                        >
                    </div>

                    <div class="form-group">
                        <label for="reset-confirm">Confirm Password</label>
                        <input
                            type="password"
                            id="reset-confirm"
                            name="confirmPassword"
                            required
                            autocomplete="new-password"
                            placeholder="••••••••"
                        >
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Reset Password</button>
                    </div>
                </form>

                <div id="auth-error" class="auth-error hidden"></div>
            </div>
        `;
    }

    renderVerifyEmail() {
        return `
            <div class="auth-form">
                <h2>Check Your Email</h2>
                <p class="auth-subtitle">We've sent you a verification link</p>

                <div class="success-message">
                    <svg class="success-icon" viewBox="0 0 24 24" width="48" height="48">
                        <path fill="#4CAF50" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <p>Please check your email and click the verification link to activate your account.</p>
                </div>

                <div class="form-links">
                    <a href="#" data-view="login">Back to login</a>
                </div>
            </div>
        `;
    }

    renderSettings() {
        const user = authStore.user;
        return `
            <div class="auth-form">
                <h2>Account Settings</h2>
                <p class="auth-subtitle">${user?.email}</p>

                <form id="settings-form">
                    <h3>Change Password</h3>

                    <div class="form-group">
                        <label for="current-password">Current Password</label>
                        <input
                            type="password"
                            id="current-password"
                            name="currentPassword"
                            autocomplete="current-password"
                            placeholder="••••••••"
                        >
                    </div>

                    <div class="form-group">
                        <label for="new-password">New Password</label>
                        <input
                            type="password"
                            id="new-password"
                            name="newPassword"
                            autocomplete="new-password"
                            placeholder="At least 8 characters"
                            minlength="8"
                        >
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Update Password</button>
                    </div>
                </form>

                <div class="danger-zone">
                    <h3>Danger Zone</h3>
                    <button id="delete-account-btn" class="btn-danger">Delete Account</button>
                </div>

                <div id="auth-error" class="auth-error hidden"></div>
                <div id="auth-success" class="auth-success hidden"></div>
            </div>
        `;
    }

    attachFormListeners() {
        // View navigation links
        this.modal.querySelectorAll('[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentView = e.target.dataset.view;
                this.render();
            });
        });

        // Form submissions
        const form = this.modal.querySelector('form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSubmit(e.target);
            });
        }

        // Delete account button
        const deleteBtn = this.modal.querySelector('#delete-account-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.handleDeleteAccount());
        }
    }

    async handleSubmit(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        const errorEl = this.modal.querySelector('#auth-error');
        const successEl = this.modal.querySelector('#auth-success');

        // Hide messages
        errorEl?.classList.add('hidden');
        successEl?.classList.add('hidden');

        // Show loading
        const submitBtn = form.querySelector('[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Loading...';
        submitBtn.disabled = true;

        try {
            switch (form.id) {
                case 'login-form':
                    await authStore.login(data.email, data.password);
                    this.close();
                    window.location.reload();
                    break;

                case 'signup-form':
                    if (data.password !== data.confirmPassword) {
                        throw new Error('Passwords do not match');
                    }
                    await authStore.signup(data.email, data.password);
                    this.currentView = 'verify';
                    this.render();
                    break;

                case 'forgot-form':
                    await authStore.forgotPassword(data.email);
                    if (successEl) {
                        successEl.textContent = 'Check your email for a reset link';
                        successEl.classList.remove('hidden');
                    }
                    form.reset();
                    break;

                case 'reset-form':
                    if (data.password !== data.confirmPassword) {
                        throw new Error('Passwords do not match');
                    }
                    const token = new URLSearchParams(window.location.search).get('token');
                    await authStore.resetPassword(token, data.password);
                    this.currentView = 'login';
                    this.render();
                    break;

                case 'settings-form':
                    await authStore.changePassword(data.currentPassword, data.newPassword);
                    if (successEl) {
                        successEl.textContent = 'Password updated successfully';
                        successEl.classList.remove('hidden');
                    }
                    form.reset();
                    break;
            }
        } catch (error) {
            if (errorEl) {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
            }
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    async handleDeleteAccount() {
        if (!confirm('Are you sure? This cannot be undone.')) {
            return;
        }

        const password = prompt('Enter your password to confirm:');
        if (!password) {
            return;
        }

        try {
            await authStore.deleteAccount(password);
            this.close();
            window.location.href = '/';
        } catch (error) {
            alert(error.message);
        }
    }
}

// Export singleton instance
export const authModal = new AuthModal();
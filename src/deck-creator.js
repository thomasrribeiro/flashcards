/**
 * Deck Creator - Modal for creating new flashcard decks (GitHub repositories)
 */

import { createRepository, initializeDeckRepo, slugify, isAuthenticated, deleteRepository } from './github-writer.js';
import { getAuthenticatedUser } from './github-client.js';

let modal = null;
let onDeckCreated = null;
let listenersAttached = false;

/**
 * Initialize the deck creator modal
 * @param {Function} callback - Called when a deck is created successfully
 */
export function initDeckCreator(callback) {
    onDeckCreated = callback;
    createModal();
    setupEventListeners();
}

/**
 * Create the modal DOM structure
 */
function createModal() {
    // Check if modal already exists
    if (document.getElementById('deck-creator-modal')) {
        modal = document.getElementById('deck-creator-modal');
        return;
    }

    modal = document.createElement('div');
    modal.id = 'deck-creator-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content deck-creator-content">
            <div class="modal-header">
                <h3>Create New Deck</h3>
                <button class="modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="deck-name-input">Deck Name</label>
                    <input
                        type="text"
                        id="deck-name-input"
                        class="form-input"
                        placeholder="e.g., Physics 101"
                        autocomplete="off"
                    />
                    <div class="form-hint">
                        Repository name: <span id="deck-slug-preview">-</span>
                    </div>
                </div>
                <div class="form-group">
                    <label for="deck-description-input">Description (optional)</label>
                    <input
                        type="text"
                        id="deck-description-input"
                        class="form-input"
                        placeholder="A flashcard deck for..."
                        autocomplete="off"
                    />
                </div>
                <div class="form-info">
                    <p>This will create a private GitHub repository with the proper flashcard structure.</p>
                </div>
                <div class="form-error hidden" id="deck-creator-error"></div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" id="deck-creator-cancel">Cancel</button>
                <button class="btn-primary" id="deck-creator-submit">Create Deck</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Setup event listeners for the modal
 */
function setupEventListeners() {
    // Close button
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('#deck-creator-cancel').addEventListener('click', closeModal);

    // Overlay click to close
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Name input - update slug preview
    const nameInput = modal.querySelector('#deck-name-input');
    const slugPreview = modal.querySelector('#deck-slug-preview');

    nameInput.addEventListener('input', () => {
        const slug = slugify(nameInput.value);
        slugPreview.textContent = slug || '-';
    });

    // Submit button
    modal.querySelector('#deck-creator-submit').addEventListener('click', handleSubmit);

    // Enter key to submit
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    });

    // Escape key to close — register once only
    if (!listenersAttached) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });
        listenersAttached = true;
    }
}

/**
 * Open the deck creator modal
 */
export function openDeckCreator() {
    if (!isAuthenticated()) {
        alert('Please log in with GitHub to create a deck.');
        return;
    }

    // Reset form
    modal.querySelector('#deck-name-input').value = '';
    modal.querySelector('#deck-description-input').value = '';
    modal.querySelector('#deck-slug-preview').textContent = '-';
    modal.querySelector('#deck-creator-error').classList.add('hidden');
    modal.querySelector('#deck-creator-submit').disabled = false;
    modal.querySelector('#deck-creator-submit').textContent = 'Create Deck';

    // Show modal
    modal.classList.remove('hidden');

    // Focus name input
    setTimeout(() => {
        modal.querySelector('#deck-name-input').focus();
    }, 100);
}

/**
 * Close the deck creator modal
 */
export function closeModal() {
    modal.classList.add('hidden');
}

/**
 * Handle form submission
 */
async function handleSubmit() {
    const nameInput = modal.querySelector('#deck-name-input');
    const descInput = modal.querySelector('#deck-description-input');
    const submitBtn = modal.querySelector('#deck-creator-submit');
    const errorDiv = modal.querySelector('#deck-creator-error');

    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    // Validate
    if (!name) {
        showError('Please enter a deck name');
        nameInput.focus();
        return;
    }

    const slug = slugify(name);
    if (!slug) {
        showError('Deck name must contain at least one letter or number');
        nameInput.focus();
        return;
    }

    // Disable submit and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    errorDiv.classList.add('hidden');

    try {
        // Get current user
        const user = await getAuthenticatedUser();
        const owner = user.login;

        // Create repository
        const repo = await createRepository(name, description);

        // Initialize with flashcard structure; clean up repo on failure
        try {
            await initializeDeckRepo(owner, repo.name);
        } catch (initError) {
            console.error('[Deck Creator] Initialization failed, deleting empty repo:', initError);
            try {
                await deleteRepository(owner, repo.name);
            } catch (deleteError) {
                console.error('[Deck Creator] Cleanup failed:', deleteError);
            }
            throw initError;
        }

        // Close modal
        closeModal();

        // Notify callback
        if (onDeckCreated) {
            onDeckCreated(`${owner}/${repo.name}`);
        }

    } catch (error) {
        console.error('[Deck Creator] Error:', error);
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Deck';
    }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    const errorDiv = modal.querySelector('#deck-creator-error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

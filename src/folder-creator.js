/**
 * Folder Creator - Modal for creating new sub-deck folders
 */

import { createFolder, slugify, isAuthenticated, sanitizePath } from './github-writer.js';

let modal = null;
let currentDeckId = null;
let currentParentPath = null;
let onFolderCreated = null;
let listenersAttached = false;

/**
 * Initialize the folder creator modal
 * @param {Function} callback - Called when a folder is created successfully
 */
export function initFolderCreator(callback) {
    onFolderCreated = callback;
    createModal();
    setupEventListeners();
}

/**
 * Create the modal DOM structure
 */
function createModal() {
    // Check if modal already exists
    if (document.getElementById('folder-creator-modal')) {
        modal = document.getElementById('folder-creator-modal');
        return;
    }

    modal = document.createElement('div');
    modal.id = 'folder-creator-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content folder-creator-content">
            <div class="modal-header">
                <h3>Create Sub-deck</h3>
                <button class="modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="folder-name-input">Folder Name</label>
                    <input
                        type="text"
                        id="folder-name-input"
                        class="form-input"
                        placeholder="e.g., Chapter 1"
                        autocomplete="off"
                    />
                    <div class="form-hint">
                        Path: <span id="folder-path-preview">flashcards/</span>
                    </div>
                </div>
                <div class="form-error hidden" id="folder-creator-error"></div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" id="folder-creator-cancel">Cancel</button>
                <button class="btn-primary" id="folder-creator-submit">Create Folder</button>
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
    modal.querySelector('#folder-creator-cancel').addEventListener('click', closeModal);

    // Overlay click to close
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Name input - update path preview
    const nameInput = modal.querySelector('#folder-name-input');

    nameInput.addEventListener('input', () => {
        updatePathPreview();
    });

    // Submit button
    modal.querySelector('#folder-creator-submit').addEventListener('click', handleSubmit);

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
 * Update the path preview based on current input
 */
function updatePathPreview() {
    const nameInput = modal.querySelector('#folder-name-input');
    const pathPreview = modal.querySelector('#folder-path-preview');

    const folderName = slugify(nameInput.value) || 'folder-name';
    const basePath = currentParentPath || 'flashcards';
    pathPreview.textContent = `${basePath}/${folderName}/`;
}

/**
 * Open the folder creator modal
 * @param {string} deckId - Deck ID (owner/repo)
 * @param {string} parentPath - Parent folder path (e.g., "flashcards" or "flashcards/chapter1")
 */
export function openFolderCreator(deckId, parentPath = 'flashcards') {
    if (!isAuthenticated()) {
        alert('Please log in with GitHub to create a folder.');
        return;
    }

    currentDeckId = deckId;
    currentParentPath = parentPath;

    // Reset form
    modal.querySelector('#folder-name-input').value = '';
    modal.querySelector('#folder-creator-error').classList.add('hidden');
    modal.querySelector('#folder-creator-submit').disabled = false;
    modal.querySelector('#folder-creator-submit').textContent = 'Create Folder';

    updatePathPreview();

    // Show modal
    modal.classList.remove('hidden');

    // Focus name input
    setTimeout(() => {
        modal.querySelector('#folder-name-input').focus();
    }, 100);
}

/**
 * Close the folder creator modal
 */
export function closeModal() {
    modal.classList.add('hidden');
    currentDeckId = null;
    currentParentPath = null;
}

/**
 * Handle form submission
 */
async function handleSubmit() {
    const nameInput = modal.querySelector('#folder-name-input');
    const submitBtn = modal.querySelector('#folder-creator-submit');
    const errorDiv = modal.querySelector('#folder-creator-error');

    const name = nameInput.value.trim();

    // Validate
    if (!name) {
        showError('Please enter a folder name');
        nameInput.focus();
        return;
    }

    const slug = slugify(name);
    if (!slug) {
        showError('Folder name must contain at least one letter or number');
        nameInput.focus();
        return;
    }

    // Disable submit and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    errorDiv.classList.add('hidden');

    try {
        const [owner, repo] = currentDeckId.split('/');
        const basePath = currentParentPath || 'flashcards';
        const folderPath = `${basePath}/${slug}`;

        // Validate path before sending to GitHub
        sanitizePath(folderPath + '/.gitkeep');

        // Create folder
        await createFolder(owner, repo, folderPath);

        // Close modal
        closeModal();

        // Notify callback
        if (onFolderCreated) {
            onFolderCreated(currentDeckId, folderPath);
        }

    } catch (error) {
        console.error('[Folder Creator] Error:', error);
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Folder';
    }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    const errorDiv = modal.querySelector('#folder-creator-error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

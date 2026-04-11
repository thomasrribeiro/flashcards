/**
 * Card Editor - Rich modal for creating and editing flashcards
 * Features: type tabs, form fields, live preview, cloze selection
 */

import { isAuthenticated, getFileInfo, createFile, updateFile, deleteFile, slugify, sanitizePath } from './github-writer.js';
import {
    serializeCard,
    serializeFile,
    parseFileContent,
    createCardFromForm,
    validateCard,
    cardToFormData,
    countClozeDeletions
} from './card-serializer.js';
import { markdownToHtml } from './markdown.js';

let modal = null;
let state = {
    mode: 'create', // 'create' or 'edit'
    cardType: 'basic', // 'basic', 'cloze', 'problem'
    deckId: null,
    filePath: null,
    fileSha: null,
    existingCards: [],
    editingIndex: null,
    onSave: null,
    isDirty: false
};

// Debounce timer for preview
let previewTimer = null;

// Guard against double-registration of document-level listeners
let listenersAttached = false;

/**
 * Initialize the card editor modal
 * @param {Function} onSaveCallback - Called when a card is saved successfully
 */
export function initCardEditor(onSaveCallback) {
    state.onSave = onSaveCallback;
    createModal();
    setupEventListeners();
}

/**
 * Create the modal DOM structure
 */
function createModal() {
    if (document.getElementById('card-editor-modal')) {
        modal = document.getElementById('card-editor-modal');
        return;
    }

    modal = document.createElement('div');
    modal.id = 'card-editor-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content card-editor-content">
            <div class="modal-header">
                <h3 id="card-editor-title">Create Card</h3>
                <button class="modal-close" aria-label="Close">&times;</button>
            </div>

            <div class="card-type-tabs">
                <button class="card-type-tab active" data-type="basic">Q/A</button>
                <button class="card-type-tab" data-type="cloze">Cloze</button>
                <button class="card-type-tab" data-type="problem">P/S</button>
            </div>

            <div class="editor-layout">
                <div class="editor-pane">
                    <!-- Basic Q/A Form -->
                    <div class="card-form" id="form-basic">
                        <div class="form-group">
                            <label for="input-question">Question</label>
                            <textarea
                                id="input-question"
                                class="form-textarea"
                                placeholder="Enter your question here...&#10;&#10;Supports **markdown** and $LaTeX$"
                                rows="4"
                            ></textarea>
                        </div>
                        <div class="form-group">
                            <label for="input-answer">Answer</label>
                            <textarea
                                id="input-answer"
                                class="form-textarea"
                                placeholder="Enter the answer here...&#10;&#10;Supports **markdown** and $LaTeX$"
                                rows="4"
                            ></textarea>
                        </div>
                    </div>

                    <!-- Cloze Form -->
                    <div class="card-form hidden" id="form-cloze">
                        <div class="form-group">
                            <label for="input-cloze">
                                Text with Cloze Deletions
                                <span class="cloze-hint">Select text and click [Make Cloze] or type [brackets]</span>
                            </label>
                            <div class="cloze-toolbar hidden" id="cloze-toolbar">
                                <button type="button" class="cloze-toolbar-btn" id="btn-make-cloze">
                                    [Make Cloze]
                                </button>
                            </div>
                            <textarea
                                id="input-cloze"
                                class="form-textarea"
                                placeholder="Enter text with [cloze deletions] in brackets...&#10;&#10;Example: The speed of light is [$3 \\times 10^8$ m/s].&#10;&#10;Each [bracketed phrase] becomes a separate card."
                                rows="6"
                            ></textarea>
                            <div class="cloze-count" id="cloze-count">0 deletions</div>
                        </div>
                    </div>

                    <!-- Problem/Solution Form -->
                    <div class="card-form hidden" id="form-problem">
                        <div class="form-group">
                            <label for="input-problem">Problem</label>
                            <textarea
                                id="input-problem"
                                class="form-textarea"
                                placeholder="Enter the problem statement...&#10;&#10;Supports **markdown** and $LaTeX$"
                                rows="4"
                            ></textarea>
                        </div>
                        <div class="form-group">
                            <label for="input-solution">Solution</label>
                            <textarea
                                id="input-solution"
                                class="form-textarea"
                                placeholder="Enter the solution...&#10;&#10;Use **IDENTIFY:**, **PLAN:**, **EXECUTE:**, **EVALUATE:** for structured steps"
                                rows="6"
                            ></textarea>
                        </div>
                    </div>
                </div>

                <div class="preview-pane">
                    <div class="preview-header">
                        <span>Preview</span>
                        <button type="button" class="preview-toggle" id="preview-toggle">
                            <span id="preview-toggle-text">Front</span>
                        </button>
                    </div>
                    <div class="preview-content" id="preview-content">
                        <div class="preview-placeholder">Start typing to see preview...</div>
                    </div>
                </div>
            </div>

            <div class="form-group file-path-group">
                <label for="input-filepath">File Path</label>
                <input
                    type="text"
                    id="input-filepath"
                    class="form-input"
                    placeholder="flashcards/my-card.md"
                    autocomplete="off"
                />
            </div>

            <div class="form-error hidden" id="card-editor-error"></div>

            <div class="modal-footer">
                <button class="btn-danger hidden" id="card-editor-delete">Delete</button>
                <div class="footer-spacer"></div>
                <button class="btn-cancel" id="card-editor-cancel">Cancel</button>
                <button class="btn-primary" id="card-editor-submit">Save Card</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Close buttons
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('#card-editor-cancel').addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Type tabs
    modal.querySelectorAll('.card-type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchCardType(tab.dataset.type);
        });
    });

    // Form inputs - trigger preview update and dirty tracking
    const inputs = modal.querySelectorAll('.form-textarea, .form-input');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            state.isDirty = true;
            debouncePreview();
        });
    });

    // Cloze text selection
    const clozeInput = modal.querySelector('#input-cloze');
    clozeInput.addEventListener('mouseup', handleClozeSelection);
    clozeInput.addEventListener('keyup', handleClozeSelection);
    clozeInput.addEventListener('input', updateClozeCount);

    // Make Cloze button
    modal.querySelector('#btn-make-cloze').addEventListener('click', makeCloze);

    // Preview toggle
    modal.querySelector('#preview-toggle').addEventListener('click', togglePreview);

    // Submit
    modal.querySelector('#card-editor-submit').addEventListener('click', handleSubmit);

    // Delete
    modal.querySelector('#card-editor-delete').addEventListener('click', handleDelete);

    // Escape to close — register once only to avoid listener accumulation
    if (!listenersAttached) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });
        listenersAttached = true;
    }

    // Ctrl/Cmd + Enter to save
    modal.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            handleSubmit();
        }
    });
}

/**
 * Switch to a different card type
 * @param {string} type - 'basic', 'cloze', or 'problem'
 */
function switchCardType(type) {
    state.cardType = type;

    // Update tabs
    modal.querySelectorAll('.card-type-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });

    // Show/hide forms
    modal.querySelectorAll('.card-form').forEach(form => {
        form.classList.add('hidden');
    });
    modal.querySelector(`#form-${type}`).classList.remove('hidden');

    // Update preview
    updatePreview();
}

/**
 * Handle text selection in cloze input
 */
function handleClozeSelection() {
    const clozeInput = modal.querySelector('#input-cloze');
    const toolbar = modal.querySelector('#cloze-toolbar');

    const selection = clozeInput.value.substring(
        clozeInput.selectionStart,
        clozeInput.selectionEnd
    );

    if (selection.length > 0 && !selection.includes('[') && !selection.includes(']')) {
        // Show toolbar near cursor
        toolbar.classList.remove('hidden');
    } else {
        toolbar.classList.add('hidden');
    }
}

/**
 * Wrap selected text in cloze brackets
 */
function makeCloze() {
    const clozeInput = modal.querySelector('#input-cloze');
    const start = clozeInput.selectionStart;
    const end = clozeInput.selectionEnd;

    if (start === end) return;

    const text = clozeInput.value;
    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);

    clozeInput.value = before + '[' + selected + ']' + after;

    // Hide toolbar
    modal.querySelector('#cloze-toolbar').classList.add('hidden');

    // Update preview and count
    updateClozeCount();
    updatePreview();

    // Move cursor after the closing bracket
    clozeInput.selectionStart = clozeInput.selectionEnd = end + 2;
    clozeInput.focus();
}

/**
 * Update the cloze deletion count display
 */
function updateClozeCount() {
    const clozeInput = modal.querySelector('#input-cloze');
    const countDiv = modal.querySelector('#cloze-count');
    const count = countClozeDeletions(clozeInput.value);
    countDiv.textContent = `${count} deletion${count !== 1 ? 's' : ''}`;
}

/**
 * Debounced preview update
 */
function debouncePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 300);
}

/**
 * Toggle between front/back preview
 */
let showingBack = false;

function togglePreview() {
    showingBack = !showingBack;
    modal.querySelector('#preview-toggle-text').textContent = showingBack ? 'Back' : 'Front';
    updatePreview();
}

/**
 * Update the preview pane
 */
function updatePreview() {
    const previewContent = modal.querySelector('#preview-content');
    const formData = getFormData();

    // Validate we have content
    if (!hasContent(formData)) {
        previewContent.innerHTML = '<div class="preview-placeholder">Start typing to see preview...</div>';
        return;
    }

    try {
        let html = '';

        switch (state.cardType) {
            case 'basic':
                if (showingBack) {
                    html = `
                        <div class="preview-question">${markdownToHtml(formData.question || '')}</div>
                        <div class="answer-separator">${markdownToHtml(formData.answer || '')}</div>
                    `;
                } else {
                    html = `<div class="preview-question">${markdownToHtml(formData.question || '')}</div>`;
                }
                break;

            case 'cloze': {
                const clozeText = formData.text || '';
                if (showingBack) {
                    // Show with highlighted deletions — escape deletion text before wrapping in HTML
                    const highlighted = clozeText.replace(
                        /\[([^\]]+)\]/g,
                        (_, del) => `<span class="cloze-reveal">${escapeHtml(del)}</span>`
                    );
                    html = markdownToHtml(highlighted);
                } else {
                    // Show with blanks
                    const blanked = clozeText.replace(
                        /\[([^\]]+)\]/g,
                        '<span class="cloze">.............</span>'
                    );
                    html = markdownToHtml(blanked);
                }
                break;
            }

            case 'problem':
                if (showingBack) {
                    html = `
                        <div class="preview-problem">${markdownToHtml(formData.problem || '')}</div>
                        <div class="answer-separator">${markdownToHtml(formData.solution || '')}</div>
                    `;
                } else {
                    html = `<div class="preview-problem">${markdownToHtml(formData.problem || '')}</div>`;
                }
                break;
        }

        previewContent.innerHTML = html;
    } catch (error) {
        previewContent.innerHTML = `<div class="preview-error">Preview error: ${error.message}</div>`;
    }
}

/**
 * Check if form has any content
 */
function hasContent(formData) {
    switch (state.cardType) {
        case 'basic':
            return formData.question?.trim() || formData.answer?.trim();
        case 'cloze':
            return formData.text?.trim();
        case 'problem':
            return formData.problem?.trim() || formData.solution?.trim();
        default:
            return false;
    }
}

/**
 * Get current form data
 */
function getFormData() {
    switch (state.cardType) {
        case 'basic':
            return {
                question: modal.querySelector('#input-question').value,
                answer: modal.querySelector('#input-answer').value
            };
        case 'cloze':
            return {
                text: modal.querySelector('#input-cloze').value
            };
        case 'problem':
            return {
                problem: modal.querySelector('#input-problem').value,
                solution: modal.querySelector('#input-solution').value
            };
        default:
            return {};
    }
}

/**
 * Set form data (for editing)
 */
function setFormData(type, data) {
    switch (type) {
        case 'basic':
            modal.querySelector('#input-question').value = data.question || '';
            modal.querySelector('#input-answer').value = data.answer || '';
            break;
        case 'cloze':
            modal.querySelector('#input-cloze').value = data.text || '';
            updateClozeCount();
            break;
        case 'problem':
            modal.querySelector('#input-problem').value = data.problem || '';
            modal.querySelector('#input-solution').value = data.solution || '';
            break;
    }
}

/**
 * Clear all form fields
 */
function clearForm() {
    modal.querySelector('#input-question').value = '';
    modal.querySelector('#input-answer').value = '';
    modal.querySelector('#input-cloze').value = '';
    modal.querySelector('#input-problem').value = '';
    modal.querySelector('#input-solution').value = '';
    modal.querySelector('#input-filepath').value = '';
    modal.querySelector('#cloze-count').textContent = '0 deletions';
}

/**
 * Open the card editor for creating a new card
 * @param {string} deckId - Deck ID (owner/repo)
 * @param {string} folderPath - Folder to create card in (e.g., "flashcards/chapter1")
 */
export function openCardEditorCreate(deckId, folderPath = 'flashcards') {
    if (!isAuthenticated()) {
        alert('Please log in with GitHub to create cards.');
        return;
    }

    // Reset state
    state.mode = 'create';
    state.cardType = 'basic';
    state.deckId = deckId;
    state.filePath = null;
    state.fileSha = null;
    state.existingCards = [];
    state.editingIndex = null;
    state.isDirty = false;
    showingBack = false;

    // Reset form
    clearForm();
    switchCardType('basic');

    // Set default file path
    const timestamp = Date.now();
    modal.querySelector('#input-filepath').value = `${folderPath}/card-${timestamp}.md`;

    // Update UI
    modal.querySelector('#card-editor-title').textContent = 'Create Card';
    modal.querySelector('#card-editor-delete').classList.add('hidden');
    modal.querySelector('#card-editor-submit').textContent = 'Save Card';
    modal.querySelector('#card-editor-submit').disabled = false;
    modal.querySelector('#card-editor-error').classList.add('hidden');
    modal.querySelector('#preview-toggle-text').textContent = 'Front';

    // Show modal
    modal.classList.remove('hidden');

    // Focus first input
    setTimeout(() => {
        modal.querySelector('#input-question').focus();
    }, 100);
}

/**
 * Open the card editor for editing an existing card
 * @param {string} deckId - Deck ID (owner/repo)
 * @param {string} filePath - Path to the markdown file
 * @param {number} cardIndex - Index of card in the file
 */
export async function openCardEditorEdit(deckId, filePath, cardIndex = 0) {
    if (!isAuthenticated()) {
        alert('Please log in with GitHub to edit cards.');
        return;
    }

    // Show loading state
    modal.classList.remove('hidden');
    modal.querySelector('#card-editor-title').textContent = 'Loading...';
    modal.querySelector('#card-editor-submit').disabled = true;

    try {
        const [owner, repo] = deckId.split('/');

        // Fetch file content
        const fileInfo = await getFileInfo(owner, repo, filePath);
        if (!fileInfo) {
            throw new Error('File not found');
        }

        // Parse cards
        const { cards, metadata } = parseFileContent(fileInfo.content, filePath);

        if (cardIndex >= cards.length) {
            throw new Error('Card not found');
        }

        const card = cards[cardIndex];

        // Set state
        state.mode = 'edit';
        state.cardType = card.type;
        state.deckId = deckId;
        state.filePath = filePath;
        state.fileSha = fileInfo.sha;
        state.existingCards = cards;
        state.editingIndex = cardIndex;
        state.isDirty = false;
        showingBack = false;

        // Clear form and switch to correct type
        clearForm();
        switchCardType(card.type);

        // Fill form with card data
        const formData = cardToFormData(card);
        setFormData(card.type, formData);

        // Set file path
        modal.querySelector('#input-filepath').value = filePath;

        // Update UI
        modal.querySelector('#card-editor-title').textContent = 'Edit Card';
        modal.querySelector('#card-editor-delete').classList.remove('hidden');
        modal.querySelector('#card-editor-submit').textContent = 'Save Changes';
        modal.querySelector('#card-editor-submit').disabled = false;
        modal.querySelector('#card-editor-error').classList.add('hidden');
        modal.querySelector('#preview-toggle-text').textContent = 'Front';

        // Update preview
        updatePreview();

    } catch (error) {
        console.error('[Card Editor] Error loading card:', error);
        showError(error.message);
        modal.querySelector('#card-editor-submit').disabled = true;
    }
}

/**
 * Close the modal
 */
export function closeModal() {
    if (state.isDirty && !confirm('You have unsaved changes. Discard them?')) {
        return;
    }
    modal.classList.add('hidden');
    clearTimeout(previewTimer);
    state.isDirty = false;
}

/**
 * Handle form submission
 */
async function handleSubmit() {
    const submitBtn = modal.querySelector('#card-editor-submit');
    const errorDiv = modal.querySelector('#card-editor-error');

    // Get form data
    const formData = getFormData();
    const filePath = modal.querySelector('#input-filepath').value.trim();

    // Validate
    const validation = validateCard(state.cardType, formData);
    if (!validation.valid) {
        showError(validation.errors.join('. '));
        return;
    }

    if (!filePath) {
        showError('File path is required');
        return;
    }

    // Ensure path is in flashcards folder
    if (!filePath.startsWith('flashcards/')) {
        showError('File must be in the flashcards/ folder');
        return;
    }

    // Ensure .md extension
    const finalPath = filePath.endsWith('.md') ? filePath : filePath + '.md';

    // Validate for path traversal
    try {
        sanitizePath(finalPath);
    } catch (err) {
        showError(err.message);
        return;
    }

    // Disable submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    errorDiv.classList.add('hidden');

    try {
        const [owner, repo] = state.deckId.split('/');

        // Create card object
        const card = createCardFromForm(state.cardType, formData);

        if (state.mode === 'create') {
            // Check if file exists
            const existingFile = await getFileInfo(owner, repo, finalPath);

            if (existingFile) {
                // Add to existing file
                const { cards, metadata } = parseFileContent(existingFile.content, finalPath);
                cards.push(card);
                const newContent = serializeFile(cards, metadata);

                await updateFile(owner, repo, finalPath, newContent, existingFile.sha, 'Add flashcard');
            } else {
                // Create new file
                const content = serializeFile([card]);
                await createFile(owner, repo, finalPath, content, 'Add flashcard');
            }

        } else {
            // Edit mode - update existing card
            state.existingCards[state.editingIndex] = card;
            const newContent = serializeFile(state.existingCards);

            await updateFile(owner, repo, finalPath, newContent, state.fileSha, 'Update flashcard');
        }

        // Close modal
        closeModal();

        // Notify callback
        if (state.onSave) {
            state.onSave(state.deckId, finalPath);
        }

    } catch (error) {
        console.error('[Card Editor] Save error:', error);
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = state.mode === 'create' ? 'Save Card' : 'Save Changes';
    }
}

/**
 * Handle card deletion
 */
async function handleDelete() {
    if (state.mode !== 'edit') return;

    const confirmMsg = state.existingCards.length === 1
        ? 'This is the only card in the file. Delete the entire file?'
        : 'Delete this card?';

    if (!confirm(confirmMsg)) return;

    const submitBtn = modal.querySelector('#card-editor-submit');
    const deleteBtn = modal.querySelector('#card-editor-delete');

    submitBtn.disabled = true;
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';

    try {
        const [owner, repo] = state.deckId.split('/');

        if (state.existingCards.length === 1) {
            // Delete entire file
            await deleteFile(owner, repo, state.filePath, state.fileSha, 'Delete flashcard file');
        } else {
            // Remove card and update file
            state.existingCards.splice(state.editingIndex, 1);
            const newContent = serializeFile(state.existingCards);
            await updateFile(owner, repo, state.filePath, newContent, state.fileSha, 'Remove flashcard');
        }

        // Close modal
        closeModal();

        // Notify callback
        if (state.onSave) {
            state.onSave(state.deckId, state.filePath);
        }

    } catch (error) {
        console.error('[Card Editor] Delete error:', error);
        showError(error.message);
        submitBtn.disabled = false;
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete';
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorDiv = modal.querySelector('#card-editor-error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

/**
 * Escape HTML special characters to prevent XSS when inserting user text
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

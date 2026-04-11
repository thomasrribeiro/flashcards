/**
 * GitHub API write operations for creating/updating flashcard content
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Sanitize and encode a file path for safe use in GitHub API URLs.
 * Rejects traversal segments (.., .) and percent-encodes each segment.
 * @param {string} path - e.g. "flashcards/chapter-1/foo.md"
 * @returns {string} - URL-safe path
 * @throws {Error} if the path contains traversal segments or is otherwise invalid
 */
export function sanitizePath(path) {
    if (typeof path !== 'string' || !path) {
        throw new Error('File path must be a non-empty string');
    }
    const segments = path.split('/');
    for (const seg of segments) {
        if (seg === '..' || seg === '.') {
            throw new Error(`Invalid path: traversal segment "${seg}" is not allowed`);
        }
        if (seg === '') {
            throw new Error('Invalid path: consecutive or leading/trailing slashes are not allowed');
        }
    }
    return segments.map(encodeURIComponent).join('/');
}

/**
 * Encode a UTF-8 string as base64 for GitHub API.
 * Uses TextEncoder, which handles all Unicode correctly.
 */
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

/**
 * Decode a base64 string (with UTF-8 content) from the GitHub API.
 */
function base64ToUtf8(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

/**
 * Get authentication headers for GitHub API
 */
function getAuthHeaders() {
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };

    const token = localStorage.getItem('github_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
    return !!localStorage.getItem('github_token');
}

/**
 * Create a new private repository for a flashcard deck
 * @param {string} name - Repository name (will be slugified)
 * @param {string} description - Optional description
 * @returns {Promise<object>} - Repository data from GitHub
 */
export async function createRepository(name, description = '') {
    if (!isAuthenticated()) {
        throw new Error('Authentication required to create a repository');
    }

    const repoName = slugify(name);

    console.log(`[GitHub Writer] Creating repository: ${repoName}`);

    const response = await fetch(`${GITHUB_API}/user/repos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            name: repoName,
            description: description || `Flashcard deck: ${name}`,
            private: true,
            auto_init: false // We'll initialize it ourselves
        })
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('[GitHub Writer] Create repo error:', error);

        if (response.status === 422 && error.errors?.some(e => e.message?.includes('already exists'))) {
            throw new Error(`Repository "${repoName}" already exists. Please choose a different name.`);
        }
        throw new Error(error.message || 'Failed to create repository');
    }

    const repo = await response.json();
    console.log(`[GitHub Writer] Created repository: ${repo.full_name}`);
    return repo;
}

/**
 * Initialize a new deck repository with proper structure
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<void>}
 */
export async function initializeDeckRepo(owner, repo) {
    console.log(`[GitHub Writer] Initializing deck structure for ${owner}/${repo}`);

    // Create README.md first (this initializes the repo)
    const readmeContent = `# ${repo}

A flashcard deck for spaced repetition learning.

## Structure

- \`flashcards/\` - Contains all flashcard markdown files

## Format

Cards use the [hashcards](https://github.com/kersh1337228/hashcards) format:

\`\`\`markdown
Q: What is the question?
A: This is the answer.

C: Text with [cloze deletion] in brackets.

P: What is the problem?
S: This is the solution.
\`\`\`
`;

    await createFile(owner, repo, 'README.md', readmeContent, 'Initialize deck repository');

    // Create flashcards directory with a starter file
    const starterContent = `Q: Welcome to your new deck!
A: Start adding flashcards using the editor.
`;

    await createFile(owner, repo, 'flashcards/getting-started.md', starterContent, 'Add starter flashcard');

    console.log(`[GitHub Writer] Deck initialized: ${owner}/${repo}`);
}

/**
 * Create a new file in a repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path (e.g., "flashcards/chapter1.md")
 * @param {string} content - File content
 * @param {string} message - Commit message
 * @returns {Promise<object>} - File data from GitHub
 */
export async function createFile(owner, repo, path, content, message = 'Add file') {
    if (!isAuthenticated()) {
        throw new Error('Authentication required');
    }

    const safePath = sanitizePath(path);
    console.log(`[GitHub Writer] Creating file: ${owner}/${repo}/${safePath}`);

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${safePath}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            message,
            content: utf8ToBase64(content)
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[GitHub Writer] Create file error:', error);

        if (response.status === 422 && error.message?.includes('already exists')) {
            throw new Error(`File "${path}" already exists. Use updateFile instead.`);
        }
        throw new Error(error.message || 'Failed to create file');
    }

    const data = await response.json();
    console.log(`[GitHub Writer] Created file: ${path}`);
    return data;
}

/**
 * Update an existing file in a repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path
 * @param {string} content - New file content
 * @param {string} sha - Current file SHA (for conflict detection)
 * @param {string} message - Commit message
 * @returns {Promise<object>} - Updated file data from GitHub
 */
export async function updateFile(owner, repo, path, content, sha, message = 'Update file') {
    if (!isAuthenticated()) {
        throw new Error('Authentication required');
    }

    const safePath = sanitizePath(path);
    console.log(`[GitHub Writer] Updating file: ${owner}/${repo}/${safePath}`);

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${safePath}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            message,
            content: utf8ToBase64(content),
            sha
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[GitHub Writer] Update file error:', error);

        // GitHub Contents API returns 409 or 422 when SHA is stale (conflict)
        if (response.status === 409 || (response.status === 422 && error.message?.includes('does not match'))) {
            throw new Error('File was modified externally. Please reload and try again.');
        }
        throw new Error(error.message || 'Failed to update file');
    }

    const data = await response.json();
    console.log(`[GitHub Writer] Updated file: ${path}`);
    return data;
}

/**
 * Delete a file from a repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path
 * @param {string} sha - Current file SHA
 * @param {string} message - Commit message
 * @returns {Promise<void>}
 */
export async function deleteFile(owner, repo, path, sha, message = 'Delete file') {
    if (!isAuthenticated()) {
        throw new Error('Authentication required');
    }

    const safePath = sanitizePath(path);
    console.log(`[GitHub Writer] Deleting file: ${owner}/${repo}/${safePath}`);

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${safePath}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            message,
            sha
        })
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('[GitHub Writer] Delete file error:', error);
        throw new Error(error.message || 'Failed to delete file');
    }

    console.log(`[GitHub Writer] Deleted file: ${path}`);
}

/**
 * Get file info including SHA
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path
 * @returns {Promise<{content: string, sha: string}>}
 */
export async function getFileInfo(owner, repo, path) {
    const headers = getAuthHeaders();

    const safePath = sanitizePath(path);
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${safePath}`, {
        headers
    });

    if (!response.ok) {
        if (response.status === 404) {
            return null;
        }
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Failed to get file info (${response.status})`);
    }

    const data = await response.json();

    // GitHub returns encoding: "none" for files > 1 MB — content will be empty
    if (data.encoding === 'none') {
        throw new Error(`File "${path}" is too large (>1 MB) to edit in the browser.`);
    }

    // Decode base64 content (normalize line endings from GitHub)
    const raw = data.content.replace(/\n/g, '');
    const content = base64ToUtf8(raw);

    return {
        content,
        sha: data.sha,
        path: data.path
    };
}

/**
 * Create a folder by creating a .gitkeep file in it
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} folderPath - Folder path (e.g., "flashcards/chapter1")
 * @returns {Promise<object>}
 */
export async function createFolder(owner, repo, folderPath) {
    // Ensure path doesn't end with slash
    const cleanPath = folderPath.replace(/\/+$/, '');
    const gitkeepPath = `${cleanPath}/.gitkeep`;

    console.log(`[GitHub Writer] Creating folder: ${owner}/${repo}/${cleanPath}`);

    return await createFile(owner, repo, gitkeepPath, '', `Create folder ${cleanPath}`);
}

/**
 * Slugify a string for use as repository/file name
 * @param {string} text - Text to slugify
 * @returns {string}
 */
export function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove non-word chars
        .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Delete an entire repository
 * WARNING: This is a destructive operation and cannot be undone!
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<void>}
 */
export async function deleteRepository(owner, repo) {
    if (!isAuthenticated()) {
        throw new Error('Authentication required');
    }

    console.log(`[GitHub Writer] Deleting repository: ${owner}/${repo}`);

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[GitHub Writer] Delete repo error:', error);

        if (response.status === 403) {
            throw new Error('You do not have permission to delete this repository.');
        }
        if (response.status === 404) {
            throw new Error('Repository not found.');
        }
        throw new Error(error.message || 'Failed to delete repository');
    }

    console.log(`[GitHub Writer] Deleted repository: ${owner}/${repo}`);
}

/**
 * Generate a filename from card content
 * @param {object} card - Card object
 * @returns {string}
 */
export function generateFilename(card) {
    let text = '';

    if (card.type === 'basic') {
        text = card.content.question;
    } else if (card.type === 'cloze') {
        text = card.content.text;
    } else if (card.type === 'problem') {
        text = card.content.problem;
    }

    // Take first 50 characters, slugify
    const slug = slugify(text.slice(0, 50));
    return `${slug || 'card'}.md`;
}

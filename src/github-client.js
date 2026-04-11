/**
 * GitHub API client for fetching repository content
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Get authentication headers for GitHub API
 */
function getAuthHeaders() {
    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };

    // Try to get token from localStorage
    const token = localStorage.getItem('github_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

/**
 * Fetch repository metadata
 */
export async function getRepository(owner, repo) {
    const url = `${GITHUB_API}/repos/${owner}/${repo}`;
    console.log(`[GitHub Client] Fetching repository: ${url}`);

    const headers = getAuthHeaders();
    const response = await fetch(url, { headers });

    console.log(`[GitHub Client] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
        // Log more details about the error
        let errorMessage = `Failed to fetch repository: ${response.statusText}`;
        try {
            const errorData = await response.json();
            console.error('[GitHub Client] Error details:', errorData);
            errorMessage = errorData.message || errorMessage;
        } catch (e) {
            console.error('[GitHub Client] Could not parse error response');
        }

        const err = (() => {
            if (response.status === 404) return new Error(`Repository ${owner}/${repo} not found`);
            if (response.status === 401) return new Error(`Authentication failed. Please log in with GitHub.`);
            if (response.status === 403) return new Error(`Access denied. Rate limit or permissions issue.`);
            return new Error(errorMessage);
        })();
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    console.log('[GitHub Client] Successfully fetched repository:', data.full_name);
    return data;
}

/**
 * Fetch all markdown files under a path prefix using the Git Trees API.
 * One request replaces the previous N+1 recursive contents/ crawl.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} path - Directory prefix to filter (default: 'flashcards')
 * @param {string|null} treeRef - Branch name or commit SHA; if null, fetched from repo info.
 */
export async function getMarkdownFiles(owner, repo, path = 'flashcards', treeRef = null) {
    // Resolve the tree ref from the default branch if not supplied.
    if (!treeRef) {
        const repoInfo = await getRepository(owner, repo);
        treeRef = repoInfo.default_branch || 'main';
    }

    const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`;
    const response = await fetch(url, { headers: getAuthHeaders() });

    if (!response.ok) {
        if (response.status === 404) return [];
        const err = new Error(`Failed to fetch repository tree: ${response.statusText}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();

    if (data.truncated) {
        console.warn(`[GitHub Client] Tree response truncated for ${owner}/${repo} — very large repo; some files may be missing`);
    }

    // Filter to the requested path prefix (.md files only)
    const prefix = path ? `${path}/` : '';
    return data.tree
        .filter(item => item.type === 'blob' && item.path.startsWith(prefix) && item.path.endsWith('.md'))
        .map(item => ({
            path: item.path,
            sha: item.sha,
            size: item.size,
            name: item.path.split('/').pop()
        }));
}

/**
 * Fetch the content of a file from GitHub.
 * If sha is provided, content is cached in localStorage by SHA (content-addressed —
 * same SHA always means same bytes, so the cache never goes stale).
 */
export async function getFileContent(owner, repo, path, sha = null) {
    if (sha) {
        try {
            const cached = localStorage.getItem(`gh_blob_${sha}`);
            if (cached !== null) return cached;
        } catch (e) { /* localStorage unavailable */ }
    }

    const headers = getAuthHeaders();
    headers['Accept'] = 'application/vnd.github.v3.raw';

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
        headers
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }

    const text = await response.text();

    if (sha) {
        try {
            localStorage.setItem(`gh_blob_${sha}`, text);
        } catch (e) { /* quota exceeded — skip caching */ }
    }

    return text;
}

/**
 * Get the authenticated user's info
 */
export async function getAuthenticatedUser() {
    const url = `${GITHUB_API}/user`;
    console.log('[GitHub Client] Fetching authenticated user');

    const headers = getAuthHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
        console.error(`[GitHub Client] Failed to get user: ${response.status}`);
        throw new Error('Failed to get user info');
    }

    const user = await response.json();
    console.log('[GitHub Client] Authenticated user:', user.login);
    return user;
}

/**
 * Check if a repository contains valid flashcard markdown files.
 * Uses the trees API (one request) then reads only the first .md file to verify format.
 *
 * Throws on access errors (404, 403, 401) so the caller can distinguish
 * "repo not accessible" from "repo accessible but no flashcard content".
 * Returns false only when the repo was reachable but lacked a valid flashcards/ folder.
 */
export async function hasFlashcardContent(owner, repo) {
    // Let access errors propagate — caller needs to tell 404 apart from "no flashcards/ folder"
    const markdownFiles = await getMarkdownFiles(owner, repo, 'flashcards');

    if (markdownFiles.length === 0) {
        console.log(`[GitHub Client] ${owner}/${repo}: No markdown files found in flashcards/ folder`);
        return false;
    }

    console.log(`[GitHub Client] ${owner}/${repo}: Found ${markdownFiles.length} markdown files in flashcards/`);

    // Check only the first file to verify format — avoids burning rate limit on large repos
    const first = markdownFiles[0];
    const content = await getFileContent(owner, repo, first.path);
    const hasFormat = /^[QACP]:\s/m.test(content);
    if (hasFormat) {
        console.log(`[GitHub Client] ${owner}/${repo}: Flashcard format confirmed in ${first.path}`);
        return true;
    }

    console.log(`[GitHub Client] ${owner}/${repo}: No flashcard format found in flashcards/ folder`);
    return false;
}

/**
 * Get all repositories for the authenticated user (walks Link-header pagination).
 */
export async function getUserRepositories() {
    const allRepos = [];
    let url = `${GITHUB_API}/user/repos?sort=pushed&per_page=100&page=1`;

    while (url) {
        console.log(`[GitHub Client] Fetching user repositories: ${url}`);
        const response = await fetch(url, { headers: getAuthHeaders() });

        if (!response.ok) {
            console.error(`[GitHub Client] Failed to get repositories: ${response.status}`);
            throw new Error('Failed to get user repositories');
        }

        const repos = await response.json();
        allRepos.push(...repos);
        console.log(`[GitHub Client] Fetched ${repos.length} repositories (total so far: ${allRepos.length})`);

        // Follow Link: <url>; rel="next" header for subsequent pages
        const link = response.headers.get('Link') || '';
        const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
    }

    return allRepos;
}

/**
 * Parse owner/repo string
 */
export function parseRepoString(repoString) {
    const parts = repoString.trim().split('/');

    if (parts.length !== 2) {
        throw new Error('Invalid repository format. Use: owner/repository');
    }

    const [owner, repo] = parts;

    if (!owner || !repo) {
        throw new Error('Invalid repository format. Use: owner/repository');
    }

    // Basic validation
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
        throw new Error('Invalid repository name');
    }

    return { owner, repo };
}

/**
 * Create a repository card data structure
 */
export function createRepoData(repoInfo, markdownFiles) {
    return {
        id: `${repoInfo.owner.login}/${repoInfo.name}`,
        name: repoInfo.name,
        owner: repoInfo.owner.login,
        description: repoInfo.description || 'No description',
        stars: repoInfo.stargazers_count,
        forks: repoInfo.forks_count,
        updated: repoInfo.updated_at,
        private: repoInfo.private,
        files: markdownFiles.map(f => ({
            path: f.path,
            sha: f.sha,
            size: f.size
        }))
    };
}
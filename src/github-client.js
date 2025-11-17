/**
 * GitHub API client for fetching repository content
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Get authentication headers for GitHub API
 */
function getAuthHeaders() {
    // No persistent token - always use unauthenticated API
    // For public repos, GitHub API allows 60 requests/hour without auth
    return {
        'Accept': 'application/vnd.github.v3+json'
    };
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

        if (response.status === 404) {
            throw new Error(`Repository ${owner}/${repo} not found`);
        } else if (response.status === 401) {
            throw new Error(`Authentication failed. Please log in with GitHub.`);
        } else if (response.status === 403) {
            throw new Error(`Access denied. Rate limit or permissions issue.`);
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[GitHub Client] Successfully fetched repository:', data.full_name);
    return data;
}

/**
 * Recursively fetch all markdown files from a repository
 */
export async function getMarkdownFiles(owner, repo, path = '') {
    const url = path
        ? `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`
        : `${GITHUB_API}/repos/${owner}/${repo}/contents`;

    const response = await fetch(url, {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        if (response.status === 404) {
            return [];
        }
        throw new Error(`Failed to fetch repository contents: ${response.statusText}`);
    }

    const contents = await response.json();

    // Handle single file response
    if (!Array.isArray(contents)) {
        return contents.name.endsWith('.md') ? [contents] : [];
    }

    const markdownFiles = [];

    for (const item of contents) {
        if (item.type === 'file' && item.name.endsWith('.md')) {
            markdownFiles.push(item);
        } else if (item.type === 'dir' && !item.name.startsWith('.')) {
            // Recursively fetch subdirectories (skip hidden directories)
            // Limit depth to prevent excessive API calls
            if (path.split('/').length < 3) {
                const subFiles = await getMarkdownFiles(owner, repo, item.path);
                markdownFiles.push(...subFiles);
            }
        }
    }

    return markdownFiles;
}

/**
 * Fetch the content of a file from GitHub
 */
export async function getFileContent(owner, repo, path) {
    const headers = getAuthHeaders();
    headers['Accept'] = 'application/vnd.github.v3.raw'; // Override to get raw content

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
        headers
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }

    return await response.text();
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
 * Get repositories for the authenticated user
 */
export async function getUserRepositories(page = 1, perPage = 100) {
    const url = `${GITHUB_API}/user/repos?sort=pushed&per_page=${perPage}&page=${page}`;
    console.log('[GitHub Client] Fetching user repositories');

    const headers = getAuthHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
        console.error(`[GitHub Client] Failed to get repositories: ${response.status}`);
        throw new Error('Failed to get user repositories');
    }

    const repos = await response.json();
    console.log(`[GitHub Client] Fetched ${repos.length} repositories`);
    return repos;
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
/**
 * GitHub API client for fetching repository content
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Fetch repository metadata
 */
export async function getRepository(owner, repo) {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`Repository ${owner}/${repo} not found`);
        }
        throw new Error(`Failed to fetch repository: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Recursively fetch all markdown files from a repository
 */
export async function getMarkdownFiles(owner, repo, path = '') {
    const url = path
        ? `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`
        : `${GITHUB_API}/repos/${owner}/${repo}/contents`;

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
        }
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
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
        headers: {
            'Accept': 'application/vnd.github.v3.raw',
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }

    return await response.text();
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
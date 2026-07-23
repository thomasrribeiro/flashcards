import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem(
            'flashcards_unlogged_repos',
            JSON.stringify(['thomasrribeiro-flashcards/example'])
        );
        localStorage.setItem('flashcards_example_seeded', '1');
    });
    await page.route('https://api.github.com/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/repos/thomasrribeiro-flashcards/example/git/trees/master') {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({
                    truncated: false,
                    tree: [{
                        type: 'blob',
                        path: 'flashcards/01_foundations.md',
                        sha: 'chapter-sha',
                        size: 120
                    }]
                })
            });
        }
        if (url.pathname !== '/repos/thomasrribeiro-flashcards/example') {
            return route.fallback();
        }
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                full_name: 'thomasrribeiro-flashcards/example',
                name: 'example',
                owner: { login: 'thomasrribeiro-flashcards' },
                default_branch: 'master',
                description: 'Example deck',
                topics: ['misc'],
                stargazers_count: 0,
                forks_count: 0,
                updated_at: '2026-07-23T12:00:00Z',
                private: false
            })
        });
    });
    await page.goto('/');
    await expect(page.locator('.columns-view')).toBeVisible({ timeout: 20_000 });
});

test('deck commands are grouped in one labeled settings modal', async ({ page }) => {
    const panes = page.locator('.col-pane');
    await panes.nth(0).locator('.col-row').filter({ hasText: 'misc' }).click();
    const deck = panes.nth(1).locator('.col-row').filter({ hasText: 'example' });
    await expect(deck.getByRole('button', { name: 'Deck settings and actions' })).toBeVisible();
    await expect(deck.locator('.col-row-actions button')).toHaveCount(1);

    await deck.getByRole('button', { name: 'Deck settings and actions' }).click();
    const modal = page.locator('#deck-actions-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: /Review this deck/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /Sync latest version from GitHub/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /Reset learning progress/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /Remove from collection/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Close deck settings' })).toBeVisible();
});

import { test, expect } from '@playwright/test';

test('standalone study, persistence, curriculum and theme', async ({ page }, info) => {
    const forbidden = [], errors = [];
    page.on('request', request => {
        if (/\/api\/|api\.github\.com|raw\.githubusercontent\.com|workers\.dev/.test(request.url())) forbidden.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.col-pane')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Star physics', exact: true })).toBeAttached();
    await page.getByRole('button', { name: 'Star physics', exact: true }).click();
    await page.getByRole('button', { name: /^Learn \(/ }).click();
    await expect(page.locator('#card-front')).toContainText("Newton's Second Law");
    await page.getByRole('button', { name: 'Reveal', exact: true }).click();
    await expect(page.locator('#card-back')).toContainText('Force equals mass');
    await page.getByRole('button', { name: '3 Good' }).click();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.locator('#dashboard')).toContainText('Reviewed: 1');
    await page.reload();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.locator('#dashboard')).toContainText('Reviewed: 1');
    await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
    await expect(page.locator('.curriculum-graph-node').first()).toBeVisible();
    await page.locator('.curriculum-graph-node').filter({ hasText: 'physics' }).first().click();
    await expect(page.locator('.curriculum-details')).toContainText('read-only');
    await expect(page.locator('.curriculum-graph-node').first()).toBeVisible();
    await page.locator('.curriculum-graph-node').first().click();
    await expect(page.locator('.curriculum-graph-controls')).toContainText('physics');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: `test-results/${info.project.name}-curriculum.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await page.screenshot({ path: `test-results/${info.project.name}-study.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
});

test('imports Markdown, searches, displays solution steps and saves settings', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.col-pane')).toHaveCount(3);
    await page.locator('#import-deck').setInputFiles({ name: 'my-deck.md', mimeType: 'text/markdown', buffer: Buffer.from('<!-- card-id: example-problem -->\nP: Compute 2 + 2.\nS: **EXECUTE:** The result is 4.') });
    await expect(page.getByRole('status')).toContainText('Imported 1');
    await page.getByRole('searchbox').fill('my deck');
    await page.locator('.col-pane').nth(2).getByRole('button').click();
    await page.getByRole('button', { name: 'Reveal', exact: true }).click();
    await expect(page.locator('#card-back')).toContainText('4');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#daily-new-target').fill('7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.locator('#daily-new-target')).toHaveValue('7');
    await page.keyboard.press('Escape');
    await page.getByRole('searchbox').fill('my deck');
    await expect(page.locator('.col-pane').nth(2)).toContainText('my deck');
});

test('failed collection still allows local imports; imported HTML is sanitized', async ({ page }) => {
    await page.route('**/collection/index.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/');
    await expect(page.locator('#app-message')).toContainText('could not be loaded');
    await page.locator('#import-deck').setInputFiles({
        name: 'safe.md', mimeType: 'text/markdown',
        buffer: Buffer.from('<!-- card-id: safe-example -->\nQ: Safe question <img src="x" onerror="window.injected=true">\nA: Safe answer.')
    });
    await expect(page.locator('#app-message')).toContainText('Imported 1');
    await page.locator('.col-pane').nth(2).getByRole('button').click();
    await expect(page.locator('#card-front')).toContainText('Safe question');
    await expect(page.locator('#card-front [onerror]')).toHaveCount(0);
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
    await page.keyboard.press('Space');
    await expect(page.locator('#card-back')).toContainText('Safe answer');
    await page.keyboard.press('3');
    await expect(page.locator('#session-complete')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.locator('#library-view')).toBeVisible();
});

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tab-curriculum')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-curriculum').click();
    await expect(page.locator('.curriculum-summary')).toContainText('subjects');
});

test('semantic zoom keeps the complete curriculum readable', async ({ page }) => {
    const subjects = page.locator('.curriculum-graph-node');
    await expect(subjects).toHaveCount(3);
    await page.locator('.curriculum-graph-node[data-deck-id="physics"]').click();
    await expect(page.locator('.curriculum-mode-tabs')).toContainText('physics');
    const subjectDecks = page.locator('.curriculum-graph-node');
    await expect(subjectDecks.first()).toBeVisible();
    expect(await subjectDecks.count()).toBeLessThan(135);

    await subjectDecks.filter({ hasText: 'physical-reasoning-and-measurement' }).click();
    await expect(page.locator('.curriculum-summary')).toContainText('prerequisite path');
    const pathNodes = page.locator('.curriculum-graph-node');
    expect(await pathNodes.count()).toBeLessThan(20);
    await expect(page.locator('.curriculum-graph-node.is-target')).toHaveCount(1);
});

test('builder validates visual prerequisite edits before queueing', async ({ page }) => {
    await page.getByRole('button', { name: 'Create curriculum' }).click();
    await page.getByLabel('Subject slug').fill('earth-science');
    await page.getByLabel('Title').fill('Earth Science');
    await page.getByRole('button', { name: 'Add deck' }).click();
    await page.getByLabel('Deck ID').fill('climate');
    await page.getByRole('textbox', { name: 'Prerequisites' }).fill('missing-foundations');
    await expect(page.locator('.curriculum-builder-errors')).toContainText('missing draft deck');
    await page.getByRole('textbox', { name: 'Prerequisites' }).fill('');
    await expect(page.locator('.curriculum-builder-errors')).toBeEmpty();
});

test('generation settings persist provider choices without collecting an API key', async ({ page }) => {
    await page.getByRole('button', { name: 'Generation settings' }).click();
    const form = page.locator('#study-settings-panel');
    await expect(form).toBeVisible();
    await expect(form.getByText('API keys are never entered')).toBeVisible();
    await expect(form.locator('input[type="password"], input[name*="key" i], input[id*="key" i]')).toHaveCount(0);
    await page.getByLabel('Model').fill('gpt-example');
    await page.getByLabel('Reasoning effort').selectOption('xhigh');
    await form.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: 'Generation settings' }).click();
    await expect(page.getByLabel('Model')).toHaveValue('gpt-example');
    await expect(page.getByLabel('Reasoning effort')).toHaveValue('xhigh');
});

test('a signed-in learner can queue the selected planned deck as a pilot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    let generationJob = null;
    await page.route('https://flashcards-worker.ribeirothomas28.workers.dev/api/**', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/generation-requests' && request.method() === 'POST') {
            generationJob = request.postDataJSON();
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ request: { id: 42, status: 'queued' }, existing: false })
            });
        }
        const body = pathname.includes('/reviews/') ? { reviews: [] }
            : pathname.includes('/repos/') ? { repos: [] }
                : pathname.includes('/chapter-progress/') ? { chapters: [] }
                    : {};
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.evaluate(() => {
        localStorage.setItem('github_user', JSON.stringify({ id: 'owner', username: 'owner', name: 'Owner' }));
        localStorage.setItem('github_token', 'test-token');
    });
    await page.reload();
    await page.locator('#tab-curriculum').click();
    await page.locator('.curriculum-graph-node[data-deck-id="mathematics"]').click();
    const target = page.locator('.curriculum-graph-node[data-deck-id="mathematics/elementary-algebra-and-functions"]');
    await target.click();
    await page.locator('.curriculum-graph-node.is-target').click();
    const generate = page.getByRole('button', { name: 'Generate pilot chapter' });
    await expect(generate).toBeVisible();
    await generate.click();
    await expect.poll(() => generationJob).toMatchObject({
        jobType: 'deck-build',
        providerId: 'codex',
        payload: {
            deckId: 'mathematics/elementary-algebra-and-functions',
            buildScope: 'pilot'
        }
    });
});

test('curriculum controls and builder fit a phone viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium');
    const stage = page.locator('.curriculum-graph-stage');
    await expect(stage).toBeVisible();
    const box = await stage.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    await page.getByRole('button', { name: 'Create curriculum' }).click();
    const modal = page.locator('.curriculum-builder-modal');
    const modalBox = await modal.boundingBox();
    expect(modalBox.x).toBeGreaterThanOrEqual(0);
    expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(391);
});

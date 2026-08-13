import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tab-curriculum')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-curriculum').click();
    await expect(page.locator('.curriculum-summary')).toContainText('subject');
});

test('focused explorer keeps prerequisite relationships at one hierarchy', async ({ page }) => {
    const subjects = page.locator('.curriculum-directory .curriculum-explorer-item');
    await expect(subjects).toHaveCount(3);
    await subjects.filter({ hasText: 'physics' }).click();

    await expect(page.locator('.curriculum-neighborhood-column')).toHaveCount(3);
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText('physics');
    await expect(page).toHaveURL(/curriculum-level=subject.*curriculum-target=physics|curriculum-target=physics.*curriculum-level=subject/);
    await expect(page.locator('.curriculum-neighborhood .curriculum-explorer-item-meta').first()).toContainText('decks');
    await page.reload();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText('physics');

    await page.getByRole('button', { name: 'View decks' }).click();
    await expect(page.locator('.curriculum-directory')).toBeVisible();
    await page.locator('.curriculum-directory .curriculum-explorer-item')
        .filter({ hasText: 'measurement-and-physical-reasoning' }).click();
    await expect(page.locator('.curriculum-selected-kind')).toHaveText('deck');
    await expect(page.locator('.curriculum-neighborhood-column.is-prerequisites')).toBeVisible();

    await page.goBack();
    await expect(page.locator('.curriculum-directory')).toBeVisible();
    await page.getByRole('button', { name: 'Full map' }).click();
    await expect(page.locator('.curriculum-graph-stage')).toBeVisible();
    await page.getByRole('button', { name: 'Focused view' }).click();
    await expect(page.locator('.curriculum-directory')).toBeVisible();
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

test('generation settings persist provider choices and explain secure key storage', async ({ page }) => {
    await page.locator('#study-settings-btn').click();
    const form = page.locator('#study-settings-panel');
    await expect(form).toBeVisible();
    await expect(form.getByText('Keys are validated by the provider')).toBeVisible();
    await expect(form.locator('input[type="password"]')).toHaveCount(1);
    await page.getByLabel('Model').fill('gpt-example');
    await page.getByLabel('Reasoning effort').selectOption('xhigh');
    await form.getByRole('button', { name: 'Save' }).click();

    await page.locator('#study-settings-btn').click();
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
    await page.locator('.curriculum-directory .curriculum-explorer-item').filter({ hasText: 'mathematics' }).click();
    await page.getByRole('button', { name: 'View decks' }).click();
    await page.locator('.curriculum-directory .curriculum-explorer-item')
        .filter({ hasText: 'geometry-and-measurement' }).click();
    await page.getByRole('button', { name: 'Preparation details' }).click();
    const generate = page.getByRole('button', { name: 'Generate pilot chapter' });
    await expect(generate).toBeVisible();
    await generate.click();
    await expect.poll(() => generationJob).toMatchObject({
        jobType: 'deck-build',
        providerId: 'codex',
        payload: {
            deckId: 'mathematics/geometry-and-measurement',
            buildScope: 'pilot'
        }
    });
});

test('curriculum controls and builder fit a phone viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium');
    await page.locator('.curriculum-directory .curriculum-explorer-item').filter({ hasText: 'physics' }).click();
    const explorer = page.locator('.curriculum-neighborhood');
    await expect(explorer).toBeVisible();
    const box = await explorer.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    await expect(page.locator('.curriculum-neighborhood-column.is-selected')).toBeVisible();
    await expect(page.locator('.curriculum-neighborhood-column.is-prerequisites')).toBeVisible();
    await expect(page.locator('.curriculum-neighborhood-column.is-unlocks')).toBeHidden();
    await page.getByRole('button', { name: 'Unlocks' }).click();
    await expect(page.locator('.curriculum-neighborhood-column.is-unlocks')).toBeVisible();
    await page.getByRole('button', { name: 'Edit subject' }).click();
    const modal = page.locator('.curriculum-builder-modal');
    const modalBox = await modal.boundingBox();
    expect(modalBox.x).toBeGreaterThanOrEqual(0);
    expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(391);
});

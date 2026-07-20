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

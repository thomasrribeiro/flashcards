import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tab-curriculum')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-curriculum').click();
    await expect(page.locator('.curriculum-breadcrumb')).toBeVisible();
    await expect(page.locator('.curriculum-view > .curriculum-breadcrumb')).toHaveCount(1);
    await expect(page.getByText('Recommended paths', { exact: true })).toHaveCount(0);
    await expect(page.locator('.curriculum-toolbar').getByRole('button', { name: 'Sources' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create curriculum' })).toHaveCount(0);
});

test('navigates subject graph, ranked deck layers, deck neighborhood, and chapter layers', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'desktop-chromium') {
        await page.setViewportSize({ width: 2000, height: 1100 });
    }
    const subjects = page.locator('.curriculum-graph-node');
    await expect(subjects).toHaveCount(3);
    await page.locator('.curriculum-graph-node[data-deck-id="physics"]').click();

    await expect(page.locator('.curriculum-layer-label')).toContainText('Layers 1–3');
    await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zoom out' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Fit', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/curriculum-level=deck.*curriculum-subject=physics|curriculum-subject=physics.*curriculum-level=deck/);
    await expect(page.locator('.curriculum-graph-node-subject').first()).toHaveText('physics');
    const completeDeckGraphCount = await page.locator('.curriculum-graph-node').count();
    expect(completeDeckGraphCount).toBeGreaterThan(3);
    await expect(page.locator('.curriculum-graph-stage')).toHaveClass(/is-dense/);
    await expect(page.locator('.curriculum-graph-node[data-deck-id="physics/advanced-quantum-mechanics"]')).toHaveCount(1);
    await expect(page.locator('.curriculum-graph-node-status')).not.toContainText(['in collection', 'available', 'planned']);
    await expect(page.locator('.curriculum-graph-node[data-deck-id="physics/measurement-and-physical-reasoning"]')).toHaveClass(/is-learning/);
    await expect(page.locator('.curriculum-graph-node[data-deck-id="physics/advanced-quantum-mechanics"]')).not.toHaveClass(/is-learning|is-complete/);
    if (testInfo.project.name === 'desktop-chromium') {
        const viewportHeight = page.viewportSize().height;
        const initialGraphBox = await page.locator('.curriculum-graph-stage').boundingBox();
        expect(initialGraphBox.y + initialGraphBox.height).toBeLessThanOrEqual(viewportHeight);
        const controlsBox = await page.locator('.curriculum-graph-controls').boundingBox();
        const navigationBox = await page.locator('.curriculum-graph-navigation').boundingBox();
        expect(Math.abs(
            navigationBox.x + navigationBox.width / 2
            - (controlsBox.x + controlsBox.width / 2)
        )).toBeLessThan(2);
        const visibleRanks = await page.locator('.curriculum-graph-stage').evaluate(stage => {
            const stageRect = stage.getBoundingClientRect();
            return [...new Set([...stage.querySelectorAll('.curriculum-graph-node[data-rank]')]
                .filter(node => {
                    const rect = node.getBoundingClientRect();
                    const center = rect.left + rect.width / 2;
                    return center >= stageRect.left && center <= stageRect.right;
                })
                .map(node => node.dataset.rank))];
        });
        expect(visibleRanks).toHaveLength(3);
        const transformBeforeWheel = await page.locator('.curriculum-graph-viewport')
            .evaluate(element => element.style.transform);
        await page.locator('.curriculum-graph-stage').hover();
        await page.mouse.wheel(0, 180);
        await expect.poll(() => page.locator('.curriculum-graph-viewport')
            .evaluate(element => element.style.transform)).not.toBe(transformBeforeWheel);
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
    }
    const firstNode = page.locator('.curriculum-graph-node').first();
    await firstNode.hover();
    await expect(page.locator('.curriculum-graph-connection.is-related')).not.toHaveCount(0);
    await expect(page.locator('.curriculum-graph-connection.is-dimmed')).not.toHaveCount(0);
    await expect(page.locator('.curriculum-graph-arrowhead')).not.toHaveCount(0);
    await expect(page.locator('.curriculum-graph-edge[marker-end]')).toHaveCount(0);
    await expect(page.locator('.curriculum-graph-connection.is-primary')).not.toHaveCount(0);
    const primaryOpacity = Number(await page.locator('.curriculum-graph-connection.is-primary').first().evaluate(element => getComputedStyle(element).opacity));
    const secondaryOpacity = Number(await page.locator('.curriculum-graph-connection.is-long').first().evaluate(element => getComputedStyle(element).opacity));
    expect(primaryOpacity).toBe(secondaryOpacity);
    await expect(page.locator('.curriculum-graph-connection.is-long .curriculum-graph-edge').first())
        .toHaveCSS('stroke-dasharray', 'none');
    const cableRouting = await page.locator('.curriculum-graph-stage').evaluate(stage => {
        const nodes = [...stage.querySelectorAll('.curriculum-graph-node')];
        const nodeBottom = Math.max(...nodes.map(node =>
            Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height)));
        const longConnections = [...stage.querySelectorAll('.curriculum-graph-connection.is-long')];
        return {
            nodeBottom,
            cableYs: longConnections.map(connection => Number(connection.dataset.cableY)),
            pathsContainLane: longConnections.every(connection =>
                connection.querySelector('.curriculum-graph-edge').getAttribute('d')
                    .includes(connection.dataset.cableY)),
            directCableCount: stage.querySelectorAll('.curriculum-graph-connection.is-primary[data-cable-y]').length
        };
    });
    expect(cableRouting.cableYs.length).toBeGreaterThan(0);
    expect(cableRouting.cableYs.every(y => y > cableRouting.nodeBottom)).toBe(true);
    expect(cableRouting.pathsContainLane).toBe(true);
    expect(cableRouting.directCableCount).toBe(0);
    const arrowGeometry = await page.locator('.curriculum-graph-connection.is-primary').first().evaluate(connection => {
        const line = connection.querySelector('.curriculum-graph-edge');
        const arrowhead = connection.querySelector('.curriculum-graph-arrowhead');
        const end = line.getPointAtLength(line.getTotalLength());
        const headBounds = arrowhead.getBBox();
        const target = [...document.querySelectorAll('.curriculum-graph-node')]
            .find(node => node.dataset.deckId === connection.dataset.target);
        return {
            lineX: end.x,
            lineY: end.y,
            headBaseX: headBounds.x,
            headCenterY: headBounds.y + headBounds.height / 2,
            headTipX: headBounds.x + headBounds.width,
            targetX: Number.parseFloat(target.style.left)
        };
    });
    expect(Math.abs(arrowGeometry.lineX - arrowGeometry.headBaseX)).toBeLessThan(0.5);
    expect(Math.abs(arrowGeometry.lineY - arrowGeometry.headCenterY)).toBeLessThan(0.5);
    expect(Math.abs(arrowGeometry.headTipX - arrowGeometry.targetX)).toBeLessThan(0.5);
    const viewport = page.locator('.curriculum-graph-viewport');
    const transformBeforePan = await viewport.evaluate(element => element.style.transform);
    const stageBox = await page.locator('.curriculum-graph-stage').boundingBox();
    await page.mouse.move(stageBox.x + 10, stageBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + 130, stageBox.y + 10);
    await page.mouse.up();
    await expect.poll(() => viewport.evaluate(element => element.style.transform)).not.toBe(transformBeforePan);
    await page.getByRole('button', { name: 'Show next three dependency layers' }).click();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layers 2–4');
    await expect(page.locator('.curriculum-graph-node')).toHaveCount(completeDeckGraphCount);
    await expect(page).toHaveURL(/curriculum-layer=1/);
    await page.getByRole('button', { name: 'Show previous three dependency layers' }).click();
    await page.reload();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layers 1–3');

    await page.locator('.curriculum-graph-node[data-deck-id="physics/measurement-and-physical-reasoning"]').click();
    await expect(page.locator('.curriculum-selected-kind')).toHaveText('deck');
    await expect(page.locator('.curriculum-neighborhood-column')).toHaveCount(3);
    await expect(page.locator('.curriculum-neighborhood-column.is-prerequisites')).toBeVisible();
    await expect(page.locator('.curriculum-neighborhood-edges')).toHaveCount(0);
    await expect(page.locator('.curriculum-neighborhood-column.is-unlocks > h3 span')).not.toHaveText('0');
    await expect(page.getByRole('button', { name: 'Edit subject' })).toHaveCount(0);
    await expect(page.locator('.curriculum-toolbar button')).toHaveCount(0);
    await expect(page.locator('.curriculum-selected-item button')).toHaveCount(0);
    const focusBack = page.getByRole('button', { name: 'Back to previous selected deck' });
    const focusForward = page.getByRole('button', { name: 'Forward to next selected deck' });
    await expect(focusBack).toBeDisabled();
    await expect(focusForward).toBeDisabled();
    if (testInfo.project.name === 'desktop-chromium') {
        const unlocks = page.locator('.curriculum-neighborhood-column.is-unlocks');
        const dimensions = await unlocks.evaluate(element => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight
        }));
        expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
        await unlocks.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect.poll(() => unlocks.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await unlocks.evaluate(element => { element.scrollTop = 0; });
        const selectedTop = (await page.locator('.curriculum-selected-item').boundingBox()).y;
        const prerequisiteTop = (await page.locator('.curriculum-neighborhood-column.is-prerequisites .curriculum-explorer-item').first().boundingBox()).y;
        const unlockTop = (await page.locator('.curriculum-neighborhood-column.is-unlocks .curriculum-explorer-item').first().boundingBox()).y;
        expect(Math.abs(selectedTop - prerequisiteTop)).toBeLessThan(2);
        expect(Math.abs(selectedTop - unlockTop)).toBeLessThan(2);
    }
    const firstFocusedDeck = await page.locator('.curriculum-selected-item h2').textContent();
    await page.locator('.curriculum-neighborhood-column.is-prerequisites .curriculum-explorer-item').first().click();
    await expect(page.locator('.curriculum-selected-item h2')).not.toHaveText(firstFocusedDeck);
    const secondFocusedDeck = await page.locator('.curriculum-selected-item h2').textContent();
    await expect(focusBack).toBeEnabled();
    await expect(focusForward).toBeDisabled();
    await page.reload();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(secondFocusedDeck);
    await expect(focusBack).toBeEnabled();
    await focusBack.click();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(firstFocusedDeck);
    await expect(focusBack).toBeDisabled();
    await expect(focusForward).toBeEnabled();
    await focusForward.click();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(secondFocusedDeck);
    await focusBack.click();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(firstFocusedDeck);

    await page.locator('.curriculum-selected-item').click();
    await expect(page.locator('.curriculum-graph-stage')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to previous selected deck' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Forward to next selected deck' })).toHaveCount(0);
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layers 1–3');
    await expect(page.locator('.curriculum-graph-node-subject').first()).toHaveText('physics');
    await expect(page.locator('.curriculum-graph-node')).toHaveCount(10);

    await page.goBack();
    await expect(page.locator('.curriculum-selected-kind')).toHaveText('deck');
    await page.goBack();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layers 1–3');
});

test('aligns another focused deck and explains an unpublished chapter plan', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.locator('.curriculum-graph-node[data-deck-id="mathematics"]').click();
    await page.locator('.curriculum-graph-node[data-deck-id="mathematics/elementary-algebra-and-functions"]').click();

    const selectedTop = (await page.locator('.curriculum-selected-item').boundingBox()).y;
    const prerequisiteTop = (await page.locator('.curriculum-neighborhood-column.is-prerequisites .curriculum-explorer-item').first().boundingBox()).y;
    const unlockTop = (await page.locator('.curriculum-neighborhood-column.is-unlocks .curriculum-explorer-item').first().boundingBox()).y;
    expect(Math.abs(selectedTop - prerequisiteTop)).toBeLessThan(2);
    expect(Math.abs(selectedTop - unlockTop)).toBeLessThan(2);

    await page.goBack();
    await expect(page.locator('.curriculum-graph-node[data-deck-id="mathematics/geometry-and-measurement"]')).toBeVisible();
    await page.locator('.curriculum-graph-node[data-deck-id="mathematics/geometry-and-measurement"]').click();
    await page.locator('.curriculum-selected-item').click();
    await expect(page.getByText('This deck does not have a published chapter plan yet.')).toBeVisible();
    await expect(page.locator('.curriculum-layer-label')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /selected deck/ })).toHaveCount(0);
});

test('AI generation stays blank until an API provider is connected', async ({ page }) => {
    await page.locator('#study-settings-btn').click();
    const form = page.locator('#study-settings-panel');
    await expect(form).toBeVisible();
    await expect(form.getByRole('tab', { name: 'Study' })).toHaveAttribute('aria-selected', 'true');
    await form.getByRole('tab', { name: 'AI generation' }).click();
    await expect(form.getByText('Keys are validated by the provider')).toBeVisible();
    await expect(form.locator('input[type="password"]')).toHaveCount(1);
    const sectionOrder = await form.locator('#study-settings-pane-generation').evaluate(pane => (
        [...pane.children].map(element => element.textContent.trim().split('\n')[0])
    ));
    expect(sectionOrder.indexOf('Provider connections')).toBeLessThan(sectionOrder.indexOf('Generation defaults'));
    await expect(page.getByLabel('Generation provider')).toBeDisabled();
    await expect(page.getByLabel('Generation provider')).toHaveValue('');
    await expect(page.getByLabel('Generation provider')).toContainText('Connect a provider above');
    await expect(page.getByLabel('Model')).toBeDisabled();
    await expect(page.getByLabel('Reasoning effort')).toBeDisabled();
    await expect(form.getByText(/local runner/i)).toHaveCount(0);
    await form.getByRole('tab', { name: 'Curriculum' }).click();
    await expect(form.getByRole('tab', { name: 'Curriculum' })).toHaveAttribute('aria-selected', 'true');
    await expect(form.locator('#curriculum-settings-sources .curriculum-source-row')).not.toHaveCount(0);
    await form.getByRole('tab', { name: 'AI generation' }).click();
    const overflowingControls = await form.locator('.study-setting-field select, .study-setting-field input').evaluateAll(elements => (
        elements.filter(element => element.getBoundingClientRect().right > element.closest('.study-settings-pane').getBoundingClientRect().right + 1).length
    ));
    expect(overflowingControls).toBe(0);
    await form.getByRole('button', { name: 'Save' }).click();

    await page.locator('#study-settings-btn').click();
    await form.getByRole('tab', { name: 'AI generation' }).click();
    await expect(page.getByLabel('Generation provider')).toHaveValue('');
    await expect(page.getByLabel('Model')).toBeDisabled();
});

test('curriculum controls fit a phone viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium');
    await page.locator('.curriculum-graph-node[data-deck-id="physics"]').click();
    await page.locator('.curriculum-graph-node[data-deck-id="physics/measurement-and-physical-reasoning"]').click();
    const explorer = page.locator('.curriculum-neighborhood');
    await expect(explorer).toBeVisible();
    const box = await explorer.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    await expect(page.locator('.curriculum-neighborhood-column.is-selected')).toBeVisible();
    await expect(page.locator('.curriculum-neighborhood-column.is-prerequisites')).toBeVisible();
    await expect(page.locator('.curriculum-neighborhood-column.is-unlocks')).toBeHidden();
    await page.getByRole('button', { name: 'Unlocks' }).click();
    await expect(page.locator('.curriculum-neighborhood-column.is-unlocks')).toBeVisible();
    await page.getByRole('button', { name: 'subjects', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create curriculum' })).toHaveCount(0);
});

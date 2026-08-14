import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tab-curriculum')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-curriculum').click();
    await expect(page.locator('.curriculum-breadcrumb')).toBeVisible();
    await expect(page.locator('.curriculum-breadcrumb-row > .curriculum-breadcrumb')).toHaveCount(1);
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
    await expect(page.locator('.curriculum-graph-stage')).not.toHaveClass(/is-layered/);
    expect(await page.locator('.curriculum-graph-stage').evaluate(stage => getComputedStyle(stage).overflowX))
        .toBe('auto');
    await page.locator('.curriculum-graph-node[data-deck-id="physics"]').click();

    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 1 of');
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
        expect(visibleRanks).toHaveLength(2);
        const firstLayerOffset = await page.locator('.curriculum-graph-stage').evaluate(stage => {
            const stageRect = stage.getBoundingClientRect();
            const focal = stage.querySelector('.curriculum-graph-node[data-rank="0"]')?.getBoundingClientRect();
            const viewportCenter = stageRect.left + stage.clientLeft + stage.clientWidth / 2;
            return Math.abs((focal.left + focal.width / 2) - viewportCenter);
        });
        expect(firstLayerOffset).toBeLessThan(2);
        const stage = page.locator('.curriculum-graph-stage');
        const scrolling = await stage.evaluate(element => ({
            top: element.scrollTop,
            hasVertical: element.scrollHeight > element.clientHeight,
            hasHorizontalContent: element.scrollWidth > element.clientWidth,
            overflowX: getComputedStyle(element).overflowX,
            overflowY: getComputedStyle(element).overflowY,
            routeExtentMatchesLayer: (() => {
                const layer = Number(element.dataset.scrollLayer);
                const routeBottoms = [...element.querySelectorAll('.curriculum-graph-connection.is-long')]
                    .filter(connection => {
                        const source = element.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.source)}"]`);
                        const target = element.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.target)}"]`);
                        return Number(source.dataset.rank) <= layer && Number(target.dataset.rank) >= layer;
                    })
                    .map(connection => {
                        const bounds = connection.querySelector('.curriculum-graph-edge').getBBox();
                        return bounds.y + bounds.height;
                    });
                const actualRouteBottom = Math.max(0, ...routeBottoms);
                return Math.abs(Number(element.dataset.scrollRouteBottom) - actualRouteBottom) < 1
                    && Number(element.dataset.scrollExtent) >= actualRouteBottom + 24;
            })(),
            extentMatchesLayer: (() => {
                const focal = element.querySelector(`.curriculum-graph-node[data-rank="${element.dataset.scrollLayer}"]`);
                const scale = focal.getBoundingClientRect().width / Number.parseFloat(focal.style.width);
                const expected = Math.max(element.clientHeight, Number(element.dataset.scrollExtent) * scale);
                return Math.abs(element.scrollHeight - expected) < 3;
            })()
        }));
        expect(scrolling.hasVertical).toBe(false);
        expect(scrolling.hasHorizontalContent).toBe(true);
        expect(scrolling.overflowX).toBe('hidden');
        expect(scrolling.overflowY).toBe('scroll');
        expect(scrolling.routeExtentMatchesLayer).toBe(true);
        expect(scrolling.extentMatchesLayer).toBe(true);
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
    }
    const baselineOpacity = Number(await page.locator('.curriculum-graph-connection').first()
        .evaluate(element => getComputedStyle(element).opacity));
    expect(baselineOpacity).toBeLessThan(0.4);
    const branchNode = page.locator('.curriculum-graph-node[data-deck-id="physics/advanced-quantum-mechanics"]');
    await branchNode.hover();
    await expect(page.locator('.curriculum-graph-connection.is-related')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator('.curriculum-graph-connection.is-related')).not.toHaveCount(0);
    await expect(page.locator('.curriculum-graph-connection.is-dimmed')).not.toHaveCount(0);
    await expect(page.locator('.curriculum-graph-arrowhead')).not.toHaveCount(0);
    await expect(page.locator('.curriculum-graph-edge[marker-end]')).toHaveCount(0);
    await expect(page.locator('.curriculum-graph-connection.is-primary')).not.toHaveCount(0);
    await expect.poll(async () => {
        const relatedOpacity = Number(await page.locator('.curriculum-graph-connection.is-related').first()
            .evaluate(element => getComputedStyle(element).opacity));
        const dimmedOpacity = Number(await page.locator('.curriculum-graph-connection.is-dimmed').first()
            .evaluate(element => getComputedStyle(element).opacity));
        return dimmedOpacity < relatedOpacity && relatedOpacity === baselineOpacity;
    }).toBe(true);
    await expect(page.locator('.curriculum-graph-connection.is-long .curriculum-graph-edge').first())
        .toHaveCSS('stroke-dasharray', 'none');
    const cableRouting = await page.locator('.curriculum-graph-stage').evaluate(stage => {
        const longConnections = [...stage.querySelectorAll('.curriculum-graph-connection.is-long')];
        const trunks = [...stage.querySelectorAll('.curriculum-graph-connection.is-cable-trunk')];
        const longEdgesBySource = new Map();
        for (const connection of longConnections) {
            const edges = longEdgesBySource.get(connection.dataset.source) || [];
            edges.push(connection);
            longEdgesBySource.set(connection.dataset.source, edges);
        }
        return {
            cableYs: longConnections.flatMap(connection =>
                connection.dataset.cableYs.split(',').filter(Boolean).map(Number)),
            pathsContainLane: longConnections.every(connection =>
                connection.dataset.cableYs.split(',').filter(Boolean).every(y =>
                    connection.querySelector('.curriculum-graph-edge').getAttribute('d').includes(y))),
            routesBelowCrossedColumns: longConnections.every(connection => {
                const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.source)}"]`);
                const target = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.target)}"]`);
                const sourceRank = Number(source.dataset.rank);
                const targetRank = Number(target.dataset.rank);
                const cableYs = connection.dataset.cableYs.split(',').filter(Boolean).map(Number);
                return cableYs.every((y, index) => {
                    const rank = sourceRank + index + 1;
                    if (rank >= targetRank) return true;
                    const bottoms = [...stage.querySelectorAll(`.curriculum-graph-node[data-rank="${rank}"]`)]
                        .map(node => Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height));
                    return bottoms.length && y > Math.max(...bottoms);
                });
            }),
            edgeAligned: longConnections.every(connection => {
                const target = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.target)}"]`);
                const path = connection.querySelector('.curriculum-graph-edge');
                const targetRise = Number.parseFloat(target.style.left) - 10;
                return Math.abs(path.getPointAtLength(0).x - targetRise) < 0.5
                    && Math.abs(path.getPointAtLength(path.getTotalLength() - 5).x - targetRise) < 0.5;
            }),
            trunksAligned: trunks.every(trunk => {
                const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(trunk.dataset.source)}"]`);
                const targets = trunk.dataset.targets.split('|').map(target =>
                    stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(target)}"]`));
                const path = trunk.querySelector('.curriculum-graph-edge');
                const start = path.getPointAtLength(0);
                const end = path.getPointAtLength(path.getTotalLength());
                const sourceRight = Number.parseFloat(source.style.left) + Number.parseFloat(source.style.width);
                const farthestTargetRise = Math.max(...targets.map(target => Number.parseFloat(target.style.left) - 10));
                return Math.abs(start.x - sourceRight) < 0.5
                    && Number(trunk.dataset.descentX) > sourceRight
                    && path.getAttribute('d').includes(`H ${trunk.dataset.descentX} V`)
                    && Math.abs(end.x - farthestTargetRise) < 0.5;
            }),
            staggeredDescents: (() => {
                const byRank = new Map();
                for (const trunk of trunks) {
                    const descents = byRank.get(trunk.dataset.sourceRank) || [];
                    descents.push(Number(trunk.dataset.descentX));
                    byRank.set(trunk.dataset.sourceRank, descents);
                }
                const sharedRanks = [...byRank.values()].filter(descents => descents.length > 1);
                return sharedRanks.length > 0
                    && sharedRanks.every(descents => new Set(descents.map(value => value.toFixed(3))).size === descents.length);
            })(),
            oneTrunkPerSource: trunks.length === new Set(trunks.map(trunk => trunk.dataset.source)).size
                && trunks.every(trunk => longEdgesBySource.has(trunk.dataset.source)),
            sharedSourceCount: [...longEdgesBySource.values()].filter(edges => edges.length > 1).length,
            sharedEdgesUseTrunkLane: [...longEdgesBySource.entries()].every(([source, edges]) => {
                const trunk = trunks.find(item => item.dataset.source === source);
                return trunk && edges.every(edge => edge.dataset.cableYs.split(',').filter(Boolean)
                    .every(y => Math.abs(Number(y) - Number(trunk.dataset.cableY)) < 0.5));
            }),
            directCableCount: stage.querySelectorAll('.curriculum-graph-connection.is-primary[data-cable-ys]').length
        };
    });
    expect(cableRouting.cableYs.length).toBeGreaterThan(0);
    expect(cableRouting.routesBelowCrossedColumns).toBe(true);
    expect(cableRouting.edgeAligned).toBe(true);
    expect(cableRouting.trunksAligned).toBe(true);
    expect(cableRouting.staggeredDescents).toBe(true);
    expect(cableRouting.oneTrunkPerSource).toBe(true);
    expect(cableRouting.sharedSourceCount).toBeGreaterThan(0);
    expect(cableRouting.sharedEdgesUseTrunkLane).toBe(true);
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
    await page.getByRole('button', { name: 'Show next dependency layer' }).click();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 2 of');
    if (testInfo.project.name === 'desktop-chromium') {
        await expect.poll(() => page.locator('.curriculum-graph-stage').evaluate(stage => {
            const stageRect = stage.getBoundingClientRect();
            return new Set([...stage.querySelectorAll('.curriculum-graph-node[data-rank]')]
                .filter(node => {
                    const rect = node.getBoundingClientRect();
                    const center = rect.left + rect.width / 2;
                    return center >= stageRect.left && center <= stageRect.right;
                })
                .map(node => node.dataset.rank)).size;
        })).toBe(3);
        const tallRank = await page.locator('.curriculum-graph-stage').evaluate(stage => {
            const bottoms = new Map();
            for (const node of stage.querySelectorAll('.curriculum-graph-node[data-rank]')) {
                const rank = Number(node.dataset.rank);
                const bottom = Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height);
                bottoms.set(rank, Math.max(bottoms.get(rank) || 0, bottom));
            }
            return [...bottoms.entries()].sort((a, b) => b[1] - a[1])[0][0];
        });
        for (let rank = 1; rank < tallRank; rank += 1) {
            await page.getByRole('button', { name: 'Show next dependency layer' }).click();
        }
        const tallLayerStage = page.locator('.curriculum-graph-stage');
        await expect(tallLayerStage).toHaveAttribute('data-scroll-layer', String(tallRank));
        await tallLayerStage.evaluate(element => { element.style.height = '300px'; });
        const tallLayerScrolling = await tallLayerStage.evaluate(element => ({
            top: element.scrollTop,
            hasVertical: element.scrollHeight > element.clientHeight
        }));
        expect(tallLayerScrolling.hasVertical).toBe(true);
        const tallLayerNode = tallLayerStage.locator(`.curriculum-graph-node[data-rank="${tallRank}"]`).first();
        await tallLayerNode.hover();
        await page.waitForTimeout(500);
        await expect(page.locator('.curriculum-graph-connection.is-related')).not.toHaveCount(0);
        await page.mouse.wheel(0, 12);
        await expect(page.locator('.curriculum-graph-connection.is-related')).toHaveCount(0);
        await page.waitForTimeout(250);
        await expect(page.locator('.curriculum-graph-connection.is-related')).toHaveCount(0);
        await expect.poll(() => page.locator('.curriculum-graph-connection.is-related').count(), {
            timeout: 1500
        }).toBeGreaterThan(0);
        await expect.poll(() => tallLayerStage.evaluate(element => element.scrollTop))
            .toBeGreaterThan(tallLayerScrolling.top);
        for (let rank = tallRank; rank > 1; rank -= 1) {
            await page.getByRole('button', { name: 'Show previous dependency layer' }).click();
        }
    }
    await expect(page.locator('.curriculum-graph-node')).toHaveCount(completeDeckGraphCount);
    await expect(page).toHaveURL(/curriculum-layer=1/);
    await page.getByRole('button', { name: 'Show previous dependency layer' }).click();
    await page.reload();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 1 of');
    const layerCount = Number((await page.locator('.curriculum-layer-label').textContent()).split(' of ')[1]);
    for (let layer = 1; layer < layerCount; layer += 1) {
        await page.getByRole('button', { name: 'Show next dependency layer' }).click();
    }
    await expect(page.locator('.curriculum-layer-label')).toHaveText(`Layer ${layerCount} of ${layerCount}`);
    await expect(page.getByRole('button', { name: 'Show next dependency layer' })).toBeDisabled();
    if (testInfo.project.name === 'desktop-chromium') {
        const lastLayerOffset = await page.locator('.curriculum-graph-stage').evaluate((stage, rank) => {
            const stageRect = stage.getBoundingClientRect();
            const focal = stage.querySelector(`.curriculum-graph-node[data-rank="${rank}"]`)?.getBoundingClientRect();
            const viewportCenter = stageRect.left + stage.clientLeft + stage.clientWidth / 2;
            return Math.abs((focal.left + focal.width / 2) - viewportCenter);
        }, layerCount - 1);
        expect(lastLayerOffset).toBeLessThan(2);
    }
    for (let layer = layerCount; layer > 1; layer -= 1) {
        await page.getByRole('button', { name: 'Show previous dependency layer' }).click();
    }
    await expect(page.locator('.curriculum-layer-label')).toHaveText(`Layer 1 of ${layerCount}`);

    await page.locator('.curriculum-graph-node[data-deck-id="physics/measurement-and-physical-reasoning"]').click();
    await expect(page.locator('.curriculum-selected-kind')).toHaveText('deck');
    await expect(page.locator('.curriculum-neighborhood-column')).toHaveCount(3);
    await expect(page.locator('.curriculum-neighborhood-column.is-prerequisites')).toBeVisible();
    await expect(page.locator('.curriculum-neighborhood-edges')).toHaveCount(0);
    await expect(page.locator('.curriculum-neighborhood-column.is-unlocks > h3 span')).not.toHaveText('0');
    await expect(page.getByRole('button', { name: 'Edit subject' })).toHaveCount(0);
    await expect(page.locator('.curriculum-toolbar button')).toHaveCount(0);
    await expect(page.locator('.curriculum-selected-item button')).toHaveCount(0);
    await expect(page.locator('.curriculum-selected-header button')).toHaveCount(0);
    const historyBack = page.getByRole('button', { name: 'Back in curriculum' });
    const historyForward = page.getByRole('button', { name: 'Forward in curriculum' });
    await expect(historyBack).toBeEnabled();
    await expect(historyForward).toBeDisabled();
    const breadcrumbBox = await page.locator('.curriculum-breadcrumb-row').boundingBox();
    const historyBox = await page.locator('.curriculum-history-controls').boundingBox();
    expect(historyBox.x + historyBox.width).toBeLessThanOrEqual(breadcrumbBox.x + breadcrumbBox.width + 1);
    if (testInfo.project.name === 'desktop-chromium') {
        const neighborhoodBox = await page.locator('.curriculum-neighborhood').boundingBox();
        expect(neighborhoodBox.y + neighborhoodBox.height).toBeLessThanOrEqual(page.viewportSize().height);
        const prerequisitesColumn = page.locator('.curriculum-neighborhood-column.is-prerequisites');
        const prerequisites = prerequisitesColumn.locator('.curriculum-neighborhood-scroll');
        const unlocksColumn = page.locator('.curriculum-neighborhood-column.is-unlocks');
        const unlocks = unlocksColumn.locator('.curriculum-neighborhood-scroll');
        const shortDimensions = await prerequisites.evaluate(element => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            overflowY: getComputedStyle(element).overflowY
        }));
        expect(shortDimensions.scrollHeight).toBeLessThanOrEqual(shortDimensions.clientHeight + 1);
        expect(shortDimensions.overflowY).toBe('hidden');
        await prerequisites.evaluate(element => { element.scrollTop = 100; });
        expect(await prerequisites.evaluate(element => element.scrollTop)).toBe(0);
        const dimensions = await unlocks.evaluate(element => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            overflowY: getComputedStyle(element).overflowY
        }));
        expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
        expect(dimensions.overflowY).toBe('auto');
        const unlocksHeaderTop = (await unlocksColumn.locator(':scope > h3').boundingBox()).y;
        await unlocks.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect.poll(() => unlocks.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        expect((await unlocksColumn.locator(':scope > h3').boundingBox()).y).toBe(unlocksHeaderTop);
        await unlocks.evaluate(element => { element.scrollTop = 0; });
        const selectedTop = (await page.locator('.curriculum-selected-item').boundingBox()).y;
        const prerequisiteTop = (await page.locator('.curriculum-neighborhood-column.is-prerequisites .curriculum-explorer-item').first().boundingBox()).y;
        const unlockTop = (await page.locator('.curriculum-neighborhood-column.is-unlocks .curriculum-explorer-item').first().boundingBox()).y;
        expect(Math.abs(selectedTop - prerequisiteTop)).toBeLessThan(2);
        expect(Math.abs(selectedTop - unlockTop)).toBeLessThan(2);
    }
    const firstFocusedDeck = await page.locator('.curriculum-selected-item h2').textContent();
    const firstFocusedId = await page.locator('.curriculum-selected-item').getAttribute('data-curriculum-node-id');
    await page.locator('.curriculum-breadcrumb').getByRole('button', { name: 'physics', exact: true }).click();
    await expect(page.locator('.curriculum-graph-stage.is-layered')).toBeVisible();
    if (testInfo.project.name === 'desktop-chromium') {
        await expect.poll(() => page.locator('.curriculum-graph-stage').evaluate((stage, deckId) => {
            const stageRect = stage.getBoundingClientRect();
            const anchorRect = [...stage.querySelectorAll('.curriculum-graph-node')]
                .find(node => node.dataset.deckId === deckId).getBoundingClientRect();
            return Math.abs(anchorRect.top + anchorRect.height / 2
                - (stageRect.top + stage.clientHeight / 2));
        }, firstFocusedId)).toBeLessThan(30);
    }
    await historyBack.click();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(firstFocusedDeck);
    await page.locator('.curriculum-neighborhood-column.is-prerequisites .curriculum-explorer-item').first().click();
    await expect(page.locator('.curriculum-selected-item h2')).not.toHaveText(firstFocusedDeck);
    const secondFocusedDeck = await page.locator('.curriculum-selected-item h2').textContent();
    await expect(historyBack).toBeEnabled();
    await expect(historyForward).toBeDisabled();
    await page.reload();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(secondFocusedDeck);
    await expect(historyBack).toBeEnabled();
    await historyBack.click();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(firstFocusedDeck);
    await expect(historyForward).toBeEnabled();
    await historyForward.click();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(secondFocusedDeck);
    await historyBack.click();
    await expect(page.locator('.curriculum-selected-item h2')).toHaveText(firstFocusedDeck);

    await page.locator('.curriculum-selected-item').click();
    await expect(page.locator('.curriculum-graph-stage')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back in curriculum' })).toBeEnabled();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 1 of');
    await expect(page.locator('.curriculum-graph-node-subject').first()).toHaveText('physics');
    await expect(page.locator('.curriculum-graph-node')).toHaveCount(10);

    await historyBack.click();
    await expect(page.locator('.curriculum-selected-kind')).toHaveText('deck');
    await historyBack.click();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 1 of');
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
    await expect(page.locator('.curriculum-selected-item')).toHaveClass(/is-unavailable/);
    await expect(page.locator('.curriculum-selected-item')).not.toHaveClass(/is-learning/);
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

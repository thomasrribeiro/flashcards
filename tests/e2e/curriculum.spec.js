import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const bundledCurriculum = JSON.parse(readFileSync(
    new URL('../../public/data/curriculum.json', import.meta.url),
    'utf8'
));

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tab-curriculum')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-curriculum').click();
    await expect(page.locator('.curriculum-breadcrumb')).toBeVisible();
    await expect(page.locator('.curriculum-breadcrumb-row > .curriculum-breadcrumb')).toHaveCount(1);
    await expect(page.locator('.curriculum-breadcrumb').getByRole('button', {
        name: 'thomasrribeiro-flashcards/curricula', exact: true
    })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Recommended paths', { exact: true })).toHaveCount(0);
    await expect(page.locator('.curriculum-toolbar').getByRole('button', { name: 'Sources' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create subject' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create subject' })).toBeDisabled();
    const breadcrumbControlOrder = await page.locator('.curriculum-breadcrumb-row').evaluate(row => (
        [...row.children].map(child => child.className)
    ));
    expect(breadcrumbControlOrder).toEqual([
        'curriculum-breadcrumb',
        'curriculum-history-controls',
        'curriculum-breadcrumb-actions'
    ]);
    const [backBox, createBox] = await Promise.all([
        page.getByRole('button', { name: 'Back in curriculum' }).boundingBox(),
        page.getByRole('button', { name: 'Create subject' }).boundingBox()
    ]);
    expect(Math.abs(backBox.height - createBox.height)).toBeLessThan(1);
});

test('updates the root breadcrumb when the curriculum repository setting changes', async ({ page }) => {
    const commit = '1234567890abcdef1234567890abcdef12345678';
    await page.route('https://api.github.com/repos/example/new-curricula/commits/master', route => (
        route.fulfill({ json: { sha: commit } })
    ));
    await page.route('https://raw.githubusercontent.com/example/new-curricula/**', route => (
        route.fulfill({ json: {
            ...bundledCurriculum,
            registry: {
                ...bundledCurriculum.registry,
                id: 'example-new-curricula',
                name: 'Example curricula',
                repository: 'example/new-curricula',
                ref: 'master'
            }
        } })
    ));

    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('tab', { name: 'Curriculum' }).click();
    await settings.getByLabel('Curriculum source repository 1').fill('example/new-curricula');
    await settings.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('.curriculum-breadcrumb').getByRole('button', {
        name: 'example/new-curricula', exact: true
    })).toHaveAttribute('aria-current', 'page');
});

test('queues a subject draft only for a signed-in account with a connected model', async ({ page }) => {
    let queuedJob = null;
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/users/ensure') return route.fulfill({ json: { success: true } });
        if (path === '/api/reviews/test-user') return route.fulfill({ json: { reviews: [] } });
        if (path === '/api/chapter-progress/test-user') return route.fulfill({ json: { chapters: [] } });
        if (path === '/api/repos/test-user') return route.fulfill({ json: { repos: [] } });
        if (path === '/api/settings/test-user') return route.fulfill({ json: { settings: {} } });
        if (path === '/api/study-session/test-user') return route.fulfill({ json: { session: null } });
        if (path === '/api/habit/test-user') {
            return route.fulfill({ json: {
                streak: 0,
                today: { reviews: 0, newCards: 0, xp: 0, goalMet: false },
                totalXp: 0,
                settings: {}
            } });
        }
        if (path === '/api/ai/providers') {
            return route.fulfill({ json: { providers: [{
                id: 'openai', connected: true, status: 'connected', keyHint: '••••test'
            }] } });
        }
        if (path === '/api/generation-requests' && request.method() === 'POST') {
            queuedJob = request.postDataJSON();
            return route.fulfill({ json: { request: { id: 'request-123' } } });
        }
        return route.fulfill({ json: {} });
    });
    await page.addInitScript(() => {
        localStorage.setItem('github_user', JSON.stringify({
            id: 'test-user', username: 'test-user', name: 'Test User'
        }));
        localStorage.setItem('github_token', 'test-token');
        localStorage.setItem('flashcards_generation_preferences_v1', JSON.stringify({
            providerId: 'openai', modelId: 'gpt-test', reasoningEffort: 'high'
        }));
    });
    await page.reload();
    await expect(page.locator('#tab-curriculum')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-curriculum').click();
    const create = page.getByRole('button', { name: 'Create subject' });
    await expect(create).toBeEnabled();
    await create.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('thomasrribeiro-flashcards/curricula');
    await expect(dialog.getByLabel('Local provider')).toHaveCount(0);
    await dialog.getByLabel('Subject slug').fill('earth-science');
    await dialog.getByLabel('Title').fill('Earth Science');
    await dialog.getByRole('button', { name: 'Queue AI draft' }).click();
    await expect(dialog.getByRole('heading', { name: 'Draft queued' })).toBeVisible();
    expect(queuedJob).toMatchObject({
        jobType: 'subject-design',
        registryId: 'thomas-ribeiro',
        targetRepository: 'thomasrribeiro-flashcards/curricula',
        providerId: 'openai',
        modelId: 'gpt-test',
        payload: {
            subject: 'earth-science',
            title: 'Earth Science',
            destination: 'whole-field',
            deckGranularity: 'course',
            reasoningEffort: 'high'
        }
    });
    expect(JSON.stringify(queuedJob)).not.toMatch(/api.?key|secret/i);
});

test('navigates subject graph, ranked deck layers, deck neighborhood, and chapter layers', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'desktop-chromium') {
        await page.setViewportSize({ width: 2000, height: 1100 });
    }
    const subjects = page.locator('.curriculum-graph-node');
    await expect(subjects).toHaveCount(3);
    await expect(page.locator('.curriculum-graph-stage')).toHaveClass(/is-subject-overview/);
    await expect(page.locator('.curriculum-graph-stage')).not.toHaveClass(/is-layered/);
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    expect(await page.locator('.curriculum-graph-stage').evaluate(stage => getComputedStyle(stage).overflowX))
        .toBe('hidden');
    if (testInfo.project.name === 'desktop-chromium') {
        const stage = page.locator('.curriculum-graph-stage');
        const centered = () => stage.evaluate(element => {
            const stageRect = element.getBoundingClientRect();
            const nodes = [...element.querySelectorAll('.curriculum-graph-node')]
                .map(node => node.getBoundingClientRect());
            const bounds = {
                left: Math.min(...nodes.map(node => node.left)),
                right: Math.max(...nodes.map(node => node.right)),
                top: Math.min(...nodes.map(node => node.top)),
                bottom: Math.max(...nodes.map(node => node.bottom))
            };
            return {
                x: Math.abs((bounds.left + bounds.right) / 2 - (stageRect.left + stageRect.right) / 2),
                y: Math.abs((bounds.top + bounds.bottom) / 2 - (stageRect.top + stageRect.bottom) / 2)
            };
        });
        await expect.poll(async () => (await centered()).x).toBeLessThan(2);
        await expect.poll(async () => (await centered()).y).toBeLessThan(2);
        const viewport = stage.locator('.curriculum-graph-viewport');
        const initialViewportBox = await viewport.boundingBox();
        const stageBox = await stage.boundingBox();
        await page.mouse.move(stageBox.x + stageBox.width - 20, stageBox.y + stageBox.height - 20);
        await page.mouse.down();
        await page.mouse.move(stageBox.x + stageBox.width - 100, stageBox.y + stageBox.height - 70);
        await page.mouse.up();
        await expect.poll(async () => {
            const moved = await viewport.boundingBox();
            return Math.hypot(moved.x - initialViewportBox.x, moved.y - initialViewportBox.y);
        }).toBeGreaterThan(80);
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
        await expect.poll(async () => (await centered()).x).toBeLessThan(2);
        await expect.poll(async () => (await centered()).y).toBeLessThan(2);
        const initialNodeWidth = (await subjects.first().boundingBox()).width;
        await page.getByRole('button', { name: 'Zoom in' }).click();
        await expect.poll(async () => (await subjects.first().boundingBox()).width)
            .toBeGreaterThan(initialNodeWidth);
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
        await expect.poll(async () => (await centered()).x).toBeLessThan(2);
        await expect.poll(async () => (await centered()).y).toBeLessThan(2);
    }
    await page.locator('.curriculum-graph-node[data-deck-id="physics"]').click();

    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 2 of');
    await expect(page.getByRole('button', { name: 'Show previous dependency layer' })).toBeDisabled();
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
        const firstLayerOffset = await page.locator('.curriculum-graph-stage').evaluate(stage => {
            const stageRect = stage.getBoundingClientRect();
            const focal = stage.querySelector('.curriculum-graph-node[data-rank="1"]')?.getBoundingClientRect();
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
                const start = Number(element.dataset.scrollRankStart);
                const end = Number(element.dataset.scrollRankEnd);
                const routeBottoms = [...element.querySelectorAll('.curriculum-graph-connection.is-long')]
                    .flatMap(connection => {
                        const source = element.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.source)}"]`);
                        const sourceRank = Number(source.dataset.rank);
                        return connection.dataset.cableYs.split(',').filter(Boolean).map((y, index) => ({
                            rank: sourceRank + index + 1,
                            y: Number(y)
                        })).filter(point => point.rank >= start && point.rank < end).map(point => point.y);
                    });
                const actualRouteBottom = Math.max(0, ...routeBottoms);
                return Math.abs(Number(element.dataset.scrollRouteBottom) - actualRouteBottom) < 1
                    && Number(element.dataset.scrollExtent) >= actualRouteBottom + 24;
            })(),
            extentUsesAllVisibleRanks: (() => {
                const start = Number(element.dataset.scrollRankStart);
                const end = Number(element.dataset.scrollRankEnd);
                const visibleBottom = Math.max(...[...element.querySelectorAll('.curriculum-graph-node[data-rank]')]
                    .filter(node => Number(node.dataset.rank) >= start && Number(node.dataset.rank) < end)
                    .map(node => Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height)));
                return Number(element.dataset.scrollExtent) >= visibleBottom + 36;
            })(),
            extentMatchesLayer: (() => {
                const focal = element.querySelector(`.curriculum-graph-node[data-rank="${element.dataset.scrollLayer}"]`);
                const scale = focal.getBoundingClientRect().width / Number.parseFloat(focal.style.width);
                const expected = Math.max(element.clientHeight, Number(element.dataset.scrollExtent) * scale);
                return Math.abs(element.scrollHeight - expected) < 3;
            })()
        }));
        expect(scrolling.hasVertical).toBe(true);
        expect(scrolling.hasHorizontalContent).toBe(true);
        expect(scrolling.overflowX).toBe('hidden');
        expect(scrolling.overflowY).toBe('scroll');
        expect(scrolling.routeExtentMatchesLayer).toBe(true);
        expect(scrolling.extentUsesAllVisibleRanks).toBe(true);
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
    const clippingCandidate = await page.locator('.curriculum-graph-stage').evaluate(stage => {
        const connections = [...stage.querySelectorAll('.curriculum-graph-connection:not(.is-cable-trunk)')];
        const trunks = [...stage.querySelectorAll('.curriculum-graph-connection.is-cable-trunk')];
        const nodeIds = [...stage.querySelectorAll('.curriculum-graph-node')].map(node => node.dataset.deckId);
        for (const nodeId of nodeIds) {
            const related = new Set([nodeId]);
            const visit = direction => {
                const pending = [nodeId];
                while (pending.length) {
                    const current = pending.pop();
                    for (const edge of connections) {
                        const from = direction === 'upstream' ? edge.dataset.target : edge.dataset.source;
                        const to = direction === 'upstream' ? edge.dataset.source : edge.dataset.target;
                        if (from !== current || related.has(to)) continue;
                        related.add(to);
                        pending.push(to);
                    }
                }
            };
            visit('upstream');
            visit('downstream');
            const clipsSharedTrunk = trunks.some(trunk => {
                const relatedBranches = connections.filter(edge =>
                    edge.dataset.cableTrunkSource === trunk.dataset.source
                    && related.has(edge.dataset.source)
                    && related.has(edge.dataset.target));
                if (!relatedBranches.length) return false;
                const cutoffX = Math.max(...relatedBranches.map(edge => Number(edge.dataset.riseX)));
                const path = trunk.querySelector('.curriculum-graph-edge');
                return cutoffX < path.getPointAtLength(path.getTotalLength()).x - 0.5;
            });
            if (clipsSharedTrunk) return nodeId;
        }
        return '';
    });
    expect(clippingCandidate).not.toBe('');
    await branchNode.dispatchEvent('pointerleave');
    const clippingNode = page.locator(`.curriculum-graph-node[data-deck-id="${clippingCandidate}"]`);
    await clippingNode.dispatchEvent('pointerenter');
    await page.waitForTimeout(500);
    const highlightedCableTrunks = await page.locator('.curriculum-graph-connection.is-cable-trunk.is-related')
        .evaluateAll(trunks => trunks.map(trunk => {
            const path = trunk.querySelector('.curriculum-graph-edge-highlight');
            const basePath = trunk.querySelector('.curriculum-graph-edge:not(.curriculum-graph-edge-highlight)');
            const cutoffX = Number(trunk.dataset.highlightCutoffX);
            const relatedBranches = [...trunk.ownerSVGElement.querySelectorAll(
                `.curriculum-graph-connection.is-long.is-related[data-cable-trunk-source="${CSS.escape(trunk.dataset.source)}"]`
            )];
            const expectedCutoffX = Math.max(-Infinity, ...relatedBranches.map(edge => Number(edge.dataset.riseX)));
            const fullEndX = path.getPointAtLength(path.getTotalLength()).x;
            const dashArray = path.style.strokeDasharray;
            return {
                hasUnrelatedTail: expectedCutoffX < fullEndX - 0.5,
                cutoffMatches: Math.abs(cutoffX - expectedCutoffX) < 0.5,
                clipped: Boolean(dashArray),
                baseRemainsComplete: basePath.getAttribute('d') === path.getAttribute('d')
                    && !basePath.style.strokeDasharray
            };
        }));
    expect(highlightedCableTrunks.some(trunk => trunk.hasUnrelatedTail)).toBe(true);
    expect(highlightedCableTrunks
        .filter(trunk => trunk.hasUnrelatedTail)
        .every(trunk => trunk.cutoffMatches && trunk.clipped && trunk.baseRemainsComplete)).toBe(true);
    await clippingNode.dispatchEvent('pointerleave');
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
        const sampledTrunks = trunks.map(trunk => {
            const path = trunk.querySelector('.curriculum-graph-edge');
            const points = [];
            for (let distance = 0; distance <= path.getTotalLength(); distance += 0.75) {
                const point = path.getPointAtLength(distance);
                points.push({ x: point.x, y: point.y });
            }
            return points;
        });
        let trunkIntersectionCount = 0;
        for (let firstIndex = 0; firstIndex < sampledTrunks.length; firstIndex += 1) {
            const bins = new Map();
            for (const point of sampledTrunks[firstIndex]) {
                const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
                const bin = bins.get(key) || [];
                bin.push(point);
                bins.set(key, bin);
            }
            for (let secondIndex = firstIndex + 1; secondIndex < sampledTrunks.length; secondIndex += 1) {
                let intersects = false;
                for (const point of sampledTrunks[secondIndex]) {
                    for (let dx = -1; dx <= 1 && !intersects; dx += 1) {
                        for (let dy = -1; dy <= 1 && !intersects; dy += 1) {
                            const nearby = bins.get(`${Math.round(point.x) + dx}:${Math.round(point.y) + dy}`) || [];
                            intersects = nearby.some(candidate =>
                                Math.hypot(candidate.x - point.x, candidate.y - point.y) < 0.6);
                        }
                    }
                    if (intersects) break;
                }
                if (intersects) trunkIntersectionCount += 1;
            }
        }
        return {
            trunkIntersectionCount,
            cableYs: longConnections.flatMap(connection =>
                connection.dataset.cableYs.split(',').filter(Boolean).map(Number)),
            pathsContainLane: longConnections.every(connection => {
                const cableYs = connection.dataset.cableYs.split(',').filter(Boolean);
                return connection.querySelector('.curriculum-graph-edge').getAttribute('d').includes(cableYs.at(-1));
            }),
            branchesJoinTrunks: longConnections.every(connection => {
                const branch = connection.querySelector('.curriculum-graph-edge');
                const join = branch.getPointAtLength(0);
                const trunk = stage.querySelector(
                    `.curriculum-graph-connection.is-cable-trunk[data-source="${CSS.escape(connection.dataset.cableTrunkSource)}"]`
                )?.querySelector('.curriculum-graph-edge:not(.curriculum-graph-edge-highlight)');
                return trunk?.isPointInStroke(new DOMPoint(join.x, join.y));
            }),
            routesBelowCrossedColumns: longConnections.every(connection => {
                const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.source)}"]`);
                const sourceRank = Number(source.dataset.rank);
                const cableYs = connection.dataset.cableYs.split(',').filter(Boolean).map(Number);
                return cableYs.every((y, index) => {
                    const rank = sourceRank + index + 1;
                    const bottoms = [...stage.querySelectorAll(`.curriculum-graph-node[data-rank="${rank}"]`)]
                        .map(node => Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height));
                    return bottoms.length && y > Math.max(...bottoms);
                });
            }),
            busesClearBothAdjacentColumns: trunks.every(trunk => {
                const rankYs = new Map(trunk.dataset.rankYs.split(',').filter(Boolean)
                    .map(pair => pair.split(':').map(Number)));
                return [...rankYs].every(([rank, y]) => {
                    const columnNodes = [...stage.querySelectorAll(
                        `.curriculum-graph-node[data-rank="${rank}"]`
                    )];
                    const columnBottom = Math.max(0, ...columnNodes.map(node =>
                        Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height)));
                    return y >= columnBottom + 18;
                });
            }),
            longTargetsUseBottomPorts: longConnections.every(connection => {
                const target = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.target)}"]`);
                const path = connection.querySelector('.curriculum-graph-edge');
                const arrowhead = connection.querySelector('.curriculum-graph-arrowhead');
                const start = path.getPointAtLength(0);
                const end = path.getPointAtLength(path.getTotalLength());
                const headBounds = arrowhead.getBBox();
                const targetLeft = Number.parseFloat(target.style.left);
                const targetWidth = Number.parseFloat(target.style.width);
                const targetBottom = Number.parseFloat(target.style.top)
                    + Number.parseFloat(target.style.height);
                const anchorX = Number(connection.dataset.riseX);
                return Math.abs(start.x - anchorX) < 0.5
                    && Math.abs(end.x - anchorX) < 0.5
                    && Math.abs(end.y - (targetBottom + 10)) < 0.5
                    && Math.abs(headBounds.x + headBounds.width / 2 - anchorX) < 0.5
                    && Math.abs(headBounds.y - targetBottom) < 0.5
                    && anchorX > targetLeft
                    && anchorX < targetLeft + targetWidth / 2;
            }),
            staggeredRises: (() => {
                const byRank = new Map();
                for (const connection of longConnections) {
                    const target = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.target)}"]`);
                    const rises = byRank.get(target.dataset.rank) || [];
                    rises.push({ x: Number(connection.dataset.riseX) });
                    byRank.set(target.dataset.rank, rises);
                }
                const sharedRanks = [...byRank.values()].filter(rises => rises.length > 1);
                return sharedRanks.length > 0 && sharedRanks.every(rises => {
                    const xs = rises.map(rise => rise.x).sort((a, b) => a - b);
                    return new Set(xs.map(value => value.toFixed(3))).size === xs.length;
                });
            })(),
            trunksAligned: trunks.every(trunk => {
                const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(trunk.dataset.source)}"]`);
                const path = trunk.querySelector('.curriculum-graph-edge');
                const start = path.getPointAtLength(0);
                const end = path.getPointAtLength(path.getTotalLength());
                const sourceLeft = Number.parseFloat(source.style.left);
                const sourceRight = Number.parseFloat(source.style.left) + Number.parseFloat(source.style.width);
                const sourceBottom = Number.parseFloat(source.style.top) + Number.parseFloat(source.style.height);
                const branches = longConnections.filter(connection => connection.dataset.source === trunk.dataset.source);
                const farthestTargetRise = Math.max(...branches.map(connection => Number(connection.dataset.riseX)));
                const joinsFinalBranch = branches.some(connection => {
                    const branch = connection.querySelector('.curriculum-graph-edge');
                    const branchJoin = branch.getPointAtLength(0);
                    return Math.abs(branchJoin.x - end.x) < 0.5 && Math.abs(branchJoin.y - end.y) < 0.5;
                });
                return Math.abs(start.x - Number(trunk.dataset.descentX)) < 0.5
                    && Math.abs(start.y - sourceBottom) < 0.5
                    && start.x > sourceLeft
                    && start.x < sourceRight
                    && Number(trunk.dataset.descentX) < sourceRight
                    && sourceRight - Number(trunk.dataset.descentX) <= 32
                    && path.getAttribute('d').split(' C ').length === 2
                    && path.getAttribute('d').includes(' V ')
                    && Math.abs(end.x - farthestTargetRise) < 0.5
                    && joinsFinalBranch;
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
                    && sharedRanks.every(descents => {
                        const ordered = [...descents].sort((a, b) => a - b);
                        const gaps = ordered.slice(1).map((value, index) => value - ordered[index]);
                        return new Set(ordered.map(value => value.toFixed(3))).size === ordered.length
                            && gaps.every(gap => Math.abs(gap - 4) < 0.01);
                    });
            })(),
            receivingLanesAreDistinct: (() => {
                const byRank = new Map();
                for (const connection of longConnections) {
                    const target = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.target)}"]`);
                    const lanes = byRank.get(Number(target.dataset.rank)) || [];
                    lanes.push(Number(connection.dataset.riseX));
                    byRank.set(Number(target.dataset.rank), lanes);
                }
                for (const trunk of trunks) {
                    const rankYs = new Map(trunk.dataset.rankYs.split(',').filter(Boolean)
                        .map(pair => pair.split(':').map(Number)));
                    for (const pair of trunk.dataset.transitionXs.split(',').filter(Boolean)) {
                        const [rank, x] = pair.split(':').map(Number);
                        if (rankYs.get(rank + 1) > rankYs.get(rank)) continue;
                        const lanes = byRank.get(rank + 1) || [];
                        lanes.push(x);
                        byRank.set(rank + 1, lanes);
                    }
                }
                const sharedRanks = [...byRank.values()].filter(lanes => lanes.length > 1);
                return sharedRanks.length > 0 && sharedRanks.every(lanes => {
                    const ordered = lanes.sort((a, b) => a - b);
                    return new Set(ordered.map(value => value.toFixed(3))).size === ordered.length;
                });
            })(),
            transitionsUseDirectionalColumnEdges: trunks.every(trunk => {
                const rankYs = new Map(trunk.dataset.rankYs.split(',').filter(Boolean)
                    .map(pair => pair.split(':').map(Number)));
                return trunk.dataset.transitionXs.split(',').filter(Boolean).every(pair => {
                    const [rank, x] = pair.split(':').map(Number);
                    const currentNodes = [...stage.querySelectorAll(`.curriculum-graph-node[data-rank="${rank}"]`)];
                    const nextNodes = [...stage.querySelectorAll(`.curriculum-graph-node[data-rank="${rank + 1}"]`)];
                    const currentLeft = Math.min(...currentNodes.map(node => Number.parseFloat(node.style.left)));
                    const currentRight = Math.max(...currentNodes.map(node =>
                        Number.parseFloat(node.style.left) + Number.parseFloat(node.style.width)));
                    const nextLeft = Math.min(...nextNodes.map(node => Number.parseFloat(node.style.left)));
                    const rises = rankYs.get(rank + 1) < rankYs.get(rank);
                    return rises
                        ? x >= nextLeft && x < nextLeft + Number.parseFloat(nextNodes[0].style.width)
                        : x > currentLeft && x <= currentRight;
                });
            }),
            persistentAgeStack: (() => {
                const sourceAge = trunk => {
                    const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(trunk.dataset.source)}"]`);
                    return [Number(source.dataset.rank), Number.parseFloat(source.style.top), trunk.dataset.source];
                };
                const compareAge = (first, second) => first[0] - second[0]
                    || first[1] - second[1]
                    || first[2].localeCompare(second[2]);
                const ranks = new Set(trunks.flatMap(trunk => trunk.dataset.rankYs.split(',')
                    .filter(Boolean).map(pair => Number(pair.split(':')[0]))));
                return [...ranks].every(rank => {
                    const active = trunks.map(trunk => ({
                        trunk,
                        y: new Map(trunk.dataset.rankYs.split(',').filter(Boolean)
                            .map(pair => pair.split(':').map(Number))).get(rank)
                    })).filter(entry => Number.isFinite(entry.y))
                        .sort((a, b) => compareAge(sourceAge(a.trunk), sourceAge(b.trunk)));
                    return active.every((entry, index) => !index || entry.y < active[index - 1].y);
                });
            })(),
            oldestFallsFirst: (() => {
                const byRank = new Map();
                for (const trunk of trunks) {
                    const rankYs = new Map(trunk.dataset.rankYs.split(',').filter(Boolean)
                        .map(pair => pair.split(':').map(Number)));
                    const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(trunk.dataset.source)}"]`);
                    for (const pair of trunk.dataset.transitionXs.split(',').filter(Boolean)) {
                        const [rank, x] = pair.split(':').map(Number);
                        if (rankYs.get(rank + 1) <= rankYs.get(rank)) continue;
                        const entries = byRank.get(rank) || [];
                        entries.push({
                            x,
                            age: [Number(source.dataset.rank), Number.parseFloat(source.style.top), trunk.dataset.source]
                        });
                        byRank.set(rank, entries);
                    }
                }
                const fallingBoundaries = [...byRank.values()].filter(entries => entries.length > 1);
                return fallingBoundaries.length > 0 && fallingBoundaries.every(entries => {
                    const oldestFirst = [...entries].sort((a, b) => a.age[0] - b.age[0]
                        || a.age[1] - b.age[1]
                        || a.age[2].localeCompare(b.age[2]));
                    return oldestFirst.every((entry, index) => !index || entry.x > oldestFirst[index - 1].x);
                });
            })(),
            higherSourcesOwnOlderLanes: (() => {
                const byRank = new Map();
                for (const trunk of trunks) {
                    const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(trunk.dataset.source)}"]`);
                    const peers = byRank.get(Number(source.dataset.rank)) || [];
                    const firstTrack = Number(trunk.dataset.rankYs.split(',').filter(Boolean)[0].split(':')[1]);
                    peers.push({
                        sourceTop: Number.parseFloat(source.style.top),
                        descentX: Number(trunk.dataset.descentX),
                        firstTrack
                    });
                    byRank.set(Number(source.dataset.rank), peers);
                }
                const sharedRanks = [...byRank.values()].filter(peers => peers.length > 1);
                return sharedRanks.length > 0 && sharedRanks.every(peers => {
                    const topToBottom = [...peers].sort((a, b) => a.sourceTop - b.sourceTop);
                    return topToBottom.every((entry, index) => !index
                        || (entry.descentX > topToBottom[index - 1].descentX
                            && entry.firstTrack < topToBottom[index - 1].firstTrack));
                });
            })(),
            evenlySpacedTrunks: (() => {
                const byRank = new Map();
                for (const trunk of trunks) {
                    for (const pair of trunk.dataset.rankYs.split(',').filter(Boolean)) {
                        const [rank, y] = pair.split(':').map(Number);
                        const tracks = byRank.get(rank) || [];
                        tracks.push(y);
                        byRank.set(rank, tracks);
                    }
                }
                const sharedRanks = [...byRank.values()].filter(tracks => tracks.length > 1);
                return sharedRanks.length > 0 && sharedRanks.every(tracks => {
                    const ordered = tracks.sort((a, b) => a - b);
                    const gaps = ordered.slice(1).map((value, index) => value - ordered[index]);
                    return gaps.every(gap => Math.abs(gap - 4) < 0.01);
                });
            })(),
            trunksClearColumnsCompactly: (() => {
                const byRank = new Map();
                for (const trunk of trunks) {
                    for (const pair of trunk.dataset.rankYs.split(',').filter(Boolean)) {
                        const [rank, y] = pair.split(':').map(Number);
                        const tracks = byRank.get(rank) || [];
                        tracks.push(y);
                        byRank.set(rank, tracks);
                    }
                }
                return [...byRank].every(([rank, tracks]) => {
                    const bottoms = [...stage.querySelectorAll(
                        `.curriculum-graph-node[data-rank="${rank}"]`
                    )]
                        .map(node => Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height));
                    return bottoms.length && Math.min(...tracks) >= Math.max(...bottoms) + 18;
                });
            })(),
            snakingTrunkCount: trunks.filter(trunk => new Set(trunk.dataset.rankYs.split(',')
                .filter(Boolean)
                .map(pair => Number(pair.split(':')[1]).toFixed(3))).size > 1).length,
            mixedSourceCount: trunks.filter(trunk =>
                [...stage.querySelectorAll('.curriculum-graph-connection.is-primary')]
                    .some(connection => connection.dataset.source === trunk.dataset.source)).length,
            soloBusCount: trunks.filter(trunk =>
                ![...stage.querySelectorAll('.curriculum-graph-connection.is-primary')]
                    .some(connection => connection.dataset.source === trunk.dataset.source)).length,
            soloBusesStartAtBottom: trunks.every(trunk => {
                const hasDirectConnection = [...stage.querySelectorAll('.curriculum-graph-connection.is-primary')]
                    .some(connection => connection.dataset.source === trunk.dataset.source);
                if (hasDirectConnection) return true;
                const source = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(trunk.dataset.source)}"]`);
                const sourceBottom = Number.parseFloat(source.style.top) + Number.parseFloat(source.style.height);
                const trunkStart = trunk.querySelector('.curriculum-graph-edge').getPointAtLength(0);
                return Math.abs(trunkStart.y - sourceBottom) < 0.5;
            }),
            busLeavesLast: trunks.every(trunk => {
                const directConnections = [...stage.querySelectorAll('.curriculum-graph-connection.is-primary')]
                    .filter(connection => connection.dataset.source === trunk.dataset.source);
                if (!directConnections.length) return true;
                const trunkStart = trunk.querySelector('.curriculum-graph-edge').getPointAtLength(0);
                return directConnections.every(connection => {
                    const directStart = connection.querySelector('.curriculum-graph-edge').getPointAtLength(0);
                    return directStart.y < trunkStart.y;
                });
            }),
            oneTrunkPerSource: trunks.length === new Set(trunks.map(trunk => trunk.dataset.source)).size
                && trunks.every(trunk => longEdgesBySource.has(trunk.dataset.source)),
            sharedSourceCount: [...longEdgesBySource.values()].filter(edges => edges.length > 1).length,
            sharedEdgesUseTrunkLane: [...longEdgesBySource.entries()].every(([source, edges]) => {
                const trunk = trunks.find(item => item.dataset.source === source);
                if (!trunk) return false;
                const trunkRankYs = new Map(trunk.dataset.rankYs.split(',').filter(Boolean)
                    .map(pair => pair.split(':').map(Number)));
                return edges.every(edge => {
                    const sourceNode = stage.querySelector(`.curriculum-graph-node[data-deck-id="${CSS.escape(edge.dataset.source)}"]`);
                    return edge.dataset.cableYs.split(',').filter(Boolean).every((y, index) =>
                        Math.abs(Number(y) - trunkRankYs.get(Number(sourceNode.dataset.rank) + index + 1)) < 0.5);
                });
            }),
            directCableCount: stage.querySelectorAll('.curriculum-graph-connection.is-primary[data-cable-ys]').length
        };
    });
    expect(cableRouting.cableYs.length).toBeGreaterThan(0);
    expect(cableRouting.trunkIntersectionCount).toBe(0);
    expect(cableRouting.routesBelowCrossedColumns).toBe(true);
    expect(cableRouting.busesClearBothAdjacentColumns).toBe(true);
    expect(cableRouting.longTargetsUseBottomPorts).toBe(true);
    expect(cableRouting.staggeredRises).toBe(true);
    expect(cableRouting.trunksAligned).toBe(true);
    expect(cableRouting.staggeredDescents).toBe(true);
    expect(cableRouting.receivingLanesAreDistinct).toBe(true);
    expect(cableRouting.transitionsUseDirectionalColumnEdges).toBe(true);
    expect(cableRouting.persistentAgeStack).toBe(true);
    expect(cableRouting.oldestFallsFirst).toBe(true);
    expect(cableRouting.higherSourcesOwnOlderLanes).toBe(true);
    expect(cableRouting.evenlySpacedTrunks).toBe(true);
    expect(cableRouting.trunksClearColumnsCompactly).toBe(true);
    expect(cableRouting.snakingTrunkCount).toBeGreaterThan(0);
    expect(cableRouting.mixedSourceCount).toBeGreaterThan(0);
    expect(cableRouting.soloBusCount).toBeGreaterThan(0);
    expect(cableRouting.soloBusesStartAtBottom).toBe(true);
    expect(cableRouting.busLeavesLast).toBe(true);
    expect(cableRouting.oneTrunkPerSource).toBe(true);
    expect(cableRouting.sharedSourceCount).toBeGreaterThan(0);
    expect(cableRouting.sharedEdgesUseTrunkLane).toBe(true);
    expect(cableRouting.pathsContainLane).toBe(true);
    expect(cableRouting.branchesJoinTrunks).toBe(true);
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
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 3 of');
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
            const layerCount = Number(document.querySelector('.curriculum-layer-label').textContent.split(' of ')[1]);
            const bottoms = new Map();
            for (const node of stage.querySelectorAll('.curriculum-graph-node[data-rank]')) {
                const rank = Number(node.dataset.rank);
                if (rank < 1 || rank > layerCount - 2) continue;
                const bottom = Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height);
                bottoms.set(rank, Math.max(bottoms.get(rank) || 0, bottom));
            }
            return [...bottoms.entries()].sort((a, b) => b[1] - a[1])[0][0];
        });
        let currentRank = 2;
        while (currentRank < tallRank) {
            await page.getByRole('button', { name: 'Show next dependency layer' }).click();
            currentRank += 1;
        }
        while (currentRank > tallRank) {
            await page.getByRole('button', { name: 'Show previous dependency layer' }).click();
            currentRank -= 1;
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
    } else {
        await page.getByRole('button', { name: 'Show previous dependency layer' }).click();
    }
    await expect(page.locator('.curriculum-graph-node')).toHaveCount(completeDeckGraphCount);
    await expect(page).toHaveURL(/curriculum-layer=1/);
    await expect(page.getByRole('button', { name: 'Show previous dependency layer' })).toBeDisabled();
    await page.reload();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 2 of');
    const layerCount = Number((await page.locator('.curriculum-layer-label').textContent()).split(' of ')[1]);
    for (let layer = 2; layer < layerCount - 1; layer += 1) {
        await page.getByRole('button', { name: 'Show next dependency layer' }).click();
    }
    await expect(page.locator('.curriculum-layer-label')).toHaveText(`Layer ${layerCount - 1} of ${layerCount}`);
    await expect(page.getByRole('button', { name: 'Show next dependency layer' })).toBeDisabled();
    if (testInfo.project.name === 'desktop-chromium') {
        const lastLayerOffset = await page.locator('.curriculum-graph-stage').evaluate((stage, rank) => {
            const stageRect = stage.getBoundingClientRect();
            const focal = stage.querySelector(`.curriculum-graph-node[data-rank="${rank}"]`)?.getBoundingClientRect();
            const viewportCenter = stageRect.left + stage.clientLeft + stage.clientWidth / 2;
            return Math.abs((focal.left + focal.width / 2) - viewportCenter);
        }, layerCount - 2);
        expect(lastLayerOffset).toBeLessThan(2);
    }
    for (let layer = layerCount - 1; layer > 2; layer -= 1) {
        await page.getByRole('button', { name: 'Show previous dependency layer' }).click();
    }
    await expect(page.locator('.curriculum-layer-label')).toHaveText(`Layer 2 of ${layerCount}`);

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
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 2 of');
    await expect(page.locator('.curriculum-graph-node-subject').first()).toHaveText('physics');
    await expect(page.locator('.curriculum-graph-node')).toHaveCount(10);

    await historyBack.click();
    await expect(page.locator('.curriculum-selected-kind')).toHaveText('deck');
    await historyBack.click();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 2 of');
});

test('keeps every mathematics bus branch joined to its trunk', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.locator('.curriculum-graph-node[data-deck-id="mathematics"]').click();
    await expect(page.locator('.curriculum-layer-label')).toContainText('Layer 2 of 10');

    const branchJoins = await page.locator('.curriculum-graph-stage').evaluate(stage => {
        const branches = [...stage.querySelectorAll(
            '.curriculum-graph-connection.is-long[data-cable-trunk-source]'
        )];
        const disconnected = branches.filter(connection => {
            const branch = connection.querySelector('.curriculum-graph-edge');
            const join = branch.getPointAtLength(0);
            const trunk = stage.querySelector(
                `.curriculum-graph-connection.is-cable-trunk[data-source="${CSS.escape(connection.dataset.cableTrunkSource)}"]`
            )?.querySelector('.curriculum-graph-edge:not(.curriculum-graph-edge-highlight)');
            return !trunk?.isPointInStroke(new DOMPoint(join.x, join.y));
        });
        const bottomEntries = branches.every(connection => {
            const target = stage.querySelector(
                `.curriculum-graph-node[data-deck-id="${CSS.escape(connection.dataset.target)}"]`
            );
            const path = connection.querySelector('.curriculum-graph-edge');
            const arrowhead = connection.querySelector('.curriculum-graph-arrowhead');
            const end = path.getPointAtLength(path.getTotalLength());
            const headBounds = arrowhead.getBBox();
            const targetLeft = Number.parseFloat(target.style.left);
            const targetWidth = Number.parseFloat(target.style.width);
            const targetBottom = Number.parseFloat(target.style.top)
                + Number.parseFloat(target.style.height);
            return Math.abs(end.x - Number(connection.dataset.riseX)) < 0.5
                && Math.abs(end.y - (targetBottom + 10)) < 0.5
                && Math.abs(headBounds.y - targetBottom) < 0.5
                && end.x > targetLeft
                && end.x < targetLeft + targetWidth / 2;
        });
        const bottomPortsAreDistinct = [...new Set(branches.map(connection => connection.dataset.target))]
            .every(targetId => {
                const xs = branches.filter(connection => connection.dataset.target === targetId)
                    .map(connection => Number(connection.dataset.riseX));
                return new Set(xs).size === xs.length;
            });
        const rankBounds = rank => {
            const nodes = [...stage.querySelectorAll(`.curriculum-graph-node[data-rank="${rank}"]`)];
            return {
                left: Math.min(...nodes.map(node => Number.parseFloat(node.style.left))),
                right: Math.max(...nodes.map(node =>
                    Number.parseFloat(node.style.left) + Number.parseFloat(node.style.width)))
            };
        };
        const transitions = [...stage.querySelectorAll('.curriculum-graph-connection.is-cable-trunk')]
            .flatMap(trunk => {
                const rankYs = new Map(trunk.dataset.rankYs.split(',').filter(Boolean)
                    .map(pair => pair.split(':').map(Number)));
                const source = stage.querySelector(
                    `.curriculum-graph-node[data-deck-id="${CSS.escape(trunk.dataset.source)}"]`
                );
                return trunk.dataset.transitionXs.split(',').filter(Boolean).map(pair => {
                    const [rank, x] = pair.split(':').map(Number);
                    return {
                        rank,
                        x,
                        rises: rankYs.get(rank + 1) < rankYs.get(rank),
                        age: [Number(source.dataset.rank), Number.parseFloat(source.style.top), trunk.dataset.source]
                    };
                });
            });
        const upward = transitions.filter(transition => transition.rank === 3 && transition.rises);
        const downward = transitions.filter(transition => transition.rank === 5 && !transition.rises);
        const newestUpward = [...upward].sort((a, b) => b.age[0] - a.age[0]
            || b.age[1] - a.age[1]
            || b.age[2].localeCompare(a.age[2]))[0];
        const newestDownward = [...downward].sort((a, b) => b.age[0] - a.age[0]
            || b.age[1] - a.age[1]
            || b.age[2].localeCompare(a.age[2]))[0];
        const upwardXs = upward.map(transition => transition.x).sort((a, b) => a - b);
        const upwardGaps = upwardXs.slice(1).map((x, index) => x - upwardXs[index]);
        return {
            total: branches.length,
            disconnected: disconnected.length,
            bottomEntries,
            bottomPortsAreDistinct,
            newestUpwardAtNextLeft: Math.abs(newestUpward.x - rankBounds(4).left) < 0.5,
            upwardLanesStayCompact: upwardGaps.every(gap => Math.abs(gap - 4) < 0.01),
            newestDownwardAtCurrentRight: Math.abs(newestDownward.x - rankBounds(5).right) < 0.5
        };
    });

    expect(branchJoins.total).toBeGreaterThan(0);
    expect(branchJoins.disconnected).toBe(0);
    expect(branchJoins.bottomEntries).toBe(true);
    expect(branchJoins.bottomPortsAreDistinct).toBe(true);
    expect(branchJoins.newestUpwardAtNextLeft).toBe(true);
    expect(branchJoins.upwardLanesStayCompact).toBe(true);
    expect(branchJoins.newestDownwardAtCurrentRight).toBe(true);
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
    await expect(form.getByText('Keys are validated by the provider')).toHaveCount(0);
    await expect(form.locator('input[type="password"]')).toHaveCount(1);
    const sectionOrder = await form.locator('#study-settings-pane-generation').evaluate(pane => (
        [...pane.children].map(element => element.textContent.trim().split('\n')[0])
    ));
    expect(sectionOrder.indexOf('Provider connections')).toBeLessThan(sectionOrder.indexOf('Generation defaults'));
    await expect(page.getByLabel('Provider', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Provider', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Provider', { exact: true })).toContainText('Connect a provider above');
    await expect(page.getByLabel('Model')).toBeDisabled();
    expect(await page.getByLabel('Model').evaluate(element => element.tagName)).toBe('SELECT');
    await expect(page.getByLabel('Reasoning effort')).toBeDisabled();
    await expect(page.getByLabel('Reasoning effort')).toHaveValue('');
    await expect(page.getByLabel('Reasoning effort')).toContainText('Choose a model first');
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
    await expect(page.getByLabel('Provider', { exact: true })).toHaveValue('');
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
    await page.getByRole('button', { name: 'thomasrribeiro-flashcards/curricula', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create subject' })).toBeDisabled();
});

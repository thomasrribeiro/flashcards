import { element, button } from './dom.js';
import { subjectOverviewGraph, subjectDeckGraph, chapterGraph, layoutCurriculumGraph, layoutCurriculumGraphElk } from '../curriculum/curriculum.js';

// This view only lays out an existing catalog; it never plans or generates one.
export function createCurriculum(root) {
    let catalog, subject = null, deck = null, revision = 0;
    async function render() {
        const current = ++revision;
        root.replaceChildren(element('p', '', 'Loading curriculum…'));
        try {
            if (!catalog) {
                const response = await fetch(`${import.meta.env.BASE_URL}data/curriculum.json`);
                if (!response.ok) throw new Error('Curriculum could not be loaded.');
                catalog = await response.json();
            }
            const graph = deck ? chapterGraph(catalog, deck) : subject
                ? subjectDeckGraph(catalog, subject) : subjectOverviewGraph(catalog);
            const layout = subject ? layoutCurriculumGraph(graph, { nodeHeight: 110 })
                : await layoutCurriculumGraphElk(graph, { direction: 'DOWN', nodeHeight: 100 });
            if (current !== revision) return;
            const controls = element('div', 'curriculum-graph-controls');
            controls.append(button('Subjects', () => { subject = null; deck = null; render(); }));
            if (subject) controls.append(button(subject, () => { deck = null; render(); }));
            if (deck) controls.append(element('span', '', catalog.decks.find(item => item.id === deck)?.deck || deck));
            const stage = element('div', 'curriculum-graph-stage');
            stage.tabIndex = 0;
            stage.setAttribute('aria-label', 'Curriculum prerequisite graph');
            const canvas = element('div', 'curriculum-graph-scroll-canvas');
            canvas.style.width = `${layout.width}px`;
            canvas.style.height = `${layout.height}px`;
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.classList.add('curriculum-graph-edges');
            svg.setAttribute('width', layout.width);
            svg.setAttribute('height', layout.height);
            svg.setAttribute('aria-hidden', 'true');
            const nodes = new Map(layout.nodes.map(node => [node.id, node]));
            for (const edge of layout.edges) {
                const source = nodes.get(edge.source), target = nodes.get(edge.target);
                if (!source || !target) continue;
                const path = document.createElementNS(ns, 'path');
                const x1 = source.x + source.width, y1 = source.y + source.height / 2;
                const x2 = target.x, y2 = target.y + target.height / 2;
                const mid = (x1 + x2) / 2;
                const sections = edge.sections || [];
                path.setAttribute('d', sections.length ? sections.map(section => {
                    const points = [section.startPoint, ...(section.bendPoints || []), section.endPoint];
                    return points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
                }).join(' ') : `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2} l-7,-4 m7,4 l-7,4`);
                path.classList.add('curriculum-graph-edge');
                svg.append(path);
            }
            canvas.append(svg);
            for (const node of layout.nodes) {
                const label = node.deck || node.title || node.id;
                const item = button('', () => {
                    if (!subject) { subject = node.id; render(); }
                    else if (!deck) { deck = node.id; render(); }
                    else details.textContent = node.description || `${label} · ${node.card_count || 0} cards in the catalog. Content is not bundled.`;
                }, 'curriculum-graph-node');
                item.append(element('span', 'curriculum-graph-node-name', label));
                item.title = node.description || label;
                Object.assign(item.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px`, height: `${node.height}px` });
                canvas.append(item);
            }
            const details = element('p', 'curriculum-details', 'Bundled curriculum · read-only');
            details.setAttribute('role', 'status');
            stage.append(canvas);
            root.replaceChildren(controls, stage, details);
            if (!graph.nodes.length) details.textContent = 'No chapters in this catalog yet.';
        } catch (error) {
            if (current !== revision) return;
            root.replaceChildren(element('p', '', error.message), button('Retry', render));
        }
    }
    return { render };
}

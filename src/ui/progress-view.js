import { element } from './dom.js';

export function renderProgress(root, cards, store) {
    const reviews = store.state.reviews;
    const panel = element('div', 'progress-summary');
    panel.append(element('h3', '', 'Your progress'));
    const counts = [
        ['Cards', cards.length],
        ['Reviewed', cards.filter(card => reviews[card.hash]).length],
        ['Due', store.queue(cards, 'due').length]
    ];
    for (const [label, count] of counts) {
        panel.append(element('p', '', `${label}: ${count}`));
    }
    panel.append(element('p', '', 'Saved in this browser.'));
    root.replaceChildren(panel);
}

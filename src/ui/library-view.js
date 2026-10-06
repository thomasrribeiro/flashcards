import { $, element, button } from './dom.js';

export function createLibrary({ store, onStudy, onChange, onError }) {
    let selection = {};
    function render(decks, query = '') {
        const term = query.trim().toLowerCase();
        const visible = decks.filter(deck => `${deck.name} ${deck.subject}`.toLowerCase().includes(term));
        const subjects = [...new Set(visible.map(deck => deck.subject))].sort();
        if (!subjects.includes(selection.subject)) selection = { subject: subjects[0] };
        const inSubject = visible.filter(deck => deck.subject === selection.subject);
        if (!inSubject.some(deck => deck.id === selection.deck)) selection.deck = inSubject[0]?.id;
        const selected = inSubject.find(deck => deck.id === selection.deck);
        const wrap = element('div', 'columns-view');
        function pane(label) {
            const pane = element('div', 'col-pane');
            pane.append(element('div', 'col-pane-label', label));
            const scroll = element('div', 'col-pane-scroll');
            pane.append(scroll); wrap.append(pane); return scroll;
        }
        function row(label, selected, action) {
            const node = button(label, action, `col-row col-select${selected ? ' selected' : ''}`);
            node.title = label;
            node.setAttribute('aria-pressed', String(Boolean(selected)));
            return node;
        }
        const subjectPane = pane('Subjects');
        subjects.forEach(subject => subjectPane.append(row(subject, subject === selection.subject, () => {
            selection = { subject }; render(decks, query);
        })));
        if (!subjects.length) subjectPane.append(element('p', 'col-empty', 'No matches'));
        const deckPane = pane('Decks');
        const stars = new Set(store.state.stars);
        inSubject.forEach(deck => {
            const line = element('div', 'col-row');
            const starred = stars.has(deck.id);
            const star = button(starred ? '★' : '☆', () => {
                try { store.toggleStar(deck.id); onChange(); } catch (error) { onError(error); }
            }, `col-star${starred ? ' active' : ''}`);
            star.setAttribute('aria-label', `${starred ? 'Unstar' : 'Star'} ${deck.name}`);
            star.setAttribute('aria-pressed', String(starred));
            line.append(star, row(deck.name, deck.id === selection.deck, () => {
                selection.deck = deck.id; render(decks, query);
            }));
            deckPane.append(line);
        });
        const chapterPane = pane('Chapters');
        if (selected) chapterPane.append(row(`${selected.name} (${selected.cards.length})`, false,
            () => onStudy(store.queue(selected.cards), selected.name)));
        $('topics-grid').replaceChildren(wrap);
    }
    return { render };
}

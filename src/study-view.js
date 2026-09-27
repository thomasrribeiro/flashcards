import { $, message } from './dom.js';
import { renderCardFront, renderCardBack, setCardContext, parseSolutionSteps, renderSolutionStep } from './markdown.js';

export function createStudy({ store, onExit }) {
    let cards = [], index = 0, revealed = false, active = false;
    function showCard() {
        revealed = false;
        const complete = index >= cards.length;
        $('study-area').classList.toggle('hidden', complete);
        $('session-complete').classList.toggle('hidden', !complete);
        if (complete) { $('session-back-home').focus(); return; }
        const card = cards[index];
        setCardContext(card);
        $('card-front').innerHTML = renderCardFront(card);
        $('card-back').innerHTML = card.type === 'problem'
            ? parseSolutionSteps(card.content.solution).map(renderSolutionStep).join('')
            : renderCardBack(card);
        $('card-back').classList.add('hidden');
        $('grade-buttons').classList.add('hidden');
        $('reveal-prompt').classList.remove('hidden');
        const percent = Math.round(index / cards.length * 100);
        $('study-progress-fill').style.width = `${percent}%`;
        $('study-progress-percent').textContent = `${percent}% (${index}/${cards.length})`;
        $('reveal-btn').focus();
    }
    function reveal() {
        if (!active || !cards[index]) return;
        revealed = true;
        $('card-back').classList.remove('hidden');
        $('grade-buttons').classList.remove('hidden');
        $('reveal-prompt').classList.add('hidden');
        document.querySelector('[data-grade="3"]').focus();
    }
    function grade(rating) {
        if (!active || !revealed || !cards[index]) return;
        try { store.grade(cards[index], rating); index++; showCard(); }
        catch { message('Progress could not be saved. Free browser storage and try again.'); }
    }
    function exit() {
        active = false;
        $('study-area').classList.add('hidden');
        $('session-complete').classList.add('hidden');
        onExit();
    }
    $('reveal-btn').addEventListener('click', reveal);
    $('study-exit').addEventListener('click', exit);
    $('session-back-home').addEventListener('click', exit);
    document.querySelectorAll('[data-grade]').forEach(node => node.addEventListener('click', () => grade(Number(node.dataset.grade))));
    document.addEventListener('keydown', event => {
        if (!active || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable || $('settings-dialog').open) return;
        if (event.code === 'Space') {
            event.preventDefault();
            if (index >= cards.length) exit(); else if (!revealed) reveal();
        } else if (['1', '2', '3', '4'].includes(event.key)) {
            event.preventDefault(); grade(Number(event.key));
        } else if (event.key === 'Escape') exit();
    });
    return {
        start(queue, title) {
            if (!queue.length) { message('No cards ready to study.'); return; }
            message(); cards = queue; index = 0; active = true;
            $('library-view').classList.add('hidden');
            $('study-breadcrumb').textContent = title;
            showCard();
        },
        exit
    };
}

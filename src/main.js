import 'katex/dist/katex.min.css';
import { $, message } from './ui/dom.js';
import { createLocalStore } from './storage/local-store.js';
import { loadExamples, readDeck } from './cards/deck-loader.js';
import { createLibrary } from './ui/library-view.js';
import { createStudy } from './ui/study-view.js';
import { createCurriculum } from './ui/curriculum-view.js';
import { setupShell } from './ui/shell.js';
import { renderProgress } from './ui/progress-view.js';

async function init() {
    setupShell();
    let store;
    try { store = createLocalStore(localStorage); }
    catch { message('Local storage is unavailable or unreadable. Enable browser storage and reload.'); $('topics-grid').replaceChildren(); return; }
    let decks = [], view = 'study';
    const allCards = () => decks.flatMap(deck => deck.cards);
    const focusedCards = () => {
        const stars = new Set(store.state.stars);
        return decks.filter(deck => stars.has(deck.id)).flatMap(deck => deck.cards);
    };
    const study = createStudy({ store, onExit: () => showView('study') });
    const library = createLibrary({ store, onStudy: (cards, title) => study.start(cards, title), onChange: renderLibrary, onError: error => message(error.message) });
    const curriculum = createCurriculum($('curriculum-view'));
    function renderLibrary() {
        library.render(decks, $('search-input').value);
        const cards = focusedCards();
        for (const [id, mode] of [['review-due-btn', 'due'], ['learn-new-btn', 'new']]) {
            const count = store.queue(cards, mode).length;
            $(id).disabled = !count;
            $(id).textContent = `${mode === 'due' ? 'Review' : 'Learn'}${count ? ` (${count})` : ''}`;
        }
    }
    function showView(next) {
        view = next;
        $('study-area').classList.add('hidden');
        $('session-complete').classList.add('hidden');
        for (const [name, id] of [['study', 'library-view'], ['curriculum', 'curriculum-view'], ['progress', 'dashboard']]) {
            $(id).classList.toggle('hidden', name !== view);
        }
        document.querySelectorAll('[data-view]').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === view);
            tab.setAttribute('aria-current', tab.dataset.view === view ? 'page' : 'false');
        });
        if (view === 'study') renderLibrary();
        if (view === 'curriculum') curriculum.render();
        if (view === 'progress') renderProgress($('dashboard'), allCards(), store);
    }
    document.querySelectorAll('[data-view]').forEach(tab => tab.addEventListener('click', () => { study.exit(); showView(tab.dataset.view); }));
    $('search-input').addEventListener('input', renderLibrary);
    $('review-due-btn').addEventListener('click', () => study.start(store.queue(focusedCards(), 'due'), 'Review'));
    $('learn-new-btn').addEventListener('click', () => study.start(store.queue(focusedCards(), 'new'), 'Learn'));
    $('study-settings-btn').addEventListener('click', () => {
        $('daily-new-target').value = store.state.dailyTarget;
        $('settings-dialog').showModal();
    });
    $('settings-dialog').querySelector('form').addEventListener('submit', event => {
        try { store.setTarget(Number($('daily-new-target').value)); renderLibrary(); }
        catch (error) { event.preventDefault(); message(error.message); }
    });
    $('import-deck').addEventListener('change', async event => {
        try {
            const imported = await Promise.all([...event.target.files].map(async file => {
                const markdown = await file.text();
                const id = `import/${file.name}`;
                readDeck(markdown, file.name, id); // Validate the whole batch before saving it.
                return { id, file: file.name, markdown };
            }));
            store.importDecks(imported);
            restoreImports(); renderLibrary(); message(`Imported ${imported.length} file(s).`);
        } catch (error) { message(error.message); }
        event.target.value = '';
    });
    function restoreImports() {
        decks = decks.filter(deck => !deck.id.startsWith('import/'));
        decks.push(...store.state.imports.map(item => readDeck(item.markdown, item.file, item.id)));
    }
    try {
        const examples = await loadExamples();
        decks = examples.decks;
        if (examples.errors.length) message(examples.errors.join(' '));
    } catch (error) { message(error.message); }
    try { restoreImports(); } catch (error) { message(error.message); }
    renderLibrary();
}
init().catch(error => message(error.message));

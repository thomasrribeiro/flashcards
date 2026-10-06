import { $ } from './dom.js';

export function setupShell() {
    const theme = $('theme-toggle');
    function updateTheme() {
        const dark = document.documentElement.dataset.theme === 'dark';
        theme.setAttribute('aria-pressed', String(dark));
        theme.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
        theme.title = theme.getAttribute('aria-label');
    }
    theme.addEventListener('click', () => {
        const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = value;
        document.documentElement.style.colorScheme = value;
        try { localStorage.setItem('flashcards_theme', value); } catch { /* theme still works for this visit */ }
        updateTheme();
    });
    updateTheme();
    const toggleSidebar = open => {
        document.body.classList.toggle('mobile-sidebar-expanded', open);
        $('mobile-sidebar-open').setAttribute('aria-expanded', String(open));
        (open ? $('mobile-sidebar-close') : $('mobile-sidebar-open')).focus();
    };
    $('mobile-sidebar-open').addEventListener('click', () => toggleSidebar(true));
    $('mobile-sidebar-close').addEventListener('click', () => toggleSidebar(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('mobile-sidebar-expanded')) toggleSidebar(false); });
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.tabIndex = 0;
        header.setAttribute('role', 'button');
        const content = $(`${header.dataset.section}-content`);
        header.setAttribute('aria-expanded', String(!content.classList.contains('hidden')));
        const toggle = () => {
            content.classList.toggle('hidden');
            header.setAttribute('aria-expanded', String(!content.classList.contains('hidden')));
        };
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(); } });
    });
}

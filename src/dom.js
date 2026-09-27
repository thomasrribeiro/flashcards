export const $ = id => document.getElementById(id);
export function element(tag, className = '', text = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}
export function button(label, onClick, className = '') {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
}
export function message(text = '') { $('app-message').textContent = text; }

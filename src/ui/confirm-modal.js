/**
 * Custom confirm modal — replaces window.confirm() which Chrome
 * suppresses when it decides a dialog wasn't triggered by a "real"
 * user gesture (e.g., focus shifts after a click, nested click
 * handlers). Returns a Promise<boolean>.
 */

let modal = null;

function ensureModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content confirm-modal-content">
            <div class="modal-header">
                <h3 id="confirm-modal-title">Confirm</h3>
            </div>
            <div class="modal-body">
                <p id="confirm-modal-message" class="confirm-modal-message"></p>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" id="confirm-modal-cancel">Cancel</button>
                <button class="btn-primary" id="confirm-modal-ok">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

export function confirmDialog({
    title = 'Confirm',
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    danger = false,
} = {}) {
    const m = ensureModal();
    m.querySelector('#confirm-modal-title').textContent = title;
    m.querySelector('#confirm-modal-message').textContent = message;

    const okBtn = m.querySelector('#confirm-modal-ok');
    const cancelBtn = m.querySelector('#confirm-modal-cancel');
    const overlay = m.querySelector('.modal-overlay');

    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    okBtn.classList.toggle('btn-danger', danger);

    m.classList.remove('hidden');
    okBtn.focus();

    return new Promise((resolve) => {
        const cleanup = (result) => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKey);
            m.classList.add('hidden');
            resolve(result);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup(false);
            else if (e.key === 'Enter') cleanup(true);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);
    });
}

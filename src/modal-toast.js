/**
 * Modal & Toast System Module
 * Provides generic modal open/close transitions and glassmorphic Toast / Alert / Confirm dialogs.
 */
export function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el._closeTimeout) {
        clearTimeout(el._closeTimeout);
        el._closeTimeout = null;
    }
    el.style.display = 'flex';
    setTimeout(() => {
        el.classList.add('modal-active');
    }, 10);
}

export function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('modal-active');
    if (el._closeTimeout) clearTimeout(el._closeTimeout);
    el._closeTimeout = setTimeout(() => {
        el.style.display = 'none';
        el._closeTimeout = null;
    }, 300);
}

export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-lg border backdrop-blur-md transition-all duration-300 translate-y-2 opacity-0 max-w-sm pointer-events-auto w-[90%] md:w-auto`;

    let iconName = 'info';
    let bgClass = 'bg-white/90 dark:bg-slate-900/90 border-gray-200/50 dark:border-slate-800/80 text-gray-700 dark:text-gray-200';
    if (type === 'success') {
        iconName = 'check-circle';
        bgClass = 'bg-emerald-50/90 dark:bg-emerald-950/90 border-emerald-200/50 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-200';
    } else if (type === 'error') {
        iconName = 'alert-triangle';
        bgClass = 'bg-rose-50/90 dark:bg-rose-950/90 border-rose-200/50 dark:border-rose-800/30 text-rose-800 dark:text-rose-200';
    } else if (type === 'warning') {
        iconName = 'alert-circle';
        bgClass = 'bg-amber-50/90 dark:bg-amber-950/90 border-amber-200/50 dark:border-amber-800/30 text-amber-800 dark:text-amber-200';
    }

    toast.className += ` ${bgClass}`;
    toast.innerHTML = `
        <div class="flex-shrink-0">
            <i data-lucide="${iconName}" class="w-4 h-4"></i>
        </div>
        <div class="text-xs font-semibold select-none leading-relaxed">${message}</div>
    `;

    container.appendChild(toast);
    if (typeof window !== 'undefined' && window.safeCreateIcons) window.safeCreateIcons();

    toast.offsetHeight;
    toast.classList.remove('translate-y-2', 'opacity-0');

    const dismiss = () => {
        toast.classList.add('opacity-0', 'translate-y-[-8px]');
        setTimeout(() => {
            toast.remove();
        }, 300);
    };

    const timeoutId = setTimeout(dismiss, duration);
    toast.addEventListener('click', () => {
        clearTimeout(timeoutId);
        dismiss();
    });
}

export function showAlert(message, title = '系统提示', iconType = 'alert-circle') {
    return new Promise((resolve) => {
        const msgEl = document.getElementById('confirmModalMessage');
        const titleEl = document.getElementById('confirmModalTitle');
        const iconEl = document.getElementById('confirmModalIcon');
        const confirmBtn = document.getElementById('confirmConfirmBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const backdrop = document.getElementById('confirmModalBackdrop');

        if (msgEl) msgEl.textContent = message;
        if (titleEl) titleEl.textContent = title;

        if (iconEl) {
            iconEl.setAttribute('data-lucide', iconType);
            if (typeof window !== 'undefined' && window.safeCreateIcons) window.safeCreateIcons();
        }

        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (!confirmBtn || !backdrop) {
            resolve();
            return;
        }

        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newBackdrop = backdrop.cloneNode(true);
        confirmBtn.replaceWith(newConfirmBtn);
        backdrop.replaceWith(newBackdrop);

        function cleanup() {
            closeModal('confirmModal');
            setTimeout(() => {
                if (cancelBtn) cancelBtn.classList.remove('hidden');
            }, 300);
            resolve();
        }

        openModal('confirmModal');
        newConfirmBtn.addEventListener('click', cleanup);
        newBackdrop.addEventListener('click', cleanup);
    });
}

export function showConfirm(message, title = '确认操作', iconType = 'help-circle') {
    return new Promise((resolve) => {
        const msgEl = document.getElementById('confirmModalMessage');
        const titleEl = document.getElementById('confirmModalTitle');
        const iconEl = document.getElementById('confirmModalIcon');
        const confirmBtn = document.getElementById('confirmConfirmBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const backdrop = document.getElementById('confirmModalBackdrop');

        if (msgEl) msgEl.textContent = message;
        if (titleEl) titleEl.textContent = title;

        if (iconEl) {
            iconEl.setAttribute('data-lucide', iconType);
            if (typeof window !== 'undefined' && window.safeCreateIcons) window.safeCreateIcons();
        }

        if (cancelBtn) cancelBtn.classList.remove('hidden');
        if (!confirmBtn || !cancelBtn || !backdrop) {
            resolve(false);
            return;
        }

        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newBackdrop = backdrop.cloneNode(true);
        confirmBtn.replaceWith(newConfirmBtn);
        cancelBtn.replaceWith(newCancelBtn);
        backdrop.replaceWith(newBackdrop);

        function cleanup(value) {
            closeModal('confirmModal');
            resolve(value);
        }

        openModal('confirmModal');
        newConfirmBtn.addEventListener('click', () => cleanup(true));
        newCancelBtn.addEventListener('click', () => cleanup(false));
        newBackdrop.addEventListener('click', () => cleanup(false));
    });
}

export function initModalToastGlobals() {
    if (typeof window === 'undefined') return;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.showToast = showToast;
    window.showAlert = showAlert;
    window.showConfirm = showConfirm;
    window.alert = function(message) {
        if (message === undefined || message === null) return;
        const msgStr = String(message);
        const isShort = msgStr.length < 18;
        const isStatus = msgStr.includes('复制') || msgStr.includes('载入') || msgStr.includes('保存') || msgStr.includes('成功');

        if (isShort || isStatus) {
            let type = 'info';
            if (isStatus || msgStr.includes('成功') || msgStr.includes('复制') || msgStr.includes('载入')) {
                type = 'success';
            } else if (msgStr.includes('失败') || msgStr.includes('错误') || msgStr.includes('⚠️')) {
                type = 'error';
            }
            showToast(msgStr, type);
        } else {
            let icon = 'alert-circle';
            let title = '系统提示';
            if (msgStr.includes('失败') || msgStr.includes('错误') || msgStr.includes('封禁') || msgStr.includes('⚠️')) {
                icon = 'alert-triangle';
                title = '操作失败';
            }
            showAlert(msgStr, title, icon);
        }
    };
}

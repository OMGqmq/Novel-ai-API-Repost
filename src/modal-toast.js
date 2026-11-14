/**
 * Modal & Toast System Module
 * Provides generic modal open/close transitions and glassmorphic Toast / Alert / Confirm dialogs.
 */
/**
 * Modal & Toast Utility Module
 * Native <dialog> top-layer modal management + XSS-safe accessible toast notifications.
 */

const supportsPopover = () =>
    typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

const supportsClosedBy = () =>
    typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

const isNativeDialog = (el) =>
    Boolean(el && typeof el.showModal === 'function' && typeof el.close === 'function');

const isReducedMotion = () => {
    if (typeof document !== 'undefined' && document.documentElement?.classList?.contains('low-perf')) {
        return true;
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
};

const supportsTopLayerExit = () =>
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('transition-behavior', 'allow-discrete') &&
    CSS.supports('overlay', 'auto');

function pointInDialogRect(e, dialog) {
    if (typeof dialog.getBoundingClientRect !== 'function') return true;
    const r = dialog.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return true;
    return (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
    );
}

function bindDialogLifecycle(el) {
    if (!isNativeDialog(el) || el._nativeDialogBound) return;
    el._nativeDialogBound = true;

    let pointerDownOutside = false;

    if (!supportsClosedBy()) {
        el.addEventListener('pointerdown', (e) => {
            if (el.getAttribute('closedby') !== 'any') return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            pointerDownOutside = !pointInDialogRect(e, el);
        });
        el.addEventListener('pointerup', (e) => {
            if (el.getAttribute('closedby') !== 'any') {
                pointerDownOutside = false;
                return;
            }
            const shouldDismiss = pointerDownOutside && !pointInDialogRect(e, el);
            pointerDownOutside = false;
            if (shouldDismiss && el.open) {
                closeModal(el.id, 'cancel');
            }
        });
    }

    el.addEventListener('cancel', (e) => {
        if (typeof el._onNativeCancel === 'function') {
            el._onNativeCancel(e);
            if (e.defaultPrevented) return;
        }
        if (!isReducedMotion() && !supportsTopLayerExit() && !el.dataset?.closing) {
            e.preventDefault();
            closeModal(el.id, 'cancel');
        }
    });

    el.addEventListener('close', () => {
        if (el._openTimeout) {
            clearTimeout(el._openTimeout);
            el._openTimeout = null;
        }
        el.classList.remove('modal-active');
        if (el.dataset) delete el.dataset.closing;
        const rv = el.returnValue ?? '';
        el.returnValue = '';
        const closeCb = el._onNativeClose;
        el._onNativeClose = null;
        if (typeof closeCb === 'function') {
            closeCb(rv);
        }
    });
}

function syncToastContainerPopover(container, shouldShow) {
    if (!container || !supportsPopover() || !container.hasAttribute?.('popover')) return;
    if (typeof container.showPopover !== 'function' || typeof container.hidePopover !== 'function') return;

    try {
        const isOpen = Boolean(container.matches?.(':popover-open'));
        if (shouldShow) {
            const hasOpenDialog = Boolean(typeof document !== 'undefined' && document.querySelector?.('dialog[open]'));
            if (isOpen && hasOpenDialog) {
                // Re-promote above newly opened modal <dialog> in Top Layer stack
                container.hidePopover();
                container.showPopover();
            } else if (!isOpen) {
                container.showPopover();
            }
        } else if (isOpen && !container.querySelector?.('.toast-item')) {
            container.hidePopover();
        }
    } catch (_) {}
}

function announceToastMessage(message) {
    if (typeof document === 'undefined') return;
    const text = String(message ?? '').trim();
    if (!text) return;

    if (typeof document.ariaNotify === 'function') {
        try {
            document.ariaNotify(text, { interrupt: 'none' });
            return;
        } catch (_) {}
    }

    let liveEl = document.getElementById('toastLiveRegion');
    if (!liveEl && document.body && typeof document.createElement === 'function') {
        liveEl = document.createElement('div');
        liveEl.id = 'toastLiveRegion';
        liveEl.className = 'sr-only';
        liveEl.setAttribute('aria-live', 'polite');
        liveEl.setAttribute('aria-atomic', 'true');
        document.body.appendChild(liveEl);
    }
    if (liveEl) {
        liveEl.textContent = '';
        const assign = () => {
            liveEl.textContent = text;
        };
        if (typeof queueMicrotask === 'function') queueMicrotask(assign);
        else assign();
    }
}

export function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el._closeTimeout) {
        clearTimeout(el._closeTimeout);
        el._closeTimeout = null;
    }
    if (el._openTimeout) {
        clearTimeout(el._openTimeout);
        el._openTimeout = null;
    }
    if (el.dataset) delete el.dataset.closing;

    if (isNativeDialog(el)) {
        bindDialogLifecycle(el);
        if (el.style) el.style.display = '';
        if (!el.open) {
            try {
                el.showModal();
            } catch (_) {
                el.style.display = 'flex';
            }
        }
        // Keep visible toasts above modal backdrop in Top Layer LIFO order
        const toastContainer = document.getElementById('toastContainer');
        if (toastContainer?.querySelector?.('.toast-item')) {
            syncToastContainerPopover(toastContainer, true);
        }
        el._openTimeout = setTimeout(() => {
            el._openTimeout = null;
            el.classList.add('modal-active');
        }, 10);
        return;
    }

    el.style.display = 'flex';
    el._openTimeout = setTimeout(() => {
        el._openTimeout = null;
        el.classList.add('modal-active');
    }, 10);
}

export function closeModal(id, returnValue = '') {
    const el = document.getElementById(id);
    if (!el) return;
    if (el._openTimeout) {
        clearTimeout(el._openTimeout);
        el._openTimeout = null;
    }
    if (el._closeTimeout) {
        clearTimeout(el._closeTimeout);
        el._closeTimeout = null;
    }
    el.classList.remove('modal-active');

    if (isNativeDialog(el)) {
        if (!el.open) {
            if (el.dataset) delete el.dataset.closing;
            el.returnValue = '';
            return;
        }
        if (isReducedMotion() || supportsTopLayerExit()) {
            try {
                el.close(returnValue);
            } catch (_) {}
            return;
        }

        if (el.dataset) el.dataset.closing = 'true';
        const finalizeClose = () => {
            if (el._closeTimeout) {
                clearTimeout(el._closeTimeout);
                el._closeTimeout = null;
            }
            if (!el.open) return;
            try {
                el.close(returnValue);
            } catch (_) {}
        };
        const anims = typeof el.getAnimations === 'function'
            ? el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming?.().iterations !== Infinity)
            : [];
        el._closeTimeout = setTimeout(finalizeClose, 320);
        if (anims.length > 0) {
            Promise.allSettled(anims.map((a) => a.finished)).then(finalizeClose);
        }
        return;
    }

    el._closeTimeout = setTimeout(() => {
        el.style.display = 'none';
        el._closeTimeout = null;
    }, 300);
}

const MODAL_SVG_PATHS = {
    'info': ['M12 16v-4', 'M12 8h.01'],
    'check-circle': ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'm9 11 3 3L22 4'],
    'alert-triangle': ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z', 'M12 9v4', 'M12 17h.01'],
    'alert-circle': ['M12 8v4', 'M12 16h.01'],
    'help-circle': ['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
    'trash-2': ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
    'sparkles': ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z', 'M20 3v4', 'M22 5h-4'],
    'alert-octagon': ['M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z', 'M12 8v4', 'M12 16h.01']
};

function createInlineSvgElement(iconName, className = 'w-4 h-4') {
    if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') {
        return null;
    }
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);

    const needsOuterCircle = iconName === 'info' || iconName === 'alert-circle' || iconName === 'help-circle';
    if (needsOuterCircle) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        svg.appendChild(circle);
    }

    const paths = MODAL_SVG_PATHS[iconName] || MODAL_SVG_PATHS['info'];
    paths.forEach((d) => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    });
    return svg;
}

export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    if (!container.getAttribute('role')) container.setAttribute('role', 'region');
    if (!container.getAttribute('aria-label')) container.setAttribute('aria-label', '系统通知');

    const safeText = String(message ?? '');
    const toast = document.createElement('div');
    toast.className = 'toast-item flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-lg border backdrop-blur-md transition-all duration-300 translate-y-2 opacity-0 max-w-sm pointer-events-auto w-[90%] md:w-auto';

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

    const iconWrap = document.createElement('div');
    iconWrap.className = 'flex-shrink-0 flex items-center justify-center';
    const inlineSvg = createInlineSvgElement(iconName, 'w-4 h-4 pointer-events-none');
    if (inlineSvg) {
        iconWrap.appendChild(inlineSvg);
    } else {
        const iconFallback = document.createElement('span');
        iconFallback.className = 'w-4 h-4 inline-block';
        iconFallback.setAttribute('aria-hidden', 'true');
        iconWrap.appendChild(iconFallback);
    }

    const textEl = document.createElement('div');
    textEl.className = 'text-xs font-semibold select-none leading-relaxed flex-1 break-words';
    textEl.textContent = safeText;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'flex-shrink-0 ml-1 p-1 rounded-lg opacity-65 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-current';
    closeBtn.setAttribute('aria-label', '关闭通知');
    closeBtn.textContent = '×';

    toast.appendChild(iconWrap);
    toast.appendChild(textEl);
    toast.appendChild(closeBtn);

    container.appendChild(toast);
    syncToastContainerPopover(container, true);
    announceToastMessage(safeText);

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
    } else {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }

    let dismissed = false;
    let timeoutId = null;
    let remainingMs = Math.max(0, Number(duration) || 3000);
    let timerStartedAt = Date.now();

    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        toast.classList.add('opacity-0', 'translate-y-[-8px]');
        setTimeout(() => {
            toast.remove();
            syncToastContainerPopover(container, false);
        }, 300);
    };

    const startTimer = (delay) => {
        if (timeoutId) clearTimeout(timeoutId);
        timerStartedAt = Date.now();
        remainingMs = delay;
        timeoutId = setTimeout(dismiss, delay);
    };

    const pauseTimer = () => {
        if (dismissed || !timeoutId) return;
        clearTimeout(timeoutId);
        timeoutId = null;
        remainingMs = Math.max(1200, remainingMs - (Date.now() - timerStartedAt));
    };

    const resumeTimer = () => {
        if (dismissed || timeoutId) return;
        startTimer(remainingMs);
    };

    startTimer(remainingMs);

    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', resumeTimer);
    toast.addEventListener('focusin', pauseTimer);
    toast.addEventListener('focusout', resumeTimer);
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
    });
    toast.addEventListener('click', () => {
        dismiss();
    });
}

export function showAlert(message, title = '系统提示', iconType = 'alert-circle') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
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
            const svg = createInlineSvgElement(iconType, 'w-5 h-5 pointer-events-none');
            if (svg && typeof iconEl.replaceChildren === 'function') {
                iconEl.replaceChildren(svg);
            }
        }

        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (!confirmBtn) {
            resolve();
            return;
        }

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.replaceWith(newConfirmBtn);
        let newBackdrop = null;
        if (backdrop) {
            newBackdrop = backdrop.cloneNode(true);
            backdrop.replaceWith(newBackdrop);
        }

        let settled = false;
        function finalize() {
            if (settled) return;
            settled = true;
            setTimeout(() => {
                if (cancelBtn) cancelBtn.classList.remove('hidden');
            }, 300);
            resolve();
        }

        function cleanup() {
            closeModal('confirmModal', 'confirm');
            finalize();
        }

        if (modal) {
            modal._onNativeClose = () => finalize();
        }
        openModal('confirmModal');
        newConfirmBtn.addEventListener('click', cleanup);
        if (newBackdrop) newBackdrop.addEventListener('click', cleanup);
    });
}

export function showConfirm(message, title = '确认操作', iconType = 'help-circle') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
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
            const svg = createInlineSvgElement(iconType, 'w-5 h-5 pointer-events-none');
            if (svg && typeof iconEl.replaceChildren === 'function') {
                iconEl.replaceChildren(svg);
            }
        }

        if (cancelBtn) cancelBtn.classList.remove('hidden');
        if (!confirmBtn || !cancelBtn) {
            resolve(false);
            return;
        }

        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        confirmBtn.replaceWith(newConfirmBtn);
        cancelBtn.replaceWith(newCancelBtn);
        let newBackdrop = null;
        if (backdrop) {
            newBackdrop = backdrop.cloneNode(true);
            backdrop.replaceWith(newBackdrop);
        }

        let settled = false;
        function finalize(value) {
            if (settled) return;
            settled = true;
            resolve(Boolean(value));
        }

        function cleanup(value) {
            closeModal('confirmModal', value ? 'confirm' : 'cancel');
            finalize(value);
        }

        if (modal) {
            modal._onNativeClose = (rv) => finalize(rv === 'confirm');
        }
        openModal('confirmModal');
        newConfirmBtn.addEventListener('click', () => cleanup(true));
        newCancelBtn.addEventListener('click', () => cleanup(false));
        if (newBackdrop) newBackdrop.addEventListener('click', () => cleanup(false));
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

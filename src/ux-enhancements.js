/**
 * UX Enhancements Module
 * Provides productivity keyboard shortcuts (Ctrl+Enter, Ctrl+Up/Down NAI tag weights),
 * global PNG metadata dropzone visual feedback, range slider progress fill + double-click reset,
 * and mobile bottom-sheet drag-to-dismiss touch physics.
 */

export function isLowPerfOrReducedMotion() {
    try {
        if (typeof document !== 'undefined' && document.documentElement?.classList?.contains('low-perf')) {
            return true;
        }
        if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            return true;
        }
    } catch (_) {}
    return false;
}

/**
 * Adjusts NovelAI weight syntax `weight::tag::` around cursor or selection.
 * @param {string} text
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @param {number} delta e.g. +0.1 or -0.1
 * @returns {{ text: string, selectionStart: number, selectionEnd: number }}
 */
export function adjustPromptTagWeight(text, selectionStart, selectionEnd, delta) {
    if (typeof text !== 'string' || !text.length) {
        return { text: text || '', selectionStart: 0, selectionEnd: 0 };
    }

    const len = text.length;
    let start = Math.max(0, Math.min(len, selectionStart ?? 0));
    let end = Math.max(start, Math.min(len, selectionEnd ?? start));

    // Check if cursor/selection sits inside an existing `num::content::` block
    const weightRegex = /(-?\d+(?:\.\d+)?)::([\s\S]*?)::/g;
    let enclosingMatch = null;
    let match;
    while ((match = weightRegex.exec(text)) !== null) {
        const mStart = match.index;
        const mEnd = mStart + match[0].length;
        if (start >= mStart && end <= mEnd) {
            enclosingMatch = {
                start: mStart,
                end: mEnd,
                weight: parseFloat(match[1]),
                inner: match[2]
            };
            break;
        }
    }

    let tokenStart = start;
    let tokenEnd = end;
    let currentWeight = 1.0;
    let innerTag = '';

    if (enclosingMatch) {
        tokenStart = enclosingMatch.start;
        tokenEnd = enclosingMatch.end;
        currentWeight = isNaN(enclosingMatch.weight) ? 1.0 : enclosingMatch.weight;
        innerTag = enclosingMatch.inner;
    } else {
        if (start === end) {
            // Expand to comma/newline boundaries
            while (tokenStart > 0 && text[tokenStart - 1] !== ',' && text[tokenStart - 1] !== '，' && text[tokenStart - 1] !== '\n') {
                tokenStart--;
            }
            while (tokenEnd < len && text[tokenEnd] !== ',' && text[tokenEnd] !== '，' && text[tokenEnd] !== '\n') {
                tokenEnd++;
            }
        }
        // Trim leading/trailing whitespace so commas and spacing stay intact
        while (tokenStart < tokenEnd && /\s/.test(text[tokenStart])) tokenStart++;
        while (tokenEnd > tokenStart && /\s/.test(text[tokenEnd - 1])) tokenEnd--;

        const rawSlice = text.slice(tokenStart, tokenEnd);
        if (!rawSlice) {
            return { text, selectionStart: start, selectionEnd: end };
        }

        const exactMatch = rawSlice.match(/^(-?\d+(?:\.\d+)?)::([\s\S]*?)::$/);
        if (exactMatch) {
            currentWeight = parseFloat(exactMatch[1]);
            innerTag = exactMatch[2];
        } else {
            currentWeight = 1.0;
            innerTag = rawSlice;
        }
    }

    const nextWeight = Math.max(-5.0, Math.min(5.0, Math.round((currentWeight + delta) * 10) / 10));
    let replacement;
    if (Math.abs(nextWeight - 1.0) < 0.001) {
        replacement = innerTag;
    } else {
        const formatted = Number.isInteger(nextWeight) ? nextWeight.toFixed(1) : String(nextWeight);
        replacement = `${formatted}::${innerTag}::`;
    }

    const newText = text.slice(0, tokenStart) + replacement + text.slice(tokenEnd);
    return {
        text: newText,
        selectionStart: tokenStart,
        selectionEnd: tokenStart + replacement.length
    };
}

/**
 * Updates CSS `--range-pct` variable on a range input for active track fill styling.
 */
export function updateRangeProgress(slider) {
    if (!slider || slider.type !== 'range') return;
    const min = slider.min !== '' && slider.min !== undefined ? parseFloat(slider.min) : 0;
    const max = slider.max !== '' && slider.max !== undefined ? parseFloat(slider.max) : 100;
    const val = parseFloat(slider.value);
    if (isNaN(val) || max <= min) return;
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    if (slider.style && typeof slider.style.setProperty === 'function') {
        slider.style.setProperty('--range-pct', `${pct.toFixed(2)}%`);
    }
    if (slider.classList && typeof slider.classList.add === 'function') {
        slider.classList.add('enhanced-range');
    }
    if (typeof slider.setAttribute === 'function') {
        slider.setAttribute('aria-valuetext', `${slider.value} (${Math.round(pct)}%)`);
    }
}

export function initSwitchAccessibility(root = typeof document !== 'undefined' ? document : null) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    const syncSwitch = (checkbox) => {
        if (!checkbox || checkbox.type !== 'checkbox') return;
        if (typeof checkbox.setAttribute === 'function') {
            if (!checkbox.getAttribute('role')) {
                checkbox.setAttribute('role', 'switch');
            }
            checkbox.setAttribute('aria-checked', checkbox.checked ? 'true' : 'false');
        }
    };

    root.querySelectorAll('input[type="checkbox"].sr-only.peer, input[type="checkbox"][role="switch"]').forEach(syncSwitch);

    if (typeof root.addEventListener === 'function' && !root._switchA11yBound) {
        root._switchA11yBound = true;
        root.addEventListener('change', (e) => {
            const target = e?.target;
            if (target?.type === 'checkbox' && (target.getAttribute?.('role') === 'switch' || target.classList?.contains('peer'))) {
                syncSwitch(target);
            }
        });
    }
}

function isPromptEditableTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (tag !== 'TEXTAREA' && tag !== 'INPUT') return false;
    const id = el.id || '';
    if (id === 'prompt' || id === 'negativePrompt' || id === 'inpaintPrompt' || id === 'inpaintPromptMobile') {
        return true;
    }
    if (el.classList && (el.classList.contains('char-prompt-input') || el.classList.contains('char-neg-input'))) {
        return true;
    }
    return false;
}

export function initRangeSliderEnhancements(root = typeof document !== 'undefined' ? document : null) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    const bindSlider = (slider) => {
        if (!slider || slider.dataset?.rangeEnhanced === 'true') {
            updateRangeProgress(slider);
            return;
        }
        if (slider.dataset) {
            slider.dataset.rangeEnhanced = 'true';
            if (slider.dataset.defaultValue === undefined) {
                const attrVal = typeof slider.getAttribute === 'function' ? slider.getAttribute('value') : null;
                slider.dataset.defaultValue = attrVal !== null && attrVal !== undefined ? attrVal : String(slider.value ?? '');
            }
        }
        updateRangeProgress(slider);

        if (typeof slider.addEventListener === 'function') {
            slider.addEventListener('dblclick', () => {
                const def = slider.dataset?.defaultValue;
                if (def !== undefined && def !== '' && String(slider.value) !== String(def)) {
                    slider.value = def;
                    updateRangeProgress(slider);
                    if (typeof Event === 'function' && typeof slider.dispatchEvent === 'function') {
                        slider.dispatchEvent(new Event('input', { bubbles: true }));
                        slider.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
        }
    };

    const sliders = root.querySelectorAll('input[type="range"]');
    sliders.forEach(bindSlider);

    if (typeof root.addEventListener === 'function') {
        root.addEventListener('input', (e) => {
            const target = e?.target;
            if (target && target.type === 'range') {
                bindSlider(target);
                updateRangeProgress(target);
            }
        });
    }
}

export function bindDrawerSwipeToClose({ handleEl, drawerEl, isExpanded, onClose, onOpen }) {
    if (!handleEl || !drawerEl || typeof handleEl.addEventListener !== 'function') return;

    let startY = 0;
    let startTime = 0;
    let currentDeltaY = 0;
    let startedExpanded = false;
    let tracking = false;
    let dragging = false;
    let suppressNextClick = false;

    handleEl.addEventListener('click', (e) => {
        if (suppressNextClick) {
            suppressNextClick = false;
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    handleEl.addEventListener('pointerdown', (e) => {
        if (typeof window !== 'undefined' && window.innerWidth >= 768) return;
        startedExpanded = Boolean(isExpanded());
        if (!startedExpanded && typeof onOpen !== 'function') return;
        tracking = true;
        dragging = false;
        startY = e.clientY;
        startTime = Date.now();
        currentDeltaY = 0;
        try {
            handleEl.setPointerCapture?.(e.pointerId);
        } catch (_) {}
    });

    handleEl.addEventListener('pointermove', (e) => {
        if (!tracking) return;
        const dy = e.clientY - startY;
        if (!dragging && Math.abs(dy) > 8) {
            dragging = true;
            if (startedExpanded) drawerEl.style.transition = 'none';
        }
        if (dragging) {
            currentDeltaY = dy;
            if (startedExpanded) {
                const clampedY = dy > 0 ? dy : dy * 0.2;
                drawerEl.style.transform = `translateY(${Math.max(0, clampedY)}px)`;
            }
        }
    });

    const finishGesture = (e) => {
        if (!tracking) return;
        tracking = false;
        try {
            if (e?.pointerId !== undefined) handleEl.releasePointerCapture?.(e.pointerId);
        } catch (_) {}

        if (!dragging) return;
        dragging = false;
        suppressNextClick = true;
        setTimeout(() => { suppressNextClick = false; }, 80);

        const elapsed = Math.max(1, Date.now() - startTime);
        const velocity = currentDeltaY / elapsed;

        drawerEl.style.transition = '';
        drawerEl.style.transform = '';

        if (startedExpanded) {
            if (currentDeltaY > 72 || (currentDeltaY > 28 && velocity > 0.45)) {
                onClose();
            }
        } else if (typeof onOpen === 'function') {
            if (currentDeltaY < -36 || (currentDeltaY < -18 && velocity < -0.35)) {
                onOpen();
            }
        }
    };

    handleEl.addEventListener('pointerup', finishGesture);
    handleEl.addEventListener('pointercancel', finishGesture);
}

export function initUxEnhancements({ onTriggerGenerate, ui, inpaintEditor } = {}) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    // 1. Range Slider Progress, Switch Roles & Double-Click Reset
    initRangeSliderEnhancements(document);
    initSwitchAccessibility(document);

    // Refresh range progress & switch states whenever external scripts mutate values
    const refreshAllRanges = () => {
        try {
            document.querySelectorAll?.('input[type="range"]')?.forEach(updateRangeProgress);
            initSwitchAccessibility(document);
        } catch (_) {}
    };
    setTimeout(refreshAllRanges, 120);

    // 2. Desktop Productivity Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const sideDrawer = document.getElementById('sideDrawer');
            const openModalEl = document.querySelector?.('dialog[open]');
            if (sideDrawer?.classList?.contains('drawer-open') && !openModalEl && ui && typeof ui.toggleDrawer === 'function') {
                e.preventDefault();
                ui.toggleDrawer();
                return;
            }
        }
        const isMod = e.ctrlKey || e.metaKey;
        if (!isMod) return;

        // Ctrl/Cmd + Enter -> Trigger Generate / Inpaint / Outpaint / Stop
        if (e.key === 'Enter') {
            const blockingModalIds = [
                'settingsModal', 'confirmModal', 'customConfirmModal',
                'imageLightboxModal', 'toolboxModal', 'enhanceModal',
                'inspirationModal', 'aiChatModal'
            ];
            const hasBlockingModal = Boolean(document.querySelector?.('dialog[open]')) || blockingModalIds.some(id => {
                const el = document.getElementById(id);
                return el && (el.open || el.classList?.contains('modal-active'));
            });
            if (hasBlockingModal) return;

            e.preventDefault();
            if (typeof onTriggerGenerate === 'function') {
                onTriggerGenerate();
            }
            return;
        }

        // Ctrl/Cmd + ArrowUp / ArrowDown -> Adjust NAI Tag Weight
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isPromptEditableTarget(e.target)) {
            e.preventDefault();
            const target = e.target;
            const delta = e.key === 'ArrowUp' ? 0.1 : -0.1;
            const res = adjustPromptTagWeight(
                target.value || '',
                target.selectionStart ?? 0,
                target.selectionEnd ?? 0,
                delta
            );
            if (res.text !== target.value) {
                target.value = res.text;
                try {
                    target.setSelectionRange?.(res.selectionStart, res.selectionEnd);
                } catch (_) {}
                if (typeof Event === 'function') {
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        }
    });

    // 3. Global PNG Metadata Drag-and-Drop Visual Overlay
    const dropOverlay = document.getElementById('pngDropOverlay');
    if (dropOverlay && typeof window.addEventListener === 'function') {
        let dragDepth = 0;

        const hasFilePayload = (e) => {
            const types = e?.dataTransfer?.types;
            if (!types) return false;
            return Array.from(types).includes('Files');
        };

        const showDropOverlay = () => {
            dropOverlay.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            dropOverlay.classList.add('opacity-100');
        };

        const hideDropOverlay = () => {
            dragDepth = 0;
            dropOverlay.classList.add('opacity-0', 'pointer-events-none');
            dropOverlay.classList.remove('opacity-100');
            setTimeout(() => {
                if (dragDepth === 0) dropOverlay.classList.add('hidden');
            }, 180);
        };

        window.addEventListener('dragenter', (e) => {
            if (!hasFilePayload(e)) return;
            dragDepth++;
            showDropOverlay();
        });

        window.addEventListener('dragleave', (e) => {
            if (!hasFilePayload(e) && dragDepth === 0) return;
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                hideDropOverlay();
            }
        });

        window.addEventListener('drop', () => {
            hideDropOverlay();
            setTimeout(refreshAllRanges, 60);
        });

        window.addEventListener('blur', hideDropOverlay);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dragDepth > 0) hideDropOverlay();
        });
    }

    // 4. Mobile Bottom-Sheet Swipe-Up / Swipe-Down Physics
    const mobileControls = document.getElementById('mobileControls');
    const mobileControlsHandle = document.getElementById('mobileControlsHandle');
    if (mobileControls && mobileControlsHandle && ui) {
        bindDrawerSwipeToClose({
            handleEl: mobileControlsHandle,
            drawerEl: mobileControls,
            isExpanded: () => mobileControls.classList.contains('expanded'),
            onClose: () => ui.toggleMobileControls(false),
            onOpen: () => ui.toggleMobileControls(true)
        });
    }

    const lightboxSidebar = document.getElementById('lightboxSidebar');
    const lightboxDrawerHandle = document.getElementById('lightboxDrawerHandle');
    if (lightboxSidebar && lightboxDrawerHandle) {
        bindDrawerSwipeToClose({
            handleEl: lightboxDrawerHandle,
            drawerEl: lightboxSidebar,
            isExpanded: () => lightboxSidebar.classList.contains('expanded'),
            onClose: () => lightboxSidebar.classList.remove('expanded'),
            onOpen: () => lightboxSidebar.classList.add('expanded')
        });
    }

    const inpaintDrawer = document.getElementById('inpaintMobileDrawer');
    const inpaintDrawerHeader = document.getElementById('inpaintDrawerHeader');
    if (inpaintDrawer && inpaintDrawerHeader && inpaintEditor) {
        bindDrawerSwipeToClose({
            handleEl: inpaintDrawerHeader,
            drawerEl: inpaintDrawer,
            isExpanded: () => inpaintDrawer.classList.contains('expanded'),
            onClose: () => {
                if (inpaintDrawer.classList.contains('expanded')) {
                    inpaintEditor.toggleDrawer();
                }
            }
        });
    }

    const sideDrawer = document.getElementById('sideDrawer');
    if (sideDrawer) {
        if ('inert' in sideDrawer) {
            sideDrawer.inert = !sideDrawer.classList.contains('drawer-open');
        }
        if (typeof sideDrawer.addEventListener === 'function' && ui && typeof ui.toggleDrawer === 'function') {
            let swipeStart = null;
            sideDrawer.addEventListener('pointerdown', (e) => {
                if (!sideDrawer.classList.contains('drawer-open')) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                swipeStart = { x: e.clientX, y: e.clientY };
            });
            sideDrawer.addEventListener('pointerup', (e) => {
                if (!swipeStart || !sideDrawer.classList.contains('drawer-open')) {
                    swipeStart = null;
                    return;
                }
                const dx = e.clientX - swipeStart.x;
                const dy = e.clientY - swipeStart.y;
                swipeStart = null;
                if (dx < -64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                    ui.toggleDrawer();
                }
            });
            sideDrawer.addEventListener('pointercancel', () => { swipeStart = null; });
        }
    }
}

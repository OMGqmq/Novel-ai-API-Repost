import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    openModal,
    closeModal,
    showToast,
    showConfirm,
    showAlert
} from '../src/modal-toast.js';
import {
    updateRangeProgress,
    initSwitchAccessibility
} from '../src/ux-enhancements.js';
import { UIController } from '../src/ui.js';
import { createLightboxController } from '../src/lightbox-controller.js';

const root = path.resolve(import.meta.dirname, '..');

function createEventTargetMixin(target) {
    const listeners = {};
    target.addEventListener = (type, fn) => {
        (listeners[type] ||= []).push(fn);
    };
    target.removeEventListener = (type, fn) => {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    };
    target.dispatchEvent = (evt) => {
        evt.target ||= target;
        evt.currentTarget = target;
        (listeners[evt.type] || []).forEach((fn) => fn(evt));
        return !evt.defaultPrevented;
    };
    return listeners;
}

function createFakeClassList(initial = []) {
    const set = new Set(initial);
    return {
        add: (...cls) => cls.forEach((c) => set.add(c)),
        remove: (...cls) => cls.forEach((c) => set.delete(c)),
        contains: (c) => set.has(c),
        toggle: (c, force) => {
            if (typeof force === 'boolean') {
                if (force) set.add(c);
                else set.delete(c);
                return force;
            }
            if (set.has(c)) {
                set.delete(c);
                return false;
            }
            set.add(c);
            return true;
        },
        toString: () => Array.from(set).join(' ')
    };
}

function createFakeDialog({ id, closedby = 'any', rect = { left: 100, right: 500, top: 100, bottom: 400, width: 400, height: 300 } } = {}) {
    const attrs = new Map();
    if (closedby) attrs.set('closedby', closedby);
    const el = {
        id,
        tagName: 'DIALOG',
        open: false,
        returnValue: '',
        style: {},
        dataset: {},
        classList: createFakeClassList(),
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        hasAttribute: (k) => attrs.has(k),
        getBoundingClientRect: () => rect,
        getAnimations: () => [],
        showModal() {
            this.open = true;
        },
        close(rv = '') {
            if (!this.open) return;
            this.open = false;
            if (rv !== undefined && rv !== null) this.returnValue = String(rv);
            this.dispatchEvent({ type: 'close' });
        }
    };
    createEventTargetMixin(el);
    return el;
}

describe('Modern Web UI & Accessibility Upgrades', () => {
    describe('HTML & CSS Standards Compliance', () => {
        const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
        const charPromptSrc = fs.readFileSync(path.join(root, 'src/char-prompt-manager.js'), 'utf8');

        it('converts all 7 modal overlays to semantic <dialog> without redundant ARIA or inline #inpaintModal', () => {
            const modalIds = [
                'toolboxModal',
                'inspirationModal',
                'aiChatModal',
                'settingsModal',
                'imageLightboxModal',
                'enhanceModal',
                'confirmModal'
            ];

            for (const id of modalIds) {
                const openMatch = html.match(new RegExp(`<dialog\\b[^>]*id="${id}"[^>]*>`));
                expect(openMatch, `<dialog id="${id}"> should exist`).toBeTruthy();
                expect(openMatch[0]).not.toMatch(/\brole\s*=\s*"dialog"/);
                expect(openMatch[0]).not.toMatch(/\baria-modal\s*=/);
                expect(openMatch[0]).toMatch(/\baria-(labelledby|label)\s*=/);
                expect(openMatch[0]).toMatch(/\bclosedby\s*=\s*"(any|closerequest)"/);
            }

            // Equal number of <dialog> and </dialog>
            expect((html.match(/<dialog\b/g) || []).length).toBe(7);
            expect((html.match(/<\/dialog>/g) || []).length).toBe(7);

            // Canvas-docked inpaint toolbar must remain an inline container, not a modal <dialog>
            expect(html).toMatch(/<div\b[^>]*id="inpaintModal"[^>]*class="inpaint-dock-host/);
        });

        it('upgrades toast container and toolbox dropdown to native popover top-layer patterns', () => {
            expect(html).toMatch(/<div\b[^>]*id="toastContainer"[^>]*popover="manual"[^>]*role="region"/);
            expect(html).toMatch(/popovertarget="toolboxMenu"[^>]*id="toolboxTriggerBtn"/);
            expect(html).toMatch(/<div\b[^>]*id="toolboxMenu"[^>]*popover="auto"/);
            expect(html).toMatch(/popovertarget="vibeExportMenu"/);
            expect(html).toMatch(/id="vibeExportMenu"[^>]*popover="auto"/);
        });

        it('marks all pill toggles with role="switch" in index.html and char-prompt-manager.js', () => {
            const staticSwitches = html.match(/<input\b[^>]*class="[^"]*sr-only peer[^"]*"[^>]*>/g) || [];
            expect(staticSwitches.length).toBeGreaterThanOrEqual(15);
            for (const tag of staticSwitches) {
                expect(tag).toContain('role="switch"');
            }
            const charToggles = charPromptSrc.match(/<input type="checkbox"[^>]*sr-only peer[^>]*>/g) || [];
            expect(charToggles.length).toBe(2);
            for (const tag of charToggles) {
                expect(tag).toContain('role="switch"');
            }
        });

        it('replaces hidden 0px scrollbars, contains modal overscroll, adds top-layer animations, range rules, typography, view transitions, and reduced motion', () => {
            expect(css).not.toMatch(/\.custom-scroll::-webkit-scrollbar\s*\{[^}]*width:\s*0px/);
            expect(css).toContain('scrollbar-width: thin;');
            expect(css).toContain('scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);');
            expect(css).toContain('@supports not (scrollbar-color: auto)');

            expect(css).toContain('@property --fade-start');
            expect(css).toContain('.scroll-affordance');

            expect(css).toContain('dialog.native-modal:modal');
            expect(css).toContain('overscroll-behavior: contain;');
            expect(css).toContain('dialog.native-modal::backdrop');
            expect(css).toContain('overflow: hidden;');
            expect(css).toContain('@starting-style');
            expect(css).toContain('transition-behavior: allow-discrete;');

            expect(css).toContain('text-wrap: balance;');
            expect(css).toContain('text-wrap: pretty;');

            expect(css).toContain('[data-tip]:is(:hover, :focus-visible)::after');
            expect(css).toContain('::-moz-range-progress');
            expect(css).not.toMatch(/::-webkit-slider-[^,{]+,\s*[^,{]*::-moz-range-/);

            expect(css).toContain('::view-transition-group(lightbox-hero)');
            expect(css).not.toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*\s*\{/);
        });

        it('keeps closed toolbox popover non-rendered and non-interactive while anchoring open popovers to triggers', () => {
            expect(css).toMatch(/\.toolbox-icon-dock\s*\{[^}]*display:\s*none;[^}]*pointer-events:\s*none;/s);
            expect(css).toMatch(/\.toolbox-icon-dock\[popover\]:is\(:popover-open,\s*\.\\:popover-open\)\s*\{[^}]*display:\s*flex;[^}]*pointer-events:\s*auto;/s);
            expect(css).toContain('anchor-name: --toolbox-trigger;');
            expect(css).toContain('position-anchor: --toolbox-trigger;');
            expect(css).toContain('anchor-name: --vibe-export-trigger;');
            expect(css).toContain('position-anchor: --vibe-export-trigger;');
        });
    });

    describe('Native <dialog>, Light Dismiss Fallback & Safe Toast Runtime', () => {
        let origDocument;
        let origWindow;
        let origHTMLElement;
        let origHTMLDialogElement;
        let origCSS;

        beforeEach(() => {
            vi.useFakeTimers();
            origDocument = globalThis.document;
            origWindow = globalThis.window;
            origHTMLElement = globalThis.HTMLElement;
            origHTMLDialogElement = globalThis.HTMLDialogElement;
            origCSS = globalThis.CSS;
        });

        afterEach(() => {
            vi.useRealTimers();
            globalThis.document = origDocument;
            globalThis.window = origWindow;
            globalThis.HTMLElement = origHTMLElement;
            globalThis.HTMLDialogElement = origHTMLDialogElement;
            globalThis.CSS = origCSS;
        });

        it('opens/closes native <dialog>, cleans returnValue, and runs coordinate light-dismiss fallback when closedBy is absent', async () => {
            globalThis.HTMLDialogElement = function HTMLDialogElement() {};
            globalThis.CSS = { supports: () => true };

            const dialog = createFakeDialog({ id: 'confirmModal', closedby: 'any' });
            const msgEl = { textContent: '' };
            const titleEl = { textContent: '' };
            const iconEl = { setAttribute: vi.fn() };
            const createBtn = (label) => {
                const btn = {
                    label,
                    classList: createFakeClassList(),
                    replaceWith: vi.fn((next) => {
                        if (label === 'confirm') confirmBtn = next;
                        else cancelBtn = next;
                    }),
                    cloneNode: () => createBtn(label)
                };
                createEventTargetMixin(btn);
                return btn;
            };
            let confirmBtn = createBtn('confirm');
            let cancelBtn = createBtn('cancel');

            const byId = {
                confirmModal: dialog,
                confirmModalMessage: msgEl,
                confirmModalTitle: titleEl,
                confirmModalIcon: iconEl,
                confirmConfirmBtn: confirmBtn,
                confirmCancelBtn: cancelBtn
            };

            globalThis.document = {
                documentElement: { classList: createFakeClassList() },
                getElementById: (id) => {
                    if (id === 'confirmConfirmBtn') return confirmBtn;
                    if (id === 'confirmCancelBtn') return cancelBtn;
                    return byId[id] || null;
                }
            };
            globalThis.window = {
                matchMedia: () => ({ matches: false })
            };

            // 1. Confirm via button resolves true & resets dialog.returnValue to ''
            const confirmPromise = showConfirm('删除此项？', '确认');
            expect(dialog.open).toBe(true);
            confirmBtn.dispatchEvent({ type: 'click' });
            await expect(confirmPromise).resolves.toBe(true);
            expect(dialog.open).toBe(false);
            expect(dialog.returnValue).toBe('');

            // 2. Press inside + drag release outside must NOT dismiss
            openModal('confirmModal');
            vi.advanceTimersByTime(15);
            expect(dialog.classList.contains('modal-active')).toBe(true);
            dialog.dispatchEvent({ type: 'pointerdown', pointerType: 'mouse', button: 0, clientX: 200, clientY: 200 });
            dialog.dispatchEvent({ type: 'pointerup', pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
            expect(dialog.open).toBe(true);

            // 3. Press outside + release outside DOES dismiss cleanly
            dialog.dispatchEvent({ type: 'pointerdown', pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
            dialog.dispatchEvent({ type: 'pointerup', pointerType: 'mouse', button: 0, clientX: 15, clientY: 15 });
            expect(dialog.open).toBe(false);
            expect(dialog.classList.contains('modal-active')).toBe(false);

            // 4. showAlert restores cancel button & resolves on Esc/outside close
            const alertPromise = showAlert('操作已完成');
            expect(cancelBtn.classList.contains('hidden')).toBe(true);
            dialog.close('');
            await expect(alertPromise).resolves.toBeUndefined();
            vi.advanceTimersByTime(320);
            expect(cancelBtn.classList.contains('hidden')).toBe(false);
        });

        it('renders showToast via textContent (XSS-safe), adds close button, promotes popover, and notifies screen readers', () => {
            function FakeHTMLElement() {}
            FakeHTMLElement.prototype.popover = null;
            globalThis.HTMLElement = FakeHTMLElement;

            const children = [];
            let popoverOpen = false;
            const ariaNotify = vi.fn();

            const makeNode = (tag) => {
                const attrs = {};
                const node = {
                    tagName: tag.toUpperCase(),
                    className: '',
                    style: {},
                    children: [],
                    parentNode: null,
                    offsetHeight: 1,
                    classList: createFakeClassList(),
                    setAttribute: (k, v) => { attrs[k] = String(v); },
                    getAttribute: (k) => attrs[k] ?? null,
                    appendChild: (child) => {
                        child.parentNode = node;
                        node.children.push(child);
                        return child;
                    },
                    remove: () => {
                        if (node.parentNode) {
                            const idx = node.parentNode.children.indexOf(node);
                            if (idx !== -1) node.parentNode.children.splice(idx, 1);
                            node.parentNode = null;
                        }
                    }
                };
                let inner = '';
                Object.defineProperty(node, 'innerHTML', {
                    get: () => inner,
                    set: () => { throw new Error('showToast must not assign innerHTML with message data'); }
                });
                createEventTargetMixin(node);
                return node;
            };

            const containerAttrs = { popover: 'manual' };
            const container = {
                id: 'toastContainer',
                children,
                setAttribute: (k, v) => { containerAttrs[k] = String(v); },
                getAttribute: (k) => containerAttrs[k] ?? null,
                hasAttribute: (k) => k in containerAttrs,
                matches: (sel) => sel === ':popover-open' && popoverOpen,
                showPopover: vi.fn(() => { popoverOpen = true; }),
                hidePopover: vi.fn(() => { popoverOpen = false; }),
                querySelector: (sel) => (sel === '.toast-item' ? children[0] || null : null),
                appendChild: (child) => {
                    child.parentNode = container;
                    children.push(child);
                }
            };

            globalThis.document = {
                ariaNotify,
                createElement: makeNode,
                getElementById: (id) => (id === 'toastContainer' ? container : null),
                querySelector: () => null
            };
            globalThis.window = { safeCreateIcons: vi.fn() };

            const payload = '<img src=x onerror=alert(1)>';
            showToast(payload, 'error', 2000);

            expect(children.length).toBe(1);
            const toast = children[0];
            expect(toast.children[1].textContent).toBe(payload);
            expect(toast.children[2].getAttribute('aria-label')).toBe('关闭通知');
            expect(container.getAttribute('role')).toBe('region');
            expect(container.showPopover).toHaveBeenCalledTimes(1);
            expect(ariaNotify).toHaveBeenCalledWith(payload, { interrupt: 'none' });

            // Hover pauses dismiss timer beyond initial 2000ms
            toast.dispatchEvent({ type: 'mouseenter' });
            vi.advanceTimersByTime(2500);
            expect(children.length).toBe(1);

            // Explicit close button dismisses & hides empty container popover
            toast.children[2].dispatchEvent({ type: 'click', stopPropagation: vi.fn() });
            vi.advanceTimersByTime(320);
            expect(children.length).toBe(0);
            expect(container.hidePopover).toHaveBeenCalledTimes(1);
        });
    });

    describe('Form Controls, Drawer Accessibility & Lightbox View Transition', () => {
        let origDocument;
        let origWindow;

        beforeEach(() => {
            origDocument = globalThis.document;
            origWindow = globalThis.window;
        });

        afterEach(() => {
            globalThis.document = origDocument;
            globalThis.window = origWindow;
        });

        it('sets aria-valuetext alongside --range-pct on range sliders', () => {
            const attrs = {};
            const slider = {
                type: 'range',
                min: '0',
                max: '10',
                value: '5',
                style: { setProperty: vi.fn() },
                classList: createFakeClassList(),
                setAttribute: (k, v) => { attrs[k] = String(v); },
                getAttribute: (k) => attrs[k] ?? null
            };
            updateRangeProgress(slider);
            expect(slider.style.setProperty).toHaveBeenCalledWith('--range-pct', '50.00%');
            expect(slider.classList.contains('enhanced-range')).toBe(true);
            expect(attrs['aria-valuetext']).toBe('5 (50%)');
        });

        it('adds role="switch" and keeps aria-checked synced on change', () => {
            const makeSwitch = (checked) => {
                const attrs = {};
                return {
                    type: 'checkbox',
                    checked,
                    classList: createFakeClassList(['sr-only', 'peer']),
                    setAttribute: (k, v) => { attrs[k] = String(v); },
                    getAttribute: (k) => attrs[k] ?? null
                };
            };
            const sw = makeSwitch(false);
            const rootEl = {
                querySelectorAll: () => [sw]
            };
            createEventTargetMixin(rootEl);

            initSwitchAccessibility(rootEl);
            expect(sw.getAttribute('role')).toBe('switch');
            expect(sw.getAttribute('aria-checked')).toBe('false');

            sw.checked = true;
            rootEl.dispatchEvent({ type: 'change', target: sw });
            expect(sw.getAttribute('aria-checked')).toBe('true');
        });

        it('syncs sideDrawer inert/aria-hidden, toggle buttons aria-expanded, and restores focus on close', () => {
            const triggerBtn = {
                attrs: { 'aria-expanded': 'false' },
                setAttribute(k, v) { this.attrs[k] = String(v); },
                focus: vi.fn()
            };
            const searchInput = { focus: vi.fn() };
            const sideDrawer = {
                inert: true,
                attrs: { 'aria-hidden': 'true' },
                classList: createFakeClassList(['drawer', 'drawer-closed']),
                setAttribute(k, v) { this.attrs[k] = String(v); },
                contains: () => false,
                querySelector: () => searchInput
            };
            const drawerOverlay = {
                classList: createFakeClassList(['opacity-0', 'pointer-events-none'])
            };

            globalThis.document = {
                activeElement: triggerBtn,
                addEventListener: vi.fn(),
                querySelectorAll: (sel) => (sel === '[data-drawer-toggle]' ? [triggerBtn] : []),
                getElementById: (id) => ({
                    sideDrawer,
                    drawerOverlay
                }[id] || null)
            };

            const ui = { els: { sideDrawer, drawerOverlay } };
            UIController.prototype.toggleDrawer.call(ui);

            expect(sideDrawer.classList.contains('drawer-open')).toBe(true);
            expect(sideDrawer.inert).toBe(false);
            expect(sideDrawer.attrs['aria-hidden']).toBe('false');
            expect(triggerBtn.attrs['aria-expanded']).toBe('true');
            expect(searchInput.focus).toHaveBeenCalled();

            UIController.prototype.toggleDrawer.call(ui);
            expect(sideDrawer.classList.contains('drawer-closed')).toBe(true);
            expect(sideDrawer.inert).toBe(true);
            expect(sideDrawer.attrs['aria-hidden']).toBe('true');
            expect(triggerBtn.attrs['aria-expanded']).toBe('false');
            expect(triggerBtn.focus).toHaveBeenCalled();
        });

        it('uses startViewTransition for gallery lightbox morph when motion is allowed and skips it under prefers-reduced-motion', async () => {
            const dialog = createFakeDialog({ id: 'imageLightboxModal', closedby: 'closerequest' });
            const mainImg = { classList: createFakeClassList(), style: {}, src: '', decode: () => Promise.resolve() };
            const thumbImg = { tagName: 'IMG', isConnected: true, style: {}, dataset: {} };
            const vtSpy = vi.fn((cb) => {
                const done = Promise.resolve(cb());
                return { finished: done };
            });
            let reducedMotion = false;

            globalThis.document = {
                documentElement: { classList: createFakeClassList() },
                startViewTransition: vtSpy,
                addEventListener: vi.fn(),
                querySelector: () => null,
                querySelectorAll: () => [],
                getElementById: (id) => ({
                    imageLightboxModal: dialog,
                    lightboxMainImg: mainImg
                }[id] || null)
            };
            globalThis.window = {
                matchMedia: () => ({ matches: reducedMotion })
            };

            const ctrl = createLightboxController({
                appState: { showcaseData: [] },
                galleryController: { galleryItems: [{ id: 1, image: 'data:image/png;base64,abc', prompt: '1girl' }] },
                ui: { setModel: vi.fn(), toggleMobileControls: vi.fn() },
                els: {},
                showConfirm: vi.fn(),
                closeLightboxCallback: vi.fn()
            });

            await ctrl.openLightbox({ id: 1, image: 'data:image/png;base64,abc' }, thumbImg);
            expect(vtSpy).toHaveBeenCalledTimes(1);
            expect(dialog.open).toBe(true);
            expect(thumbImg.style.viewTransitionName).toBe('');
            expect(mainImg.style.viewTransitionName).toBe('');

            ctrl.closeLightbox();
            reducedMotion = true;
            await ctrl.openLightbox({ id: 1, image: 'data:image/png;base64,abc' }, thumbImg);
            expect(vtSpy).toHaveBeenCalledTimes(1);
            expect(dialog.open).toBe(true);
        });

        it('closes any open toolbox popover when hiding image actions and clears initial translate classes when showing', () => {
            const toggleToolbox = vi.fn();
            globalThis.window = { toggleToolbox };

            const imageActions = { classList: createFakeClassList(['opacity-0', 'pointer-events-none', '-translate-y-1']) };
            const canvasDeleteBtn = { disabled: true, classList: createFakeClassList(['opacity-50', 'cursor-not-allowed']) };
            const dlBtn = { disabled: true, classList: createFakeClassList(['opacity-50', 'cursor-not-allowed']) };

            const ui = { els: { imageActions, canvasDeleteBtn, dlBtn } };
            UIController.prototype.showImageActions.call(ui, true);
            expect(imageActions.classList.contains('opacity-0')).toBe(false);
            expect(imageActions.classList.contains('pointer-events-none')).toBe(false);
            expect(imageActions.classList.contains('-translate-y-1')).toBe(false);
            expect(toggleToolbox).not.toHaveBeenCalled();

            UIController.prototype.showImageActions.call(ui, false);
            expect(toggleToolbox).toHaveBeenCalledWith(false);
            expect(imageActions.classList.contains('opacity-0')).toBe(true);
            expect(imageActions.classList.contains('pointer-events-none')).toBe(true);
        });

        it('upgrades <select> to Top-Layer combobox/listbox popover with keyboard nav, Escape stopPropagation, and XSS-safe option text', () => {
            function makeFakeElement(tag) {
                const attrs = {};
                const children = [];
                const listeners = {};
                let innerHtml = '';
                const el = {
                    tagName: String(tag || 'div').toUpperCase(),
                    id: '',
                    value: '',
                    className: '',
                    textContent: '',
                    style: {},
                    dataset: {},
                    children,
                    options: [],
                    selectedIndex: 0,
                    parentElement: null,
                    classList: createFakeClassList(),
                    setAttribute(k, v) { attrs[k] = String(v); },
                    getAttribute(k) { return attrs[k] ?? null; },
                    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
                    removeAttribute(k) { delete attrs[k]; },
                    contains(target) {
                        if (target === el) return true;
                        return children.some((c) => (typeof c.contains === 'function' ? c.contains(target) : c === target));
                    },
                    appendChild(child) {
                        child.parentElement = el;
                        children.push(child);
                        return child;
                    },
                    replaceChildren(...nodes) {
                        children.length = 0;
                        nodes.forEach((n) => el.appendChild(n));
                    },
                    get innerHTML() { return innerHtml; },
                    set innerHTML(val) {
                        innerHtml = String(val);
                        if (innerHtml === '') children.length = 0;
                    },
                    getBoundingClientRect: () => ({ top: 120, bottom: 160, left: 40, right: 260, width: 220, height: 40 }),
                    focus: vi.fn(),
                    scrollIntoView: vi.fn(),
                    addEventListener(type, fn) {
                        (listeners[type] ||= []).push(fn);
                    },
                    dispatchEvent(evt) {
                        if (!evt.target) {
                            try { evt.target = el; } catch (_) {}
                        }
                        (listeners[evt.type] || []).forEach((fn) => fn(evt));
                        return true;
                    }
                };
                return el;
            }

            const wrapper = makeFakeElement('div');
            const selectEl = makeFakeElement('select');
            selectEl.id = 'testSamplerSelect';
            selectEl.className = 'w-full px-4 py-3 rounded-xl text-xs font-medium';
            selectEl.setAttribute('aria-label', '采样器');
            const xssPayload = '<img src=x onerror=alert(1)>';
            const opt1 = { value: 'k_euler', textContent: 'Euler' };
            const opt2 = { value: 'k_euler_ancestral', textContent: 'Euler Ancestral' };
            const opt3 = { value: 'xss', textContent: xssPayload };
            selectEl.options = [opt1, opt2, opt3];
            selectEl.value = 'k_euler';
            selectEl.selectedIndex = 0;
            wrapper.appendChild(selectEl);

            let popoverOpen = false;
            const origMutationObserver = globalThis.MutationObserver;
            globalThis.MutationObserver = undefined;

            globalThis.document = {
                querySelectorAll: (sel) => (sel === 'select' ? [selectEl] : []),
                createElement: (tag) => {
                    const el = makeFakeElement(tag);
                    if (tag === 'div') {
                        el.showPopover = vi.fn(() => { popoverOpen = true; });
                        el.hidePopover = vi.fn(() => { popoverOpen = false; });
                    }
                    return el;
                },
                createElementNS: (_ns, tag) => makeFakeElement(tag),
                addEventListener: vi.fn()
            };
            globalThis.window = {
                innerHeight: 900,
                innerWidth: 1440,
                addEventListener: vi.fn()
            };

            try {
                const ui = { _customSelectGlobalListenersBound: false };
                const changedEvents = [];
                selectEl.addEventListener('change', () => changedEvents.push(selectEl.value));

                UIController.prototype._initCustomSelects.call(ui);

                expect(selectEl.classList.contains('hidden')).toBe(true);
                const container = wrapper.children.find((c) => c.className.includes('custom-select-container'));
                expect(container).toBeTruthy();

                const trigger = container.children[0];
                const panel = container.children[1];

                expect(trigger.getAttribute('role')).toBe('combobox');
                expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
                expect(trigger.getAttribute('aria-controls')).toBe('testSamplerSelect_listbox');
                expect(trigger.getAttribute('aria-label')).toBe('采样器');
                expect(panel.id).toBe('testSamplerSelect_listbox');
                expect(panel.getAttribute('role')).toBe('listbox');
                expect(panel.getAttribute('popover')).toBe('manual');
                expect(panel.children).toHaveLength(3);
                expect(panel.children[0].getAttribute('role')).toBe('option');

                // XSS safety: literal text via textContent, no injected child DOM nodes beyond span + check svg
                const xssOption = panel.children[2];
                expect(xssOption.children[0].textContent).toBe(xssPayload);
                expect(xssOption.children[0].children).toHaveLength(0);

                // Keyboard open & ArrowDown / End / Home / Enter selection
                const down1 = { key: 'ArrowDown', preventDefault: vi.fn(), stopPropagation: vi.fn() };
                trigger.onkeydown(down1);
                expect(popoverOpen).toBe(true);
                expect(panel.showPopover).toHaveBeenCalledTimes(1);
                expect(trigger.getAttribute('aria-expanded')).toBe('true');

                const endEvt = { key: 'End', preventDefault: vi.fn(), stopPropagation: vi.fn() };
                trigger.onkeydown(endEvt);
                expect(panel.children[2].getAttribute('data-focused')).toBe('true');

                const homeEvt = { key: 'Home', preventDefault: vi.fn(), stopPropagation: vi.fn() };
                trigger.onkeydown(homeEvt);
                expect(panel.children[0].getAttribute('data-focused')).toBe('true');

                const down2 = { key: 'ArrowDown', preventDefault: vi.fn(), stopPropagation: vi.fn() };
                trigger.onkeydown(down2);
                expect(panel.children[1].getAttribute('data-focused')).toBe('true');

                // Escape closes dropdown & stops propagation so outer dialog does not close
                const escEvt = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
                trigger.onkeydown(escEvt);
                expect(escEvt.preventDefault).toHaveBeenCalledTimes(1);
                expect(escEvt.stopPropagation).toHaveBeenCalledTimes(1);
                expect(panel.hidePopover).toHaveBeenCalledTimes(1);
                expect(popoverOpen).toBe(false);
                expect(trigger.focus).toHaveBeenCalled();

                // Re-open with ArrowDown, select second option with ArrowDown + Enter
                trigger.onkeydown({ key: 'ArrowDown', preventDefault: vi.fn(), stopPropagation: vi.fn() });
                trigger.onkeydown({ key: 'ArrowDown', preventDefault: vi.fn(), stopPropagation: vi.fn() });
                selectEl.selectedIndex = 1;
                trigger.onkeydown({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });
                expect(selectEl.value).toBe('k_euler_ancestral');
                expect(changedEvents).toEqual(['k_euler_ancestral']);
                expect(trigger.children[0].textContent).toBe('Euler Ancestral');
                expect(popoverOpen).toBe(false);
            } finally {
                globalThis.MutationObserver = origMutationObserver;
            }
        });

        it('persists desktop sidebar collapsed state, syncs inert & aria-expanded on buttons, and restores state on init', () => {
            vi.useFakeTimers();
            try {
                localStorage.clear();
                const attrsMap = new Map([
                    ['desktopSidebarCollapseBtn', {}],
                    ['desktopSidebarExpandBtn', {}]
                ]);
                const makeBtn = (id) => ({
                    id,
                    setAttribute: (k, v) => { attrsMap.get(id)[k] = String(v); },
                    getAttribute: (k) => attrsMap.get(id)[k] ?? null
                });

                const collapseBtn = makeBtn('desktopSidebarCollapseBtn');
                const expandBtn = makeBtn('desktopSidebarExpandBtn');
                const mobileControls = {
                    inert: false,
                    classList: createFakeClassList()
                };
                const body = {
                    classList: createFakeClassList()
                };

                const dispatchedEvents = [];
                globalThis.document = {
                    body,
                    getElementById: (id) => ({
                        mobileControls,
                        desktopSidebarCollapseBtn: collapseBtn,
                        desktopSidebarExpandBtn: expandBtn
                    }[id] || null)
                };
                globalThis.window = {
                    innerWidth: 1280,
                    dispatchEvent: vi.fn((evt) => dispatchedEvents.push(evt.type))
                };

                const ui = {
                    els: { mobileControls },
                    toggleDesktopSidebar: UIController.prototype.toggleDesktopSidebar
                };
                UIController.prototype.toggleDesktopSidebar.call(ui, true);

                expect(body.classList.contains('desktop-sidebar-collapsed')).toBe(true);
                expect(mobileControls.classList.contains('desktop-collapsed')).toBe(true);
                expect(mobileControls.inert).toBe(true);
                expect(collapseBtn.getAttribute('aria-expanded')).toBe('false');
                expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
                expect(localStorage.getItem('nai_desktop_sidebar_collapsed')).toBe('true');

                vi.advanceTimersByTime(300);
                expect(dispatchedEvents).toEqual(['resize']);

                // Reset state in DOM, then verify initDesktopSidebarState restores persisted 'true' without persisting/resizing
                body.classList.remove('desktop-sidebar-collapsed');
                mobileControls.classList.remove('desktop-collapsed');
                mobileControls.inert = false;
                dispatchedEvents.length = 0;

                UIController.prototype.initDesktopSidebarState.call(ui);
                vi.advanceTimersByTime(350);
                expect(body.classList.contains('desktop-sidebar-collapsed')).toBe(true);
                expect(mobileControls.classList.contains('desktop-collapsed')).toBe(true);
                expect(mobileControls.inert).toBe(true);
                expect(collapseBtn.getAttribute('aria-expanded')).toBe('false');
                expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
                expect(dispatchedEvents).toEqual([]);

                // Expand back
                UIController.prototype.toggleDesktopSidebar.call(ui, false);
                vi.advanceTimersByTime(300);
                expect(body.classList.contains('desktop-sidebar-collapsed')).toBe(false);
                expect(mobileControls.inert).toBe(false);
                expect(collapseBtn.getAttribute('aria-expanded')).toBe('true');
                expect(expandBtn.getAttribute('aria-expanded')).toBe('true');
                expect(localStorage.getItem('nai_desktop_sidebar_collapsed')).toBe('false');
                expect(dispatchedEvents).toEqual(['resize']);
            } finally {
                vi.useRealTimers();
            }
        });

        it('enforces P0/P1 static hygiene: zero <i data-lucide>, valid Tailwind v3 tokens, no vh/emojis/reflows', () => {
            const srcDir = path.join(root, 'src');
            const srcFiles = fs.readdirSync(srcDir)
                .filter((f) => f.endsWith('.js'))
                .map((f) => ({ rel: `src/${f}`, content: fs.readFileSync(path.join(srcDir, f), 'utf8') }));

            const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
            const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
            const allTargets = [{ rel: 'index.html', content: html }, { rel: 'src/style.css', content: css }, ...srcFiles];

            const invalidTokenRegex = /\b(?:gray-(?:150|155|205|250|450)|slate-(?:650|750)|shadow-2?xs|backdrop-blur-xs|outline-hidden|border-3|w-4\.5|h-4\.5|py-0\.2|animate-bounce)\b/;
            const invalidOpacityRegex = /\b(?:bg|text|border|ring|divide|from|to|via|fill|stroke|shadow)-[a-z0-9-]+\/(?:6|8|12|72|88)\b/;
            const decorativeEmojiRegex = /[🎲💡🎨]/u;

            for (const file of allTargets) {
                expect(file.content, `${file.rel} must not contain <i data-lucide>`).not.toMatch(/<i\b[^>]*data-lucide/);
                expect(file.content, `${file.rel} contains invalid Tailwind v3 token`).not.toMatch(invalidTokenRegex);
                expect(file.content, `${file.rel} contains unsupported Tailwind v3 opacity`).not.toMatch(invalidOpacityRegex);
                expect(file.content, `${file.rel} must not contain decorative emojis`).not.toMatch(decorativeEmojiRegex);
            }

            // Use dvh instead of vh in layout HTML & CSS
            expect(html, 'index.html must avoid vh length tokens').not.toMatch(/\b\d+(?:\.\d+)?vh\b/);
            expect(css, 'src/style.css must avoid vh length tokens').not.toMatch(/\b\d+(?:\.\d+)?vh\b/);

            // Prevent forced reflow offsetWidth/offsetHeight outside inpaint canvas sizing
            for (const file of srcFiles) {
                if (file.rel === 'src/inpaint.js') continue;
                expect(file.content, `${file.rel} should not force reflow via offsetWidth/offsetHeight`).not.toMatch(/\.offset(?:Width|Height)\b/);
            }
        });
    });
});

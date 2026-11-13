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
    });
});

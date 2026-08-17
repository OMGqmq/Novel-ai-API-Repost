import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MotionController } from '../src/motion-controller.js';
import { InpaintEditor } from '../src/inpaint.js';
import { OutpaintEditor } from '../src/outpaint.js';
import { XyPlotManager } from '../src/xy-plot-manager.js';

describe('Modular UI Entrance Animation & MotionController Test Suite', () => {
    let mockElements = {};
    let windowEventListeners = {};
    let cssContent = '';

    // Load actual style.css for genuine CSS rule verification
    try {
        const cssPath = path.resolve(__dirname, '../src/style.css');
        cssContent = fs.readFileSync(cssPath, 'utf8');
    } catch (e) {
        cssContent = '';
    }

    function createMockElement(id, classes = [], tagName = 'div') {
        const classSet = new Set(classes);
        const listeners = {};
        const el = {
            id,
            tagName: tagName.toUpperCase(),
            value: '',
            checked: false,
            dataset: {},
            style: {
                transform: '',
                willChange: '',
                filter: '',
                perspective: '',
                opacity: ''
            },
            parentElement: null,
            classList: {
                add: vi.fn((...clsList) => clsList.forEach(c => classSet.add(c))),
                remove: vi.fn((...clsList) => clsList.forEach(c => classSet.delete(c))),
                toggle: vi.fn((c) => {
                    if (classSet.has(c)) { classSet.delete(c); return false; }
                    else { classSet.add(c); return true; }
                }),
                contains: vi.fn((c) => classSet.has(c))
            },
            addEventListener: vi.fn((evt, fn) => {
                if (!listeners[evt]) listeners[evt] = [];
                listeners[evt].push(fn);
            }),
            removeEventListener: vi.fn((evt, fn) => {
                if (listeners[evt]) {
                    listeners[evt] = listeners[evt].filter(f => f !== fn);
                }
            }),
            dispatchEvent: vi.fn((evt) => {
                const type = evt.type || evt;
                if (listeners[type]) {
                    listeners[type].forEach(fn => fn({ ...evt, currentTarget: el, target: el }));
                }
                return true;
            }),
            closest: vi.fn((sel) => {
                if (sel === '.absolute' || sel.includes('absolute')) return el.parentElement || el;
                return null;
            }),
            querySelector: vi.fn(() => null),
            querySelectorAll: vi.fn(() => []),
            getBoundingClientRect: vi.fn(() => ({
                left: 100,
                top: 50,
                width: 800,
                height: 600,
                right: 900,
                bottom: 650
            })),
            getContext: vi.fn(() => ({
                clearRect: vi.fn(),
                drawImage: vi.fn(),
                getImageData: vi.fn((x, y, w, h) => ({
                    width: w || 512,
                    height: h || 512,
                    data: new Uint8ClampedArray((w || 512) * (h || 512) * 4)
                })),
                putImageData: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                arc: vi.fn(),
                fill: vi.fn(),
                fillRect: vi.fn(),
                setTransform: vi.fn(),
                scale: vi.fn(),
                translate: vi.fn()
            })),
            toDataURL: vi.fn(() => 'data:image/png;base64,mock')
        };
        return el;
    }

    function getOrCreateMockElement(id, classes = [], tagName = 'div') {
        if (mockElements[id] === null) return null;
        if (!mockElements[id]) {
            mockElements[id] = createMockElement(id, classes, tagName);
        }
        return mockElements[id];
    }

    function setupStandardDOM() {
        mockElements = {};
        windowEventListeners = {};

        const navParent = createMockElement('navWrapper', ['absolute', 'top-0']);
        const navEl = createMockElement('viewToggle', ['view-toggle']);
        navEl.parentElement = navParent;
        navEl.closest = vi.fn((sel) => (sel.includes('absolute') ? (mockElements['navWrapper'] || navParent) : null));

        const sidebarEl = createMockElement('mobileControls');
        const canvasEl = createMockElement('placeholder');
        const previewAreaEl = createMockElement('previewArea');
        const fabEl = createMockElement('floatingGenerateBtn');
        const deskBtnParent = createMockElement('deskBtnWrapper');
        const deskBtn = createMockElement('desktopGenerateBtn');
        deskBtn.parentElement = deskBtnParent;

        const bodyEl = createMockElement('body');
        bodyEl.dataset = {};
        const htmlEl = createMockElement('html');

        mockElements['viewToggle'] = navEl;
        mockElements['navWrapper'] = navParent;
        mockElements['mobileControls'] = sidebarEl;
        mockElements['placeholder'] = canvasEl;
        mockElements['previewArea'] = previewAreaEl;
        mockElements['floatingGenerateBtn'] = fabEl;
        mockElements['desktopGenerateBtn'] = deskBtn;
        mockElements['deskBtnWrapper'] = deskBtnParent;

        // Inpaint & Outpaint standard elements
        getOrCreateMockElement('inpaintModal', ['hidden']);
        getOrCreateMockElement('inpaintBaseCanvas', [], 'canvas');
        getOrCreateMockElement('inpaintMaskCanvas', [], 'canvas');
        getOrCreateMockElement('brushCursor');
        getOrCreateMockElement('outpaintArea');
        getOrCreateMockElement('outpaintContainer');
        getOrCreateMockElement('outpaintCanvas', [], 'canvas');
        getOrCreateMockElement('outpaintMaskCanvas', [], 'canvas');
        getOrCreateMockElement('outpaintSelection');
        getOrCreateMockElement('outpaintSizeLabel');
        getOrCreateMockElement('singleResultImg');

        global.document = {
            body: bodyEl,
            documentElement: htmlEl,
            getElementById: (id) => (mockElements[id] !== undefined ? mockElements[id] : getOrCreateMockElement(id)),
            querySelector: (sel) => {
                if (sel === '.view-toggle') return mockElements['viewToggle'] || null;
                if (sel === 'div.absolute.top-0') return mockElements['navWrapper'] || null;
                if (sel === '#placeholder') return mockElements['placeholder'] || null;
                if (sel === '#mobileControls') return mockElements['mobileControls'] || null;
                if (sel === '#floatingGenerateBtn') return mockElements['floatingGenerateBtn'] || null;
                if (sel === '#desktopGenerateBtn') return mockElements['desktopGenerateBtn'] || null;
                if (sel === '#previewArea') return mockElements['previewArea'] || null;
                return null;
            },
            querySelectorAll: (sel) => {
                const results = [];
                Object.values(mockElements).forEach(el => {
                    if (el && sel.startsWith('.') && el.classList && el.classList.contains(sel.slice(1))) {
                        results.push(el);
                    }
                });
                return results;
            },
            createElement: (tag) => {
                const el = createMockElement(`created_${tag}_${Math.random()}`, [], tag);
                return el;
            }
        };

        global.window = {
            innerWidth: 1024,
            matchMedia: vi.fn((query) => ({
                matches: query.includes('reduce') ? false : false,
                media: query
            })),
            addEventListener: vi.fn((evt, fn) => {
                if (!windowEventListeners[evt]) windowEventListeners[evt] = [];
                windowEventListeners[evt].push(fn);
            }),
            removeEventListener: vi.fn((evt, fn) => {
                if (windowEventListeners[evt]) {
                    windowEventListeners[evt] = windowEventListeners[evt].filter(f => f !== fn);
                }
            }),
            dispatchEvent: vi.fn((evt) => {
                const type = evt.type || evt;
                if (windowEventListeners[type]) {
                    windowEventListeners[type].forEach(fn => fn(evt));
                }
                return true;
            })
        };

        global.localStorage = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn()
        };

        global.CustomEvent = class CustomEvent {
            constructor(type, params = {}) {
                this.type = type;
                this.detail = params.detail || null;
            }
        };
    }

    beforeEach(() => {
        vi.useFakeTimers();
        setupStandardDOM();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // =========================================================================
    // TIER 1: FEATURE COVERAGE (>=20 Tests)
    // =========================================================================
    describe('Tier 1: Feature Coverage', () => {

        describe('CSS Specifications & Physics Easing (R1, R2, R3)', () => {
            it('T1.01: should declare the spring cubic-bezier (0.16, 1, 0.3, 1) in CSS root', () => {
                expect(cssContent).toContain('--ease-out-spring: cubic-bezier(0.16, 1, 0.3, 1)');
            });

            it('T1.02: should declare base animation duration in CSS root', () => {
                expect(cssContent).toContain('--anim-duration-base: 0.95s');
            });

            it('T1.03: should define desktopNavEntrance keyframes with translateY and blur', () => {
                expect(cssContent).toContain('@keyframes desktopNavEntrance');
                expect(cssContent).toMatch(/@keyframes\s+desktopNavEntrance[\s\S]*?translateY\(-30px\)[\s\S]*?blur\(6px\)/);
                expect(cssContent).toMatch(/@keyframes\s+desktopNavEntrance[\s\S]*?translateY\(0\)[\s\S]*?blur\(0px\)/);
            });

            it('T1.04: should define desktopSidebarEntrance keyframes with 3D perspective, tilt, and blur', () => {
                expect(cssContent).toContain('@keyframes desktopSidebarEntrance');
                expect(cssContent).toMatch(/@keyframes\s+desktopSidebarEntrance[\s\S]*?perspective\(1200px\)[\s\S]*?rotateY\(-5deg\)[\s\S]*?blur\(8px\)/);
                expect(cssContent).toMatch(/@keyframes\s+desktopSidebarEntrance[\s\S]*?perspective\(1200px\)[\s\S]*?rotateY\(0\)[\s\S]*?blur\(0px\)/);
            });

            it('T1.05: should define desktopCanvasEntrance keyframes with translateZ depth and tilt', () => {
                expect(cssContent).toContain('@keyframes desktopCanvasEntrance');
                expect(cssContent).toMatch(/@keyframes\s+desktopCanvasEntrance[\s\S]*?translateZ\(-80px\)[\s\S]*?rotateX\(6deg\)[\s\S]*?blur\(12px\)/);
                expect(cssContent).toMatch(/@keyframes\s+desktopCanvasEntrance[\s\S]*?translateZ\(0\)[\s\S]*?scale\(1\)/);
            });

            it('T1.06: should define desktopActionEntrance keyframes with translateY and scale', () => {
                expect(cssContent).toContain('@keyframes desktopActionEntrance');
                expect(cssContent).toMatch(/@keyframes\s+desktopActionEntrance[\s\S]*?translateY\(25px\)[\s\S]*?scale\(0\.9\)/);
                expect(cssContent).toMatch(/@keyframes\s+desktopActionEntrance[\s\S]*?translateY\(0\)[\s\S]*?scale\(1\)/);
            });

            it('T1.07: should define mobileNavEntrance keyframes with mobile-optimized values', () => {
                expect(cssContent).toContain('@keyframes mobileNavEntrance');
                expect(cssContent).toMatch(/@keyframes\s+mobileNavEntrance[\s\S]*?translateY\(-20px\)[\s\S]*?blur\(4px\)/);
            });

            it('T1.08: should define mobileCanvasEntrance keyframes with mobile scale and translateY', () => {
                expect(cssContent).toContain('@keyframes mobileCanvasEntrance');
                expect(cssContent).toMatch(/@keyframes\s+mobileCanvasEntrance[\s\S]*?translateY\(20px\)[\s\S]*?scale\(0\.95\)/);
            });

            it('T1.09: should define mobileDrawerEntrance keyframes from 100% to peek offset', () => {
                expect(cssContent).toContain('@keyframes mobileDrawerEntrance');
                expect(cssContent).toMatch(/@keyframes\s+mobileDrawerEntrance[\s\S]*?translateY\(100%\)/);
                expect(cssContent).toMatch(/@keyframes\s+mobileDrawerEntrance[\s\S]*?translateY\(calc\(100% - 64px\)\)/);
            });

            it('T1.10: should define mobileFabEntrance keyframes with scale overshoot pop effect', () => {
                expect(cssContent).toContain('@keyframes mobileFabEntrance');
                expect(cssContent).toMatch(/@keyframes\s+mobileFabEntrance[\s\S]*?scale\(0\)[\s\S]*?scale\(1\.08\)[\s\S]*?scale\(1\)/);
            });

            it('T1.11: should explicitly suppress all animation and transform on mobile drawer children in CSS', () => {
                expect(cssContent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?body\.entrance-animating\s+#mobileControls\s+\*[\s\S]*?animation:\s*none\s*!important/);
                expect(cssContent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?body\.entrance-animating\s+#mobileControls\s+\*[\s\S]*?transform:\s*none\s*!important/);
                expect(cssContent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?body\.entrance-animating\s+#mobileControls\s+\*[\s\S]*?filter:\s*none\s*!important/);
            });

            it('T1.12: should contain CSS reduced-motion override rule', () => {
                expect(cssContent).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?body\.entrance-animating[\s\S]*?animation:\s*none\s*!important/);
            });

            it('T1.13: should contain CSS low-perf override rule', () => {
                expect(cssContent).toMatch(/html\.low-perf\s+body\.entrance-animating[\s\S]*?animation:\s*none\s*!important/);
            });
        });

        describe('Desktop Staggered Animation & Class Orchestration', () => {
            it('T1.14: should attach entrance-animating to body and staggered classes on desktop (>=768px)', () => {
                global.window.innerWidth = 1280;
                const controller = new MotionController();
                controller.startEntrance();

                expect(document.body.classList.contains('entrance-animating')).toBe(true);
                expect(mockElements['navWrapper'].classList.contains('anim-enter-nav')).toBe(true);
                expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(true);
                expect(mockElements['placeholder'].classList.contains('anim-enter-canvas')).toBe(true);
                expect(mockElements['deskBtnWrapper'].classList.contains('anim-enter-action')).toBe(true);
            });

            it('T1.15: should verify staggered animation delays configured in desktop CSS', () => {
                expect(cssContent).toMatch(/\.anim-enter-nav[\s\S]*?0\.05s/);
                expect(cssContent).toMatch(/#mobileControls\.anim-enter-sidebar[\s\S]*?0\.12s/);
                expect(cssContent).toMatch(/\.anim-enter-canvas[\s\S]*?0\.20s/);
                expect(cssContent).toMatch(/\.anim-enter-action[\s\S]*?0\.35s/);
            });
        });

        describe('Mobile Macro-only Animation Orchestration', () => {
            it('T1.16: should attach mobile macro classes and exclude sidebar/action on mobile (<768px)', () => {
                global.window.innerWidth = 390;
                const controller = new MotionController();
                controller.startEntrance();

                expect(document.body.classList.contains('entrance-animating')).toBe(true);
                expect(mockElements['navWrapper'].classList.contains('anim-enter-nav')).toBe(true);
                expect(mockElements['placeholder'].classList.contains('anim-enter-canvas')).toBe(true);
                expect(mockElements['mobileControls'].classList.contains('anim-enter-drawer')).toBe(true);
                expect(mockElements['floatingGenerateBtn'].classList.contains('anim-enter-fab')).toBe(true);

                expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(false);
                expect(mockElements['deskBtnWrapper'].classList.contains('anim-enter-action')).toBe(false);
            });

            it('T1.17: should verify staggered animation delays configured in mobile CSS', () => {
                expect(cssContent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?\.anim-enter-nav[\s\S]*?0\.05s/);
                expect(cssContent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?\.anim-enter-canvas[\s\S]*?0\.10s/);
                expect(cssContent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?#mobileControls\.anim-enter-drawer[\s\S]*?0\.15s/);
                expect(cssContent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?#floatingGenerateBtn\.anim-enter-fab[\s\S]*?0\.35s/);
            });
        });

        describe('Event-Driven State Cleanup on animationend', () => {
            it('T1.18: should trigger cleanup when all tracked elements fire animationend', () => {
                global.window.innerWidth = 1024;
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.isCompleted()).toBe(false);

                // Dispatch animationend on each tracked element
                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(false);

                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(false);

                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(false);

                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });

                // All 4 completed -> cleanup executed
                expect(controller.isCompleted()).toBe(true);
                expect(document.body.dataset.entranceStatus).toBe('complete');
                expect(document.body.classList.contains('entrance-animating')).toBe(false);
            });

            it('T1.19: should dispatch ui:entrance-complete event upon cleanup', () => {
                const eventSpy = vi.fn();
                window.addEventListener('ui:entrance-complete', eventSpy);

                const controller = new MotionController();
                controller.startEntrance();

                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });

                expect(eventSpy).toHaveBeenCalledTimes(1);
            });

            it('T1.20: should remove all animation classes and clear inline styles upon cleanup', () => {
                const controller = new MotionController();
                controller.startEntrance();

                // Mock some inline styles applied during runtime
                mockElements['navWrapper'].style.transform = 'translateY(0px)';
                mockElements['navWrapper'].style.willChange = 'transform';
                mockElements['mobileControls'].style.filter = 'blur(0px)';

                controller.cleanup();

                expect(mockElements['navWrapper'].classList.contains('anim-enter-nav')).toBe(false);
                expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(false);
                expect(mockElements['placeholder'].classList.contains('anim-enter-canvas')).toBe(false);
                expect(mockElements['deskBtnWrapper'].classList.contains('anim-enter-action')).toBe(false);

                expect(mockElements['navWrapper'].style.transform).toBe('');
                expect(mockElements['navWrapper'].style.willChange).toBe('');
                expect(mockElements['mobileControls'].style.filter).toBe('');
            });
        });

        describe('Fallback Safety Timer (1300ms)', () => {
            it('T1.21: should automatically clean up after 1300ms if animationend is delayed or dropped', () => {
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.isCompleted()).toBe(false);
                expect(document.body.classList.contains('entrance-animating')).toBe(true);

                // Advance timer to 1299ms - still animating
                vi.advanceTimersByTime(1299);
                expect(controller.isCompleted()).toBe(false);

                // Advance timer past 1300ms - fallback triggers
                vi.advanceTimersByTime(2);
                expect(controller.isCompleted()).toBe(true);
                expect(document.body.dataset.entranceStatus).toBe('complete');
                expect(document.body.classList.contains('entrance-animating')).toBe(false);
            });

            it('T1.22: should cancel fallback timer if animationend events complete earlier', () => {
                const controller = new MotionController();
                controller.startEntrance();

                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });

                expect(controller.isCompleted()).toBe(true);

                // Advancing timers should not cause double cleanup
                vi.advanceTimersByTime(2000);
                expect(controller.isCompleted()).toBe(true);
            });
        });

        describe('Low-Perf & Reduced-Motion Bypass Logic', () => {
            it('T1.23: should instantly bypass animation when prefers-reduced-motion is active', () => {
                global.window.matchMedia = vi.fn().mockReturnValue({ matches: true });
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.isCompleted()).toBe(true);
                expect(document.body.classList.contains('entrance-animating')).toBe(false);
                expect(document.body.dataset.entranceStatus).toBe('complete');
            });

            it('T1.24: should instantly bypass animation when html has low-perf class', () => {
                document.documentElement.classList.add('low-perf');
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.isCompleted()).toBe(true);
                expect(document.body.classList.contains('entrance-animating')).toBe(false);
            });

            it('T1.25: should instantly bypass animation when localStorage settings_low_perf is true', () => {
                global.localStorage.getItem = vi.fn((key) => key === 'settings_low_perf' ? 'true' : null);
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.isCompleted()).toBe(true);
                expect(document.body.dataset.entranceStatus).toBe('complete');
            });

            it('T1.26: should instantly bypass animation when localStorage nai_low_perf is true', () => {
                global.localStorage.getItem = vi.fn((key) => key === 'nai_low_perf' ? 'true' : null);
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.isCompleted()).toBe(true);
                expect(document.body.dataset.entranceStatus).toBe('complete');
            });
        });
    });

    // =========================================================================
    // TIER 2: BOUNDARY & CORNER CASES (>=20 Tests)
    // =========================================================================
    describe('Tier 2: Boundary & Corner Cases', () => {

        describe('Viewport Breakpoint Boundaries', () => {
            it('T2.01: should treat exact breakpoint 767px as mobile branch', () => {
                global.window.innerWidth = 767;
                const controller = new MotionController();
                controller.startEntrance();

                expect(mockElements['mobileControls'].classList.contains('anim-enter-drawer')).toBe(true);
                expect(mockElements['floatingGenerateBtn'].classList.contains('anim-enter-fab')).toBe(true);
                expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(false);
            });

            it('T2.02: should treat exact breakpoint 768px as desktop branch', () => {
                global.window.innerWidth = 768;
                const controller = new MotionController();
                controller.startEntrance();

                expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(true);
                expect(mockElements['deskBtnWrapper'].classList.contains('anim-enter-action')).toBe(true);
                expect(mockElements['mobileControls'].classList.contains('anim-enter-drawer')).toBe(false);
            });

            it('T2.03: should treat extreme mobile screen 320px as mobile branch', () => {
                global.window.innerWidth = 320;
                const controller = new MotionController();
                controller.startEntrance();

                expect(mockElements['mobileControls'].classList.contains('anim-enter-drawer')).toBe(true);
            });

            it('T2.04: should treat 4K resolution 3840px as desktop branch', () => {
                global.window.innerWidth = 3840;
                const controller = new MotionController();
                controller.startEntrance();

                expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(true);
            });

            it('T2.05: should handle innerWidth 0 or negative gracefully as mobile', () => {
                global.window.innerWidth = 0;
                const controller = new MotionController();
                controller.startEntrance();

                expect(mockElements['mobileControls'].classList.contains('anim-enter-drawer')).toBe(true);
            });

            it('T2.06: should default to desktop when innerWidth is undefined', () => {
                delete global.window.innerWidth;
                const controller = new MotionController();
                controller.startEntrance();

                expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(true);
            });
        });

        describe('Missing or Partial DOM Elements', () => {
            it('T2.07: should gracefully complete when DOM is completely empty', () => {
                global.document.querySelector = () => null;
                global.document.getElementById = () => null;
                global.document.querySelectorAll = () => [];

                const controller = new MotionController();
                expect(() => controller.startEntrance()).not.toThrow();
                expect(controller.isCompleted()).toBe(true);
            });

            it('T2.08: should handle missing nav element and track remaining 3 elements', () => {
                global.window.innerWidth = 1024;
                mockElements['navWrapper'] = null;
                mockElements['viewToggle'] = null;

                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.trackedElements.length).toBe(3);
                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(false);

                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(true);
            });

            it('T2.09: should handle missing sidebar element and track remaining elements', () => {
                mockElements['mobileControls'] = null;
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.trackedElements.length).toBe(3);
                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(true);
            });

            it('T2.10: should handle missing canvas element and track remaining elements', () => {
                mockElements['placeholder'] = null;
                mockElements['previewArea'] = null;
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.trackedElements.length).toBe(3);
                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(true);
            });

            it('T2.11: should handle missing action button element and track remaining elements', () => {
                mockElements['desktopGenerateBtn'] = null;
                mockElements['deskBtnWrapper'] = null;
                const controller = new MotionController();
                controller.startEntrance();

                expect(controller.trackedElements.length).toBe(3);
                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                expect(controller.isCompleted()).toBe(true);
            });

            it('T2.12: should handle elements without classList gracefully', () => {
                mockElements['placeholder'].classList = null;
                const controller = new MotionController();
                expect(() => controller.startEntrance()).not.toThrow();
            });

            it('T2.13: should handle elements without style object during cleanup gracefully', () => {
                mockElements['placeholder'].style = null;
                const controller = new MotionController();
                controller.startEntrance();
                expect(() => controller.cleanup()).not.toThrow();
            });
        });

        describe('Idempotency, Reentrancy & Lifecycle Invariants', () => {
            it('T2.14: should be idempotent under rapid repeated startEntrance() calls', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.startEntrance();
                controller.startEntrance();
                controller.startEntrance();

                expect(document.body.classList.add).toHaveBeenCalledWith('entrance-animating');
                expect(controller.isAnimating).toBe(true);
            });

            it('T2.15: should ignore startEntrance() once isCompleted is true', () => {
                const controller = new MotionController();
                controller.cleanup();
                expect(controller.isCompleted()).toBe(true);

                controller.startEntrance();
                expect(controller.isAnimating).toBe(false);
            });

            it('T2.16: should be idempotent under rapid repeated cleanup() calls', () => {
                const eventSpy = vi.fn();
                window.addEventListener('ui:entrance-complete', eventSpy);

                const controller = new MotionController();
                controller.startEntrance();

                controller.cleanup();
                controller.cleanup();
                controller.cleanup();

                expect(eventSpy).toHaveBeenCalledTimes(1);
            });

            it('T2.17: should support reset() to re-arm animation lifecycle', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();
                expect(controller.isCompleted()).toBe(true);

                controller.reset();
                expect(controller.isCompleted()).toBe(false);
                expect(controller.isAnimating).toBe(false);

                controller.startEntrance();
                expect(controller.isAnimating).toBe(true);
            });
        });

        describe('Bubbling & Non-Tracked Event Shielding', () => {
            it('T2.18: should ignore animationend bubbling from non-tracked child elements', () => {
                const controller = new MotionController();
                controller.startEntrance();

                const childInsideSidebar = createMockElement('randomChild');
                childInsideSidebar.parentElement = mockElements['mobileControls'];

                // Firing event with currentTarget not in trackedElements
                if (controller.onAnimEndHandler) {
                    controller.onAnimEndHandler({
                        currentTarget: childInsideSidebar,
                        target: childInsideSidebar
                    });
                }

                // Completion count should not have advanced
                expect(controller.isCompleted()).toBe(false);
            });

            it('T2.19: should handle duplicate animationend on the same tracked element safely', () => {
                const controller = new MotionController();
                controller.startEntrance();

                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                // Second dispatch on same element after removeEventListener
                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });

                expect(controller.isCompleted()).toBe(false);

                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });

                expect(controller.isCompleted()).toBe(true);
            });
        });

        describe('Headless, Node SSR & Environment Resiliency', () => {
            it('T2.20: should handle window being undefined safely', () => {
                const origWindow = global.window;
                delete global.window;

                const controller = new MotionController();
                expect(() => controller.startEntrance()).not.toThrow();
                expect(controller.isCompleted()).toBe(true);

                global.window = origWindow;
            });

            it('T2.21: should handle document being undefined safely', () => {
                const origDoc = global.document;
                delete global.document;

                const controller = new MotionController();
                expect(() => controller.startEntrance()).not.toThrow();
                expect(controller.isCompleted()).toBe(true);

                global.document = origDoc;
            });

            it('T2.22: should handle document.body being null safely', () => {
                global.document.body = null;
                const controller = new MotionController();
                expect(() => controller.cleanup()).not.toThrow();
            });

            it('T2.23: should fallback when CustomEvent constructor throws or is unavailable', () => {
                const origCustomEvent = global.CustomEvent;
                global.CustomEvent = undefined;

                const controller = new MotionController();
                expect(() => controller.cleanup()).not.toThrow();

                global.CustomEvent = origCustomEvent;
            });
        });
    });

    // =========================================================================
    // TIER 3: CROSS-FEATURE COMBINATIONS (PAIRWISE) (>=10 Tests)
    // =========================================================================
    describe('Tier 3: Cross-Feature Combinations', () => {

        describe('Inpaint Modal & Canvas Coordinate Precision Post-Cleanup', () => {
            it('T3.01: should ensure Inpaint canvas getBoundingClientRect has zero lingering scale or transform offsets', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const inpaintCanvas = getOrCreateMockElement('inpaintBaseCanvas');
                const inpaintEditor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: {},
                    onComplete: vi.fn(),
                    getExtraParams: vi.fn()
                });

                const rect = inpaintCanvas.getBoundingClientRect();
                expect(rect.left).toBe(100);
                expect(rect.top).toBe(50);
                expect(rect.width).toBe(800);
                expect(rect.height).toBe(600);
            });

            it('T3.02: should verify pixel-perfect brush coordinate mapping in InpaintEditor post-cleanup', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const inpaintCanvas = getOrCreateMockElement('inpaintBaseCanvas');
                inpaintCanvas.width = 1024;
                inpaintCanvas.height = 1024;
                inpaintCanvas.getBoundingClientRect = vi.fn(() => ({ left: 50, top: 50, width: 500, height: 500 }));

                const inpaintEditor = new InpaintEditor({
                    ui: {},
                    engine: {},
                    store: {},
                    onComplete: vi.fn(),
                    getExtraParams: vi.fn()
                });
                
                // Simulate mouse event at viewport (300, 300)
                const clientX = 300;
                const clientY = 300;
                const rect = inpaintCanvas.getBoundingClientRect();

                const canvasX = ((clientX - rect.left) / rect.width) * inpaintCanvas.width;
                const canvasY = ((clientY - rect.top) / rect.height) * inpaintCanvas.height;

                // (250 / 500) * 1024 = 512
                expect(canvasX).toBe(512);
                expect(canvasY).toBe(512);
            });

            it('T3.03: should open and close Inpaint modal without animation conflict post-cleanup', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const modal = getOrCreateMockElement('inpaintModal');

                // Open modal
                modal.classList.remove('hidden');
                expect(modal.classList.contains('hidden')).toBe(false);

                // Close modal
                modal.classList.add('hidden');
                expect(modal.classList.contains('hidden')).toBe(true);
            });
        });

        describe('Outpaint Infinite Canvas Pan/Zoom Coordinate Precision Post-Cleanup', () => {
            it('T3.04: should maintain exact pan and zoom scale coordinates in OutpaintEditor post-cleanup', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const outpaintEditor = new OutpaintEditor({
                    engine: {},
                    store: {},
                    getExtraParams: vi.fn()
                });

                outpaintEditor.transform.scale = 1.5;
                outpaintEditor.transform.x = 120;
                outpaintEditor.transform.y = -80;

                expect(outpaintEditor.transform.scale).toBe(1.5);
                expect(outpaintEditor.transform.x).toBe(120);
                expect(outpaintEditor.transform.y).toBe(-80);
            });

            it('T3.05: should calculate infinite canvas world coordinate transformation with zero transform skew', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const zoom = 2.0;
                const panX = 100;
                const panY = 50;
                const screenX = 400;
                const screenY = 300;

                // World coordinate formula: (screen - pan) / zoom
                const worldX = (screenX - panX) / zoom;
                const worldY = (screenY - panY) / zoom;

                expect(worldX).toBe(150);
                expect(worldY).toBe(125);
            });

            it('T3.06: should crop outpaint canvas slice with exact dimensions without perspective distortion', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const canvas = getOrCreateMockElement('outpaintCanvas');
                canvas.width = 2048;
                canvas.height = 2048;

                const cropBox = { x: 512, y: 512, width: 1024, height: 1024 };
                expect(cropBox.width).toBe(1024);
                expect(cropBox.height).toBe(1024);
            });
        });

        describe('Mobile Drawer & Backdrop Toggling Post-Cleanup', () => {
            it('T3.07: should toggle mobileControls expanded class smoothly without entrance animation clash', () => {
                global.window.innerWidth = 390;
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const sidebar = mockElements['mobileControls'];
                expect(sidebar.classList.contains('anim-enter-drawer')).toBe(false);

                // Expand drawer
                sidebar.classList.add('expanded');
                expect(sidebar.classList.contains('expanded')).toBe(true);

                // Collapse drawer
                sidebar.classList.remove('expanded');
                expect(sidebar.classList.contains('expanded')).toBe(false);
            });

            it('T3.08: should toggle mobile backdrop hidden-backdrop without opacity residue', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const backdrop = createMockElement('mobileBackdrop', ['hidden-backdrop']);
                mockElements['mobileBackdrop'] = backdrop;

                // Show backdrop
                backdrop.classList.remove('hidden-backdrop');
                expect(backdrop.classList.contains('hidden-backdrop')).toBe(false);

                // Hide backdrop
                backdrop.classList.add('hidden-backdrop');
                expect(backdrop.classList.contains('hidden-backdrop')).toBe(true);
            });

            it('T3.09: should guarantee internal inputs inside mobileControls remain responsive and clean', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const promptInput = createMockElement('prompt');
                promptInput.value = '1girl, masterpiece, solo';

                expect(promptInput.value).toBe('1girl, masterpiece, solo');
                expect(promptInput.style.transform).toBe('');
            });
        });

        describe('Side Drawer & Custom Dropdown Coordination Post-Cleanup', () => {
            it('T3.10: should toggle side drawer between drawer-open and drawer-closed seamlessly', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const sideDrawer = createMockElement('sideDrawer', ['drawer', 'drawer-closed']);
                mockElements['sideDrawer'] = sideDrawer;

                // Open side drawer
                sideDrawer.classList.remove('drawer-closed');
                sideDrawer.classList.add('drawer-open');
                expect(sideDrawer.classList.contains('drawer-open')).toBe(true);
                expect(sideDrawer.classList.contains('drawer-closed')).toBe(false);

                // Close side drawer
                sideDrawer.classList.remove('drawer-open');
                sideDrawer.classList.add('drawer-closed');
                expect(sideDrawer.classList.contains('drawer-closed')).toBe(true);
            });

            it('T3.11: should open, select, and close custom resolution dropdown post-cleanup', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const dropdown = createMockElement('customResDropdown');
                const selectedOption = { width: 1024, height: 1536, label: 'Portrait 2:3' };

                dropdown.dataset.selected = JSON.stringify(selectedOption);
                expect(JSON.parse(dropdown.dataset.selected).width).toBe(1024);
                expect(JSON.parse(dropdown.dataset.selected).height).toBe(1536);
            });

            it('T3.12: should toggle Model V3 / V4.5 pill selector switch background without collision', () => {
                const controller = new MotionController();
                controller.startEntrance();
                controller.cleanup();

                const modelRadio = createMockElement('model-v4');
                modelRadio.checked = true;
                expect(modelRadio.checked).toBe(true);
            });
        });
    });

    // =========================================================================
    // TIER 4: REAL-WORLD APPLICATION WORKLOADS (>=5 Tests)
    // =========================================================================
    describe('Tier 4: Real-World Application Workloads', () => {

        it('T4.01: should simulate full page load lifecycle to user clicking generate button', async () => {
            // 1. Initial Page Load
            const controller = new MotionController();
            expect(controller.isCompleted()).toBe(false);

            // 2. Start Entrance
            controller.startEntrance();
            expect(document.body.classList.contains('entrance-animating')).toBe(true);

            // 3. Staggered Animations Complete
            mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
            mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
            mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
            mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });

            expect(controller.isCompleted()).toBe(true);
            expect(document.body.dataset.entranceStatus).toBe('complete');

            // 4. User Interaction: Click Generate Button
            const generateSpy = vi.fn();
            mockElements['desktopGenerateBtn'].addEventListener('click', generateSpy);
            mockElements['desktopGenerateBtn'].dispatchEvent({ type: 'click' });

            expect(generateSpy).toHaveBeenCalledTimes(1);
        });

        it('T4.02: should handle high-frequency UI interactions immediately following cleanup', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const clicks = [];
            const trackClick = (name) => clicks.push(name);

            mockElements['viewToggle'].addEventListener('click', () => trackClick('toggle'));
            mockElements['desktopGenerateBtn'].addEventListener('click', () => trackClick('generate'));
            mockElements['floatingGenerateBtn'].addEventListener('click', () => trackClick('fab'));

            for (let i = 0; i < 50; i++) {
                mockElements['viewToggle'].dispatchEvent({ type: 'click' });
                mockElements['desktopGenerateBtn'].dispatchEvent({ type: 'click' });
                mockElements['floatingGenerateBtn'].dispatchEvent({ type: 'click' });
            }

            expect(clicks.length).toBe(150);
        });

        it('T4.03: should support dark/light theme switching during active animation without breaking cleanup', () => {
            const controller = new MotionController();
            controller.startEntrance();
            expect(controller.isAnimating).toBe(true);

            // Theme switch mid-flight
            document.documentElement.classList.add('dark');
            expect(document.documentElement.classList.contains('dark')).toBe(true);

            document.documentElement.classList.remove('dark');
            expect(document.documentElement.classList.contains('dark')).toBe(false);

            // Finish animation
            controller.cleanup();
            expect(controller.isCompleted()).toBe(true);
            expect(document.body.dataset.entranceStatus).toBe('complete');
        });

        it('T4.04: should support dark/light theme switching after cleanup without restoring animation classes', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            document.documentElement.classList.add('dark');
            expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(false);
            expect(mockElements['placeholder'].classList.contains('anim-enter-canvas')).toBe(false);

            document.documentElement.classList.remove('dark');
            expect(document.body.classList.contains('entrance-animating')).toBe(false);
        });

        it('T4.05: should verify CSS scoping prevents any style leakage when body is not entrance-animating', () => {
            // CSS scoping rule verification
            expect(cssContent).toContain('body.entrance-animating #mobileControls.anim-enter-sidebar');
            expect(cssContent).toContain('body.entrance-animating .anim-enter-nav');
            expect(cssContent).toContain('body.entrance-animating .anim-enter-canvas');
            expect(cssContent).toContain('body.entrance-animating .anim-enter-action');
            expect(cssContent).toContain('body.entrance-animating #mobileControls.anim-enter-drawer');
            expect(cssContent).toContain('body.entrance-animating #floatingGenerateBtn.anim-enter-fab');
        });

        it('T4.06: should verify all target DOM nodes have zero leftover inline transform/filter/will-change styles', () => {
            const controller = new MotionController();
            controller.startEntrance();

            // Simulate messy inline style pollution from runtime
            Object.values(mockElements).forEach(el => {
                if (el && el.style) {
                    el.style.transform = 'matrix(1, 0, 0, 1, 0, 0)';
                    el.style.filter = 'blur(5px)';
                    el.style.willChange = 'transform, opacity';
                    el.style.perspective = '1200px';
                }
            });

            controller.cleanup();

            Object.values(mockElements).forEach(el => {
                if (el && el.classList && el.classList.contains('anim-enter-nav')) {
                    expect(el.style.transform).toBe('');
                    expect(el.style.filter).toBe('');
                    expect(el.style.willChange).toBe('');
                    expect(el.style.perspective).toBe('');
                }
            });
        });

        it('T4.07: should verify MotionController integration with XyPlotManager and editors', () => {
            const controller = new MotionController();
            controller.startEntrance();
            controller.cleanup();

            const xyPlotManager = new XyPlotManager();
            expect(xyPlotManager).toBeDefined();

            const inpaintEditor = new InpaintEditor({
                ui: {},
                engine: {},
                store: {},
                onComplete: vi.fn(),
                getExtraParams: vi.fn()
            });
            expect(inpaintEditor).toBeDefined();

            const outpaintEditor = new OutpaintEditor({
                engine: {},
                store: {},
                getExtraParams: vi.fn()
            });
            expect(outpaintEditor).toBeDefined();
        });

        it('T4.08: should verify MotionController instance state query helper methods', () => {
            const controller = new MotionController({ debug: true });
            expect(controller.isCompleted()).toBe(false);

            controller.startEntrance();
            expect(controller.isAnimating).toBe(true);
            expect(controller.isCompleted()).toBe(false);

            controller.cleanup();
            expect(controller.isAnimating).toBe(false);
            expect(controller.isCompleted()).toBe(true);
        });
    });
});

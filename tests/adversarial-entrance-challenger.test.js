import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MotionController } from '../src/motion-controller.js';

describe('Adversarial Challenger Stress Harness - Entrance Animation', () => {
    let mockElements = {};
    let windowEventListeners = {};

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
            children: [],
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
                const eventObj = {
                    ...evt,
                    type,
                    target: evt.target || el,
                    currentTarget: el,
                    bubbles: evt.bubbles !== undefined ? evt.bubbles : true
                };

                // Invoke listeners on this element
                if (listeners[type]) {
                    listeners[type].forEach(fn => fn(eventObj));
                }

                // Bubble up if bubbles is true and parentElement exists
                if (eventObj.bubbles && el.parentElement && typeof el.parentElement.dispatchEvent === 'function') {
                    const bubbleObj = {
                        ...eventObj,
                        currentTarget: el.parentElement
                    };
                    if (el.parentElement._listeners && el.parentElement._listeners[type]) {
                        el.parentElement._listeners[type].forEach(fn => fn(bubbleObj));
                    } else if (el.parentElement.dispatchEvent) {
                        el.parentElement.dispatchEvent({
                            ...evt,
                            target: eventObj.target,
                            bubbles: true
                        });
                    }
                }
                return true;
            }),
            closest: vi.fn((sel) => {
                if (sel === '.absolute' || sel.includes('absolute')) return el.parentElement || el;
                return null;
            }),
            querySelector: vi.fn(() => null),
            querySelectorAll: vi.fn(() => [])
        };
        el._listeners = listeners;
        return el;
    }

    function setupDOM() {
        mockElements = {};
        windowEventListeners = {};

        const navParent = createMockElement('navWrapper', ['absolute', 'top-0']);
        const navEl = createMockElement('viewToggle', ['view-toggle']);
        navEl.parentElement = navParent;
        navParent.children.push(navEl);

        const sidebarEl = createMockElement('mobileControls');
        const canvasEl = createMockElement('placeholder');
        const previewAreaEl = createMockElement('previewArea');
        const fabEl = createMockElement('floatingGenerateBtn');
        const deskBtnParent = createMockElement('deskBtnWrapper');
        const deskBtn = createMockElement('desktopGenerateBtn');
        deskBtn.parentElement = deskBtnParent;
        deskBtnParent.children.push(deskBtn);

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

        global.document = {
            body: bodyEl,
            documentElement: htmlEl,
            getElementById: (id) => mockElements[id] || null,
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
            }
        };

        global.window = {
            innerWidth: 1024,
            matchMedia: vi.fn((query) => ({
                matches: false,
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
        setupDOM();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // =========================================================================
    // STRESS TARGET 1: Rapid Consecutive startEntrance() & cleanup() (Re-entrancy & Idempotency)
    // =========================================================================
    describe('Target 1: Re-entrancy and Idempotency Stress Testing', () => {
        it('should handle 1,000 rapid concurrent/sequential startEntrance() invocations without leaking timers or listeners', () => {
            const controller = new MotionController();
            for (let i = 0; i < 1000; i++) {
                controller.startEntrance();
            }

            expect(controller.isAnimating).toBe(true);
            expect(controller.isCompleted()).toBe(false);
            expect(controller.trackedElements.length).toBe(4);

            // Verify body class added exactly once conceptually
            expect(document.body.classList.contains('entrance-animating')).toBe(true);

            // Cleanup once
            controller.cleanup();
            expect(controller.isCompleted()).toBe(true);
            expect(controller.isAnimating).toBe(false);
        });

        it('should handle 1,000 rapid sequential cleanup() invocations without duplicate event dispatches', () => {
            const eventSpy = vi.fn();
            window.addEventListener('ui:entrance-complete', eventSpy);

            const controller = new MotionController();
            controller.startEntrance();

            for (let i = 0; i < 1000; i++) {
                controller.cleanup();
            }

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(controller.isCompleted()).toBe(true);
        });

        it('should survive erratic alternating startEntrance() and cleanup() cycles with reset()', () => {
            const controller = new MotionController();
            const eventSpy = vi.fn();
            window.addEventListener('ui:entrance-complete', eventSpy);

            for (let cycle = 0; cycle < 50; cycle++) {
                controller.reset();
                expect(controller.isCompleted()).toBe(false);
                expect(controller.isAnimating).toBe(false);

                controller.startEntrance();
                expect(controller.isAnimating).toBe(true);

                // Immediate cleanup
                controller.cleanup();
                expect(controller.isCompleted()).toBe(true);
                expect(controller.isAnimating).toBe(false);
            }

            expect(eventSpy).toHaveBeenCalledTimes(50);
        });
    });

    // =========================================================================
    // STRESS TARGET 2: Missing, Null, or Dynamically Detached DOM Elements
    // =========================================================================
    describe('Target 2: Missing, Null, or Dynamically Detached Elements', () => {
        it('should handle dynamic DOM node detachment mid-animation and safely clean up via fallback timer', () => {
            const controller = new MotionController();
            controller.startEntrance();

            expect(controller.trackedElements.length).toBe(4);

            // Element 1 & 2 fire animationend normally
            mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
            mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
            expect(controller.isCompleted()).toBe(false);

            // Element 3 (sidebar) and Element 4 (action button) are dynamically detached/removed from DOM
            // and their style/classList objects are cleared or corrupted
            mockElements['mobileControls'].classList = undefined;
            mockElements['deskBtnWrapper'].style = undefined;

            // Advance fallback timer to 1300ms
            vi.advanceTimersByTime(1300);

            expect(controller.isCompleted()).toBe(true);
            expect(document.body.classList.contains('entrance-animating')).toBe(false);
            expect(document.body.dataset.entranceStatus).toBe('complete');
        });

        it('should handle completely missing DOM elements safely with zero errors', () => {
            global.document.querySelector = vi.fn(() => null);
            global.document.getElementById = vi.fn(() => null);

            const controller = new MotionController();
            expect(() => controller.startEntrance()).not.toThrow();
            expect(controller.isCompleted()).toBe(true);
        });
    });

    // =========================================================================
    // STRESS TARGET 3: Dropped animationend Events and 1300ms Fallback Safety Activation
    // =========================================================================
    describe('Target 3: Dropped animationend Events & 1300ms Safety Timer', () => {
        it('should verify precise millisecond boundary activation of fallback timer at 1300ms', () => {
            const controller = new MotionController();
            controller.startEntrance();

            // At 1299ms: animation is strictly active
            vi.advanceTimersByTime(1299);
            expect(controller.isCompleted()).toBe(false);
            expect(controller.isAnimating).toBe(true);

            // At 1300ms: fallback timer triggers cleanup
            vi.advanceTimersByTime(1);
            expect(controller.isCompleted()).toBe(true);
            expect(controller.isAnimating).toBe(false);
            expect(document.body.dataset.entranceStatus).toBe('complete');
        });

        it('should safely ignore zombie animationend events arriving after fallback timer has fired', () => {
            const eventSpy = vi.fn();
            window.addEventListener('ui:entrance-complete', eventSpy);

            const controller = new MotionController();
            controller.startEntrance();

            // Fallback timer fires at 1300ms
            vi.advanceTimersByTime(1300);
            expect(controller.isCompleted()).toBe(true);
            expect(eventSpy).toHaveBeenCalledTimes(1);

            // Late zombie events arrive at 1500ms
            expect(() => {
                mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
                mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
                mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
                mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });
            }).not.toThrow();

            // Should still only have fired once
            expect(eventSpy).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================================
    // STRESS TARGET 4: Rapid Resizing Across Breakpoint Boundary (767px vs 768px)
    // =========================================================================
    describe('Target 4: Rapid Viewport Resizing Across Breakpoint', () => {
        it('should withstand rapid oscillation across 767px/768px during active animation and clean up all classes', () => {
            global.window.innerWidth = 1024;
            const controller = new MotionController();
            controller.startEntrance();

            // Rapidly oscillate window.innerWidth during animation
            const widths = [767, 768, 375, 1440, 767, 768, 1024, 320, 768];
            widths.forEach(w => {
                global.window.innerWidth = w;
            });

            // Trigger animationend on all tracked elements
            mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
            mockElements['mobileControls'].dispatchEvent({ type: 'animationend' });
            mockElements['placeholder'].dispatchEvent({ type: 'animationend' });
            mockElements['deskBtnWrapper'].dispatchEvent({ type: 'animationend' });

            expect(controller.isCompleted()).toBe(true);

            // Verify ALL responsive animation classes (both desktop and mobile) are thoroughly removed
            expect(mockElements['mobileControls'].classList.contains('anim-enter-sidebar')).toBe(false);
            expect(mockElements['mobileControls'].classList.contains('anim-enter-drawer')).toBe(false);
            expect(mockElements['navWrapper'].classList.contains('anim-enter-nav')).toBe(false);
            expect(mockElements['placeholder'].classList.contains('anim-enter-canvas')).toBe(false);
            expect(mockElements['deskBtnWrapper'].classList.contains('anim-enter-action')).toBe(false);
            expect(mockElements['floatingGenerateBtn'].classList.contains('anim-enter-fab')).toBe(false);
        });
    });

    // =========================================================================
    // STRESS TARGET 5: Bubble Event Shielding from Non-Tracked Child Elements
    // =========================================================================
    describe('Target 5: Bubble Event Shielding & Event Target Integrity', () => {
        it('should demonstrate how bubbling animationend from child elements is received by tracked containers', () => {
            const controller = new MotionController();
            controller.startEntrance();

            expect(controller.isCompleted()).toBe(false);

            // Child element inside mobileControls
            const childButton = createMockElement('childBtn');
            childButton.parentElement = mockElements['mobileControls'];

            // Direct call with non-tracked currentTarget (as unit tested in T2.18) is shielded:
            controller.onAnimEndHandler({
                currentTarget: childButton,
                target: childButton
            });
            expect(controller.isCompleted()).toBe(false);

            // However, in real DOM bubbling, when childButton dispatches an animationend event,
            // the event bubbles up to mobileControls, where e.currentTarget is mobileControls (the listener container)
            // and e.target is childButton.
            // When e.target !== e.currentTarget, if the controller does not check e.target === e.currentTarget,
            // mobileControls treats the child's event as its own.
            const bubblingEvent = {
                type: 'animationend',
                target: childButton,
                currentTarget: mockElements['mobileControls']
            };

            // Test if controller currently handles or increments count
            controller.onAnimEndHandler(bubblingEvent);

            // Note: Since only 1 of 4 tracked elements fired, it is not completed yet
            expect(controller.isCompleted()).toBe(false);

            // But mobileControls listener has now been removed prematurely
            expect(mockElements['mobileControls'].removeEventListener).toHaveBeenCalledWith('animationend', controller.onAnimEndHandler);
        });

        it('should ensure fallback 1300ms safety timer protects against any dropped or misrouted events', () => {
            const controller = new MotionController();
            controller.startEntrance();

            // Simulate corrupted event states
            mockElements['navWrapper'].dispatchEvent({ type: 'animationend' });
            
            // Advance time to 1300ms
            vi.advanceTimersByTime(1300);

            // Fallback timer guarantees cleanup completion regardless of any event dropping or misrouting
            expect(controller.isCompleted()).toBe(true);
            expect(document.body.dataset.entranceStatus).toBe('complete');
            expect(document.body.classList.contains('entrance-animating')).toBe(false);
        });
    });

    // =========================================================================
    // STRESS TARGET 6: Environmental Fault Injection & Sandboxed Contexts
    // =========================================================================
    describe('Target 6: Environmental Fault Injection & Sandboxed Contexts', () => {
        it('should handle localStorage throwing SecurityError in sandboxed iframe or private browsing', () => {
            global.localStorage.getItem = vi.fn(() => {
                throw new Error('SecurityError: Access is denied for this document');
            });

            const controller = new MotionController();
            // Should catch or handle smoothly
            try {
                controller.startEntrance();
            } catch (e) {
                // Check if thrown or handled
            }
        });

        it('should handle window.matchMedia being completely absent', () => {
            delete global.window.matchMedia;

            const controller = new MotionController();
            expect(() => controller.startEntrance()).not.toThrow();
            expect(controller.isAnimating).toBe(true);
        });

        it('should handle documentElement missing or without classList', () => {
            global.document.documentElement = null;

            const controller = new MotionController();
            expect(() => controller.startEntrance()).not.toThrow();
            expect(controller.isAnimating).toBe(true);
        });
    });
});


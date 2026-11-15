/**
 * Motion Controller Module
 * Manages compositor-accelerated entrance animations, responsive desktop/mobile branching,
 * 2-tier absolute state cleanup (animationend aggregation + 1300ms fallback safety timer),
 * and shared Node-safe reduced-motion / top-layer enter-exit / stagger / view-transition helpers.
 */

const _motionTokens = new WeakMap();
const _activeExits = new WeakMap();

function safeQuerySelector(selector, context = typeof document !== 'undefined' ? document : null) {
    try {
        if (context && typeof context.querySelector === 'function') {
            return context.querySelector(selector);
        }
    } catch (e) {
        // Fallback gracefully on query failure
    }
    return null;
}

function safeGetElementById(id) {
    try {
        if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
            return document.getElementById(id);
        }
    } catch (e) {
        // Fallback gracefully on element lookup failure
    }
    return null;
}

function splitClasses(cls) {
    if (!cls) return [];
    if (Array.isArray(cls)) return cls.flatMap(splitClasses);
    return String(cls).trim().split(/\s+/).filter(Boolean);
}

function applyClasses(el, cls, method) {
    if (!el || !el.classList || typeof el.classList[method] !== 'function') return;
    for (const token of splitClasses(cls)) {
        try {
            el.classList[method](token);
        } catch (_) {}
    }
}

function focusTargetElement(focusTarget) {
    if (!focusTarget) return;
    try {
        const target = typeof focusTarget === 'string'
            ? safeQuerySelector(focusTarget)
            : focusTarget;
        if (target && typeof target.focus === 'function') {
            try {
                target.focus({ preventScroll: true });
            } catch (_) {
                target.focus();
            }
        }
    } catch (_) {}
}

export class MotionController {
    /**
     * @param {Object} [options]
     */
    constructor(options = {}) {
        this.options = options;
        this.isDone = false;
        this.isAnimating = false;
        this.timeoutId = null;
        this.trackedElements = [];
        this.onAnimEndHandler = null;
        this._canTransitionDisplay = null;
    }

    /**
     * Returns true when reduced motion is active via system preference or low-perf mode.
     * Safe in Node/SSR and sandboxed contexts where localStorage or matchMedia may throw.
     * @returns {boolean}
     */
    prefersReducedMotion() {
        let isReducedMotion = false;
        try {
            if (typeof window !== 'undefined' && window.matchMedia) {
                isReducedMotion = !!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            }
        } catch (_) {
            isReducedMotion = false;
        }

        let isLowPerf = false;
        try {
            const hasLowPerfClass = typeof document !== 'undefined' &&
                !!(document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('low-perf'));
            const hasLowPerfStorage = typeof localStorage !== 'undefined' &&
                (localStorage.getItem('settings_low_perf') === 'true' || localStorage.getItem('nai_low_perf') === 'true');
            isLowPerf = !!(hasLowPerfClass || hasLowPerfStorage);
        } catch (_) {
            isLowPerf = false;
        }

        return isReducedMotion || isLowPerf;
    }

    /**
     * Cached runtime probe for discrete display / overlay transition support
     * (avoids relying on display animation when Firefox bug 1882408 / missing overlay applies).
     * Never reads layout geometry properties.
     * @returns {boolean}
     */
    canTransitionDisplay() {
        if (this._canTransitionDisplay !== null) {
            return this._canTransitionDisplay;
        }
        if (typeof document === 'undefined' || typeof window === 'undefined' || !document.body) {
            return false;
        }

        let supported = false;
        let probe = null;
        try {
            const hasCssSupports = typeof CSS !== 'undefined' && typeof CSS.supports === 'function';
            const supportsAllowDiscrete = hasCssSupports && CSS.supports('transition-behavior', 'allow-discrete');
            const supportsOverlay = hasCssSupports && CSS.supports('overlay', 'auto');

            if (supportsAllowDiscrete && supportsOverlay && typeof document.createElement === 'function') {
                probe = document.createElement('div');
                probe.setAttribute('aria-hidden', 'true');
                probe.style.position = 'fixed';
                probe.style.pointerEvents = 'none';
                probe.style.opacity = '0';
                probe.style.display = 'none';
                probe.style.transitionProperty = 'opacity, display, overlay';
                probe.style.transitionDuration = '10ms';
                probe.style.transitionBehavior = 'allow-discrete';
                document.body.appendChild(probe);

                const computed = typeof window.getComputedStyle === 'function'
                    ? window.getComputedStyle(probe)
                    : null;
                supported = !computed || computed.transitionBehavior === 'allow-discrete';
            }
        } catch (_) {
            supported = false;
        } finally {
            if (probe && probe.parentNode) {
                try { probe.parentNode.removeChild(probe); } catch (_) {}
            }
        }

        this._canTransitionDisplay = supported;
        return supported;
    }

    _nextToken(el) {
        if (!el || (typeof el !== 'object' && typeof el !== 'function')) return 0;
        const next = (_motionTokens.get(el) || 0) + 1;
        _motionTokens.set(el, next);
        return next;
    }

    _cancelPendingExit(el) {
        if (!el || (typeof el !== 'object' && typeof el !== 'function')) return;
        const active = _activeExits.get(el);
        if (active && active.timerId) {
            try { clearTimeout(active.timerId); } catch (_) {}
        }
        _activeExits.delete(el);
    }

    /**
     * Reveal an element cleanly, clearing any pending exit state and awaiting active animations.
     * @param {Element|null} el
     * @param {Object} [opts]
     * @returns {Promise<Element|null>}
     */
    enter(el, { hiddenClass = 'hidden', openClass, activeClass, display, closingAttr = 'data-closing' } = {}) {
        if (!el) return Promise.resolve(null);

        this._nextToken(el);
        this._cancelPendingExit(el);

        try { el.removeAttribute?.(closingAttr); } catch (_) {}
        if (display !== undefined && el.style) {
            el.style.display = display;
        }
        if (hiddenClass) {
            applyClasses(el, hiddenClass, 'remove');
        }
        if (openClass) {
            applyClasses(el, openClass, 'add');
        }
        if (activeClass) {
            applyClasses(el, activeClass, 'add');
        }

        if (this.prefersReducedMotion() || typeof el.getAnimations !== 'function') {
            return Promise.resolve(el);
        }

        let animations = [];
        try {
            animations = el.getAnimations() || [];
        } catch (_) {
            animations = [];
        }

        if (!animations.length) {
            return Promise.resolve(el);
        }

        return Promise.allSettled(animations.map(anim => anim?.finished).filter(Boolean)).then(() => el);
    }

    /**
     * Hide an element with closing-state transitions, reduced-motion immediate completion,
     * and race-safe cancellation when re-opened mid-exit.
     * @param {Element|null} el
     * @param {Object} [opts]
     * @returns {Promise<Element|null>}
     */
    exit(el, {
        closingAttr = 'data-closing',
        hiddenClass = 'hidden',
        openClass,
        activeClass,
        display,
        timeoutMs = 320,
        onFinish
    } = {}) {
        if (!el) return Promise.resolve(null);

        const token = this._nextToken(el);
        this._cancelPendingExit(el);

        if (openClass) {
            applyClasses(el, openClass, 'remove');
        }
        if (activeClass) {
            applyClasses(el, activeClass, 'remove');
        }

        try { el.setAttribute?.(closingAttr, 'true'); } catch (_) {}

        let finalized = false;
        const finalize = () => {
            if (finalized) return;
            finalized = true;
            const currentToken = (typeof el === 'object' || typeof el === 'function') ? _motionTokens.get(el) : token;
            const active = (typeof el === 'object' || typeof el === 'function') ? _activeExits.get(el) : null;
            if (active && active.timerId) {
                try { clearTimeout(active.timerId); } catch (_) {}
                _activeExits.delete(el);
            }
            if (currentToken !== token) return;

            try { el.removeAttribute?.(closingAttr); } catch (_) {}
            if (hiddenClass) {
                applyClasses(el, hiddenClass, 'add');
            }
            if (display !== undefined && el.style) {
                el.style.display = display;
            }
            if (typeof onFinish === 'function') {
                onFinish(el);
            }
        };

        let animations = [];
        if (!this.prefersReducedMotion() && typeof el.getAnimations === 'function') {
            try {
                animations = el.getAnimations() || [];
            } catch (_) {
                animations = [];
            }
        }

        if (this.prefersReducedMotion() || typeof el.getAnimations !== 'function' || animations.length === 0) {
            finalize();
            return Promise.resolve(el);
        }

        return new Promise((resolve) => {
            const finishAndResolve = () => {
                finalize();
                resolve(el);
            };
            const timerId = setTimeout(finishAndResolve, timeoutMs);
            if (typeof el === 'object' || typeof el === 'function') {
                _activeExits.set(el, { timerId, token });
            }
            Promise.allSettled(animations.map(anim => anim?.finished).filter(Boolean))
                .then(finishAndResolve, finishAndResolve);
        });
    }

    /**
     * Populates `--sibling-index` fallback custom properties when CSS `sibling-index()` is unsupported.
     * @param {Element|null} container
     * @param {string} [itemSelector=':scope > *']
     * @param {number} [max=10]
     */
    setStaggerIndices(container, itemSelector = ':scope > *', max = 10) {
        if (!container) return;

        const supportsNativeSiblingIndex = typeof CSS !== 'undefined' &&
            typeof CSS.supports === 'function' &&
            CSS.supports('animation-delay', 'calc(sibling-index() * 0.1s)');
        if (supportsNativeSiblingIndex) return;

        let items = [];
        try {
            if (typeof container.querySelectorAll === 'function') {
                items = Array.from(container.querySelectorAll(itemSelector));
            } else if (container.children) {
                items = Array.from(container.children);
            }
        } catch (_) {
            if (itemSelector === ':scope > *' && container.children) {
                items = Array.from(container.children);
            }
        }

        items.forEach((item, index) => {
            const clamped = Math.min(index, max);
            try {
                item?.style?.setProperty?.('--sibling-index', String(clamped));
            } catch (_) {}
        });
    }

    /**
     * Executes a DOM update inside `document.startViewTransition` when permitted,
     * restoring focus after completion.
     * @param {Function} updateDom
     * @param {Object} [opts]
     * @returns {Promise<any>}
     */
    async withViewTransition(updateDom, { focusTarget } = {}) {
        if (typeof updateDom !== 'function') {
            focusTargetElement(focusTarget);
            return undefined;
        }

        const canUseVT = !this.prefersReducedMotion() &&
            typeof document !== 'undefined' &&
            typeof document.startViewTransition === 'function';

        if (!canUseVT) {
            const result = await updateDom();
            focusTargetElement(focusTarget);
            return result;
        }

        try {
            const vt = document.startViewTransition(() => updateDom());
            if (vt && vt.finished && typeof vt.finished.then === 'function') {
                try {
                    await vt.finished;
                } catch (_) {
                    // Ignore aborted transitions (e.g., rapid successive updates)
                }
            }
            focusTargetElement(focusTarget);
            return vt;
        } catch (_) {
            const result = await updateDom();
            focusTargetElement(focusTarget);
            return result;
        }
    }

    /**
     * Initiates entrance animation lifecycle
     */
    startEntrance() {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            this.cleanup();
            return;
        }

        if (this.isDone || this.isAnimating) {
            return;
        }

        try {
            // 1. Accessibility & Low Performance checks
            if (this.prefersReducedMotion()) {
                this.cleanup();
                return;
            }

            this.isAnimating = true;

            // 2. Identify target elements
            const isDesktop = (typeof window.innerWidth === 'number' ? window.innerWidth : 1024) >= 768;

            const toggleEl = safeQuerySelector('.view-toggle');
            let navEl = null;
            try {
                navEl = toggleEl?.closest?.('.absolute') ||
                    safeQuerySelector('div.absolute.top-0') ||
                    safeGetElementById('viewToggle');
            } catch (e) {
                navEl = safeGetElementById('viewToggle');
            }

            const sidebarEl = safeGetElementById('mobileControls');
            const canvasEl = safeGetElementById('placeholder') || safeGetElementById('previewArea');
            const fabEl = safeGetElementById('floatingGenerateBtn');
            const deskBtn = safeGetElementById('desktopGenerateBtn');
            const actionEl = deskBtn?.parentElement || deskBtn;

            // 3. Mark body with entrance-animating
            if (document.body && document.body.classList) {
                try {
                    document.body.classList.add('entrance-animating');
                } catch (e) {}
            }

            // 4. Attach animation classes
            try {
                if (navEl && navEl.classList) navEl.classList.add('anim-enter-nav');
                if (canvasEl && canvasEl.classList) canvasEl.classList.add('anim-enter-canvas');

                if (isDesktop) {
                    if (sidebarEl && sidebarEl.classList) sidebarEl.classList.add('anim-enter-sidebar');
                    if (actionEl && actionEl.classList) actionEl.classList.add('anim-enter-action');
                } else {
                    if (sidebarEl && sidebarEl.classList) sidebarEl.classList.add('anim-enter-drawer');
                    if (fabEl && fabEl.classList) fabEl.classList.add('anim-enter-fab');
                }
            } catch (e) {
                this.cleanup();
                return;
            }

            // 5. Track completion via animationend events
            this.trackedElements = [navEl, sidebarEl, canvasEl, isDesktop ? actionEl : fabEl].filter(Boolean);
            let completedCount = 0;
            const targetCount = this.trackedElements.length;

            if (targetCount === 0) {
                this.cleanup();
                return;
            }

            this.onAnimEndHandler = (e) => {
                try {
                    if (!this.trackedElements.includes(e?.currentTarget)) return;
                    completedCount++;
                    if (e?.currentTarget && typeof e.currentTarget.removeEventListener === 'function') {
                        try {
                            e.currentTarget.removeEventListener('animationend', this.onAnimEndHandler);
                        } catch (err) {}
                    }
                    if (completedCount >= targetCount) {
                        this.cleanup();
                    }
                } catch (err) {
                    this.cleanup();
                }
            };

            this.trackedElements.forEach(el => {
                if (el && typeof el.addEventListener === 'function') {
                    try {
                        el.addEventListener('animationend', this.onAnimEndHandler);
                    } catch (err) {}
                }
            });

            // 6. Safety fallback timer (1300ms)
            this.timeoutId = setTimeout(() => {
                this.cleanup();
            }, 1300);
        } catch (err) {
            this.cleanup();
        }
    }

    /**
     * Absolute State Cleanup - Removes all animation classes, clears temporary styles,
     * solidifies body status, and dispatches completion event.
     */
    cleanup() {
        if (this.isDone) return;
        this.isDone = true;
        this.isAnimating = false;

        if (this.timeoutId) {
            try {
                clearTimeout(this.timeoutId);
            } catch (e) {}
            this.timeoutId = null;
        }

        if (this.trackedElements && this.onAnimEndHandler) {
            this.trackedElements.forEach(el => {
                try {
                    if (el && typeof el.removeEventListener === 'function') {
                        el.removeEventListener('animationend', this.onAnimEndHandler);
                    }
                } catch (e) {}
            });
        }

        try {
            if (typeof document !== 'undefined' && document.body) {
                if (document.body.classList && typeof document.body.classList.remove === 'function') {
                    document.body.classList.remove('entrance-animating');
                }
                if (!document.body.dataset) {
                    document.body.dataset = {};
                }
                document.body.dataset.entranceStatus = 'complete';
            }
        } catch (e) {}

        const animatedClasses = [
            'anim-enter-nav',
            'anim-enter-sidebar',
            'anim-enter-canvas',
            'anim-enter-action',
            'anim-enter-drawer',
            'anim-enter-fab'
        ];

        if (typeof document !== 'undefined') {
            animatedClasses.forEach(cls => {
                try {
                    const elements = (document.querySelectorAll && typeof document.querySelectorAll === 'function')
                        ? document.querySelectorAll(`.${cls}`)
                        : [];
                    elements.forEach(el => {
                        try {
                            if (el.classList && typeof el.classList.remove === 'function') {
                                el.classList.remove(cls);
                            }
                            if (el.style) {
                                el.style.transform = '';
                                el.style.willChange = '';
                                el.style.filter = '';
                                el.style.perspective = '';
                                el.style.opacity = '';
                            }
                        } catch (e) {}
                    });
                } catch (e) {}
            });
        }

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            try {
                const event = typeof CustomEvent === 'function'
                    ? new CustomEvent('ui:entrance-complete')
                    : { type: 'ui:entrance-complete' };
                window.dispatchEvent(event);
            } catch (e) {
                // Ignore errors in mock testing environments
            }
        }
    }

    /**
     * Check if the entrance animation lifecycle is completed
     * @returns {boolean}
     */
    isCompleted() {
        return this.isDone;
    }

    /**
     * Reset controller state for test or re-trigger scenarios
     */
    reset() {
        this.isDone = false;
        this.isAnimating = false;
        if (this.timeoutId) {
            try {
                clearTimeout(this.timeoutId);
            } catch (e) {}
            this.timeoutId = null;
        }
    }
}

export const motionController = new MotionController();

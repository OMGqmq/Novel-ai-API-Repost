/**
 * Motion Controller Module
 * Manages compositor-accelerated entrance animations, responsive desktop/mobile branching,
 * and 2-tier absolute state cleanup (animationend aggregation + 1300ms fallback safety timer).
 */

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
            let isReducedMotion = false;
            try {
                isReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            } catch (e) {
                isReducedMotion = false;
            }

            let isLowPerf = false;
            try {
                isLowPerf = !!((document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('low-perf')) ||
                    (typeof localStorage !== 'undefined' && (localStorage.getItem('settings_low_perf') === 'true' || localStorage.getItem('nai_low_perf') === 'true')));
            } catch (e) {
                isLowPerf = false;
            }

            if (isReducedMotion || isLowPerf) {
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

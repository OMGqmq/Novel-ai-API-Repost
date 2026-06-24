/**
 * Settings Manager Module
 * Encapsulates settings persistence, double binding with DOM, and credentials verification.
 */
export class SettingsManager {
    constructor() {
        this.ui = null;
        this.store = null;
        this.callbacks = {};
    }

    bind(ui, store, callbacks = {}) {
        this.ui = ui;
        this.store = store;
        this.callbacks = callbacks;

        this._hydrateAndBind();
    }

    _hydrateAndBind() {
        const ui = this.ui;
        const store = this.store;
        const els = ui.els;

        // Helper to bind standard inputs
        const bindInput = (el, settingKey, eventType = 'input', onUpdate = null) => {
            if (!el) return;
            const saved = store.getSetting(settingKey);
            if (saved !== '') {
                el.value = saved;
                el.dispatchEvent(new Event(eventType, { bubbles: true }));
            }
            el.addEventListener(eventType, (e) => {
                const val = e.target.value;
                store.setSetting(settingKey, val);
                if (onUpdate) onUpdate(val);
            });
        };

        // Helper to bind checkboxes
        const bindCheckbox = (el, settingKey, defVal = 'false', onUpdate = null) => {
            if (!el) return;
            const saved = store.getSetting(settingKey, defVal) === 'true';
            el.checked = saved;
            el.addEventListener('change', (e) => {
                const checked = e.target.checked;
                store.setSetting(settingKey, checked ? 'true' : 'false');
                if (onUpdate) onUpdate(checked);
            });
        };

        // 1. Basic Prompts & Generation parameters
        bindInput(els.prompt, 'nai_prompt');
        bindInput(els.negative, 'nai_negative_prompt');
        bindInput(els.steps, 'nai_steps', 'input', (val) => {
            if (els.stepsVal) els.stepsVal.textContent = val;
        });
        bindInput(els.scale, 'nai_scale', 'input', (val) => {
            if (els.scaleVal) els.scaleVal.textContent = parseFloat(val).toFixed(1);
        });
        bindInput(els.sampler, 'nai_sampler', 'change');
        bindInput(els.resolution, 'nai_resolution', 'change');
        bindInput(els.noise_schedule, 'nai_noise_schedule', 'change');
        bindInput(els.strength, 'nai_strength', 'input', (val) => {
            if (els.strengthVal) els.strengthVal.textContent = val;
        });
        bindInput(els.noise, 'nai_noise', 'input', (val) => {
            if (els.noiseVal) els.noiseVal.textContent = val;
        });

        // 2. Advanced Parameters
        bindCheckbox(els.smEnabled, 'nai_sm', 'true');
        bindCheckbox(els.smDynEnabled, 'nai_sm_dyn', 'true');
        bindCheckbox(els.qualityToggleEnabled, 'nai_quality_toggle', 'false');
        bindCheckbox(els.dynThresholdEnabled, 'nai_dyn_threshold', 'false');

        bindInput(els.cfgRescale, 'nai_cfg_rescale', 'input', (val) => {
            const label = document.getElementById('cfgRescaleValue');
            if (label) label.textContent = parseFloat(val).toFixed(2);
        });
        bindInput(els.uncondScale, 'nai_uncond_scale', 'input', (val) => {
            const label = document.getElementById('uncondScaleValue');
            if (label) label.textContent = parseFloat(val).toFixed(2);
        });
        bindInput(els.skipCfg, 'nai_skip_cfg', 'input', (val) => {
            const label = document.getElementById('skipCfgValue');
            if (label) label.textContent = val;
        });

        // 3. V4.5 experimental checkboxes
        bindCheckbox(els.v45EulerBug, 'nai_v45_euler_bug', 'false');
        bindCheckbox(els.v45PreferBrownian, 'nai_v45_prefer_brownian', 'true');
        bindCheckbox(els.v45UseCoords, 'nai_v45_use_coords', 'true');
        bindCheckbox(els.v45UseOrder, 'nai_v45_use_order', 'true');
        bindCheckbox(els.v45NegUseOrder, 'nai_v45_neg_use_order', 'false');

        // 4. Low Performance mode
        const savedLowPerf = store.getSetting('low_perf') === 'true';
        if (els.settingsLowPerfCheckbox) {
            els.settingsLowPerfCheckbox.checked = savedLowPerf;
        }
        if (savedLowPerf) {
            document.documentElement.classList.add('low-perf');
        }
        ui.updateLowPerfUI(savedLowPerf);

        // 5. V4.5 Experimental Mode
        const savedV45Exp = store.getSetting('v4_5_experimental') === 'true';
        if (els.settingsV45ExperimentalCheckbox) {
            els.settingsV45ExperimentalCheckbox.checked = savedV45Exp;
        }

        // 6. Concurrency settings
        const savedKeyConcurrent = store.getSetting('nai_custom_key_concurrent') === 'true';
        if (els.settingsKeyConcurrentCheckbox) {
            els.settingsKeyConcurrentCheckbox.checked = savedKeyConcurrent;
        }

        // 7. VIP Credentials & Admin Status
        const savedAdminToken = localStorage.getItem('nai_admin_token') || '';
        if (els.adminTokenInput) {
            els.adminTokenInput.value = savedAdminToken;
        }
        if (savedAdminToken && els.adminTokenClearBtn) {
            els.adminTokenClearBtn.classList.remove('hidden');
        }

        const savedUserKey = localStorage.getItem('nai_user_key') || '';
        if (els.userKeyInput) {
            els.userKeyInput.value = savedUserKey;
        }
        if (savedUserKey && els.userKeyClearBtn) {
            els.userKeyClearBtn.classList.remove('hidden');
        }

        // 8. AI Prompt Helper settings hydration
        if (els.aiHelperBaseUrl) els.aiHelperBaseUrl.value = store.getSetting('ai_helper_base_url');
        if (els.aiHelperApiKey) els.aiHelperApiKey.value = store.getSetting('ai_helper_api_key');
        if (els.aiHelperModel) els.aiHelperModel.value = store.getSetting('ai_helper_model');
        if (els.aiHelperSystemPrompt) els.aiHelperSystemPrompt.value = store.getSetting('ai_helper_system_prompt');

        // 9. Bypass limits
        const savedBypass = store.getSetting('nai_bypass_limits') === 'true';
        if (els.bypassLimitsEnabled) {
            els.bypassLimitsEnabled.checked = savedBypass;
        }
        this.toggleBypassLimitsEnabled(savedBypass);

        // Restore Model & load Vibe/CharRef
        const savedModel = store.getSetting('nai_model_version', 'v3');
        ui.setModel(savedModel);
        if (this.callbacks.onModelChange) {
            this.callbacks.onModelChange(savedModel);
        }

        // Run initial admin check
        this.checkAdminStatus();

        if (this.callbacks.onHydrate) {
            this.callbacks.onHydrate();
        }
    }

    checkAdminStatus() {
        const token = localStorage.getItem('nai_admin_token');
        const customKey = localStorage.getItem('nai_custom_api_key');
        const isAdmin = !!token || !!customKey;
        const hasAdminToken = !!token;

        this.ui.updateAdminUI(isAdmin, hasAdminToken, customKey, (force) => {
            this.toggleBypassLimitsEnabled(force);
        });

        if (customKey && window.refreshAnlasDisplay) {
            window.refreshAnlasDisplay();
        }
    }

    saveAdminToken(token) {
        localStorage.setItem('nai_admin_token', token);
        if (this.ui.els.adminTokenClearBtn) {
            this.ui.els.adminTokenClearBtn.classList.remove('hidden');
        }
        this.checkAdminStatus();
    }

    clearAdminToken() {
        localStorage.removeItem('nai_admin_token');
        if (this.ui.els.adminTokenInput) {
            this.ui.els.adminTokenInput.value = '';
        }
        if (this.ui.els.adminTokenClearBtn) {
            this.ui.els.adminTokenClearBtn.classList.add('hidden');
        }
        this.checkAdminStatus();
    }

    saveUserKey(key) {
        localStorage.setItem('nai_user_key', key);
        if (this.ui.els.userKeyClearBtn) {
            this.ui.els.userKeyClearBtn.classList.remove('hidden');
        }
    }

    clearUserKey() {
        localStorage.removeItem('nai_user_key');
        if (this.ui.els.userKeyInput) {
            this.ui.els.userKeyInput.value = '';
        }
        if (this.ui.els.userKeyClearBtn) {
            this.ui.els.userKeyClearBtn.classList.add('hidden');
        }
    }

    saveAiHelperSettings(baseUrl, apiKey, model, systemPrompt) {
        this.store.setSetting('ai_helper_base_url', baseUrl);
        this.store.setSetting('ai_helper_api_key', apiKey);
        this.store.setSetting('ai_helper_model', model);
        this.store.setSetting('ai_helper_system_prompt', systemPrompt);
    }

    toggleLowPerf(enabled) {
        const html = document.documentElement;
        if (enabled) {
            html.classList.add('low-perf');
            this.store.setSetting('low_perf', 'true');
        } else {
            html.classList.remove('low-perf');
            this.store.setSetting('low_perf', 'false');
        }
        this.ui.updateLowPerfUI(enabled);
        if (this.ui.els.settingsLowPerfCheckbox) {
            this.ui.els.settingsLowPerfCheckbox.checked = enabled;
        }
    }

    toggleKeyConcurrent(enabled) {
        this.store.setSetting('nai_custom_key_concurrent', enabled ? 'true' : 'false');
        if (this.ui.els.settingsKeyConcurrentCheckbox) {
            this.ui.els.settingsKeyConcurrentCheckbox.checked = enabled;
        }
    }

    toggleV45Experimental(enabled) {
        this.store.setSetting('v4_5_experimental', enabled ? 'true' : 'false');
        if (this.ui.els.settingsV45ExperimentalCheckbox) {
            this.ui.els.settingsV45ExperimentalCheckbox.checked = enabled;
        }

        const eulerBugEl = this.ui.els.v45EulerBug;
        const preferBrownianEl = this.ui.els.v45PreferBrownian;
        const useCoordsEl = this.ui.els.v45UseCoords;
        const useOrderEl = this.ui.els.v45UseOrder;
        const negUseOrderEl = this.ui.els.v45NegUseOrder;

        if (enabled) {
            if (eulerBugEl) { eulerBugEl.checked = true; this.store.setSetting('nai_v45_euler_bug', 'true'); }
            if (preferBrownianEl) { preferBrownianEl.checked = false; this.store.setSetting('nai_v45_prefer_brownian', 'false'); }
            if (useCoordsEl) { useCoordsEl.checked = false; this.store.setSetting('nai_v45_use_coords', 'false'); }
            if (useOrderEl) { useOrderEl.checked = true; this.store.setSetting('nai_v45_use_order', 'true'); }
            if (negUseOrderEl) { negUseOrderEl.checked = true; this.store.setSetting('nai_v45_neg_use_order', 'true'); }
        } else {
            if (eulerBugEl) { eulerBugEl.checked = false; this.store.setSetting('nai_v45_euler_bug', 'false'); }
            if (preferBrownianEl) { preferBrownianEl.checked = true; this.store.setSetting('nai_v45_prefer_brownian', 'true'); }
            if (useCoordsEl) { useCoordsEl.checked = true; this.store.setSetting('nai_v45_use_coords', 'true'); }
            if (useOrderEl) { useOrderEl.checked = true; this.store.setSetting('nai_v45_use_order', 'true'); }
            if (negUseOrderEl) { negUseOrderEl.checked = false; this.store.setSetting('nai_v45_neg_use_order', 'false'); }
        }

        const currentModel = this.store.getSetting('nai_model_version', 'v3');
        this.ui.setModel(currentModel);
    }

    toggleBypassLimitsEnabled(forceState) {
        const checkbox = this.ui.els.bypassLimitsEnabled;
        if (!checkbox) return;

        let enabled = checkbox.checked;
        if (forceState !== undefined) {
            enabled = forceState;
            checkbox.checked = enabled;
        }

        this.store.setSetting('nai_bypass_limits', enabled.toString());

        const stepsEl = this.ui.els.steps;
        const stepsVal = this.ui.els.stepsVal;
        if (stepsEl) {
            if (enabled) {
                stepsEl.max = '50';
            } else {
                stepsEl.max = '28';
                if (parseInt(stepsEl.value, 10) > 28) {
                    stepsEl.value = '28';
                    if (stepsVal) stepsVal.textContent = '28';
                }
            }
        }

        this.updateResolutionOptions(enabled);
    }

    updateResolutionOptions(bypass) {
        const resEl = this.ui.els.resolution;
        if (!resEl) return;

        const standardResolutions = [
            { name: 'Portrait (832 x 1216)', value: '832,1216' },
            { name: 'Landscape (1216 x 832)', value: '1216,832' },
            { name: 'Square (1024 x 1024)', value: '1024,1024' }
        ];

        const xlResolutions = [
            { name: 'Portrait XL (1024 x 1536)', value: '1024,1536' },
            { name: 'Landscape XL (1536 x 1024)', value: '1536,1024' },
            { name: 'Square XL (1216 x 1216)', value: '1216,1216' }
        ];

        resEl.innerHTML = '';
        standardResolutions.forEach(r => {
            resEl.add(new Option(r.name, r.value));
        });

        if (bypass) {
            xlResolutions.forEach(r => {
                resEl.add(new Option(r.name, r.value));
            });
        }
    }
}

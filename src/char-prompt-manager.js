/**
 * Character Prompt Manager Module (V4.5 & V5 Multi-character feature)
 * Encapsulates DOM creation, interactive 2D free coordinate positioning, collapsing panels, and state persistence.
 */
export class CharPromptManager {
    constructor() {
        this.store = null;
    }

    bind(store) {
        this.store = store;
    }

    /**
     * Extracts active character prompts and coordinate metadata for payload building
     */
    getCharacterCaptions() {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return { charCaptions: [], hasCustomCoords: false };
        
        const rows = container.querySelectorAll('.character-prompt-row');
        const charCaptions = [];
        let hasCustomCoords = false;

        rows.forEach(row => {
            const enableToggle = row.querySelector('.char-enable-toggle');
            if (enableToggle && !enableToggle.checked) return;

            const promptInput = row.querySelector('.char-prompt-input');
            const negInput = row.querySelector('.char-neg-input');
            const posXInput = row.querySelector('.char-pos-x');
            const posYInput = row.querySelector('.char-pos-y');
            const autoPosCheckbox = row.querySelector('.char-auto-pos');

            const promptVal = promptInput ? promptInput.value.trim() : "";
            const negVal = negInput ? negInput.value.trim() : "";
            const x = posXInput ? parseFloat(posXInput.value) : 0.5;
            const y = posYInput ? parseFloat(posYInput.value) : 0.5;
            const isAutoPos = autoPosCheckbox ? autoPosCheckbox.checked : true;

            if (promptVal) {
                charCaptions.push({
                    prompt: promptVal,
                    negative_prompt: negVal,
                    x,
                    y,
                    autoPos: isAutoPos
                });
                if (!isAutoPos) hasCustomCoords = true;
            }
        });

        return { charCaptions, hasCustomCoords };
    }

    saveCharacterPromptsState() {
        const container = document.getElementById('characterPromptsContainer');
        if (!container || !this.store) return;
        const rows = container.querySelectorAll('.character-prompt-row');
        const list = [];
        rows.forEach(row => {
            const enableToggle = row.querySelector('.char-enable-toggle');
            const promptInput = row.querySelector('.char-prompt-input');
            const negInput = row.querySelector('.char-neg-input');
            const posXInput = row.querySelector('.char-pos-x');
            const posYInput = row.querySelector('.char-pos-y');
            const autoPosCheckbox = row.querySelector('.char-auto-pos');

            list.push({
                enabled: enableToggle ? enableToggle.checked : true,
                prompt: promptInput ? promptInput.value : '',
                negative: negInput ? negInput.value : '',
                x: posXInput ? parseFloat(posXInput.value) : 0.5,
                y: posYInput ? parseFloat(posYInput.value) : 0.5,
                autoPos: autoPosCheckbox ? autoPosCheckbox.checked : true
            });
        });
        this.store.setSetting('nai_v45_character_prompts', JSON.stringify(list));
    }

    addCharacterPromptRow(promptVal = '', negVal = '', x = 0.5, y = 0.5, autoPos = true, enabled = true, isInitializing = false) {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return;

        // V5 supports up to 22 character prompt rows
        const currentRows = container.querySelectorAll('.character-prompt-row');
        if (currentRows.length >= 22) {
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast("已达到最大角色数量限制 (最多 22 个角色)", "warning");
            }
            return;
        }

        const div = document.createElement('div');
        div.className = 'flex flex-col gap-2.5 character-prompt-row border border-gray-100 dark:border-slate-800 p-3 rounded-2xl bg-gray-50/50 dark:bg-slate-900/20 transition-all';

        const safeX = typeof x === 'number' && !isNaN(x) ? Math.max(0.01, Math.min(0.99, x)) : 0.5;
        const safeY = typeof y === 'number' && !isNaN(y) ? Math.max(0.01, Math.min(0.99, y)) : 0.5;

        div.innerHTML = `
            <div class="flex justify-between items-center select-none cursor-pointer char-row-header">
                <div class="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform duration-200 char-row-chevron transform rotate-90"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <span class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest character-index-label">角色</span>
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[120px] char-row-summary font-normal"></span>
                </div>
                <div class="flex items-center gap-1.5 char-row-actions">
                    <label class="flex items-center gap-1 cursor-pointer select-none text-[9px] text-gray-400 dark:text-gray-500 font-bold">
                        <input type="checkbox" class="char-enable-toggle sr-only peer" ${enabled ? 'checked' : ''}>
                        <div class="w-6 h-3.5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-green-600 relative scale-90"></div>
                        <span class="char-enable-text text-green-600 dark:text-green-500">已启用</span>
                    </label>
                    <button type="button" onclick="window.removeCharacterPromptRow(this)" class="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-400 hover:text-red-500 rounded-lg transition-all" title="删除角色">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                </div>
            </div>
            <div class="char-row-content space-y-2">
                <div class="space-y-1">
                    <label class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">描述提示词 (Character Prompt)</label>
                    <input type="text" class="char-prompt-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${promptVal}" placeholder="填入角色特征tag，例如: 1girl, blond hair, blue eyes" />
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">排除词 (Character Negative, 可选)</label>
                    <input type="text" class="char-neg-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${negVal}" placeholder="特定于该角色的排除特征，默认为空" />
                </div>
                <div class="space-y-1 mt-2">
                    <div class="flex justify-between items-center text-[9px] text-gray-400 dark:text-gray-500">
                        <span>角色定位 (Position - 自由选点)</span>
                        <label class="flex items-center gap-1 cursor-pointer select-none">
                            <input type="checkbox" class="char-auto-pos sr-only peer" ${autoPos ? 'checked' : ''}>
                            <div class="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 relative scale-90"></div>
                            <span>AI 自动位置</span>
                        </label>
                    </div>

                    <!-- 自由 2D 连续坐标定位画板 -->
                    <div class="char-pos-box-wrapper ${autoPos ? 'hidden' : ''} mt-2 flex flex-col gap-2">
                        <div class="char-pos-pad relative w-full h-32 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-100/90 dark:bg-slate-900/80 overflow-hidden cursor-crosshair select-none touch-none shadow-inner">
                            <!-- 九宫格与中心辅助线 -->
                            <div class="absolute inset-0 pointer-events-none opacity-25 dark:opacity-35">
                                <div class="absolute left-1/3 inset-y-0 border-l border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute left-2/3 inset-y-0 border-l border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute top-1/3 inset-x-0 border-t border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute top-2/3 inset-x-0 border-t border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-indigo-500/60 bg-indigo-500/20"></div>
                            </div>
                            
                            <!-- 坐标实时显示浮标 -->
                            <div class="absolute top-1.5 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[9px] font-mono text-white/90 pointer-events-none select-none char-pos-coords">
                                X: ${(safeX * 100).toFixed(0)}% | Y: ${(safeY * 100).toFixed(0)}%
                            </div>
                            
                            <!-- 自由定位标记 Pin -->
                            <div class="char-pos-pin absolute w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg border-2 border-white dark:border-slate-800 flex items-center justify-center text-[11px] font-extrabold cursor-grab active:cursor-grabbing hover:scale-110 active:scale-95 transition-[transform,box-shadow] select-none"
                                 style="left: ${safeX * 100}%; top: ${safeY * 100}%; transform: translate(-50%, -50%);">
                                <span class="char-pos-pin-index pointer-events-none">1</span>
                            </div>
                        </div>

                        <!-- 快速对齐预设 -->
                        <div class="flex items-center justify-between px-1">
                            <span class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">快速对齐:</span>
                            <div class="flex gap-1 char-presets-container">
                                <button type="button" class="char-preset-btn px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-[9px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer" data-x="0.2" data-y="0.5">左</button>
                                <button type="button" class="char-preset-btn px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-[9px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer" data-x="0.5" data-y="0.5">居中</button>
                                <button type="button" class="char-preset-btn px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-[9px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer" data-x="0.8" data-y="0.5">右</button>
                                <button type="button" class="char-preset-btn px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-[9px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer" data-x="0.5" data-y="0.25">上方</button>
                                <button type="button" class="char-preset-btn px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-[9px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer" data-x="0.5" data-y="0.75">下方</button>
                            </div>
                        </div>

                        <!-- 隐藏输入框以保存坐标 -->
                        <input type="hidden" class="char-pos-x" value="${safeX}" />
                        <input type="hidden" class="char-pos-y" value="${safeY}" />
                    </div>
                </div>
            </div>
        `;
        
        const enableToggle = div.querySelector('.char-enable-toggle');
        const enableText = div.querySelector('.char-enable-text');
        const inputs = div.querySelectorAll('.char-prompt-input, .char-neg-input, .char-auto-pos');
        
        const applyEnabledState = (isEnabled) => {
            if (isEnabled) {
                enableText.textContent = "已启用";
                enableText.className = "char-enable-text text-green-600 dark:text-green-500";
                div.classList.remove('opacity-60');
                inputs.forEach(input => input.disabled = false);
            } else {
                enableText.textContent = "已禁用";
                enableText.className = "char-enable-text text-gray-400 dark:text-gray-500";
                div.classList.add('opacity-60');
                inputs.forEach(input => input.disabled = true);
            }
        };

        enableToggle.addEventListener('change', (e) => {
            applyEnabledState(e.target.checked);
            this.saveCharacterPromptsState();
        });

        applyEnabledState(enabled);

        // 监听折叠/展开
        const rowHeader = div.querySelector('.char-row-header');
        const rowContent = div.querySelector('.char-row-content');
        const rowChevron = div.querySelector('.char-row-chevron');
        const rowActions = div.querySelector('.char-row-actions');

        if (rowHeader && rowContent && rowChevron) {
            rowHeader.addEventListener('click', () => {
                const isCollapsed = rowContent.classList.contains('hidden');
                if (isCollapsed) {
                    rowContent.classList.remove('hidden');
                    rowChevron.classList.add('rotate-90');
                } else {
                    rowContent.classList.add('hidden');
                    rowChevron.classList.remove('rotate-90');
                }
            });
        }

        // 阻止右侧按钮冒泡，以防止点击它们时触发折叠
        if (rowActions) {
            rowActions.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 角色提示词摘要实时显示并保存状态
        const promptInput = div.querySelector('.char-prompt-input');
        const summarySpan = div.querySelector('.char-row-summary');
        const updateSummary = () => {
            if (!promptInput || !summarySpan) return;
            const val = promptInput.value.trim();
            if (val) {
                const cleanVal = val.replace(/[\{\}\[\]\(\)]/g, '').trim();
                summarySpan.textContent = `(${cleanVal.length > 18 ? cleanVal.slice(0, 18) + '...' : cleanVal})`;
            } else {
                summarySpan.textContent = '';
            }
        };
        if (promptInput) {
            promptInput.addEventListener('input', () => {
                updateSummary();
                this.saveCharacterPromptsState();
            });
            updateSummary();
        }

        // 排除词修改保存
        const negInput = div.querySelector('.char-neg-input');
        if (negInput) {
            negInput.addEventListener('input', () => this.saveCharacterPromptsState());
        }

        // 自由选点交互逻辑 (Pointer Events + Dragging)
        const pad = div.querySelector('.char-pos-pad');
        const pin = div.querySelector('.char-pos-pin');
        const coordsLabel = div.querySelector('.char-pos-coords');
        const posXInput = div.querySelector('.char-pos-x');
        const posYInput = div.querySelector('.char-pos-y');
        const autoPosCheckbox = div.querySelector('.char-auto-pos');
        const posBoxWrapper = div.querySelector('.char-pos-box-wrapper');

        const updatePosition = (clientX, clientY) => {
            if (!pad || !posXInput || !posYInput) return;
            const rect = pad.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            
            let normX = (clientX - rect.left) / rect.width;
            let normY = (clientY - rect.top) / rect.height;
            normX = Math.max(0.01, Math.min(0.99, normX));
            normY = Math.max(0.01, Math.min(0.99, normY));

            const finalX = parseFloat(normX.toFixed(2));
            const finalY = parseFloat(normY.toFixed(2));

            posXInput.value = finalX;
            posYInput.value = finalY;

            if (pin) {
                pin.style.left = `${(finalX * 100).toFixed(1)}%`;
                pin.style.top = `${(finalY * 100).toFixed(1)}%`;
            }
            if (coordsLabel) {
                coordsLabel.textContent = `X: ${(finalX * 100).toFixed(0)}% | Y: ${(finalY * 100).toFixed(0)}%`;
            }
        };

        let isDragging = false;
        if (pad) {
            pad.addEventListener('pointerdown', (e) => {
                if (autoPosCheckbox && autoPosCheckbox.disabled) return;
                isDragging = true;
                try { pad.setPointerCapture(e.pointerId); } catch (_) {}
                updatePosition(e.clientX, e.clientY);
                this.saveCharacterPromptsState();
            });

            pad.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                updatePosition(e.clientX, e.clientY);
            });

            const endDrag = (e) => {
                if (isDragging) {
                    isDragging = false;
                    try { pad.releasePointerCapture(e.pointerId); } catch (_) {}
                    this.saveCharacterPromptsState();
                }
            };
            pad.addEventListener('pointerup', endDrag);
            pad.addEventListener('pointercancel', endDrag);
        }

        // 快速对齐预设点击
        const presetButtons = div.querySelectorAll('.char-preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetX = parseFloat(btn.getAttribute('data-x') || '0.5');
                const targetY = parseFloat(btn.getAttribute('data-y') || '0.5');
                this.setCharPosition(div, targetX, targetY);
            });
        });

        // 监听 AI 自动位置开关
        if (autoPosCheckbox && posBoxWrapper) {
            autoPosCheckbox.addEventListener('change', (e) => {
                if (autoPosCheckbox.disabled) return;
                if (e.target.checked) {
                    posBoxWrapper.classList.add('hidden');
                    if (posXInput) posXInput.value = "0.5";
                    if (posYInput) posYInput.value = "0.5";
                    if (pin) {
                        pin.style.left = "50%";
                        pin.style.top = "50%";
                    }
                    if (coordsLabel) {
                        coordsLabel.textContent = "X: 50% | Y: 50%";
                    }
                } else {
                    posBoxWrapper.classList.remove('hidden');
                }
                this.saveCharacterPromptsState();
            });
        }

        // 体验防呆：如果折叠面板隐藏，添加卡片时自动展开
        if (!isInitializing) {
            const panel = document.getElementById('characterPromptsPanel');
            if (panel && panel.classList.contains('hidden')) {
                if (window.toggleCharacterPromptsPanel) {
                    window.toggleCharacterPromptsPanel();
                }
            }
        }

        container.appendChild(div);
        this.updateCharacterIndexLabels();

        if (!isInitializing) {
            this.saveCharacterPromptsState();
        }
    }

    removeCharacterPromptRow(button) {
        const row = button.closest('.character-prompt-row');
        if (row) {
            row.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                row.remove();
                this.updateCharacterIndexLabels();
                this.saveCharacterPromptsState();
            }, 150);
        }
    }

    updateCharacterIndexLabels() {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return;
        const rows = container.querySelectorAll('.character-prompt-row');
        rows.forEach((row, idx) => {
            const label = row.querySelector('.character-index-label');
            if (label) {
                label.textContent = `角色 ${idx + 1}`;
            }
            const pinIndex = row.querySelector('.char-pos-pin-index');
            if (pinIndex) {
                pinIndex.textContent = `${idx + 1}`;
            }
        });

        // 动态更新折叠栏的角色数量 Badge
        const badge = document.getElementById('charCountBadge');
        if (badge) {
            if (rows.length > 0) {
                badge.textContent = rows.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    setCharPosition(target, x, y) {
        let row = null;
        if (target && typeof target.closest === 'function') {
            row = target.closest('.character-prompt-row');
            if (!row) {
                const grid = target.closest('.char-grid-container');
                if (grid && typeof grid.closest === 'function') {
                    row = grid.closest('.character-prompt-row');
                }
            }
        }
        if (!row && target && typeof target.querySelector === 'function') {
            row = target;
        }
        if (!row || typeof row.querySelector !== 'function') return;

        const posXInput = row.querySelector('.char-pos-x');
        const posYInput = row.querySelector('.char-pos-y');
        const pin = row.querySelector('.char-pos-pin');
        const coordsLabel = row.querySelector('.char-pos-coords');

        const finalX = Math.max(0.01, Math.min(0.99, parseFloat(x)));
        const finalY = Math.max(0.01, Math.min(0.99, parseFloat(y)));

        if (posXInput) posXInput.value = finalX;
        if (posYInput) posYInput.value = finalY;

        if (pin) {
            pin.style.left = `${(finalX * 100).toFixed(1)}%`;
            pin.style.top = `${(finalY * 100).toFixed(1)}%`;
        }
        if (coordsLabel) {
            coordsLabel.textContent = `X: ${(finalX * 100).toFixed(0)}% | Y: ${(finalY * 100).toFixed(0)}%`;
        }

        this.saveCharacterPromptsState();
    }

    selectCharGridCell(btn, x, y) {
        this.setCharPosition(btn, x, y);
    }

    /**
     * =========================================================================
     * V5 全屏大画布角色自由位置编排 Stage (Official-grade Character Position Stage)
     * =========================================================================
     */
    openStage(activeIdx = 0) {
        const stageEl = document.getElementById('charPositionStage');
        if (!stageEl) return;

        const container = document.getElementById('characterPromptsContainer');
        const rows = container ? container.querySelectorAll('.character-prompt-row') : [];
        if (rows.length === 0) {
            this.addCharacterPromptRow();
        }

        this.activeStageCharIndex = activeIdx;
        this.stageGridMode = this.stageGridMode || 'thirds';

        // 依据当前设置的分辨率自适应画板宽高比
        const resSelect = document.getElementById('resolution');
        let ratio = 832 / 1216; // 默认 Portrait
        if (resSelect && resSelect.value) {
            const [w, h] = resSelect.value.split(',').map(Number);
            if (w && h) ratio = w / h;
        }

        const boxEl = document.getElementById('charStageBox');
        if (boxEl) {
            const maxH = Math.min(window.innerHeight * 0.58, 520);
            const calcW = maxH * ratio;
            boxEl.style.height = `${maxH}px`;
            boxEl.style.width = `${calcW}px`;
        }

        stageEl.classList.remove('hidden');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

        this.renderStage();
        this._initStageInteractions();
    }

    closeStage() {
        const stageEl = document.getElementById('charPositionStage');
        if (stageEl) stageEl.classList.add('hidden');
        this.saveCharacterPromptsState();
    }

    setStageGridMode(mode) {
        this.stageGridMode = mode;
        const modes = ['thirds', 'phi', 'center', 'none'];
        modes.forEach(m => {
            const btn = document.getElementById(`charGridMode${m.charAt(0).toUpperCase() + m.slice(1)}`);
            if (btn) {
                if (m === mode) {
                    btn.className = 'px-2.5 py-1 rounded-lg bg-indigo-600 font-semibold transition-all text-white shadow-sm';
                } else {
                    btn.className = 'px-2.5 py-1 rounded-lg hover:bg-white/10 transition-all text-gray-300';
                }
            }
        });
        this._renderStageGridSvg();
    }

    _renderStageGridSvg() {
        const svg = document.getElementById('charStageGridSvg');
        if (!svg) return;

        const mode = this.stageGridMode || 'thirds';
        if (mode === 'none') {
            svg.innerHTML = '';
            return;
        }

        if (mode === 'thirds') {
            svg.innerHTML = `
                <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
                <line x1="66.67%" y1="0" x2="66.67%" y2="100%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
                <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
                <line x1="0" y1="66.67%" x2="100%" y2="66.67%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
            `;
        } else if (mode === 'phi') {
            svg.innerHTML = `
                <line x1="38.2%" y1="0" x2="38.2%" y2="100%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
                <line x1="61.8%" y1="0" x2="61.8%" y2="100%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
                <line x1="0" y1="38.2%" x2="100%" y2="38.2%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
                <line x1="0" y1="61.8%" x2="100%" y2="61.8%" stroke="rgba(255,255,255,0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
            `;
        } else if (mode === 'center') {
            svg.innerHTML = `
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(99,102,241,0.6)" stroke-dasharray="5 5" stroke-width="1.5"/>
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(99,102,241,0.6)" stroke-dasharray="5 5" stroke-width="1.5"/>
                <circle cx="50%" cy="50%" r="8" fill="none" stroke="rgba(99,102,241,0.8)" stroke-width="1.5"/>
            `;
        }
    }

    autoArrange() {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return;
        const rows = Array.from(container.querySelectorAll('.character-prompt-row'));
        if (rows.length === 0) return;

        // 依据角色总数进行黄金螺旋 / 审美离散布局
        const presets = [
            [0.5, 0.5],
            [0.3, 0.5],
            [0.7, 0.5],
            [0.2, 0.35],
            [0.8, 0.35],
            [0.5, 0.75],
            [0.35, 0.7],
            [0.65, 0.7],
            [0.15, 0.5],
            [0.85, 0.5]
        ];

        rows.forEach((row, i) => {
            const coord = presets[i] || [0.1 + (i * 0.15) % 0.8, 0.2 + (i * 0.2) % 0.6];
            this.setCharPosition(row, coord[0], coord[1]);
            const autoPosCheckbox = row.querySelector('.char-auto-pos');
            if (autoPosCheckbox) autoPosCheckbox.checked = false;
        });

        this.renderStage();
        if (typeof window !== 'undefined' && window.showToast) {
            window.showToast("已自动对齐与分散排布角色位置", "success");
        }
    }

    renderStage() {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return;
        const rows = Array.from(container.querySelectorAll('.character-prompt-row'));

        const chipsContainer = document.getElementById('charStageChips');
        const pinsContainer = document.getElementById('charStagePinsContainer');
        const activeCoordsLabel = document.getElementById('charStageActiveCoords');

        if (chipsContainer) chipsContainer.innerHTML = '';
        if (pinsContainer) pinsContainer.innerHTML = '';

        if (this.activeStageCharIndex >= rows.length) {
            this.activeStageCharIndex = Math.max(0, rows.length - 1);
        }

        this._renderStageGridSvg();

        // 收集所有角色的当前位置，用于碰撞检测 (距离 < 0.1 警告)
        const charPositions = rows.map(r => {
            const x = parseFloat(r.querySelector('.char-pos-x')?.value || '0.5');
            const y = parseFloat(r.querySelector('.char-pos-y')?.value || '0.5');
            const prompt = r.querySelector('.char-prompt-input')?.value.trim() || '';
            const enabled = r.querySelector('.char-enable-toggle')?.checked !== false;
            return { x, y, prompt, enabled };
        });

        rows.forEach((row, idx) => {
            const { x, y, prompt, enabled } = charPositions[idx];
            const isActive = idx === this.activeStageCharIndex;

            // 1. 顶部角色选择 Chip
            if (chipsContainer) {
                const chip = document.createElement('button');
                chip.type = 'button';
                const summary = prompt ? (prompt.length > 8 ? prompt.slice(0, 8) + '...' : prompt) : `角色 ${idx + 1}`;
                chip.className = `px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                    isActive 
                        ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-400' 
                        : 'bg-white/10 hover:bg-white/20 text-gray-300'
                } ${!enabled ? 'opacity-50' : ''}`;
                chip.innerHTML = `
                    <span class="w-4 h-4 rounded-full ${isActive ? 'bg-white text-indigo-700' : 'bg-white/20 text-white'} flex items-center justify-center text-[10px] font-bold">${idx + 1}</span>
                    <span>${summary}</span>
                `;
                chip.onclick = () => {
                    this.activeStageCharIndex = idx;
                    this.renderStage();
                };
                chipsContainer.appendChild(chip);
            }

            // 2. 检测该角色是否与其他角色过于接近 (< 0.1 欧氏距离)
            let isTooClose = false;
            charPositions.forEach((other, otherIdx) => {
                if (otherIdx !== idx && enabled && other.enabled) {
                    const dist = Math.hypot(x - other.x, y - other.y);
                    if (dist < 0.1) isTooClose = true;
                }
            });

            // 3. 画板上的 Marker Pin
            if (pinsContainer) {
                const pin = document.createElement('div');
                pin.className = `char-stage-pin absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold cursor-grab active:cursor-grabbing select-none transition-transform ${
                    isActive 
                        ? 'bg-white text-slate-900 shadow-2xl ring-4 ring-indigo-500 scale-110 z-20' 
                        : 'bg-slate-900/90 text-white border-2 border-white/60 shadow-lg z-10 hover:scale-105'
                } ${isTooClose ? 'ring-4 !ring-amber-500 animate-pulse' : ''} ${!enabled ? 'opacity-40' : ''}`;
                pin.style.left = `${x * 100}%`;
                pin.style.top = `${y * 100}%`;
                pin.style.transform = 'translate(-50%, -50%)';
                pin.setAttribute('data-index', idx);
                pin.title = `角色 ${idx + 1} (${(x * 100).toFixed(0)}%, ${(y * 100).toFixed(0)}%)${isTooClose ? ' - 提示: 角色距离较近' : ''}`;
                pin.innerHTML = `<span>${idx + 1}</span>`;
                pinsContainer.appendChild(pin);
            }

            if (isActive && activeCoordsLabel) {
                activeCoordsLabel.innerHTML = `角色 <b>${idx + 1}</b>: X <b>${(x * 100).toFixed(0)}%</b> | Y <b>${(y * 100).toFixed(0)}%</b>${isTooClose ? ' <span class="text-amber-400">⚠ 距离过近</span>' : ''}`;
            }
        });
    }

    _initStageInteractions() {
        const box = document.getElementById('charStageBox');
        if (!box || box.dataset.interactionBound === 'true') return;
        box.dataset.interactionBound = 'true';

        let isDragging = false;
        let activeDragIndex = this.activeStageCharIndex;

        const updateCoord = (clientX, clientY) => {
            const container = document.getElementById('characterPromptsContainer');
            if (!container) return;
            const rows = Array.from(container.querySelectorAll('.character-prompt-row'));
            const targetRow = rows[this.activeStageCharIndex];
            if (!targetRow) return;

            const rect = box.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            let normX = (clientX - rect.left) / rect.width;
            let normY = (clientY - rect.top) / rect.height;
            normX = Math.max(0.01, Math.min(0.99, normX));
            normY = Math.max(0.01, Math.min(0.99, normY));

            const finalX = parseFloat(normX.toFixed(3));
            const finalY = parseFloat(normY.toFixed(3));

            this.setCharPosition(targetRow, finalX, finalY);
            const autoPosCheckbox = targetRow.querySelector('.char-auto-pos');
            if (autoPosCheckbox) autoPosCheckbox.checked = false;

            this.renderStage();
        };

        box.addEventListener('pointerdown', (e) => {
            const pinTarget = e.target.closest('.char-stage-pin');
            if (pinTarget) {
                const idx = parseInt(pinTarget.getAttribute('data-index') || '0');
                this.activeStageCharIndex = idx;
                activeDragIndex = idx;
            }
            isDragging = true;
            try { box.setPointerCapture(e.pointerId); } catch (_) {}
            updateCoord(e.clientX, e.clientY);
        });

        box.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            updateCoord(e.clientX, e.clientY);
        });

        const endDrag = (e) => {
            if (isDragging) {
                isDragging = false;
                try { box.releasePointerCapture(e.pointerId); } catch (_) {}
                this.saveCharacterPromptsState();
            }
        };

        box.addEventListener('pointerup', endDrag);
        box.addEventListener('pointercancel', endDrag);
    }
}

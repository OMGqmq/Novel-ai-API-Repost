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
}

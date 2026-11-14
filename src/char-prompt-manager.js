/**
 * Character Prompt Manager Module (V4.5 & V5 Multi-character feature)
 * Encapsulates DOM creation, interactive 2D free coordinate positioning, collapsing panels, and state persistence.
 */
export class CharPromptManager {
    constructor() {
        this.store = null;
        this.currentModel = 'v3';
        this.activeStageCharIndex = 0;
        this.stageGridMode = 'thirds';
        this.isOpen = false;
    }

    bind(store) {
        this.store = store;
        if (store) {
            this.currentModel = store.getSetting('nai_model_version', 'v3');
        }
    }

    getCharPromptKey(model) {
        const m = model || this.currentModel || 'v4.5';
        return m === 'v5' ? 'nai_v5_character_prompts' : 'nai_v45_character_prompts';
    }

    onModelChange(ver, { reload = true } = {}) {
        const prevModel = this.currentModel;
        const targetModel = ver || 'v3';

        if (reload && this.store && prevModel && prevModel !== targetModel && (prevModel === 'v4.5' || prevModel === 'v5')) {
            this.saveCharacterPromptsState(prevModel);
        }

        this.currentModel = targetModel;

        if (reload && this.store && prevModel !== targetModel && (targetModel === 'v4.5' || targetModel === 'v5')) {
            this.loadState(targetModel, { skipModelChange: true });
        }
        
        // 控制“画布位置编排”按钮（V4.5 支持 5×5 网格吸附原位定位，V5 支持 2D 连续自由选点）
        const supportsCharStage = this.currentModel === 'v5' || this.currentModel === 'v4.5';
        const launchBtn = document.getElementById('charStageLaunchBtn');
        if (launchBtn) {
            if (supportsCharStage) launchBtn.classList.remove('hidden');
            else launchBtn.classList.add('hidden');
        }
        const topBtn = document.getElementById('charStageTopBtn');
        if (topBtn) {
            if (supportsCharStage) topBtn.classList.remove('hidden');
            else topBtn.classList.add('hidden');
        }
        if (!supportsCharStage && this.isOpen) {
            this.closeStage();
        }

        // 遍历所有角色行，切换 5x5 网格 (V4.5) / 2D 连续自由画板 (V5)
        const container = document.getElementById('characterPromptsContainer');
        if (container) {
            const rows = container.querySelectorAll('.character-prompt-row');
            rows.forEach(row => {
                const autoPos = row.querySelector('.char-auto-pos')?.checked !== false;
                const v5Wrap = row.querySelector('.char-v5-pos-wrapper');
                const v45Wrap = row.querySelector('.char-v45-grid-wrapper');
                const posTitle = row.querySelector('.char-pos-title');

                if (this.currentModel === 'v5') {
                    if (posTitle) posTitle.textContent = '角色定位 (Position - 自由选点)';
                    if (v45Wrap) v45Wrap.classList.add('hidden');
                    if (v5Wrap) {
                        if (autoPos) v5Wrap.classList.add('hidden');
                        else v5Wrap.classList.remove('hidden');
                    }
                } else if (this.currentModel === 'v4.5') {
                    if (posTitle) posTitle.textContent = '角色定位 (Position - 5x5网格)';
                    if (v5Wrap) v5Wrap.classList.add('hidden');
                    if (v45Wrap) {
                        if (autoPos) v45Wrap.classList.add('hidden');
                        else v45Wrap.classList.remove('hidden');
                    }
                    // 同步高亮匹配的 5x5 单元格
                    const curX = parseFloat(row.querySelector('.char-pos-x')?.value || '0.5');
                    const curY = parseFloat(row.querySelector('.char-pos-y')?.value || '0.5');
                    this._highlightMatchingGridCell(row, curX, curY);
                } else {
                    if (v5Wrap) v5Wrap.classList.add('hidden');
                    if (v45Wrap) v45Wrap.classList.add('hidden');
                }
            });
        }

        this.updatePadAspectRatio();
        if (this.isOpen) {
            this.renderStage();
        }
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

    saveCharacterPromptsState(model) {
        const container = document.getElementById('characterPromptsContainer');
        if (!container || !this.store) return;
        const targetModel = model || this.currentModel || 'v4.5';
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
        this.store.setSetting(this.getCharPromptKey(targetModel), JSON.stringify(list));
    }

    loadState(model, { skipModelChange = false } = {}) {
        const container = document.getElementById('characterPromptsContainer');
        if (!container || !this.store) return;
        const targetModel = model || this.currentModel || 'v4.5';
        this.currentModel = targetModel;
        
        let saved = this.store.getSetting(this.getCharPromptKey(targetModel));
        if (!saved && targetModel === 'v5') {
            // 兼容迁移：若 v5 尚无专属配置，首次读取已有的 v4.5 配置
            saved = this.store.getSetting('nai_v45_character_prompts');
        }

        container.innerHTML = '';
        if (saved) {
            try {
                const list = JSON.parse(saved);
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        this.addCharacterPromptRow(
                            item.prompt || '',
                            item.negative || '',
                            typeof item.x === 'number' ? item.x : 0.5,
                            typeof item.y === 'number' ? item.y : 0.5,
                            item.autoPos !== false,
                            item.enabled !== false,
                            true // isInitializing = true
                        );
                    });
                }
            } catch (err) {
                console.error('Failed to parse cached character prompts for', targetModel, err);
            }
        }
        this.updateCharacterIndexLabels();
        if (!skipModelChange) {
            this.onModelChange(targetModel, { reload: false });
        }
    }

    _generateGridCellsHtml(safeX, safeY) {
        const labels = [
            'A1','A2','A3','A4','A5',
            'B1','B2','B3','B4','B5',
            'C1','C2','C3','C4','C5',
            'D1','D2','D3','D4','D5',
            'E1','E2','E3','E4','E5'
        ];
        return labels.map((label, idx) => {
            const row = Math.floor(idx / 5);
            const col = idx % 5;
            const cellX = (col * 2 + 1) / 10;
            const cellY = (row * 2 + 1) / 10;
            const isSelected = Math.abs(safeX - cellX) < 0.11 && Math.abs(safeY - cellY) < 0.11;
            return `
                <button type="button" 
                    class="char-grid-cell aspect-square rounded-md border text-[9px] font-mono transition-all flex items-center justify-center cursor-pointer ${
                        isSelected 
                            ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900 font-bold shadow-sm' 
                            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }" 
                    data-x="${cellX}" 
                    data-y="${cellY}" 
                    data-coord="${label}" 
                    onclick="window.selectCharGridCell ? window.selectCharGridCell(this, ${cellX}, ${cellY}) : null" 
                    title="位置: ${label}">
                    ${label}
                </button>
            `;
        }).join('');
    }

    _snapToV45Grid(val) {
        const centers = [0.1, 0.3, 0.5, 0.7, 0.9];
        let best = 0.5;
        let minDiff = Infinity;
        for (const c of centers) {
            const d = Math.abs(val - c);
            if (d < minDiff) {
                minDiff = d;
                best = c;
            }
        }
        return best;
    }

    _coordToGridLabel(x, y) {
        const cols = ['1', '2', '3', '4', '5'];
        const rows = ['A', 'B', 'C', 'D', 'E'];
        const cIdx = Math.max(0, Math.min(4, Math.round((x - 0.1) / 0.2)));
        const rIdx = Math.max(0, Math.min(4, Math.round((y - 0.1) / 0.2)));
        return rows[rIdx] + cols[cIdx];
    }

    _highlightMatchingGridCell(row, x, y) {
        const grid = row.querySelector('.char-grid-container');
        if (!grid) return;
        const cells = grid.querySelectorAll('.char-grid-cell');
        let minDistance = Infinity;
        let closestCell = null;

        cells.forEach(cell => {
            const cx = parseFloat(cell.getAttribute('data-x') || '0.5');
            const cy = parseFloat(cell.getAttribute('data-y') || '0.5');
            const dist = Math.hypot(x - cx, y - cy);
            if (dist < minDistance) {
                minDistance = dist;
                closestCell = cell;
            }
            cell.className = 'char-grid-cell aspect-square rounded-md border text-[9px] font-mono transition-all flex items-center justify-center cursor-pointer bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700';
        });

        if (closestCell) {
            closestCell.className = 'char-grid-cell aspect-square rounded-md border text-[9px] font-mono transition-all flex items-center justify-center cursor-pointer bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900 font-bold shadow-sm';
        }
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

        // 获取当前模型版本以决定默认显示 5x5 网格还是 2D 连续画板
        const activeModel = this.currentModel || (typeof document !== 'undefined' ? document.getElementById('modelValue')?.value : 'v3') || 'v3';
        const isV5 = activeModel === 'v5';

        div.innerHTML = `
            <div class="flex justify-between items-center select-none cursor-pointer char-row-header">
                <div class="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform duration-200 char-row-chevron transform rotate-90"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <span class="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest character-index-label">角色</span>
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[120px] char-row-summary font-normal"></span>
                </div>
                <div class="flex items-center gap-1.5 char-row-actions">
                    <label class="flex items-center gap-1 cursor-pointer select-none text-[9px] text-gray-400 dark:text-gray-500 font-bold">
                        <input type="checkbox" role="switch" aria-checked="${enabled ? 'true' : 'false'}" class="char-enable-toggle sr-only peer" ${enabled ? 'checked' : ''}>
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
                    <input type="text" class="char-prompt-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" placeholder="填入角色特征tag，例如: 1girl, blond hair, blue eyes" />
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">排除词 (Character Negative, 可选)</label>
                    <input type="text" class="char-neg-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" placeholder="特定于该角色的排除特征，默认为空" />
                </div>
                <div class="space-y-1 mt-2">
                    <div class="flex justify-between items-center text-[9px] text-gray-400 dark:text-gray-500">
                        <span class="char-pos-title">${isV5 ? '角色定位 (Position - 自由选点)' : '角色定位 (Position - 5x5网格)'}</span>
                        <label class="flex items-center gap-1 cursor-pointer select-none">
                            <input type="checkbox" role="switch" aria-checked="${autoPos ? 'true' : 'false'}" class="char-auto-pos sr-only peer" ${autoPos ? 'checked' : ''}>
                            <div class="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-slate-900 dark:peer-checked:bg-white dark:peer-checked:after:bg-slate-900 relative scale-90"></div>
                            <span>AI 自动位置</span>
                        </label>
                    </div>

                    <!-- V5 专属：自由 2D 连续坐标定位画板 (自适应画幅比例) -->
                    <div class="char-v5-pos-wrapper char-pos-box-wrapper ${autoPos || !isV5 ? 'hidden' : ''} mt-2 flex flex-col gap-2">
                        <div class="char-pos-pad relative rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-100/90 dark:bg-slate-900/80 overflow-hidden cursor-crosshair select-none touch-none shadow-inner mx-auto" style="width: 140px; height: 205px;">
                            <!-- 九宫格与中心辅助线 -->
                            <div class="absolute inset-0 pointer-events-none opacity-25 dark:opacity-35">
                                <div class="absolute left-1/3 inset-y-0 border-l border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute left-2/3 inset-y-0 border-l border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute top-1/3 inset-x-0 border-t border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute top-2/3 inset-x-0 border-t border-dashed border-gray-400 dark:border-gray-600"></div>
                                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-slate-500/60 bg-slate-500/20"></div>
                            </div>
                            
                            <!-- 坐标实时显示浮标 -->
                            <div class="absolute top-1.5 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[9px] font-mono text-white/90 pointer-events-none select-none char-pos-coords">
                                X: ${(safeX * 100).toFixed(0)}% | Y: ${(safeY * 100).toFixed(0)}%
                            </div>
                            
                            <!-- 自由定位标记 Pin -->
                            <div class="char-pos-pin absolute w-7 h-7 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg border-2 border-white dark:border-slate-800 flex items-center justify-center text-[11px] font-extrabold cursor-grab active:cursor-grabbing hover:scale-110 active:scale-95 transition-[transform,box-shadow] select-none"
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
                    </div>

                    <!-- V4.5 专属：5x5 离散网格选点器 -->
                    <div class="char-v45-grid-wrapper ${autoPos || isV5 ? 'hidden' : ''} mt-2">
                        <div class="char-grid-container grid grid-cols-5 gap-1.5 p-2 bg-gray-100/90 dark:bg-slate-900/80 rounded-xl border border-gray-200 dark:border-slate-700 max-w-[240px] mx-auto">
                            ${this._generateGridCellsHtml(safeX, safeY)}
                        </div>
                    </div>

                    <!-- 隐藏输入框以保存坐标 -->
                    <input type="hidden" class="char-pos-x" value="${safeX}" />
                    <input type="hidden" class="char-pos-y" value="${safeY}" />
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
            if (this.isOpen) this.renderStage();
        });

        div._applyEnabledState = applyEnabledState;
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
        if (promptInput) {
            promptInput.value = promptVal || '';
        }
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
        div._updateSummary = updateSummary;
        if (promptInput) {
            promptInput.addEventListener('input', () => {
                updateSummary();
                this.saveCharacterPromptsState();
                if (this.isOpen) this.renderStage();
            });
            updateSummary();
        }

        // 排除词修改保存
        const negInput = div.querySelector('.char-neg-input');
        if (negInput) {
            negInput.value = negVal || '';
            negInput.addEventListener('input', () => {
                this.saveCharacterPromptsState();
                if (this.isOpen) this.renderStage();
            });
        }

        // 自由选点交互逻辑 (Pointer Events + Dragging)
        const pad = div.querySelector('.char-pos-pad');
        const pin = div.querySelector('.char-pos-pin');
        const coordsLabel = div.querySelector('.char-pos-coords');
        const posXInput = div.querySelector('.char-pos-x');
        const posYInput = div.querySelector('.char-pos-y');
        const autoPosCheckbox = div.querySelector('.char-auto-pos');
        const v5PosWrapper = div.querySelector('.char-v5-pos-wrapper');
        const v45GridWrapper = div.querySelector('.char-v45-grid-wrapper');

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
            this._highlightMatchingGridCell(div, finalX, finalY);
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
        if (autoPosCheckbox) {
            autoPosCheckbox.addEventListener('change', (e) => {
                if (autoPosCheckbox.disabled) return;
                const model = this.currentModel || 'v3';
                if (e.target.checked) {
                    if (v5PosWrapper) v5PosWrapper.classList.add('hidden');
                    if (v45GridWrapper) v45GridWrapper.classList.add('hidden');
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
                    if (model === 'v5' && v5PosWrapper) v5PosWrapper.classList.remove('hidden');
                    if (model === 'v4.5' && v45GridWrapper) v45GridWrapper.classList.remove('hidden');
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
        this.updatePadAspectRatio();

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

        this._highlightMatchingGridCell(row, finalX, finalY);
        this.saveCharacterPromptsState();
    }

    selectCharGridCell(btn, x, y) {
        this.setCharPosition(btn, x, y);
    }

    /**
     * 根据当前选择的画幅分辨率动态适配侧边栏选点小画板 (Mini Pad) 的宽高比
     */
    updatePadAspectRatio() {
        const resSelect = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('resolution') : null;
        let ratio = 832 / 1216; // 默认 Portrait
        if (resSelect && resSelect.value) {
            const [w, h] = resSelect.value.split(',').map(Number);
            if (w && h && !isNaN(w) && !isNaN(h)) {
                ratio = w / h;
            }
        }

        const pads = typeof document !== 'undefined' && typeof document.querySelectorAll === 'function' ? document.querySelectorAll('.char-pos-pad') : [];
        if (pads && typeof pads.forEach === 'function') {
            pads.forEach(pad => {
                if (!pad || !pad.style) return;
                pad.style.aspectRatio = `${ratio}`;
                if (ratio < 0.95) {
                    // Portrait 竖版 (例如 832x1216 = 0.684)
                    const h = 165;
                    const w = Math.round(h * ratio);
                    pad.style.height = `${h}px`;
                    pad.style.width = `${w}px`;
                    pad.style.maxWidth = '100%';
                } else if (ratio > 1.05) {
                    // Landscape 横版 (例如 1216x832 = 1.46)
                    const maxW = 220;
                    const h = Math.round(maxW / ratio);
                    pad.style.width = `${maxW}px`;
                    pad.style.height = `${h}px`;
                    pad.style.maxWidth = '100%';
                } else {
                    // Square 方版 (1024x1024 = 1.0)
                    pad.style.width = '145px';
                    pad.style.height = '145px';
                    pad.style.maxWidth = '100%';
                }
            });
        }

        // 同时自适应更新主画布原位角色定位舞台（若存在 #singleResultImg 则 1:1 像素级对齐图片坐标与尺寸，否则按画幅比例居中）
        const boxEl = typeof document !== 'undefined' ? document.getElementById('charStageBox') : null;
        if (boxEl && boxEl.style) {
            const stageEl = typeof document !== 'undefined' ? document.getElementById('charPositionStage') : null;
            const singleArea = typeof document !== 'undefined' ? document.getElementById('singleResultArea') : null;
            const singleImg = typeof document !== 'undefined' ? document.getElementById('singleResultImg') : null;
            const hasVisibleImg = Boolean(
                singleArea && !singleArea.classList?.contains?.('hidden') &&
                singleImg && singleImg.getAttribute?.('src') !== '' && singleImg.src
            );
            const imgRect = (hasVisibleImg && typeof singleImg.getBoundingClientRect === 'function')
                ? singleImg.getBoundingClientRect()
                : null;
            const stageRect = (stageEl && typeof stageEl.getBoundingClientRect === 'function')
                ? stageEl.getBoundingClientRect()
                : null;

            if (imgRect && imgRect.width > 24 && imgRect.height > 24) {
                boxEl.style.width = Math.round(imgRect.width) + 'px';
                boxEl.style.height = Math.round(imgRect.height) + 'px';
                if (stageRect && stageRect.width > 0 && stageRect.height > 0) {
                    boxEl.style.position = 'absolute';
                    boxEl.style.left = Math.round(imgRect.left - stageRect.left) + 'px';
                    boxEl.style.top = Math.round(imgRect.top - stageRect.top) + 'px';
                }
                boxEl.classList?.add?.('is-image-overlay');
            } else {
                boxEl.classList?.remove?.('is-image-overlay');
                boxEl.style.position = 'relative';
                boxEl.style.left = '';
                boxEl.style.top = '';
                const previewEl = typeof document !== 'undefined' ? document.getElementById('previewArea') : null;
                const pRect = (previewEl && typeof previewEl.getBoundingClientRect === 'function')
                    ? previewEl.getBoundingClientRect()
                    : null;
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                const baseW = (pRect && pRect.width > 100) ? pRect.width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
                const baseH = (pRect && pRect.height > 100) ? pRect.height : (typeof window !== 'undefined' ? window.innerHeight : 800);
                const availableH = baseH - (isMobile ? 275 : 220);
                const availableW = baseW - (isMobile ? 24 : 72);
                let maxH = Math.max(160, Math.min(availableH, 520));
                let calcW = maxH * ratio;
                if (calcW > availableW) {
                    calcW = availableW;
                    maxH = calcW / ratio;
                }
                boxEl.style.height = Math.round(maxH) + 'px';
                boxEl.style.width = Math.round(calcW) + 'px';
            }
        }
    }

    /**
     * =========================================================================
     * 主画布原位多角色定位舞台 (In-Place Main Canvas Character Position Stage)
     * 兼容 V4.5 (5×5 离散网格吸附) 与 V5 (2D 连续自由坐标)
     * =========================================================================
     */
    toggleStage(activeIdx = 0) {
        if (this.isOpen) {
            this.closeStage();
            return false;
        }
        this.openStage(activeIdx);
        return true;
    }

    openStage(activeIdx = 0) {
        const stageEl = document.getElementById('charPositionStage');
        if (!stageEl) return;

        // 互斥保护：自动退出局部重绘与无限扩图，确保主画布只有一个原位模式激活
        if (typeof window !== 'undefined') {
            if (window.inpaintEditor?.isOpen) {
                window.inpaintEditor.close();
            }
            const outpaintArea = document.getElementById('outpaintArea');
            if (window.outpaintEditor && outpaintArea && !outpaintArea.classList?.contains?.('hidden')) {
                window.outpaintEditor.close();
            }
        }

        const container = document.getElementById('characterPromptsContainer');
        const rows = container ? container.querySelectorAll('.character-prompt-row') : [];
        if (rows.length === 0) {
            this.addCharacterPromptRow('', '', 0.5, 0.5, false, true);
        }

        this.isOpen = true;
        this.activeStageCharIndex = activeIdx;
        this.stageGridMode = this.stageGridMode || 'thirds';

        if (typeof document !== 'undefined' && document.body?.classList) {
            document.body.classList.add('char-stage-active');
        }
        const topBtn = document.getElementById('charStageTopBtn');
        if (topBtn && topBtn.classList) {
            topBtn.classList.add('inpaint-toggle-active');
        }

        // 移动端体验：打开画布定位时自动收起底部参数抽屉，释放全部画布空间
        if (typeof window !== 'undefined' && typeof window.toggleMobileControls === 'function') {
            window.toggleMobileControls(false);
        }

        stageEl.classList.remove('hidden');
        this.updatePadAspectRatio();
        this.setStageGridMode(this.stageGridMode);
        this.renderStage();
        this._initStageInteractions();
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                if (this.isOpen) this.updatePadAspectRatio();
            });
        }
    }

    closeStage() {
        this.isOpen = false;
        const stageEl = document.getElementById('charPositionStage');
        if (stageEl) stageEl.classList.add('hidden');
        if (typeof document !== 'undefined' && document.body?.classList) {
            document.body.classList.remove('char-stage-active');
        }
        const topBtn = document.getElementById('charStageTopBtn');
        if (topBtn && topBtn.classList) {
            topBtn.classList.remove('inpaint-toggle-active');
        }
        this.saveCharacterPromptsState();
    }

    cycleStageGridMode() {
        const order = ['thirds', 'phi', 'center', 'none'];
        const curIdx = order.indexOf(this.stageGridMode || 'thirds');
        const nextMode = order[(curIdx + 1) % order.length];
        this.setStageGridMode(nextMode);
        return nextMode;
    }

    setStageGridMode(mode) {
        this.stageGridMode = mode;
        const modes = ['thirds', 'phi', 'center', 'none'];
        modes.forEach(m => {
            const btn = document.getElementById('charGridMode' + m.charAt(0).toUpperCase() + m.slice(1));
            if (btn && btn.classList) {
                btn.classList.toggle('tool-active', m === mode);
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

        let gridLines = '';
        // V4.5 模式下叠加 5×5 宫格细线与中心点提示
        if (this.currentModel === 'v4.5') {
            gridLines += `
                <line x1="20%" y1="0" x2="20%" y2="100%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
                <line x1="40%" y1="0" x2="40%" y2="100%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
                <line x1="60%" y1="0" x2="60%" y2="100%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
                <line x1="80%" y1="0" x2="80%" y2="100%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
                <line x1="0" y1="20%" x2="100%" y2="20%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
                <line x1="0" y1="40%" x2="100%" y2="40%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
                <line x1="0" y1="60%" x2="100%" y2="60%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
                <line x1="0" y1="80%" x2="100%" y2="80%" stroke="rgba(255,255,255,0.22)" stroke-dasharray="2 3" stroke-width="1"/>
            `;
        }

        if (mode === 'thirds') {
            gridLines += `
                <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
                <line x1="66.67%" y1="0" x2="66.67%" y2="100%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
                <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
                <line x1="0" y1="66.67%" x2="100%" y2="66.67%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
            `;
        } else if (mode === 'phi') {
            gridLines += `
                <line x1="38.2%" y1="0" x2="38.2%" y2="100%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
                <line x1="61.8%" y1="0" x2="61.8%" y2="100%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
                <line x1="0" y1="38.2%" x2="100%" y2="38.2%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
                <line x1="0" y1="61.8%" x2="100%" y2="61.8%" stroke="rgba(255,255,255,0.45)" stroke-dasharray="4 4" stroke-width="1.4"/>
            `;
        } else if (mode === 'center') {
            gridLines += `
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.6)" stroke-dasharray="5 5" stroke-width="1.5"/>
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.6)" stroke-dasharray="5 5" stroke-width="1.5"/>
                <circle cx="50%" cy="50%" r="8" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.5"/>
            `;
        }
        svg.innerHTML = gridLines;
    }

    autoArrange() {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return;
        const rows = Array.from(container.querySelectorAll('.character-prompt-row'));
        if (rows.length === 0) return;

        const isV45 = this.currentModel === 'v4.5';
        const presets = isV45
            ? [
                [0.5, 0.5],
                [0.3, 0.5],
                [0.7, 0.5],
                [0.1, 0.3],
                [0.9, 0.3],
                [0.5, 0.7],
                [0.3, 0.7],
                [0.7, 0.7],
                [0.1, 0.5],
                [0.9, 0.5]
            ]
            : [
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
            const fx = isV45 ? this._snapToV45Grid(coord[0]) : coord[0];
            const fy = isV45 ? this._snapToV45Grid(coord[1]) : coord[1];
            this.setCharPosition(row, fx, fy);
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

        this.updatePadAspectRatio();
        this._renderStageGridSvg();

        const isV45 = this.currentModel === 'v4.5';

        // 收集所有角色的当前位置，用于碰撞检测 (距离 < 0.1 警告)
        const charPositions = rows.map(r => {
            const rawX = parseFloat(r.querySelector('.char-pos-x')?.value || '0.5');
            const rawY = parseFloat(r.querySelector('.char-pos-y')?.value || '0.5');
            const x = isV45 ? this._snapToV45Grid(rawX) : rawX;
            const y = isV45 ? this._snapToV45Grid(rawY) : rawY;
            const prompt = r.querySelector('.char-prompt-input')?.value.trim() || '';
            const enabled = r.querySelector('.char-enable-toggle')?.checked !== false;
            return { x, y, prompt, enabled };
        });

        let activeChipEl = null;

        rows.forEach((row, idx) => {
            const { x, y, prompt, enabled } = charPositions[idx];
            const isActive = idx === this.activeStageCharIndex;

            // 1. 顶部全宽角色横向选择栏 Chip (#1, #2...) + 快速新增按钮
            if (chipsContainer) {
                const chip = document.createElement('button');
                chip.type = 'button';
                const shortTag = prompt ? (prompt.length > 7 ? prompt.slice(0, 7) + '…' : prompt) : '';
                chip.className = 'char-stage-chip-btn' + (isActive ? ' active' : '') + (!enabled ? ' opacity-45' : '');
                chip.title = prompt ? ('角色 ' + (idx + 1) + ': ' + prompt) : ('角色 ' + (idx + 1));
                chip.innerHTML = shortTag
                    ? ('<span>#' + (idx + 1) + '</span><span class="text-[11px] font-medium opacity-85">' + shortTag + '</span>')
                    : ('<span>#' + (idx + 1) + '</span>');
                chip.onclick = () => {
                    this.activeStageCharIndex = idx;
                    this.renderStage();
                };
                chipsContainer.appendChild(chip);
                if (isActive) activeChipEl = chip;
            }

            // 2. 检测该角色是否与其他角色过于接近 (< 0.1 欧氏距离)
            let isTooClose = false;
            charPositions.forEach((other, otherIdx) => {
                if (otherIdx !== idx && enabled && other.enabled) {
                    const dist = Math.hypot(x - other.x, y - other.y);
                    if (dist < 0.1) isTooClose = true;
                }
            });

            // 3. 画板上的 Marker Pin (单色高对比圆章)
            if (pinsContainer) {
                const pin = document.createElement('div');
                pin.className = 'char-stage-pin absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold cursor-grab active:cursor-grabbing select-none transition-transform ' +
                    (isActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl ring-2 ring-white dark:ring-slate-900 scale-110 z-20'
                        : 'bg-slate-900/80 text-white border border-white/70 shadow-lg z-10 hover:scale-105') +
                    (isTooClose ? ' ring-2 !ring-amber-400 animate-pulse' : '') +
                    (!enabled ? ' opacity-40' : '');
                pin.style.left = (x * 100) + '%';
                pin.style.top = (y * 100) + '%';
                pin.style.transform = 'translate(-50%, -50%)';
                pin.setAttribute('data-index', idx);
                const coordText = isV45 ? this._coordToGridLabel(x, y) : ((x * 100).toFixed(0) + '%, ' + (y * 100).toFixed(0) + '%');
                pin.title = '角色 ' + (idx + 1) + ' (' + coordText + ')' + (isTooClose ? ' - 距离过近' : '');
                pin.innerHTML = '<span>' + (idx + 1) + '</span>';
                pinsContainer.appendChild(pin);
            }

            if (isActive && activeCoordsLabel) {
                if (isV45) {
                    const gridLbl = this._coordToGridLabel(x, y);
                    activeCoordsLabel.innerHTML = '#' + (idx + 1) + ' · <b>' + gridLbl + '</b> (' + (x * 100).toFixed(0) + '%, ' + (y * 100).toFixed(0) + '%)' + (isTooClose ? ' <span class="text-amber-300">⚠</span>' : '');
                } else {
                    activeCoordsLabel.innerHTML = '#' + (idx + 1) + ' · <b>' + (x * 100).toFixed(0) + '%</b>, <b>' + (y * 100).toFixed(0) + '%</b>' + (isTooClose ? ' <span class="text-amber-300">⚠</span>' : '');
                }
            }
        });

        // 在 Chips 末尾提供一个轻量纯 SVG "+ 新增" 按钮，支持在主画布直接新增角色定位点
        if (chipsContainer && rows.length < 22) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'char-stage-chip-btn opacity-80 hover:opacity-100';
            addBtn.title = '新增角色定位点';
            addBtn.setAttribute?.('aria-label', '新增角色定位点');
            addBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 pointer-events-none"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg><span class="text-[11px] font-semibold">新增</span>';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                this.addCharacterPromptRow('', '', 0.5, 0.5, false, true);
                const updatedRows = container.querySelectorAll('.character-prompt-row');
                this.activeStageCharIndex = Math.max(0, updatedRows.length - 1);
                this.renderStage();
                const stageInput = document.getElementById('charStagePromptInput');
                if (stageInput && typeof stageInput.focus === 'function') stageInput.focus();
            };
            chipsContainer.appendChild(addBtn);
        }

        if (activeChipEl && this._lastScrolledCharIndex !== this.activeStageCharIndex) {
            this._lastScrolledCharIndex = this.activeStageCharIndex;
            if (typeof activeChipEl.scrollIntoView === 'function') {
                try {
                    activeChipEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                } catch (_) {}
            }
        }

        this._syncStagePromptEditor(rows);
    }

    _syncStagePromptEditor(rows) {
        const activeRow = rows[this.activeStageCharIndex];
        if (!activeRow) return;

        const badge = document.getElementById('charStagePromptBadge');
        const promptInput = document.getElementById('charStagePromptInput');
        const negInput = document.getElementById('charStageNegInput');
        const negWrap = document.getElementById('charStageNegWrap');
        const negToggleBtn = document.getElementById('charStageNegToggleBtn');
        const enableBtn = document.getElementById('charStageEnableBtn');

        const rowPrompt = activeRow.querySelector('.char-prompt-input')?.value || '';
        const rowNeg = activeRow.querySelector('.char-neg-input')?.value || '';
        const rowEnabled = activeRow.querySelector('.char-enable-toggle')?.checked !== false;

        if (badge) {
            badge.textContent = '#' + (this.activeStageCharIndex + 1);
        }
        if (promptInput) {
            if (typeof document === 'undefined' || document.activeElement !== promptInput) {
                promptInput.value = rowPrompt;
            }
            promptInput.disabled = !rowEnabled;
            promptInput.placeholder = '角色 #' + (this.activeStageCharIndex + 1) + ' 提示词 (如: 1girl, silver hair)...';
        }
        if (negInput) {
            if (typeof document === 'undefined' || document.activeElement !== negInput) {
                negInput.value = rowNeg;
            }
            negInput.disabled = !rowEnabled;
        }
        if (negWrap && negToggleBtn) {
            if (rowNeg.trim().length > 0 && !this._negManuallyCollapsed) {
                negWrap.classList.remove('hidden');
                negWrap.classList.add('flex');
            }
            const isNegOpen = !negWrap.classList.contains('hidden');
            negToggleBtn.classList.toggle('tool-active', isNegOpen || rowNeg.trim().length > 0);
        }
        if (enableBtn) {
            enableBtn.classList.toggle('tool-active', rowEnabled);
            enableBtn.classList.toggle('opacity-45', !rowEnabled);
        }
    }

    _initStageInteractions() {
        this._initStagePromptCardInteractions();

        const box = document.getElementById('charStageBox');
        if (!box || box.dataset?.interactionBound === 'true') return;
        if (box.dataset) box.dataset.interactionBound = 'true';

        let isDragging = false;

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

            const isV45 = this.currentModel === 'v4.5';
            const finalX = isV45 ? this._snapToV45Grid(normX) : parseFloat(normX.toFixed(3));
            const finalY = isV45 ? this._snapToV45Grid(normY) : parseFloat(normY.toFixed(3));

            const autoPosCheckbox = targetRow.querySelector('.char-auto-pos');
            if (autoPosCheckbox && autoPosCheckbox.checked) {
                autoPosCheckbox.checked = false;
                const v5Wrap = targetRow.querySelector('.char-v5-pos-wrapper');
                const v45Wrap = targetRow.querySelector('.char-v45-grid-wrapper');
                if (this.currentModel === 'v5' && v5Wrap) v5Wrap.classList.remove('hidden');
                if (this.currentModel === 'v4.5' && v45Wrap) v45Wrap.classList.remove('hidden');
            }

            this.setCharPosition(targetRow, finalX, finalY);
            this.renderStage();
        };

        box.addEventListener('pointerdown', (e) => {
            const pinTarget = e.target?.closest ? e.target.closest('.char-stage-pin') : null;
            if (pinTarget) {
                const idx = parseInt(pinTarget.getAttribute('data-index') || '0', 10);
                this.activeStageCharIndex = idx;
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

        if (typeof window !== 'undefined' && !this._stageResizeBound) {
            this._stageResizeBound = true;
            const handleViewportSync = () => {
                if (this.isOpen) {
                    this.updatePadAspectRatio();
                }
            };
            window.addEventListener('resize', handleViewportSync);
            if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
                window.visualViewport.addEventListener('resize', handleViewportSync);
            }
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.closeStage();
                }
            });
        }
    }

    _initStagePromptCardInteractions() {
        const chipsEl = document.getElementById('charStageChips');
        if (chipsEl && chipsEl.dataset?.wheelBound !== 'true') {
            if (chipsEl.dataset) chipsEl.dataset.wheelBound = 'true';
            chipsEl.addEventListener('wheel', (e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.preventDefault();
                    chipsEl.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }

        const promptInput = document.getElementById('charStagePromptInput');
        if (!promptInput || promptInput.dataset?.interactionBound === 'true') return;
        if (promptInput.dataset) promptInput.dataset.interactionBound = 'true';

        const negInput = document.getElementById('charStageNegInput');
        const negWrap = document.getElementById('charStageNegWrap');
        const negToggleBtn = document.getElementById('charStageNegToggleBtn');
        const enableBtn = document.getElementById('charStageEnableBtn');
        const deleteBtn = document.getElementById('charStageDeleteBtn');

        const getActiveRow = () => {
            const container = document.getElementById('characterPromptsContainer');
            if (!container) return null;
            const rows = Array.from(container.querySelectorAll('.character-prompt-row'));
            return rows[this.activeStageCharIndex] || null;
        };

        promptInput.addEventListener('input', () => {
            const row = getActiveRow();
            if (!row) return;
            const rowPrompt = row.querySelector('.char-prompt-input');
            if (rowPrompt) {
                rowPrompt.value = promptInput.value;
            }
            if (typeof row._updateSummary === 'function') {
                row._updateSummary();
            }
            this.saveCharacterPromptsState();
            this.renderStage();
        });

        if (negInput) {
            negInput.addEventListener('input', () => {
                const row = getActiveRow();
                if (!row) return;
                const rowNeg = row.querySelector('.char-neg-input');
                if (rowNeg) {
                    rowNeg.value = negInput.value;
                }
                this.saveCharacterPromptsState();
                this.renderStage();
            });
        }

        if (negToggleBtn && negWrap) {
            negToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = negWrap.classList.contains('hidden');
                if (isHidden) {
                    this._negManuallyCollapsed = false;
                    negWrap.classList.remove('hidden');
                    negWrap.classList.add('flex');
                    negToggleBtn.classList.add('tool-active');
                    if (negInput && typeof negInput.focus === 'function') negInput.focus();
                } else {
                    this._negManuallyCollapsed = true;
                    negWrap.classList.add('hidden');
                    negWrap.classList.remove('flex');
                    const row = getActiveRow();
                    const hasNeg = (row?.querySelector('.char-neg-input')?.value || '').trim().length > 0;
                    negToggleBtn.classList.toggle('tool-active', hasNeg);
                }
            });
        }

        if (enableBtn) {
            enableBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = getActiveRow();
                if (!row) return;
                const toggle = row.querySelector('.char-enable-toggle');
                if (!toggle) return;
                toggle.checked = !toggle.checked;
                if (typeof row._applyEnabledState === 'function') {
                    row._applyEnabledState(toggle.checked);
                }
                this.saveCharacterPromptsState();
                this.renderStage();
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const container = document.getElementById('characterPromptsContainer');
                if (!container) return;
                const rows = Array.from(container.querySelectorAll('.character-prompt-row'));
                const row = rows[this.activeStageCharIndex];
                if (!row) return;

                if (rows.length <= 1) {
                    // 仅剩最后一个角色时，清空其提示词并重置为中心点
                    const rowPrompt = row.querySelector('.char-prompt-input');
                    const rowNeg = row.querySelector('.char-neg-input');
                    if (rowPrompt) rowPrompt.value = '';
                    if (rowNeg) rowNeg.value = '';
                    if (typeof row._updateSummary === 'function') row._updateSummary();
                    this.setCharPosition(row, 0.5, 0.5);
                    this.saveCharacterPromptsState();
                    this.renderStage();
                } else {
                    row.remove();
                    this.updateCharacterIndexLabels();
                    this.activeStageCharIndex = Math.max(0, Math.min(this.activeStageCharIndex, rows.length - 2));
                    this.saveCharacterPromptsState();
                    this.renderStage();
                }
            });
        }
    }
}

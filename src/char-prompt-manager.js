/**
 * Character Prompt Manager Module (V4.5 Multi-character feature)
 * Encapsulates DOM creation, interactive grid coordinate selection, collapsing panels, and state persistence.
 */
export class CharPromptManager {
    constructor() {
        this.store = null;
    }

    bind(store) {
        this.store = store;
    }

    saveCharacterPromptsState() {
        const container = document.getElementById('characterPromptsContainer');
        if (!container) return;
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
        
        const div = document.createElement('div');
        div.className = 'flex flex-col gap-2.5 character-prompt-row border border-gray-100 dark:border-slate-800 p-3 rounded-2xl bg-gray-50/50 dark:bg-slate-900/20 transition-all';
        
        // Generate 5*5 interactive grid
        let gridHtml = '';
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                const cellX = (c * 2 + 1) / 10;
                const cellY = (r * 2 + 1) / 10;
                const isTarget = Math.abs(cellX - x) < 0.01 && Math.abs(cellY - y) < 0.01;
                gridHtml += `
                    <button type="button" 
                        onclick="window.selectCharGridCell(this, ${cellX}, ${cellY})"
                        class="char-grid-cell w-full h-full rounded-md border transition-all ${isTarget ? 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}"
                        style="aspect-ratio: 1/1;"
                        title="列 ${c+1}, 排 ${r+1} (x: ${cellX}, y: ${cellY})">
                    </button>
                `;
            }
        }

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
                    <input type="text" class="char-prompt-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${promptVal}" placeholder="填入角色特征tag，例如: boy, 1girl" />
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">排除词 (Character Negative, 可选)</label>
                    <input type="text" class="char-neg-input art-input w-full px-3 py-2 rounded-xl text-xs outline-none" value="${negVal}" placeholder="特定于该角色的排除特征，默认为空" />
                </div>
                <div class="space-y-1 mt-2">
                    <div class="flex justify-between items-center text-[9px] text-gray-400 dark:text-gray-500">
                        <span>角色定位 (Position)</span>
                        <label class="flex items-center gap-1 cursor-pointer select-none">
                            <input type="checkbox" class="char-auto-pos sr-only peer" ${autoPos ? 'checked' : ''}>
                            <div class="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 relative scale-90"></div>
                            <span>AI 自动位置</span>
                        </label>
                    </div>
                    <!-- 5*5 定位网格 -->
                    <div class="char-grid-container ${autoPos ? 'hidden' : ''} grid grid-cols-5 gap-1 w-28 h-28 mx-auto mt-2 border border-gray-200 dark:border-gray-700 p-1 rounded-xl bg-gray-100 dark:bg-slate-900/50">
                        ${gridHtml}
                    </div>
                    <!-- 隐藏输入框以保存坐标 -->
                    <input type="hidden" class="char-pos-x" value="${x}" />
                    <input type="hidden" class="char-pos-y" value="${y}" />
                </div>
            </div>
        `;
        
        const enableToggle = div.querySelector('.char-enable-toggle');
        const enableText = div.querySelector('.char-enable-text');
        const inputs = div.querySelectorAll('.char-prompt-input, .char-neg-input, .char-auto-pos');
        const gridCells = div.querySelectorAll('.char-grid-cell');
        
        const applyEnabledState = (isEnabled) => {
            if (isEnabled) {
                enableText.textContent = "已启用";
                enableText.className = "char-enable-text text-green-600 dark:text-green-500";
                div.classList.remove('opacity-60');
                inputs.forEach(input => input.disabled = false);
                gridCells.forEach(cell => cell.disabled = false);
            } else {
                enableText.textContent = "已禁用";
                enableText.className = "char-enable-text text-gray-400 dark:text-gray-500";
                div.classList.add('opacity-60');
                inputs.forEach(input => input.disabled = true);
                gridCells.forEach(cell => cell.disabled = true);
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

        // 阻止右侧按钮冒泡，以防止点击它们时触发折叠
        rowActions.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 角色提示词摘要实时显示并保存状态
        const promptInput = div.querySelector('.char-prompt-input');
        const summarySpan = div.querySelector('.char-row-summary');
        const updateSummary = () => {
            const val = promptInput.value.trim();
            if (val) {
                const cleanVal = val.replace(/[\{\}\[\]\(\)]/g, '').trim();
                summarySpan.textContent = `(${cleanVal.length > 18 ? cleanVal.slice(0, 18) + '...' : cleanVal})`;
            } else {
                summarySpan.textContent = '';
            }
        };
        promptInput.addEventListener('input', () => {
            updateSummary();
            this.saveCharacterPromptsState();
        });
        updateSummary();

        // 排除词修改保存
        const negInput = div.querySelector('.char-neg-input');
        negInput.addEventListener('input', () => this.saveCharacterPromptsState());

        // 监听 AI 自动位置开关
        const autoPosCheckbox = div.querySelector('.char-auto-pos');
        const gridContainer = div.querySelector('.char-grid-container');
        const posXInput = div.querySelector('.char-pos-x');
        const posYInput = div.querySelector('.char-pos-y');
        
        autoPosCheckbox.addEventListener('change', (e) => {
            if (autoPosCheckbox.disabled) return;
            if (e.target.checked) {
                gridContainer.classList.add('hidden');
                posXInput.value = "0.5";
                posYInput.value = "0.5";
                const cells = gridContainer.querySelectorAll('.char-grid-cell');
                cells.forEach((cell, idx) => {
                    if (idx === 12) {
                        cell.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-indigo-600 border-indigo-600 dark:bg-indigo-500';
                    } else {
                        cell.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50';
                    }
                });
            } else {
                gridContainer.classList.remove('hidden');
            }
            this.saveCharacterPromptsState();
        });

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

    selectCharGridCell(btn, x, y) {
        const grid = btn.closest('.char-grid-container');
        if (!grid) return;
        
        const cells = grid.querySelectorAll('.char-grid-cell');
        cells.forEach(cell => {
            cell.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50';
        });
        
        btn.className = 'char-grid-cell w-full h-full rounded-md border transition-all bg-indigo-600 border-indigo-600 dark:bg-indigo-500';
        
        const row = grid.closest('.character-prompt-row');
        if (row) {
            const posXInput = row.querySelector('.char-pos-x');
            const posYInput = row.querySelector('.char-pos-y');
            if (posXInput) posXInput.value = x;
            if (posYInput) posYInput.value = y;
            this.saveCharacterPromptsState();
        }
    }
}

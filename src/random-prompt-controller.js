/**
 * Random Prompt Controller Module
 * Manages the Random Prompt settings tab UI interaction, CRUD events,
 * and autocomplete linkages for each category's inputs.
 */
export class RandomPromptController {
    constructor() {
        this.manager = null;
        this.promptHelper = null;
        this._expandedCategories = new Set();
    }

    bind(manager, promptHelper) {
        this.manager = manager;
        this.promptHelper = promptHelper;
    }

    _countTagGroups(content) {
        if (!content || typeof content !== 'string') return 0;
        return content
            .split(';')
            .map((g) => g.replace(/^[,\s]+|[,\s]+$/g, '').trim())
            .filter(Boolean).length;
    }

    _isAccordionGrid(bodyEl) {
        const accordionBody = typeof bodyEl?.querySelector === 'function'
            ? bodyEl.querySelector('.studio-accordion-body')
            : null;
        return Boolean(
            accordionBody &&
            typeof getComputedStyle === 'function' &&
            getComputedStyle(accordionBody)?.display === 'grid'
        );
    }

    _applyFoldState(name, shouldExpand) {
        const body = document.getElementById(`rp-body-${name}`);
        const chevron = document.getElementById(`rp-chevron-${name}`);
        const foldBtn = document.getElementById(`rp-fold-btn-${name}`);
        const header = document.getElementById(`rp-header-${name}`);
        if (!body) return;

        if (shouldExpand) {
            this._expandedCategories.add(name);
        } else {
            this._expandedCategories.delete(name);
        }

        const usesAccordion = this._isAccordionGrid(body);
        if (usesAccordion) {
            body.classList.remove('hidden');
            body.classList.toggle('is-open', Boolean(shouldExpand));
        } else {
            body.classList.toggle('hidden', !shouldExpand);
            body.classList.toggle('is-open', Boolean(shouldExpand));
        }

        chevron?.classList?.toggle?.('-rotate-90', !shouldExpand);
        foldBtn?.setAttribute?.('aria-expanded', shouldExpand ? 'true' : 'false');
        header?.classList?.toggle?.('border-b', Boolean(shouldExpand));
        header?.classList?.toggle?.('border-slate-200/80', Boolean(shouldExpand));
        header?.classList?.toggle?.('dark:border-slate-800/80', Boolean(shouldExpand));
        this._syncToggleAllButton();
    }

    _syncToggleAllButton() {
        const btn = typeof document !== 'undefined' ? document.getElementById('rpToggleAllBtn') : null;
        if (!btn || !this.manager) return;
        const categories = this.manager.getCategories?.() || [];
        if (categories.length === 0) {
            btn.classList.add('hidden');
            return;
        }
        btn.classList.remove('hidden');
        const anyOpen = categories.some((c) => this._expandedCategories.has(String(c.name || '')));
        btn.textContent = anyOpen ? '全部收起' : '全部展开';
        btn.setAttribute?.('aria-pressed', anyOpen ? 'true' : 'false');
    }

    toggleAllFold(forceExpand) {
        if (!this.manager) return;
        const categories = this.manager.getCategories?.() || [];
        if (categories.length === 0) return;
        const anyOpen = categories.some((c) => this._expandedCategories.has(String(c.name || '')));
        const targetExpand = typeof forceExpand === 'boolean' ? forceExpand : !anyOpen;
        categories.forEach((cat) => {
            this._applyFoldState(String(cat.name || ''), targetExpand);
        });
    }

    renderList() {
        const container = document.getElementById('randomPromptCategoriesContainer');
        const addSection = document.getElementById('newRandomPromptCategoryName')?.parentNode;
        if (!container) return;

        const globalEnabled = this.manager.isEnabled();
        container.classList.add('transition-opacity', 'duration-200');
        if (addSection && addSection.classList) addSection.classList.add('transition-opacity', 'duration-200');
        if (globalEnabled) {
            container.classList.remove('opacity-50', 'pointer-events-none');
            if (addSection) addSection.classList.remove('opacity-50', 'pointer-events-none');
        } else {
            container.classList.add('opacity-50', 'pointer-events-none');
            if (addSection) addSection.classList.add('opacity-50', 'pointer-events-none');
        }

        if (this.promptHelper && typeof this.promptHelper.detachSuggestPanel === 'function') {
            this.promptHelper.detachSuggestPanel();
        }

        container.innerHTML = '';
        const categories = this.manager.getCategories();

        categories.forEach((cat, idx) => {
            const catName = String(cat.name || '');
            const isExpanded = this._expandedCategories.has(catName);
            const groupCount = this._countTagGroups(cat.content);
            const item = document.createElement('div');
            item.className = 'studio-card studio-list-enter border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden bg-white/70 dark:bg-slate-900/40 shadow-sm';
            item.style?.setProperty?.('--sibling-index', String(Math.min(idx, 10)));

            // Header and body opacity + disabled state if not enabled
            const headerOpacity = cat.enabled ? '' : 'opacity-60';
            const bodyOpacity = cat.enabled ? '' : 'opacity-40 pointer-events-none';
            const headerBorder = isExpanded ? 'border-b border-slate-200/80 dark:border-slate-800/80' : '';

            const header = document.createElement('div');
            header.id = `rp-header-${catName}`;
            header.className = `flex justify-between items-center gap-2 bg-slate-50/70 dark:bg-slate-950/20 px-3.5 py-2 cursor-pointer select-none transition-opacity duration-200 ${headerBorder} ${headerOpacity}`.trim();
            header.addEventListener('click', (event) => {
                if (typeof window !== 'undefined' && typeof window.toggleRandomCategoryFold === 'function') {
                    window.toggleRandomCategoryFold(catName, event);
                } else {
                    this.toggleFold(catName, event);
                }
            });

            const leftGroup = document.createElement('div');
            leftGroup.className = 'flex items-center gap-2 min-w-0 flex-1';
            leftGroup.addEventListener('click', (e) => e.stopPropagation());

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `rp-chk-${catName}`;
            checkbox.name = `nai_rp_chk_${idx}`;
            checkbox.setAttribute('autocomplete', 'off');
            checkbox.checked = !!cat.enabled;
            checkbox.className = 'w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 accent-slate-900 dark:accent-white focus:ring-slate-500 cursor-pointer shrink-0';
            checkbox.addEventListener('change', (e) => {
                if (typeof window !== 'undefined' && typeof window.toggleRandomCategory === 'function') {
                    window.toggleRandomCategory(catName, e.target.checked);
                } else {
                    this.toggleCategory(catName, e.target.checked);
                }
            });

            const titleSpan = document.createElement('span');
            titleSpan.className = 'text-xs font-bold text-slate-700 dark:text-slate-200 capitalize truncate';
            titleSpan.textContent = catName;

            const countBadge = document.createElement('span');
            countBadge.id = `rp-count-${catName}`;
            countBadge.className = 'text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0';
            countBadge.textContent = `${groupCount} 组`;

            leftGroup.appendChild(checkbox);
            leftGroup.appendChild(titleSpan);
            leftGroup.appendChild(countBadge);

            const rightGroup = document.createElement('div');
            rightGroup.className = 'flex items-center gap-1 shrink-0';
            rightGroup.addEventListener('click', (e) => e.stopPropagation());

            if (cat.custom) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'studio-icon-btn w-7 h-7 p-1 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-400 hover:text-red-500 rounded-lg transition-colors duration-150 cursor-pointer';
                delBtn.setAttribute('aria-label', '删除分类');
                delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 pointer-events-none"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
                delBtn.addEventListener('click', () => {
                    if (typeof window !== 'undefined' && typeof window.deleteRandomCategory === 'function') {
                        window.deleteRandomCategory(catName);
                    } else {
                        this.deleteCategory(catName);
                    }
                });
                rightGroup.appendChild(delBtn);
            }

            const foldBtn = document.createElement('button');
            foldBtn.type = 'button';
            foldBtn.id = `rp-fold-btn-${catName}`;
            foldBtn.className = 'studio-icon-btn w-7 h-7 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg transition-colors duration-150 cursor-pointer';
            foldBtn.setAttribute('aria-label', '展开或收起');
            foldBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            foldBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 transition-transform duration-200 pointer-events-none ${isExpanded ? '' : '-rotate-90'}"><path d="m6 9 6 6 6-6"/></svg>`;
            const chevronSvg = foldBtn.querySelector('svg');
            if (chevronSvg) {
                chevronSvg.id = `rp-chevron-${catName}`;
                if (!isExpanded) chevronSvg.classList?.add?.('-rotate-90');
            }
            foldBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (typeof window !== 'undefined' && typeof window.toggleRandomCategoryFold === 'function') {
                    window.toggleRandomCategoryFold(catName);
                } else {
                    this.toggleFold(catName);
                }
            });
            rightGroup.appendChild(foldBtn);

            header.appendChild(leftGroup);
            header.appendChild(rightGroup);

            const body = document.createElement('div');
            body.id = `rp-body-${catName}`;
            body.className = `studio-accordion ${isExpanded ? 'is-open' : 'hidden'} transition-opacity duration-200 ${bodyOpacity}`.trim();

            const accordionBody = document.createElement('div');
            accordionBody.className = 'studio-accordion-body';
            const accordionInner = document.createElement('div');
            accordionInner.className = 'studio-accordion-inner p-3 space-y-2';

            const textarea = document.createElement('textarea');
            textarea.id = `rp-txt-${catName}`;
            textarea.name = `nai_rp_txt_${idx}`;
            textarea.setAttribute('autocomplete', 'off');
            textarea.rows = 2;
            textarea.className = 'art-input w-full px-3 py-2 rounded-xl text-xs outline-none resize-none text-slate-700 dark:text-slate-200';
            textarea.placeholder = '以英文分号分词组，例如: jk uniform, white shirt; maid outfit, apron; white summer dress';
            if (!cat.enabled) textarea.disabled = true;
            textarea.value = cat.content || '';
            textarea.addEventListener('input', (e) => {
                countBadge.textContent = `${this._countTagGroups(e.target.value)} 组`;
                if (typeof window !== 'undefined' && typeof window.updateRandomCategoryContent === 'function') {
                    window.updateRandomCategoryContent(catName, e.target.value);
                } else {
                    this.updateCategoryContent(catName, e.target.value);
                }
            });

            const placeholder = document.createElement('div');
            placeholder.id = `rp-placeholder-${catName}`;
            placeholder.className = 'mt-1';

            accordionInner.appendChild(textarea);
            accordionInner.appendChild(placeholder);
            accordionBody.appendChild(accordionInner);
            body.appendChild(accordionBody);

            item.appendChild(header);
            item.appendChild(body);
            container.appendChild(item);

            // 若浏览器支持 CSS grid-template-rows 手风琴，移除 hidden 以保证首次展开有顺滑过渡动画
            if (!isExpanded && this._isAccordionGrid(body)) {
                body.classList.remove('hidden');
            }

            if (this.promptHelper) {
                this.promptHelper.registerInput(textarea, placeholder);
            }
        });

        this._syncToggleAllButton();
    }

    toggleEnabled(checked) {
        this.manager.setEnabled(checked);
        const container = document.getElementById('randomPromptCategoriesContainer');
        const addSection = document.getElementById('newRandomPromptCategoryName')?.parentNode;
        if (container) {
            container.classList.add('transition-opacity', 'duration-200');
            if (addSection && addSection.classList) addSection.classList.add('transition-opacity', 'duration-200');
            if (checked) {
                container.classList.remove('opacity-50', 'pointer-events-none');
                if (addSection) addSection.classList.remove('opacity-50', 'pointer-events-none');
            } else {
                container.classList.add('opacity-50', 'pointer-events-none');
                if (addSection) addSection.classList.add('opacity-50', 'pointer-events-none');
            }
        }
        this.renderList();
    }

    toggleCategory(name, checked) {
        this.manager.updateCategory(name, { enabled: checked });
        
        // Instantly update body opacity and textarea disabled status
        const body = document.getElementById(`rp-body-${name}`);
        const textarea = document.getElementById(`rp-txt-${name}`);
        const header = document.getElementById(`rp-header-${name}`);
        if (body && textarea && header) {
            if (checked) {
                body.classList.remove('opacity-40', 'pointer-events-none');
                header.classList.remove('opacity-60');
                textarea.removeAttribute('disabled');
            } else {
                body.classList.add('opacity-40', 'pointer-events-none');
                header.classList.add('opacity-60');
                textarea.setAttribute('disabled', 'true');
            }
        }
    }

    toggleFold(name, event) {
        if (event) {
            // Prevent toggling when clicking inputs/buttons inside header
            const target = event.target;
            if (target?.closest?.('input') || target?.closest?.('button')) {
                return;
            }
        }
        const body = document.getElementById(`rp-body-${name}`);
        if (!body) return;

        const isCurrentlyOpen = this._isAccordionGrid(body)
            ? body.classList.contains('is-open')
            : !body.classList.contains('hidden');
        this._applyFoldState(name, !isCurrentlyOpen);
    }

    updateCategoryContent(name, content) {
        this.manager.updateCategory(name, { content: content });
    }

    async deleteCategory(name) {
        if (await window.showConfirm(`确定要删除自定义分类 “${name}” 吗？`, "确认删除")) {
            this._expandedCategories.delete(name);
            this.manager.removeCategory(name);
            this.renderList();
        }
    }

    addCategory() {
        const input = document.getElementById('newRandomPromptCategoryName');
        if (!input) return;
        const name = input.value.trim();
        if (!name) {
            window.showToast("请输入类别名称", "warning");
            return;
        }
        const res = this.manager.addCategory(name);
        if (res.error) {
            window.showToast(res.error, "error");
        } else {
            input.value = '';
            // 仅展开刚刚新建的分类，方便立即填写词条，其余分类继续保持收起
            this._expandedCategories.add(name);
            this.renderList();
            window.showToast(`添加类别 “${name}” 成功`, "success");
        }
    }

    exportFile() {
        const dataStr = this.manager.exportData();
        const blob = new Blob([dataStr], { type: "application/json" });
        const filename = `novelai_random_prompts_${new Date().toISOString().slice(0,10)}.json`;
        if (typeof window !== 'undefined' && typeof window.triggerDownload === 'function') {
            window.triggerDownload(blob, filename);
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    importFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const res = this.manager.importData(e.target.result);
            if (res.error) {
                window.showToast(res.error, "error");
            } else {
                window.showToast("导入随机词库成功", "success");
                // Sync global toggle
                const globalCheckbox = document.getElementById('randomPromptEnabled');
                if (globalCheckbox) {
                    globalCheckbox.checked = this.manager.isEnabled();
                }
                this.renderList();
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
}

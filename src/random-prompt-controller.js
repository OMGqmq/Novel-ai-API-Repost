/**
 * Random Prompt Controller Module
 * Manages the Random Prompt settings tab UI interaction, CRUD events,
 * and autocomplete linkages for each category's inputs.
 */
export class RandomPromptController {
    constructor() {
        this.manager = null;
        this.promptHelper = null;
    }

    bind(manager, promptHelper) {
        this.manager = manager;
        this.promptHelper = promptHelper;
    }

    renderList() {
        const container = document.getElementById('randomPromptCategoriesContainer');
        const addSection = document.getElementById('newRandomPromptCategoryName')?.parentNode;
        if (!container) return;

        const globalEnabled = this.manager.isEnabled();
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
            const item = document.createElement('div');
            item.className = 'border border-gray-200 dark:border-slate-800/80 rounded-2xl overflow-hidden bg-white/50 dark:bg-slate-900/40 shadow-sm';

            // Header and body opacity + disabled state if not enabled
            const headerOpacity = cat.enabled ? '' : 'opacity-60';
            const bodyOpacity = cat.enabled ? '' : 'opacity-40 pointer-events-none';

            const header = document.createElement('div');
            header.id = `rp-header-${catName}`;
            header.className = `flex justify-between items-center bg-gray-50/50 dark:bg-slate-950/20 px-4 py-2.5 border-b border-gray-200 dark:border-slate-800/80 cursor-pointer select-none ${headerOpacity}`.trim();
            header.addEventListener('click', (event) => {
                if (typeof window !== 'undefined' && typeof window.toggleRandomCategoryFold === 'function') {
                    window.toggleRandomCategoryFold(catName, event);
                } else {
                    this.toggleFold(catName, event);
                }
            });

            const leftGroup = document.createElement('div');
            leftGroup.className = 'flex items-center gap-2 min-w-0';
            leftGroup.addEventListener('click', (e) => e.stopPropagation());

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `rp-chk-${catName}`;
            checkbox.name = `nai_rp_chk_${idx}`;
            checkbox.setAttribute('autocomplete', 'off');
            checkbox.checked = !!cat.enabled;
            checkbox.className = 'w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-700 accent-slate-900 dark:accent-white focus:ring-slate-500 cursor-pointer shrink-0';
            checkbox.addEventListener('change', (e) => {
                if (typeof window !== 'undefined' && typeof window.toggleRandomCategory === 'function') {
                    window.toggleRandomCategory(catName, e.target.checked);
                } else {
                    this.toggleCategory(catName, e.target.checked);
                }
            });

            const titleSpan = document.createElement('span');
            titleSpan.className = 'text-xs font-bold text-gray-700 dark:text-gray-200 capitalize truncate';
            titleSpan.textContent = catName;

            leftGroup.appendChild(checkbox);
            leftGroup.appendChild(titleSpan);

            const rightGroup = document.createElement('div');
            rightGroup.className = 'flex items-center gap-1.5 shrink-0';
            rightGroup.addEventListener('click', (e) => e.stopPropagation());

            if (cat.custom) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'p-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-lg transition-colors cursor-pointer';
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
            foldBtn.className = 'p-1 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 dark:text-gray-500 rounded-lg transition-transform duration-200 cursor-pointer';
            foldBtn.setAttribute('aria-label', '展开或收起');
            foldBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 transition-transform duration-200 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>`;
            const chevronSvg = foldBtn.querySelector('svg');
            if (chevronSvg) chevronSvg.id = `rp-chevron-${catName}`;
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
            body.className = `p-3 space-y-2 transition-all ${bodyOpacity}`.trim();

            const textarea = document.createElement('textarea');
            textarea.id = `rp-txt-${catName}`;
            textarea.name = `nai_rp_txt_${idx}`;
            textarea.setAttribute('autocomplete', 'off');
            textarea.rows = 2;
            textarea.className = 'art-input w-full px-3 py-2 rounded-xl text-xs outline-none resize-none text-gray-700 dark:text-gray-200';
            textarea.placeholder = '以英文分号分词组，例如: jk uniform, white shirt; maid outfit, apron; white summer dress';
            if (!cat.enabled) textarea.disabled = true;
            textarea.value = cat.content || '';
            textarea.addEventListener('input', (e) => {
                if (typeof window !== 'undefined' && typeof window.updateRandomCategoryContent === 'function') {
                    window.updateRandomCategoryContent(catName, e.target.value);
                } else {
                    this.updateCategoryContent(catName, e.target.value);
                }
            });

            const placeholder = document.createElement('div');
            placeholder.id = `rp-placeholder-${catName}`;
            placeholder.className = 'mt-1';

            body.appendChild(textarea);
            body.appendChild(placeholder);

            item.appendChild(header);
            item.appendChild(body);
            container.appendChild(item);

            if (this.promptHelper) {
                this.promptHelper.registerInput(textarea, placeholder);
            }
        });
    }

    toggleEnabled(checked) {
        this.manager.setEnabled(checked);
        const container = document.getElementById('randomPromptCategoriesContainer');
        const addSection = document.getElementById('newRandomPromptCategoryName')?.parentNode;
        if (container) {
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
            if (target.closest('input') || target.closest('button')) {
                return;
            }
        }
        const body = document.getElementById(`rp-body-${name}`);
        const chevron = document.getElementById(`rp-chevron-${name}`);
        if (body && chevron) {
            const isCollapsed = body.classList.toggle('hidden');
            if (isCollapsed) {
                chevron.classList.add('-rotate-90');
            } else {
                chevron.classList.remove('-rotate-90');
            }
        }
    }

    updateCategoryContent(name, content) {
        this.manager.updateCategory(name, { content: content });
    }

    async deleteCategory(name) {
        if (await window.showConfirm(`确定要删除自定义分类 “${name}” 吗？`, "确认删除")) {
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

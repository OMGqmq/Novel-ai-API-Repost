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

        container.innerHTML = '';
        const categories = this.manager.getCategories();

        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'border border-gray-155 dark:border-slate-800/80 rounded-2xl overflow-hidden bg-white/50 dark:bg-slate-900/40 shadow-sm';
            
            // Header and body opacity + disabled state if not enabled
            const headerOpacity = cat.enabled ? '' : 'opacity-60';
            const bodyOpacity = cat.enabled ? '' : 'opacity-40 pointer-events-none';
            const textareaDisabled = cat.enabled ? '' : 'disabled';

            item.innerHTML = `
                <div id="rp-header-${cat.name}" class="flex justify-between items-center bg-gray-50/50 dark:bg-slate-950/20 px-4 py-2.5 border-b border-gray-155 dark:border-slate-800/80 cursor-pointer select-none ${headerOpacity}" onclick="window.toggleRandomCategoryFold('${cat.name}', event)">
                    <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                        <input type="checkbox" id="rp-chk-${cat.name}" ${cat.enabled ? 'checked' : ''} onchange="window.toggleRandomCategory('${cat.name}', this.checked)" class="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-700 text-indigo-500 focus:ring-indigo-500 cursor-pointer">
                        <span class="text-xs font-bold text-gray-700 dark:text-gray-200 capitalize">${cat.name}</span>
                    </div>
                    <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
                        ${cat.custom ? `
                            <button onclick="window.deleteRandomCategory('${cat.name}')" class="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-lg transition-colors cursor-pointer">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        ` : ''}
                        <button class="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 dark:text-gray-500 rounded-lg transition-transform duration-200" onclick="window.toggleRandomCategoryFold('${cat.name}', event)">
                            <i data-lucide="chevron-down" id="rp-chevron-${cat.name}" class="w-3.5 h-3.5 transition-transform duration-200"></i>
                        </button>
                    </div>
                </div>
                <div id="rp-body-${cat.name}" class="p-3 space-y-2 transition-all ${bodyOpacity}">
                    <textarea id="rp-txt-${cat.name}" rows="2" oninput="window.updateRandomCategoryContent('${cat.name}', this.value)" class="art-input w-full px-3 py-2 rounded-xl text-xs outline-none resize-none text-gray-700 dark:text-gray-200" placeholder="以英文分号分词组，例如: jk uniform, white shirt; maid outfit, apron; white summer dress" ${textareaDisabled}></textarea>
                    <div id="rp-placeholder-${cat.name}" class="mt-1"></div>
                </div>
            `;
            
            container.appendChild(item);
            
            // Populate current content
            const textarea = item.querySelector(`#rp-txt-${cat.name}`);
            if (textarea) {
                textarea.value = cat.content || '';
                // Register with promptHelper autocomplete
                const placeholder = item.querySelector(`#rp-placeholder-${cat.name}`);
                if (placeholder && this.promptHelper) {
                    this.promptHelper.registerInput(textarea, placeholder);
                }
            }
        });

        if (window.safeCreateIcons) window.safeCreateIcons();
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
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `novelai_random_prompts_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
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

/**
 * Inspiration Manager Module
 * Handles random creative prompt drafting, sandboxed image preview generation,
 * and prompt/image importing back to the main workspace.
 */

const CATEGORY_STYLES = {
    clothing: { cn: '服装', color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100/30 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30' },
    action: { cn: '动作', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/30 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30' },
    nsfw: { cn: '限制级', color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/30 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30' },
    style: { cn: '画风', color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100/30 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30' },
    object: { cn: '物品', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100/30 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30' },
    character: { cn: 'IP角色', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100/30 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30' },
    lighting: { cn: '光影', color: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100/30 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/30' },
    perspective: { cn: '视角', color: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100/30 dark:bg-cyan-950/20 dark:text-cyan-400 dark:border-cyan-900/30' },
    composition: { cn: '构图', color: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100/30 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900/30' }
};

export class InspirationManager {
    constructor(config = {}) {
        this.engine = config.engine;
        this.promptHelper = config.promptHelper;
        this.store = config.store;
        this.onShowToast = config.onShowToast || ((msg, type) => {
            if (window.showToast) window.showToast(msg, type);
            else console.log(`[Toast] ${type}: ${msg}`);
        });

        this.modalEl = document.getElementById('inspirationModal');
        this.togglesContainer = document.getElementById('inspCategoryToggles');
        this.tagListContainer = document.getElementById('inspTagList');
        
        this.placeholderEl = document.getElementById('inspPreviewPlaceholder');
        this.previewImageEl = document.getElementById('inspPreviewImage');
        this.loadingEl = document.getElementById('inspPreviewLoading');
        this.generateBtn = document.getElementById('inspGenerateBtn');
        this.saveImageBtn = document.getElementById('inspSaveImageBtn');
        this.selectedCountEl = document.getElementById('inspSelectedCount');

        this.selectedCategories = new Set(['clothing', 'action', 'style', 'object', 'lighting']);
        this.drawnTags = []; // 当前抽取的标签 { en, cn, cat, selected }
        
        // 缓存生成的图片结果暂存区
        this.lastGeneratedBlob = null;
        this.lastGeneratedResult = null;
        this.lastGeneratedPrompt = '';
        this.lastGeneratedParams = null;

        this.initGlobalBindings();
    }

    initGlobalBindings() {
        window.openInspirationModal = () => this.open();
        window.closeInspirationModal = () => this.close();
        window.drawInspirationTags = () => this.drawTags();
        window.importInspirationPrompt = () => this.importPrompt();
        window.generateInspirationPreview = () => this.generatePreview();
        window.saveInspirationImageToHistory = () => this.saveToHistory();
        window.toggleInspCategory = (cat) => this.toggleCategory(cat);
        window.toggleInspTag = (idx) => this.toggleTag(idx);
    }

    open() {
        if (!this.modalEl) return;
        
        // 确保分类数据加载完毕
        if (!this.promptHelper || !this.promptHelper.classifiedData) {
            this.onShowToast("标签分类库未准备好，请稍候...", "warning");
            return;
        }

        this.modalEl.style.display = 'flex';
        // 强制回流以启用 Tailwind 过渡
        this.modalEl.offsetHeight;
        this.modalEl.classList.remove('opacity-0', 'pointer-events-none');
        const content = this.modalEl.querySelector('.relative');
        if (content) {
            content.classList.remove('scale-95', 'opacity-0');
        }

        this.renderCategoryToggles();
        if (this.drawnTags.length === 0) {
            this.drawTags();
        } else {
            this.renderTags();
        }
        
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    close() {
        if (!this.modalEl) return;
        this.modalEl.classList.add('opacity-0', 'pointer-events-none');
        const content = this.modalEl.querySelector('.relative');
        if (content) {
            content.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            this.modalEl.style.display = 'none';
        }, 300);
    }

    renderCategoryToggles() {
        if (!this.togglesContainer) return;
        this.togglesContainer.innerHTML = '';

        Object.entries(CATEGORY_STYLES).forEach(([key, value]) => {
            const isChecked = this.selectedCategories.has(key);
            
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `px-3 py-1.5 text-[10px] font-bold border rounded-xl transition-all active:scale-95 flex items-center gap-1 shadow-[0_2px_4px_rgba(0,0,0,0.01)] ${
                isChecked 
                ? `${value.color} ring-1 ring-indigo-500/20` 
                : 'bg-white border-gray-100 text-gray-400 hover:text-gray-600 dark:bg-slate-800/40 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`;
            btn.innerHTML = `
                <i data-lucide="${isChecked ? 'check-circle' : 'circle'}" class="w-3 h-3"></i>
                <span>${value.cn}</span>
            `;
            btn.onclick = () => window.toggleInspCategory(key);
            this.togglesContainer.appendChild(btn);
        });
        
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    toggleCategory(cat) {
        if (this.selectedCategories.has(cat)) {
            // 最少保留一个分类以防空抽词
            if (this.selectedCategories.size > 1) {
                this.selectedCategories.delete(cat);
            } else {
                this.onShowToast("至少保留一个分类进行抽词", "warning");
                return;
            }
        } else {
            this.selectedCategories.add(cat);
        }
        this.renderCategoryToggles();
        this.drawTags();
    }

    drawTags() {
        if (!this.promptHelper || !this.promptHelper.classifiedData) return;
        
        const sourceData = this.promptHelper.classifiedData;
        this.drawnTags = [];

        this.selectedCategories.forEach(cat => {
            const tagsObj = sourceData[cat] || {};
            const tagEntries = Object.entries(tagsObj);
            if (tagEntries.length === 0) return;

            // 每个选中的分类抽取 3-5 个词
            const drawCount = Math.floor(Math.random() * 3) + 3; // 随机 3, 4, 或 5 个
            const shuffled = [...tagEntries].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, Math.min(drawCount, shuffled.length));

            selected.forEach(([en, cn]) => {
                this.drawnTags.push({
                    en,
                    cn,
                    cat,
                    selected: true // 默认抽出来的都为勾选激活状态
                });
            });
        });

        // 随机打乱合并后的词，防止同类别的词挤在一起
        this.drawnTags.sort(() => 0.5 - Math.random());
        this.renderTags();
    }

    renderTags() {
        if (!this.tagListContainer) return;
        this.tagListContainer.innerHTML = '';

        if (this.drawnTags.length === 0) {
            this.tagListContainer.innerHTML = `<div class="text-xs text-gray-400 italic py-8 text-center w-full">未选择任何分类进行抽词</div>`;
            this.updateSelectedCount(0);
            return;
        }

        this.drawnTags.forEach((item, idx) => {
            const style = CATEGORY_STYLES[item.cat];
            
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `px-3.5 py-2.5 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-[0.98] cursor-pointer max-w-[200px] shadow-[0_2px_6px_rgba(0,0,0,0.01)] ${
                item.selected 
                ? `${style.color} border-indigo-400 dark:border-indigo-650 scale-100 ring-1 ring-indigo-500/20`
                : 'bg-gray-50/50 border-gray-100 text-gray-300 dark:bg-slate-800/20 dark:border-slate-800 dark:text-slate-600'
            }`;
            
            // 样式徽章与勾选状态
            const checkIcon = item.selected ? 'check-square' : 'square';
            btn.innerHTML = `
                <div class="flex items-center justify-between gap-3 w-full">
                    <span class="font-mono text-xs font-bold truncate leading-none ${item.selected ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-600'}">${item.en}</span>
                    <i data-lucide="${checkIcon}" class="w-3.5 h-3.5 shrink-0 ${item.selected ? 'text-indigo-500' : 'text-gray-300 dark:text-slate-700'}"></i>
                </div>
                <div class="flex items-center justify-between gap-2 w-full mt-2 select-none pointer-events-none">
                    <span class="text-[10px] leading-tight truncate ${item.selected ? 'text-gray-500 dark:text-slate-400' : 'text-gray-400 dark:text-slate-700'}">${item.cn}</span>
                    <span class="text-[8px] font-bold opacity-60 uppercase shrink-0">${style.cn}</span>
                </div>
            `;
            btn.onclick = () => window.toggleInspTag(idx);
            this.tagListContainer.appendChild(btn);
        });

        const activeCount = this.drawnTags.filter(t => t.selected).length;
        this.updateSelectedCount(activeCount);
        
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    toggleTag(idx) {
        if (this.drawnTags[idx]) {
            this.drawnTags[idx].selected = !this.drawnTags[idx].selected;
            this.renderTags();
        }
    }

    updateSelectedCount(count) {
        if (this.selectedCountEl) {
            this.selectedCountEl.textContent = `已选 ${count} 个`;
        }
    }

    importPrompt() {
        const activeTags = this.drawnTags
            .filter(t => t.selected)
            .map(t => t.en);
            
        if (activeTags.length === 0) {
            this.onShowToast("没有选择任何创意词条", "warning");
            return;
        }

        const mainPrompt = document.getElementById('prompt');
        if (mainPrompt) {
            const currentVal = mainPrompt.value.trim();
            const appendStr = activeTags.join(', ');
            mainPrompt.value = currentVal ? `${currentVal}, ${appendStr}` : appendStr;
            mainPrompt.dispatchEvent(new Event('input', { bubbles: true }));
            this.onShowToast(`已成功导入 ${activeTags.length} 个词条！`, "success");
            this.close();
        }
    }

    async generatePreview() {
        const activeTags = this.drawnTags
            .filter(t => t.selected)
            .map(t => t.en);
            
        if (activeTags.length === 0) {
            this.onShowToast("请至少选择一个提示词进行预览生成", "warning");
            return;
        }

        const modelEl = document.getElementById('modelValue');
        const resEl = document.getElementById('resolution');
        const negativeEl = document.getElementById('negativePrompt');

        if (!modelEl || !resEl || !this.engine) {
            this.onShowToast("无法获取生成核心配置", "error");
            return;
        }

        const selectedVersion = modelEl.value;
        const [w, h] = resEl.value.split(',').map(Number);
        const promptText = activeTags.join(', ');

        // 整合授权身份数据
        const customApiKeyRaw = this.store ? this.store.getSetting('nai_custom_api_key') : '';
        const customApiKeys = (customApiKeyRaw || "").split(/[\n,]/).map(k => k.trim()).filter(k => k);
        const auth = {
            adminToken: this.store ? this.store.getSetting('nai_admin_token') : '',
            userKey: this.store ? this.store.getSetting('nai_user_key') : '',
            userToken: localStorage.getItem('nai_user_token') || "",
            customApiKey: customApiKeys.length > 0 ? customApiKeys[0] : ""
        };

        // UI 切换为 Loading 状态
        if (this.loadingEl) this.loadingEl.classList.remove('hidden');
        if (this.generateBtn) this.generateBtn.disabled = true;

        try {
            // 组装生成所需的配置参数
            const stepsEl = document.getElementById('steps');
            const scaleEl = document.getElementById('scale');
            const samplerEl = document.getElementById('sampler');
            const seed = Math.floor(Math.random() * 4294967295);

            const params = {
                prompt: promptText,
                negative_prompt: negativeEl ? negativeEl.value.trim() : "lowres, bad anatomy",
                width: w,
                height: h,
                steps: stepsEl ? parseInt(stepsEl.value) : 28,
                scale: scaleEl ? parseFloat(scaleEl.value) : 5.0,
                sampler: samplerEl ? samplerEl.value : "k_euler_ancestral",
                seed: seed,
                version: selectedVersion,
                sm: (selectedVersion === 'v4.5') ? false : true,
                sm_dyn: (selectedVersion === 'v4.5') ? false : true
            };

            // 发起沙盒生成请求
            const result = await this.engine.generate(params, auth);

            if (result && result.blob) {
                this.lastGeneratedBlob = result.blob;
                this.lastGeneratedResult = result;
                this.lastGeneratedPrompt = promptText;
                this.lastGeneratedParams = params;

                // 创建一次性预览图 URL
                const objectUrl = URL.createObjectURL(result.blob);
                
                if (this.previewImageEl) {
                    this.previewImageEl.src = objectUrl;
                    this.previewImageEl.classList.remove('hidden');
                }
                if (this.placeholderEl) this.placeholderEl.classList.add('hidden');
                if (this.saveImageBtn) this.saveImageBtn.disabled = false; // 启用手动保存到历史库按钮

                this.onShowToast("沙盒预览生成成功！", "success");
            } else {
                throw new Error("生成返回图片数据空缺");
            }
        } catch (err) {
            console.error("Sandbox Gen Error:", err);
            this.onShowToast(`沙盒生成失败: ${err.message || err}`, "error");
        } finally {
            if (this.loadingEl) this.loadingEl.classList.add('hidden');
            if (this.generateBtn) this.generateBtn.disabled = false;
        }
    }

    async saveToHistory() {
        if (!this.lastGeneratedBlob || !this.lastGeneratedResult) {
            this.onShowToast("未找到可保存的生成图片", "warning");
            return;
        }

        const saveFn = window.saveToHistory;
        if (!saveFn) {
            this.onShowToast("历史归档接口不可用", "error");
            return;
        }

        if (this.saveImageBtn) this.saveImageBtn.disabled = true;

        try {
            // 将 Blob 转为 Base64 DataURL 以便存入历史数据库
            const reader = new FileReader();
            reader.readAsDataURL(this.lastGeneratedBlob);
            reader.onloadend = async () => {
                const base64Data = reader.result;
                
                // 拼接元数据
                const metaData = {
                    negative_prompt: this.lastGeneratedParams.negative_prompt,
                    width: this.lastGeneratedParams.width,
                    height: this.lastGeneratedParams.height,
                    steps: this.lastGeneratedParams.steps,
                    scale: this.lastGeneratedParams.scale,
                    sampler: this.lastGeneratedParams.sampler,
                    seed: this.lastGeneratedParams.seed,
                    sm: this.lastGeneratedParams.sm,
                    sm_dyn: this.lastGeneratedParams.sm_dyn
                };

                await saveFn(
                    base64Data,
                    this.lastGeneratedPrompt,
                    this.lastGeneratedParams.version,
                    this.lastGeneratedResult,
                    false,
                    metaData
                );
                
                this.onShowToast("图片已存入历史图库！可在右侧常规历史中找到它", "success");
            };
        } catch (err) {
            console.error("Save to history fail:", err);
            this.onShowToast(`保存图库失败: ${err.message || err}`, "error");
            if (this.saveImageBtn) this.saveImageBtn.disabled = false;
        }
    }
}

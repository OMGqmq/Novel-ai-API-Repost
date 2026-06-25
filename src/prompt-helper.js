/**
 * Prompt Helper Module
 * Encapsulates prompt tag analysis, weights, autocomplete suggestions, translations, and tag search.
 */

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const CATEGORY_COLORS = {
    clothing: 'bg-green-50 text-green-700 border-green-250 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30',
    action: 'bg-amber-50 text-amber-700 border-amber-250 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
    nsfw: 'bg-rose-50 text-rose-700 border-rose-250 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30',
    style: 'bg-purple-50 text-purple-700 border-purple-250 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30',
    object: 'bg-blue-50 text-blue-700 border-blue-250 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30',
    character: 'bg-indigo-50 text-indigo-700 border-indigo-250 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30',
    lighting: 'bg-yellow-50 text-yellow-700 border-yellow-250 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/30',
    perspective: 'bg-cyan-50 text-cyan-700 border-cyan-250 dark:bg-cyan-950/20 dark:text-cyan-400 dark:border-cyan-900/30',
    composition: 'bg-teal-50 text-teal-700 border-teal-250 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900/30'
};

const CATEGORY_NAMES_CN = {
    clothing: '服装',
    action: '动作',
    nsfw: '限制级',
    style: '画风',
    object: '物品',
    character: 'IP角色',
    lighting: '光影',
    perspective: '视角',
    composition: '构图'
};

export class PromptHelper {
    constructor(config = {}) {
        this.promptEl = config.promptEl;
        this.mainPromptEl = config.promptEl;
        this.containerEl = config.containerEl;
        this.searchInputEl = config.searchInputEl;
        this.searchBtnEl = config.searchBtnEl;
        this.searchResultsEl = config.searchResultsEl;
        this.onShowToast = config.onShowToast || ((msg, type) => {
            if (window.showToast) window.showToast(msg, type);
            else console.log(`[Toast] ${type}: ${msg}`);
        });
        
        this.tagData = config.tagData || {};
        this.tagArray = Object.entries(this.tagData);
        this.isTranslationExpanded = localStorage.getItem('nai_translation_expanded') !== 'false';
        
        this.initUI();
        this.bindEvents();
        this.bindSearchEvents();
        
        if (Object.keys(this.tagData).length === 0) {
            this.loadTagDatabase();
        }
    }

    async loadTagDatabase() {
        const TAGS_URL = 'classified_tags.json';
        const CACHE_NAME = 'nai-tags-cache-v2';
        let data = null;

        try {
            if ('caches' in window) {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(TAGS_URL);
                
                if (cachedResponse) {
                    data = await cachedResponse.json();
                    
                    fetch(TAGS_URL)
                        .then(response => {
                            if (response.ok) {
                                cache.put(TAGS_URL, response.clone());
                                response.json().then(freshData => {
                                    this.updateTagData(freshData);
                                }).catch(() => {});
                            }
                        })
                        .catch(() => {});
                } else {
                    const response = await fetch(TAGS_URL);
                    if (response.ok) {
                        await cache.put(TAGS_URL, response.clone());
                        data = await response.clone().json();
                    } else {
                        data = await response.json();
                    }
                }
            } else {
                const r = await fetch(TAGS_URL);
                data = await r.json();
            }
        } catch (e) {
            console.error("Failed to load tags from cache:", e);
            try {
                const r = await fetch(TAGS_URL);
                data = await r.json();
            } catch (err) {
                console.error("Tags fetch fallback failed:", err);
            }
        }
        
        if (data) {
            this.updateTagData(data);
        }
    }

    updateTagData(newTagData) {
        this.classifiedData = newTagData;
        
        const flatData = {};
        const categoryMap = {};
        const categoryEntries = {};
        
        for (const [category, tagsObj] of Object.entries(newTagData)) {
            if (tagsObj && typeof tagsObj === 'object') {
                categoryEntries[category] = Object.entries(tagsObj);
                for (const [tagEn, tagCn] of Object.entries(tagsObj)) {
                    const lowerTag = tagEn.toLowerCase();
                    flatData[lowerTag] = tagCn;
                    categoryMap[lowerTag] = category;
                }
            }
        }
        
        this.tagData = flatData;
        this.tagArray = Object.entries(flatData);
        this.tagCategoryMap = categoryMap;
        this.categoryEntries = categoryEntries;
        
        // 绑定全局实例，便于外部直接调用搜词联动
        window.promptHelperInstance = this;
        
        this.updateTranslations();
        
        // 分类筛选和首屏九宫格渲染调用
        this.initSearchCategoriesUI();
    }


    initUI() {
        if (!this.containerEl) return;

        this.containerEl.innerHTML = '';
        this.containerEl.className = 'mt-2 space-y-2';

        this.suggestPanel = document.createElement('div');
        this.suggestPanel.id = 'tagSuggestPanel';
        this.suggestPanel.className = 'hidden bg-gray-50/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl p-3 border border-gray-200/50 dark:border-slate-700/50 shadow-sm';
        this.suggestPanel.innerHTML = `
            <div class="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1 mb-2 flex items-center justify-between select-none">
                <span>联想推荐 (Suggestions)</span>
                <span class="text-[9px] lowercase font-normal">点击填入</span>
            </div>
            <div id="tagSuggestList" class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scroll p-0.5"></div>
        `;

        this.translatePanel = document.createElement('div');
        this.translatePanel.id = 'tagTranslatePanel';
        this.translatePanel.className = 'bg-gray-50/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-sm overflow-hidden';
        this.translatePanel.innerHTML = `
            <button id="tagTranslateToggle" type="button" class="w-full px-3 py-2 flex items-center justify-between text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest hover:bg-gray-100/50 dark:hover:bg-slate-700/30 transition-colors select-none">
                <span class="flex items-center gap-1.5">
                    <i data-lucide="languages" class="w-3.5 h-3.5 text-gray-400 dark:text-slate-500"></i>
                    实时翻译 (Translation) <span id="translateCount" class="ml-1 text-[9px] bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 px-1.5 py-0.2 rounded-full">0</span>
                </span>
                <i data-lucide="chevron-down" id="translateToggleIcon" class="w-3.5 h-3.5 transition-transform duration-200 text-gray-400 ${this.isTranslationExpanded ? 'rotate-180' : ''}"></i>
            </button>
            <div id="tagTranslateContent" class="${this.isTranslationExpanded ? '' : 'hidden'} p-3 border-t border-gray-100 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/20">
                <div id="tagTranslateList" class="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scroll">
                    <div class="text-xs text-gray-400 dark:text-slate-500 italic select-none">输入提示词以查看实时翻译...</div>
                </div>
            </div>
        `;

        this.containerEl.appendChild(this.suggestPanel);
        this.containerEl.appendChild(this.translatePanel);

        this.suggestListEl = this.suggestPanel.querySelector('#tagSuggestList');
        this.translateContentEl = this.translatePanel.querySelector('#tagTranslateContent');
        this.translateListEl = this.translatePanel.querySelector('#tagTranslateList');
        this.translateCountEl = this.translatePanel.querySelector('#translateCount');
        this.translateToggleIcon = this.translatePanel.querySelector('#translateToggleIcon');
        
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    calculateWeight(rawTag) {
        let t = rawTag.trim();

        // 1. v4.5 weight style: xx::tag:: or xx::tag
        const vibeMatch = t.match(/^(-?[0-9.]+)\s*::/);
        if (vibeMatch) {
            return parseFloat(vibeMatch[1]);
        }

        // 2. Standard NovelAI brackets multiplication rules
        let weight = 1.0;
        let modified = true;
        while (modified) {
            modified = false;
            t = t.trim();
            if (t.startsWith('(') && t.endsWith(')')) {
                weight *= 1.1;
                t = t.slice(1, -1);
                modified = true;
            } else if (t.startsWith('{') && t.endsWith('}')) {
                weight *= 1.05;
                t = t.slice(1, -1);
                modified = true;
            } else if (t.startsWith('[') && t.endsWith(']')) {
                weight /= 1.05;
                t = t.slice(1, -1);
                modified = true;
            }
        }
        return weight;
    }

    cleanTag(tag) {
        let t = tag.trim();
        // 1. Remove v4.5 prefix/suffix
        t = t.replace(/^-?[0-9.]+\s*::\s*/, '');
        t = t.replace(/\s*::\s*$/, '');
        
        // 2. Remove standard brackets
        t = t.replace(/^[\(\{\[\s]+/, '');
        t = t.replace(/[\)\}\]\s]+$/, '');
        return t.trim();
    }

    expandPromptTags(str) {
        str = str.trim();
        if (!str) return [];

        const splitOuterCommas = (s) => {
            const parts = [];
            let current = "";
            let depth = 0;
            for (let i = 0; i < s.length; i++) {
                const char = s[i];
                if (char === '(' || char === '{' || char === '[') {
                    depth++;
                } else if (char === ')' || char === '}' || char === ']') {
                    depth = Math.max(0, depth - 1);
                }
                
                if (char === ',' && depth === 0) {
                    parts.push(current.trim());
                    current = "";
                } else {
                    current += char;
                }
            }
            if (current.trim()) {
                parts.push(current.trim());
            }
            return parts;
        };

        const isOuterWrapped = (s) => {
            if (s.length < 3) return false;
            const first = s[0];
            const last = s[s.length - 1];
            
            let matchChar = '';
            if (first === '(' && last === ')') matchChar = ')';
            else if (first === '{' && last === '}') matchChar = '}';
            else if (first === '[' && last === ']') matchChar = ']';
            
            if (!matchChar) return false;
            
            let depth = 0;
            for (let i = 0; i < s.length; i++) {
                const char = s[i];
                if (char === '(' || char === '{' || char === '[') {
                    depth++;
                } else if (char === ')' || char === '}' || char === ']') {
                    depth--;
                    if (depth === 0 && i < s.length - 1) {
                        return false;
                    }
                }
            }
            
            const inner = s.substring(1, s.length - 1);
            return inner.includes(',');
        };

        const isVibeWrapped = (s) => {
            const matchStart = s.match(/^(-?[0-9.]+)\s*::/);
            if (!matchStart) return false;
            if (!s.endsWith('::')) return false;

            const startLen = matchStart[0].length;
            const inner = s.substring(startLen, s.length - 2);
            if (!inner.includes(',')) return false;

            let depth = 0;
            let vibeDepth = 1;

            for (let i = startLen; i < s.length - 2; i++) {
                const char = s[i];
                if (char === '(' || char === '{' || char === '[') {
                    depth++;
                } else if (char === ')' || char === '}' || char === ']') {
                    depth = Math.max(0, depth - 1);
                }

                if (depth === 0) {
                    const sub = s.substring(i);
                    const subVibeStart = sub.match(/^(-?[0-9.]+)\s*::/);
                    if (subVibeStart) {
                        vibeDepth++;
                        i += subVibeStart[0].length - 1;
                    } else if (sub.startsWith('::')) {
                        vibeDepth--;
                        i += 1;
                        if (vibeDepth === 0) {
                            return false;
                        }
                    }
                }
            }
            return vibeDepth === 1;
        };

        if (isOuterWrapped(str)) {
            const first = str[0];
            const last = str[str.length - 1];
            const inner = str.substring(1, str.length - 1);
            
            const innerTags = this.expandPromptTags(inner);
            return innerTags.map(tag => first + tag + last);
        }

        if (isVibeWrapped(str)) {
            const matchStart = str.match(/^(-?[0-9.]+)\s*::/);
            const prefix = matchStart[0];
            const inner = str.substring(prefix.length, str.length - 2);

            const innerTags = this.expandPromptTags(inner);
            return innerTags.map(tag => prefix + tag + '::');
        }

        const outerParts = splitOuterCommas(str);
        if (outerParts.length > 1) {
            let result = [];
            for (const part of outerParts) {
                result = result.concat(this.expandPromptTags(part));
            }
            return result;
        }

        return [str];
    }

    getActiveTagInfo() {
        const textarea = this.promptEl;
        if (!textarea) return { query: '', rawQuery: '', start: 0, end: 0 };
        const text = textarea.value;
        const pos = textarea.selectionStart;
        
        const lastComma = text.lastIndexOf(',', pos - 1);
        const nextComma = text.indexOf(',', pos);
        
        const start = lastComma === -1 ? 0 : lastComma + 1;
        const end = nextComma === -1 ? text.length : nextComma;
        
        const rawQuery = text.substring(start, end);
        const query = this.cleanTag(rawQuery).trim();
        return {
            query,
            rawQuery,
            start,
            end
        };
    }

    bindEvents() {
        if (!this.promptEl) return;
        const toggleBtn = this.translatePanel?.querySelector('#tagTranslateToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.isTranslationExpanded = !this.isTranslationExpanded;
                localStorage.setItem('nai_translation_expanded', this.isTranslationExpanded.toString());
                
                if (this.isTranslationExpanded) {
                    this.translateContentEl.classList.remove('hidden');
                    this.translateToggleIcon.classList.add('rotate-180');
                } else {
                    this.translateContentEl.classList.add('hidden');
                    this.translateToggleIcon.classList.remove('rotate-180');
                }
            });
        }

        const debouncedUpdateSuggestions = debounce(() => this.updateSuggestions(), 150);
        const debouncedUpdateTranslations = debounce(() => this.updateTranslations(), 250);

        const handleInput = () => {
            if (this.suggestPanel && this.containerEl && this.suggestPanel.parentNode !== this.containerEl) {
                this.containerEl.insertBefore(this.suggestPanel, this.translatePanel);
            }
            this.promptEl = this.mainPromptEl;
            debouncedUpdateSuggestions();
            debouncedUpdateTranslations();
        };

        this.promptEl.addEventListener('input', handleInput);
        this.promptEl.addEventListener('keyup', handleInput);
        this.promptEl.addEventListener('click', handleInput);
        this.promptEl.addEventListener('focus', handleInput);

        this.promptEl.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.suggestPanel && this.promptEl === this.mainPromptEl) {
                    this.suggestPanel.classList.add('hidden');
                }
            }, 250);
        });
    }

    bindSearchEvents() {
        if (!this.searchInputEl || !this.searchBtnEl) return;

        this.searchBtnEl.onclick = () => {
            const q = this.searchInputEl.value.toLowerCase().trim();
            
            // 如果没有搜索关键词且选择了“全部”，恢复渲染九宫格
            if (!q && this.selectedSearchCategory === 'all') {
                this.renderCategoryGrid();
                return;
            }
            
            let res = [];
            if (this.selectedSearchCategory && this.selectedSearchCategory !== 'all') {
                const entries = this.categoryEntries[this.selectedSearchCategory] || [];
                if (!q) {
                    // 没有搜索关键词时，采用不克隆、不排序的 O(N) 高性能随机无卡顿抽样，抽取前 100 个词
                    const sampleSize = 100;
                    const len = entries.length;
                    if (len <= sampleSize) {
                        res = entries;
                    } else {
                        const selectedIndices = new Set();
                        while (selectedIndices.size < sampleSize) {
                            selectedIndices.add(Math.floor(Math.random() * len));
                        }
                        res = Array.from(selectedIndices).map(idx => entries[idx]);
                    }
                } else {
                    res = entries;
                }
            } else {
                res = this.tagArray;
            }

            // 过滤匹配
            if (q) {
                res = res.filter(([e, c]) => e.includes(q) || c.includes(q));
            }
            
            // 限制前100个结果
            const topRes = res.slice(0, 100);

            if (this.searchResultsEl) {
                this.searchResultsEl.innerHTML = '';
                if (topRes.length === 0) {
                    this.searchResultsEl.innerHTML = `
                        <div class="text-center mt-20 text-xs text-gray-400 font-light tracking-wide flex flex-col items-center justify-center gap-2">
                            <i data-lucide="search-code" class="w-6 h-6 opacity-40"></i>
                            <span>未找到匹配的提示词</span>
                        </div>
                    `;
                    if (window.safeCreateIcons) window.safeCreateIcons();
                    return;
                }
                
                topRes.forEach(([en, cn]) => {
                    const d = document.createElement('div');
                    d.className = "p-3 hover:bg-gray-50 dark:hover:bg-slate-800/40 border-b border-gray-100 dark:border-gray-800/60 cursor-pointer transition-all flex items-center justify-between group";
                    
                    const cat = this.tagCategoryMap[en.toLowerCase()] || 'object';
                    const col = CATEGORY_COLORS[cat] || 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
                    const cnName = CATEGORY_NAMES_CN[cat] || '物品';
                    const badgeHtml = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors ${col}">${cnName}</span>`;

                    d.innerHTML = `
                        <div class="flex-1 min-w-0 pr-2">
                            <div class="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono truncate group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">${en}</div>
                            <div class="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">${cn}</div>
                        </div>
                        <div class="shrink-0 flex items-center gap-1.5">
                            ${badgeHtml}
                        </div>
                    `;
                    
                    d.onclick = () => {
                        this.promptEl.value += (this.promptEl.value ? ', ' : '') + en;
                        this.promptEl.dispatchEvent(new Event('input', { bubbles: true }));
                        this.onShowToast(`已添加标签: ${en}`, 'success');
                    };
                    this.searchResultsEl.appendChild(d);
                });
            }
        };

        this.searchInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.searchBtnEl.click();
            }
        });

        let tagSearchTimeout = null;
        this.searchInputEl.addEventListener('input', () => {
            clearTimeout(tagSearchTimeout);
            tagSearchTimeout = setTimeout(() => {
                this.searchBtnEl.click();
            }, 300);
        });
    }

    initSearchCategoriesUI() {
        if (!this.searchInputEl) return;
        
        let tabsEl = document.getElementById('tagSearchCategoryTabs');
        if (!tabsEl) {
            tabsEl = document.createElement('div');
            tabsEl.id = 'tagSearchCategoryTabs';
            tabsEl.className = 'px-4 pb-2 flex gap-1.5 overflow-x-auto custom-scroll-x shrink-0 select-none';
            const searchContainer = this.searchInputEl.parentNode.parentNode;
            if (searchContainer) {
                searchContainer.appendChild(tabsEl);
            }
        }
        
        this.selectedSearchCategory = 'all';
        this.renderCategoryTabs(tabsEl);
        this.renderCategoryGrid();
    }

    renderCategoryTabs(tabsEl) {
        if (!tabsEl) return;
        tabsEl.innerHTML = '';
        
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = `px-3 py-1 text-[10px] font-bold rounded-lg border transition-all shrink-0 ${
            this.selectedSearchCategory === 'all' 
            ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-gray-900 shadow-sm' 
            : 'bg-gray-50 border-gray-100 text-gray-500 hover:text-gray-900 dark:bg-slate-800 dark:border-slate-700/50 dark:text-slate-400 dark:hover:text-white'
        }`;
        allBtn.textContent = '全部';
        allBtn.onclick = () => this.setSearchCategory('all');
        tabsEl.appendChild(allBtn);
        
        Object.entries(CATEGORY_NAMES_CN).forEach(([key, cnName]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            
            let btnClass = 'px-3 py-1 text-[10px] font-semibold rounded-lg border transition-all shrink-0 ';
            if (this.selectedSearchCategory === key) {
                const col = CATEGORY_COLORS[key];
                btnClass += `${col} border-transparent shadow-sm ring-1 ring-offset-1 ring-gray-205 dark:ring-slate-800`;
            } else {
                btnClass += 'bg-gray-50 border-gray-100 text-gray-450 hover:text-gray-700 dark:bg-slate-800/40 dark:border-slate-700/30 dark:text-slate-400 dark:hover:text-slate-300';
            }
            
            btn.className = btnClass;
            btn.textContent = cnName;
            btn.onclick = () => this.setSearchCategory(key);
            tabsEl.appendChild(btn);
        });
    }

    setSearchCategory(cat) {
        this.selectedSearchCategory = cat;
        const tabsEl = document.getElementById('tagSearchCategoryTabs');
        if (tabsEl) {
            this.renderCategoryTabs(tabsEl);
        }
        if (this.searchBtnEl) {
            this.searchBtnEl.click();
        }
    }

    renderCategoryGrid() {
        if (!this.searchResultsEl) return;
        this.searchResultsEl.innerHTML = `
            <div class="px-3 py-2 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest select-none">按大类浏览常用词</div>
            <div class="grid grid-cols-2 gap-2 p-2">
                ${Object.entries(CATEGORY_NAMES_CN).map(([key, name]) => {
                    const color = CATEGORY_COLORS[key];
                    const tagCount = Object.keys(this.classifiedData[key] || {}).length;
                    return `
                        <button type="button" onclick="window.selectSearchCategoryTab('${key}')"
                            class="p-3.5 rounded-xl border text-left transition-all active:scale-95 hover:shadow-sm ${color} border-transparent flex flex-col justify-between h-20 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                            <div class="font-bold text-xs flex justify-between items-center w-full">
                                <span>${name}</span>
                                <span class="text-[9px] opacity-70 font-mono font-normal bg-white/50 dark:bg-slate-900/30 px-1.5 py-0.2 rounded-full">${tagCount}词</span>
                            </div>
                            <div class="text-[9px] opacity-60 mt-1 select-none pointer-events-none truncate">点击展开探索列表</div>
                        </button>
                    `;
                }).join('')}
            </div>
        `;
        
        window.selectSearchCategoryTab = (cat) => {
            this.setSearchCategory(cat);
        };
    }


    registerInput(inputEl, placeholderEl) {
        if (!inputEl || !placeholderEl) return;

        const debouncedUpdateSuggestions = debounce(() => this.updateSuggestions(), 150);
        const debouncedUpdateTranslations = debounce(() => this.updateTranslations(), 250);

        const handleInput = () => {
            if (this.suggestPanel && this.suggestPanel.parentNode !== placeholderEl) {
                placeholderEl.appendChild(this.suggestPanel);
            }
            this.promptEl = inputEl;
            debouncedUpdateSuggestions();
            debouncedUpdateTranslations();
        };

        inputEl.addEventListener('input', handleInput);
        inputEl.addEventListener('keyup', handleInput);
        inputEl.addEventListener('click', handleInput);
        inputEl.addEventListener('focus', handleInput);

        inputEl.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.suggestPanel && this.promptEl === inputEl) {
                    this.suggestPanel.classList.add('hidden');
                }
            }, 250);
        });
    }

    updateSuggestions() {
        const info = this.getActiveTagInfo();
        const query = info.query.toLowerCase().trim();

        if (!query) {
            if (this.suggestPanel) this.suggestPanel.classList.add('hidden');
            return;
        }

        const matches = [];
        const len = this.tagArray.length;
        for (let i = 0; i < len; i++) {
            const [en, cn] = this.tagArray[i];
            if (en.toLowerCase().includes(query) || cn.includes(query)) {
                matches.push({ en, cn });
            }
        }

        if (matches.length === 0) {
            if (this.suggestPanel) this.suggestPanel.classList.add('hidden');
            return;
        }

        matches.sort((a, b) => {
            const aEnLower = a.en.toLowerCase();
            const bEnLower = b.en.toLowerCase();
            const aStartEn = aEnLower.startsWith(query);
            const bStartEn = bEnLower.startsWith(query);
            if (aStartEn && !bStartEn) return -1;
            if (!aStartEn && bStartEn) return 1;
            
            const aStartCn = a.cn.startsWith(query);
            const bStartCn = b.cn.startsWith(query);
            if (aStartCn && !bStartCn) return -1;
            if (!aStartCn && bStartCn) return 1;

            return a.en.length - b.en.length;
        });

        const topMatches = matches.slice(0, 15);
        
        if (this.suggestListEl) {
            this.suggestListEl.innerHTML = '';
            topMatches.forEach(({ en, cn }) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'px-3 py-1.5 text-xs bg-white dark:bg-slate-700/60 hover:bg-indigo-50/50 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-650 hover:border-indigo-200 dark:hover:border-indigo-500/50 rounded-lg text-gray-700 dark:text-gray-200 flex items-center gap-1.5 transition-all shadow-sm active:scale-95 text-left min-w-[120px] max-w-[240px] truncate';
                
                const cat = this.tagCategoryMap[en.toLowerCase()] || 'object';
                const col = CATEGORY_COLORS[cat] || 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
                const cnName = CATEGORY_NAMES_CN[cat] || '物品';
                const badgeHtml = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-bold border ${col} scale-90 origin-right shrink-0">${cnName}</span>`;

                btn.innerHTML = `
                    <div class="flex items-center justify-between w-full gap-2 overflow-hidden">
                        <span class="font-mono font-medium text-gray-900 dark:text-white truncate">${en}</span>
                        <div class="flex items-center gap-1 shrink-0">
                            <span class="text-[10px] text-gray-400 dark:text-slate-400 border-l border-gray-100 dark:border-slate-600/85 pl-1.5 truncate max-w-[70px]">${cn}</span>
                            ${badgeHtml}
                        </div>
                    </div>
                `;
                
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectSuggestion(en);
                });
                
                this.suggestListEl.appendChild(btn);
            });
        }

        if (this.suggestPanel) this.suggestPanel.classList.remove('hidden');
    }

    selectSuggestion(suggestionEn) {
        const textarea = this.promptEl;
        const text = textarea.value;
        const info = this.getActiveTagInfo();
        
        const raw = info.rawQuery;
        const queryIndex = raw.toLowerCase().indexOf(info.query.toLowerCase());
        let prefix = '';
        let suffix = '';
        if (queryIndex !== -1) {
            prefix = raw.substring(0, queryIndex);
            suffix = raw.substring(queryIndex + info.query.length);
        }
        
        let replacement = prefix + suggestionEn + suffix;
        if (/^-?[0-9.]+\s*::/.test(prefix) && !replacement.endsWith('::')) {
            replacement += '::';
        }
        const newText = text.substring(0, info.start) + replacement + text.substring(info.end);
        const newCursorPos = info.start + replacement.length;

        // Directly mutate value
        textarea.value = newText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        
        if (this.suggestPanel) this.suggestPanel.classList.add('hidden');
        this.updateTranslations();
    }

    updateTranslations() {
        if (!this.promptEl || !this.translateListEl || !this.translateCountEl) return;
        const text = this.promptEl.value;
        if (!text.trim()) {
            this.translateListEl.innerHTML = '<div class="text-xs text-gray-400 dark:text-slate-500 italic select-none">输入提示词以查看实时翻译...</div>';
            this.translateCountEl.textContent = '0';
            return;
        }

        const rawTags = this.expandPromptTags(text);
        const translatedItems = [];
        
        rawTags.forEach(rawTag => {
            const cleaned = this.cleanTag(rawTag);
            if (!cleaned) return;
            
            const lowerCleaned = cleaned.toLowerCase();
            const matchedCn = this.tagData[lowerCleaned];
            
            if (matchedCn) {
                translatedItems.push({
                    raw: rawTag.trim(),
                    clean: cleaned,
                    cn: matchedCn
                });
            }
        });

        this.translateCountEl.textContent = translatedItems.length.toString();

        if (translatedItems.length === 0) {
            this.translateListEl.innerHTML = '<div class="text-xs text-gray-400 dark:text-slate-500 italic select-none">未找到匹配的词汇翻译。</div>';
            return;
        }

        this.translateListEl.innerHTML = '';
        translatedItems.forEach(item => {
            const badge = document.createElement('div');
            
            const weight = this.calculateWeight(item.raw);
            let weightBadgeHtml = '';
            let badgeClass = 'px-2.5 py-1 text-xs bg-white dark:bg-slate-800/40 border border-gray-100 dark:border-slate-700/60 rounded-lg text-gray-700 dark:text-gray-300 flex items-center gap-1.5 shadow-sm select-none';
            
            if (weight < 0) {
                badgeClass = 'px-2.5 py-1 text-xs bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/40 rounded-lg text-red-800 dark:text-red-300 flex items-center gap-1.5 shadow-sm select-none';
                weightBadgeHtml = `<span class="text-[9px] bg-red-100 dark:bg-red-950/50 px-1.5 py-0.2 rounded font-bold font-mono">${weight.toFixed(2)}</span>`;
            } else if (weight > 1.01) {
                badgeClass = 'px-2.5 py-1 text-xs bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-lg text-amber-800 dark:text-amber-300 flex items-center gap-1.5 shadow-sm select-none';
                weightBadgeHtml = `<span class="text-[9px] bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.2 rounded font-bold font-mono">x${weight.toFixed(2)}</span>`;
            } else if (weight < 0.99) {
                badgeClass = 'px-2.5 py-1 text-xs bg-blue-50/50 dark:bg-slate-800/60 border border-blue-200/50 dark:border-slate-700/60 rounded-lg text-blue-800 dark:text-slate-400 flex items-center gap-1.5 shadow-sm select-none';
                weightBadgeHtml = `<span class="text-[9px] bg-blue-100 dark:bg-blue-950/50 px-1.5 py-0.2 rounded font-bold font-mono">x${weight.toFixed(2)}</span>`;
            }

            badge.className = badgeClass;
            badge.innerHTML = `
                <span class="font-mono text-gray-500 dark:text-gray-400">${item.clean}</span>
                <span class="text-gray-400 dark:text-slate-600">➔</span>
                <span class="font-medium">${item.cn}</span>
                ${weightBadgeHtml}
            `;
            this.translateListEl.appendChild(badge);
        });
    }
}

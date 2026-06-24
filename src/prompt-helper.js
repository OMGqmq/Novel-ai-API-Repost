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
        
        this.tagData = {};
        this.tagArray = [];
        this.isTranslationExpanded = localStorage.getItem('nai_translation_expanded') !== 'false';
        
        this.initUI();
        this.loadTagDatabase();
    }

    async loadTagDatabase() {
        const TAGS_URL = 'all_tags.txt';
        const CACHE_NAME = 'nai-tags-cache-v1';
        let data = null;

        try {
            if ('caches' in window) {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(TAGS_URL);
                
                if (cachedResponse) {
                    // Cache hit: immediately return data
                    data = await cachedResponse.json();
                    
                    // Background refetch and cache update
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
                    // Cache miss: fetch and write to cache
                    const response = await fetch(TAGS_URL);
                    if (response.ok) {
                        await cache.put(TAGS_URL, response.clone());
                        data = await response.clone().json();
                    } else {
                        data = await response.json();
                    }
                }
            } else {
                // Fallback for browsers without Caches API
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
        this.tagData = newTagData;
        this.tagArray = Object.entries(newTagData);
        
        // Once tags are loaded, bind events
        this.bindEvents();
        this.bindSearchEvents();
        this.updateTranslations();
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
            if (!q) {
                if (this.searchResultsEl) this.searchResultsEl.innerHTML = '';
                return;
            }
            
            // Limit to top 100 results to prevent massive DOM rendering lag
            const res = this.tagArray
                .filter(([e, c]) => e.includes(q) || c.includes(q))
                .slice(0, 100);

            if (this.searchResultsEl) {
                this.searchResultsEl.innerHTML = '';
                res.forEach(([en, cn]) => {
                    const d = document.createElement('div');
                    d.className = "p-3 hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors";
                    d.innerHTML = `<div class="text-sm font-medium text-gray-800 dark:text-gray-200">${en}</div><div class="text-xs text-gray-400 dark:text-gray-500">${cn}</div>`;
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
                btn.className = 'px-3 py-1.5 text-xs bg-white dark:bg-slate-700/60 hover:bg-yellow-50 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-600 hover:border-yellow-200 dark:hover:border-yellow-500/50 rounded-lg text-gray-700 dark:text-gray-200 flex items-center gap-1.5 transition-all shadow-sm active:scale-95 text-left';
                btn.innerHTML = `
                    <span class="font-mono font-medium text-gray-900 dark:text-white">${en}</span>
                    <span class="text-[10px] text-gray-400 dark:text-slate-400 border-l border-gray-100 dark:border-slate-600/80 pl-1.5">${cn}</span>
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

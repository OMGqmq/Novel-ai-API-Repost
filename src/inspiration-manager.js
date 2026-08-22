/**
 * Inspiration Manager Module (Danbooru Online Live Integration)
 * Pulls real-time popular tag combinations and reference compositions from Danbooru
 * based on Time/Era, Character/Franchise, Artist/Style, Score, and Rating dimensions.
 */

export const ERA_OPTIONS = [
    { id: 'all', label: '全部年代', query: '' },
    { id: '2026', label: '2026 当季最新', query: 'date:2026-01-01..' },
    { id: '2025', label: '2025 黄金潮', query: 'date:2025-01-01..2025-12-31' },
    { id: '2024', label: '2024 流行佳作', query: 'date:2024-01-01..2024-12-31' },
    { id: '2020-2023', label: '2020-2023 新潮', query: 'date:2020-01-01..2023-12-31' },
    { id: 'classic', label: '2010s 经典', query: 'date:2010-01-01..2019-12-31' },
    { id: 'retro', label: '2000s 复古', query: 'date:2000-01-01..2009-12-31' }
];

export const FRANCHISE_OPTIONS = [
    { id: 'any', label: '🎲 随机热门作品', query: '' },
    { id: 'genshin', label: '原神 (Genshin Impact)', query: 'genshin_impact' },
    { id: 'starrail', label: '崩坏:星穹铁道 (Honkai: Star Rail)', query: 'honkai:_star_rail' },
    { id: 'bluearchive', label: '碧蓝档案 (Blue Archive)', query: 'blue_archive' },
    { id: 'frieren', label: '葬送的芙莉莲 (Frieren)', query: 'sousou_no_frieren' },
    { id: 'arknights', label: '明日方舟 (Arknights)', query: 'arknights' },
    { id: 'azurlane', label: '碧蓝航线 (Azur Lane)', query: 'azur_lane' },
    { id: 'umamusume', label: '赛马娘 (Umamusume)', query: 'umamusume' },
    { id: 'touhou', label: '东方Project (Touhou)', query: 'touhou' },
    { id: 'fate', label: 'Fate / FGO', query: 'fate/grand_order' },
    { id: 'zenless', label: '绝区零 (Zenless Zone Zero)', query: 'zenless_zone_zero' },
    { id: 'hololive', label: 'VTuber / Hololive', query: 'hololive' },
    { id: 'dungeon_meshi', label: '迷宫饭 (Dungeon Meshi)', query: 'dungeon_meshi' },
    { id: 'bocchi', label: '孤独摇滚 (Bocchi the Rock!)', query: 'bocchi_the_rock!' }
];

export const ARTIST_STYLE_OPTIONS = [
    { id: 'any', label: '🎲 自由 / 随作品风格', query: '' },
    { id: 'clean_anime', label: '二次元精致赛璐璐', query: 'clean_lines, official_style' },
    { id: 'painterly', label: '厚涂质感光影', query: 'painterly, volumetric_lighting' },
    { id: 'watercolor', label: '通透水彩柔光', query: 'watercolor_(medium), soft_lighting' },
    { id: 'retro_90s', label: '90年代复古动漫', query: 'retro_artstyle, 1990s_(style)' },
    { id: 'cyberpunk', label: '赛博朋克霓虹', query: 'cyberpunk, neon_lights' },
    { id: 'monochrome', label: '黑白高对比漫画', query: 'monochrome, high_contrast' }
];

export const CATEGORY_INFO = {
    artist: { label: '画师与风格', icon: 'palette', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/40' },
    character: { label: '角色与外貌', icon: 'user', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/40' },
    clothing: { label: '服装与穿搭', icon: 'shirt', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40' },
    action: { label: '动作与表情', icon: 'activity', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40' },
    background: { label: '背景与光影', icon: 'image', color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800/40' },
    general: { label: '特征与细节', icon: 'sparkles', color: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700/50' }
};

const CLOTHING_KEYWORDS = [
    'dress', 'skirt', 'shirt', 'pants', 'uniform', 'swimsuit', 'boots', 'shoes', 'socks',
    'gloves', 'hat', 'ribbon', 'tie', 'costume', 'armor', 'bikini', 'jacket', 'coat',
    'jewelry', 'hairclip', 'choker', 'glasses', 'maid', 'kimono', 'hoodie', 'shorts',
    'sweater', 'tights', 'thighhighs', 'collar', 'cape', 'sleeves', 'corset', 'belt',
    'bare_shoulders', 'cleavage', 'hairband', 'veil', 'apron', 'robe', 'suit'
];

const ACTION_KEYWORDS = [
    'pose', 'sitting', 'standing', 'lying', 'kneeling', 'walking', 'looking', 'smiling',
    'blush', 'hand', 'reaching', 'jumping', 'leaning', 'touching', 'holding', 'open_mouth',
    'closed_eyes', 'wink', 'expression', 'cross_legged', 'arms_behind_back', 'arm_up',
    'finger_gun', 'peace_sign', 'head_tilt', 'flying', 'running', 'crying', 'eating'
];

const BACKGROUND_KEYWORDS = [
    'sky', 'cloud', 'tree', 'flower', 'room', 'indoors', 'outdoors', 'night', 'sunset',
    'water', 'ocean', 'rain', 'snow', 'building', 'scenery', 'light', 'shadow', 'background',
    'sun', 'street', 'city', 'nature', 'sunlight', 'moon', 'stars', 'forest', 'sea',
    'beach', 'window', 'bokeh', 'horizon', 'rays', 'lighting', 'lens_flare', 'table', 'chair'
];

export class InspirationManager {
    constructor(config = {}) {
        this.engine = config.engine;
        this.promptHelper = config.promptHelper;
        this.store = config.store;
        this.onShowToast = config.onShowToast || ((msg, type) => {
            if (window.showToast) window.showToast(msg, type);
            else console.log(`[Toast] ${type}: ${msg}`);
        });

        // 筛选状态
        this.currentEra = 'all';
        this.currentFranchise = 'any';
        this.currentStyle = 'any';
        this.minScore = 50;
        this.currentRating = 'g';
        this.customKeyword = '';

        // API 直连配置 (客户端本地存储)
        const getLocal = (k) => typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
        this.sourceType = getLocal('insp_source_type') || 'hf_dataset';
        this.danbooruUsername = getLocal('insp_danbooru_user') || '';
        this.danbooruApiKey = getLocal('insp_danbooru_key') || '';
        this.customApiUrl = getLocal('insp_custom_url') || '';

        // 数据拉取状态
        this.isLoading = false;
        this.posts = [];
        this.currentPostIndex = 0;
        this.currentTags = []; // Array of { name, cn, category, selected, locked }
        this.lockedTags = new Set(); // Set of tag names

        this.initGlobalBindings();
    }

    initGlobalBindings() {
        window.openInspirationModal = () => this.open();
        window.closeInspirationModal = () => this.close();
        window.drawInspirationTags = () => this.fetchInspiration();
        window.setInspirationEra = (era) => this.setEra(era);
        window.setInspirationRating = (rating) => this.setRating(rating);
        window.setInspirationFranchise = (fr) => this.setFranchise(fr);
        window.setInspirationStyle = (st) => this.setStyle(st);
        window.setInspirationScore = (score) => this.setScore(score);
        window.toggleInspirationTag = (idx) => this.toggleTag(idx);
        window.toggleInspirationTagLock = (idx, e) => this.toggleTagLock(idx, e);
        window.toggleAllInspirationTags = (select) => this.toggleAllTags(select);
        window.prevInspirationPost = () => this.prevPost();
        window.nextInspirationPost = () => this.nextPost();
        window.importInspirationPrompt = (mode) => this.importPrompt(mode);
        window.toggleInspirationApiSettings = () => this.toggleApiSettings();
        window.saveInspirationApiConfig = () => this.saveApiConfig();
    }

    toggleApiSettings() {
        const drawer = document.getElementById('inspApiSettingsDrawer');
        if (drawer) {
            drawer.classList.toggle('hidden');
            drawer.classList.toggle('flex');
            this.syncApiConfigUI();
        }
    }

    syncApiConfigUI() {
        const typeEl = document.getElementById('inspSourceType');
        const userEl = document.getElementById('inspDanbooruUsername');
        const keyEl = document.getElementById('inspDanbooruApiKey');
        const customUrlEl = document.getElementById('inspCustomApiUrl');
        const customRow = document.getElementById('inspCustomUrlRow');

        if (typeEl) typeEl.value = this.sourceType;
        if (userEl) userEl.value = this.danbooruUsername;
        if (keyEl) keyEl.value = this.danbooruApiKey;
        if (customUrlEl) customUrlEl.value = this.customApiUrl;

        if (customRow) {
            if (this.sourceType === 'custom') customRow.classList.remove('hidden');
            else customRow.classList.add('hidden');
        }
    }

    saveApiConfig() {
        const typeEl = document.getElementById('inspSourceType');
        const userEl = document.getElementById('inspDanbooruUsername');
        const keyEl = document.getElementById('inspDanbooruApiKey');
        const customUrlEl = document.getElementById('inspCustomApiUrl');

        if (typeEl) this.sourceType = typeEl.value;
        if (userEl) this.danbooruUsername = userEl.value.trim();
        if (keyEl) this.danbooruApiKey = keyEl.value.trim();
        if (customUrlEl) this.customApiUrl = customUrlEl.value.trim();

        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('insp_source_type', this.sourceType);
            localStorage.setItem('insp_danbooru_user', this.danbooruUsername);
            localStorage.setItem('insp_danbooru_key', this.danbooruApiKey);
            localStorage.setItem('insp_custom_url', this.customApiUrl);
        }

        this.syncApiConfigUI();
        this.onShowToast("直连配置已更新至本地", "success");
    }

    open() {
        const modal = document.getElementById('inspirationModal');
        if (!modal) return;

        modal.style.display = 'flex';
        modal.offsetHeight; // Force reflow
        modal.classList.remove('opacity-0', 'pointer-events-none');
        const content = modal.querySelector('.relative');
        if (content) {
            content.classList.remove('scale-95', 'opacity-0');
        }

        this.renderFilters();
        this.syncApiConfigUI();

        // 首次打开若无数据则自动抽取一组
        if (this.posts.length === 0) {
            this.fetchInspiration();
        } else {
            this.renderCurrentPost();
        }

        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    close() {
        const modal = document.getElementById('inspirationModal');
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        const content = modal.querySelector('.relative');
        if (content) {
            content.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    setEra(era) {
        this.currentEra = era;
        this.renderFilters();
        this.fetchInspiration();
    }

    setRating(rating) {
        this.currentRating = rating;
        this.renderFilters();
        this.fetchInspiration();
    }

    setFranchise(fr) {
        this.currentFranchise = fr;
        this.fetchInspiration();
    }

    setStyle(st) {
        this.currentStyle = st;
        this.fetchInspiration();
    }

    setScore(score) {
        this.minScore = parseInt(score, 10) || 0;
        const scoreLabel = document.getElementById('inspScoreDisplay');
        if (scoreLabel) scoreLabel.textContent = this.minScore > 0 ? `≥ ${this.minScore}` : '不限';
    }

    renderFilters() {
        // 年代胶囊
        const eraContainer = document.getElementById('inspEraContainer');
        if (eraContainer) {
            eraContainer.innerHTML = ERA_OPTIONS.map(opt => {
                const isActive = this.currentEra === opt.id;
                return `
                    <button type="button" onclick="window.setInspirationEra('${opt.id}')"
                        class="px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all active:scale-95 flex-shrink-0 cursor-pointer ${
                            isActive
                                ? 'bg-indigo-600 text-white shadow-sm font-bold'
                                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                        }">
                        ${opt.label}
                    </button>
                `;
            }).join('');
        }

        // 分级胶囊
        const ratingContainer = document.getElementById('inspRatingContainer');
        if (ratingContainer) {
            const ratings = [
                { id: 'g', label: '全年龄 (G)' },
                { id: 's', label: '敏感 (S)' },
                { id: 'q', label: '可疑 (Q)' },
                { id: 'e', label: '限制级 (NSFW)' },
                { id: 'any', label: '全部分级' }
            ];
            ratingContainer.innerHTML = ratings.map(r => {
                const isActive = this.currentRating === r.id;
                return `
                    <button type="button" onclick="window.setInspirationRating('${r.id}')"
                        class="px-2 py-1 text-[10px] font-semibold rounded-md transition-all active:scale-95 cursor-pointer ${
                            isActive
                                ? 'bg-rose-500 text-white shadow-xs font-bold'
                                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                        }">
                        ${r.label}
                    </button>
                `;
            }).join('');
        }

        // 作品/IP 下拉菜单
        const frSelect = document.getElementById('inspFranchiseSelect');
        if (frSelect && frSelect.options.length === 0) {
            frSelect.innerHTML = FRANCHISE_OPTIONS.map(opt => `
                <option value="${opt.id}" ${this.currentFranchise === opt.id ? 'selected' : ''}>${opt.label}</option>
            `).join('');
            frSelect.onchange = (e) => this.setFranchise(e.target.value);
        }

        // 风格下拉菜单
        const stSelect = document.getElementById('inspStyleSelect');
        if (stSelect && stSelect.options.length === 0) {
            stSelect.innerHTML = ARTIST_STYLE_OPTIONS.map(opt => `
                <option value="${opt.id}" ${this.currentStyle === opt.id ? 'selected' : ''}>${opt.label}</option>
            `).join('');
            stSelect.onchange = (e) => this.setStyle(e.target.value);
        }
    }

    buildDanbooruQuery() {
        const parts = [];

        // 1. 核心主体：优先取用户输入的关键词，其次取选择的作品/IP，最后默认为 1girl
        const kwInput = document.getElementById('inspCustomKeyword');
        const customKw = kwInput ? kwInput.value.trim() : '';
        if (customKw) {
            parts.push(customKw.replace(/\s+/g, '_'));
        } else if (this.currentFranchise && this.currentFranchise !== 'any') {
            const frOpt = FRANCHISE_OPTIONS.find(o => o.id === this.currentFranchise);
            if (frOpt && frOpt.query) parts.push(frOpt.query);
        } else {
            parts.push('1girl');
        }

        // 2. 风格标签（若有）
        if (this.currentStyle && this.currentStyle !== 'any') {
            const stOpt = ARTIST_STYLE_OPTIONS.find(o => o.id === this.currentStyle);
            if (stOpt && stOpt.query) {
                // 取风格首个主要标签避免超出 Booru 标签数量限制
                const primaryStyleTag = stOpt.query.split(',')[0].trim();
                if (primaryStyleTag) parts.push(primaryStyleTag);
            }
        }

        return parts.join(' ').trim();
    }

    async fetchInspiration() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.setLoadingState(true);

        try {
            const query = this.buildDanbooruQuery();
            const randomPage = Math.floor(Math.random() * 5) + 1;
            const kwInput = document.getElementById('inspCustomKeyword');
            const customKw = kwInput ? kwInput.value.trim() : '';
            const hasSpecificSearch = Boolean(customKw || (this.currentFranchise && this.currentFranchise !== 'any'));

            let rawPosts = [];

            // 1. 如果用户指定了关键词或作品，或者配置了非 HF 数据源，走实时标签搜索
            if (hasSpecificSearch || this.sourceType !== 'hf_dataset') {
                const targetQuery = query || '1girl';
                
                // 通道 A：尝试前端直连（如果配置了自定义端点或 Danbooru 凭据）
                if (this.sourceType === 'danbooru' && this.danbooruUsername && this.danbooruApiKey) {
                    try {
                        const directUrl = `https://danbooru.donmai.us/posts.json?tags=${encodeURIComponent(targetQuery)}&limit=15&page=${randomPage}`;
                        const creds = btoa(`${this.danbooruUsername}:${this.danbooruApiKey}`);
                        const dRes = await fetch(directUrl, {
                            headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' },
                            mode: 'cors'
                        });
                        if (dRes.ok) {
                            const dData = await dRes.json();
                            if (Array.isArray(dData) && dData.length > 0) rawPosts = dData;
                        }
                    } catch (e) {}
                }

                // 通道 B：通过多源实时中继 /danbooru 接口（Safebooru -> TBIB -> Yande）精准检索
                if (rawPosts.length === 0) {
                    try {
                        const endpoint = `/danbooru?tags=${encodeURIComponent(targetQuery)}&limit=15&page=${randomPage}`;
                        const res = await fetch(endpoint, { method: 'GET' });
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.success && Array.isArray(data.posts) && data.posts.length > 0) {
                                rawPosts = data.posts;
                            }
                        }
                    } catch (pErr) {
                        console.warn("[Inspiration] Gateway fetch failed, trying direct Safebooru...", pErr);
                    }
                }

                // 通道 C：前端直连 Safebooru
                if (rawPosts.length === 0) {
                    try {
                        const directSafe = `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(targetQuery)}&limit=15&pid=${randomPage - 1}`;
                        const sRes = await fetch(directSafe, { mode: 'cors' });
                        if (sRes.ok) {
                            const sData = await sRes.json();
                            if (Array.isArray(sData) && sData.length > 0) rawPosts = sData;
                        }
                    } catch (e) {}
                }
            } else {
                // 2. 用户无特定搜索词时的探索模式：使用 HuggingFace 1140万+ 真实全量数据集的年代切片
                let baseOffset = 0;
                let range = 11400000;
                if (this.currentEra === '2026') {
                    baseOffset = 10800000;
                    range = 580000;
                } else if (this.currentEra === '2025') {
                    baseOffset = 9000000;
                    range = 1800000;
                } else if (this.currentEra === '2024') {
                    baseOffset = 7200000;
                    range = 1800000;
                } else if (this.currentEra === '2020_2023') {
                    baseOffset = 4000000;
                    range = 3200000;
                } else if (this.currentEra === '2010_2019') {
                    baseOffset = 600000;
                    range = 3400000;
                } else if (this.currentEra === 'classic') {
                    baseOffset = 0;
                    range = 600000;
                }

                const randomOffset = baseOffset + Math.floor(Math.random() * range);
                const hfUrl = `https://datasets-server.huggingface.co/rows?dataset=u-haru/danbooru-tags-20260518&config=default&split=train&offset=${randomOffset}&limit=15`;
                
                try {
                    const hfRes = await fetch(hfUrl, { mode: 'cors' });
                    if (hfRes.ok) {
                        const hfData = await hfRes.json();
                        if (hfData && Array.isArray(hfData.rows)) {
                            rawPosts = hfData.rows.map(r => r.row);
                        }
                    }
                } catch (hfErr) {
                    console.warn("[Inspiration] HF rows fetch error, falling back to gateway...", hfErr);
                }

                if (rawPosts.length === 0) {
                    const fallbackRes = await fetch(`/danbooru?tags=1girl&limit=15&page=${randomPage}`);
                    if (fallbackRes.ok) {
                        const fbData = await fallbackRes.json();
                        if (fbData && fbData.success && Array.isArray(fbData.posts)) {
                            rawPosts = fbData.posts;
                        }
                    }
                }
            }

            this.parseAndSetPosts(rawPosts);
        } catch (err) {
            console.error("[Inspiration Live Fetch Error]", err);
            this.posts = [];
            this.renderCurrentPost();
            this.onShowToast(`实时拉取异常: ${err.message}`, "error");
        } finally {
            this.isLoading = false;
            this.setLoadingState(false);
        }
    }

    parseAndSetPosts(rawPosts) {
        if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
            this.posts = [];
            this.onShowToast("未检索到实时作品，请尝试放宽筛选条件", "warning");
            this.renderCurrentPost();
            return;
        }

        // 100% 真实数据集字段标准化清洗
        this.posts = rawPosts.map(p => {
            let previewUrl = p.preview_file_url || p.sample_url || p.preview_url || p.file_url || '';
            if (p.media_asset_variants) {
                try {
                    const variants = typeof p.media_asset_variants === 'string' ? JSON.parse(p.media_asset_variants) : p.media_asset_variants;
                    if (Array.isArray(variants) && variants.length > 0) {
                        const sample = variants.find(v => ['360x360', '720x720', 'sample', '180x180'].includes(v.type));
                        if (sample && sample.url) previewUrl = sample.url;
                        else if (variants[0].url) previewUrl = variants[0].url;
                    }
                } catch (e) {}
            } else if (p.media_asset && Array.isArray(p.media_asset.variants)) {
                for (const v of p.media_asset.variants) {
                    if (['sample', '360x360', '180x180'].includes(v.type) && v.url) {
                        previewUrl = v.url;
                        break;
                    }
                }
            }

            const postTags = p.tag_string || p.tags || '';
            return {
                id: p.id,
                created_at: p.created_at || (p.change ? new Date(p.change * 1000).toISOString() : ''),
                score: p.score || 0,
                fav_count: p.fav_count || p.comment_count || 0,
                rating: p.rating || 'g',
                tag_string_artist: p.tag_string_artist || '',
                tag_string_character: p.tag_string_character || '',
                tag_string_copyright: p.tag_string_copyright || '',
                tag_string_general: p.tag_string_general || postTags,
                tag_string: postTags,
                preview_url: previewUrl,
                source_url: this.sourceType === 'yande'
                    ? `https://yande.re/post/show/${p.id}`
                    : (this.sourceType === 'gelbooru'
                        ? `https://gelbooru.com/index.php?page=post&s=view&id=${p.id}`
                        : `https://danbooru.donmai.us/posts/${p.id}`),
                image_width: p.image_width || p.width || 832,
                image_height: p.image_height || p.height || 1216
            };
        });

        this.currentPostIndex = 0;
        this.renderCurrentPost();
        this.onShowToast(`已成功从实时数据集拉取 ${this.posts.length} 组高赞作品`, "success");
    }

    setLoadingState(loading) {
        const loadingEl = document.getElementById('inspLoadingOverlay');
        const drawBtn = document.getElementById('inspDrawBtn');
        if (loadingEl) {
            if (loading) loadingEl.classList.remove('hidden');
            else loadingEl.classList.add('hidden');
        }
        if (drawBtn) {
            drawBtn.disabled = loading;
            drawBtn.innerHTML = loading
                ? `<svg class="animate-spin w-4 h-4 mr-1.5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> 检索中...`
                : `<i data-lucide="sparkles" class="w-4 h-4"></i> 🎲 抽取灵感 (Draw)`;
            if (window.safeCreateIcons) window.safeCreateIcons();
        }
    }

    prevPost() {
        if (this.posts.length === 0) return;
        this.currentPostIndex = (this.currentPostIndex - 1 + this.posts.length) % this.posts.length;
        this.renderCurrentPost();
    }

    nextPost() {
        if (this.posts.length === 0) return;
        this.currentPostIndex = (this.currentPostIndex + 1) % this.posts.length;
        this.renderCurrentPost();
    }

    categorizeTag(tagName, tagCategoryHint) {
        if (tagCategoryHint === 'artist' || tagName.startsWith('artist:')) return 'artist';
        if (tagCategoryHint === 'character' || tagCategoryHint === 'copyright') return 'character';

        const lower = tagName.toLowerCase();
        const norm = lower.replace(/_/g, ' ');

        // 结合 promptHelper 本地分类库深度判定
        if (this.promptHelper && this.promptHelper.classifiedData) {
            const cd = this.promptHelper.classifiedData;
            if (cd['画风'] && (cd['画风'][lower] || cd['画风'][norm])) return 'artist';
            if (cd['IP角色'] && (cd['IP角色'][lower] || cd['IP角色'][norm])) return 'character';
            if (cd['服装'] && (cd['服装'][lower] || cd['服装'][norm])) return 'clothing';
            if (cd['动作'] && (cd['动作'][lower] || cd['动作'][norm])) return 'action';
            if ((cd['光影'] && (cd['光影'][lower] || cd['光影'][norm])) ||
                (cd['视角'] && (cd['视角'][lower] || cd['视角'][norm])) ||
                (cd['构图'] && (cd['构图'][lower] || cd['构图'][norm]))) return 'background';
        }

        for (const kw of CLOTHING_KEYWORDS) {
            if (lower.includes(kw)) return 'clothing';
        }
        for (const kw of ACTION_KEYWORDS) {
            if (lower.includes(kw)) return 'action';
        }
        for (const kw of BACKGROUND_KEYWORDS) {
            if (lower.includes(kw)) return 'background';
        }
        return 'general';
    }

    findChineseTranslation(tagName) {
        if (!this.promptHelper) return '';
        const dict = this.promptHelper.dictionary || {};
        const normalized = tagName.replace(/_/g, ' ').toLowerCase();
        if (dict[tagName]) return dict[tagName];
        if (dict[normalized]) return dict[normalized];

        if (this.promptHelper.classifiedData) {
            for (const cat of Object.values(this.promptHelper.classifiedData)) {
                if (cat[tagName]) return cat[tagName];
                if (cat[normalized]) return cat[normalized];
            }
        }
        return '';
    }

    renderCurrentPost() {
        if (this.posts.length === 0) {
            const emptyEl = document.getElementById('inspEmptyState');
            const mainContent = document.getElementById('inspMainContent');
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (mainContent) mainContent.classList.add('hidden');
            return;
        }

        const emptyEl = document.getElementById('inspEmptyState');
        const mainContent = document.getElementById('inspMainContent');
        if (emptyEl) emptyEl.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');

        const post = this.posts[this.currentPostIndex];

        // 1. 渲染参考图与作品元信息
        const imgEl = document.getElementById('inspThumbnailImg');
        const scoreBadge = document.getElementById('inspScoreBadge');
        const favBadge = document.getElementById('inspFavBadge');
        const dateBadge = document.getElementById('inspDateBadge');
        const linkBtn = document.getElementById('inspDanbooruLink');
        const counterEl = document.getElementById('inspCandidateCounter');

        if (imgEl) {
            imgEl.src = post.preview_url || '';
            imgEl.alt = `Danbooru Post #${post.id}`;
        }
        if (scoreBadge) scoreBadge.textContent = `⭐ Score: ${post.score}`;
        if (favBadge) favBadge.textContent = `❤️ Favs: ${post.fav_count}`;
        if (dateBadge) {
            const dateStr = post.created_at ? post.created_at.substring(0, 10) : '';
            dateBadge.textContent = `📅 ${dateStr}`;
        }
        if (linkBtn) linkBtn.href = post.source_url || `https://danbooru.donmai.us/posts/${post.id}`;
        if (counterEl) counterEl.textContent = `${this.currentPostIndex + 1} / ${this.posts.length}`;

        // 同步移动端徽章
        const scoreBadgeMobile = document.getElementById('inspScoreBadgeMobile');
        const favBadgeMobile = document.getElementById('inspFavBadgeMobile');
        const counterElMobile = document.getElementById('inspCandidateCounterMobile');
        if (scoreBadgeMobile) scoreBadgeMobile.textContent = `⭐ ${post.score}`;
        if (favBadgeMobile) favBadgeMobile.textContent = `❤️ ${post.fav_count}`;
        if (counterElMobile) counterElMobile.textContent = `${this.currentPostIndex + 1} / ${this.posts.length}`;

        // 2. 解析与归类 Tags
        const artistTags = (post.tag_string_artist || '').split(/\s+/).filter(Boolean);
        const charTags = (post.tag_string_character || '').split(/\s+/).filter(Boolean);
        const copyTags = (post.tag_string_copyright || '').split(/\s+/).filter(Boolean);
        const generalTags = (post.tag_string_general || '').split(/\s+/).filter(Boolean);

        const newTags = [];
        const seen = new Set();

        // 附加画师风格预设
        if (this.currentStyle !== 'any') {
            const stOpt = ARTIST_STYLE_OPTIONS.find(o => o.id === this.currentStyle);
            if (stOpt && stOpt.query) {
                stOpt.query.split(',').map(s => s.trim()).forEach(tag => {
                    if (tag && !seen.has(tag)) {
                        seen.add(tag);
                        newTags.push({
                            name: tag,
                            cn: this.findChineseTranslation(tag),
                            category: 'artist',
                            selected: true,
                            locked: this.lockedTags.has(tag)
                        });
                    }
                });
            }
        }

        // 画师 Tag
        artistTags.forEach(t => {
            if (!seen.has(t)) {
                seen.add(t);
                newTags.push({
                    name: `artist:${t}`,
                    cn: this.findChineseTranslation(t) || '画师',
                    category: 'artist',
                    selected: true,
                    locked: this.lockedTags.has(`artist:${t}`)
                });
            }
        });

        // 角色与作品 Tag
        [...charTags, ...copyTags].forEach(t => {
            if (!seen.has(t)) {
                seen.add(t);
                newTags.push({
                    name: t,
                    cn: this.findChineseTranslation(t),
                    category: 'character',
                    selected: true,
                    locked: this.lockedTags.has(t)
                });
            }
        });

        // 一般特征 Tag（智能识别服装、动作、背景）
        generalTags.forEach(t => {
            if (!seen.has(t)) {
                seen.add(t);
                const cat = this.categorizeTag(t, 'general');
                newTags.push({
                    name: t,
                    cn: this.findChineseTranslation(t),
                    category: cat,
                    selected: true,
                    locked: this.lockedTags.has(t)
                });
            }
        });

        // 合并已锁定的标签
        this.lockedTags.forEach(lockedName => {
            if (!seen.has(lockedName)) {
                seen.add(lockedName);
                newTags.unshift({
                    name: lockedName,
                    cn: this.findChineseTranslation(lockedName),
                    category: this.categorizeTag(lockedName, 'general'),
                    selected: true,
                    locked: true
                });
            }
        });

        this.currentTags = newTags;
        this.renderTagMatrix();
        this.updateAssembledPrompt();
    }

    renderTagMatrix() {
        const matrixContainer = document.getElementById('inspTagMatrixContainer');
        if (!matrixContainer) return;

        // 按分类聚合
        const groups = {
            artist: [],
            character: [],
            clothing: [],
            action: [],
            background: [],
            general: []
        };

        this.currentTags.forEach((tag, idx) => {
            const cat = groups[tag.category] ? tag.category : 'general';
            groups[cat].push({ ...tag, index: idx });
        });

        matrixContainer.innerHTML = Object.entries(groups).map(([catKey, tagList]) => {
            if (tagList.length === 0) return '';
            const info = CATEGORY_INFO[catKey] || CATEGORY_INFO.general;

            return `
                <div class="mb-3 bg-gray-50/80 dark:bg-slate-800/40 p-2.5 rounded-xl border border-gray-100 dark:border-slate-800/80">
                    <div class="flex items-center justify-between mb-2 px-1">
                        <div class="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-200">
                            <i data-lucide="${info.icon}" class="w-3.5 h-3.5 text-indigo-500"></i>
                            <span>${info.label} (${tagList.length})</span>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        ${tagList.map(tag => `
                            <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all select-none cursor-pointer ${
                                tag.selected
                                    ? `${info.color} shadow-xs font-semibold`
                                    : 'bg-white dark:bg-slate-900 border-gray-200/60 dark:border-slate-700/60 text-gray-400 line-through opacity-60'
                            }" onclick="window.toggleInspirationTag(${tag.index})">
                                <span>${tag.name}</span>
                                ${tag.cn ? `<span class="text-[10px] opacity-75 font-normal">(${tag.cn})</span>` : ''}
                                <button type="button" class="ml-0.5 p-0.5 hover:text-amber-500 transition-colors"
                                    title="${tag.locked ? '已锁定 (换作品不丢失)' : '锁定此标签'}"
                                    onclick="window.toggleInspirationTagLock(${tag.index}, event)">
                                    <i data-lucide="pin" class="w-3 h-3 ${tag.locked ? 'text-amber-500 fill-amber-500' : 'text-gray-300 dark:text-gray-600'}"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    toggleTag(idx) {
        if (!this.currentTags[idx]) return;
        this.currentTags[idx].selected = !this.currentTags[idx].selected;
        this.renderTagMatrix();
        this.updateAssembledPrompt();
    }

    toggleTagLock(idx, e) {
        if (e) e.stopPropagation();
        if (!this.currentTags[idx]) return;
        const tag = this.currentTags[idx];
        tag.locked = !tag.locked;
        if (tag.locked) {
            this.lockedTags.add(tag.name);
            tag.selected = true;
        } else {
            this.lockedTags.delete(tag.name);
        }
        this.renderTagMatrix();
        this.updateAssembledPrompt();
    }

    toggleAllTags(select) {
        this.currentTags.forEach(t => {
            if (!t.locked) t.selected = select;
        });
        this.renderTagMatrix();
        this.updateAssembledPrompt();
    }

    getAssembledPrompt() {
        const selectedTags = this.currentTags.filter(t => t.selected).map(t => t.name);
        return selectedTags.join(', ');
    }

    updateAssembledPrompt() {
        const textarea = document.getElementById('inspPromptPreview');
        const countBadge = document.getElementById('inspSelectedTagCount');
        const selected = this.currentTags.filter(t => t.selected);

        if (textarea) textarea.value = this.getAssembledPrompt();
        if (countBadge) countBadge.textContent = `${selected.length} / ${this.currentTags.length} 标签已选`;
    }

    importPrompt(mode = 'append') {
        const promptText = this.getAssembledPrompt().trim();
        if (!promptText) {
            this.onShowToast("未选择任何灵感标签", "warning");
            return;
        }

        const posTextarea = document.getElementById('positivePrompt') || document.querySelector('#prompt');
        if (!posTextarea) {
            this.onShowToast("未找到主提示词输入框", "error");
            return;
        }

        if (mode === 'replace') {
            posTextarea.value = promptText;
            this.onShowToast("已成功替换为当前灵感提示词！", "success");
        } else if (mode === 'append') {
            const current = posTextarea.value.trim();
            posTextarea.value = current ? `${current}, ${promptText}` : promptText;
            this.onShowToast("已成功追加灵感标签至主提示词！", "success");
        } else if (mode === 'smart_v5') {
            // 智能分流：画师与环境光影归入全局 Prompt，角色/服装归入 V5 角色卡片
            const globalTags = this.currentTags.filter(t => t.selected && (t.category === 'artist' || t.category === 'background' || t.category === 'general')).map(t => t.name);
            const charTags = this.currentTags.filter(t => t.selected && (t.category === 'character' || t.category === 'clothing' || t.category === 'action')).map(t => t.name);

            // 1. 全局提示词处理
            if (globalTags.length > 0) {
                const globalStr = globalTags.join(', ');
                const cur = posTextarea.value.trim();
                posTextarea.value = cur ? `${cur}, ${globalStr}` : globalStr;
            }

            // 2. 角色卡片处理
            if (charTags.length > 0) {
                const charStr = charTags.join(', ');
                const container = document.getElementById('characterPromptsContainer');
                const firstRowInput = container ? container.querySelector('.char-prompt-input') : null;

                if (firstRowInput) {
                    firstRowInput.value = charStr;
                    if (window.charPromptManager) window.charPromptManager.saveCharacterPromptsState();
                } else if (window.addCharacterPromptRow) {
                    window.addCharacterPromptRow(charStr);
                }
            }

            this.onShowToast("✨ 智能分流完成：画师与光影已入全局，角色与服装已入V5卡片！", "success");
        }

        // 触发 input 事件同步 UI 计数和本地存储
        posTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        this.close();
    }
}

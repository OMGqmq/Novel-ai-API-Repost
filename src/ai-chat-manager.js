/**
 * AI Chat Manager Module
 * Manages full interactive multi-turn AI chat conversation, inline API key configuration,
 * message rendering, quick prompt optimization, and applying prompts back to the canvas.
 */
import { AI_PROVIDER_PRESETS, AI_SYSTEM_PROMPTS } from './ai-helper-service.js';
import { AGENT_TOOLS, executeToolCall, parseToolCallsFromText } from './ai-agent-tools.js';
import { NAI5_PROMPT_RULES } from './nai5-rules.js';

function escapeHtml(str) {
    if (!str) return '';
    if (typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Parses message markdown into semantic HTML with interactive code blocks and prompt chips
 * @param {string} text 
 * @param {number} msgIdx 
 */
function renderMessageMarkdown(text, msgIdx) {
    if (!text) return '';
    
    // Store extracted code blocks to avoid messing with other markdown regexes
    const codeBlocks = [];
    let processed = text.replace(/```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g, (match, lang, code) => {
        const blockIdx = codeBlocks.length;
        const cleanLang = (lang || 'prompt').toLowerCase();
        const escapedCode = escapeHtml(code.trim());
        
        const isPromptLike = ['prompt', 'tags', 'danbooru', 'sd', 'nai', ''].includes(cleanLang);
        const titleLabel = isPromptLike ? '提示词 / 标签' : (cleanLang.toUpperCase());

        const html = `
            <div class="my-2.5 rounded-xl border border-purple-200/60 dark:border-purple-900/40 bg-slate-900 text-slate-100 overflow-hidden shadow-sm">
                <div class="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800/80 text-[11px] text-gray-400">
                    <span class="flex items-center gap-1.5 font-medium text-purple-300">
                        <i data-lucide="terminal" class="w-3.5 h-3.5"></i>
                        <span>${titleLabel}</span>
                    </span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="window.applyAiPromptFromBlock(${msgIdx}, ${blockIdx}, 'replace')" title="替换画板正向提示词" class="px-2 py-0.5 rounded-md hover:bg-purple-900/50 text-purple-300 hover:text-purple-200 transition-colors flex items-center gap-1 text-[10px] font-medium touch-manipulation">
                            <i data-lucide="wand-2" class="w-3 h-3"></i> 填入画板
                        </button>
                        <button onclick="window.applyAiPromptFromBlock(${msgIdx}, ${blockIdx}, 'append')" title="追加到画板正向提示词" class="px-2 py-0.5 rounded-md hover:bg-indigo-900/50 text-indigo-300 hover:text-indigo-200 transition-colors flex items-center gap-1 text-[10px] font-medium touch-manipulation">
                            <i data-lucide="plus" class="w-3 h-3"></i> 追加
                        </button>
                        <button onclick="window.copyAiChatMessage(this, ${msgIdx}, ${blockIdx})" title="复制代码块内容" class="px-2 py-0.5 rounded-md hover:bg-slate-800 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1 text-[10px] touch-manipulation">
                            <i data-lucide="copy" class="w-3 h-3"></i> 复制
                        </button>
                    </div>
                </div>
                <pre class="p-3 font-mono text-xs overflow-x-auto select-text leading-relaxed whitespace-pre-wrap break-words">${escapedCode}</pre>
            </div>
        `;
        codeBlocks.push(code.trim());
        return `__CODE_BLOCK_${blockIdx}__`;
    });

    let escaped = escapeHtml(processed);

    // Headers (### Header)
    escaped = escaped.replace(/^###\s+(.+)$/gm, '<h4 class="font-bold text-xs sm:text-sm text-gray-900 dark:text-gray-100 mt-2 mb-1">$1</h4>');
    escaped = escaped.replace(/^##\s+(.+)$/gm, '<h3 class="font-bold text-sm text-gray-900 dark:text-gray-100 mt-2.5 mb-1">$1</h3>');

    // Bullet lists (- or *)
    escaped = escaped.replace(/^[\*\-]\s+(.+)$/gm, '<li class="ml-4 list-disc text-gray-700 dark:text-gray-300">$1</li>');

    // Inline code `...`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded font-mono text-[11px] select-text">$1</code>');

    // Bold **...**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-gray-100">$1</strong>');

    // Newlines
    escaped = escaped.replace(/\n/g, '<br>');

    // Put code blocks back
    codeBlocks.forEach((code, idx) => {
        const placeholder = `__CODE_BLOCK_${idx}__`;
        const titleLabel = '提示词 / 标签';
        const escapedCode = escapeHtml(code);
        const blockHtml = `
            <div class="my-2.5 rounded-xl border border-purple-200/60 dark:border-purple-900/40 bg-slate-900 text-slate-100 overflow-hidden shadow-sm">
                <div class="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800/80 text-[11px] text-gray-400">
                    <span class="flex items-center gap-1.5 font-medium text-purple-300">
                        <i data-lucide="terminal" class="w-3.5 h-3.5"></i>
                        <span>${titleLabel}</span>
                    </span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="window.applyAiPromptFromBlock(${msgIdx}, ${idx}, 'replace')" title="替换画板正向提示词" class="px-2 py-0.5 rounded-md hover:bg-purple-900/50 text-purple-300 hover:text-purple-200 transition-colors flex items-center gap-1 text-[10px] font-medium touch-manipulation">
                            <i data-lucide="wand-2" class="w-3 h-3"></i> 填入画板
                        </button>
                        <button onclick="window.applyAiPromptFromBlock(${msgIdx}, ${idx}, 'append')" title="追加到画板正向提示词" class="px-2 py-0.5 rounded-md hover:bg-indigo-900/50 text-indigo-300 hover:text-indigo-200 transition-colors flex items-center gap-1 text-[10px] font-medium touch-manipulation">
                            <i data-lucide="plus" class="w-3 h-3"></i> 追加
                        </button>
                        <button onclick="window.copyAiChatMessage(this, ${msgIdx}, ${idx})" title="复制代码块内容" class="px-2 py-0.5 rounded-md hover:bg-slate-800 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1 text-[10px] touch-manipulation">
                            <i data-lucide="copy" class="w-3 h-3"></i> 复制
                        </button>
                    </div>
                </div>
                <pre class="p-3 font-mono text-xs overflow-x-auto select-text leading-relaxed whitespace-pre-wrap break-words">${escapedCode}</pre>
            </div>
        `;
        escaped = escaped.replace(placeholder, blockHtml);
    });

    return escaped;
}

export class AiChatManager {
    constructor(config = {}) {
        this.service = config.service;
        this.onApplyPrompt = config.onApplyPrompt || (() => {});
        this.onAddCharacter = config.onAddCharacter || null;
        this.onSetModel = config.onSetModel || null;
        this.onSetParameters = config.onSetParameters || null;
        this.onRemoveCharacter = config.onRemoveCharacter || null;
        this.onGenerateImage = config.onGenerateImage || null;
        this.getCanvasState = config.getCanvasState || (() => ({ model: 'v5', prompt: '', negative: '', characters: [] }));
        this.onShowToast = config.onShowToast || ((msg, type) => {
            if (typeof window !== 'undefined' && window.showToast) window.showToast(msg, type);
            else console.log(`[Toast] ${type}: ${msg}`);
        });

        const doc = typeof document !== 'undefined' ? document : null;
        this.modalEl = doc ? doc.getElementById('aiChatModal') : null;
        this.messagesContainerEl = doc ? doc.getElementById('aiChatMessages') : null;
        this.inputEl = doc ? doc.getElementById('aiChatInput') : null;
        this.sendBtnEl = doc ? doc.getElementById('aiChatSendBtn') : null;
        this.stopBtnEl = doc ? doc.getElementById('aiChatStopBtn') : null;
        this.settingsDrawerEl = doc ? doc.getElementById('aiChatSettingsDrawer') : null;
        this.modelBadgeEl = doc ? doc.getElementById('aiChatModelBadge') : null;
        this.includePromptCheckbox = doc ? doc.getElementById('aiChatIncludePromptCheckbox') : null;
        this.nai5RulesCheckbox = doc ? doc.getElementById('aiAgentNai5RulesCheckbox') : null;

        // Settings input elements
        this.providerSelectEl = doc ? doc.getElementById('aiChatProviderSelect') : null;
        this.baseUrlEl = doc ? doc.getElementById('aiChatBaseUrl') : null;
        this.apiKeyEl = doc ? doc.getElementById('aiChatApiKey') : null;
        this.modelEl = doc ? doc.getElementById('aiChatModel') : null;
        this.systemPresetSelectEl = doc ? doc.getElementById('aiChatSystemPresetSelect') : null;
        this.systemPromptEl = doc ? doc.getElementById('aiChatSystemPrompt') : null;

        this.messages = [];
        this.isLoading = false;
        this.abortController = null;

        this.loadHistory();
        this.initGlobalBindings();
        this.setupAutoGrowInput();
    }

    initGlobalBindings() {
        if (typeof window === 'undefined') return;

        window.openAiChatModal = () => this.open();
        window.closeAiChatModal = () => this.close();
        window.toggleAiChatSettings = () => this.toggleSettingsDrawer();
        window.clearAiChatHistory = () => this.clearHistory();
        window.sendAiChatMessage = () => this.handleSendMessage();
        window.stopAiChatGeneration = () => this.stopGeneration();
        window.saveAiChatInlineSettings = () => this.saveInlineSettings();
        window.testAiChatConnection = () => this.testConnection();
        window.onAiChatProviderChange = () => this.handleProviderChange();
        window.onAiChatSystemPresetChange = () => this.handleSystemPresetChange();
        window.sendQuickAiPrompt = (action) => this.handleQuickPrompt(action);
        window.setAiChatPrompt = (text) => this.setPromptInput(text);
        window.applyAiPromptToCanvas = (msgIdx, mode) => this.applyPromptByMessage(msgIdx, mode);
        window.applyAiPromptFromBlock = (msgIdx, blockIdx, mode) => this.applyPromptFromBlock(msgIdx, blockIdx, mode);
        window.copyAiChatMessage = (btn, msgIdx, blockIdx = null) => this.copyMessageText(btn, msgIdx, blockIdx);
        window.openChatImageLightbox = (msgIdx, tcIdx) => this.openChatImageLightbox(msgIdx, tcIdx);
        window.saveChatImageToGallery = (msgIdx, tcIdx, btn) => this.saveImageToGallery(msgIdx, tcIdx, btn);
        window.regenerateChatImage = (msgIdx, tcIdx) => this.regenerateFromChatImage(msgIdx, tcIdx);
        window.switchChatImageVersion = (msgIdx, tcIdx, delta) => this.switchImageVersion(msgIdx, tcIdx, delta);

        if (this.inputEl) {
            this.inputEl.addEventListener('keydown', (e) => {
                // Ignore enter when composing with IME (e.g. Chinese Pinyin input)
                if (e.isComposing || e.keyCode === 229) {
                    return;
                }
                // Desktop / non-shift Enter sends message
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }
    }

    setupAutoGrowInput() {
        if (!this.inputEl) return;
        const resize = () => {
            this.inputEl.style.height = 'auto';
            const nextHeight = Math.min(Math.max(this.inputEl.scrollHeight, 38), 120);
            this.inputEl.style.height = `${nextHeight}px`;
        };
        this.inputEl.addEventListener('input', resize);
    }

    loadHistory() {
        if (typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem('nai_ai_chat_history');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.messages = parsed;
                }
            }
        } catch {
            this.messages = [];
        }
    }

    saveHistory() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem('nai_ai_chat_history', JSON.stringify(this.messages.slice(-50)));
        } catch {
            // Ignore storage errors
        }
    }

    open() {
        if (!this.modalEl) return;
        this.hydrateSettingsInputs();
        this.renderMessages();
        this.modalEl.style.display = 'flex';
        requestAnimationFrame(() => {
            this.modalEl.classList.remove('opacity-0', 'pointer-events-none');
            const backdrop = this.modalEl.querySelector('.custom-modal-backdrop');
            const content = this.modalEl.querySelector('.custom-modal-content');
            if (backdrop) backdrop.classList.remove('opacity-0');
            if (content) content.classList.remove('opacity-0', 'scale-95');
            this.scrollToBottom();
            if (this.inputEl && typeof window !== 'undefined' && window.innerWidth >= 640) {
                this.inputEl.focus();
            }
        });

        if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
    }

    close() {
        if (!this.modalEl) return;
        const backdrop = this.modalEl.querySelector('.custom-modal-backdrop');
        const content = this.modalEl.querySelector('.custom-modal-content');
        if (backdrop) backdrop.classList.add('opacity-0');
        if (content) content.classList.add('opacity-0', 'scale-95');
        this.modalEl.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            this.modalEl.style.display = 'none';
        }, 300);
    }

    toggleSettingsDrawer() {
        if (!this.settingsDrawerEl) return;
        const isHidden = this.settingsDrawerEl.classList.contains('hidden');
        if (isHidden) {
            this.hydrateSettingsInputs();
            this.settingsDrawerEl.classList.remove('hidden');
        } else {
            this.settingsDrawerEl.classList.add('hidden');
        }
        if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
    }

    hydrateSettingsInputs() {
        if (!this.service || !this.service.getSettings) return;
        const settings = this.service.getSettings();
        if (this.baseUrlEl) this.baseUrlEl.value = settings.baseUrl;
        if (this.apiKeyEl) this.apiKeyEl.value = settings.apiKey;
        if (this.modelEl) this.modelEl.value = settings.model;
        if (this.systemPromptEl) this.systemPromptEl.value = settings.systemPrompt;
        if (this.nai5RulesCheckbox) {
            this.nai5RulesCheckbox.checked = settings.nai5RulesEnabled !== false;
        }

        if (this.modelBadgeEl) {
            this.modelBadgeEl.textContent = settings.model || '未配置模型';
        }

        // Match provider preset
        if (this.providerSelectEl) {
            let matched = 'custom';
            for (const [key, preset] of Object.entries(AI_PROVIDER_PRESETS)) {
                if (preset.baseUrl && settings.baseUrl.startsWith(preset.baseUrl)) {
                    matched = key;
                    break;
                }
            }
            this.providerSelectEl.value = matched;
        }
    }

    handleProviderChange() {
        const key = this.providerSelectEl?.value;
        if (key && AI_PROVIDER_PRESETS[key] && key !== 'custom') {
            const preset = AI_PROVIDER_PRESETS[key];
            if (this.baseUrlEl) this.baseUrlEl.value = preset.baseUrl;
            if (this.modelEl) this.modelEl.value = preset.model;
        }
    }

    handleSystemPresetChange() {
        const key = this.systemPresetSelectEl?.value;
        if (key && AI_SYSTEM_PROMPTS[key]) {
            if (this.systemPromptEl) this.systemPromptEl.value = AI_SYSTEM_PROMPTS[key].prompt;
        }
    }

    saveInlineSettings() {
        if (!this.service || !this.service.saveSettings) return;
        const baseUrl = this.baseUrlEl?.value.trim() || 'https://api.openai.com/v1';
        const apiKey = this.apiKeyEl?.value.trim() || '';
        const model = this.modelEl?.value.trim() || 'gpt-4o-mini';
        const systemPrompt = this.systemPromptEl?.value.trim() || (this.service.defaultSystemPrompt || '');
        const nai5RulesEnabled = this.nai5RulesCheckbox ? this.nai5RulesCheckbox.checked : true;

        this.service.saveSettings({ baseUrl, apiKey, model, systemPrompt, nai5RulesEnabled });

        // Sync with main settings elements if available
        if (typeof document !== 'undefined') {
            const mainBaseUrl = document.getElementById('aiHelperBaseUrl');
            const mainApiKey = document.getElementById('aiHelperApiKey');
            const mainModel = document.getElementById('aiHelperModel');
            const mainSysPrompt = document.getElementById('aiHelperSystemPrompt');

            if (mainBaseUrl) mainBaseUrl.value = baseUrl;
            if (mainApiKey) mainApiKey.value = apiKey;
            if (mainModel) mainModel.value = model;
            if (mainSysPrompt) mainSysPrompt.value = systemPrompt;
        }

        if (this.modelBadgeEl) this.modelBadgeEl.textContent = model;
        if (this.settingsDrawerEl) this.settingsDrawerEl.classList.add('hidden');

        this.onShowToast("AI Agent 对话助手配置已保存", "success");
    }

    async testConnection() {
        const btn = typeof document !== 'undefined' ? document.getElementById('aiChatTestBtn') : null;
        const originalText = btn ? btn.textContent : "测试连接";
        if (btn) {
            btn.disabled = true;
            btn.textContent = "测试中...";
        }

        const baseUrl = this.baseUrlEl?.value.trim() || 'https://api.openai.com/v1';
        const apiKey = this.apiKeyEl?.value.trim() || '';
        const model = this.modelEl?.value.trim() || 'gpt-4o-mini';

        try {
            const res = await this.service.chat([
                { role: 'user', content: "Hello! Please reply with 'OK'." }
            ], { baseUrl, apiKey, model });

            this.onShowToast(`连接成功! 响应: ${res.slice(0, 40)}`, "success");
        } catch (err) {
            this.onShowToast(`连接失败: ${err.message}`, "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    }

    setPromptInput(text) {
        if (!this.inputEl) return;
        this.inputEl.value = text;
        this.inputEl.focus();
        if (this.inputEl.style) {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
        }
    }

    renderMessages() {
        if (!this.messagesContainerEl) return;

        if (this.messages.length === 0 && !this.isLoading) {
            this.messagesContainerEl.innerHTML = `
                <div class="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-3 sm:p-6 space-y-4">
                    <div class="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/25">
                        <i data-lucide="bot" class="w-6 h-6 sm:w-7 sm:h-7"></i>
                        <span class="absolute -top-1 -right-1 flex h-3 w-3">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                    </div>
                    <div class="space-y-1">
                        <h4 class="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-100 flex items-center justify-center gap-1.5">
                            NovelAI 自主创作智能体
                        </h4>
                        <p class="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 max-w-sm sm:max-w-md leading-relaxed">
                            具备画板环境深度感知、多角色智能空间编排与 ReAct 自主工具链。向 Agent 发送创作需求即可全自动执行。
                        </p>
                    </div>

                    <!-- 智能体核心能力卡片 (2x2 网格) -->
                    <div class="w-full max-w-md grid grid-cols-2 gap-2 text-left pt-1">
                        <div class="p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/30">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
                                <i data-lucide="sliders" class="w-3.5 h-3.5 shrink-0"></i>
                                <span>画板感知调参</span>
                            </div>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">自动读写分辨率与步数，严守免扣点规格 (≤28步)</p>
                        </div>
                        <div class="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/30">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                <i data-lucide="users" class="w-3.5 h-3.5 shrink-0"></i>
                                <span>多角色空间编排</span>
                            </div>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">适配 V4.5 网格定位与 V5 连续坐标，杜绝重叠</p>
                        </div>
                        <div class="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                                <i data-lucide="book-open" class="w-3.5 h-3.5 shrink-0"></i>
                                <span>NAI5 专家规程</span>
                            </div>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">内置 2200+ 张实测图规则库，精通构图与词序</p>
                        </div>
                        <div class="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <i data-lucide="sparkles" class="w-3.5 h-3.5 shrink-0"></i>
                                <span>自主闭环出图</span>
                            </div>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">支持 ReAct 循环，调参写词完毕后直接生成展示</p>
                        </div>
                    </div>

                    <!-- 交互式灵感指令 (点击填入) -->
                    <div class="w-full max-w-md pt-1 space-y-1 text-left">
                        <span class="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider pl-0.5">尝试发送指令:</span>
                        <div class="flex flex-col sm:flex-row gap-1.5">
                            <button onclick="window.setAiChatPrompt('帮我优化当前画板的提示词，增强光影与细节并写入画板')" class="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-100/80 dark:bg-slate-800/80 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 border border-gray-200/60 dark:border-slate-700/60 transition-all text-left truncate">
                                💡 优化当前画板词并自动写入
                            </button>
                            <button onclick="window.setAiChatPrompt('创作一个赛博朋克银发少女，搭配角色和场景直接生成出图')" class="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-100/80 dark:bg-slate-800/80 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 border border-gray-200/60 dark:border-slate-700/60 transition-all text-left truncate">
                                🎨 创作赛博少女并自主出图展示
                            </button>
                        </div>
                    </div>
                </div>
            `;
            if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            return;
        }

        const displayMessages = this.messages.filter(m => m.role === 'user' || m.role === 'assistant');
        let html = displayMessages.map((m) => {
            const originalIdx = this.messages.indexOf(m);
            const isUser = m.role === 'user';
            if (isUser) {
                return `
                    <div class="flex justify-end gap-2 message-user group">
                        <div class="max-w-[90%] sm:max-w-[82%] bg-purple-600 text-white rounded-2xl rounded-tr-sm px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-[13px] shadow-md leading-relaxed select-text break-words">
                            ${escapeHtml(m.content).replace(/\n/g, '<br>')}
                        </div>
                    </div>
                `;
            } else {
                const renderedContent = renderMessageMarkdown(m.content, originalIdx);
                let toolCardsHtml = '';
                if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
                    toolCardsHtml = m.tool_calls.map((tc, tcIdx) => {
                        const isSuccess = tc.success !== false;
                        const icon = isSuccess ? (tc.tool === 'generate_image' ? 'sparkles' : 'wrench') : 'alert-circle';
                        const colorClass = isSuccess
                            ? (tc.tool === 'generate_image' 
                                ? 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 border-purple-300 dark:border-purple-700/60 text-purple-800 dark:text-purple-200' 
                                : 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-200/70 dark:border-purple-800/50 text-purple-700 dark:text-purple-300')
                            : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/50 text-amber-700 dark:text-amber-300';
                        
                        const toolLabels = {
                            update_prompt: '已调用画板工具: 更新提示词',
                            add_character: '已调用画板工具: 添加角色',
                            remove_character: '已调用画板工具: 删除角色',
                            set_model: '已调用画板工具: 切换模型',
                            set_parameters: '已调用画板工具: 调整参数',
                            get_canvas_state: '已调用画板工具: 读取状态',
                            generate_image: '已调用画板工具: 生成图像'
                        };
                        const toolLabel = toolLabels[tc.tool] || `已调用工具: ${tc.tool}`;

                        let imageBlockHtml = '';
                        // Normalize tc.images array for version history
                        if (!Array.isArray(tc.images) || tc.images.length === 0) {
                            if (tc.imageUrl) {
                                tc.images = [{
                                    imageUrl: tc.imageUrl,
                                    seed: tc.seed,
                                    width: tc.width,
                                    height: tc.height,
                                    model: tc.model,
                                    prompt: tc.prompt,
                                    negative_prompt: tc.negative_prompt,
                                    steps: tc.steps,
                                    scale: tc.scale,
                                    sampler: tc.sampler,
                                    meta: tc.meta,
                                    isSavedToHistory: Boolean(tc.isSavedToHistory),
                                    id: tc.id || null
                                }];
                                tc.currentIndex = 0;
                            }
                        }

                        if (Array.isArray(tc.images) && tc.images.length > 0) {
                            if (typeof tc.currentIndex !== 'number' || tc.currentIndex < 0 || tc.currentIndex >= tc.images.length) {
                                tc.currentIndex = tc.images.length - 1;
                            }
                            const currentImg = tc.images[tc.currentIndex];
                            const seedVal = currentImg.seed !== undefined ? currentImg.seed : '随机';
                            const w = currentImg.width || 832;
                            const h = currentImg.height || 1216;
                            const isSaved = Boolean(currentImg.isSavedToHistory);
                            const isRegenerating = Boolean(tc.isRegenerating);
                            const hasMultiple = tc.images.length > 1;

                            imageBlockHtml = `
                                <div class="mt-2 rounded-xl overflow-hidden border border-purple-200 dark:border-purple-800/60 bg-black/10 dark:bg-black/40">
                                    <div class="relative group max-h-80 flex items-center justify-center bg-slate-950/20 overflow-hidden">
                                        <img src="${currentImg.imageUrl}" alt="AI Generated" class="w-full h-auto max-h-72 object-contain cursor-pointer transition-transform duration-200 hover:scale-[1.01]" onclick="window.openChatImageLightbox ? window.openChatImageLightbox(${originalIdx}, ${tcIdx}) : (window.openLightbox ? window.openLightbox('${currentImg.imageUrl}') : window.open('${currentImg.imageUrl}', '_blank'))" />
                                        
                                        ${isRegenerating ? `
                                            <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2 z-10 transition-opacity">
                                                <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-purple-400"></i>
                                                <span class="text-[11px] font-medium text-purple-200">正在生成新版本...</span>
                                            </div>
                                        ` : ''}

                                        <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 backdrop-blur-xs p-1 rounded-lg shadow-md z-10">
                                            <button onclick="window.downloadImageUrl ? window.downloadImageUrl('${currentImg.imageUrl}', 'nai_agent_${seedVal}.png') : window.open('${currentImg.imageUrl}', '_blank')" class="p-1 text-white hover:text-purple-300 transition-colors cursor-pointer" title="下载图片">
                                                <i data-lucide="download" class="w-3.5 h-3.5"></i>
                                            </button>
                                            <button onclick="window.openChatImageLightbox ? window.openChatImageLightbox(${originalIdx}, ${tcIdx}) : (window.openLightbox ? window.openLightbox('${currentImg.imageUrl}') : window.open('${currentImg.imageUrl}', '_blank'))" class="p-1 text-white hover:text-purple-300 transition-colors cursor-pointer" title="查看大图与详情">
                                                <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="px-2.5 py-1.5 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-slate-900/80 border-t border-purple-100 dark:border-purple-900/40 flex-wrap gap-1.5">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            ${hasMultiple ? `
                                                <div class="inline-flex items-center bg-purple-50/90 dark:bg-purple-950/60 border border-purple-200/80 dark:border-purple-800/60 rounded-md px-1 py-0.5 text-[10px] text-purple-700 dark:text-purple-300 select-none">
                                                    <button onclick="window.switchChatImageVersion ? window.switchChatImageVersion(${originalIdx}, ${tcIdx}, -1) : null" class="p-0.5 hover:text-purple-900 dark:hover:text-purple-100 cursor-pointer" title="上一个版本">
                                                        <i data-lucide="chevron-left" class="w-3 h-3"></i>
                                                    </button>
                                                    <span class="px-1 font-mono font-bold tracking-tight">${tc.currentIndex + 1}/${tc.images.length}</span>
                                                    <button onclick="window.switchChatImageVersion ? window.switchChatImageVersion(${originalIdx}, ${tcIdx}, 1) : null" class="p-0.5 hover:text-purple-900 dark:hover:text-purple-100 cursor-pointer" title="下一个版本">
                                                        <i data-lucide="chevron-right" class="w-3 h-3"></i>
                                                    </button>
                                                </div>
                                            ` : ''}
                                            <span>Seed: <code class="font-mono font-bold text-purple-600 dark:text-purple-400">${seedVal}</code> (${w}x${h})</span>
                                        </div>
                                        <div class="flex items-center gap-1.5">
                                            ${isSaved ? `
                                                <span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 font-semibold py-0.5 px-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[10px]">
                                                    <i data-lucide="check" class="w-3 h-3"></i> 已保存
                                                </span>
                                            ` : `
                                                <button onclick="window.saveChatImageToGallery ? window.saveChatImageToGallery(${originalIdx}, ${tcIdx}, this) : null" class="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-0.5 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer touch-manipulation text-[10px]" title="保存当前版本至历史画廊">
                                                    <i data-lucide="bookmark" class="w-3 h-3"></i> 保存
                                                </button>
                                            `}
                                            <button onclick="window.regenerateChatImage ? window.regenerateChatImage(${originalIdx}, ${tcIdx}) : null" ${isRegenerating ? 'disabled' : ''} class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-0.5 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer touch-manipulation text-[10px] disabled:opacity-50 disabled:pointer-events-none" title="基于此提示词与参数在当前占位框重新生成">
                                                <i data-lucide="${isRegenerating ? 'loader-2' : 'refresh-cw'}" class="w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}"></i> ${isRegenerating ? '生成中...' : '重新生成'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }

                        return `
                            <div class="p-2 sm:p-2.5 rounded-xl border text-[11px] leading-snug space-y-0.5 ${colorClass}">
                                <div class="flex items-center gap-1.5 font-bold">
                                    <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
                                    <span>${toolLabel}</span>
                                </div>
                                <div class="text-[10px] pl-5 opacity-90 break-words">
                                    ${escapeHtml(tc.message || tc.error || '')}
                                </div>
                                ${imageBlockHtml}
                            </div>
                        `;
                    }).join('');
                }

                return `
                    <div class="flex justify-start gap-2 sm:gap-2.5 message-assistant group">
                        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                            <i data-lucide="bot" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                        </div>
                        <div class="max-w-[92%] sm:max-w-[85%] space-y-1.5">
                            ${toolCardsHtml ? `<div class="space-y-1.5">${toolCardsHtml}</div>` : ''}
                            ${renderedContent ? `
                            <div class="bg-gray-100/90 dark:bg-slate-800/90 text-gray-800 dark:text-gray-100 rounded-2xl rounded-tl-sm px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-[13px] shadow-sm leading-relaxed select-text border border-gray-200/50 dark:border-slate-700/50 break-words">
                                ${renderedContent}
                            </div>
                            ` : ''}
                            <!-- Action buttons -->
                            <div class="flex items-center gap-1.5 px-0.5 text-[11px] flex-wrap">
                                <button onclick="window.applyAiPromptToCanvas(${originalIdx}, 'replace')" class="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 touch-manipulation">
                                    <i data-lucide="wand-2" class="w-3 h-3"></i> 填入提示词
                                </button>
                                <button onclick="window.applyAiPromptToCanvas(${originalIdx}, 'append')" class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 touch-manipulation">
                                    <i data-lucide="plus" class="w-3 h-3"></i> 追加
                                </button>
                                <button onclick="window.copyAiChatMessage(this, ${originalIdx})" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1 transition-colors py-0.5 px-2 rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-700/40 touch-manipulation">
                                    <i data-lucide="copy" class="w-3 h-3"></i> 复制
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }).join('');

        // Loading thinking indicator (Agent ReAct status)
        if (this.isLoading) {
            html += `
                <div class="flex justify-start gap-2 sm:gap-2.5 message-assistant message-thinking">
                    <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        <i data-lucide="bot" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                    </div>
                    <div class="bg-purple-50/80 dark:bg-slate-800/90 text-purple-700 dark:text-purple-300 rounded-2xl rounded-tl-sm px-3.5 sm:px-4 py-2.5 text-xs shadow-xs border border-purple-200/50 dark:border-purple-800/40 flex items-center gap-2.5">
                        <div class="flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 0ms"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 150ms"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 300ms"></span>
                        </div>
                        <span class="text-[11px] font-medium">Agent 正在自主思考并规划画板工具链 (ReAct)...</span>
                    </div>
                </div>
            `;
        }

        this.messagesContainerEl.innerHTML = html;
        this.scrollToBottom();
        if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
    }

    scrollToBottom() {
        if (!this.messagesContainerEl) return;
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                if (this.messagesContainerEl) {
                    this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
                }
            });
        } else {
            this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
        }
    }

    buildSystemPrompt(settings, canvasState) {
        const normModel = (canvasState.model || 'v5').toLowerCase();
        let systemContext = (settings.systemPrompt || this.service.defaultSystemPrompt || '').trim();

        if (settings.nai5RulesEnabled !== false) {
            systemContext += `\n\n${NAI5_PROMPT_RULES}`;
        }

        const modelDesc = normModel === 'v3' 
            ? 'V3 (nai-diffusion-3) - 【注意: V3 底层架构不支持独立多角色，禁止调用 add_character 工具】' 
            : (normModel === 'v4.5' 
                ? 'V4.5 (nai-diffusion-4-5-full) - 【注意: V4.5 角色位置使用 5x5 网格 A1~E5】' 
                : 'V5 (nai-diffusion-5-full) - 【注意: V5 角色位置使用 2D 连续自由坐标 0.0~1.0】');

        const charCount = canvasState.characters ? canvasState.characters.length : 0;
        const charSummary = charCount > 0 
            ? canvasState.characters.map((c, i) => `#${i+1}: ${c.prompt} (位置: ${c.position || (c.autoPos ? '自动' : `x:${c.x}, y:${c.y}`)})`).join('; ')
            : '暂无角色';

        const resInfo = `${canvasState.width || 832}x${canvasState.height || 1216}`;
        const stepsInfo = `${canvasState.steps || 28} 步 (普通用户免费上限 28 步)`;

        systemContext += `\n\n【画板环境实时感知与普通用户权限规范】
- 当前绘图模型版本: ${modelDesc}
- 当前画板正向提示词: "${canvasState.prompt || '(空)'}"
- 当前画板排除词(Negative): "${canvasState.negative || '(空)'}"
- 当前画幅分辨率: ${resInfo}
- 当前生成步数: ${stepsInfo}
- 当前Scale引导强度: ${canvasState.scale || 5.0}
- 当前已有角色列表: ${charSummary}
- 普通用户权限与免扣 Anlas 原则:
  1. 普通用户出图权限严格限制在 Opus 免费规格：步数必须 <= 28 步；分辨率限标准免费尺寸 (832x1216, 1216x832, 1024x1024)；单批次 1 张。严禁设置超过 28 步或 XL 超大分辨率，杜绝消耗用户的 Anlas 点数。
  2. 自主 Agent 行为规范: 当用户要求写词、调整画面、增删角色、更换模型或生成出图时，请主动调用对应的工具链 (update_prompt, add_character, remove_character, set_model, set_parameters, get_canvas_state, generate_image)。
  3. 自主 Tool Loop 流程: 工具调用完毕后，系统会自动将工具结果反馈给你。如果用户要求直接出图展示，你可以在调整好参数与提示词后自主调用 generate_image 工具完成出图，最后给出友好的完成总结与点评。`;

        return systemContext;
    }

    buildExecutionContext(normModel) {
        return {
            model: normModel,
            onUpdatePrompt: (data) => {
                this.onApplyPrompt(data.prompt, data.mode);
                if (data.negative) {
                    const negInput = typeof document !== 'undefined' ? document.getElementById('negative') : null;
                    if (negInput) {
                        if (data.negativeMode === 'append') {
                            const exist = negInput.value.trim();
                            negInput.value = exist ? `${exist}, ${data.negative}` : data.negative;
                        } else {
                            negInput.value = data.negative;
                        }
                        negInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            },
            onAddCharacter: (charData) => {
                if (this.onAddCharacter) {
                    this.onAddCharacter(charData);
                } else if (typeof window !== 'undefined' && typeof window.addCharacterPromptRow === 'function') {
                    window.addCharacterPromptRow(
                        charData.prompt,
                        charData.negative || '',
                        charData.x,
                        charData.y,
                        charData.autoPos,
                        true
                    );
                }
            },
            onRemoveCharacter: (params) => {
                if (this.onRemoveCharacter) {
                    return this.onRemoveCharacter(params);
                }
                return { success: false, error: '未提供角色移除回调' };
            },
            onSetModel: (model) => {
                if (this.onSetModel) {
                    this.onSetModel(model);
                } else if (typeof window !== 'undefined' && typeof window.setModel === 'function') {
                    window.setModel(model);
                }
            },
            onSetParameters: (params) => {
                if (this.onSetParameters) {
                    this.onSetParameters(params);
                }
            },
            onGenerateImage: async () => {
                if (this.onGenerateImage) {
                    return await this.onGenerateImage();
                } else if (typeof window !== 'undefined' && typeof window.doGenerate === 'function') {
                    return await window.doGenerate();
                }
                return { success: false, error: '未提供图像生成回调' };
            },
            getCanvasState: () => {
                return typeof this.getCanvasState === 'function'
                    ? this.getCanvasState()
                    : { model: 'v5', prompt: '', negative: '', characters: [] };
            }
        };
    }

    async handleSendMessage(customPromptText = null) {
        if (this.isLoading) return;

        let userContent = customPromptText || (this.inputEl ? this.inputEl.value.trim() : '');
        if (!userContent) return;

        // Check if API Key is configured
        const settings = this.service ? this.service.getSettings() : { apiKey: '' };
        if (!settings.apiKey) {
            this.toggleSettingsDrawer();
            this.onShowToast("请先配置自定义 AI API Key", "warning");
            return;
        }

        const initialCanvasState = typeof this.getCanvasState === 'function' ? this.getCanvasState() : { model: 'v5', prompt: '', negative: '', characters: [] };

        // Attach canvas prompt if requested
        if (this.includePromptCheckbox && this.includePromptCheckbox.checked && !customPromptText) {
            const currentPrompt = initialCanvasState.prompt || (typeof document !== 'undefined' ? document.getElementById('prompt')?.value.trim() : '');
            if (currentPrompt) {
                userContent = `[当前画板提示词: ${currentPrompt}]\n\n${userContent}`;
            }
        }

        if (this.inputEl && !customPromptText) {
            this.inputEl.value = '';
            this.inputEl.style.height = 'auto';
        }

        // Add user message
        this.messages.push({
            id: Date.now().toString(),
            role: 'user',
            content: userContent,
            timestamp: Date.now()
        });

        this.setLoading(true);
        this.renderMessages();
        this.saveHistory();

        this.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

        try {
            const MAX_AGENT_LOOPS = 6;
            let loopCount = 0;

            while (loopCount < MAX_AGENT_LOOPS) {
                if (this.abortController?.signal?.aborted) {
                    break;
                }

                loopCount++;

                const currentCanvasState = typeof this.getCanvasState === 'function'
                    ? this.getCanvasState()
                    : { model: 'v5', prompt: '', negative: '', characters: [] };
                const currentNormModel = (currentCanvasState.model || 'v5').toLowerCase();

                const systemContext = this.buildSystemPrompt(settings, currentCanvasState);

                const requestMessages = this.messages.map(m => {
                    const item = { role: m.role, content: m.content };
                    if (m.rawToolCalls) item.tool_calls = m.rawToolCalls;
                    if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
                    return item;
                });

                const responseObj = await this.service.chat(
                    requestMessages,
                    {
                        signal: this.abortController?.signal,
                        systemPrompt: systemContext,
                        tools: AGENT_TOOLS
                    }
                );

                let rawText = '';
                let toolCalls = [];

                if (typeof responseObj === 'string') {
                    rawText = responseObj;
                } else if (responseObj && typeof responseObj === 'object') {
                    rawText = responseObj.content || '';
                    toolCalls = Array.isArray(responseObj.tool_calls) ? [...responseObj.tool_calls] : [];
                }

                // Fallback: parse text tool calls if native tool_calls is empty
                if (toolCalls.length === 0) {
                    const fallbackCalls = parseToolCallsFromText(rawText);
                    if (fallbackCalls.length > 0) {
                        toolCalls = fallbackCalls;
                    }
                }

                // If no tool calls, Agent completed reasoning! Save assistant message & terminate loop
                if (toolCalls.length === 0) {
                    if (rawText) {
                        this.messages.push({
                            id: (Date.now() + loopCount).toString(),
                            role: 'assistant',
                            content: rawText,
                            timestamp: Date.now()
                        });
                        this.saveHistory();
                    }
                    break;
                }

                // Execute tools
                const executedResults = [];
                const executionContext = this.buildExecutionContext(currentNormModel);

                for (const call of toolCalls) {
                    if (this.abortController?.signal?.aborted) break;
                    const res = await executeToolCall(call, executionContext);
                    executedResults.push(res);
                    if (res.success) {
                        this.onShowToast(res.message, 'success');
                    } else {
                        this.onShowToast(res.error || '工具执行未成功', 'warning');
                    }
                }

                // Record assistant message with tool cards
                this.messages.push({
                    id: (Date.now() + loopCount).toString(),
                    role: 'assistant',
                    content: rawText,
                    tool_calls: executedResults,
                    rawToolCalls: toolCalls,
                    timestamp: Date.now()
                });

                // Append each tool result so next turn LLM can observe the results
                toolCalls.forEach((call, idx) => {
                    const result = executedResults[idx] || { success: true };
                    this.messages.push({
                        id: (Date.now() + loopCount * 10 + idx).toString(),
                        role: 'tool',
                        tool_call_id: call.id || `call_${Date.now()}_${idx}`,
                        name: call.function?.name || call.name,
                        content: JSON.stringify(result),
                        timestamp: Date.now()
                    });
                });

                this.saveHistory();
                this.renderMessages();

                if (this.abortController?.signal?.aborted) {
                    break;
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                this.onShowToast("已取消生成", "info");
            } else {
                console.error("AI Chat/Agent Error:", err);
                this.onShowToast(`请求失败: ${err.message}`, "error");
            }
        } finally {
            this.setLoading(false);
            this.abortController = null;
            this.renderMessages();
        }
    }

    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.setLoading(false);
        this.renderMessages();
    }

    setLoading(loading) {
        this.isLoading = loading;
        if (this.sendBtnEl) {
            this.sendBtnEl.classList.toggle('hidden', loading);
        }
        if (this.stopBtnEl) {
            this.stopBtnEl.classList.toggle('hidden', !loading);
        }
    }

    handleQuickPrompt(action) {
        const currentPrompt = typeof document !== 'undefined' ? document.getElementById('prompt')?.value.trim() : '';
        let query = '';

        switch (action) {
            case 'optimize':
                if (currentPrompt) {
                    query = `请优化以下 NovelAI 提示词，增加更丰富的画风、细节、光影和构图标签，并清理冲突重复词：\n${currentPrompt}`;
                } else {
                    query = `请帮我设计一组高质量的 NovelAI 唯美二次元角色提示词（包含人物特征、服装、光影与背景）。`;
                }
                break;
            case 'anime_character':
                query = `请为我设计一个极具辨识度的二次元动漫美少女角色（包含发型、瞳色、服装材质、表情与动作）的高质量 Danbooru 英文提示词。`;
                break;
            case 'outfit':
                query = `请设计一套华丽、细节丰富的服装搭配（如洛丽塔、机能风、幻想礼服或现代时尚），输出成适合 NovelAI 的详细英文标签。`;
                break;
            case 'scenery':
                query = `请生成一组震撼唯美的背景与环境光影提示词（如赛博朋克雨夜、梦幻星空云海、黄昏樱花落叶），输出纯正英文标签。`;
                break;
            case 'danbooru':
                if (currentPrompt) {
                    query = `请将以下中文描述精确翻译并转换为标准的 Danbooru 英文标签格式（逗号分隔）：\n${currentPrompt}`;
                } else {
                    query = `请教我如何把中文角色想法拆解为最标准、权重合理的 Danbooru 英文标签。`;
                }
                break;
            case 'negative':
                query = `针对高质量二次元插画生成，请推荐一套最常用、最干净高效的负向提示词 (Negative Prompt)，并简要说明作用。`;
                break;
            default:
                query = action;
        }

        this.handleSendMessage(query);
    }

    clearHistory() {
        if (this.messages.length === 0) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (!window.confirm('确定要清空与 AI 的全部对话记录吗？')) return;
        }
        
        this.messages = [];
        this.saveHistory();
        this.renderMessages();
        this.onShowToast("对话记录已清空", "info");
    }

    /**
     * Extracts prompt text from message or code blocks
     * @param {string} rawContent 
     * @param {number|null} blockIdx 
     */
    extractPrompt(rawContent, blockIdx = null) {
        if (!rawContent) return '';
        
        // Extract all code blocks
        const codeBlocks = [];
        rawContent.replace(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g, (match, code) => {
            codeBlocks.push(code.trim());
            return match;
        });

        if (blockIdx !== null && codeBlocks[blockIdx] !== undefined) {
            return codeBlocks[blockIdx];
        }

        if (codeBlocks.length > 0) {
            return codeBlocks[0];
        }

        return rawContent.trim();
    }

    applyPromptByMessage(msgIdx, mode = 'replace') {
        const msg = this.messages[msgIdx];
        if (!msg) return;
        const text = this.extractPrompt(msg.content);
        this.applyToCanvas(text, mode);
    }

    applyPromptFromBlock(msgIdx, blockIdx, mode = 'replace') {
        const msg = this.messages[msgIdx];
        if (!msg) return;
        const text = this.extractPrompt(msg.content, blockIdx);
        this.applyToCanvas(text, mode);
    }

    applyToCanvas(text, mode = 'replace') {
        if (!text) return;
        const promptInput = typeof document !== 'undefined' ? document.getElementById('prompt') : null;
        if (!promptInput) return;

        if (mode === 'append') {
            const existing = promptInput.value.trim();
            promptInput.value = existing ? `${existing}, ${text}` : text;
        } else {
            promptInput.value = text;
        }

        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        this.onShowToast(mode === 'append' ? "已追加至正向提示词" : "已填入正向提示词", "success");
    }

    copyMessageText(btn, msgIdx, blockIdx = null) {
        const msg = this.messages[msgIdx];
        if (!msg) return;
        const text = this.extractPrompt(msg.content, blockIdx);
        if (!text) return;

        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                this.onShowToast("已复制到剪贴板", "success");
                if (btn) {
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-500"></i> 已复制`;
                    if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
                    }, 1500);
                }
            }).catch(err => {
                console.error("Clipboard copy error:", err);
                this.onShowToast("复制失败", "error");
            });
        }
    }

    switchImageVersion(msgIdx, tcIdx, delta) {
        const msg = this.messages[msgIdx];
        if (!msg || !msg.tool_calls || !msg.tool_calls[tcIdx]) return;
        const tc = msg.tool_calls[tcIdx];
        if (!Array.isArray(tc.images) || tc.images.length <= 1) return;

        const len = tc.images.length;
        let nextIdx = ((tc.currentIndex !== undefined ? tc.currentIndex : len - 1) + delta) % len;
        if (nextIdx < 0) nextIdx += len;
        tc.currentIndex = nextIdx;

        // Synchronize top-level fields for backwards compatibility
        const cur = tc.images[nextIdx];
        tc.imageUrl = cur.imageUrl;
        tc.seed = cur.seed;
        tc.width = cur.width;
        tc.height = cur.height;
        tc.model = cur.model;
        tc.prompt = cur.prompt;
        tc.negative_prompt = cur.negative_prompt;
        tc.steps = cur.steps;
        tc.scale = cur.scale;
        tc.sampler = cur.sampler;
        tc.meta = cur.meta;
        tc.isSavedToHistory = Boolean(cur.isSavedToHistory);
        if (cur.id) tc.id = cur.id;

        this.saveHistory();
        this.renderMessages();
    }

    openChatImageLightbox(msgIdx, tcIdx) {
        const msg = this.messages[msgIdx];
        if (!msg || !msg.tool_calls || !msg.tool_calls[tcIdx]) return;
        const tc = msg.tool_calls[tcIdx];

        let currentImg = tc;
        if (Array.isArray(tc.images) && tc.images.length > 0) {
            const idx = (typeof tc.currentIndex === 'number' && tc.currentIndex >= 0 && tc.currentIndex < tc.images.length)
                ? tc.currentIndex
                : tc.images.length - 1;
            currentImg = tc.images[idx];
        }

        const item = {
            id: currentImg.id || tc.id || `chat_${msgIdx}_${tcIdx}`,
            image: currentImg.imageUrl,
            imageUrl: currentImg.imageUrl,
            prompt: currentImg.prompt || tc.prompt || '',
            negative_prompt: currentImg.negative_prompt || tc.negative_prompt || '',
            model: currentImg.model || tc.model || 'v5',
            isSavedToHistory: Boolean(currentImg.isSavedToHistory),
            meta: currentImg.meta || {
                width: currentImg.width || tc.width,
                height: currentImg.height || tc.height,
                steps: currentImg.steps || tc.steps,
                scale: currentImg.scale || tc.scale,
                sampler: currentImg.sampler || tc.sampler,
                seed: currentImg.seed !== undefined ? currentImg.seed : tc.seed,
                negative_prompt: currentImg.negative_prompt || tc.negative_prompt || ''
            }
        };
        if (typeof window !== 'undefined' && typeof window.openLightbox === 'function') {
            window.openLightbox(item);
        } else if (typeof window !== 'undefined') {
            window.open(currentImg.imageUrl, '_blank');
        }
    }

    async saveImageToGallery(msgIdx, tcIdx, btnEl = null) {
        const msg = this.messages[msgIdx];
        if (!msg || !msg.tool_calls || !msg.tool_calls[tcIdx]) return;
        const tc = msg.tool_calls[tcIdx];

        let currentImg = tc;
        if (Array.isArray(tc.images) && tc.images.length > 0) {
            const idx = (typeof tc.currentIndex === 'number' && tc.currentIndex >= 0 && tc.currentIndex < tc.images.length)
                ? tc.currentIndex
                : tc.images.length - 1;
            currentImg = tc.images[idx];
        }

        if (currentImg.isSavedToHistory) return;

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> 保存中...`;
            if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
        }

        try {
            if (typeof window !== 'undefined' && typeof window.saveImageItemToGallery === 'function') {
                const saved = await window.saveImageItemToGallery({
                    imageUrl: currentImg.imageUrl,
                    image: currentImg.imageUrl,
                    prompt: currentImg.prompt || tc.prompt,
                    model: currentImg.model || tc.model,
                    meta: currentImg.meta || {
                        width: currentImg.width || tc.width,
                        height: currentImg.height || tc.height,
                        steps: currentImg.steps || tc.steps,
                        scale: currentImg.scale || tc.scale,
                        sampler: currentImg.sampler || tc.sampler,
                        seed: currentImg.seed !== undefined ? currentImg.seed : tc.seed,
                        negative_prompt: currentImg.negative_prompt || tc.negative_prompt || ''
                    }
                });
                currentImg.isSavedToHistory = true;
                if (saved?.id) currentImg.id = saved.id;

                // If currentImg is the active version, sync root tc
                if (tc.images && tc.currentIndex === tc.images.indexOf(currentImg)) {
                    tc.isSavedToHistory = true;
                    if (saved?.id) tc.id = saved.id;
                }
                this.saveHistory();
                this.renderMessages();
            }
        } catch (err) {
            console.error("保存图片至画廊失败:", err);
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = `<i data-lucide="bookmark" class="w-3 h-3"></i> 保存`;
                if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            }
        }
    }

    async regenerateFromChatImage(msgIdx, tcIdx) {
        const msg = this.messages[msgIdx];
        if (!msg || !msg.tool_calls || !msg.tool_calls[tcIdx]) return;
        const tc = msg.tool_calls[tcIdx];
        if (tc.isRegenerating) return;

        // Ensure tc.images normalized
        if (!Array.isArray(tc.images) || tc.images.length === 0) {
            tc.images = [{
                imageUrl: tc.imageUrl,
                seed: tc.seed,
                width: tc.width,
                height: tc.height,
                model: tc.model,
                prompt: tc.prompt,
                negative_prompt: tc.negative_prompt,
                steps: tc.steps,
                scale: tc.scale,
                sampler: tc.sampler,
                meta: tc.meta,
                isSavedToHistory: Boolean(tc.isSavedToHistory),
                id: tc.id || null
            }];
            tc.currentIndex = 0;
        }

        const curImg = (typeof tc.currentIndex === 'number' && tc.images[tc.currentIndex])
            ? tc.images[tc.currentIndex]
            : tc.images[tc.images.length - 1];

        const prompt = curImg.prompt || tc.prompt || '';
        const negative = curImg.negative_prompt || tc.negative_prompt || '';
        const model = curImg.model || tc.model || 'v5';
        const width = curImg.width || tc.width || 832;
        const height = curImg.height || tc.height || 1216;
        const steps = Math.min(curImg.steps || tc.steps || 28, 28);
        const scale = curImg.scale || tc.scale || 5.0;

        tc.isRegenerating = true;
        this.renderMessages();

        try {
            let genResult = null;
            if (this.onGenerateImage) {
                genResult = await this.onGenerateImage({
                    prompt,
                    negative,
                    model,
                    width,
                    height,
                    steps,
                    scale,
                    skipSaveHistory: true
                });
            } else if (typeof window !== 'undefined' && typeof window.doGenerate === 'function') {
                genResult = await window.doGenerate({
                    prompt,
                    negative,
                    model,
                    width,
                    height,
                    steps,
                    scale,
                    skipSaveHistory: true
                });
            }

            if (!genResult || genResult.success === false) {
                throw new Error(genResult?.error || '图像重新生成未成功完成');
            }

            const imageUrl = genResult.imageUrl || (genResult.results && genResult.results[0]?.imageUrl) || '';
            const seed = genResult.seed !== undefined ? genResult.seed : '随机';
            const w = genResult.width || width;
            const h = genResult.height || height;
            const resultModel = genResult.model || model;
            const resultMeta = genResult.meta || {
                width: w,
                height: h,
                steps,
                scale,
                sampler: genResult.sampler,
                seed,
                negative_prompt: negative
            };

            const newVersion = {
                imageUrl,
                seed,
                width: w,
                height: h,
                model: resultModel,
                prompt,
                negative_prompt: negative,
                steps,
                scale,
                sampler: genResult.sampler,
                meta: resultMeta,
                isSavedToHistory: false,
                id: null
            };

            tc.images.push(newVersion);
            tc.currentIndex = tc.images.length - 1;

            // Sync top-level fields
            tc.imageUrl = imageUrl;
            tc.seed = seed;
            tc.width = w;
            tc.height = h;
            tc.model = resultModel;
            tc.meta = resultMeta;
            tc.isSavedToHistory = false;
            tc.message = `图像生成成功! (共 ${tc.images.length} 个版本, 当前 Seed: ${seed})`;

            if (this.onShowToast) {
                this.onShowToast(`已在原位生成新版本 (Seed: ${seed})`, "success");
            }
        } catch (err) {
            console.error("原位重新生成失败:", err);
            if (this.onShowToast) {
                this.onShowToast(`重新生成失败: ${err.message}`, "error");
            }
        } finally {
            tc.isRegenerating = false;
            this.saveHistory();
            this.renderMessages();
        }
    }
}

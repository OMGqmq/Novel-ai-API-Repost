/**
 * AI Chat Manager Module
 * Manages full interactive multi-turn AI chat conversation, inline API key configuration,
 * message rendering, quick prompt optimization, and applying prompts back to the canvas.
 */
import { AI_PROVIDER_PRESETS, AI_SYSTEM_PROMPTS } from './ai-helper-service.js';

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
        window.applyAiPromptToCanvas = (msgIdx, mode) => this.applyPromptByMessage(msgIdx, mode);
        window.applyAiPromptFromBlock = (msgIdx, blockIdx, mode) => this.applyPromptFromBlock(msgIdx, blockIdx, mode);
        window.copyAiChatMessage = (btn, msgIdx, blockIdx = null) => this.copyMessageText(btn, msgIdx, blockIdx);

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

        this.service.saveSettings({ baseUrl, apiKey, model, systemPrompt });

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

        this.onShowToast("AI 对话助手配置已保存", "success");
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

    renderMessages() {
        if (!this.messagesContainerEl) return;

        if (this.messages.length === 0 && !this.isLoading) {
            this.messagesContainerEl.innerHTML = `
                <div class="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-4 sm:p-6 space-y-3 opacity-60">
                    <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl sm:rounded-3xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-inner">
                        <i data-lucide="bot-message-square" class="w-6 h-6 sm:w-7 sm:h-7"></i>
                    </div>
                    <div class="space-y-1">
                        <h4 class="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200">AI 提示词创作助手</h4>
                        <p class="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                            构思角色设定、丰富场景光影、一键生成/优化 NovelAI Danbooru 英文提示词。
                        </p>
                    </div>
                </div>
            `;
            if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
            return;
        }

        let html = this.messages.map((m, idx) => {
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
                const renderedContent = renderMessageMarkdown(m.content, idx);
                return `
                    <div class="flex justify-start gap-2 sm:gap-2.5 message-assistant group">
                        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5 border border-purple-200/50 dark:border-purple-800/40 shadow-xs">
                            <i data-lucide="sparkles" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                        </div>
                        <div class="max-w-[92%] sm:max-w-[85%] space-y-1.5">
                            <div class="bg-gray-100/90 dark:bg-slate-800/90 text-gray-800 dark:text-gray-100 rounded-2xl rounded-tl-sm px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-[13px] shadow-sm leading-relaxed select-text border border-gray-200/50 dark:border-slate-700/50 break-words">
                                ${renderedContent}
                            </div>
                            <!-- Action buttons -->
                            <div class="flex items-center gap-1.5 px-0.5 text-[11px] flex-wrap">
                                <button onclick="window.applyAiPromptToCanvas(${idx}, 'replace')" class="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 touch-manipulation">
                                    <i data-lucide="wand-2" class="w-3 h-3"></i> 填入提示词
                                </button>
                                <button onclick="window.applyAiPromptToCanvas(${idx}, 'append')" class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 touch-manipulation">
                                    <i data-lucide="plus" class="w-3 h-3"></i> 追加
                                </button>
                                <button onclick="window.copyAiChatMessage(this, ${idx})" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1 transition-colors py-0.5 px-2 rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-700/40 touch-manipulation">
                                    <i data-lucide="copy" class="w-3 h-3"></i> 复制
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }).join('');

        // Loading thinking indicator
        if (this.isLoading) {
            html += `
                <div class="flex justify-start gap-2 sm:gap-2.5 message-assistant message-thinking">
                    <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5 border border-purple-200/50 dark:border-purple-800/40">
                        <i data-lucide="sparkles" class="w-3.5 h-3.5 animate-spin"></i>
                    </div>
                    <div class="bg-gray-100/90 dark:bg-slate-800/90 text-gray-600 dark:text-gray-300 rounded-2xl rounded-tl-sm px-3.5 sm:px-4 py-2.5 text-xs shadow-sm border border-gray-200/50 dark:border-slate-700/50 flex items-center gap-2">
                        <div class="flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 0ms"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 150ms"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 300ms"></span>
                        </div>
                        <span class="text-[11px]">AI 正在思考并构思提示词...</span>
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

        // Attach canvas prompt if requested
        if (this.includePromptCheckbox && this.includePromptCheckbox.checked && !customPromptText) {
            const currentPrompt = typeof document !== 'undefined' ? document.getElementById('prompt')?.value.trim() : '';
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
            const responseText = await this.service.chat(
                this.messages.map(m => ({ role: m.role, content: m.content })),
                { signal: this.abortController?.signal }
            );

            this.messages.push({
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now()
            });

            this.saveHistory();
        } catch (err) {
            if (err.name === 'AbortError') {
                this.onShowToast("已取消生成", "info");
            } else {
                console.error("AI Chat Error:", err);
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
}

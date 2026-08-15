/**
 * AI Chat Manager Module
 * Manages full interactive multi-turn AI chat conversation, inline API key configuration,
 * message rendering, quick prompt optimization, and applying prompts back to the canvas.
 */
import { AI_PROVIDER_PRESETS, AI_SYSTEM_PROMPTS } from './ai-helper-service.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderMessageMarkdown(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    
    // Format code blocks ```...```
    escaped = escaped.replace(/```([\s\S]*?)```/g, (match, p1) => {
        return `<pre class="bg-slate-900 text-slate-100 dark:bg-slate-950 p-3 rounded-xl font-mono text-xs my-2 overflow-x-auto select-text border border-slate-700/50">${p1.trim()}</pre>`;
    });

    // Format inline code `...`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded font-mono text-xs select-text">$1</code>');

    // Format bold **...**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-gray-100">$1</strong>');

    // Format newlines
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
}

export class AiChatManager {
    constructor(config = {}) {
        this.service = config.service;
        this.onApplyPrompt = config.onApplyPrompt || (() => {});
        this.onShowToast = config.onShowToast || ((msg, type) => {
            if (window.showToast) window.showToast(msg, type);
            else console.log(`[Toast] ${type}: ${msg}`);
        });

        this.modalEl = document.getElementById('aiChatModal');
        this.messagesContainerEl = document.getElementById('aiChatMessages');
        this.inputEl = document.getElementById('aiChatInput');
        this.sendBtnEl = document.getElementById('aiChatSendBtn');
        this.stopBtnEl = document.getElementById('aiChatStopBtn');
        this.settingsDrawerEl = document.getElementById('aiChatSettingsDrawer');
        this.modelBadgeEl = document.getElementById('aiChatModelBadge');
        this.includePromptCheckbox = document.getElementById('aiChatIncludePromptCheckbox');

        // Settings input elements
        this.providerSelectEl = document.getElementById('aiChatProviderSelect');
        this.baseUrlEl = document.getElementById('aiChatBaseUrl');
        this.apiKeyEl = document.getElementById('aiChatApiKey');
        this.modelEl = document.getElementById('aiChatModel');
        this.systemPresetSelectEl = document.getElementById('aiChatSystemPresetSelect');
        this.systemPromptEl = document.getElementById('aiChatSystemPrompt');

        this.messages = [];
        this.isLoading = false;
        this.abortController = null;

        this.loadHistory();
        this.initGlobalBindings();
    }

    initGlobalBindings() {
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
        window.applyAiPromptToCanvas = (text, mode) => this.applyPrompt(text, mode);
        window.copyAiChatMessage = (btn, text) => this.copyMessageText(btn, text);

        if (this.inputEl) {
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }
    }

    loadHistory() {
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
            if (this.inputEl) this.inputEl.focus();
        });

        if (window.lucide) window.lucide.createIcons();
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
        if (window.lucide) window.lucide.createIcons();
    }

    hydrateSettingsInputs() {
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
        const baseUrl = this.baseUrlEl?.value.trim() || 'https://api.openai.com/v1';
        const apiKey = this.apiKeyEl?.value.trim() || '';
        const model = this.modelEl?.value.trim() || 'gpt-4o-mini';
        const systemPrompt = this.systemPromptEl?.value.trim() || this.service.defaultSystemPrompt;

        this.service.saveSettings({ baseUrl, apiKey, model, systemPrompt });

        // Sync with main settings elements if available
        const mainBaseUrl = document.getElementById('aiHelperBaseUrl');
        const mainApiKey = document.getElementById('aiHelperApiKey');
        const mainModel = document.getElementById('aiHelperModel');
        const mainSysPrompt = document.getElementById('aiHelperSystemPrompt');

        if (mainBaseUrl) mainBaseUrl.value = baseUrl;
        if (mainApiKey) mainApiKey.value = apiKey;
        if (mainModel) mainModel.value = model;
        if (mainSysPrompt) mainSysPrompt.value = systemPrompt;

        if (this.modelBadgeEl) this.modelBadgeEl.textContent = model;
        if (this.settingsDrawerEl) this.settingsDrawerEl.classList.add('hidden');

        this.onShowToast("AI 对话助手配置已保存", "success");
    }

    async testConnection() {
        const btn = document.getElementById('aiChatTestBtn');
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

        if (this.messages.length === 0) {
            this.messagesContainerEl.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-60">
                    <div class="w-14 h-14 rounded-3xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-inner">
                        <i data-lucide="bot-message-square" class="w-7 h-7"></i>
                    </div>
                    <div class="space-y-1">
                        <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200">AI 提示词创作助手</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                            支持与大模型自由对话、构思角色设定、优化/生成 NovelAI 高质量 Danbooru 英文提示词。
                        </p>
                    </div>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const html = this.messages.map((m, idx) => {
            const isUser = m.role === 'user';
            if (isUser) {
                return `
                    <div class="flex justify-end gap-2.5 message-user group">
                        <div class="max-w-[85%] bg-purple-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs shadow-md leading-relaxed select-text">
                            ${escapeHtml(m.content).replace(/\n/g, '<br>')}
                        </div>
                    </div>
                `;
            } else {
                const renderedContent = renderMessageMarkdown(m.content);
                const rawText = escapeHtml(m.content).replace(/"/g, '&quot;');
                return `
                    <div class="flex justify-start gap-2.5 message-assistant group">
                        <div class="w-7 h-7 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5 border border-purple-200/50 dark:border-purple-800/40">
                            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                        </div>
                        <div class="max-w-[90%] space-y-2">
                            <div class="bg-gray-100/90 dark:bg-slate-800/90 text-gray-800 dark:text-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-xs shadow-sm leading-relaxed select-text border border-gray-200/50 dark:border-slate-700/50">
                                ${renderedContent}
                            </div>
                            <!-- Action buttons -->
                            <div class="flex items-center gap-2 px-1 text-[11px]">
                                <button onclick="window.applyAiPromptToCanvas(this.getAttribute('data-text'), 'replace')" data-text="${rawText}" class="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40">
                                    <i data-lucide="wand-2" class="w-3 h-3"></i> 填入提示词
                                </button>
                                <button onclick="window.applyAiPromptToCanvas(this.getAttribute('data-text'), 'append')" data-text="${rawText}" class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 font-semibold transition-colors py-0.5 px-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40">
                                    <i data-lucide="plus" class="w-3 h-3"></i> 追加
                                </button>
                                <button onclick="window.copyAiChatMessage(this, this.getAttribute('data-text'))" data-text="${rawText}" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1 transition-colors py-0.5 px-2 rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-700/40">
                                    <i data-lucide="copy" class="w-3 h-3"></i> 复制
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }).join('');

        this.messagesContainerEl.innerHTML = html;
        this.scrollToBottom();
        if (window.lucide) window.lucide.createIcons();
    }

    scrollToBottom() {
        if (!this.messagesContainerEl) return;
        this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
    }

    async handleSendMessage(customPromptText = null) {
        if (this.isLoading) return;

        let userContent = customPromptText || (this.inputEl ? this.inputEl.value.trim() : '');
        if (!userContent) return;

        // Check if API Key is configured
        const settings = this.service.getSettings();
        if (!settings.apiKey) {
            this.toggleSettingsDrawer();
            this.onShowToast("请先配置自定义 AI API Key", "warning");
            return;
        }

        // Attach canvas prompt if requested
        if (this.includePromptCheckbox && this.includePromptCheckbox.checked && !customPromptText) {
            const currentPrompt = document.getElementById('prompt')?.value.trim() || '';
            if (currentPrompt) {
                userContent = `[当前画板提示词: ${currentPrompt}]\n\n${userContent}`;
            }
        }

        if (this.inputEl && !customPromptText) {
            this.inputEl.value = '';
        }

        // Add user message
        this.messages.push({
            id: Date.now().toString(),
            role: 'user',
            content: userContent,
            timestamp: Date.now()
        });

        this.renderMessages();
        this.saveHistory();

        this.setLoading(true);
        this.abortController = new AbortController();

        try {
            const responseText = await this.service.chat(
                this.messages.map(m => ({ role: m.role, content: m.content })),
                { signal: this.abortController.signal }
            );

            this.messages.push({
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now()
            });

            this.saveHistory();
            this.renderMessages();
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
        }
    }

    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.setLoading(false);
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
        const currentPrompt = document.getElementById('prompt')?.value.trim() || '';
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
        this.messages = [];
        this.saveHistory();
        this.renderMessages();
        this.onShowToast("对话记录已清空", "info");
    }

    applyPrompt(text, mode = 'replace') {
        if (!text) return;

        // Clean text: if there is a code block, extract the content of the code block
        let cleanText = text;
        const codeBlockMatch = text.match(/```(?:tags|prompt)?\s*([\s\S]*?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            cleanText = codeBlockMatch[1].trim();
        }

        const promptInput = document.getElementById('prompt');
        if (!promptInput) return;

        if (mode === 'append') {
            const existing = promptInput.value.trim();
            promptInput.value = existing ? `${existing}, ${cleanText}` : cleanText;
        } else {
            promptInput.value = cleanText;
        }

        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        this.onShowToast(mode === 'append' ? "已追加至正向提示词" : "已填入正向提示词", "success");
    }

    copyMessageText(btn, text) {
        if (!text) return;
        let cleanText = text;
        const codeBlockMatch = text.match(/```(?:tags|prompt)?\s*([\s\S]*?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            cleanText = codeBlockMatch[1].trim();
        }

        navigator.clipboard.writeText(cleanText).then(() => {
            this.onShowToast("已复制到剪贴板", "success");
            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-500"></i> 已复制`;
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
            }
        }).catch(err => {
            console.error("Clipboard copy error:", err);
            this.onShowToast("复制失败", "error");
        });
    }
}

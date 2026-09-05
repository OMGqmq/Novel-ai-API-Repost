/**
 * AI Chat & Prompt Helper Service
 * Manages LLM configuration and multi-turn chat / prompt generation requests.
 */

export const AI_PROVIDER_PRESETS = {
    deepseek: {
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat"
    },
    siliconflow: {
        name: "SiliconFlow 硅基流动",
        baseUrl: "https://api.siliconflow.cn/v1",
        model: "deepseek-ai/DeepSeek-V3"
    },
    openrouter: {
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "deepseek/deepseek-r1"
    },
    openai: {
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini"
    },
    ollama: {
        name: "Ollama (本地)",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3"
    },
    custom: {
        name: "自定义",
        baseUrl: "",
        model: ""
    }
};

export const AI_SYSTEM_PROMPTS = {
    novelai_master: {
        name: "NovelAI 提示词大师",
        prompt: "You are an expert AI prompt generator specializing in Stable Diffusion and NovelAI anime art. When the user asks for prompt ideas or optimizations, provide creative, highly aesthetic, detailed prompt tags (Danbooru style: masterpiece, best quality, aesthetic tags, character features, clothing, composition, lighting). Format final prompts clearly so the user can easily copy and apply them."
    },
    creative_artist: {
        name: "二次元创意原画师",
        prompt: "你是一位资深的二次元概念设计师与提示词专家。用户会用中文描述角色构思或场景想法。你需要展开生动的视觉细节（人物发型、服饰层级、动作神态、环境光影），并将其转化为专业、精准的高质量英文 Danbooru 提示词。"
    },
    refine_tags: {
        name: "提示词精简与除重",
        prompt: "你是一位严谨的提示词整理与除重专家。分析用户提供的提示词，去除冗余和冲突词汇，按照（画质词 -> 主体 -> 服饰动作 -> 背景光影）合理组织顺序，输出最精炼高效的英文提示词。"
    },
    free_chat: {
        name: "自由二次元创作助手",
        prompt: "你是一个友好、知识渊博的二次元创作助手。你可以与用户自由交流动漫角色设定、视觉创意、世界观构思、色彩搭配以及绘图技巧。"
    }
};

export class AiHelperService {
    constructor(store) {
        this.store = store;
        this.defaultSystemPrompt = AI_SYSTEM_PROMPTS.novelai_master.prompt;
    }

    getSettings() {
        return {
            baseUrl: this.store.getSetting('ai_helper_base_url', 'https://api.openai.com/v1'),
            apiKey: this.store.getSetting('ai_helper_api_key', ''),
            model: this.store.getSetting('ai_helper_model', 'gpt-4o'),
            systemPrompt: this.store.getSetting('ai_helper_system_prompt', this.defaultSystemPrompt),
            nai5RulesEnabled: this.store.getSetting('ai_agent_nai5_rules', true)
        };
    }

    saveSettings({ baseUrl, apiKey, model, systemPrompt, nai5RulesEnabled }) {
        if (baseUrl !== undefined) this.store.setSetting('ai_helper_base_url', baseUrl);
        if (apiKey !== undefined) this.store.setSetting('ai_helper_api_key', apiKey);
        if (model !== undefined) this.store.setSetting('ai_helper_model', model);
        if (systemPrompt !== undefined) this.store.setSetting('ai_helper_system_prompt', systemPrompt);
        if (nai5RulesEnabled !== undefined) this.store.setSetting('ai_agent_nai5_rules', Boolean(nai5RulesEnabled));
    }

    /**
     * Legacy single-shot prompt generation
     */
    async generatePrompt(userIdea) {
        const { baseUrl, apiKey, model, systemPrompt } = this.getSettings();
        if (!apiKey) {
            throw new Error("请先在设置中配置 AI 提示词助手的 API Key");
        }

        const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userIdea }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI API 错误 (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error("API 未返回有效内容");
        }
        return content.trim();
    }

    /**
     * Multi-turn chat / Agent tool calling conversation
     * @param {Array<{role: string, content: string}>} messages 
     * @param {Object} options 
     */
    async chat(messages, options = {}) {
        const { baseUrl, apiKey, model, systemPrompt: defaultSysPrompt } = this.getSettings();
        const effectiveApiKey = options.apiKey !== undefined ? options.apiKey : apiKey;
        const effectiveBaseUrl = options.baseUrl || baseUrl;
        const effectiveModel = options.model || model;
        const effectiveSysPrompt = options.systemPrompt || defaultSysPrompt;

        if (!effectiveApiKey) {
            throw new Error("请先配置自定义 AI API Key");
        }

        const cleanUrl = effectiveBaseUrl.endsWith('/') ? effectiveBaseUrl.slice(0, -1) : effectiveBaseUrl;
        
        // Prepare message history with system prompt
        const requestMessages = [];
        if (effectiveSysPrompt) {
            requestMessages.push({ role: 'system', content: effectiveSysPrompt });
        }
        for (const m of messages) {
            if (!m || !m.role) continue;
            const item = { role: m.role };
            if (m.role === 'assistant') {
                item.content = m.content !== undefined ? m.content : null;
                if (m.rawToolCalls && Array.isArray(m.rawToolCalls) && m.rawToolCalls.length > 0) {
                    item.tool_calls = m.rawToolCalls;
                    if (!item.content) item.content = null;
                } else if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
                    // Check if tool_calls are native OpenAI format
                    if (m.tool_calls[0] && m.tool_calls[0].id && m.tool_calls[0].type === 'function') {
                        item.tool_calls = m.tool_calls;
                        if (!item.content) item.content = null;
                    }
                }
            } else if (m.role === 'tool') {
                item.tool_call_id = m.tool_call_id || m.id || 'call_0';
                item.content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || {});
                if (m.name) item.name = m.name;
            } else {
                item.content = m.content || '';
            }
            requestMessages.push(item);
        }

        const requestBody = {
            model: effectiveModel,
            messages: requestMessages,
            temperature: options.temperature !== undefined ? options.temperature : 0.7
        };

        if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
            requestBody.tools = options.tools;
            requestBody.tool_choice = options.tool_choice || 'auto';
        }

        const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${effectiveApiKey}`
            },
            signal: options.signal,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI API 错误 (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const choice = data?.choices?.[0];
        const message = choice?.message;
        if (!message) {
            throw new Error("API 未返回有效内容");
        }

        if (options.tools || options.returnFullMessage) {
            return {
                content: (message.content || '').trim(),
                tool_calls: message.tool_calls || []
            };
        }

        const content = message.content;
        if (!content) {
            throw new Error("API 未返回有效内容");
        }
        return content.trim();
    }
}

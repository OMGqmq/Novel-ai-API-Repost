/**
 * AI Prompt Helper Service
 * Manages LLM configuration and prompt generation requests.
 */
export class AiHelperService {
    constructor(store) {
        this.store = store;
        this.defaultSystemPrompt = "You are an expert AI prompt generator specializing in Stable Diffusion and NovelAI. The user will provide a simple idea or prompt in Chinese or English. Expand it into a high-quality, highly detailed drawing prompt in English using relevant aesthetic tags (e.g. masterpiece, high quality, highly detailed) and descriptive text. Output ONLY the final expanded prompt. Do not include any greeting, intro, explanation, or markdown formatting.";
    }

    getSettings() {
        return {
            baseUrl: this.store.getSetting('ai_helper_base_url', 'https://api.openai.com/v1'),
            apiKey: this.store.getSetting('ai_helper_api_key', ''),
            model: this.store.getSetting('ai_helper_model', 'gpt-4o'),
            systemPrompt: this.store.getSetting('ai_helper_system_prompt', this.defaultSystemPrompt)
        };
    }

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
}

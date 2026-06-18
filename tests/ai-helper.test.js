import { describe, it, expect, vi } from 'vitest';
import { AiHelperService } from '../src/ai-helper-service.js';

describe('AiHelperService Configuration', () => {
  it('should initialize with default configuration when no settings exist', () => {
    // Mock the store
    const mockStore = {
      settings: {},
      getSetting(key, defaultValue) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
      },
      setSetting(key, value) {
        this.settings[key] = value;
      }
    };

    const service = new AiHelperService(mockStore);
    const settings = service.getSettings();

    expect(settings.baseUrl).toBe('https://api.openai.com/v1');
    expect(settings.apiKey).toBe('');
    expect(settings.model).toBe('gpt-4o');
    expect(settings.systemPrompt).toContain('You are an expert AI prompt generator');
  });

  it('should throw an error when apiKey is missing on prompt generation', async () => {
    const mockStore = {
      getSetting(key, defaultValue) {
        if (key === 'ai_helper_api_key') return '';
        return defaultValue;
      }
    };
    const service = new AiHelperService(mockStore);
    await expect(service.generatePrompt('test idea')).rejects.toThrow('请先在设置中配置 AI 提示词助手的 API Key');
  });

  it('should call fetch with correct arguments and return generated prompt', async () => {
    const mockStore = {
      settings: {
        ai_helper_base_url: 'https://custom-api.com/v1/',
        ai_helper_api_key: 'sk-test-key',
        ai_helper_model: 'deepseek-chat',
        ai_helper_system_prompt: 'system instruction'
      },
      getSetting(key, defaultValue) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
      }
    };

    const mockResponseData = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: '  beautiful anime girl, masterpiece, highly detailed  '
          }
        }
      ]
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponseData
    });
    global.fetch = fetchMock;

    const service = new AiHelperService(mockStore);
    const result = await service.generatePrompt('girl');

    expect(result).toBe('beautiful anime girl, masterpiece, highly detailed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://custom-api.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-test-key'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'system instruction' },
          { role: 'user', content: 'girl' }
        ],
        temperature: 0.7
      })
    });
  });

  it('should throw error when api returns non-ok status', async () => {
    const mockStore = {
      settings: {
        ai_helper_base_url: 'https://api.openai.com/v1',
        ai_helper_api_key: 'sk-test-key',
        ai_helper_model: 'gpt-4o',
        ai_helper_system_prompt: 'system'
      },
      getSetting(key, defaultValue) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
      }
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    });
    global.fetch = fetchMock;

    const service = new AiHelperService(mockStore);
    await expect(service.generatePrompt('girl')).rejects.toThrow('AI API 错误 (500): Internal Server Error');
  });
});

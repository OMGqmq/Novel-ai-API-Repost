import { describe, it, expect, vi } from 'vitest';
import {
  AGENT_TOOLS,
  resolveCharacterPosition,
  executeToolCall,
  parseToolCallsFromText
} from '../src/ai-agent-tools.js';
import { NAI5_PROMPT_RULES } from '../src/nai5-rules.js';
import { AiHelperService } from '../src/ai-helper-service.js';

describe('NovelAI Agent Tools & Positioning Suite', () => {
  describe('1. Schema Validation', () => {
    it('should declare both update_prompt and add_character tools in AGENT_TOOLS', () => {
      expect(AGENT_TOOLS).toHaveLength(2);
      const names = AGENT_TOOLS.map(t => t.function.name);
      expect(names).toContain('update_prompt');
      expect(names).toContain('add_character');

      const updateTool = AGENT_TOOLS.find(t => t.function.name === 'update_prompt');
      expect(updateTool.function.parameters.required).toContain('prompt');
      expect(updateTool.function.parameters.properties.mode.enum).toEqual(['replace', 'append']);

      const charTool = AGENT_TOOLS.find(t => t.function.name === 'add_character');
      expect(charTool.function.parameters.required).toContain('prompt');
      expect(charTool.function.description).toContain('V3');
      expect(charTool.function.description).toContain('V4.5');
      expect(charTool.function.description).toContain('V5');
    });
  });

  describe('2. Model-Aware Position Resolution (V3, V4.5, V5)', () => {
    it('should reject character addition on V3 model with clear error', () => {
      const v3Res = resolveCharacterPosition('v3', 'center');
      expect(v3Res.supported).toBe(false);
      expect(v3Res.error).toContain('V3 架构不支持独立角色');

      const v3AltRes = resolveCharacterPosition('nai-diffusion-3', { x: 0.5, y: 0.5 });
      expect(v3AltRes.supported).toBe(false);
    });

    it('should correctly snap positions to 5x5 grid cells in V4.5', () => {
      // Grid code A1 (top-left) -> col 0, row 0 -> center: (0*2+1)/10 = 0.1, 0.1
      const a1Res = resolveCharacterPosition('v4.5', 'A1');
      expect(a1Res.supported).toBe(true);
      expect(a1Res.model).toBe('v4.5');
      expect(a1Res.x).toBeCloseTo(0.1);
      expect(a1Res.y).toBeCloseTo(0.1);
      expect(a1Res.gridName).toBe('A1');
      expect(a1Res.autoPos).toBe(false);

      // Grid code C3 (center) -> col 2, row 2 -> 0.5, 0.5
      const c3Res = resolveCharacterPosition('v4.5', 'c3');
      expect(c3Res.supported).toBe(true);
      expect(c3Res.x).toBeCloseTo(0.5);
      expect(c3Res.y).toBeCloseTo(0.5);
      expect(c3Res.gridName).toBe('C3');

      // Grid code E5 (bottom-right) -> col 4, row 4 -> 0.9, 0.9
      const e5Res = resolveCharacterPosition('v4.5', 'E5');
      expect(e5Res.supported).toBe(true);
      expect(e5Res.x).toBeCloseTo(0.9);
      expect(e5Res.y).toBeCloseTo(0.9);
      expect(e5Res.gridName).toBe('E5');

      // Directional words: "left" -> col 1 (B3, x: 0.3, y: 0.5)
      const leftRes = resolveCharacterPosition('v4.5', 'left');
      expect(leftRes.supported).toBe(true);
      expect(leftRes.x).toBeCloseTo(0.3);
      expect(leftRes.y).toBeCloseTo(0.5);
      expect(leftRes.gridName).toBe('B3');

      // Arbitrary continuous coords in V4.5 -> snapped to nearest 5x5 grid
      const snapRes = resolveCharacterPosition('v4.5', { x: 0.22, y: 0.78 });
      expect(snapRes.supported).toBe(true);
      expect(snapRes.x).toBeCloseTo(0.3); // col 1: 0.3
      expect(snapRes.y).toBeCloseTo(0.7); // row 3: 0.7
      expect(snapRes.gridName).toBe('B4');

      // Default autoPos when no position is passed
      const autoRes = resolveCharacterPosition('v4.5', null);
      expect(autoRes.autoPos).toBe(true);
      expect(autoRes.label).toBe('自动排布');
    });

    it('should retain continuous 2D free coordinates in V5', () => {
      // Continuous float coordinates
      const floatRes = resolveCharacterPosition('v5', { x: 0.234, y: 0.876 });
      expect(floatRes.supported).toBe(true);
      expect(floatRes.model).toBe('v5');
      expect(floatRes.x).toBe(0.234);
      expect(floatRes.y).toBe(0.876);
      expect(floatRes.autoPos).toBe(false);

      // Directional words in V5
      const rightRes = resolveCharacterPosition('v5', 'right');
      expect(rightRes.supported).toBe(true);
      expect(rightRes.x).toBe(0.8);
      expect(rightRes.y).toBe(0.5);
      expect(rightRes.label).toContain('靠右');

      // Clamping out-of-bounds coords
      const clampRes = resolveCharacterPosition('v5', { x: -0.5, y: 1.5 });
      expect(clampRes.x).toBe(0.01);
      expect(clampRes.y).toBe(0.99);
    });
  });

  describe('3. Tool Call Execution Engine', () => {
    it('should execute update_prompt with replace and append modes', () => {
      const onUpdatePrompt = vi.fn();

      // Replace mode
      const resReplace = executeToolCall({
        name: 'update_prompt',
        arguments: JSON.stringify({
          prompt: '1girl, silver hair, masterpiece',
          mode: 'replace',
          negative_prompt: 'lowres, bad anatomy'
        })
      }, { onUpdatePrompt });

      expect(resReplace.success).toBe(true);
      expect(resReplace.message).toContain('已替换画板提示词');
      expect(onUpdatePrompt).toHaveBeenCalledWith({
        prompt: '1girl, silver hair, masterpiece',
        mode: 'replace',
        negative: 'lowres, bad anatomy',
        negativeMode: 'replace'
      });

      // Append mode
      const resAppend = executeToolCall({
        name: 'update_prompt',
        arguments: {
          prompt: 'cyberpunk city, neon rain',
          mode: 'append'
        }
      }, { onUpdatePrompt });

      expect(resAppend.success).toBe(true);
      expect(resAppend.message).toContain('已追加画板提示词');
      expect(onUpdatePrompt).toHaveBeenCalledWith({
        prompt: 'cyberpunk city, neon rain',
        mode: 'append',
        negative: '',
        negativeMode: 'replace'
      });
    });

    it('should reject add_character on V3 and succeed on V4.5 and V5', () => {
      const onAddCharacter = vi.fn();

      // V3 call fails
      const resV3 = executeToolCall({
        name: 'add_character',
        arguments: { prompt: '1girl, maid dress' }
      }, { model: 'v3', onAddCharacter });

      expect(resV3.success).toBe(false);
      expect(resV3.error).toContain('V3 架构不支持独立角色');
      expect(onAddCharacter).not.toHaveBeenCalled();

      // V4.5 call succeeds with 5x5 grid snap
      const resV45 = executeToolCall({
        name: 'add_character',
        arguments: {
          prompt: '1girl, red eyes, kimono',
          position: 'A1',
          negative_prompt: 'bad hands'
        }
      }, { model: 'v4.5', onAddCharacter });

      expect(resV45.success).toBe(true);
      expect(resV45.message).toContain('网格 A1');
      expect(onAddCharacter).toHaveBeenCalledWith({
        prompt: '1girl, red eyes, kimono',
        negative: 'bad hands',
        x: 0.1,
        y: 0.1,
        autoPos: false
      });

      // V5 call succeeds with 2D free coordinates
      const resV5 = executeToolCall({
        name: 'add_character',
        arguments: {
          prompt: '1boy, black coat',
          position: { x: 0.35, y: 0.65 }
        }
      }, { model: 'v5', onAddCharacter });

      expect(resV5.success).toBe(true);
      expect(resV5.details.x).toBe(0.35);
      expect(resV5.details.y).toBe(0.65);
      expect(onAddCharacter).toHaveBeenCalledWith({
        prompt: '1boy, black coat',
        negative: '',
        x: 0.35,
        y: 0.65,
        autoPos: false
      });
    });
  });

  describe('4. Text Fallback Parser', () => {
    it('should parse markdown code block tool calls correctly', () => {
      const text = `
Here is what I will do:
\`\`\`tool_call
{
  "name": "update_prompt",
  "arguments": {
    "prompt": "masterpiece, 1girl, glowing eyes",
    "mode": "replace"
  }
}
\`\`\`
I have updated your prompt!
`;
      const calls = parseToolCallsFromText(text);
      expect(calls).toHaveLength(1);
      expect(calls[0].function.name).toBe('update_prompt');
      const parsedArgs = JSON.parse(calls[0].function.arguments);
      expect(parsedArgs.prompt).toBe('masterpiece, 1girl, glowing eyes');
      expect(parsedArgs.mode).toBe('replace');
    });

    it('should parse raw single JSON object representing a tool', () => {
      const rawJson = '{"name": "add_character", "arguments": {"prompt": "1girl, silver hair", "position": "center"}}';
      const calls = parseToolCallsFromText(rawJson);
      expect(calls).toHaveLength(1);
      expect(calls[0].function.name).toBe('add_character');
    });
  });

  describe('5. NAI5 Prompting Rules & AiHelperService Integration', () => {
    it('should contain the core NAI5 prompting doctrine in NAI5_PROMPT_RULES', () => {
      expect(NAI5_PROMPT_RULES).toContain('NAI5 PROMPTING 专家级规则库');
      expect(NAI5_PROMPT_RULES).toContain('编剧');
      expect(NAI5_PROMPT_RULES).toContain('监督');
      expect(NAI5_PROMPT_RULES).toContain('原画');
      expect(NAI5_PROMPT_RULES).toContain('摄影');
      expect(NAI5_PROMPT_RULES).toContain('source# / target#');
      expect(NAI5_PROMPT_RULES).toContain('V3 模型');
      expect(NAI5_PROMPT_RULES).toContain('V4.5 模型');
      expect(NAI5_PROMPT_RULES).toContain('V5 模型');
    });

    it('should manage nai5RulesEnabled setting in AiHelperService', () => {
      const mockStore = {
        settings: {},
        getSetting(key, def) {
          return this.settings[key] !== undefined ? this.settings[key] : def;
        },
        setSetting(key, val) {
          this.settings[key] = val;
        }
      };

      const service = new AiHelperService(mockStore);
      // Default should be true
      expect(service.getSettings().nai5RulesEnabled).toBe(true);

      // Save false
      service.saveSettings({ nai5RulesEnabled: false });
      expect(service.getSettings().nai5RulesEnabled).toBe(false);
      expect(mockStore.settings['ai_agent_nai5_rules']).toBe(false);

      // Save true
      service.saveSettings({ nai5RulesEnabled: true });
      expect(service.getSettings().nai5RulesEnabled).toBe(true);
    });

    it('should pass tools to chat completions and return tool_calls when tools is passed', async () => {
      const mockStore = {
        settings: {
          ai_helper_api_key: 'sk-test-key'
        },
        getSetting(key, def) {
          return this.settings[key] !== undefined ? this.settings[key] : def;
        },
        setSetting(key, val) {
          this.settings[key] = val;
        }
      };

      const mockResponseData = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '已为您添加角色与提示词',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'update_prompt',
                    arguments: '{"prompt":"1girl, blue hair","mode":"replace"}'
                  }
                }
              ]
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
      const res = await service.chat(
        [{ role: 'user', content: '改成蓝发少女' }],
        { tools: AGENT_TOOLS }
      );

      expect(res).toEqual({
        content: '已为您添加角色与提示词',
        tool_calls: mockResponseData.choices[0].message.tool_calls
      });

      const calledBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(calledBody.tools).toEqual(AGENT_TOOLS);
      expect(calledBody.tool_choice).toBe('auto');
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  AGENT_TOOLS,
  resolveCharacterPosition,
  executeToolCall,
  parseToolCallsFromText,
  clampSafeParameters,
  FREE_RESOLUTIONS,
  MAX_FREE_STEPS
} from '../src/ai-agent-tools.js';
import { NAI5_PROMPT_RULES } from '../src/nai5-rules.js';
import { AiHelperService } from '../src/ai-helper-service.js';
import { AiChatManager } from '../src/ai-chat-manager.js';

describe('NovelAI Agent Tools & Positioning Suite', () => {
  describe('1. Schema Validation & Free Quota Guardrails', () => {
    it('should declare full 7-tool suite in AGENT_TOOLS', () => {
      expect(AGENT_TOOLS).toHaveLength(7);
      const names = AGENT_TOOLS.map(t => t.function.name);
      expect(names).toEqual([
        'update_prompt',
        'add_character',
        'remove_character',
        'set_model',
        'set_parameters',
        'get_canvas_state',
        'generate_image'
      ]);

      const updateTool = AGENT_TOOLS.find(t => t.function.name === 'update_prompt');
      expect(updateTool.function.parameters.required).toContain('prompt');
      expect(updateTool.function.parameters.properties.mode.enum).toEqual(['replace', 'append']);

      const charTool = AGENT_TOOLS.find(t => t.function.name === 'add_character');
      expect(charTool.function.parameters.required).toContain('prompt');
      expect(charTool.function.description).toContain('V3');
      expect(charTool.function.description).toContain('V4.5');
      expect(charTool.function.description).toContain('V5');

      const removeCharTool = AGENT_TOOLS.find(t => t.function.name === 'remove_character');
      expect(removeCharTool.function.parameters.required).toContain('index');

      const modelTool = AGENT_TOOLS.find(t => t.function.name === 'set_model');
      expect(modelTool.function.parameters.properties.model.enum).toEqual(['v3', 'v4.5', 'v5', 'zimage']);

      const paramTool = AGENT_TOOLS.find(t => t.function.name === 'set_parameters');
      expect(paramTool.function.description).toContain('普通用户');
      expect(paramTool.function.description).toContain('Anlas');
      expect(paramTool.function.parameters.properties.steps.maximum).toBe(28);

      const genTool = AGENT_TOOLS.find(t => t.function.name === 'generate_image');
      expect(genTool.function.description).toContain('普通用户');
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

  describe('6. Normal User Free Quota Guardrails (Anlas-Safe Clamping)', () => {
    it('should clamp steps > 28 down to MAX_FREE_STEPS (28) and record adjustment message', () => {
      const clamped = clampSafeParameters({ steps: 50 });
      expect(clamped.steps).toBe(28);
      expect(clamped.adjustments).toHaveLength(1);
      expect(clamped.adjustments[0]).toContain('超出免费上限');
      expect(clamped.adjustments[0]).toContain('Anlas');

      const safeSteps = clampSafeParameters({ steps: 24 });
      expect(safeSteps.steps).toBe(24);
      expect(safeSteps.adjustments).toHaveLength(0);
    });

    it('should validate and map aspect_ratio to standard free resolutions', () => {
      const portrait = clampSafeParameters({ aspect_ratio: 'portrait' });
      expect(portrait.width).toBe(832);
      expect(portrait.height).toBe(1216);
      expect(portrait.resValue).toBe('832,1216');

      const landscape = clampSafeParameters({ aspect_ratio: 'landscape' });
      expect(landscape.width).toBe(1216);
      expect(landscape.height).toBe(832);
      expect(landscape.resValue).toBe('1216,832');

      const square = clampSafeParameters({ aspect_ratio: 'square' });
      expect(square.width).toBe(1024);
      expect(square.height).toBe(1024);
      expect(square.resValue).toBe('1024,1024');
    });

    it('should protect against oversized non-standard resolutions that drain Anlas', () => {
      // 1536x2048 is an XL resolution that consumes Anlas -> should clamp to nearest free resolution
      const oversized = clampSafeParameters({ width: 1536, height: 2048 });
      expect(oversized.width).toBe(832);
      expect(oversized.height).toBe(1216);
      expect(oversized.adjustments).toHaveLength(1);
      expect(oversized.adjustments[0]).toContain('超出普通免费区间');
      expect(oversized.adjustments[0]).toContain('Anlas');
    });

    it('should safely clamp scale between 1.0 and 20.0 and sanitize seed', () => {
      const clampedScale = clampSafeParameters({ scale: 25.5, seed: '123456' });
      expect(clampedScale.scale).toBe(20.0);
      expect(clampedScale.seed).toBe(123456);

      const randomSeed = clampSafeParameters({ seed: 'random' });
      expect(randomSeed.seed).toBe('');
    });
  });

  describe('7. Extended Tool Execution Suite', () => {
    it('should execute remove_character for specific index and all', () => {
      const onRemoveCharacter = vi.fn().mockReturnValue({ success: true });

      // Specific index
      const resSingle = executeToolCall({
        name: 'remove_character',
        arguments: { index: 2 }
      }, { onRemoveCharacter });

      expect(resSingle.success).toBe(true);
      expect(resSingle.message).toContain('已移除角色 #2');
      expect(onRemoveCharacter).toHaveBeenCalledWith({ index: 2 });

      // Clear all
      const resAll = executeToolCall({
        name: 'remove_character',
        arguments: { index: 'all' }
      }, { onRemoveCharacter });

      expect(resAll.success).toBe(true);
      expect(resAll.message).toContain('已清空画板上的全部角色');
      expect(onRemoveCharacter).toHaveBeenCalledWith({ index: 'all' });
    });

    it('should execute set_model and reject unsupported versions', () => {
      const onSetModel = vi.fn();

      const resV5 = executeToolCall({
        name: 'set_model',
        arguments: { model: 'v5' }
      }, { onSetModel });

      expect(resV5.success).toBe(true);
      expect(resV5.message).toContain('NovelAI Diffusion V5');
      expect(onSetModel).toHaveBeenCalledWith('v5');

      const resInvalid = executeToolCall({
        name: 'set_model',
        arguments: { model: 'unsupported-model' }
      }, { onSetModel });

      expect(resInvalid.success).toBe(false);
      expect(resInvalid.error).toContain('不支持的模型版本');
    });

    it('should execute set_parameters with automatic Anlas protection', () => {
      const onSetParameters = vi.fn();

      const res = executeToolCall({
        name: 'set_parameters',
        arguments: {
          aspect_ratio: 'portrait',
          steps: 40, // Should be clamped to 28
          scale: 5.5
        }
      }, { onSetParameters });

      expect(res.success).toBe(true);
      expect(res.details.steps).toBe(28);
      expect(res.details.width).toBe(832);
      expect(res.details.height).toBe(1216);
      expect(res.message).toContain('安全保护');
      expect(res.message).toContain('28步');
      expect(onSetParameters).toHaveBeenCalledWith(expect.objectContaining({
        steps: 28,
        width: 832,
        height: 1216
      }));
    });

    it('should execute get_canvas_state', () => {
      const mockState = {
        model: 'v5',
        prompt: '1girl, cyberpunk',
        negative: 'lowres',
        characters: [{ prompt: '1girl' }]
      };
      const res = executeToolCall({
        name: 'get_canvas_state',
        arguments: {}
      }, { getCanvasState: () => mockState });

      expect(res.success).toBe(true);
      expect(res.details).toEqual(mockState);
      expect(res.message).toContain('当前模型: v5');
    });

    it('should execute generate_image asynchronously and return rich output', async () => {
      const onUpdatePrompt = vi.fn();
      const onGenerateImage = vi.fn().mockResolvedValue({
        success: true,
        imageUrl: 'blob:http://localhost/test-image-uuid',
        seed: 987654321,
        width: 832,
        height: 1216
      });

      const resPromise = executeToolCall({
        name: 'generate_image',
        arguments: {
          prompt: '1girl, celestial dragon wings'
        }
      }, { onUpdatePrompt, onGenerateImage });

      expect(resPromise).toBeInstanceOf(Promise);
      const res = await resPromise;

      expect(res.success).toBe(true);
      expect(res.tool).toBe('generate_image');
      expect(res.imageUrl).toBe('blob:http://localhost/test-image-uuid');
      expect(res.seed).toBe(987654321);
      expect(res.message).toContain('图像生成成功');
      expect(onUpdatePrompt).toHaveBeenCalledWith({
        prompt: '1girl, celestial dragon wings',
        mode: 'replace',
        negative: '',
        negativeMode: 'replace'
      });
      expect(onGenerateImage).toHaveBeenCalled();
    });
  });

  describe('8. Autonomous ReAct Tool Loop in AiChatManager', () => {
    it('should execute multi-step tool loop until concluding answer is reached', async () => {
      const mockStore = {
        settings: {
          ai_helper_api_key: 'sk-mock-key'
        },
        getSetting(key, def) {
          return this.settings[key] !== undefined ? this.settings[key] : def;
        },
        setSetting(key, val) {
          this.settings[key] = val;
        }
      };

      // Step 1: Model calls set_parameters and update_prompt
      const step1Response = {
        content: '我先帮您调整参数并更新提示词。',
        tool_calls: [
          {
            id: 'call_step1_1',
            type: 'function',
            function: {
              name: 'set_parameters',
              arguments: JSON.stringify({ aspect_ratio: 'portrait', steps: 28 })
            }
          },
          {
            id: 'call_step1_2',
            type: 'function',
            function: {
              name: 'update_prompt',
              arguments: JSON.stringify({ prompt: '1girl, cat ears, neon city', mode: 'replace' })
            }
          }
        ]
      };

      // Step 2: Model calls generate_image after observing step 1 tool outputs
      const step2Response = {
        content: '参数与提示词已设定完成，现在立即为您生成图像。',
        tool_calls: [
          {
            id: 'call_step2_1',
            type: 'function',
            function: {
              name: 'generate_image',
              arguments: '{}'
            }
          }
        ]
      };

      // Step 3: Concluding turn without any tool calls
      const step3Response = {
        content: '图像已生成完毕！为您呈现这位赛博朋克猫耳少女。',
        tool_calls: []
      };

      const chatMock = vi.fn()
        .mockResolvedValueOnce(step1Response)
        .mockResolvedValueOnce(step2Response)
        .mockResolvedValueOnce(step3Response);

      const mockService = {
        getSettings: () => ({
          apiKey: 'sk-mock-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          systemPrompt: 'You are an agent.',
          nai5RulesEnabled: true
        }),
        defaultSystemPrompt: 'You are an agent.',
        chat: chatMock
      };

      const appliedPrompts = [];
      const updatedParams = [];
      const onGenerateImage = vi.fn().mockResolvedValue({
        success: true,
        imageUrl: 'blob:test-generated-img',
        seed: 13579,
        width: 832,
        height: 1216
      });

      const manager = new AiChatManager({
        service: mockService,
        onApplyPrompt: (p, mode) => appliedPrompts.push({ p, mode }),
        onSetParameters: (params) => updatedParams.push(params),
        onGenerateImage: onGenerateImage,
        getCanvasState: () => ({
          model: 'v5',
          prompt: '',
          negative: '',
          width: 832,
          height: 1216,
          steps: 28,
          characters: []
        }),
        onShowToast: () => {}
      });

      // Send initial user request
      await manager.handleSendMessage('帮我设置免费竖屏参数，写赛博猫耳少女并出图展示！');

      // The loop should have called chat 3 times
      expect(chatMock).toHaveBeenCalledTimes(3);

      // Verify actions executed in canvas
      expect(updatedParams).toHaveLength(1);
      expect(updatedParams[0].steps).toBe(28);
      expect(appliedPrompts).toEqual([{ p: '1girl, cat ears, neon city', mode: 'replace' }]);
      expect(onGenerateImage).toHaveBeenCalledTimes(1);

      // Verify conversation history progression
      // Message sequence: User -> Assistant (with tools 1 & 2) -> Tool 1 -> Tool 2 -> Assistant (with gen tool) -> Tool 3 -> Assistant (conclusion)
      const assistantMessages = manager.messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(3);

      // Final message should be concluding message
      expect(assistantMessages[2].content).toContain('图像已生成完毕');

      // Second assistant message should contain the image result
      const genToolCall = assistantMessages[1].tool_calls.find(t => t.tool === 'generate_image');
      expect(genToolCall).toBeDefined();
      expect(genToolCall.imageUrl).toBe('blob:test-generated-img');
      expect(genToolCall.seed).toBe(13579);
    });
  });
});

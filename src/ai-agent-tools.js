/**
 * AI Agent Tools Definition & Execution Layer
 * Standard OpenAI-compatible Tool Calling schemas and canvas execution helpers
 * for NovelAI prompts and characters (V3 / V4.5 / V5).
 */

export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "update_prompt",
      description: "更改或追加主画板的正向提示词 (Prompt) 与负面排除词 (Negative Prompt)。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "正向提示词内容（英文 Danbooru 逗号分隔标签，如: 1girl, silver hair, masterpiece）"
          },
          mode: {
            type: "string",
            enum: ["replace", "append"],
            description: "正向提示词模式：'replace' 完全替换当前提示词，'append' 追加在已有提示词之后（默认 replace）"
          },
          negative_prompt: {
            type: "string",
            description: "可选。负向排除词内容（如: lowres, bad anatomy）"
          },
          negative_mode: {
            type: "string",
            enum: ["replace", "append"],
            description: "负面提示词模式：'replace' 替换，'append' 追加（默认 replace）"
          }
        },
        required: ["prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_character",
      description: "在画板中添加一个独立角色。注意：V3 模型不支持多角色；V4.5 采用 5x5 网格定位 (A1~E5)；V5 采用 2D 连续自由坐标 (0.0~1.0)。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "该角色的外观与特征提示词（如: 1girl, blond hair, blue eyes, maid uniform）"
          },
          negative_prompt: {
            type: "string",
            description: "可选。该角色的专属排除词"
          },
          position: {
            description: "可选。角色位置。可为方位描述 ('left', 'center', 'right', 'top', 'bottom', 'top-left' 等)、网格代号 ('A1'~'E5') 或坐标对象 {x, y}",
            anyOf: [
              { type: "string" },
              {
                type: "object",
                properties: {
                  x: { type: "number", minimum: 0, maximum: 1 },
                  y: { type: "number", minimum: 0, maximum: 1 }
                }
              }
            ]
          },
          auto_position: {
            type: "boolean",
            description: "可选。是否由画板自动居中/排版。未指定 position 时默认为 true，指定具体 position 时默认为 false"
          }
        },
        required: ["prompt"]
      }
    }
  }
];

const DIRECTION_COORDS = {
  'left': { x: 0.2, y: 0.5, label: '靠左' },
  '左': { x: 0.2, y: 0.5, label: '靠左' },
  '左边': { x: 0.2, y: 0.5, label: '靠左' },
  '左侧': { x: 0.2, y: 0.5, label: '靠左' },
  'right': { x: 0.8, y: 0.5, label: '靠右' },
  '右': { x: 0.8, y: 0.5, label: '靠右' },
  '右边': { x: 0.8, y: 0.5, label: '靠右' },
  '右侧': { x: 0.8, y: 0.5, label: '靠右' },
  'center': { x: 0.5, y: 0.5, label: '居中' },
  '中': { x: 0.5, y: 0.5, label: '居中' },
  '中间': { x: 0.5, y: 0.5, label: '居中' },
  '居中': { x: 0.5, y: 0.5, label: '居中' },
  'top': { x: 0.5, y: 0.25, label: '上方' },
  '上': { x: 0.5, y: 0.25, label: '上方' },
  '上方': { x: 0.5, y: 0.25, label: '上方' },
  'bottom': { x: 0.5, y: 0.75, label: '下方' },
  '下': { x: 0.5, y: 0.75, label: '下方' },
  '下方': { x: 0.5, y: 0.75, label: '下方' },
  'top-left': { x: 0.2, y: 0.25, label: '左上' },
  'left-top': { x: 0.2, y: 0.25, label: '左上' },
  '左上': { x: 0.2, y: 0.25, label: '左上' },
  'top-right': { x: 0.8, y: 0.25, label: '右上' },
  'right-top': { x: 0.8, y: 0.25, label: '右上' },
  '右上': { x: 0.8, y: 0.25, label: '右上' },
  'bottom-left': { x: 0.2, y: 0.75, label: '左下' },
  'left-bottom': { x: 0.2, y: 0.75, label: '左下' },
  '左下': { x: 0.2, y: 0.75, label: '左下' },
  'bottom-right': { x: 0.8, y: 0.75, label: '右下' },
  'right-bottom': { x: 0.8, y: 0.75, label: '右下' },
  '右下': { x: 0.8, y: 0.75, label: '右下' }
};

/**
 * Resolves character coordinates across V3, V4.5, and V5 models
 * @param {string} model - 'v3' | 'v4.5' | 'v5'
 * @param {string|Object|null} position
 * @param {boolean|null} autoPos
 */
export function resolveCharacterPosition(model = 'v5', position = null, autoPos = null) {
  const normModel = (model || 'v3').toLowerCase().trim();

  // 1. V3 不支持多角色
  if (normModel === 'v3' || normModel === 'nai-diffusion-3') {
    return {
      supported: false,
      error: '当前模型为 V3 (nai-diffusion-3)，V3 架构不支持独立角色 (Character) 功能。请在画板切换至 V4.5 或 V5 模型后再添加角色。'
    };
  }

  let isAuto = autoPos !== undefined && autoPos !== null ? Boolean(autoPos) : (position === null || position === undefined || position === '');
  let rawX = 0.5;
  let rawY = 0.5;
  let label = isAuto ? '自动排布' : '自定义位置';

  if (!isAuto && position) {
    if (typeof position === 'string') {
      const posLower = position.trim().toLowerCase();
      // Check grid code A1-E5
      const gridMatch = posLower.match(/^([a-e])([1-5])$/);
      if (gridMatch) {
        const col = gridMatch[1].charCodeAt(0) - 97; // 0..4
        const row = parseInt(gridMatch[2], 10) - 1; // 0..4
        rawX = (col * 2 + 1) / 10;
        rawY = (row * 2 + 1) / 10;
        label = `网格 ${posLower.toUpperCase()}`;
      } else if (DIRECTION_COORDS[posLower]) {
        const item = DIRECTION_COORDS[posLower];
        rawX = item.x;
        rawY = item.y;
        label = item.label;
      }
    } else if (typeof position === 'object') {
      if (typeof position.x === 'number') rawX = position.x;
      if (typeof position.y === 'number') rawY = position.y;
      label = `X:${Math.round(rawX * 100)}% Y:${Math.round(rawY * 100)}%`;
    }
  }

  // 约束坐标在合法范围内
  rawX = Math.max(0.01, Math.min(0.99, isNaN(rawX) ? 0.5 : rawX));
  rawY = Math.max(0.01, Math.min(0.99, isNaN(rawY) ? 0.5 : rawY));

  // 2. V4.5 模型：5x5 离散网格点阵吸附 (A1~E5)
  if (normModel === 'v4.5' || normModel === 'nai-diffusion-4-5-full') {
    const col = Math.max(0, Math.min(4, Math.floor(rawX * 5)));
    const row = Math.max(0, Math.min(4, Math.floor(rawY * 5)));
    const snapX = (col * 2 + 1) / 10;
    const snapY = (row * 2 + 1) / 10;
    const gridName = String.fromCharCode(65 + col) + (row + 1);

    return {
      supported: true,
      model: 'v4.5',
      x: snapX,
      y: snapY,
      autoPos: isAuto,
      label: isAuto ? '自动排布' : `网格 ${gridName} (${label})`,
      gridName
    };
  }

  // 3. V5 模型：2D 连续自由坐标
  const v5X = parseFloat(rawX.toFixed(3));
  const v5Y = parseFloat(rawY.toFixed(3));

  return {
    supported: true,
    model: 'v5',
    x: v5X,
    y: v5Y,
    autoPos: isAuto,
    label: isAuto ? '自动排布' : `坐标 X:${Math.round(v5X * 100)}% Y:${Math.round(v5Y * 100)}% (${label})`
  };
}

/**
 * Executes a tool call against the provided canvas handlers
 * @param {Object} toolCall - { name, arguments }
 * @param {Object} context - Canvas execution context
 */
export function executeToolCall(toolCall, context = {}) {
  const name = toolCall.name || toolCall.function?.name;
  let args = toolCall.arguments || toolCall.function?.arguments;

  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  args = args || {};

  if (name === 'update_prompt') {
    const prompt = (args.prompt || '').trim();
    const mode = args.mode === 'append' ? 'append' : 'replace';
    const negativePrompt = (args.negative_prompt || '').trim();
    const negativeMode = args.negative_mode === 'append' ? 'append' : 'replace';

    if (!prompt) {
      return { success: false, tool: name, error: '提示词不能为空' };
    }

    if (context.onUpdatePrompt) {
      context.onUpdatePrompt({
        prompt,
        mode,
        negative: negativePrompt,
        negativeMode
      });
    }

    const modeText = mode === 'append' ? '追加' : '替换';
    const summary = `已${modeText}画板提示词: "${prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt}"`;

    return {
      success: true,
      tool: name,
      message: summary,
      details: { prompt, mode, negativePrompt, negativeMode }
    };
  }

  if (name === 'add_character') {
    const prompt = (args.prompt || '').trim();
    const negativePrompt = (args.negative_prompt || '').trim();
    const model = context.model || 'v5';

    if (!prompt) {
      return { success: false, tool: name, error: '角色提示词不能为空' };
    }

    const posResolution = resolveCharacterPosition(model, args.position, args.auto_position);
    if (!posResolution.supported) {
      return {
        success: false,
        tool: name,
        error: posResolution.error
      };
    }

    if (context.onAddCharacter) {
      context.onAddCharacter({
        prompt,
        negative: negativePrompt,
        x: posResolution.x,
        y: posResolution.y,
        autoPos: posResolution.autoPos
      });
    }

    const summary = `已添加角色 (${posResolution.label}): "${prompt.length > 25 ? prompt.slice(0, 25) + '...' : prompt}"`;

    return {
      success: true,
      tool: name,
      message: summary,
      details: {
        prompt,
        negativePrompt,
        x: posResolution.x,
        y: posResolution.y,
        autoPos: posResolution.autoPos,
        positionLabel: posResolution.label
      }
    };
  }

  return {
    success: false,
    tool: name,
    error: `未知的工具名称: ${name}`
  };
}

/**
 * Fallback parser for LLM text responses that output tools in markdown/JSON format
 * @param {string} text 
 * @returns {Array<Object>}
 */
export function parseToolCallsFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const toolCalls = [];

  // Match ```tool_call / ```json blocks
  const blockRegex = /```(?:tool_call|json|tool)?\s*([\s\S]*?)```/gi;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.name || parsed.tool)) {
        toolCalls.push({
          id: `call_fallback_${Date.now()}_${toolCalls.length}`,
          type: 'function',
          function: {
            name: parsed.name || parsed.tool,
            arguments: JSON.stringify(parsed.arguments || parsed.parameters || parsed)
          }
        });
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && (item.name || item.tool)) {
            toolCalls.push({
              id: `call_fallback_${Date.now()}_${toolCalls.length}`,
              type: 'function',
              function: {
                name: item.name || item.tool,
                arguments: JSON.stringify(item.arguments || item.parameters || item)
              }
            });
          }
        }
      }
    } catch {
      // Ignore non-JSON blocks
    }
  }

  // Also check for raw single JSON object { "name": "update_prompt", ... }
  if (toolCalls.length === 0 && text.trim().startsWith('{') && text.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(text.trim());
      if (parsed && (parsed.name === 'update_prompt' || parsed.name === 'add_character' || parsed.tool === 'update_prompt' || parsed.tool === 'add_character')) {
        toolCalls.push({
          id: `call_fallback_${Date.now()}`,
          type: 'function',
          function: {
            name: parsed.name || parsed.tool,
            arguments: JSON.stringify(parsed.arguments || parsed.parameters || parsed)
          }
        });
      }
    } catch {
      // Ignore
    }
  }

  return toolCalls;
}

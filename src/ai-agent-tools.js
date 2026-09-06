/**
 * AI Agent Tools Definition & Execution Layer
 * Standard OpenAI-compatible Tool Calling schemas and canvas execution helpers
 * for NovelAI prompts and characters (V3 / V4.5 / V5).
 */

export const FREE_RESOLUTIONS = {
  portrait: { width: 832, height: 1216, value: '832,1216', label: '竖屏 Portrait (832x1216)' },
  landscape: { width: 1216, height: 832, value: '1216,832', label: '横屏 Landscape (1216x832)' },
  square: { width: 1024, height: 1024, value: '1024,1024', label: '方图 Square (1024x1024)' }
};
export const MAX_FREE_STEPS = 28;
export const MAX_FREE_PIXELS = 1048576; // 1024 * 1024

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
  },
  {
    type: "function",
    function: {
      name: "remove_character",
      description: "从画板中删除指定序号的角色（从 1 开始计数）或清空所有角色。",
      parameters: {
        type: "object",
        properties: {
          index: {
            description: "要删除的角色序号（从 1 开始的正整数，如 1、2；或传入 'all' 清空画板全部角色）",
            anyOf: [
              { type: "integer", minimum: 1 },
              { type: "string", enum: ["all"] }
            ]
          }
        },
        required: ["index"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_model",
      description: "切换画板所使用的 NovelAI 绘图基础模型。注意：V3 模型不支持多角色，V4.5 (5x5网格) 与 V5 (2D连续坐标) 支持多角色。",
      parameters: {
        type: "object",
        properties: {
          model: {
            type: "string",
            enum: ["v3", "v4.5", "v5", "zimage"],
            description: "目标模型版本：'v3' (经典V3), 'v4.5' (V4.5 Full), 'v5' (V5 Full), 'zimage' (极速绘图)"
          }
        },
        required: ["model"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_parameters",
      description: "调整画板绘图参数。严格限定在普通用户免费出图权限区间（标准分辨率 832x1216, 1216x832, 1024x1024，步数 <= 28 步，单批 1 张），绝对杜绝消耗 Anlas 点数。",
      parameters: {
        type: "object",
        properties: {
          aspect_ratio: {
            type: "string",
            enum: ["portrait", "landscape", "square"],
            description: "画幅比例：'portrait' 竖屏 (832x1216), 'landscape' 横屏 (1216x832), 'square' 方图 (1024x1024)。均为免费标准画幅。"
          },
          width: {
            type: "integer",
            description: "可选。指定宽度（限普通免费尺寸 832, 1216, 1024）"
          },
          height: {
            type: "integer",
            description: "可选。指定高度（限普通免费尺寸 1216, 832, 1024）"
          },
          steps: {
            type: "integer",
            minimum: 1,
            maximum: 28,
            description: "生成步数（1~28 步）。【极其重要：为保证普通用户免费权限不消耗 Anlas，步数绝对不能超过 28 步】"
          },
          scale: {
            type: "number",
            minimum: 1,
            maximum: 20,
            description: "提示词相关性引导强度 (CFG Scale，默认 5.0，V5 推荐 1.9 或 5.0，不消耗 Anlas)"
          },
          sampler: {
            type: "string",
            description: "可选。采样器算法（如 k_euler, k_euler_ancestral, k_dpmpp_2s_ancestral 等）"
          },
          seed: {
            description: "可选。随机种子整数，或传入 null/'random' 表示每次随机",
            anyOf: [
              { type: "integer" },
              { type: "null" },
              { type: "string" }
            ]
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_canvas_state",
      description: "获取当前画板的完整实时状态（当前模型、正向提示词、负向提示词、画幅分辨率、生成步数、Scale、采样器、已有角色列表等）。",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "触发 NovelAI 图像生成并直接在对话中呈现生成出的图片。遵循普通用户免费权限（免费分辨率、步数 <= 28 步、单张生成），不消耗 Anlas。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "可选。生成前一并更新的正向提示词。若留空则直接使用画板当前提示词。"
          },
          negative_prompt: {
            type: "string",
            description: "可选。生成前一并更新的负向排除词。"
          },
          model: {
            type: "string",
            enum: ["v3", "v4.5", "v5", "zimage"],
            description: "可选。生成前一并切换的基础模型。"
          }
        }
      }
    }
  }
];

/**
 * Validates and clamps parameters strictly into NovelAI normal user free quota
 * (Steps <= 28, Standard Resolutions <= 1048576 px, Batch = 1)
 */
export function clampSafeParameters(rawParams = {}) {
  const adjustments = [];
  const result = { adjustments };

  // 1. Resolution / Aspect ratio validation
  let targetRes = null;
  if (rawParams.aspect_ratio) {
    const normRatio = String(rawParams.aspect_ratio).toLowerCase().trim();
    if (FREE_RESOLUTIONS[normRatio]) {
      targetRes = FREE_RESOLUTIONS[normRatio];
    }
  }

  if (!targetRes && (rawParams.width || rawParams.height)) {
    const w = parseInt(rawParams.width, 10);
    const h = parseInt(rawParams.height, 10);
    if (!isNaN(w) && !isNaN(h)) {
      if (w === 832 && h === 1216) targetRes = FREE_RESOLUTIONS.portrait;
      else if (w === 1216 && h === 832) targetRes = FREE_RESOLUTIONS.landscape;
      else if (w === 1024 && h === 1024) targetRes = FREE_RESOLUTIONS.square;
      else {
        // Find closest free resolution based on aspect ratio
        const ratio = w / h;
        if (ratio < 0.85) targetRes = FREE_RESOLUTIONS.portrait;
        else if (ratio > 1.15) targetRes = FREE_RESOLUTIONS.landscape;
        else targetRes = FREE_RESOLUTIONS.square;
        adjustments.push(`分辨率 ${w}x${h} 超出普通免费区间，已自动安全修正为 ${targetRes.label} 以免消耗 Anlas`);
      }
    }
  }

  if (targetRes) {
    result.width = targetRes.width;
    result.height = targetRes.height;
    result.resValue = targetRes.value;
    result.resLabel = targetRes.label;
  }

  // 2. Steps validation (Max 28 for free Opus tier)
  if (rawParams.steps !== undefined && rawParams.steps !== null) {
    const parsedSteps = parseInt(rawParams.steps, 10);
    if (!isNaN(parsedSteps)) {
      if (parsedSteps > MAX_FREE_STEPS) {
        result.steps = MAX_FREE_STEPS;
        adjustments.push(`步数 ${parsedSteps} 超出免费上限，已自动安全限制为最大免费步数 ${MAX_FREE_STEPS} 步以免消耗 Anlas`);
      } else if (parsedSteps < 1) {
        result.steps = 1;
      } else {
        result.steps = parsedSteps;
      }
    }
  }

  // 3. Scale validation (1.0 to 20.0, default 5.0)
  if (rawParams.scale !== undefined && rawParams.scale !== null) {
    const parsedScale = parseFloat(rawParams.scale);
    if (!isNaN(parsedScale)) {
      result.scale = Math.max(1.0, Math.min(20.0, parseFloat(parsedScale.toFixed(1))));
    }
  }

  // 4. Sampler
  if (rawParams.sampler && typeof rawParams.sampler === 'string') {
    result.sampler = rawParams.sampler.trim();
  }

  // 5. Seed
  if (rawParams.seed !== undefined) {
    if (rawParams.seed === null || rawParams.seed === '' || rawParams.seed === 'random') {
      result.seed = '';
    } else {
      const parsedSeed = parseInt(rawParams.seed, 10);
      if (!isNaN(parsedSeed)) {
        result.seed = Math.max(0, Math.min(4294967295, parsedSeed));
      }
    }
  }

  return result;
}

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

  if (name === 'remove_character') {
    const rawIndex = args.index;
    if (rawIndex === undefined || rawIndex === null) {
      return { success: false, tool: name, error: '请指定要删除的角色序号 (如 1) 或传入 "all"' };
    }

    if (context.onRemoveCharacter) {
      const res = context.onRemoveCharacter({ index: rawIndex });
      if (res && res.success === false) {
        return { success: false, tool: name, error: res.error || '删除角色失败' };
      }
    }

    const isAll = String(rawIndex).toLowerCase() === 'all';
    const msg = isAll ? '已清空画板上的全部角色' : `已移除角色 #${rawIndex}`;
    return {
      success: true,
      tool: name,
      message: msg,
      details: { index: rawIndex }
    };
  }

  if (name === 'set_model') {
    const rawModel = (args.model || '').toLowerCase().trim();
    const validModels = ['v3', 'v4.5', 'v5', 'zimage'];
    if (!validModels.includes(rawModel)) {
      return {
        success: false,
        tool: name,
        error: `不支持的模型版本: ${args.model}。可选版本: ${validModels.join(', ')}`
      };
    }

    if (context.onSetModel) {
      context.onSetModel(rawModel);
    }

    const modelNames = {
      'v3': 'NovelAI Diffusion V3',
      'v4.5': 'NovelAI Diffusion V4.5',
      'v5': 'NovelAI Diffusion V5',
      'zimage': 'ZImage Turbo'
    };

    return {
      success: true,
      tool: name,
      message: `已将画板模型切换至 ${modelNames[rawModel] || rawModel}`,
      details: { model: rawModel }
    };
  }

  if (name === 'set_parameters') {
    const clamped = clampSafeParameters(args);

    if (context.onSetParameters) {
      context.onSetParameters(clamped);
    }

    const summaryParts = [];
    if (clamped.resLabel) summaryParts.push(`画幅: ${clamped.resLabel}`);
    if (clamped.steps !== undefined) summaryParts.push(`步数: ${clamped.steps}步`);
    if (clamped.scale !== undefined) summaryParts.push(`Scale: ${clamped.scale}`);
    if (clamped.sampler) summaryParts.push(`采样器: ${clamped.sampler}`);
    if (clamped.seed !== undefined) summaryParts.push(clamped.seed ? `Seed: ${clamped.seed}` : 'Seed: 随机');

    let msg = summaryParts.length > 0 ? `已更新画板绘图参数 (${summaryParts.join(', ')})` : '画板绘图参数未变更';
    if (clamped.adjustments.length > 0) {
      msg += ` [安全保护: ${clamped.adjustments.join('; ')}]`;
    }

    return {
      success: true,
      tool: name,
      message: msg,
      details: clamped
    };
  }

  if (name === 'get_canvas_state') {
    const state = typeof context.getCanvasState === 'function' ? context.getCanvasState() : {};
    return {
      success: true,
      tool: name,
      message: `获取画板状态成功 (当前模型: ${state.model || 'v5'}, 角色数: ${state.characters?.length || 0})`,
      details: state
    };
  }

  if (name === 'generate_image') {
    // Optional pre-generation adjustments
    if (args.model && context.onSetModel) {
      context.onSetModel(args.model);
    }
    if (args.prompt) {
      const mode = 'replace';
      const negative = args.negative_prompt || '';
      if (context.onUpdatePrompt) {
        context.onUpdatePrompt({ prompt: args.prompt, mode, negative, negativeMode: 'replace' });
      }
    }

    if (!context.onGenerateImage) {
      return {
        success: false,
        tool: name,
        error: '当前环境未提供图像生成接口 (onGenerateImage missing)'
      };
    }

    return (async () => {
      try {
        const genResult = await context.onGenerateImage({
          prompt: args.prompt,
          negative: args.negative_prompt,
          model: args.model
        });
        if (!genResult || genResult.success === false) {
          return {
            success: false,
            tool: name,
            error: genResult?.error || '图像生成未成功完成'
          };
        }

        const imageUrl = genResult.imageUrl || (genResult.results && genResult.results[0]?.imageUrl) || (genResult.primaryImage && genResult.primaryImage.imageUrl) || '';
        const seed = genResult.seed !== undefined ? genResult.seed : (genResult.results && genResult.results[0]?.seed);
        const width = genResult.width || (genResult.results && genResult.results[0]?.width) || 832;
        const height = genResult.height || (genResult.results && genResult.results[0]?.height) || 1216;
        const model = genResult.model || args.model || context.model || 'v5';
        const prompt = genResult.prompt || args.prompt || '';
        const negative_prompt = genResult.negative_prompt || args.negative_prompt || '';
        const steps = genResult.steps;
        const scale = genResult.scale;
        const sampler = genResult.sampler;
        const meta = genResult.meta || {
          negative_prompt,
          width,
          height,
          steps,
          scale,
          sampler,
          seed
        };

        return {
          success: true,
          tool: name,
          message: `图像生成成功! (Seed: ${seed || '随机'}, 尺寸: ${width}x${height})`,
          imageUrl,
          seed,
          width,
          height,
          model,
          prompt,
          negative_prompt,
          steps,
          scale,
          sampler,
          meta,
          isSavedToHistory: Boolean(genResult.isSavedToHistory)
        };
      } catch (err) {
        return {
          success: false,
          tool: name,
          error: `图像生成失败: ${err.message}`
        };
      }
    })();
  }

  return {
    success: false,
    tool: name,
    error: `未知的工具名称: ${name}`
  };
}

const KNOWN_TOOLS = new Set([
  'update_prompt',
  'add_character',
  'remove_character',
  'set_model',
  'set_parameters',
  'get_canvas_state',
  'generate_image'
]);

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
        const toolName = parsed.name || parsed.tool;
        if (KNOWN_TOOLS.has(toolName)) {
          toolCalls.push({
            id: `call_fallback_${Date.now()}_${toolCalls.length}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: JSON.stringify(parsed.arguments || parsed.parameters || parsed)
            }
          });
        }
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && (item.name || item.tool)) {
            const toolName = item.name || item.tool;
            if (KNOWN_TOOLS.has(toolName)) {
              toolCalls.push({
                id: `call_fallback_${Date.now()}_${toolCalls.length}`,
                type: 'function',
                function: {
                  name: toolName,
                  arguments: JSON.stringify(item.arguments || item.parameters || item)
                }
              });
            }
          }
        }
      }
    } catch {
      // Ignore non-JSON blocks
    }
  }

  // Also check for raw single JSON object { "name": "...", ... }
  if (toolCalls.length === 0 && text.trim().startsWith('{') && text.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(text.trim());
      const toolName = parsed.name || parsed.tool;
      if (toolName && KNOWN_TOOLS.has(toolName)) {
        toolCalls.push({
          id: `call_fallback_${Date.now()}`,
          type: 'function',
          function: {
            name: toolName,
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

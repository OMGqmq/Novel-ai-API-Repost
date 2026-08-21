import { describe, it, expect } from 'vitest';

describe('Source Modules Import Integrity', () => {
  it('should import all core src modules without throwing reference errors', async () => {
    const aiHelperMod = await import('../src/ai-helper-service.js');
    expect(aiHelperMod.AiHelperService).toBeDefined();
    expect(aiHelperMod.AI_PROVIDER_PRESETS).toBeDefined();
    expect(aiHelperMod.AI_SYSTEM_PROMPTS).toBeDefined();

    const aiChatMod = await import('../src/ai-chat-manager.js');
    expect(aiChatMod.AiChatManager).toBeDefined();

    const charRefMod = await import('../src/char-ref-manager.js');
    expect(charRefMod.CharRefManager).toBeDefined();

    const vibeMod = await import('../src/vibe-manager.js');
    expect(vibeMod.VibeManager).toBeDefined();

    const xyPlotMod = await import('../src/xy-plot-manager.js');
    expect(xyPlotMod.XyPlotManager).toBeDefined();

    const inpaintMod = await import('../src/inpaint.js');
    expect(inpaintMod.InpaintEditor).toBeDefined();

    const outpaintMod = await import('../src/outpaint.js');
    expect(outpaintMod.OutpaintEditor).toBeDefined();

    const notebookMod = await import('../src/notebook.js');
    expect(notebookMod.NotebookManager).toBeDefined();

    const promptHelperMod = await import('../src/prompt-helper.js');
    expect(promptHelperMod.PromptHelper).toBeDefined();

    const toolboxMod = await import('../src/toolbox-controller.js');
    expect(toolboxMod.initToolbox).toBeDefined();

    const charPromptMod = await import('../src/char-prompt-manager.js');
    expect(charPromptMod.CharPromptManager).toBeDefined();
  });

  it('should verify all source files have 100% valid JavaScript syntax without errors', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { execSync } = await import('child_process');

    const srcDir = path.resolve('src');
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
    
    for (const file of files) {
      const filePath = path.join(srcDir, file);
      expect(() => {
        execSync(`node --check "${filePath}"`);
      }).not.toThrow();
    }
  });
});

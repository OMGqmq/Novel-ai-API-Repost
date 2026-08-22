import { handleNovelAIProxy } from './_proxy-helper.js';

export async function onRequest(context) {
  return handleNovelAIProxy(context, {
    targetUrl: 'https://image.novelai.net/ai/upscale',
    buildPayload: (data, isRestricted, width, height) => {
      const image = data.image;
      if (!image) {
        throw new Error("Missing image parameter for upscale");
      }

      let modelName = 'nai-diffusion-3';
      const rawModel = data.model || data.version || 'v3';
      if (rawModel === 'v5' || rawModel.includes('5')) {
        modelName = 'nai-diffusion-5-full';
      } else if (rawModel === 'v4.5' || rawModel === 'v4' || rawModel.includes('4')) {
        modelName = 'nai-diffusion-4-full';
      } else if (rawModel.includes('furry')) {
        modelName = 'furry-diffusion-3';
      } else if (rawModel.startsWith('nai-diffusion') || rawModel.startsWith('safe-diffusion')) {
        modelName = rawModel;
      }

      return {
        image,
        width: parseInt(data.width) || width,
        height: parseInt(data.height) || height,
        scale: parseInt(data.scale) || 4,
        model: modelName
      };
    }
  });
}

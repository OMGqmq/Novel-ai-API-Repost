import { handleNovelAIProxy } from './_proxy-helper.js';

export async function onRequest(context) {
  return handleNovelAIProxy(context, {
    targetUrl: 'https://image.novelai.net/ai/upscale',
    buildPayload: (data, isRestricted, width, height) => {
      const image = data.image;
      if (!image) {
        throw new Error("Missing image parameter for upscale");
      }
      return {
        image,
        width: parseInt(data.width) || width,
        height: parseInt(data.height) || height,
        scale: parseInt(data.scale) || 4
      };
    }
  });
}

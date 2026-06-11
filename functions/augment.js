import { handleNovelAIProxy } from './_proxy-helper.js';

export async function onRequest(context) {
  return handleNovelAIProxy(context, {
    targetUrl: 'https://image.novelai.net/ai/augment-image',
    buildPayload: (data, isRestricted, width, height) => {
      const req_type = data.req_type; // 'sketch', 'lineart', 'bg-removal', 'colorize'
      const image = data.image; // base64

      if (!req_type || !image) {
        throw new Error("Missing req_type or image parameter");
      }

      const payload = {
        req_type,
        width,
        height,
        image
      };

      if (req_type === 'colorize' && data.prompt) {
        payload.prompt = data.prompt;
        payload.defry = data.defry || 0;
      }

      return payload;
    }
  });
}

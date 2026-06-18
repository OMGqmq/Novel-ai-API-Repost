import { handleNovelAIProxy } from './_proxy-helper.js';
import { MAX_FREE_STEPS } from './_config.js';
import { createPayload } from './_payload-factory.js';

export async function onRequest(context) {
  return handleNovelAIProxy(context, {
    targetUrl: 'https://image.novelai.net/ai/generate-image',
    buildPayload: (data, isRestricted, width, height) => {
      if (data.version === 'zimage') {
        return { parameters: {} };
      }
      const steps = isRestricted 
        ? Math.min(parseInt(data.steps) || MAX_FREE_STEPS, MAX_FREE_STEPS)
        : (parseInt(data.steps) || MAX_FREE_STEPS);
      return createPayload(data.version || "v3", {
        ...data,
        steps,
        width,
        height
      });
    }
  });
}

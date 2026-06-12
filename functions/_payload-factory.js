/**
 * Payload Factory for NovelAI Diffusion API
 * Encapsulates the complex JSON structure for different model versions.
 */

export function createPayload(version, data) {
  const prompt = data.prompt || "";
  const negative_prompt = data.negative_prompt || "";
  const seed = data.seed || Math.floor(Math.random() * 4294967295);
  const width = data.width || 832;
  const height = data.height || 1216;
  const steps = data.steps || 28;
  const scale = parseFloat(data.scale) || 5.0;
  const sampler = data.sampler || "k_euler";

  // Determine action and model behavior
  const isInpaint = data.action === "infill" && data.mask;
  let action = "generate";
  if (isInpaint) {
    action = "infill";
  } else if (data.image) {
    action = "img2img";
  }

  // Handle vibe transfer (atmosphere transfer)
  let vibe_images = [];
  let vibe_info = [];
  let vibe_strength = [];
  if (data.vibe_image) {
    vibe_images.push(data.vibe_image);
    vibe_info.push(parseFloat(data.vibe_info) !== undefined && !isNaN(data.vibe_info) ? parseFloat(data.vibe_info) : 1.0);
    vibe_strength.push(parseFloat(data.vibe_strength) !== undefined && !isNaN(data.vibe_strength) ? parseFloat(data.vibe_strength) : 0.6);
  }

  let payload = {};

    if (version === "v4.5") {
    let model = "nai-diffusion-4-5-full";
    if (isInpaint) model = `${model}-inpainting`;

    const isExperimental = data.v4_5_experimental === true;

    // 解析多角色提示词 (Character Prompts)
    let charCaptions = [];
    let negCharCaptions = [];
    if (data.char_captions && Array.isArray(data.char_captions) && data.char_captions.length > 0) {
      charCaptions = data.char_captions.map(c => ({
        char_caption: c.prompt || "",
        centers: [{ x: c.x !== undefined ? parseFloat(c.x) : 0.5, y: c.y !== undefined ? parseFloat(c.y) : 0.5 }]
      }));
      negCharCaptions = data.char_captions.map(c => ({
        char_caption: c.negative_prompt || "",
        centers: [{ x: c.x !== undefined ? parseFloat(c.x) : 0.5, y: c.y !== undefined ? parseFloat(c.y) : 0.5 }]
      }));
    }

    const useCoords = data.v4_prompt_use_coords !== undefined 
      ? (data.v4_prompt_use_coords === true) 
      : !isExperimental;
      
    const useOrder = data.v4_prompt_use_order !== undefined 
      ? (data.v4_prompt_use_order === true) 
      : true;
      
    const negUseOrder = data.v4_neg_use_order !== undefined 
      ? (data.v4_neg_use_order === true) 
      : isExperimental;
      
    const deliberateEulerBug = data.deliberate_euler_ancestral_bug !== undefined 
      ? (data.deliberate_euler_ancestral_bug === true) 
      : isExperimental;
      
    const preferBrownian = data.prefer_brownian !== undefined 
      ? (data.prefer_brownian === true) 
      : !isExperimental;
      
    let skipCfg = isExperimental ? 0.0 : null;
    if (data.skip_cfg_above_sigma !== undefined && data.skip_cfg_above_sigma !== null) {
      if (data.skip_cfg_above_sigma === 'null') {
        skipCfg = null;
      } else {
        skipCfg = parseFloat(data.skip_cfg_above_sigma);
      }
    }

    payload = {
      input: prompt,
      model: model,
      action: action,
      use_new_shared_trial: true,
      parameters: {
        params_version: 3,
        width, height, scale, sampler, steps, seed,
        n_samples: 1,
        prompt, negative_prompt,
        v4_prompt: {
          caption: { base_caption: prompt, char_captions: charCaptions },
          use_coords: useCoords,
          use_order: useOrder
        },
        v4_negative_prompt: {
          caption: { base_caption: negative_prompt, char_captions: negCharCaptions },
          legacy_uc: data.legacy_uc !== undefined ? (data.legacy_uc === true) : false
        },
        ucPreset: 4,
        qualityToggle: data.qualityToggle !== undefined ? data.qualityToggle : false,
        sm: data.sm !== undefined ? data.sm : false,
        sm_dyn: data.sm_dyn !== undefined ? data.sm_dyn : false,
        dynamic_thresholding: data.dynamic_thresholding !== undefined ? data.dynamic_thresholding : false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: true,
        cfg_rescale: data.cfg_rescale !== undefined ? parseFloat(data.cfg_rescale) : 0,
        noise_schedule: data.noise_schedule || "exponential",
        legacy_v3_extend: false,
        legacy_uc: data.legacy_uc !== undefined ? (data.legacy_uc === true) : false,
        characterPrompts: data.characterPrompts || [],
        normalize_reference_strength_multiple: true,
        uncond_scale: data.uncond_scale !== undefined ? parseFloat(data.uncond_scale) : 1.0,
        skip_cfg_above_sigma: skipCfg,
        deliberate_euler_ancestral_bug: deliberateEulerBug,
        prefer_brownian: preferBrownian,
        reference_image_multiple: vibe_images,
        reference_information_extracted_multiple: vibe_info,
        reference_strength_multiple: vibe_strength,
        extra_noise_seed: seed
      }
    };
  } else {
    const model = isInpaint ? "nai-diffusion-3-inpainting" : "nai-diffusion-3";
    payload = {
      input: prompt,
      model: model,
      action: action,
      parameters: {
        params_version: 1,
        width, height, scale, sampler, steps, seed,
        n_samples: 1,
        prompt, negative_prompt,
        ucPreset: 3,
        qualityToggle: data.qualityToggle !== undefined ? data.qualityToggle : false,
        sm: data.sm !== undefined ? data.sm : true,
        sm_dyn: data.sm_dyn !== undefined ? data.sm_dyn : true,
        dynamic_thresholding: data.dynamic_thresholding !== undefined ? data.dynamic_thresholding : false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: true,
        cfg_rescale: data.cfg_rescale !== undefined ? parseFloat(data.cfg_rescale) : 0,
        noise_schedule: "native",
        legacy_v3_extend: false,
        uncond_scale: data.uncond_scale !== undefined ? parseFloat(data.uncond_scale) : 1.0,
        reference_image_multiple: vibe_images,
        reference_information_extracted_multiple: vibe_info,
        reference_strength_multiple: vibe_strength,
        extra_noise_seed: seed
      }
    };
  }

  // Handle Character Reference (V4.5+)
  if (version === "v4.5" && data.director_reference_images && data.director_reference_images.length > 0) {
    payload.parameters.director_reference_images = data.director_reference_images;
    payload.parameters.director_reference_descriptions = data.director_reference_descriptions || [];
    payload.parameters.director_reference_strength_values = data.director_reference_strength_values || [];
    payload.parameters.director_reference_secondary_strength_values = data.director_reference_secondary_strength_values || [];
    payload.parameters.director_reference_information_extracted = data.director_reference_information_extracted || [];
  }

  // Handle image-based actions
  if (isInpaint) {
    const inpaintStrength = parseFloat(data.strength) || 1.0;
    payload.parameters.image = data.image;
    payload.parameters.mask = data.mask;
    payload.parameters.add_original_image = data.add_original_image !== undefined ? data.add_original_image : true;
    payload.parameters.inpaintImg2ImgStrength = inpaintStrength;
    payload.parameters.strength = 1.0; 
    payload.parameters.noise = 0;
    payload.parameters.sm = false;
    payload.parameters.sm_dyn = false;
  } else if (data.image) {
    payload.parameters.image = data.image;
    payload.parameters.strength = parseFloat(data.strength) || 0.5;
    payload.parameters.noise = parseFloat(data.noise) || 0;
  }

  return payload;
}

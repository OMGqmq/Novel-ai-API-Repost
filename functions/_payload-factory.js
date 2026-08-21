/**
 * Payload Factory for NovelAI Diffusion API
 * Completely decoupled builders for each version (V3, V4.5, V5).
 * Each builder maintains its own independent payload structure without shared mutable state.
 */

/**
 * Helper to extract character captions with coordinates
 */
function extractCharCaptions(charList) {
  const charCaptions = [];
  const negCharCaptions = [];
  if (Array.isArray(charList) && charList.length > 0) {
    for (const c of charList) {
      const x = (c.x !== undefined && !isNaN(c.x)) ? parseFloat(c.x) : 0.5;
      const y = (c.y !== undefined && !isNaN(c.y)) ? parseFloat(c.y) : 0.5;
      charCaptions.push({
        char_caption: c.prompt || "",
        centers: [{ x, y }]
      });
      negCharCaptions.push({
        char_caption: c.negative_prompt || "",
        centers: [{ x, y }]
      });
    }
  }
  return { charCaptions, negCharCaptions };
}

/**
 * Helper to extract vibe/reference transfer arrays
 */
function extractVibeArrays(data) {
  const vibe_images = [];
  const vibe_info = [];
  const vibe_strength = [];
  if (data.vibe_image) {
    vibe_images.push(data.vibe_image);
    vibe_info.push(data.vibe_info !== undefined && !isNaN(data.vibe_info) ? parseFloat(data.vibe_info) : 1.0);
    vibe_strength.push(data.vibe_strength !== undefined && !isNaN(data.vibe_strength) ? parseFloat(data.vibe_strength) : 0.6);
  }
  return { vibe_images, vibe_info, vibe_strength };
}

/**
 * V3 Payload Builder (nai-diffusion-3)
 */
export function createV3Payload(data) {
  const prompt = data.prompt || "";
  const negative_prompt = data.negative_prompt || "";
  const seed = (data.seed !== undefined && data.seed !== null) ? Number(data.seed) : Math.floor(Math.random() * 4294967295);
  const width = data.width || 832;
  const height = data.height || 1216;
  const steps = data.steps || 28;
  const scale = (data.scale !== undefined && data.scale !== null) ? parseFloat(data.scale) : 5.0;
  const sampler = data.sampler || "k_euler";

  const isInpaint = data.action === "infill" && !!data.mask;
  const action = isInpaint ? "infill" : (data.image ? "img2img" : "generate");
  const model = isInpaint ? "nai-diffusion-3-inpainting" : "nai-diffusion-3";

  const { vibe_images, vibe_info, vibe_strength } = extractVibeArrays(data);

  const payload = {
    input: prompt,
    model: model,
    action: action,
    parameters: {
      params_version: 1,
      width,
      height,
      scale,
      sampler,
      steps,
      seed,
      n_samples: 1,
      prompt,
      negative_prompt,
      ucPreset: data.ucPreset !== undefined ? data.ucPreset : 3,
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

  if (isInpaint) {
    const inpaintStrength = (data.strength !== undefined && !isNaN(data.strength)) ? parseFloat(data.strength) : 1.0;
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
    payload.parameters.strength = (data.strength !== undefined && !isNaN(data.strength)) ? parseFloat(data.strength) : 0.5;
    payload.parameters.noise = (data.noise !== undefined && !isNaN(data.noise)) ? parseFloat(data.noise) : 0;
  }

  return payload;
}

/**
 * V4.5 Payload Builder (nai-diffusion-4-5-full)
 */
export function createV45Payload(data) {
  const prompt = data.prompt || "";
  const negative_prompt = data.negative_prompt || "";
  const seed = (data.seed !== undefined && data.seed !== null) ? Number(data.seed) : Math.floor(Math.random() * 4294967295);
  const width = data.width || 832;
  const height = data.height || 1216;
  const steps = data.steps || 28;
  const scale = (data.scale !== undefined && data.scale !== null) ? parseFloat(data.scale) : 5.0;
  const sampler = data.sampler || "k_euler";

  const isInpaint = data.action === "infill" && !!data.mask;
  const action = isInpaint ? "infill" : (data.image ? "img2img" : "generate");
  const model = isInpaint ? "nai-diffusion-4-5-full-inpainting" : "nai-diffusion-4-5-full";

  const isExperimental = data.v4_5_experimental === true;
  const { charCaptions, negCharCaptions } = extractCharCaptions(data.char_captions);

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
    if (data.skip_cfg_above_sigma === 'null' || data.skip_cfg_above_sigma === null) {
      skipCfg = null;
    } else {
      skipCfg = parseFloat(data.skip_cfg_above_sigma);
    }
  }

  const { vibe_images, vibe_info, vibe_strength } = extractVibeArrays(data);

  const payload = {
    input: prompt,
    model: model,
    action: action,
    use_new_shared_trial: true,
    parameters: {
      params_version: 3,
      width,
      height,
      scale,
      sampler,
      steps,
      seed,
      n_samples: 1,
      prompt,
      negative_prompt,
      v4_prompt: {
        caption: { base_caption: prompt, char_captions: charCaptions },
        use_coords: useCoords,
        use_order: useOrder
      },
      v4_negative_prompt: {
        caption: { base_caption: negative_prompt, char_captions: negCharCaptions },
        use_order: negUseOrder,
        legacy_uc: data.legacy_uc !== undefined ? (data.legacy_uc === true) : false
      },
      ucPreset: data.ucPreset !== undefined ? data.ucPreset : 4,
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

  if (data.director_reference_images && data.director_reference_images.length > 0) {
    payload.parameters.director_reference_images = data.director_reference_images;
    payload.parameters.director_reference_descriptions = data.director_reference_descriptions || [];
    payload.parameters.director_reference_strength_values = data.director_reference_strength_values || [];
    payload.parameters.director_reference_secondary_strength_values = data.director_reference_secondary_strength_values || [];
    payload.parameters.director_reference_information_extracted = data.director_reference_information_extracted || [];
  }

  if (isInpaint) {
    const inpaintStrength = (data.strength !== undefined && !isNaN(data.strength)) ? parseFloat(data.strength) : 1.0;
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
    payload.parameters.strength = (data.strength !== undefined && !isNaN(data.strength)) ? parseFloat(data.strength) : 0.5;
    payload.parameters.noise = (data.noise !== undefined && !isNaN(data.noise)) ? parseFloat(data.noise) : 0;
  }

  return payload;
}

/**
 * V5 Payload Builder (nai-diffusion-5-full)
 * Supports up to 32 character prompts, single-character positioning, and i2i/infill.
 * Note: V5 does NOT support Character Reference (Director Reference) or Vibe Transfer.
 */
export function createV5Payload(data) {
  const prompt = data.prompt || "";
  const negative_prompt = data.negative_prompt || "";
  const seed = (data.seed !== undefined && data.seed !== null) ? Number(data.seed) : Math.floor(Math.random() * 4294967295);
  const width = data.width || 832;
  const height = data.height || 1216;
  const steps = data.steps || 28;
  const scale = (data.scale !== undefined && data.scale !== null) ? parseFloat(data.scale) : 1.9;
  const sampler = data.sampler || "k_euler_ancestral";

  const isInpaint = data.action === "infill" && !!data.mask;
  const action = isInpaint ? "infill" : (data.image ? "img2img" : "generate");
  const model = isInpaint ? "nai-diffusion-5-full-inpainting" : "nai-diffusion-5-full";

  const { charCaptions, negCharCaptions } = extractCharCaptions(data.char_captions);

  let characterPrompts = [];
  if (Array.isArray(data.characterPrompts) && data.characterPrompts.length > 0) {
    characterPrompts = data.characterPrompts;
  } else if (Array.isArray(data.char_captions) && data.char_captions.length > 0) {
    characterPrompts = data.char_captions.map(c => ({
      prompt: c.prompt || "",
      uc: c.negative_prompt || c.uc || "",
      center: {
        x: (c.x !== undefined && !isNaN(c.x)) ? parseFloat(c.x) : (c.center?.x ?? 0.5),
        y: (c.y !== undefined && !isNaN(c.y)) ? parseFloat(c.y) : (c.center?.y ?? 0.5)
      },
      enabled: c.enabled !== undefined ? c.enabled : true
    }));
  }

  const useCoords = data.v4_prompt_use_coords !== undefined
    ? Boolean(data.v4_prompt_use_coords)
    : (data.use_coords !== undefined ? Boolean(data.use_coords) : false);

  const inpaintStrength = (data.strength !== undefined && !isNaN(data.strength)) ? parseFloat(data.strength) : 1.0;

  const payload = {
    input: prompt,
    model: model,
    action: action,
    parameters: {
      params_version: 4,
      width,
      height,
      scale,
      sampler,
      steps,
      seed,
      n_samples: 1,
      ucPresetId: data.ucPresetId || "heavy",
      qualityPresetId: data.qualityPresetId || "standard",
      autoSmea: data.autoSmea !== undefined ? data.autoSmea : false,
      dynamic_thresholding: data.dynamic_thresholding !== undefined ? data.dynamic_thresholding : false,
      controlnet_strength: 1,
      legacy: false,
      add_original_image: data.add_original_image !== undefined ? data.add_original_image : true,
      cfg_rescale: data.cfg_rescale !== undefined ? parseFloat(data.cfg_rescale) : 0,
      legacy_v3_extend: false,
      use_coords: useCoords,
      legacy_uc: false,
      normalize_reference_strength_multiple: true,
      inpaintImg2ImgStrength: isInpaint ? inpaintStrength : 1,
      characterPrompts: characterPrompts,
      straight_alpha: true,
      tag_hint_qt: data.tag_hint_qt !== undefined ? data.tag_hint_qt : 1,
      tag_hint_uc_preset: data.tag_hint_uc_preset !== undefined ? data.tag_hint_uc_preset : 2,
      v4_prompt: {
        caption: {
          base_caption: prompt,
          char_captions: charCaptions
        },
        use_coords: useCoords,
        use_order: data.v4_prompt_use_order !== undefined ? data.v4_prompt_use_order : true
      },
      v4_negative_prompt: {
        caption: {
          base_caption: negative_prompt,
          char_captions: negCharCaptions
        },
        legacy_uc: false
      },
      negative_prompt: negative_prompt,
      deliberate_euler_ancestral_bug: data.deliberate_euler_ancestral_bug !== undefined ? data.deliberate_euler_ancestral_bug : false,
      prefer_brownian: data.prefer_brownian !== undefined ? data.prefer_brownian : true,
      noise_schedule: data.noise_schedule || "karras",
      image_format: data.image_format || "webp",
      stream: data.stream || "msgpack"
    },
    use_new_shared_trial: true
  };

  if (data.recaptcha_token) {
    payload.recaptcha_token = data.recaptcha_token;
  }

  if (isInpaint) {
    payload.parameters.image = data.image;
    payload.parameters.mask = data.mask;
    payload.parameters.strength = 1.0;
    payload.parameters.noise = 0;
  } else if (data.image) {
    payload.parameters.image = data.image;
    payload.parameters.strength = (data.strength !== undefined && !isNaN(data.strength)) ? parseFloat(data.strength) : 0.5;
    payload.parameters.noise = (data.noise !== undefined && !isNaN(data.noise)) ? parseFloat(data.noise) : 0;
  }

  return payload;
}

/**
 * Main Router / Dispatcher
 * Dispatches to independent builders without cross-contamination.
 */
export function createPayload(version, data) {
  const normVer = String(version || "").toLowerCase().trim();
  if (normVer === "v5" || normVer === "nai5" || normVer === "v5.0") {
    return createV5Payload(data);
  }
  if (normVer === "v4.5" || normVer === "v4" || normVer === "v4-full" || normVer === "v4-curated") {
    return createV45Payload(data);
  }
  return createV3Payload(data);
}

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

  let payload = {};

  if (version === "v4.5") {
    let model = "nai-diffusion-4-5-full";
    if (isInpaint) model = `${model}-inpainting`;

    payload = {
      input: prompt,
      model: model,
      action: action,
      parameters: {
        params_version: 1,
        width, height, scale, sampler, steps, seed,
        n_samples: 1,
        prompt, negative_prompt,
        v4_prompt: {
          caption: { base_caption: prompt, char_captions: [] },
          use_coords: false,
          use_order: false
        },
        v4_negative_prompt: {
          caption: { base_caption: negative_prompt, char_captions: [] },
          use_coords: false,
          use_order: false
        },
        ucPreset: 3,
        qualityToggle: false,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: true,
        cfg_rescale: 0,
        noise_schedule: "native",
        legacy_v3_extend: false,
        uncond_scale: 1.0,
        skip_cfg_above_sigma: null,
        reference_image_multiple: [],
        reference_information_extracted_multiple: [],
        reference_strength_multiple: [],
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
        qualityToggle: false,
        sm: true,
        sm_dyn: true,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: true,
        cfg_rescale: 0,
        noise_schedule: "native",
        legacy_v3_extend: false,
        uncond_scale: 1.0,
        reference_image_multiple: [],
        reference_information_extracted_multiple: [],
        reference_strength_multiple: [],
        extra_noise_seed: seed
      }
    };
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

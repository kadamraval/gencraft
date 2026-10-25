/**
 * The names a setting goes by in the industry. Providers name fields for programmers (enable_prompt_expansion, cfg_scale); the
 * composer shows the standard name for them, the same on every provider. Anything not listed keeps the provider's own title, or its
 * field name read as words.
 */
const PLAIN: Record<string, string> = {
  seed: "Seed",
  negative_prompt: "Negative prompt",
  enable_prompt_expansion: "Prompt enhance",
  prompt_extend: "Prompt enhance",
  prompt_optimizer: "Prompt enhance",
  enhance_prompt: "Prompt enhance",
  expand_prompt: "Prompt enhance",
  prompt_expansion_mode: "Prompt enhance",
  magic_prompt: "Prompt enhance",
  enable_thinking: "Thinking",
  thinking_level: "Thinking level",
  cfg_scale: "CFG scale",
  guidance_scale: "Guidance scale",
  guidance_scale_2: "Guidance scale 2",
  watermark: "Watermark",
  generate_audio: "Audio",
  audio: "Audio",
  multi_shot: "Multi-shot",
  multi_shots: "Multi-shot",
  shot_type: "Shot type",
  generate_multi_clip_switch: "Multi-shot",
  output_format: "Output format",
  google_search: "Google Search",
  image_search: "Image search",
  enable_web_search: "Web search",
  system_prompt: "System prompt",
  camera_fixed: "Camera fixed",
  camera_motion: "Camera motion",
  camera_movement: "Camera motion",
  motion_strength: "Motion strength",
  movement_amplitude: "Movement amplitude",
  num_images: "Images",
  num_inference_steps: "Steps",
  resample_fps: "FPS",
  strength: "Strength",
  style_preset: "Style preset",
  rendering_speed: "Rendering speed",
  background: "Background",
  moderation: "Moderation",
  output_compression: "Output compression",
  person_generation: "Person generation",
  loop: "Loop",
  voice_id: "Voice",
  language_code: "Language",
}

export const plainName = (key: string): string | undefined => PLAIN[key.toLowerCase()]

/** Every word a provider uses for "the model decides" (or "the size of the picture you gave"): shown as Auto, whatever the provider calls it */
const RATIO_VALUES = { adaptive: "Auto", auto: "Auto", match_input_image: "Auto", match_input: "Auto", match_image: "Auto", original: "Auto", "-1": "Auto" }

/** The standard word for a choice a provider names for programmers ("customize" is "Manual", "intelligent" is "Auto"). */
const PLAIN_VALUES: Record<string, Record<string, string>> = {
  shot_type: { customize: "Manual", customized: "Manual", intelligent: "Auto", intelligence: "Auto", single: "Single", multi: "Multi" },
  mode: { std: "Standard", standard: "Standard", pro: "Pro", "4k": "4K" },
  thinking_level: { minimal: "Minimal", medium: "Medium", high: "High" },
  output_format: { jpg: "JPG", jpeg: "JPG", png: "PNG", webp: "WebP", mp4: "MP4" },
  rendering_speed: { turbo: "Turbo", balanced: "Balanced", quality: "Quality" },
  aspect_ratio: RATIO_VALUES,
  ratio: RATIO_VALUES,
  image_size: RATIO_VALUES,
  video_size: RATIO_VALUES,
  size: RATIO_VALUES,
  resolution: RATIO_VALUES,
  dimensions: RATIO_VALUES,
}

export const plainValue = (key: string, value: unknown): string | undefined => PLAIN_VALUES[key.toLowerCase()]?.[String(value).toLowerCase()]

/**
 * The settings the app understands, named once. Every model says which of these it supports and what its
 * provider calls them. The composer, the price estimate and the agent read these names and
 * never a provider's field name.
 */
export type AttributeId =
  | "aspect_ratio"
  | "resolution"
  | "quality"
  | "duration"
  | "count"
  | "sound"
  | "seed"
  | "negative_prompt"
  | "prompt_enhance"
  | "guidance"
  | "strength"
  | "style"
  | "voice"
  | "language"
  | "camera"
  | "motion"
  | "mode"

export interface AttributeDef {
  id: AttributeId
  label: string
  /** common: every model in the task gets it. unique: changes the result on purpose. advanced: under More. */
  tier: "common" | "unique" | "advanced"
}

export const ATTRIBUTES: Record<AttributeId, AttributeDef> = {
  aspect_ratio: { id: "aspect_ratio", label: "Aspect ratio", tier: "common" },
  resolution: { id: "resolution", label: "Resolution", tier: "common" },
  quality: { id: "quality", label: "Quality", tier: "common" },
  duration: { id: "duration", label: "Duration", tier: "common" },
  count: { id: "count", label: "Number of results", tier: "common" },
  sound: { id: "sound", label: "Sound", tier: "common" },
  seed: { id: "seed", label: "Seed", tier: "advanced" },
  negative_prompt: { id: "negative_prompt", label: "Negative prompt", tier: "advanced" },
  prompt_enhance: { id: "prompt_enhance", label: "Prompt enhancer", tier: "advanced" },
  guidance: { id: "guidance", label: "Guidance", tier: "advanced" },
  strength: { id: "strength", label: "Strength", tier: "unique" },
  style: { id: "style", label: "Style", tier: "unique" },
  voice: { id: "voice", label: "Voice", tier: "unique" },
  language: { id: "language", label: "Language", tier: "unique" },
  camera: { id: "camera", label: "Camera", tier: "unique" },
  motion: { id: "motion", label: "Motion", tier: "unique" },
  mode: { id: "mode", label: "Mode", tier: "unique" },
}

/** Which provider field names mean which attribute. Priority is the order here: the first field a model has wins. */
const FIELD_NAMES: Array<[AttributeId, RegExp]> = [
  ["aspect_ratio", /^(aspect_ratio|aspectratio|ratio|image_size|video_size)$/],
  ["resolution", /^(resolution|image_resolution|video_resolution|imagesize|size)$/],
  ["quality", /^quality$/],
  ["duration", /^(duration|duration_seconds|durationseconds|seconds|video_length|length)$/],
  ["count", /^(num_images|n|num_outputs|number_of_images|numberofimages|sample_count|samplecount|batch_size)$/],
  ["seed", /^seed$/],
  ["negative_prompt", /^(negative_prompt|negativeprompt)$/],
  ["prompt_enhance", /^(enhance_prompt|prompt_optimizer|expand_prompt|enable_prompt_expansion|prompt_enhancer|enhanceprompt)$/],
  ["guidance", /^(guidance_scale|cfg_scale|guidance)$/],
  ["strength", /^(strength|image_strength|edit_strength|denoising_strength)$/],
  ["style", /^(style|style_preset|visual_style|art_style|preset)$/],
  ["voice", /^(voice|voice_id|speaker|voice_name)$/],
  ["language", /^(language|language_code|lang)$/],
  ["camera", /^(camera_motion|camera_movement|camera_control|camera|movement_type)$/],
  ["motion", /^(motion_strength|motion_intensity|motion_level|motion_bucket_id|motion)$/],
  ["mode", /^(mode|generation_mode)$/],
]

/** The attribute a provider field stands for, or undefined when it is model-specific. Sound is read elsewhere (canonical.ts). */
export function attributeOfField(key: string): AttributeId | undefined {
  const k = key.toLowerCase()
  return FIELD_NAMES.find(([, re]) => re.test(k))?.[0]
}

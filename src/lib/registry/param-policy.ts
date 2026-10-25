import type { ParamProperty, ParamSchema } from "./types"

/**
 * Which provider fields reach the UI.
 *
 * Every setting a model really supports is listed, in the model's list in Settings and in the composer. Nothing a
 * person could use is dropped. Fields are sorted into tiers: common (the standard set per kind of output), unique
 * (what makes a model different), advanced (seed, negative prompt) and technical (steps, output format, frame
 * rate). Only plumbing is hidden: fields that carry a request's identity or transport (prompt, webhook, request
 * id) and the safety fields, which the app's own safety setting owns.
 *
 * A field we have never classified is kept when it is simple (see isSimple) and reported in the build, so a field
 * a provider adds tomorrow is never silently lost.
 */

type Tier = NonNullable<ParamProperty["tier"]>

interface Rule {
  match: RegExp
  tier: Tier
}

const RULES: Rule[] = [
  // common: the standard set per mode
  { match: /^(aspect_ratio|aspectratio|ratio|image_size|video_size)$/, tier: "common" },
  { match: /^(resolution|image_resolution|video_resolution|quality|size|imagesize)$/, tier: "common" },
  { match: /^(duration|duration_seconds|durationseconds|seconds|video_length|length)$/, tier: "common" },
  { match: /^(num_images|n|num_outputs|number_of_images|numberofimages|sample_count|samplecount|batch_size|series_amount)$/, tier: "common" },
  { match: /^(audio|generate_audio|with_audio|enable_audio|audio_enabled|generateaudio|generate_audio_switch)$/, tier: "common" },
  // unique but essential: they change the result in a way a creator controls on purpose
  { match: /^(camera_motion|camera_movement|camera_control|camera|movement_type)$/, tier: "unique" },
  { match: /^(style|style_preset|visual_style|art_style|preset)$/, tier: "unique" },
  { match: /^(strength|image_strength|edit_strength|denoising_strength)$/, tier: "unique" },
  { match: /^(voice|voice_id|speaker|voice_name)$/, tier: "unique" },
  { match: /^(language|language_code|lang)$/, tier: "unique" },
  { match: /^(loop|looping|seamless_loop)$/, tier: "unique" },
  { match: /^(motion_strength|motion_intensity|motion_level|motion_bucket_id|motion)$/, tier: "unique" },
  { match: /^(shot_type|multi_shots?|multi_prompt|shots|generate_multi_clip_switch)$/, tier: "unique" },
  { match: /^(movement_amplitude|character_orientation|pro_mode|use_turbo|enable_dynamic_duration|crop_to_fill|enable_caption)$/, tier: "unique" },
  // voice and sound: what a speaker sounds like, and what happens to the sound already in a clip
  { match: /^(reference_text|stability|similarity_boost|bgm|keep_original_sound|disable_music_track|enable_speech_enhancement)$/, tier: "unique" },
  // music and speech: words to sing, how long, how fast, how it should feel
  { match: /^(lyrics|lyrics_prompt|music_length_ms|seconds_total|force_instrumental|speed|style_instructions|language_boost|voice_description|emotion|use_speaker_boost|prompt_influence|remove_background_noise|noise_reduction|accuracy)$/, tier: "unique" },
  // picture and clip looks a creator picks on purpose
  { match: /^(camera_fixed|lipsync_mode|effect|template|ingredients_mode|edit_precision|style_scale|texture|detail|enhancement_strength|color_preservation|enhance_realism|damage_level|expand_left|expand_right|expand_top|expand_bottom|extend_seconds_before|extend_seconds_after|mask_start|mask_end)$/, tier: "unique" },
  // trimming and clean-up controls a creator sets on purpose
  { match: /^(start_time|end_time|mask_start_seconds|mask_end_seconds|face_enhancement|denoise|sharpen)$/, tier: "unique" },
  { match: /^(background|transparent_background|output_background)$/, tier: "unique" },
  { match: /^(mode|generation_mode)$/, tier: "unique" },
  { match: /^(style_id|style_name|rendering_speed|upscale_factor|scale)$/, tier: "unique" },
  // advanced: kept under More
  { match: /^(seed)$/, tier: "advanced" },
  { match: /^(negative_prompt|negativeprompt)$/, tier: "advanced" },
  { match: /^(enhance_prompt|prompt_optimizer|expand_prompt|enable_prompt_expansion|prompt_enhancer|enhanceprompt)$/, tier: "advanced" },
  { match: /^(guidance_scale|cfg_scale|guidance)$/, tier: "advanced" },
  { match: /^(gender|previous_text|next_text|use_refiner|use_reprompt|fix_compression|auto_crop|preprocess|i2v_stability|need_volume_normalization|respect_sections_durations|model_mode|audio_setting|enable_transcription|resample_fps|dimensions)$/, tier: "advanced" },
  { match: /^(enhance_prompt_mode|thinking_type|apply_text_normalization|guidance_scale_2|prompt_expansion|autoprompt|draft|subject_detection|face_enhancement_creativity|face_enhancement_strength)$/, tier: "advanced" },
  { match: /^(creativity|enable_web_search|thinking_level|enable_thinking|system_prompt|prompt_expansion_mode|preserve_aspect_ratio|keep_original_aspect|style_match)$/, tier: "advanced" },
]

/**
 * Plumbing: fields that carry a request's identity or transport, ids of earlier assets, and the safety fields.
 * These are not settings a person can use, so they are the only fields never listed. Safety has its own switch
 * in the app (see safety.ts), so listing the provider's field as well would show it twice.
 */
const PLUMBING =
  /^(prompt|text|input|webhook_url|webhook|sync_mode|stream|user|request_id|model|version|task|title|file_url|web_url|pdf_url|end_user_id|result_type|response_format|format|instrumental_id|vocal_id|reference_id|melody_id|draft_id|preview_text|speaker_voice_embedding_file_url|return_byteplus_urls|return_frames_zip|timestamps|middle_frame_time|grid_position_x|grid_position_y|x_start|x_end|y_start|y_end|enable_safety_checker|safety_tolerance|safety_checker|safety_filter_level|safety_checker_version|disable_safety_checker|enable_prompt_safety|enable_output_safety_checker|moderation|temperature|top_p|top_k|max_tokens|max_new_tokens|repetition_penalty|subtalker_\w+)$/

/** Low-level settings a provider documents. Listed under Technical, in Settings and under More in the composer. */
const TECHNICAL =
  /^(num_inference_steps|steps|steps_num|scheduler|sampler|person_generation|output_format|output_quality|output_compression|image_format|video_quality|video_write_mode|video_output_type|codec|bitrate|bitrate_mode|acceleration|go_fast|auto_fix|use_lora|lora_scale|control_scale|control_start|control_end|control_lora_strength|image_prompt_strength|init_noise_level|refiner_switch|expansion_model|max_images|limit_generations|crop_output|tile_size|tile_stride|tiling_mode|num_frames|frames_per_second|fps|shift|adjust_fps_for_interpolation|interpolator_model|num_interpolated_frames|video_strength|camera_lora|camera_lora_scale|distill_lora_second_pass_scale|use_multiscale|reverse_video|instruction|mask_url|loras)$/

/** A field the composer can show safely without knowing what it is: a choice list, a switch, or a bounded number. */
export function isSimple(p: ParamProperty): boolean {
  if (p.enum?.length) return true
  if (p.type === "boolean") return true
  return (p.type === "number" || p.type === "integer") && p.minimum !== undefined && p.maximum !== undefined
}

export function classifyParam(key: string): Tier | "plumbing" | "unknown" {
  const k = key.toLowerCase()
  for (const rule of RULES) if (rule.match.test(k)) return rule.tier
  if (PLUMBING.test(k)) return "plumbing"
  if (TECHNICAL.test(k)) return "technical"
  return "unknown"
}

/** True for a field that is never listed: request plumbing and the safety fields. */
export const isPlumbing = (key: string): boolean => classifyParam(key) === "plumbing"

export interface PolicyResult {
  params: ParamSchema
  /** Fields that were neither classified nor known plumbing: surfaced in the build report for review */
  unknown: string[]
}

/** Keeps upload slots and every field a person could use, tags each with its tier. Only plumbing is left out. */
export function applyParamPolicy(schema: ParamSchema): PolicyResult {
  const properties: Record<string, ParamProperty> = {}
  const unknown: string[] = []
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.format) {
      properties[key] = prop
      continue
    }
    const tier = classifyParam(key)
    if (tier === "plumbing") continue
    if (tier === "unknown") {
      // Never lose a new provider field. A simple one (a list of choices, a switch, a number with limits) is kept
      // under More until someone classifies it; it is also reported so it gets a proper place.
      unknown.push(key)
      if (isSimple(prop)) properties[key] = { ...prop, tier: "advanced" }
      continue
    }
    properties[key] = { ...prop, tier }
  }
  return {
    params: { type: "object", properties, required: schema.required?.filter((r) => r in properties) },
    unknown,
  }
}

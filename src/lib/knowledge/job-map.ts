import type { RegistryModality } from "../registry/types"

/**
 * The maker list declares each model as (type, category, job). The database speaks in job ids (see jobs.json). This is the one table
 * between them, so a job is never worked out from a model's name.
 */
const TABLE: Record<string, string> = {
  "image|text-to-image|generate": "text-to-image",
  "image|image-to-image|edit": "image-edit",
  "image|image-to-image|fill": "image-outpaint",
  "image|image-to-image|remove-background": "image-remove-background",
  "image|image-to-image|remove-object": "image-remove-object",
  "image|image-to-image|restore": "image-restore",
  "image|image-to-image|upscale": "image-upscale",
  "video|text-to-video|generate": "text-to-video",
  "video|image-to-video|generate": "image-to-video",
  "video|reference-to-video|generate": "reference-to-video",
  "video|audio-to-video|generate": "video-lip-sync",
  "video|audio-to-video|dub": "video-dub",
  "video|video-to-video|edit": "video-edit",
  "video|video-to-video|extend": "video-extend",
  "video|video-to-video|interpolate": "video-slow-motion",
  "video|video-to-video|motion-transfer": "video-motion-transfer",
  "video|video-to-video|reframe": "video-reframe",
  "video|video-to-video|relight": "video-relight",
  "video|video-to-video|remove-background": "video-remove-background",
  "video|video-to-video|restore": "video-denoise",
  "video|video-to-video|upscale": "video-upscale",
  "audio|text-to-speech|generate": "audio-text-to-speech",
  "audio|text-to-audio|generate": "audio-text-to-music",
  "audio|speech-to-text|transcribe": "audio-transcribe",
  "audio|audio-to-audio|isolate-voice": "audio-voice-isolation",
  "audio|audio-to-audio|noise-reduction": "audio-noise-reduction",
  "audio|audio-to-audio|separate-audio": "audio-stems",
  "audio|audio-to-audio|voice-change": "audio-voice-changer",
}

/**
 * Jobs a picture model that follows instructions can do by being told to (the AI tool carries the sentence, see `instruction` in the tool
 * catalog). Upscaling, restoring and background removal are not here: a generator redraws the picture, it does not do those.
 */
export const ALTERNATIVE_JOBS = ["image-remove-object", "image-restyle", "image-outpaint", "image-relight"] as const

/** The job id for a declared (type, category, job), or undefined when the table has no row for it */
export function jobIdFor(type: RegistryModality, category: string, job: string): string | undefined {
  return TABLE[`${type}|${category}|${job}`]
}

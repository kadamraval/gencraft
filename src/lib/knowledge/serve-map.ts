import type { AppCategory } from "../registry/types"

/**
 * The maker list declares each model as (category, task, action). The database speaks in task and tool ids (see tasks.json and
 * tools.json). This is the one table between them, so a task or tool is never worked out from a model's name.
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

/** The task or tool id for a declared (category, task, action), or undefined when the table has no row for it */
export function servesFor(category: AppCategory, task: string, action: string): string | undefined {
  return TABLE[`${category}|${task}|${action}`]
}

import type { ModelRecord } from "../registry/types"

/**
 * Replicate files its models under topic collections, and a collection says what its models are for. This is the one table between a
 * collection and the database's job ids. Where a collection holds several jobs, the model's own endpoint name picks among the few
 * the table lists; anything it does not name is left out, never guessed.
 */

const isVideo = (r: Pick<ModelRecord, "modality" | "task">) => r.modality === "video" || r.task === "video-to-video"

export function jobsOfCollection(slug: string, rec: Pick<ModelRecord, "modality" | "task" | "endpoint">): string[] {
  const name = rec.endpoint.toLowerCase()
  switch (slug) {
    case "text-to-image":
    case "flux":
      return rec.modality === "image" && rec.task !== "image-to-image" ? ["text-to-image"] : []
    case "image-editing":
      return ["image-edit"]
    case "text-to-video":
      return ["text-to-video"]
    case "image-to-video":
    case "wan-video":
      return rec.modality === "video" ? ["image-to-video"] : []
    case "video-editing":
      return /extend/.test(name) ? ["video-extend"] : /reframe/.test(name) ? ["video-reframe"] : ["video-edit"]
    case "lipsync":
      return ["video-lip-sync"]
    case "remove-backgrounds":
      return [isVideo(rec) ? "video-remove-background" : "image-remove-background"]
    case "super-resolution":
      return [isVideo(rec) ? "video-upscale" : "image-upscale"]
    case "ai-image-restoration":
      return /colori[sz]/.test(name) ? ["image-colorize"] : ["image-restore"]
    case "ai-enhance-videos":
      return /interpol|slow|frame|rife/.test(name) ? ["video-slow-motion"] : /denois|deblur|restor/.test(name) ? ["video-denoise"] : /upscal|esrgan|enhanc|super/.test(name) ? ["video-upscale"] : []
    case "sing-with-voices":
      return ["audio-voice-changer"]
    case "text-to-speech":
      return ["audio-text-to-speech"]
    case "ai-music-generation":
      return ["audio-text-to-music"]
    case "speech-to-text":
      return ["audio-transcribe"]
    default:
      return []
  }
}

/** The collections the build reads */
export const JOB_COLLECTIONS = ["text-to-image", "flux", "image-editing", "text-to-video", "image-to-video", "wan-video", "video-editing", "lipsync", "remove-backgrounds", "super-resolution", "ai-image-restoration", "ai-enhance-videos", "sing-with-voices", "text-to-speech", "ai-music-generation", "speech-to-text"]

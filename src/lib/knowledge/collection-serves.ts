import type { ModelRecord } from "../registry/types"
import { actionOf } from "../sheet/actions"

/**
 * Replicate files its models under topic collections, and a collection says what its models are for. This is the one table between a
 * collection and the database's task and tool ids. Where a collection holds several, the model's own endpoint name picks among the few
 * the table lists; anything it does not name is left out, never guessed.
 */

const isVideo = (r: Pick<ModelRecord, "category" | "task">) => r.category === "video" || r.task === "video-to-video"

export function servesOfCollection(slug: string, rec: Pick<ModelRecord, "category" | "task" | "endpoint">): string[] {
  const name = rec.endpoint.toLowerCase()
  switch (slug) {
    case "text-to-image":
    case "flux":
      return rec.category === "image" && rec.task !== "image-to-image" ? ["text-to-image"] : []
    case "image-editing": {
      // An editor named for one tool (expand, remove background, upscale ...) is that tool, not general editing
      const action = actionOf(rec.endpoint, "image-to-image").action
      const TOOL: Record<string, string> = { fill: "image-outpaint", "remove-background": "image-remove-background", upscale: "image-upscale", restore: "image-restore", "remove-object": "image-remove-object", relight: "image-relight", restyle: "image-restyle", colorize: "image-colorize" }
      return [TOOL[action] ?? "image-edit"]
    }
    case "text-to-video":
      return ["text-to-video"]
    case "image-to-video":
    case "wan-video":
      return rec.category === "video" ? ["image-to-video"] : []
    case "video-editing": {
      // A model in it that makes the sound of a clip (ThinkSound, foley) is sound effects for a video
      if (rec.category === "audio") return [/music|score|soundtrack/.test(name) ? "video-music" : "video-sound-effects"]
      // An editor named for one tool (upscale, deblur, colorize, extend, reframe ...) is that tool, not general editing
      const action = actionOf(rec.endpoint, "video-to-video").action
      // Captioning is not editing, and not a tool the app offers
      if (action === "caption") return []
      const TOOL: Record<string, string> = { extend: "video-extend", reframe: "video-reframe", upscale: "video-upscale", restore: "video-denoise", interpolate: "video-slow-motion", "remove-background": "video-remove-background", "remove-object": "video-remove-object", colorize: "video-colorize", relight: "video-relight", restyle: "video-restyle", "lip-sync": "video-lip-sync", "motion-transfer": "video-motion-transfer", dub: "video-dub" }
      if (TOOL[action]) return [TOOL[action]]
      // The collection also holds plain utilities (split, merge, convert): only a model whose name says it edits is edit by prompt
      return action === "edit" || /omni|v2v|video-to-video|aleph|modify/.test(name) ? ["video-edit"] : []
    }
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
      // Sound effects sit in the same collection; the model's own name tells them apart
      return /sound-?effects?|sfx|foley/.test(name) ? ["audio-text-to-sfx"] : ["audio-text-to-music"]
    case "speech-to-text":
      return ["audio-transcribe"]
    default:
      return []
  }
}

/** The collections the build reads */
export const SERVE_COLLECTIONS = ["text-to-image", "flux", "image-editing", "text-to-video", "image-to-video", "wan-video", "video-editing", "lipsync", "remove-backgrounds", "super-resolution", "ai-image-restoration", "ai-enhance-videos", "sing-with-voices", "text-to-speech", "ai-music-generation", "speech-to-text"]

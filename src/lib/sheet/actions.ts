import type { ProviderTask, Action } from "./types"

/**
 * What an endpoint does (its action). The provider task (input to output) is not enough: video to video holds editing, extending,
 * lip-sync, upscaling and background removal alike. The one structured thing a host publishes about it is the endpoint id, whose
 * last segments are the host's own names for the action ("extend-video", "lipsync", "video-background-removal"). This file is the fixed
 * table of those names. A name that is not in the table is an action we do not know: it is reported as "other", never guessed.
 */

interface Rule {
  action: Action
  /** Segment names, as the host writes them, tested against whole path segments */
  segments: RegExp
}

const RULES: Rule[] = [
  { action: "remove-background", segments: /^(video-)?background-removal$|^remove-background$|^remove-bg$|^rembg$|^background-remover$|^matting$|^birefnet$|^green-screen/ },
  { action: "upscale", segments: /^(.*-)?upscal(e|er|ing)$|^upscale$|^crystal-video-upscaler$|^super-resolution$|^(real-)?esrgan$|^seedvr\d*$|^flashvsr$/ },
  { action: "interpolate", segments: /^(frame-)?interpolat(e|ion)$|^rife$|^film$|^slow-?mo(tion)?$/ },
  { action: "relight", segments: /^relight(ing)?$|^ic-light$/ },
  { action: "reframe", segments: /^(long-)?reframe$/ },
  { action: "remove-object", segments: /^object-removal$|^remove-object$|^eraser$|^finegrain-eraser$|^erase$/ },
  { action: "fill", segments: /^(inpaint(ing)?|outpaint(ing)?|expand|fill)$/ },
  { action: "colorize", segments: /^coloriz(e|ation)$|^ddcolor$/ },
  { action: "restore", segments: /^(photo-)?restor(e|ation)$|^deblur$|^denoise$|^retouch$|^sharpen$/ },
  { action: "lip-sync", segments: /^lip-?sync$|^sync-lipsync$|^lipsync$|^avatar$/ },
  { action: "restyle", segments: /^style-transfer$|(^|-)restyle$/ },
  { action: "motion-transfer", segments: /^motion-(control|transfer)$|^dreamactor$|^animate$/ },
  { action: "extend", segments: /^(video-)?extend(-video|-audio)?$|^video-extension$/ },
  { action: "isolate-voice", segments: /^audio-isolation$|^isolat(e|ion)$/ },
  { action: "noise-reduction", segments: /^(clean-audio|deepfilternet\d*|denoise-audio|resemble-enhance|denoiser|speech-enhance(ment)?)$/ },
  { action: "separate-audio", segments: /^(demucs|separate|span-separate|stem(s)?|visual-separate)$/ },
  { action: "voice-change", segments: /^voice-(changer|clone|conversion)$/ },
  { action: "dub", segments: /^dub(bing)?$/ },
  { action: "transcribe", segments: /^(speech-to-text|scribe(-v\d+)?|transcri(be|ption))$/ },
  { action: "caption", segments: /^(auto-?caption(s|ing)?|subtitles?|captions?)$/ },
  { action: "edit", segments: /^(edit|edit-image|edit-video|video-edit|image-edit|reference-edit-video|multi-edit|instruct)$/ },
]

/** The provider tasks whose models make something from a prompt or a picture: a plain model in these is a generator */
const GENERATES: ProviderTask[] = ["text-to-image", "text-to-video", "image-to-video", "reference-to-video", "text-to-speech", "text-to-audio", "chat"]

export interface ActionResult {
  action: Action
  /** The segment that decided it, or empty when the model is a plain generator */
  by: string
}

/** Cleaning sound is noise reduction, whatever word the name uses for it ("denoise", "restore") */
const tuned = (action: Action, task: ProviderTask | undefined): Action => (task === "audio-to-audio" && action === "restore" ? "noise-reduction" : action)

export function actionOf(endpoint: string, task: ProviderTask | undefined): ActionResult {
  const segments = endpoint.toLowerCase().split("/").slice(1)
  // The last segments carry the action; a version or tier segment such as "v3" or "pro" comes after it
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!
    for (const rule of RULES) if (rule.segments.test(seg)) return { action: tuned(rule.action, task), by: seg }
  }
  // A name made of several words (Replicate: "kling-v3-motion-control", "demucs-api") carries the action as a run of its words
  const words = (segments[segments.length - 1] ?? "").split("-")
  for (let len = words.length - 1; len >= 1; len--) {
    for (let at = 0; at + len <= words.length; at++) {
      const part = words.slice(at, at + len).join("-")
      for (const rule of RULES) if (rule.segments.test(part)) return { action: tuned(rule.action, task), by: part }
    }
  }
  if (task && GENERATES.includes(task)) return { action: "generate", by: "" }
  return { action: "other", by: "" }
}

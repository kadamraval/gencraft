import type { Category, Job } from "./types"

/**
 * What a model is for inside its category. The category (input to output) is not enough: video to video holds editing, extending,
 * lip-sync, upscaling and background removal alike. The one structured thing a host publishes about it is the endpoint id, whose
 * last segments are the host's own names for the job ("extend-video", "lipsync", "video-background-removal"). This file is the fixed
 * table of those names. A name that is not in the table is a job we do not know: it is reported as "other", never guessed.
 */

interface Rule {
  job: Job
  /** Segment names, as the host writes them, tested against whole path segments */
  segments: RegExp
}

const RULES: Rule[] = [
  { job: "remove-background", segments: /^(video-)?background-removal$|^remove-background$|^remove-bg$|^rembg$|^background-remover$|^matting$|^birefnet$|^green-screen/ },
  { job: "upscale", segments: /^(.*-)?upscal(e|er|ing)$|^upscale$|^crystal-video-upscaler$|^super-resolution$|^esrgan$/ },
  { job: "interpolate", segments: /^(frame-)?interpolat(e|ion)$|^rife$|^film$|^slow-?mo(tion)?$/ },
  { job: "relight", segments: /^relight(ing)?$|^ic-light$/ },
  { job: "reframe", segments: /^(long-)?reframe$/ },
  { job: "remove-object", segments: /^object-removal$|^remove-object$|^eraser$|^finegrain-eraser$|^erase$/ },
  { job: "fill", segments: /^(inpaint(ing)?|outpaint(ing)?|expand|fill)$/ },
  { job: "colorize", segments: /^coloriz(e|ation)$/ },
  { job: "restore", segments: /^(photo-)?restor(e|ation)$|^deblur$|^denoise$|^retouch$|^sharpen$/ },
  { job: "lip-sync", segments: /^lip-?sync$|^sync-lipsync$|^lipsync$|^avatar$/ },
  { job: "restyle", segments: /^style-transfer$|(^|-)restyle$/ },
  { job: "motion-transfer", segments: /^motion-(control|transfer)$|^dreamactor$|^animate$/ },
  { job: "extend", segments: /^(video-)?extend(-video|-audio)?$|^video-extension$/ },
  { job: "isolate-voice", segments: /^audio-isolation$|^isolat(e|ion)$/ },
  { job: "noise-reduction", segments: /^(clean-audio|deepfilternet\d*|denoise-audio)$/ },
  { job: "separate-audio", segments: /^(demucs|separate|span-separate|stem(s)?|visual-separate)$/ },
  { job: "voice-change", segments: /^voice-(changer|clone|conversion)$/ },
  { job: "dub", segments: /^dub(bing)?$/ },
  { job: "transcribe", segments: /^(speech-to-text|scribe(-v\d+)?|transcri(be|ption))$/ },
  { job: "edit", segments: /^(edit|edit-image|edit-video|video-edit|image-edit|reference-edit-video|multi-edit|instruct)$/ },
]

/** The categories whose models make something from a prompt or a picture: a plain model in these is a generator */
const GENERATES: Category[] = ["text-to-image", "text-to-video", "image-to-video", "reference-to-video", "text-to-speech", "text-to-audio", "chat"]

export interface JobResult {
  job: Job
  /** The segment that decided it, or empty when the model is a plain generator */
  by: string
}

export function jobOf(endpoint: string, category: Category | undefined): JobResult {
  const segments = endpoint.toLowerCase().split("/").slice(1)
  // The last segments carry the job; a version or tier segment such as "v3" or "pro" comes after it
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!
    for (const rule of RULES) if (rule.segments.test(seg)) return { job: rule.job, by: seg }
  }
  if (category && GENERATES.includes(category)) return { job: "generate", by: "" }
  return { job: "other", by: "" }
}

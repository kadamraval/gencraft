import type { ParamProperty, ParamSchema } from "../types"

/**
 * The settings Google documents for its image and speech models, read 2026-10-13:
 *   ai.google.dev/gemini-api/docs/image-generation   aspect ratios, sizes, thinking levels, search grounding
 *   ai.google.dev/gemini-api/docs/speech-generation  30 prebuilt voices, a style for each turn
 * Google's own list is the master, so these are not marked untested.
 */

const RATIOS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
const VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina",
  "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia",
  "Sadaltager", "Sulafat",
]

const prop = (p: ParamProperty): ParamProperty => p

export function geminiImageParams(id: string): ParamSchema {
  const lite = /flash-lite-image/.test(id)
  const flash31 = /3\.1-flash-image/.test(id)
  const banana21 = /nano-banana-2\.1/.test(id)
  const properties: Record<string, ParamProperty> = {
    // Sizes are case-sensitive: "1K", not "1k". Flash Lite makes 1K only; 3.1 Flash Image adds 512px.
    image_size: prop({ type: "string", title: "Size", enum: lite ? ["1K"] : flash31 ? ["512px", "1K", "2K", "4K"] : ["1K", "2K", "4K"], default: "1K", tier: "common" }),
    // The page lists ten ratios for Flash Lite and gives examples for the others, so the others stay untested until a run settles them
    aspect_ratio: prop({ type: "string", title: "Aspect ratio", enum: ["auto", ...RATIOS], default: "auto", tier: "common", ...(lite ? {} : { untested: true }) }),
  }
  // Thinking cannot be switched off on Gemini 3 image models. Gemini 3 Pro Image has no level to choose.
  if (banana21) properties.thinking_level = prop({ type: "string", title: "Thinking level", enum: ["minimal", "medium", "high"], default: "medium", tier: "unique" })
  else if (lite || flash31) properties.thinking_level = prop({ type: "string", title: "Thinking level", enum: ["minimal", "high"], default: "minimal", tier: "unique" })
  properties.web_search = prop({ type: "boolean", title: "Search the web", description: "Let the model look things up on the web while it draws.", default: false, tier: "unique" })
  // Image search is on Nano Banana 2.1 and 3.1 Flash Image only
  if (banana21 || flash31) properties.image_search = prop({ type: "boolean", title: "Search images", description: "Let the model look at pictures from search. Needs web search on.", default: false, tier: "advanced" })
  return { type: "object", properties }
}

export function geminiSpeechParams(): ParamSchema {
  return {
    type: "object",
    properties: {
      voice: prop({ type: "string", title: "Voice", enum: VOICES, default: "Kore", tier: "unique" }),
      style: prop({ type: "string", title: "Style", description: "How to say it, such as 'whispered urgently' or 'calm and relaxed'. Not part of the spoken words.", tier: "unique" }),
    },
  }
}

/**
 * Gemini Omni Flash, Google's video model in the Gemini API (the Veo previews were shut down on 2026-10-22). Read 2026-10-23 from
 * ai.google.dev/gemini-api/docs/omni: the aspect ratio and the resolution are the two settings of a video response; the length is the model's own.
 * 1080p and 4k are upscaled from the 720p the model makes.
 */
export function geminiOmniParams(): ParamSchema {
  return {
    type: "object",
    properties: {
      aspect_ratio: prop({ type: "string", title: "Aspect ratio", enum: ["16:9", "9:16"], default: "16:9", tier: "common" }),
      resolution: prop({ type: "string", title: "Resolution", enum: ["360p", "720p", "1080p", "4k"], default: "720p", tier: "common" }),
    },
  }
}

/**
 * Gemini 3.5 Transcribe, Google's speech-to-text model (read 2026-10-23 from ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe):
 * it detects the language itself, and can add word-level timestamps and mark up to 8 speakers. The two features cannot be used together,
 * and neither works with custom vocabulary.
 */
export function geminiTranscribeParams(): ParamSchema {
  return {
    type: "object",
    properties: {
      language: prop({ type: "string", title: "Language", description: "A BCP-47 code such as en-US or hi-IN. Leave empty to detect the language.", tier: "common" }),
      word_timestamps: prop({ type: "boolean", title: "Word timestamps", default: false, tier: "common" }),
      speaker_diarization: prop({ type: "boolean", title: "Mark speakers", description: "Tells up to 8 speakers apart. Not with word timestamps.", default: false, tier: "common" }),
    },
  }
}

import type { ModelPrice, ModelRecord, ParamProperty, ParamSchema, PriceRule, RegistryModality } from "../types"
import { withReferenceSlot } from "../ref-limits"

export interface ORModel {
  id: string
  name: string
  description?: string
  created?: number
  context_length?: number
  expiration_date?: string | null
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
  supported_voices?: string[] | null
  pricing?: {
    prompt?: string
    completion?: string
    image?: string
    image_output?: string
    audio?: string
    audio_output?: string
    video?: string
    video_per_second?: string
    second?: string
    request?: string
    input_cache_read?: string
  }
  supported_parameters?: string[]
  supported_aspect_ratios?: string[]
  supported_resolutions?: string[]
  supported_durations?: number[]
}

const PARAM_DEFS: Record<string, ParamProperty> = {
  temperature: { type: "number", title: "Temperature", minimum: 0, maximum: 2, default: 1 },
  top_p: { type: "number", title: "Top P", minimum: 0, maximum: 1, default: 1 },
  max_tokens: { type: "integer", title: "Max tokens", minimum: 1, maximum: 64000, default: 4096 },
  seed: { type: "integer", title: "Seed" },
  reasoning_effort: { type: "string", title: "Reasoning effort", enum: ["low", "medium", "high"], default: "medium", tier: "unique" },
}

export function mapOpenRouterModel(m: ORModel, fetchedAt: string): ModelRecord | null {
  const out = m.architecture?.output_modalities ?? []
  // OpenRouter lists speech and transcription models as kinds of their own
  const isSpeechKind = out.includes("speech") || out.includes("transcription")
  const isAudioModel = isSpeechKind || out.includes("audio") && (!out.includes("text") || /\baudio\b|\btts\b|\bspeech\b|\bvoice\b|lyria|music|song/i.test(m.id))
  const modality: RegistryModality | null = out.includes("video")
    ? "video"
    : out.includes("image")
      ? "image"
      : isAudioModel
        ? "audio"
        : out.includes("text")
          ? "text"
          : null
  if (!modality) return null
  // Negative prices mark routers that pick a model at run time. They have no price of their own.
  if (Number(m.pricing?.prompt) < 0) return null

  const properties: ParamSchema["properties"] = {}
  for (const p of m.supported_parameters ?? []) {
    const def = PARAM_DEFS[p]
    if (def) properties[p] = def
  }
  const isImage = modality === "image"
  const isVideo = modality === "video"
  const isAudio = modality === "audio"

  if (isImage) {
    // Chat sampling settings do not shape a picture. The images endpoint takes the fields below; each model's provider decides
    // which of them it honours, so they are marked untested until a run settles it.
    // https://openrouter.ai/docs/guides/overview/multimodal/image-generation (read 2026-10-13)
    for (const k of ["max_tokens", "temperature", "top_p"]) delete properties[k]
    properties.aspect_ratio = { type: "string", title: "Aspect ratio", enum: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "21:9"], default: "auto", tier: "common", untested: true }
    properties.resolution = { type: "string", title: "Size", enum: ["512", "768", "1K", "1.5K", "2K", "4K"], tier: "common", untested: true }
    properties.quality = { type: "string", title: "Quality", enum: ["auto", "low", "medium", "high"], default: "auto", tier: "unique", untested: true }
    properties.output_format = { type: "string", title: "Output format", enum: ["png", "jpeg", "webp"], tier: "unique", untested: true }
    properties.background = { type: "string", title: "Background", enum: ["auto", "transparent", "opaque"], default: "auto", tier: "advanced", untested: true }
    properties.n = { type: "integer", title: "Images", minimum: 1, maximum: 10, default: 1, tier: "common" }
  } else if (isVideo) {
    for (const k of ["max_tokens", "temperature", "top_p"]) delete properties[k]
    const aspects = m.supported_aspect_ratios?.length ? m.supported_aspect_ratios : ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
    const resolutions = m.supported_resolutions?.length ? m.supported_resolutions : ["480p", "720p", "1080p"]
    const durations = m.supported_durations?.length ? m.supported_durations : [5, 8, 10]
    properties.aspect_ratio = { type: "string", title: "Aspect ratio", enum: aspects, default: aspects[0] ?? "16:9", tier: "common" }
    properties.resolution = { type: "string", title: "Resolution", enum: resolutions, default: resolutions.includes("720p") ? "720p" : resolutions[0], tier: "common" }
    properties.duration = { type: "integer", title: "Duration (s)", enum: durations, default: durations[0] ?? 5, tier: "common" }
    properties.generate_audio = { type: "boolean", title: "Generate audio", default: false, tier: "common", untested: true }
    properties.seed = { type: "integer", title: "Seed", tier: "advanced", untested: true }
  } else if (isAudio) {
    for (const k of ["max_tokens", "temperature", "top_p"]) delete properties[k]
    if (out.includes("transcription")) {
      // speech to text: the audio to read is the one input the model takes
      properties.audio = { type: "string", title: "Audio", format: "audio", tier: "common" }
    } else {
      const voices = Array.isArray(m.supported_voices) && m.supported_voices.length > 0 ? m.supported_voices.map(String) : ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"]
      properties.voice = { type: "string", title: "Voice", enum: voices, default: voices[0], tier: "unique" }
    }
  }

  const promptPerTok = Number(m.pricing?.prompt)
  const completionPerTok = Number(m.pricing?.completion)
  const flatImage = Number(m.pricing?.image)
  const imageTokens = Number(m.pricing?.image_output)
  const videoPerSec = Number(m.pricing?.video_per_second ?? m.pricing?.second)
  const flatVideo = Number(m.pricing?.video ?? m.pricing?.request)
  const audioTokens = Number(m.pricing?.audio_output ?? m.pricing?.audio)
  // For image models, `image_output` is what generating costs, per image token. The plain `image` field is the
  // price of an image sent IN, so it is used only when no output price is listed.
  const cachedPerTok = Number(m.pricing?.input_cache_read)
  let price: Pick<ModelRecord["price"], "unit" | "amount" | "outputAmount" | "cachedAmount" | "rules">
  if (isVideo && videoPerSec > 0) price = { unit: "per_second", amount: videoPerSec }
  else if (isVideo && flatVideo > 0) price = { unit: "per_run", amount: flatVideo }
  else if (isVideo) price = { unit: "unknown", amount: null }
  else if (isImage && imageTokens > 0) price = { unit: "per_1m_tokens", amount: imageTokens * 1_000_000 }
  else if (isImage && flatImage > 0) price = { unit: "per_image", amount: flatImage }
  else if (isImage) price = { unit: "unknown", amount: null }
  else if (isSpeechKind && out.includes("transcription")) {
    // OpenRouter bills transcription per second of audio, or per token when the model also has an output price. A figure of a cent or more per
    // "second" cannot be one: those (Microsoft MAI Transcribe, $0.36) are billed per hour.
    if (completionPerTok > 0) price = { unit: "per_1m_tokens", amount: promptPerTok * 1_000_000, outputAmount: completionPerTok * 1_000_000 }
    else if (promptPerTok >= 0.01) price = { unit: "per_minute", amount: promptPerTok / 60 }
    else if (promptPerTok >= 0) price = { unit: "per_minute", amount: promptPerTok * 60 }
    else price = { unit: "unknown", amount: null }
  } else if (isSpeechKind) {
    // Text to speech is billed per input character; a model with an output price as well (Gemini TTS) is billed per token
    if (completionPerTok > 0) price = { unit: "per_1m_tokens", amount: promptPerTok * 1_000_000, outputAmount: completionPerTok * 1_000_000 }
    else if (promptPerTok >= 0) price = { unit: "per_1k_chars", amount: promptPerTok * 1000 }
    else price = { unit: "unknown", amount: null }
  } else if (isAudio && audioTokens > 0) price = { unit: "per_1m_tokens", amount: Number.isFinite(promptPerTok) && promptPerTok > 0 ? promptPerTok * 1_000_000 : audioTokens * 1_000_000, outputAmount: audioTokens * 1_000_000 }
  else price = { unit: "per_1m_tokens", amount: Number.isFinite(promptPerTok) ? promptPerTok * 1_000_000 : null, outputAmount: Number.isFinite(completionPerTok) ? completionPerTok * 1_000_000 : undefined, ...(cachedPerTok > 0 ? { cachedAmount: cachedPerTok * 1_000_000 } : {}) }
  const family = m.id.split("/")[0] ?? "openrouter"
  const inputs = (m.architecture?.input_modalities ?? ["text"]).filter(
    (i): i is "text" | "image" | "video" | "audio" => ["text", "image", "video", "audio"].includes(i),
  )

  return withReferenceSlot({
    id: `openrouter/${m.id}`,
    endpoint: m.id,
    provider: "openrouter",
    name: m.name.replace(/^[^:]+:\s*/, ""),
    family,
    logoKey: family,
    modality,
    task: isVideo ? (inputs.includes("image") ? "image-to-video" : "text-to-video") : isAudio ? (out.includes("transcription") ? "speech-to-text" : /lyria|music|song/i.test(m.id) ? "text-to-audio" : "text-to-speech") : isImage ? (inputs.includes("image") ? "image-to-image" : "text-to-image") : undefined,
    inputs: inputs.length > 0 ? inputs : ["text"],
    params: { type: "object", properties },
    price: { ...price, source: "api", fetchedAt },
    status: "active",
    tools: (m.supported_parameters ?? []).includes("tools"),
    description: m.description,
    updatedAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
    retiresAt: m.expiration_date ? new Date(`${m.expiration_date}T00:00:00Z`).toISOString() : undefined,
    summary: m.context_length && modality === "text" ? { contextTokens: m.context_length } : undefined,
  })
}

/**
 * OpenRouter's video price list (`pricing_skus`). Each key names one price: "duration_seconds_with_audio" is dollars a second with sound,
 * "cents_per_video_output_second_720p" is cents a second at 720p, "video_tokens" is dollars a token, "cents_per_megapixel_second_precise" is
 * cents for each megapixel of each second. Keys about continuing a video, reference pictures, input pictures or a minimum charge are extras
 * on top of the price of the video itself and are left out of it.
 */
export function priceFromSkus(skus: Record<string, string> | null | undefined, resolutions: string[] = [], fetchedAt = new Date().toISOString()): ModelPrice | null {
  if (!skus) return null
  const caseOf = (r: string) => resolutions.find((x) => x.toLowerCase() === r.toLowerCase()) ?? r
  type Entry = { amount: number; when: Record<string, string | number | boolean> }
  const seconds: Entry[] = []
  const tokens: Entry[] = []
  const megapixel: number[] = []
  for (const [key, raw] of Object.entries(skus)) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) continue
    if (/continuation|reference|image_input|minimum|input_image|video_input/.test(key)) continue
    const when: Record<string, string | number | boolean> = {}
    const res = /(480p|720p|768p|1080p|1440p|2k|4k)$/i.exec(key)
    if (res) when.resolution = caseOf(res[1]!)
    if (/without_audio/.test(key)) when.generate_audio = false
    else if (/with_audio/.test(key)) when.generate_audio = true
    const usd = key.startsWith("cents_") ? value / 100 : value
    if (/megapixel_second/.test(key)) megapixel.push(usd)
    else if (/^video_tokens/.test(key)) tokens.push({ amount: value * 1_000_000, when })
    else if (/second/.test(key)) seconds.push({ amount: usd, when })
  }
  const pick = (list: Entry[], unit: ModelPrice["unit"]): ModelPrice => {
    const rules: PriceRule[] = list.filter((x) => Object.keys(x.when).length > 0).map((x) => ({ when: x.when, amount: x.amount }))
    return { unit, amount: Math.min(...list.map((x) => x.amount)), ...(rules.length > 0 ? { rules } : {}), source: "api", fetchedAt }
  }
  if (seconds.length > 0) return pick(seconds, "per_second")
  if (tokens.length > 0) return pick(tokens, "per_1m_tokens")
  if (megapixel.length > 0) return { unit: "per_megapixel_second", amount: Math.min(...megapixel), source: "api", fetchedAt }
  return null
}

/** What a video model does to a video, from its own name: editing, upscaling, or making a talking video from a face and a voice */
function videoToolKind(id: string): "edit" | "upscale" | "avatar" | undefined {
  if (/upscal/i.test(id)) return "upscale"
  if (/video-edit|aleph/i.test(id)) return "edit"
  if (/avatar/i.test(id)) return "avatar"
  return undefined
}

/** Maps an entry from OpenRouter's `/api/v1/videos/models` catalog into a `ModelRecord`. */
export function mapOpenRouterVideoModel(m: ORModel & Record<string, unknown>, fetchedAt: string): ModelRecord | null {
  if (!m.id) return null
  const frames = (m.supported_frame_images as string[] | null | undefined) ?? []
  const tool = videoToolKind(m.id)
  const resolutions = (m.supported_resolutions as string[] | null | undefined) ?? []
  const aspects = (m.supported_aspect_ratios as string[] | null | undefined) ?? []
  const durations = (m.supported_durations as number[] | null | undefined) ?? []
  const properties: ParamSchema["properties"] = {}
  if (frames.includes("first_frame")) properties.first_frame = { type: "string", title: "Start frame", format: "image", slot: { kind: "image", role: "start", list: false, max: 1 } }
  if (frames.includes("last_frame")) properties.last_frame = { type: "string", title: "End frame", format: "image", slot: { kind: "image", role: "end", list: false, max: 1 } }
  if (tool === "edit" || tool === "upscale") properties.video = { type: "string", title: "Video", format: "video", slot: { kind: "video", role: "source", list: false, max: 1 } }
  if (tool === "avatar") {
    properties.image = { type: "string", title: "Face", format: "image", slot: { kind: "image", role: "source", list: false, max: 1 } }
    properties.audio = { type: "string", title: "Voice", format: "audio", slot: { kind: "audio", role: "source", list: false, max: 1 } }
  }
  if (aspects.length > 0) properties.aspect_ratio = { type: "string", title: "Aspect ratio", enum: aspects, default: aspects[0], tier: "common" }
  if (resolutions.length > 0) properties.resolution = { type: "string", title: "Resolution", enum: resolutions, default: resolutions.find((r) => /720p/i.test(r)) ?? resolutions[0], tier: "common" }
  if (durations.length > 0) properties.duration = { type: "integer", title: "Duration (s)", enum: durations, default: durations.includes(5) ? 5 : durations[0], tier: "common" }
  if (m.generate_audio === true) properties.generate_audio = { type: "boolean", title: "Generate audio", default: false, tier: "common" }
  if (m.seed === true) properties.seed = { type: "integer", title: "Seed", tier: "advanced" }
  const factor = m.upscale_factor as { min?: number; max?: number } | null | undefined
  if (factor && typeof factor.min === "number" && typeof factor.max === "number") properties.upscale_factor = { type: "number", title: "Upscale factor", minimum: factor.min, maximum: factor.max, default: factor.min, tier: "common" }
  const creativity = m.creativity as number[] | null | undefined
  if (Array.isArray(creativity) && creativity.length === 2) properties.creativity = { type: "number", title: "Creativity", minimum: creativity[0], maximum: creativity[1], default: creativity[0], tier: "unique" }

  const family = m.id.split("/")[0] ?? "openrouter"
  const price: ModelPrice = priceFromSkus(m.pricing_skus as Record<string, string> | undefined, resolutions, fetchedAt) ?? { unit: "unknown", amount: null, source: "api", fetchedAt }
  const inputs: ModelRecord["inputs"] = tool === "avatar" ? ["text", "image", "audio"] : tool === "edit" ? ["text", "video"] : tool === "upscale" ? ["video"] : frames.length > 0 ? ["text", "image"] : ["text"]
  return {
    id: `openrouter/${m.id}`,
    endpoint: m.id,
    provider: "openrouter",
    name: (m.name ?? m.id).replace(/^[^:]+:\s*/, ""),
    family,
    logoKey: family,
    maker: family,
    modality: "video",
    task: tool === "edit" || tool === "upscale" ? "video-to-video" : tool === "avatar" ? "audio-to-video" : "text-to-video",
    inputs,
    params: { type: "object", properties },
    price,
    status: "active",
    description: m.description,
    updatedAt: m.created ? new Date(Number(m.created) * 1000).toISOString() : undefined,
    summary: {
      ...(resolutions.length > 0 ? { maxResolution: resolutions[resolutions.length - 1] } : {}),
      ...(durations.length > 0 ? { maxSeconds: Math.max(...durations) } : {}),
      ...(aspects.length > 0 ? { aspects } : {}),
      ...(m.generate_audio === true ? { audio: true } : {}),
    },
  }
}

/** What the last read found, per kind of output the provider lists: how many it listed and how many became records. The build compares them. */
export const lastOpenRouterRead: Record<string, { listed: number; mapped: number }> = {}

export async function fetchOpenRouterModels(signal?: AbortSignal): Promise<ModelRecord[]> {
  const fetchedAt = new Date().toISOString()
  // "all" lists every model whatever it makes (chat, pictures, speech, music); the default list is chat only
  const urls = ["https://openrouter.ai/api/v1/models?output_modalities=all"]
  const seen = new Map<string, ModelRecord>()
  for (const url of urls) {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`OpenRouter models: HTTP ${res.status}`)
    const json = (await res.json()) as { data: ORModel[] }
    for (const k of Object.keys(lastOpenRouterRead)) delete lastOpenRouterRead[k]
    for (const m of json.data ?? []) {
      const rec = mapOpenRouterModel(m, fetchedAt)
      if (rec) seen.set(rec.id, rec)
      // Routers that pick a model at run time (negative price) are left out on purpose and do not count as missed
      if (Number(m.pricing?.prompt) < 0) continue
      const kind = [...(m.architecture?.output_modalities ?? ["unknown"])].sort().join("+") || "unknown"
      const row = (lastOpenRouterRead[kind] ??= { listed: 0, mapped: 0 })
      row.listed++
      if (rec) row.mapped++
    }
  }
  // Also query OpenRouter's dedicated video models endpoint (/api/v1/videos/models) when available
  try {
    const vRes = await fetch("https://openrouter.ai/api/v1/videos/models", { signal })
    if (vRes.ok) {
      const vJson = (await vRes.json()) as { data?: Array<ORModel & Record<string, unknown>> }
      for (const vm of vJson.data ?? []) {
        const rec = mapOpenRouterVideoModel(vm, fetchedAt)
        if (rec) seen.set(rec.id, rec)
      }
    }
  } catch {
    // Optional endpoint; ignore if unavailable or offline
  }
  return [...seen.values()]
}

/** One model by its id, for a model the person adds on their own. */
export async function fetchOpenRouterRecord(id: string, signal?: AbortSignal): Promise<ModelRecord> {
  const all = await fetchOpenRouterModels(signal)
  const found = all.find((r) => r.endpoint === id.trim())
  if (!found) throw new Error(`OpenRouter has no model called ${id.trim()}.`)
  return found
}


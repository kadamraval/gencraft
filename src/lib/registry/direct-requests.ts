import type { ModelRecord } from "./types"
import { sendableParams } from "./request"

/**
 * The request bodies and answers for the providers that reply in one call: Google Gemini (images and speech, through its
 * Interactions API), OpenRouter (images) and OpenAI (images and speech). Kept apart from the network code so each shape can
 * be tested against what the provider's own page says. Pages read 2026-10-13:
 *   ai.google.dev/gemini-api/docs/image-generation, ai.google.dev/gemini-api/docs/speech-generation,
 *   openrouter.ai/docs/guides/overview/multimodal/image-generation,
 *   developers.openai.com/api/docs/guides/image-generation, .../api/reference/resources/audio/subresources/speech/methods/create
 */

type Params = Record<string, unknown>

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)

/** "data:image/png;base64,AAAA" as the mime type and the data */
export function splitDataUrl(url: string): { mime: string; data: string } | undefined {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(url)
  return m ? { mime: m[1]!, data: m[2]! } : undefined
}

// ───────────────────────────── Gemini (Interactions API) ─────────────────────────────

export function geminiImageBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params, references: string[] = []): Record<string, unknown> {
  const sent = sendableParams(record, params)
  const input: Array<Record<string, unknown>> = [{ type: "text", text: prompt }]
  for (const url of references) {
    const d = splitDataUrl(url)
    if (d) input.push({ type: "image", mime_type: d.mime, data: d.data })
  }
  const format: Record<string, unknown> = { type: "image" }
  const ratio = text(sent.aspect_ratio)
  const size = text(sent.image_size)
  if (ratio && ratio !== "auto") format.aspect_ratio = ratio
  if (size) format.image_size = size
  const body: Record<string, unknown> = { model: record.endpoint, input: input.length === 1 ? prompt : input, response_format: format }
  const thinking = text(sent.thinking_level)
  if (thinking) body.generation_config = { thinking_level: thinking }
  if (sent.web_search === true || sent.image_search === true) {
    const types = [sent.web_search === true ? "web_search" : "", sent.image_search === true ? "image_search" : ""].filter(Boolean)
    body.tools = [{ type: "google_search", search_types: types }]
  }
  return body
}

export function geminiSpeechBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params): Record<string, unknown> {
  const sent = sendableParams(record, params)
  const style = text(sent.style)
  const item: Record<string, unknown> = { type: "text", text: prompt }
  if (style) item.annotations = [{ type: "speech_metadata", style }]
  return {
    model: record.endpoint,
    input: [{ type: "user_input", content: [item] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: text(sent.voice) ?? "Kore" }] },
  }
}

/** Walks an Interactions answer for blocks of one type that carry base64 data. */
function blocks(node: unknown, type: string, out: Array<{ data: string; mime?: string }> = []): Array<{ data: string; mime?: string }> {
  if (Array.isArray(node)) for (const n of node) blocks(n, type, out)
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>
    if (o.type === type && typeof o.data === "string") out.push({ data: o.data, mime: typeof o.mime_type === "string" ? o.mime_type : undefined })
    else for (const v of Object.values(o)) blocks(v, type, out)
  }
  return out
}

/** Only the answer the model gave: thought steps carry interim images that are not the result. */
function modelOutput(json: unknown): unknown {
  const steps = (json as { steps?: Array<{ type?: string }> } | undefined)?.steps
  return Array.isArray(steps) ? steps.filter((s) => s.type === "model_output") : json
}

export function geminiImages(json: unknown): string[] {
  const all = blocks(modelOutput(json), "image")
  // The last image is the result; earlier ones in the same answer are interleaved drafts
  const last = all[all.length - 1]
  return last ? [`data:${last.mime ?? "image/png"};base64,${last.data}`] : []
}

export function geminiAudio(json: unknown): { data: string; mime: string } | undefined {
  const all = blocks(modelOutput(json), "audio")
  const last = all[all.length - 1]
  return last ? { data: last.data, mime: last.mime ?? "audio/wav" } : undefined
}

/** Gemini video body: Interactions API for `gemini-*` omni models, or `predictLongRunning` for `veo-*` models. */
export function geminiVideoBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params, references: string[] = []): Record<string, unknown> {
  const sent = sendableParams(record, params)
  const ratio = text(sent.aspect_ratio) ?? "16:9"
  const resolution = text(sent.resolution)
  const duration = num(sent.duration ?? sent.duration_seconds ?? sent.seconds)

  if (record.endpoint.startsWith("gemini-")) {
    const input: Array<Record<string, unknown>> = [{ type: "text", text: prompt }]
    for (const url of references) {
      const d = splitDataUrl(url)
      if (d) input.push({ type: "image", mime_type: d.mime, data: d.data })
    }
    const format: Record<string, unknown> = { type: "video" }
    if (ratio && ratio !== "auto") format.aspect_ratio = ratio
    if (resolution) format.resolution = resolution
    if (duration && duration > 0) format.duration_seconds = duration
    return { model: record.endpoint, input: input.length === 1 ? prompt : input, response_format: format }
  }

  // Veo predictLongRunning payload
  const instance: Record<string, unknown> = { prompt }
  if (references[0]) {
    const d = splitDataUrl(references[0])
    if (d) instance.image = { bytesBase64Encoded: d.data, mimeType: d.mime }
    else instance.image = { gcsUri: references[0] }
  }
  const parameters: Record<string, unknown> = { aspectRatio: ratio === "auto" ? "16:9" : ratio }
  if (duration && duration > 0) parameters.durationSeconds = duration
  if (resolution) parameters.resolution = resolution
  if (typeof sent.generate_audio === "boolean") parameters.generateAudio = sent.generate_audio
  return { instances: [instance], parameters }
}

export function geminiVideoUrl(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined
  const all = blocks(modelOutput(json), "video")
  const last = all[all.length - 1]
  if (last) return `data:${last.mime ?? "video/mp4"};base64,${last.data}`
  const r = json as Record<string, unknown>
  const resp = (r.response ?? r) as Record<string, unknown>
  const gen = resp.generateVideoResponse as { generatedSamples?: Array<{ video?: { uri?: string; bytesBase64Encoded?: string } }> } | undefined
  const sample = gen?.generatedSamples?.[0]?.video
  if (sample?.uri) return sample.uri
  if (sample?.bytesBase64Encoded) return `data:video/mp4;base64,${sample.bytesBase64Encoded}`
  const preds = resp.predictions as Array<{ bytesBase64Encoded?: string; videoUri?: string; uri?: string }> | undefined
  const p0 = preds?.[0]
  if (p0?.videoUri || p0?.uri) return p0.videoUri ?? p0.uri
  if (p0?.bytesBase64Encoded) return `data:video/mp4;base64,${p0.bytesBase64Encoded}`
  return undefined
}

// ───────────────────────────── OpenRouter images, video & audio ─────────────────────────────

/** POST /api/v1/images: aspect_ratio, resolution, quality and the rest are top-level fields. */
export function openrouterImageBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params, references: string[] = []): Record<string, unknown> {
  const sent = sendableParams(record, params)
  const body: Record<string, unknown> = { model: record.endpoint, prompt }
  for (const key of ["n", "aspect_ratio", "resolution", "quality", "output_format", "background", "output_compression", "seed"] as const) {
    if (sent[key] !== undefined && sent[key] !== "") body[key] = sent[key]
  }
  if (body.aspect_ratio === "auto") delete body.aspect_ratio
  if (references.length > 0) body.input_references = references.map((url) => ({ type: "image_url", image_url: { url } }))
  return body
}

export function openrouterImages(json: unknown): string[] {
  const data = (json as { data?: Array<{ b64_json?: string; media_type?: string; url?: string }> } | undefined)?.data ?? []
  return data.map((d) => (d.b64_json ? `data:${d.media_type ?? "image/png"};base64,${d.b64_json}` : (d.url ?? ""))).filter(Boolean)
}

/** POST /api/v1/videos: OpenRouter unified video generation payload. */
export function openrouterVideoBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params, references: string[] = []): Record<string, unknown> {
  const sent = sendableParams(record, params)
  const body: Record<string, unknown> = { model: record.endpoint, prompt }
  for (const key of ["aspect_ratio", "resolution", "duration", "generate_audio", "seed"] as const) {
    if (sent[key] !== undefined && sent[key] !== "") body[key] = sent[key]
  }
  if (body.aspect_ratio === "auto") delete body.aspect_ratio
  if (references.length > 0) {
    body.image_url = references[0]
    body.input_references = references.map((url) => ({ type: "image_url", image_url: { url } }))
  }
  return body
}

/** POST /api/v1/chat/completions with audio output modality on OpenRouter. */
export function openrouterAudioBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params): Record<string, unknown> {
  const sent = sendableParams(record, params)
  return {
    model: record.endpoint,
    messages: [{ role: "user", content: prompt }],
    modalities: ["text", "audio"],
    audio: {
      voice: text(sent.voice) ?? "alloy",
      format: text(sent.response_format) ?? "mp3",
    },
  }
}

// ───────────────────────────── OpenAI ─────────────────────────────

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** The fields of the image request, as the provider's list allows them. `n` and numbers stay numbers; the edits form turns all into text. */
export function openaiImageFields(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params): Record<string, string | number> {
  const sent = sendableParams(record, params)
  const out: Record<string, string | number> = { model: record.endpoint, prompt, n: Math.max(1, num(sent.n) ?? 1) }
  for (const key of ["size", "quality", "background", "output_format", "moderation"] as const) {
    const v = text(sent[key])
    if (v) out[key] = v
  }
  const compression = num(sent.output_compression)
  // The maker applies compression to jpeg and webp only
  if (compression !== undefined && /^(jpeg|webp)$/.test(String(out.output_format ?? "png"))) out.output_compression = Math.min(100, Math.max(0, Math.round(compression)))
  return out
}

export function openaiSpeechBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params): Record<string, unknown> {
  const sent = sendableParams(record, params)
  const body: Record<string, unknown> = { model: record.endpoint, input: prompt.slice(0, 4096), voice: text(sent.voice) ?? "marin", response_format: text(sent.response_format) ?? "mp3" }
  const instructions = text(sent.instructions)
  // tts-1 and tts-1-hd do not take instructions
  if (instructions && !/^tts-1/.test(record.endpoint)) body.instructions = instructions
  const speed = num(sent.speed)
  if (speed !== undefined) body.speed = Math.min(4, Math.max(0.25, speed))
  return body
}

/** POST /v1/videos: OpenAI Sora video generation payload. */
export function openaiVideoBody(record: Pick<ModelRecord, "endpoint" | "params">, prompt: string, params: Params, references: string[] = []): Record<string, unknown> {
  const sent = sendableParams(record, params)
  const body: Record<string, unknown> = { model: record.endpoint, prompt }
  const size = text(sent.size ?? sent.resolution ?? sent.aspect_ratio)
  if (size && size !== "auto") body.size = size
  const seconds = num(sent.seconds ?? sent.duration ?? sent.duration_seconds)
  if (seconds && seconds > 0) body.seconds = seconds
  const quality = text(sent.quality)
  if (quality && quality !== "auto") body.quality = quality
  if (references[0]) body.input_reference = references[0]
  return body
}

/** The MIME type the speech request's format comes back as */
export const SPEECH_MIME: Record<string, string> = { mp3: "audio/mpeg", opus: "audio/ogg", aac: "audio/aac", flac: "audio/flac", wav: "audio/wav", pcm: "audio/L16;rate=24000" }


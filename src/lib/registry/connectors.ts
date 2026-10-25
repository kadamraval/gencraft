import type { ModelRecord } from "./types"
import { falRunFetch, providerFetch, replicateCall } from "./net"
import { FAL_CHAT_BASE } from "./adapters/fal-chat"
import {
  geminiAudio,
  geminiImageBody,
  geminiImages,
  geminiSpeechBody,
  geminiVideoBody,
  geminiVideoUrl,
  openaiImageFields,
  openaiSpeechBody,
  openaiVideoBody,
  openrouterAudioBody,
  openrouterImageBody,
  openrouterImages,
  openrouterVideoBody,
  SPEECH_MIME,
} from "./direct-requests"
import { runReplicate } from "./adapters/replicate"
import { assignRefs, refCapability } from "./slots"
import { safetyInput } from "./safety"
import { buildInput } from "./request"
import { filesFrom, shapeRun } from "../models/apply"
import { fieldsNamedIn, recordParamChecks, untestedSent } from "./param-checks"
import { dropRejectedParamsOnError, translateParamsToModelSchema } from "../litellm/params"

/**
 * Direct connectors for providers that answer in a single request: OpenAI (chat, images, speech),
 * OpenRouter (chat, images) and Google Gemini (chat). fal has its own queue runner in run.ts.
 *
 * The model comes from the registry record, so the model the user picked is the model that runs, and the
 * parameters are the ones that model's schema allows.
 */

export interface DirectRun {
  record: ModelRecord
  apiKey: string
  prompt: string
  params: Record<string, unknown>
  /** Reference files (data URL, blob URL or https URL). Images are in order and grouped by what they show. */
  references?: {
    images: string[]
    groups?: string[][]
    startFrameUrl?: string
    endFrameUrl?: string
    sourceVideoUrl?: string
    sourceAudioUrl?: string
  }
  /** Keep the model's own safety checker on. False turns it off where the model has a switch. */
  filterOn?: boolean
  signal?: AbortSignal
}

export interface DirectResult {
  text?: string
  imageUrls?: string[]
  videoUrl?: string
  audioUrl?: string
  raw: unknown
}

export class DirectRunError extends Error {
  constructor(
    public provider: string,
    message: string,
    public statusCode?: number,
  ) {
    super(message)
    this.name = "DirectRunError"
  }
}

export const DIRECT_PROVIDERS = ["openai", "openrouter", "gemini", "replicate"] as const

export function isDirectRecord(r: ModelRecord | undefined): r is ModelRecord {
  // fal is direct for its chat models only; its pictures, video and sound go through its own queue
  const provider = r?.provider === "fal" ? r.modality === "text" : (DIRECT_PROVIDERS as readonly string[]).includes(r?.provider ?? "")
  return Boolean(r) && provider && r!.endpoint !== r!.id
}

async function failFrom(provider: string, res: Response): Promise<never> {
  const body = await res.text().catch(() => "")
  throw new DirectRunError(provider, `${provider} error (HTTP ${res.status}): ${body.slice(0, 240)}`, res.status)
}

/**
 * Providers cannot open a blob: address from this machine, so an attached file is sent inside the request.
 * Web addresses and data addresses pass through untouched.
 */
export async function toInlineUrl(url: string | undefined): Promise<string | undefined> {
  if (!url || /^(https?:|data:)/.test(url)) return url
  const blob = await (await fetch(url)).blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function toBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new DirectRunError("reference", `Could not read the reference image (HTTP ${res.status})`)
  return res.blob()
}

// OpenAI

async function openaiText(run: DirectRun): Promise<DirectResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: run.record.endpoint, messages: [{ role: "user", content: run.prompt }] }),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("openai", res)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return { text: json.choices?.[0]?.message?.content ?? "", raw: json }
}

async function openaiImage(run: DirectRun): Promise<DirectResult> {
  const { record, params } = run
  // Every setting the model's list has goes in, under its own name (size, quality, background, output format, moderation, compression)
  const fields = openaiImageFields(record, run.prompt, params)

  let res: Response
  const refs = run.references?.images ?? []
  if (refs.length > 0) {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
    for (const [i, url] of refs.entries()) form.append("image[]", await toBlob(url), `reference-${i + 1}.png`)
    res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${run.apiKey.trim()}` }, body: form, signal: run.signal })
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify(fields),
      signal: run.signal,
    })
  }
  if (!res.ok) await failFrom("openai", res)
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const mime = `image/${fields.output_format === "jpeg" ? "jpeg" : fields.output_format === "webp" ? "webp" : "png"}`
  const imageUrls = (json.data ?? []).map((d) => (d.b64_json ? `data:${mime};base64,${d.b64_json}` : (d.url ?? ""))).filter(Boolean)
  if (imageUrls.length === 0) throw new DirectRunError("openai", "OpenAI returned no image")
  return { imageUrls, raw: json }
}

async function openaiSpeech(run: DirectRun): Promise<DirectResult> {
  const body = openaiSpeechBody(run.record, run.prompt, run.params)
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("openai", res)
  const mime = SPEECH_MIME[String(body.response_format)] ?? "audio/mpeg"
  return { audioUrl: URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime })), raw: { bytes: mime } }
}

async function openaiVideo(run: DirectRun): Promise<DirectResult> {
  const refs = await Promise.all((run.references?.images ?? []).map((u) => toInlineUrl(u) as Promise<string>))
  const startRef = run.references?.startFrameUrl ? [(await toInlineUrl(run.references.startFrameUrl))!] : refs
  const body = openaiVideoBody(run.record, run.prompt, run.params, startRef)
  const headers = { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json" }
  const res = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("openai", res)
  let job = (await res.json()) as { id?: string; status?: string; url?: string; video_url?: string; output?: { url?: string }; error?: { message?: string } }
  if (job.url || job.video_url || job.output?.url) {
    return { videoUrl: job.url ?? job.video_url ?? job.output?.url, raw: job }
  }
  const deadline = Date.now() + 10 * 60_000
  while (job.id && (job.status === "queued" || job.status === "in_progress" || job.status === "processing" || job.status === "starting")) {
    if (Date.now() > deadline) throw new DirectRunError("openai", "OpenAI video generation timed out")
    await new Promise((r) => setTimeout(r, 3000))
    const poll = await fetch(`https://api.openai.com/v1/videos/${job.id}`, { headers: { Authorization: headers.Authorization }, signal: run.signal })
    if (!poll.ok) await failFrom("openai", poll)
    job = await poll.json()
  }
  if (job.status === "failed" || job.error) {
    throw new DirectRunError("openai", `OpenAI video generation failed: ${job.error?.message ?? job.status}`)
  }
  const videoUrl = job.url ?? job.video_url ?? job.output?.url ?? (job.id ? `https://api.openai.com/v1/videos/${job.id}/content` : undefined)
  if (!videoUrl) throw new DirectRunError("openai", "OpenAI returned no video URL")
  return { videoUrl, raw: job }
}

// OpenRouter

/** OpenRouter's image endpoint takes the settings as fields of their own. A provider that answers "no such endpoint" falls back to the chat route. */
async function openrouterImages_(run: DirectRun, refs: string[]): Promise<DirectResult | null> {
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json", "X-Title": "Gencraft" },
    body: JSON.stringify(openrouterImageBody(run.record, run.prompt, run.params, refs)),
    signal: run.signal,
  })
  if (res.status === 404 || res.status === 405 || res.status === 501) return null
  if (!res.ok) await failFrom("openrouter", res)
  const json = await res.json()
  const imageUrls = openrouterImages(json)
  if (imageUrls.length === 0) throw new DirectRunError("openrouter", "OpenRouter returned no image for this model")
  return { imageUrls, raw: json }
}

async function openrouterVideo(run: DirectRun): Promise<DirectResult> {
  const refs = await Promise.all((run.references?.images ?? []).map((u) => toInlineUrl(u) as Promise<string>))
  const startRef = run.references?.startFrameUrl ? [(await toInlineUrl(run.references.startFrameUrl))!] : refs
  const headers = { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json", "X-Title": "Gencraft" }
  const res = await fetch("https://openrouter.ai/api/v1/videos", {
    method: "POST",
    headers,
    body: JSON.stringify(openrouterVideoBody(run.record, run.prompt, run.params, startRef)),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("openrouter", res)
  let job = (await res.json()) as { id?: string; status?: string; url?: string; video_url?: string; data?: Array<{ url?: string }>; error?: { message?: string } }
  const directUrl = job.url ?? job.video_url ?? job.data?.[0]?.url
  if (directUrl) return { videoUrl: directUrl, raw: job }

  const deadline = Date.now() + 10 * 60_000
  while (job.id && (job.status === "queued" || job.status === "in_progress" || job.status === "processing" || job.status === "pending")) {
    if (Date.now() > deadline) throw new DirectRunError("openrouter", "OpenRouter video generation timed out")
    await new Promise((r) => setTimeout(r, 3000))
    const poll = await fetch(`https://openrouter.ai/api/v1/videos/${job.id}`, { headers, signal: run.signal })
    if (!poll.ok) await failFrom("openrouter", poll)
    job = await poll.json()
  }
  const finalUrl = job.url ?? job.video_url ?? job.data?.[0]?.url
  if (!finalUrl) throw new DirectRunError("openrouter", job.error?.message ?? "OpenRouter returned no video URL")
  return { videoUrl: finalUrl, raw: job }
}

async function openrouterAudio(run: DirectRun): Promise<DirectResult> {
  const headers = { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json", "X-Title": "Gencraft" }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify(openrouterAudioBody(run.record, run.prompt, run.params)),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("openrouter", res)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string; audio?: { data?: string; transcript?: string } } }> }
  const msg = json.choices?.[0]?.message
  const b64 = msg?.audio?.data
  if (!b64) throw new DirectRunError("openrouter", "OpenRouter returned no audio stream for this model")
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const audioUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }))
  return { audioUrl, text: msg?.audio?.transcript ?? msg?.content, raw: json }
}

async function openrouter(run: DirectRun): Promise<DirectResult> {
  if (run.record.modality === "video") return openrouterVideo(run)
  if (run.record.modality === "audio") return openrouterAudio(run)
  const wantsImage = run.record.modality === "image"
  const refs = await Promise.all((run.references?.images ?? []).map((u) => toInlineUrl(u) as Promise<string>))
  if (wantsImage) {
    const viaImages = await openrouterImages_(run, refs)
    if (viaImages) return viaImages
  }
  const body: Record<string, unknown> = {
    model: run.record.endpoint,
    messages: [{ role: "user", content: refs.length > 0 ? [{ type: "text", text: run.prompt }, ...refs.map((url) => ({ type: "image_url", image_url: { url } }))] : run.prompt }],
  }
  if (wantsImage) body.modalities = ["image", "text"]
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${run.apiKey.trim()}`, "Content-Type": "application/json", "X-Title": "Gencraft" },
    body: JSON.stringify(body),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("openrouter", res)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string; images?: Array<{ image_url?: { url?: string } }> } }> }
  const message = json.choices?.[0]?.message
  const imageUrls = (message?.images ?? []).map((i) => i.image_url?.url ?? "").filter(Boolean)
  if (wantsImage && imageUrls.length === 0) throw new DirectRunError("openrouter", "OpenRouter returned no image for this model")
  return { text: message?.content ?? "", imageUrls: imageUrls.length ? imageUrls : undefined, raw: json }
}

// fal chat (OpenAI-compatible, powered by OpenRouter)

async function falChat(run: DirectRun): Promise<DirectResult> {
  const res = await falRunFetch(`${FAL_CHAT_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Key ${run.apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: run.record.endpoint, messages: [{ role: "user", content: run.prompt }] }),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("fal", res)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return { text: json.choices?.[0]?.message?.content ?? "", raw: json }
}

// Gemini

async function geminiText(run: DirectRun): Promise<DirectResult> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${run.record.endpoint}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": run.apiKey.trim(), "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: run.prompt }] }] }),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("gemini", res)
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")
  return { text, raw: json }
}

/** Gemini images and speech come from the Interactions API; the answer's base64 is read out of the model's own steps. */
async function geminiInteraction(run: DirectRun, body: Record<string, unknown>): Promise<unknown> {
  const res = await providerFetch("gemini", "/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": run.apiKey.trim(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("gemini", res)
  return res.json()
}

async function geminiImage(run: DirectRun): Promise<DirectResult> {
  const refs = await Promise.all((run.references?.images ?? []).map((u) => toInlineUrl(u) as Promise<string>))
  const json = await geminiInteraction(run, geminiImageBody(run.record, run.prompt, run.params, refs))
  const imageUrls = geminiImages(json)
  if (imageUrls.length === 0) throw new DirectRunError("gemini", "Gemini returned no image")
  return { imageUrls, raw: json }
}

async function geminiSpeech(run: DirectRun): Promise<DirectResult> {
  const json = await geminiInteraction(run, geminiSpeechBody(run.record, run.prompt, run.params))
  const audio = geminiAudio(json)
  if (!audio) throw new DirectRunError("gemini", "Gemini returned no audio")
  const bytes = Uint8Array.from(atob(audio.data), (c) => c.charCodeAt(0))
  return { audioUrl: URL.createObjectURL(new Blob([bytes], { type: audio.mime })), raw: json }
}

async function geminiVideo(run: DirectRun): Promise<DirectResult> {
  const refs = await Promise.all((run.references?.images ?? []).map((u) => toInlineUrl(u) as Promise<string>))
  const startRef = run.references?.startFrameUrl ? [(await toInlineUrl(run.references.startFrameUrl))!] : refs
  const body = geminiVideoBody(run.record, run.prompt, run.params, startRef)

  if (run.record.endpoint.startsWith("gemini-")) {
    const json = await geminiInteraction(run, body)
    const videoUrl = geminiVideoUrl(json)
    if (!videoUrl) throw new DirectRunError("gemini", "Gemini returned no video")
    return { videoUrl, raw: json }
  }

  // Veo predictLongRunning
  const headers = { "x-goog-api-key": run.apiKey.trim(), "Content-Type": "application/json" }
  const res = await providerFetch("gemini", `/v1beta/models/${run.record.endpoint}:predictLongRunning`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: run.signal,
  })
  if (!res.ok) await failFrom("gemini", res)
  let op = (await res.json()) as { name?: string; done?: boolean; error?: { message?: string }; response?: unknown }
  const deadline = Date.now() + 10 * 60_000
  while (op.name && !op.done) {
    if (Date.now() > deadline) throw new DirectRunError("gemini", "Gemini Veo video generation timed out")
    await new Promise((r) => setTimeout(r, 4000))
    const poll = await providerFetch("gemini", `/v1beta/${op.name.replace(/^\/+/, "")}`, {
      headers: { "x-goog-api-key": run.apiKey.trim() },
      signal: run.signal,
    })
    if (!poll.ok) await failFrom("gemini", poll)
    op = await poll.json()
  }
  if (op.error) throw new DirectRunError("gemini", `Gemini Veo error: ${op.error.message ?? JSON.stringify(op.error)}`)
  const videoUrl = geminiVideoUrl(op)
  if (!videoUrl) throw new DirectRunError("gemini", "Gemini Veo finished but returned no video")
  return { videoUrl, raw: op }
}

// Replicate

async function replicateRun(run: DirectRun): Promise<DirectResult> {
  const { record } = run
  // An official model has no pinned version: it is run by its owner/name
  if (!record.providerVersion && !/^[^/\s]+\/[^/\s]+$/.test(record.endpoint)) throw new DirectRunError("replicate", "This Replicate model has no version to run. Refresh the provider in Settings.")
  const r = run.references
  const translatedParams = translateParamsToModelSchema(record, run.params)
  const shaped = shapeRun(record, run.prompt, translatedParams, filesFrom(r), undefined, true)
  const input = buildInput(record, shaped.prompt, shaped.params)
  const inline = async (u: string | undefined) => (u ? ((await toInlineUrl(u)) as string) : undefined)
  const images = await Promise.all((r?.images ?? []).map((u) => toInlineUrl(u) as Promise<string>))
  const groups = r?.groups ? await Promise.all(r.groups.map((g) => Promise.all(g.map((u) => toInlineUrl(u) as Promise<string>)))) : undefined
  const { input: files } = assignRefs(refCapability(record), {
    start: await inline(r?.startFrameUrl),
    end: await inline(r?.endFrameUrl),
    images,
    groups,
    sourceVideo: await inline(r?.sourceVideoUrl),
    sourceAudio: await inline(r?.sourceAudioUrl),
    videos: r?.sourceVideoUrl ? [(await inline(r.sourceVideoUrl))!] : undefined,
    audios: r?.sourceAudioUrl ? [(await inline(r.sourceAudioUrl))!] : undefined,
  })
  Object.assign(input, files)
  Object.assign(input, safetyInput(record.params.safety, run.filterOn ?? true))
  let out: Awaited<ReturnType<typeof runReplicate>>
  // Settings the provider does not list: a run that goes through settles them, a refusal that names one rejects it
  const unproven = untestedSent(record, input)
  try {
    out = await runReplicate({ call: replicateCall(run.apiKey), token: run.apiKey, version: record.providerVersion, model: record.endpoint, input, signal: run.signal })
    recordParamChecks(record.id, unproven, "accepted")
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    // LiteLLM `drop_params = true`: if Replicate rejected one or more unsupported parameters (HTTP 400/422), strip them and retry once automatically
    const dropped = dropRejectedParamsOnError(record, input, errMsg)
    if (dropped.shouldRetry) {
      out = await runReplicate({
        call: replicateCall(run.apiKey),
        token: run.apiKey,
        version: record.providerVersion,
        model: record.endpoint,
        input: dropped.cleanedInput,
        signal: run.signal,
      })
    } else {
      recordParamChecks(record.id, fieldsNamedIn(errMsg, unproven), "rejected")
      // Say exactly what was sent, so a model that rejects a request can be diagnosed from the Details
      const sent = Object.entries(input).map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.slice(0, 40)) : Array.isArray(v) ? `[${v.length}]` : String(v)}`).join(", ")
      throw new Error(`${errMsg}
Request sent to ${record.endpoint}: ${sent}`)
    }
  }
  if (record.modality === "text") {
    if (!out.text) {
      const raw = out.raw as { output?: unknown; logs?: string | null }
      const got = raw.output === null || raw.output === undefined ? "nothing" : JSON.stringify(raw.output).slice(0, 120)
      const logTail = (raw.logs ?? "").trim().split("\n").slice(-2).join(" | ").slice(0, 200)
      throw new DirectRunError("replicate", `Replicate finished but returned no text (the model sent back: ${got}${logTail ? `; its log ends: ${logTail}` : ""})`)
    }
    return { text: out.text, raw: out.raw }
  }
  if (out.urls.length === 0) throw new DirectRunError("replicate", "Replicate finished but returned no file")
  if (record.modality === "image") return { imageUrls: out.urls, raw: out.raw }
  if (record.modality === "video") return { videoUrl: out.urls[0], raw: out.raw }
  return { audioUrl: out.urls[0], raw: out.raw }
}

export async function runDirect(source: DirectRun): Promise<DirectResult> {
  // Translate any OpenAI-standard parameter aliases into the model's own schema before shaping
  const translatedParams = translateParamsToModelSchema(source.record, source.params)
  // The maker's rules, defaults and prompt syntax apply to every provider, not only the ones with a queue runner
  const shaped = source.record.modality === "text" || source.record.provider === "replicate" ? undefined : shapeRun(source.record, source.prompt, translatedParams, filesFrom(source.references), undefined, true)
  const run: DirectRun = shaped ? { ...source, prompt: shaped.prompt, params: shaped.params } : { ...source, params: translatedParams }
  const { provider, modality } = run.record
  if (provider === "fal" && modality === "text") return falChat(run)
  if (provider === "gemini") {
    if (modality === "image") return geminiImage(run)
    if (modality === "audio") return geminiSpeech(run)
    if (modality === "video") return geminiVideo(run)
    if (modality === "text") return geminiText(run)
  }
  if (provider === "openai") {
    if (modality === "text") return openaiText(run)
    if (modality === "image") return openaiImage(run)
    if (modality === "audio") return openaiSpeech(run)
    if (modality === "video") return openaiVideo(run)
  }
  if (provider === "openrouter") return openrouter(run)
  if (provider === "replicate") return replicateRun(run)
  throw new DirectRunError(provider, `${provider} ${modality} generation is not available in this build yet`)
}


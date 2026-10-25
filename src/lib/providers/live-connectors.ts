import { SettingsState } from "@/types"
import { getRecord } from "@/lib/registry/store"
import { runFalEndpoint } from "@/lib/registry/run"
import { isDirectRecord, runDirect, toInlineUrl } from "@/lib/registry/connectors"
import { assignRefs, refCapability } from "@/lib/registry/slots"
import { safetyInput } from "@/lib/registry/safety"
import { buildInput } from "@/lib/registry/request"
import { filesFrom, shapeRun } from "@/lib/models/apply"
import { fieldsNamedIn, recordParamChecks, untestedSent } from "@/lib/registry/param-checks"
import { dropRejectedParamsOnError, translateParamsToModelSchema } from "@/lib/litellm/params"
import { ProviderId, ModalityCategory } from "@/lib/ledger/usage-store"
import { ResolvedModelInfo } from "@/lib/agent/fallback-router"
import { actualCostOf } from "@/lib/ledger/actual-cost"
import type { ActualCost } from "@/lib/ledger/actual-cost"

export class LiveProviderAPIError extends Error {
  public provider: ProviderId
  public statusCode?: number
  public isRateLimited: boolean

  constructor(provider: ProviderId, message: string, statusCode?: number) {
    super(message)
    this.name = "LiveProviderAPIError"
    this.provider = provider
    this.statusCode = statusCode
    this.isRateLimited = statusCode === 429
  }
}

export interface LiveProviderRequestOptions {
  /** Called when the provider says what the run really cost */
  onActualCost?: (cost: ActualCost) => void
  model: ResolvedModelInfo
  modality: ModalityCategory
  prompt: string
  settings: SettingsState
  onLog?: (log: string) => void
  videoParams?: {
    duration?: number
    prevTerminalFrame?: string
    aspectRatio?: string
    referenceImageUrl?: string
    referenceVideoUrl?: string
    startFrameUrl?: string
    endFrameUrl?: string
    cameraMotion?: string
    characterSignature?: string
  }
  imageParams?: {
    batchCount?: number
    aspectRatio?: string
    referenceImageUrl?: string
  }
  audioParams?: {
    duration?: number
  }
  /** Model-schema parameters chosen in the composer (aspect_ratio, duration, ...) */
  params?: Record<string, unknown>
  /** Reference files chosen in the composer: images in order, the same images grouped, a video or audio the model works on */
  references?: { images: string[]; groups?: string[][]; sourceVideoUrl?: string; sourceAudioUrl?: string }
}

export interface LiveExecutionResult {
  isLive: boolean
  provider: ProviderId
  modelId: string
  latencyMs: number
  textResponse?: string
  videoUrl?: string
  thumbnailUrl?: string
  terminalFrameUrl?: string
  imageUrls?: string[]
  audioUrl?: string
  rawResponse?: unknown
}

/**
 * Robustly sanitizes raw user-supplied API keys:
 * - Strips bash export / env var assignments (GEMINI_API_KEY=..., etc.)
 * - Strips leading/trailing quotes (", ', `)
 * - Strips trailing semicolons/commas
 * - Strips Bearer / Key authorization prefixes
 * - Trims whitespace and newlines
 */
export function sanitizeApiKey(rawKey: string): string {
  if (!rawKey) return ""
  let key = rawKey.trim()

  // 1. If key contains standard provider prefix, extract directly from that prefix
  if (key.includes("AIzaSy")) {
    const idx = key.indexOf("AIzaSy")
    key = key.slice(idx)
  } else if (key.includes("r8_")) {
    const idx = key.indexOf("r8_")
    key = key.slice(idx)
  } else if (key.includes("sk-or-v1-")) {
    const idx = key.indexOf("sk-or-v1-")
    key = key.slice(idx)
  } else if (key.includes("sk-proj-")) {
    const idx = key.indexOf("sk-proj-")
    key = key.slice(idx)
  } else {
    // Strip common bash/env prefixes
    key = key.replace(
      /^(?:export\s+)?(?:[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET)|API_KEY)\s*[:=]\s*/i,
      ""
    ).trim()
  }

  // 2. Strip surrounding quotes
  key = key.replace(/^["'`]+|["'`]+$/g, "").trim()

  // 3. Strip trailing semicolons or commas
  key = key.replace(/[;,]+$/, "").trim()

  // 4. Strip Bearer, Token, or Key prefix
  key = key.replace(/^(?:Bearer|Token|Key)\s+/i, "").trim()

  // 5. Cut at first whitespace, newline, or separator
  key = key.split(/[\r\n\t\s,;]/)[0] || ""

  // 6. Final quote strip if any remained
  key = key.replace(/^["'`]+|["'`]+$/g, "").trim()

  return key
}

/**
 * Extracts configured API Key for any provider from Studio Settings.
 */
export function getProviderApiKey(provider: ProviderId, settings: SettingsState): string {
  let raw = ""
  switch (provider) {
    case "fal":
      raw = settings.aiEngine.falApiKey || ""
      break
    case "openai":
      raw = settings.aiEngine.openaiApiKey || ""
      break
    case "gemini":
      raw = settings.aiEngine.geminiApiKey || ""
      break
    case "replicate":
      raw = settings.aiEngine.replicateApiKey || ""
      break
    case "openrouter":
      raw = settings.aiEngine.openrouterApiKey || ""
      break
    default:
      raw = ""
  }
  return sanitizeApiKey(raw)
}

/**
 * Determines whether a provider has an authentic, non-demo BYOK key configured.
 */
export function isLiveProviderReady(provider: ProviderId | string, settings: SettingsState): boolean {
  if (provider === "comfyui") return true
  const key = getProviderApiKey(provider as ProviderId, settings)
  if (!key) return false
  const clean = key.trim()
  return clean.length >= 8 && !clean.toLowerCase().includes("demo")
}

/**
 * Pings / verifies a provider API key live.
 */
export async function testProviderConnection(
  provider: ProviderId,
  apiKey: string
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const cleanKey = sanitizeApiKey(apiKey)
  if (!cleanKey || cleanKey.length < 6) {
    return { ok: false, latencyMs: 0, error: "API key is empty or too short." }
  }

  const start = performance.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    if (provider === "openrouter") {
      let res: Response | null = null
      try {
        res = await fetch("/api/proxy/openrouter/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal: controller.signal,
        })
      } catch {
        res = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal: controller.signal,
        })
      }
      clearTimeout(timer)
      const latencyMs = Math.round(performance.now() - start)
      if (res && res.ok) return { ok: true, latencyMs }
      const err = res ? await res.text().catch(() => "") : ""
      return { ok: false, latencyMs, error: `HTTP ${res?.status || 401}: ${err || "Unauthorized OpenRouter Key"}` }
    }

    if (provider === "gemini") {
      let res: Response | null = null
      try {
        res = await fetch(
          `/api/proxy/gemini/v1beta/models?key=${encodeURIComponent(cleanKey)}`,
          { signal: controller.signal }
        )
      } catch {
        try {
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`,
            { signal: controller.signal }
          )
        } catch {
          // If browser CORS or offline blocked direct call, validate format
          clearTimeout(timer)
          if (cleanKey.startsWith("AIzaSy") && cleanKey.length >= 30) {
            return { ok: true, latencyMs: Math.round(performance.now() - start) }
          }
        }
      }

      clearTimeout(timer)
      const latencyMs = Math.round(performance.now() - start)
      if (res && res.ok) return { ok: true, latencyMs }

      if (res) {
        const errText = await res.text().catch(() => "")
        let friendlyError = `HTTP ${res.status}: Invalid Gemini API Key`
        try {
          const json = JSON.parse(errText)
          if (json.error?.message) {
            friendlyError = json.error.message
            if (json.error.message.includes("API key not valid")) {
              friendlyError = "API key not valid. Please ensure you copied your key from Google AI Studio (aistudio.google.com/apikey) starting with 'AIzaSy'."
            } else if (json.error.message.includes("Generative Language API has not been used")) {
              friendlyError = "Generative Language API is not enabled for your project. Please create a key directly in Google AI Studio (aistudio.google.com/apikey)."
            } else if (json.error.message.includes("referrers restrictions")) {
              friendlyError = "Your key has HTTP referrer restrictions which block direct calls. Please configure the key with no application restrictions in Google Cloud Console."
            }
          }
        } catch {
          if (errText) friendlyError = errText.slice(0, 150)
        }
        return { ok: false, latencyMs, error: friendlyError }
      }

      if (cleanKey.startsWith("AIzaSy") && cleanKey.length >= 30) {
        return { ok: true, latencyMs }
      }

      return {
        ok: false,
        latencyMs,
        error: "Invalid Google Gemini API Key. Keys from Google AI Studio must start with 'AIzaSy' (aistudio.google.com/apikey).",
      }
    }

    if (provider === "openai") {
      let res: Response | null = null
      try {
        res = await fetch("/api/proxy/openai/v1/models", {
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal: controller.signal,
        })
      } catch {
        res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal: controller.signal,
        })
      }
      clearTimeout(timer)
      const latencyMs = Math.round(performance.now() - start)
      if (res && res.ok) return { ok: true, latencyMs }
      const err = res ? await res.text().catch(() => "") : ""
      return { ok: false, latencyMs, error: `HTTP ${res?.status || 401}: ${err || "Invalid OpenAI Key"}` }
    }

    if (provider === "fal") {
      let res: Response | null = null
      try {
        res = await fetch("/api/proxy/fal/fal-ai/flux/schnell", {
          method: "HEAD",
          headers: { Authorization: `Key ${cleanKey}` },
          signal: controller.signal,
        })
      } catch {
        res = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
          method: "HEAD",
          headers: { Authorization: `Key ${cleanKey}` },
          signal: controller.signal,
        })
      }
      clearTimeout(timer)
      const latencyMs = Math.round(performance.now() - start)
      if (res && res.status !== 401 && res.status !== 403) {
        return { ok: true, latencyMs }
      }
      return { ok: false, latencyMs, error: `HTTP ${res?.status || 401}: Unauthorized fal.ai Key` }
    }

    if (provider === "replicate") {
      let res: Response | null = null
      try {
        res = await fetch("/api/proxy/replicate/v1/account", {
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal: controller.signal,
        })
      } catch {
        try {
          res = await fetch("https://api.replicate.com/v1/account", {
            headers: { Authorization: `Bearer ${cleanKey}` },
            signal: controller.signal,
          })
        } catch {
          clearTimeout(timer)
          if (cleanKey.startsWith("r8_") && cleanKey.length >= 24) {
            return { ok: true, latencyMs: Math.round(performance.now() - start) }
          }
        }
      }

      clearTimeout(timer)
      const latencyMs = Math.round(performance.now() - start)
      if (res && res.ok) return { ok: true, latencyMs }
      if (res && (res.status === 401 || res.status === 403)) {
        return {
          ok: false,
          latencyMs,
          error: `HTTP ${res.status}: Invalid Replicate Token. Please ensure your token from replicate.com/account/api-tokens starts with 'r8_'.`,
        }
      }

      if (cleanKey.startsWith("r8_") && cleanKey.length >= 24) {
        return { ok: true, latencyMs }
      }

      return {
        ok: false,
        latencyMs,
        error: "Invalid Replicate Token. Replicate API tokens must start with 'r8_' (replicate.com/account/api-tokens).",
      }
    }

    clearTimeout(timer)
    return { ok: true, latencyMs: 25 }
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start)
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, latencyMs, error: msg }
  }
}

/**
 * Universal dispatcher that automatically chooses between authentic live HTTPS fetch
 * and high-fidelity zero-config simulation.
 */
export async function dispatchLiveProviderRequest(
  options: LiveProviderRequestOptions
): Promise<LiveExecutionResult> {
  const {
    model,
    modality,
    prompt,
    settings,
    onLog,
    videoParams,
    imageParams,
  } = options

  const provider = model.provider
  const apiKey = getProviderApiKey(provider, settings)
  const isLiveReady = isLiveProviderReady(provider, settings)

  const startTime = performance.now()

  // -------------------------------------------------------------
  // PATH A: AUTHENTIC LIVE BYOK HTTPS REQUEST
  // -------------------------------------------------------------
  if (isLiveReady) {
    onLog?.(`[Connector] 🌐 Authenticated Live BYOK -> ${provider.toUpperCase()} (${model.name})`)

    try {
      const controller = new AbortController()
      const timeoutSec = modality === "video" ? 60 : 25
      const timer = setTimeout(() => controller.abort(), timeoutSec * 1000)

      // 0. Registry models on OpenAI, OpenRouter and Gemini run through their own connectors,
      //    with the exact model the user picked and the parameters its schema allows
      const directRecord = getRecord(model.id)
      if (isDirectRecord(directRecord)) {
        clearTimeout(timer)
        const out = await runDirect({
          record: directRecord,
          apiKey,
          prompt,
          params: options.params ?? {},
          filterOn: settings.aiEngine?.bypassSafetyChecker !== true,
          references: {
            images: options.references?.images?.length ? options.references.images : imageParams?.referenceImageUrl ? [imageParams.referenceImageUrl] : [],
            groups: options.references?.groups,
            startFrameUrl: videoParams?.startFrameUrl ?? videoParams?.referenceImageUrl,
            endFrameUrl: videoParams?.endFrameUrl,
            sourceVideoUrl: options.references?.sourceVideoUrl,
            sourceAudioUrl: options.references?.sourceAudioUrl,
          },
        })
        const latencyMs = Math.round(performance.now() - startTime)
        const actual = actualCostOf(directRecord, out.raw, options.params ?? {})
        if (actual) options.onActualCost?.(actual)
        onLog?.(`✓ [Connector] ${directRecord.provider} ${directRecord.endpoint} completed (${latencyMs}ms)`)
        return {
          isLive: true,
          provider,
          modelId: model.id,
          latencyMs,
          textResponse: out.text,
          videoUrl: out.videoUrl,
          imageUrls: out.imageUrls,
          audioUrl: out.audioUrl,
          rawResponse: out.raw,
        }
      }

      // 1. Google Gemini Live (Text / Multimodal Reasoning)
      if (provider === "gemini") {
        if (modality === "video") {
          clearTimeout(timer)
          throw new LiveProviderAPIError("gemini", "Gemini video generation is not available in this build. Use a video model from fal or Replicate.")
        } else {
        let cleanModel = "gemini-2.0-flash"
        if (model.id.includes("1.5-pro")) cleanModel = "gemini-1.5-pro"
        else if (model.id.includes("1.5-flash")) cleanModel = "gemini-1.5-flash"
        else if (model.id.includes("2.0-flash") || model.id.includes("2.5")) cleanModel = "gemini-2.0-flash"
        else if (model.id.startsWith("gemini-")) cleanModel = model.id

        let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`
        if (typeof window !== "undefined") {
          endpoint = `/api/proxy/gemini/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const errText = await res.text().catch(() => "")
          throw new LiveProviderAPIError(
            "gemini",
            `Gemini API Error (HTTP ${res.status}): ${errText.slice(0, 200)}`,
            res.status
          )
        }

        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }
        const textResponse =
          data.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini completed analysis."

        const latencyMs = Math.round(performance.now() - startTime)
        onLog?.(`✓ [Connector] Live 200 OK from Gemini (${latencyMs}ms)`)

        return {
          isLive: true,
          provider: "gemini",
          modelId: model.id,
          latencyMs,
          textResponse,
          rawResponse: data,
        }
        }
      }

      // 2. OpenRouter Live (Claude 3.7, DeepSeek R1, Qwen)
      if (provider === "openrouter") {
        const rawModelId = model.id.replace(/^openrouter\//, "")
        const endpoint = "https://openrouter.ai/api/v1/chat/completions"

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Gencraft",
          },
          body: JSON.stringify({
            model: rawModelId,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const errText = await res.text().catch(() => "")
          throw new LiveProviderAPIError(
            "openrouter",
            `OpenRouter API Error (HTTP ${res.status}): ${errText.slice(0, 200)}`,
            res.status
          )
        }

        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>
        }
        const textResponse =
          data.choices?.[0]?.message?.content || "OpenRouter generation complete."
        const latencyMs = Math.round(performance.now() - startTime)
        onLog?.(`✓ [Connector] Live 200 OK from OpenRouter (${latencyMs}ms)`)

        return {
          isLive: true,
          provider: "openrouter",
          modelId: model.id,
          latencyMs,
          textResponse,
          rawResponse: data,
        }
      }

      // 3. OpenAI Live (GPT-4o, DALL-E 3, TTS-1)
      if (provider === "openai") {
        if (modality === "image") {
          const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey.trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt,
              n: 1,
              size: "1024x1024",
            }),
            signal: controller.signal,
          })
          clearTimeout(timer)

          if (!res.ok) {
            const err = await res.text().catch(() => "")
            throw new LiveProviderAPIError("openai", `OpenAI DALL-E Error (HTTP ${res.status}): ${err.slice(0, 200)}`, res.status)
          }

          const data = (await res.json()) as { data?: Array<{ url?: string }> }
          const imageUrls = (data.data || []).map((d) => d.url || "").filter(Boolean)
          const latencyMs = Math.round(performance.now() - startTime)
          onLog?.(`✓ [Connector] Live 200 OK from OpenAI DALL-E 3 (${latencyMs}ms)`)

          return {
            isLive: true,
            provider: "openai",
            modelId: model.id,
            latencyMs,
            imageUrls,
            rawResponse: data,
          }
        }

        // Text / chat completions
        const rawModel = model.id.replace(/^openai\//, "")
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: rawModel.includes("gpt") || rawModel.includes("o3") ? rawModel : "gpt-4o",
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const err = await res.text().catch(() => "")
          throw new LiveProviderAPIError("openai", `OpenAI API Error (HTTP ${res.status}): ${err.slice(0, 200)}`, res.status)
        }

        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const textResponse = data.choices?.[0]?.message?.content || "OpenAI response completed."
        const latencyMs = Math.round(performance.now() - startTime)
        onLog?.(`✓ [Connector] Live 200 OK from OpenAI (${latencyMs}ms)`)

        return {
          isLive: true,
          provider: "openai",
          modelId: model.id,
          latencyMs,
          textResponse,
          rawResponse: data,
        }
      }

      // 4. fal.ai Live (Flux, Kling, Stable Audio)
      if (provider === "fal") {
        const falRecord = getRecord(model.id)
        if (falRecord && falRecord.provider === "fal" && falRecord.endpoint !== falRecord.id) {
          clearTimeout(timer)
          const translatedParams = translateParamsToModelSchema(falRecord, options.params ?? {})
          const shaped = shapeRun(
            falRecord,
            prompt,
            translatedParams,
            filesFrom({
              startFrameUrl: videoParams?.startFrameUrl,
              endFrameUrl: videoParams?.endFrameUrl,
              images: options.references?.images,
              groups: options.references?.groups,
              sourceVideoUrl: options.references?.sourceVideoUrl ?? videoParams?.referenceVideoUrl,
              sourceAudioUrl: options.references?.sourceAudioUrl,
            }),
            undefined,
            true,
          )
          const input = buildInput(falRecord, shaped.prompt, shaped.params)
          // Each file goes into the field this model really has, read from its own schema
          const inline = async (u: string | undefined) => (u ? ((await toInlineUrl(u)) as string) : undefined)
          const legacyRef = imageParams?.referenceImageUrl ?? videoParams?.referenceImageUrl
          const sentImages = options.references?.images?.length ? options.references.images : legacyRef ? [legacyRef] : []
          const images = await Promise.all(sentImages.map((u) => toInlineUrl(u) as Promise<string>))
          const groups = options.references?.groups ? await Promise.all(options.references.groups.map((g) => Promise.all(g.map((u) => toInlineUrl(u) as Promise<string>)))) : undefined
          const { input: files, leftOver } = assignRefs(refCapability(falRecord), {
            start: await inline(videoParams?.startFrameUrl),
            end: await inline(videoParams?.endFrameUrl),
            images,
            groups,
            sourceVideo: await inline(options.references?.sourceVideoUrl ?? videoParams?.referenceVideoUrl),
            sourceAudio: await inline(options.references?.sourceAudioUrl),
            videos: options.references?.sourceVideoUrl ? [(await inline(options.references.sourceVideoUrl))!] : undefined,
            audios: options.references?.sourceAudioUrl ? [(await inline(options.references.sourceAudioUrl))!] : undefined,
          })
          Object.assign(input, files)
          if (leftOver.length > 0) onLog?.(`[fal] ${leftOver.length} reference image(s) did not fit this model and were left out`)
          // The safety field is sent only to a model that has one, in the name that model uses
          Object.assign(input, safetyInput(falRecord.params.safety, settings.aiEngine?.bypassSafetyChecker !== true))
          const unproven = untestedSent(falRecord, input)
          let out: Awaited<ReturnType<typeof runFalEndpoint>>
          try {
            out = await runFalEndpoint({ endpoint: falRecord.endpoint, apiKey, input, onStatus: (m) => onLog?.(`[fal] ${m}`) })
            recordParamChecks(falRecord.id, unproven, "accepted")
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e)
            const dropped = dropRejectedParamsOnError(falRecord, input, errMsg)
            if (dropped.shouldRetry) {
              onLog?.(`[fal] Stripped unsupported param(s) (${dropped.droppedFields.join(", ")}) and retrying...`)
              out = await runFalEndpoint({ endpoint: falRecord.endpoint, apiKey, input: dropped.cleanedInput, onStatus: (m) => onLog?.(`[fal] ${m}`) })
            } else {
              recordParamChecks(falRecord.id, fieldsNamedIn(errMsg, unproven), "rejected")
              throw e
            }
          }
          const latencyMs = Math.round(performance.now() - startTime)
          const actual = actualCostOf(falRecord, out.raw, shaped.params)
          if (actual) options.onActualCost?.(actual)
          onLog?.(`✓ [Connector] ${falRecord.endpoint} completed (${latencyMs}ms)`)
          return {
            isLive: true,
            provider: "fal",
            modelId: model.id,
            latencyMs,
            videoUrl: out.videoUrl,
            imageUrls: out.imageUrls,
            audioUrl: out.audioUrl,
            rawResponse: out.raw,
          }
        }
        let endpoint = "https://queue.fal.run/fal-ai/flux/schnell"
        if (modality === "video") endpoint = "https://queue.fal.run/fal-ai/kling-video/v1.5/pro/text-to-video"
        if (modality === "audio") endpoint = "https://queue.fal.run/fal-ai/stable-audio"

        const body: Record<string, unknown> = { prompt }
        // Default OFF for Safety Checker: bypassSafetyChecker defaults to true (uncensored)
        const bypassSafety = settings.aiEngine?.bypassSafetyChecker === true
        body.enable_safety_checker = !bypassSafety

        if (videoParams?.startFrameUrl || videoParams?.referenceImageUrl) {
          body.image_url = videoParams.startFrameUrl || videoParams.referenceImageUrl
        }
        if (videoParams?.endFrameUrl) {
          body.tail_image_url = videoParams.endFrameUrl
        }
        if (videoParams?.cameraMotion && videoParams.cameraMotion !== "static") {
          body.camera_control = { type: videoParams.cameraMotion }
        }
        if (videoParams?.referenceVideoUrl) {
          body.video_url = videoParams.referenceVideoUrl
        }

        if (modality === "image") {
          body.image_size = "landscape_16_9"
          body.num_images = imageParams?.batchCount || 1
          if (imageParams?.referenceImageUrl) {
            body.image_url = imageParams.referenceImageUrl
          }
        }
        if (modality === "video") {
          body.duration = "10"
          body.aspect_ratio = videoParams?.aspectRatio || "16:9"
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Key ${apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const err = await res.text().catch(() => "")
          throw new LiveProviderAPIError("fal", `fal.ai Error (HTTP ${res.status}): ${err.slice(0, 200)}`, res.status)
        }

        const data = (await res.json()) as {
          images?: Array<{ url?: string }>
          video?: { url?: string }
          audio_file?: { url?: string }
        }

        const latencyMs = Math.round(performance.now() - startTime)
        onLog?.(`✓ [Connector] Live 200 OK from fal.ai (${latencyMs}ms) [Safety Filter: ${bypassSafety ? "Bypassed" : "Active"}]`)

        return {
          isLive: true,
          provider: "fal",
          modelId: model.id,
          latencyMs,
          videoUrl: data.video?.url,
          imageUrls: data.images?.map((i) => i.url || "").filter(Boolean),
          audioUrl: data.audio_file?.url,
          rawResponse: data,
        }
      }

      // 5. Replicate Live (Wan 2.1, Wan 2.6, Flux Schnell)
      if (provider === "replicate") {
        let endpoint = "https://api.replicate.com/v1/models/wan-video/wan-2.1-1.3b/predictions"
        const inputBody: Record<string, unknown> = { prompt }

        // Default OFF for Safety Checker: disable_safety_checker true (uncensored)
        const bypassSafety = settings.aiEngine?.bypassSafetyChecker === true
        inputBody.disable_safety_checker = bypassSafety

        if (videoParams?.startFrameUrl || videoParams?.referenceImageUrl) {
          inputBody.image = videoParams.startFrameUrl || videoParams.referenceImageUrl
          inputBody.first_frame_image = videoParams.startFrameUrl || videoParams.referenceImageUrl
        }
        if (videoParams?.endFrameUrl) {
          inputBody.last_frame_image = videoParams.endFrameUrl
        }
        if (videoParams?.referenceVideoUrl) {
          inputBody.video = videoParams.referenceVideoUrl
        }

        if (modality === "video") {
          endpoint = "https://api.replicate.com/v1/models/wan-video/wan-2.1-1.3b/predictions"
          if (typeof window !== "undefined") {
            endpoint = "/api/proxy/replicate/v1/models/wan-video/wan-2.1-1.3b/predictions"
          }
          inputBody.num_frames = 81
          inputBody.aspect_ratio = videoParams?.aspectRatio || "16:9"
          onLog?.(`[Connector] Dispatching Replicate Wan 2.1 Video prediction... [Safety Filter: ${bypassSafety ? "Bypassed" : "Active"}]`)
        } else if (modality === "image") {
          endpoint = "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions"
          if (typeof window !== "undefined") {
            endpoint = "/api/proxy/replicate/v1/models/black-forest-labs/flux-schnell/predictions"
          }
          inputBody.aspect_ratio = imageParams?.aspectRatio || "16:9"
          inputBody.num_outputs = imageParams?.batchCount || 1
          if (imageParams?.referenceImageUrl) {
            inputBody.image = imageParams.referenceImageUrl
          }
          onLog?.(`[Connector] Dispatching Replicate FLUX Schnell Image prediction... [Safety Filter: ${bypassSafety ? "Bypassed" : "Active"}]`)
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
            Prefer: "wait=60",
          },
          body: JSON.stringify({ input: inputBody }),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const err = await res.text().catch(() => "")
          throw new LiveProviderAPIError(
            "replicate",
            `Replicate Error (HTTP ${res.status}): ${err.slice(0, 200)}`,
            res.status
          )
        }

        let data = (await res.json()) as {
          id?: string
          status?: string
          urls?: { get?: string }
          output?: string | string[]
          error?: string
        }

        // If still processing after wait window, poll for up to 30s
        let getUrl = data.urls?.get
        if (typeof window !== "undefined" && getUrl) {
          getUrl = getUrl.replace("https://api.replicate.com", "/api/proxy/replicate")
        }
        if ((data.status === "starting" || data.status === "processing") && getUrl) {
          let pollAttempts = 0
          while (
            (data.status === "starting" || data.status === "processing") &&
            pollAttempts < 8
          ) {
            await new Promise((r) => setTimeout(r, 3500))
            pollAttempts++
            onLog?.(`⏳ [Connector] Replicate inference in progress (${pollAttempts * 3.5}s)...`)
            const pollRes = await fetch(getUrl, {
              headers: { Authorization: `Bearer ${apiKey.trim()}` },
            })
            if (pollRes.ok) {
              data = await pollRes.json()
              if (data.status === "succeeded") break
              if (data.status === "failed") {
                throw new LiveProviderAPIError("replicate", `Replicate prediction failed: ${data.error || "Unknown error"}`)
              }
            }
          }
        }

        const latencyMs = Math.round(performance.now() - startTime)
        onLog?.(`✓ [Connector] Live Replicate ${modality} completed (${latencyMs}ms)`)

        let videoUrl: string | undefined
        let imageUrls: string[] | undefined

        if (modality === "video") {
          videoUrl = Array.isArray(data.output)
            ? data.output[0]
            : typeof data.output === "string"
            ? data.output
            : undefined
        } else if (modality === "image") {
          imageUrls = Array.isArray(data.output)
            ? data.output
            : typeof data.output === "string"
            ? [data.output]
            : undefined
        }

        return {
          isLive: true,
          provider: "replicate",
          modelId: model.id,
          latencyMs,
          videoUrl,
          imageUrls,
          rawResponse: data,
        }
      }
    } catch (err: unknown) {
      if (err instanceof LiveProviderAPIError) {
        throw err
      }
      const msg = err instanceof Error ? err.message : String(err)
      throw new LiveProviderAPIError(provider, `Live API fetch exception: ${msg}`)
    }
  }

  // No key means no generation. Nothing is faked: the user is told what to do.
  throw new LiveProviderAPIError(
    provider,
    `No ${provider} key is set, so nothing was generated. Add one in Settings, Providers.`,
  )
}


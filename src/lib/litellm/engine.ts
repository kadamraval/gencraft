import type { ModelPrice, ModelRecord, PriceRule, RegistryModality } from "../registry/types"
import type { Category } from "../sheet/types"

/**
 * Core LiteLLM Engine: Single source of truth for multi-provider model discovery, modality/category resolution,
 * capability flags, canonical cross-provider linking, and tiered pricing from `model_prices_and_context_window.json`.
 */

export const LITELLM_PRICES_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

/** Maps LiteLLM's `litellm_provider` values to our 5 supported studio provider IDs (plus known maker prefixes). */
export const LITELLM_PROVIDER_MAP: Record<string, string> = {
  fal_ai: "fal",
  fal: "fal",
  replicate: "replicate",
  openrouter: "openrouter",
  anthropic: "openrouter",
  deepseek: "openrouter",
  mistral: "openrouter",
  xai: "openrouter",
  perplexity: "openrouter",
  cohere: "openrouter",
  cohere_chat: "openrouter",
  openai: "openai",
  "text-completion-openai": "openai",
  gemini: "gemini",
  vertex_ai: "gemini",
  "vertex_ai-language-models": "gemini",
  "vertex_ai-image-models": "gemini",
  "vertex_ai-video-models": "gemini",
  "vertex_ai-chat-models": "gemini",
  runwayml: "runway",
  dashscope: "dashscope",
}

export const SUPPORTED_STUDIO_PROVIDERS = new Set(["fal", "replicate", "openrouter", "gemini", "openai"])

export interface LiteLLMCapabilities {
  vision?: boolean
  reasoning?: boolean
  functionCalling?: boolean
  parallelFunctionCalling?: boolean
  responseSchema?: boolean
  audioInput?: boolean
  audioOutput?: boolean
  videoInput?: boolean
  pdfInput?: boolean
  webSearch?: boolean
  promptCaching?: boolean
  computerUse?: boolean
  maxInputTokens?: number
  maxOutputTokens?: number
  supportedEndpoints?: string[]
  deprecationDate?: string
}

export interface RawLiteLLMEntry {
  litellm_provider?: string
  mode?: string
  max_input_tokens?: number
  max_output_tokens?: number
  max_tokens?: number
  input_cost_per_token?: number
  output_cost_per_token?: number
  output_cost_per_reasoning_token?: number
  cache_read_input_token_cost?: number
  output_cost_per_image?: number
  input_cost_per_image?: number
  output_cost_per_second?: number
  output_cost_per_video_per_second?: number
  input_cost_per_second?: number
  input_cost_per_audio_per_second?: number
  input_cost_per_character?: number
  output_cost_per_character?: number
  output_cost_per_audio_token?: number
  output_cost_per_image_token?: number
  supports_vision?: boolean
  supports_reasoning?: boolean
  supports_function_calling?: boolean
  supports_parallel_function_calling?: boolean
  supports_response_schema?: boolean
  supports_audio_input?: boolean
  supports_audio_output?: boolean
  supports_video_input?: boolean
  supports_pdf_input?: boolean
  supports_web_search?: boolean
  supports_prompt_caching?: boolean
  supports_computer_use?: boolean
  supported_endpoints?: string[]
  deprecation_date?: string
  source?: string
  [key: string]: unknown
}

export interface ParsedLiteLLMModel {
  /** Key in `model_prices_and_context_window.json` */
  litellmKey: string
  /** Normalized studio provider ("fal" | "replicate" | "openrouter" | "gemini" | "openai" | maker) */
  provider: string
  /** Provider-specific endpoint identifier */
  endpoint: string
  /** Canonical provider-independent model slug (e.g. "bytedance/seedance-2.5", "google/veo-3.1", "openai/gpt-5") */
  canonicalId: string
  /** Studio modality ("text" | "image" | "video" | "audio") */
  modality: RegistryModality
  /** Standardized input-to-output category */
  category: Category
  /** Extracted LiteLLM capabilities and token limits */
  capabilities: LiteLLMCapabilities
  /** Extracted ModelPrice with resolution/audio tier rules */
  price?: ModelPrice
}

/** Strips provider prefixes and task suffixes so identical models across Fal, Replicate, OpenRouter, Gemini & OpenAI share one canonical key. */
export function canonicalModelId(key: string, provider?: string): string {
  let clean = key.trim().toLowerCase()
  const prefixes = ["fal_ai/", "fal-ai/", "fal/", "replicate/", "openrouter/", "vertex_ai/", "gemini/", "openai/", "runwayml/", "dashscope/", "aiml/", "xai/"]
  for (const p of prefixes) {
    if (clean.startsWith(p)) {
      clean = clean.slice(p.length)
      break
    }
  }
  if (provider && clean.startsWith(`${provider.toLowerCase()}/`)) {
    clean = clean.slice(provider.length + 1)
  }
  // Remove trailing version hashes on Replicate (owner/name:hash -> owner/name)
  clean = clean.replace(/:[0-9a-f]{8,64}$/i, "")
  // Normalize common version path segments (e.g. seedream/v5/pro/text-to-image -> seedream-5-pro)
  clean = clean
    .replace(/\/(text-to-video|image-to-video|reference-to-video|video-to-video|text-to-image|image-to-image|edit-image|edit-video|extend-video|edit|generate)$/i, "")
    .replace(/\/v(\d+(?:\.\d+)?)\b/g, "-$1")
  return clean
}

/** Resolves the studio provider and endpoint from a LiteLLM key and `litellm_provider` field. */
export function resolveProviderAndEndpoint(key: string, litellmProvider: string): { provider: string; endpoint: string } {
  const provider = LITELLM_PROVIDER_MAP[litellmProvider] ?? litellmProvider
  const rawPrefixes = [litellmProvider, provider, "fal_ai", "openrouter", "replicate", "vertex_ai", "gemini", "openai"]
  let endpoint = key
  for (const p of rawPrefixes) {
    if (endpoint.startsWith(`${p}/`)) {
      endpoint = endpoint.slice(p.length + 1)
      break
    }
  }
  return { provider, endpoint }
}

/** Maps LiteLLM `mode` + key structure to our studio `RegistryModality` and `Category`. */
export function resolveModalityAndCategory(key: string, entry: RawLiteLLMEntry): { modality: RegistryModality; category: Category } | null {
  const mode = (entry.mode ?? "").toLowerCase()
  const lowerKey = key.toLowerCase()
  const endpoints = Array.isArray(entry.supported_endpoints) ? entry.supported_endpoints.map((s) => String(s).toLowerCase()) : []

  if (mode === "video_generation" || endpoints.some((e) => e.includes("/videos"))) {
    if (lowerKey.includes("reference-to-video")) return { modality: "video", category: "reference-to-video" }
    if (lowerKey.includes("image-to-video") || lowerKey.includes("i2v")) return { modality: "video", category: "image-to-video" }
    if (lowerKey.includes("video-to-video") || lowerKey.includes("v2v")) return { modality: "video", category: "video-to-video" }
    return { modality: "video", category: "text-to-video" }
  }

  if (mode === "image_edit" || (mode === "image_generation" && /(?:\/|-|_)(?:edit|inpaint|outpaint|upscale|restore|relight|remove-bg|background)$/i.test(lowerKey))) {
    return { modality: "image", category: "image-to-image" }
  }

  if (mode === "image_generation" || endpoints.some((e) => e.includes("/images/generations"))) {
    return { modality: "image", category: "text-to-image" }
  }

  if (mode === "audio_speech" || endpoints.some((e) => e.includes("/audio/speech"))) {
    return { modality: "audio", category: "text-to-speech" }
  }

  if (mode === "audio_transcription" || endpoints.some((e) => e.includes("/audio/transcriptions"))) {
    return { modality: "audio", category: "speech-to-text" }
  }

  if (mode === "audio_generation" || (mode.startsWith("audio") && !mode.includes("speech") && !mode.includes("transcription"))) {
    return { modality: "audio", category: "text-to-audio" }
  }

  if (mode === "chat" || mode === "completion" || mode === "responses") {
    return { modality: "text", category: "chat" }
  }

  // Fallback for LiteLLM entries (e.g. Replicate / OpenRouter) that omit `mode`
  if (!mode) {
    if (typeof entry.output_cost_per_video_per_second === "number" || /(?:text-to-video|image-to-video|video-generation|\bveo\b|\bkling\b|\bseedance\b|\bwan-\b|\bhailuo\b|\bsora\b)/i.test(lowerKey)) {
      return { modality: "video", category: lowerKey.includes("image-to-video") ? "image-to-video" : "text-to-video" }
    }
    if (typeof entry.output_cost_per_image === "number" || /(?:stable-diffusion|\bsdxl\b|\bflux\b|\bimagen\b|\bseedream\b|\bideogram\b|\brecraft\b|\bdall-e\b)/i.test(lowerKey)) {
      return { modality: "image", category: "text-to-image" }
    }
    if (typeof entry.input_cost_per_character === "number" || typeof entry.input_cost_per_audio_per_second === "number" || /(?:\bwhisper\b|\btts\b|text-to-speech|\belevenlabs\b|\blyria\b)/i.test(lowerKey)) {
      return { modality: "audio", category: lowerKey.includes("whisper") ? "speech-to-text" : "text-to-speech" }
    }
    if (typeof entry.input_cost_per_token === "number" || typeof entry.output_cost_per_token === "number" || typeof entry.max_tokens === "number" || typeof entry.max_input_tokens === "number") {
      return { modality: "text", category: "chat" }
    }
  }

  return null
}

/** Extracts structured capability flags and token limits from a LiteLLM entry. */
export function extractCapabilities(entry: RawLiteLLMEntry): LiteLLMCapabilities {
  const caps: LiteLLMCapabilities = {}
  if (typeof entry.supports_vision === "boolean") caps.vision = entry.supports_vision
  if (typeof entry.supports_reasoning === "boolean") caps.reasoning = entry.supports_reasoning
  if (typeof entry.supports_function_calling === "boolean") caps.functionCalling = entry.supports_function_calling
  if (typeof entry.supports_parallel_function_calling === "boolean") caps.parallelFunctionCalling = entry.supports_parallel_function_calling
  if (typeof entry.supports_response_schema === "boolean") caps.responseSchema = entry.supports_response_schema
  if (typeof entry.supports_audio_input === "boolean") caps.audioInput = entry.supports_audio_input
  if (typeof entry.supports_audio_output === "boolean") caps.audioOutput = entry.supports_audio_output
  if (typeof entry.supports_video_input === "boolean") caps.videoInput = entry.supports_video_input
  if (typeof entry.supports_pdf_input === "boolean") caps.pdfInput = entry.supports_pdf_input
  if (typeof entry.supports_web_search === "boolean") caps.webSearch = entry.supports_web_search
  if (typeof entry.supports_prompt_caching === "boolean") caps.promptCaching = entry.supports_prompt_caching
  if (typeof entry.supports_computer_use === "boolean") caps.computerUse = entry.supports_computer_use

  const maxIn = typeof entry.max_input_tokens === "number" ? entry.max_input_tokens : typeof entry.max_tokens === "number" ? entry.max_tokens : undefined
  const maxOut = typeof entry.max_output_tokens === "number" ? entry.max_output_tokens : typeof entry.max_tokens === "number" ? entry.max_tokens : undefined
  if (maxIn && maxIn > 0) caps.maxInputTokens = maxIn
  if (maxOut && maxOut > 0) caps.maxOutputTokens = maxOut

  if (Array.isArray(entry.supported_endpoints)) {
    caps.supportedEndpoints = entry.supported_endpoints.map(String)
  }
  if (typeof entry.deprecation_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(entry.deprecation_date)) {
    caps.deprecationDate = entry.deprecation_date
  }
  return caps
}

/** Extracts resolution and audio tier rules from LiteLLM's `output_cost_per_(second|image)_*` keys. */
export function extractTierRules(entry: RawLiteLLMEntry): PriceRule[] {
  const rules: PriceRule[] = []
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    const m = /^output_cost_per_(?:second|image|video_per_second)_(.+)$/i.exec(k)
    if (!m) continue
    const suffix = m[1]!.toLowerCase()
    const when: Record<string, string | number | boolean> = {}

    const resMatch = /(480p|540p|720p|768p|1080p|1440p|2k|4k)/i.exec(suffix)
    if (resMatch) when.resolution = resMatch[1]!.toLowerCase()

    if (suffix.includes("without_audio") || suffix.includes("no_audio") || suffix.includes("audio_off")) {
      when.generate_audio = false
    } else if (suffix.includes("with_audio") || suffix.includes("audio_on") || suffix === "audio") {
      when.generate_audio = true
    }

    if (Object.keys(when).length > 0) {
      rules.push({ when, amount: v })
    }
  }
  return rules
}

/** Extracts a studio `ModelPrice` from a LiteLLM entry, including token rates and resolution/audio tier rules. */
export function extractLiteLLMPrice(entry: RawLiteLLMEntry, fetchedAt = new Date().toISOString()): ModelPrice | undefined {
  const rules = extractTierRules(entry)
  const withRules = (base: Omit<ModelPrice, "source" | "fetchedAt" | "rules">): ModelPrice => ({
    ...base,
    ...(rules.length > 0 ? { rules } : {}),
    source: "api",
    fetchedAt,
  })

  // 1. Per-second video / audio generation
  if (typeof entry.output_cost_per_second === "number") {
    return withRules({ unit: "per_second", amount: entry.output_cost_per_second })
  }
  if (typeof entry.output_cost_per_video_per_second === "number") {
    return withRules({ unit: "per_second", amount: entry.output_cost_per_video_per_second })
  }

  // 2. Per-image generation
  if (typeof entry.output_cost_per_image === "number") {
    return withRules({ unit: "per_image", amount: entry.output_cost_per_image })
  }
  if (entry.mode === "image_generation" && typeof entry.input_cost_per_image === "number" && entry.input_cost_per_image > 0) {
    return withRules({ unit: "per_image", amount: entry.input_cost_per_image })
  }

  // 3. Per-1k characters (TTS)
  if (typeof entry.input_cost_per_character === "number" && entry.input_cost_per_character > 0) {
    return withRules({ unit: "per_1k_chars", amount: +(entry.input_cost_per_character * 1000).toFixed(6) })
  }
  if (typeof entry.output_cost_per_character === "number" && entry.output_cost_per_character > 0) {
    return withRules({ unit: "per_1k_chars", amount: +(entry.output_cost_per_character * 1000).toFixed(6) })
  }

  // 4. Audio input per-second (STT / transcription)
  if (entry.mode === "audio_transcription" && typeof entry.input_cost_per_second === "number") {
    return withRules({ unit: "per_second", amount: entry.input_cost_per_second })
  }
  if (typeof entry.input_cost_per_audio_per_second === "number" && entry.mode !== "chat") {
    return withRules({ unit: "per_second", amount: entry.input_cost_per_audio_per_second })
  }

  // 5. Token-priced media (e.g. Gemini image/audio output tokens)
  const mediaOutToken =
    typeof entry.output_cost_per_image_token === "number"
      ? entry.output_cost_per_image_token
      : typeof entry.output_cost_per_audio_token === "number" && entry.mode !== "chat"
        ? entry.output_cost_per_audio_token
        : undefined
  if (mediaOutToken !== undefined) {
    const inAmt = typeof entry.input_cost_per_token === "number" ? +(entry.input_cost_per_token * 1e6).toFixed(4) : +(mediaOutToken * 1e6).toFixed(4)
    const outAmt = +(mediaOutToken * 1e6).toFixed(4)
    return withRules({ unit: "per_1m_tokens", amount: outAmt, outputAmount: outAmt !== inAmt ? outAmt : undefined })
  }

  // 6. Standard LLM / Chat per-1M token pricing
  if (typeof entry.input_cost_per_token === "number" || typeof entry.output_cost_per_token === "number") {
    const inPer1M = typeof entry.input_cost_per_token === "number" ? +(entry.input_cost_per_token * 1e6).toFixed(4) : 0
    const outPer1M = typeof entry.output_cost_per_token === "number" ? +(entry.output_cost_per_token * 1e6).toFixed(4) : inPer1M
    const cachedPer1M = typeof entry.cache_read_input_token_cost === "number" ? +(entry.cache_read_input_token_cost * 1e6).toFixed(4) : undefined
    return {
      unit: "per_1m_tokens",
      amount: inPer1M,
      outputAmount: outPer1M,
      ...(cachedPer1M !== undefined ? { cachedAmount: cachedPer1M } : {}),
      source: "api",
      fetchedAt,
    }
  }

  return undefined
}

/** Parses a full LiteLLM `model_prices_and_context_window.json` dictionary (or cached `{ data }` wrapper) into structured `ParsedLiteLLMModel` entries. */
export function parseLiteLLMDatabase(
  db: Record<string, RawLiteLLMEntry> | { data: Record<string, RawLiteLLMEntry> },
  options?: { onlySupportedProviders?: boolean; fetchedAt?: string },
): ParsedLiteLLMModel[] {
  const fetchedAt = options?.fetchedAt ?? new Date().toISOString()
  const onlySupported = options?.onlySupportedProviders ?? false
  const dict: Record<string, RawLiteLLMEntry> =
    "data" in db && db.data && typeof db.data === "object" && !("litellm_provider" in db.data)
      ? (db.data as Record<string, RawLiteLLMEntry>)
      : (db as Record<string, RawLiteLLMEntry>)
  const out: ParsedLiteLLMModel[] = []

  for (const [key, entry] of Object.entries(dict)) {
    if (key === "sample_spec" || !entry || typeof entry !== "object" || !entry.litellm_provider) continue
    const { provider, endpoint } = resolveProviderAndEndpoint(key, entry.litellm_provider)
    if (onlySupported && !SUPPORTED_STUDIO_PROVIDERS.has(provider)) continue

    const modCat = resolveModalityAndCategory(key, entry)
    if (!modCat) continue

    const capabilities = extractCapabilities(entry)
    const price = extractLiteLLMPrice(entry, fetchedAt)

    out.push({
      litellmKey: key,
      provider,
      endpoint,
      canonicalId: canonicalModelId(endpoint, provider),
      modality: modCat.modality,
      category: modCat.category,
      capabilities,
      price,
    })
  }

  return out
}

/** Enriches a studio `ModelRecord` with LiteLLM's capabilities, retirement date, and price fallback. */
export function enrichRecordWithLiteLLM(record: ModelRecord, parsed: ParsedLiteLLMModel): ModelRecord {
  const caps = parsed.capabilities
  const inputs = new Set(record.inputs)
  if (caps.vision) inputs.add("image")
  if (caps.videoInput) inputs.add("video")
  if (caps.audioInput) inputs.add("audio")

  const price =
    record.price.amount === null && parsed.price
      ? parsed.price
      : record.price.amount !== null && !record.price.rules?.length && parsed.price?.rules?.length
        ? { ...record.price, rules: parsed.price.rules }
        : record.price

  const summary = {
    ...record.summary,
    ...(caps.maxInputTokens && !record.summary?.contextTokens ? { contextTokens: caps.maxInputTokens } : {}),
    ...(caps.audioOutput && record.summary?.audio === undefined ? { audio: true } : {}),
    ...(caps.vision ? { vision: true } : {}),
    ...(caps.reasoning ? { reasoning: true } : {}),
    ...(caps.webSearch ? { webSearch: true } : {}),
    ...(caps.videoInput ? { videoInput: true } : {}),
    ...(caps.audioInput ? { audioInput: true } : {}),
  }

  return {
    ...record,
    inputs: [...inputs],
    price,
    tools: record.tools ?? caps.functionCalling,
    retiresAt: record.retiresAt ?? caps.deprecationDate,
    task: record.task ?? (parsed.category !== "chat" ? parsed.category : undefined),
    summary,
  }
}

import type { Category, CatalogSource, Fact, PriceValue } from "../types"

/**
 * LiteLLM's community price and mode file, read into facts. Each entry is one provider route: `fal_ai/bytedance/seedance-2.5/text-to-video`
 * is the host "fal" and the endpoint `bytedance/seedance-2.5/text-to-video`. What it says: the mode (image_generation, video_generation,
 * audio_speech ...) and a price. It never says what a model is for, and it has no settings.
 */

export const LITELLM_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

/** LiteLLM provider ids to ours */
const HOST: Record<string, string> = {
  fal_ai: "fal",
  runwayml: "runway",
  vertex_ai: "vertex",
  "vertex_ai-language-models": "gemini",
  "vertex_ai-image-models": "gemini",
  "vertex_ai-video-models": "gemini",
  "vertex_ai-chat-models": "gemini",
  "text-completion-openai": "openai",
}

export interface LitellmEntry {
  litellm_provider?: string
  mode?: string
  output_cost_per_image?: number
  output_cost_per_second?: number
  output_cost_per_video_per_second?: number
  input_cost_per_character?: number
  input_cost_per_audio_per_second?: number
  input_cost_per_image?: number
  input_cost_per_second?: number
  input_cost_per_token?: number
  output_cost_per_token?: number
  output_cost_per_audio_token?: number
  output_cost_per_image_token?: number
  deprecation_date?: string
  supports_vision?: boolean
  supports_reasoning?: boolean
  supports_function_calling?: boolean
  supports_audio_input?: boolean
  supports_video_input?: boolean
  [k: string]: unknown
}

const MODE_CATEGORY: Record<string, Category | undefined> = {
  image_generation: "text-to-image",
  image_edit: "image-to-image",
  audio_speech: "text-to-speech",
  audio_transcription: "speech-to-text",
  chat: "chat",
}

export function splitKey(key: string, provider: string): { host: string; endpoint: string } {
  const host = HOST[provider] ?? provider
  const prefix = `${provider}/`
  const endpoint = key.startsWith(prefix) ? key.slice(prefix.length) : key
  return { host, endpoint }
}

/** The price the entry states, with the tier prices it lists kept in the note */
export function priceOfEntry(e: LitellmEntry): PriceValue | undefined {
  const tiers = Object.keys(e)
    .filter((k) => /^output_cost_per_(second|image)_/.test(k) && typeof e[k] === "number")
    .map((k) => `${k.replace(/^output_cost_per_(second|image)_/, "")} $${e[k]}`)
  const note = tiers.length ? tiers.join(", ") : undefined
  if (typeof e.output_cost_per_second === "number") return { amount: e.output_cost_per_second, unit: "per_second", currency: "USD", note }
  if (typeof e.output_cost_per_video_per_second === "number") return { amount: e.output_cost_per_video_per_second, unit: "per_second", currency: "USD", note }
  if (typeof e.output_cost_per_image === "number") return { amount: e.output_cost_per_image, unit: "per_image", currency: "USD", note }
  // xAI lists the price of an image as input_cost_per_image
  if (e.mode === "image_generation" && typeof e.input_cost_per_image === "number") return { amount: e.input_cost_per_image, unit: "per_image", currency: "USD", note: "listed by LiteLLM as input_cost_per_image" }
  if (typeof e.input_cost_per_character === "number") return { amount: e.input_cost_per_character * 1000, unit: "per_thousand_characters", currency: "USD" }
  if (e.mode === "audio_transcription" && typeof e.input_cost_per_second === "number") return { amount: e.input_cost_per_second, unit: "per_second", currency: "USD", note: "per second of audio" }
  if (typeof e.input_cost_per_audio_per_second === "number") return { amount: e.input_cost_per_audio_per_second, unit: "per_second", currency: "USD" }
  // Token-priced media: what a million output tokens cost, with the input price in the note
  const out = typeof e.output_cost_per_audio_token === "number" ? e.output_cost_per_audio_token : typeof e.output_cost_per_image_token === "number" ? e.output_cost_per_image_token : undefined
  if (out !== undefined) {
    const input = typeof e.input_cost_per_token === "number" ? `input $${+(e.input_cost_per_token * 1e6).toFixed(4)} per million tokens` : undefined
    return { amount: +(out * 1e6).toFixed(4), unit: "per_million_tokens", currency: "USD", note: ["output tokens", input].filter(Boolean).join(", ") }
  }
  // Chat / Text LLM token pricing
  if (e.mode === "chat" && (typeof e.input_cost_per_token === "number" || typeof e.output_cost_per_token === "number")) {
    const inM = typeof e.input_cost_per_token === "number" ? +(e.input_cost_per_token * 1e6).toFixed(4) : 0
    const outM = typeof e.output_cost_per_token === "number" ? +(e.output_cost_per_token * 1e6).toFixed(4) : inM
    return { amount: inM, unit: "per_million_tokens", currency: "USD", note: `input $${inM}/1M, output $${outM}/1M` }
  }
  return undefined
}

/** The facts of the keys asked for (the maker list names them), or of every media entry when none are given */
export function parseLitellm(file: Record<string, LitellmEntry>, keys?: Iterable<string>): Fact[] {
  const wanted = keys ? new Set(keys) : undefined
  const facts: Fact[] = []
  for (const [key, e] of Object.entries(file)) {
    if (key === "sample_spec" || !e.mode || !e.litellm_provider) continue
    if (wanted ? !wanted.has(key) : !(e.mode in MODE_CATEGORY || e.mode === "video_generation")) continue
    const { host, endpoint } = splitKey(key, e.litellm_provider)
    const base = { host, endpoint, source: "litellm", confidence: "community" as const, via: key }
    const category = MODE_CATEGORY[e.mode]
    if (category) facts.push({ ...base, field: "category", value: category })
    // A video entry names its category in the last segment when it says one
    else if (e.mode === "video_generation") {
      const tail = /(text|image|reference|video)-to-video$/.exec(key)?.[0]
      if (tail) facts.push({ ...base, field: "category", value: tail })
    }
    const typeVal = e.mode === "chat" ? "text" : e.mode.startsWith("image") ? "image" : e.mode.startsWith("video") ? "video" : "audio"
    facts.push({ ...base, field: "type", value: typeVal })
    const price = priceOfEntry(e)
    if (price) facts.push({ ...base, field: "price", value: price })
    if (typeof e.deprecation_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(e.deprecation_date)) {
      facts.push({ ...base, field: "date", value: e.deprecation_date })
    }
  }
  return facts
}

export function litellmSource(fetchJson: (url: string) => Promise<Record<string, LitellmEntry>>, keys?: Iterable<string>): CatalogSource {
  return { id: "litellm", fetch: async () => parseLitellm(await fetchJson(LITELLM_URL), keys) }
}

import type { ModelRecord, ParamSchema, RegistryModality } from "../types"
import { withReferenceSlot } from "../ref-limits"
import { isOutdatedDescription } from "../lifecycle"
import { summarize } from "../summary"

/**
 * OpenAI direct models, read from OpenAI's own documentation (Markdown versions of the docs pages):
 *   models.md                    the catalog: every model with a one-line description
 *   models/{id}.md               per model: modalities, context window, price tables, endpoint support
 *   deprecations.md              shutdown dates and recommended replacements
 *
 * Nothing here is hard-coded model knowledge. If OpenAI retires a model (Sora 2 was shut down on 2026-09-24)
 * or releases a new one, the next build reflects it. Only the *parameter values* a model type accepts are
 * written down below, each with the official page they come from.
 */

const DOCS = "https://developers.openai.com/api/docs"

export interface OpenAIListItem {
  name: string
  id: string
  description: string
}

export interface OpenAIDetail {
  inputs: string[]
  outputs: string[]
  contextTokens?: number
  maxOutputTokens?: number
  knowledgeCutoff?: string
  prices: Array<{ group: string; metric: string; amount: number; unit: string }>
  endpoints: Record<string, boolean>
}

export interface Deprecation {
  /** ISO date */
  shutdown: string
  ids: string[]
  replacement?: string
}

export function parseModelList(md: string): OpenAIListItem[] {
  const items = new Map<string, OpenAIListItem>()
  for (const m of md.matchAll(/^- \[([^\]]+)\]\(\/api\/docs\/models\/([^)]+?)\.md\): (.*)$/gm)) {
    if (!items.has(m[2]!)) items.set(m[2]!, { name: m[1]!, id: m[2]!, description: m[3]!.trim() })
  }
  return [...items.values()]
}

const num = (s: string) => Number(s.replace(/,/g, ""))

export function parseModelDetail(md: string): OpenAIDetail {
  const details = md.split(/^## Model details/m)[1]?.split(/^## /m)[0] ?? ""
  const list = (label: string) =>
    (details.match(new RegExp(`${label}: ([^\\n]+)`, "i"))?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)

  const prices: OpenAIDetail["prices"] = []
  const pricing = md.split(/^## Pricing/m)[1]?.split(/^## /m)[0] ?? ""
  let group = ""
  for (const line of pricing.split("\n")) {
    const heading = line.match(/^### (.+)$/)
    if (heading) {
      group = heading[1]!.trim()
      continue
    }
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*\$([\d.,]+)\s*\|\s*([^|]+?)\s*\|$/)
    if (row) prices.push({ group, metric: row[1]!, amount: num(row[2]!), unit: row[3]!.toLowerCase() })
  }

  const endpoints: Record<string, boolean> = {}
  const table = md.split(/^## Endpoints/m)[1]?.split(/^## /m)[0] ?? ""
  for (const row of table.matchAll(/^\|\s*([^|]+?)\s*\|\s*`[^`]*`\s*\|\s*(Supported|Not supported)\s*\|$/gm)) {
    endpoints[row[1]!.trim().toLowerCase()] = row[2] === "Supported"
  }

  return {
    inputs: list("Input modalities"),
    outputs: list("Output modalities"),
    contextTokens: details.match(/([\d,]+) context window/) ? num(details.match(/([\d,]+) context window/)![1]!) : undefined,
    maxOutputTokens: details.match(/([\d,]+) max output tokens/) ? num(details.match(/([\d,]+) max output tokens/)![1]!) : undefined,
    knowledgeCutoff: details.match(/([A-Z][a-z]{2} \d{1,2}, \d{4}) knowledge cutoff/)?.[1],
    prices,
    endpoints,
  }
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

function toIsoDate(text: string): string | null {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`
  const long = text.match(/([A-Za-z]+) (\d{1,2}), (\d{4})/)
  if (long) {
    const month = MONTHS.indexOf(long[1]!.toLowerCase())
    if (month >= 0) return new Date(Date.UTC(Number(long[3]), month, Number(long[2]))).toISOString()
  }
  return null
}

/**
 * The pricing page lists "| model | Image | input | cached | output |" style rows. The first row per model
 * and kind is the Standard rate (Batch and Flex follow with different numbers).
 */
export function parsePricingRows(md: string): Map<string, string[]> {
  const rows = new Map<string, string[]>()
  for (const line of md.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim())
    if (cells.length < 4 || !/^[a-z0-9][a-z0-9.\-]*$/i.test(cells[0]!)) continue
    const key = `${cells[0]!.toLowerCase()}|${cells[1]!.toLowerCase()}`
    if (!rows.has(key)) rows.set(key, cells.slice(2))
  }
  return rows
}

const dollars = (cell: string | undefined): number | null => {
  const m = cell?.match(/\$([\d.,]+)/)
  return m ? num(m[1]!) : null
}

/** Rows of the shutdown tables: | date | `model` \| `model` | `replacement` | */
export function parseDeprecations(md: string): Deprecation[] {
  const out: Deprecation[] = []
  for (const raw of md.split("\n")) {
    if (!raw.startsWith("|")) continue
    const line = raw.replace(/\\\|/g, "\u0001")
    const cells = line.split("|").slice(1, -1).map((c) => c.trim())
    if (cells.length < 3) continue
    const shutdown = toIsoDate(cells[0]!)
    if (!shutdown) continue
    const ids = [...cells[1]!.replace(/\u0001/g, "|").matchAll(/`([^`]+)`/g)].map((m) => m[1]!)
    if (ids.length === 0) continue
    out.push({ shutdown, ids, replacement: cells[2]!.match(/`([^`]+)`/)?.[1] })
  }
  return out
}

/** Facts about the parameters each OpenAI model type accepts. Source pages are noted per block. */
const IMAGE_PARAMS = (premiumQuality: boolean): ParamSchema => ({
  type: "object",
  properties: {
    // https://developers.openai.com/api/docs/guides/image-generation  ("Customize image output")
    size: {
      type: "string",
      title: "Size",
      enum: ["auto", "1024x1024", "1536x1024", "1024x1536"],
      default: "auto",
      tier: "common",
    },
    quality: {
      type: "string",
      title: "Quality",
      enum: premiumQuality ? ["auto", "low", "medium", "high", "xhigh", "max"] : ["auto", "low", "medium", "high"],
      default: "auto",
      tier: "common",
    },
    n: { type: "integer", title: "Images", minimum: 1, maximum: 10, default: 1, tier: "common" },
    background: { type: "string", title: "Background", enum: ["auto", "transparent", "opaque"], default: "auto", tier: "unique" },
    // The same page: png (default), jpeg or webp; compression 0 to 100 for jpeg and webp only; moderation auto (default) or low
    output_format: { type: "string", title: "Output format", enum: ["png", "jpeg", "webp"], default: "png", tier: "unique" },
    output_compression: { type: "integer", title: "Compression", description: "0 to 100. Applies to JPEG and WebP only.", minimum: 0, maximum: 100, tier: "advanced" },
    moderation: { type: "string", title: "Moderation", enum: ["auto", "low"], default: "auto", tier: "advanced" },
  },
})

// https://developers.openai.com/api/docs/guides/text-to-speech
// https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
// tts-1 and tts-1-hd take nine voices and no instructions; gpt-4o-mini-tts takes thirteen and a style prompt
const CLASSIC_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]
const MINI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"]
const TTS_PARAMS = (id: string): ParamSchema => {
  const classic = /^tts-1/.test(id)
  return {
    type: "object",
    properties: {
      voice: { type: "string", title: "Voice", enum: classic ? CLASSIC_VOICES : MINI_VOICES, default: classic ? "alloy" : "marin", tier: "unique" },
      ...(classic ? {} : { instructions: { type: "string", title: "Style", description: "How to say it: accent, emotion, tone, pace, whispering.", tier: "unique" } as const }),
      speed: { type: "number", title: "Speed", minimum: 0.25, maximum: 4, default: 1, tier: "advanced" },
      response_format: { type: "string", title: "File format", enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"], default: "mp3", tier: "technical" },
    },
  }
}

const EXCLUDE_NAME =
  /codex|cyber|daybreak|computer-use|search|deep-research|realtime|live|moderation|embedding|oss|babbage|davinci|translate|diarize|audio-preview|^gpt-audio|chat-latest|chatgpt|-chat|text-moderation/i

function priceFor(modality: RegistryModality, d: OpenAIDetail, id: string, pricing: Map<string, string[]>): ModelRecord["price"] | null {
  const fetchedAt = new Date().toISOString()
  const find = (group: RegExp, metric: RegExp) => d.prices.find((p) => group.test(p.group) && metric.test(p.metric))
  if (modality === "text") {
    const input = find(/text/i, /^input$/i)
    const output = find(/text/i, /^output$/i)
    const cached = find(/text/i, /cached/i)
    if (input && output) return { unit: "per_1m_tokens", amount: input.amount, outputAmount: output.amount, ...(cached ? { cachedAmount: cached.amount } : {}), source: "scraped", fetchedAt }
  }
  if (modality === "image") {
    const out = find(/image/i, /^output$/i)
    if (out) return { unit: "per_1m_tokens", amount: out.amount, source: "scraped", fetchedAt }
    // Some model pages carry no price block; the pricing page has "| id | Image | input | cached | output |"
    const row = dollars(pricing.get(`${id}|image`)?.[2])
    if (row !== null) return { unit: "per_1m_tokens", amount: row, source: "scraped", fetchedAt }
  }
  if (modality === "audio") {
    const minute = d.prices.find((p) => /minute/.test(p.unit))
    if (minute) return { unit: "per_minute", amount: minute.amount, source: "scraped", fetchedAt }
    const chars = d.prices.find((p) => /character/.test(p.unit)) ?? null
    if (chars) return { unit: "per_1k_chars", amount: chars.amount / 1000, source: "scraped", fetchedAt }
    const perChars = dollars(pricing.get(`${id}|text`)?.[0])
    if (perChars !== null && /character/.test(pricing.get(`${id}|text`)?.[0] ?? "")) return { unit: "per_1k_chars", amount: perChars / 1000, source: "scraped", fetchedAt }
    const audioOut = d.prices.find((p) => /audio/i.test(p.group) && /output/i.test(p.metric))
    if (audioOut) return { unit: "per_1m_tokens", amount: audioOut.amount, source: "scraped", fetchedAt }
  }
  return null
}

/** The settings of OpenAI's transcription endpoint (/v1/audio/transcriptions) */
const TRANSCRIBE_PARAMS: ParamSchema = {
  type: "object",
  properties: {
    language: { type: "string", title: "Language", description: "The spoken language as a two-letter code (en, hi, fr). Leave empty to detect it.", tier: "common" },
    response_format: { type: "string", title: "Result format", enum: ["json", "text", "srt", "verbose_json", "vtt"], default: "json", tier: "common" },
    temperature: { type: "number", title: "Temperature", minimum: 0, maximum: 1, default: 0, tier: "advanced" },
  },
}

/** A transcription model is priced in audio tokens: what goes in and what comes out */
function transcriptionPrice(d: OpenAIDetail, fetchedAt: string): ModelRecord["price"] | undefined {
  const input = d.prices.find((p) => /input/i.test(p.metric) && /audio/i.test(p.group))
  const output = d.prices.find((p) => /output/i.test(p.metric) && /audio/i.test(p.group))
  if (!input) return undefined
  return { unit: "per_1m_tokens", amount: input.amount, ...(output ? { outputAmount: output.amount } : {}), source: "scraped", fetchedAt }
}

export interface OpenAIBuild {
  records: ModelRecord[]
  skipped: string[]
}

/** Turns the official pages into registry records. Models that are not for creative generation are skipped. */
export function buildOpenAIRecords(
  items: OpenAIListItem[],
  details: Map<string, OpenAIDetail>,
  deprecations: Deprecation[],
  pricing: Map<string, string[]> = new Map(),
  fetchedAt = new Date().toISOString(),
): OpenAIBuild {
  const retire = new Map<string, Deprecation>()
  for (const d of deprecations) for (const id of d.ids) retire.set(id, d)

  const records: ModelRecord[] = []
  const skipped: string[] = []
  for (const item of items) {
    const detail = details.get(item.id)
    if (!detail || EXCLUDE_NAME.test(`${item.id} ${item.name}`)) {
      skipped.push(item.id)
      continue
    }
    const e = detail.endpoints
    let modality: RegistryModality | null = null
    if (e["image generation"]) modality = "image"
    else if (e["videos"]) modality = "video"
    else if (e["speech generation"] || e["transcription"]) modality = "audio"
    else if (e["responses"] || e["chat completions"]) modality = "text"
    if (!modality) {
      skipped.push(item.id)
      continue
    }

    const transcribes = Boolean(e["transcription"]) && !e["speech generation"]
    const premium = /2\.5/.test(item.id)
    const params: ParamSchema = modality === "image" ? IMAGE_PARAMS(premium) : modality === "audio" ? (transcribes ? TRANSCRIBE_PARAMS : TTS_PARAMS(item.id)) : { type: "object", properties: {} }
    const dep = retire.get(item.id)
    const summary = { ...summarize(modality, params, item.description), contextTokens: detail.contextTokens }
    if (modality === "image") summary.maxResolution = "4K"

    records.push(withReferenceSlot({
      id: `openai/${item.id}`,
      endpoint: item.id,
      provider: "openai",
      name: item.name,
      family: item.id,
      logoKey: "openai",
      maker: "OpenAI",
      modality,
      inputs: detail.inputs.filter((i): i is "text" | "image" | "video" | "audio" => ["text", "image", "video", "audio"].includes(i)),
      params,
      price: (transcribes ? transcriptionPrice(detail, fetchedAt) : undefined) ?? priceFor(modality, detail, item.id, pricing) ?? { unit: "unknown", amount: null, source: "estimate", fetchedAt },
      status: "active",
      description: item.description,
      retiresAt: dep?.shutdown,
      supersededBy: undefined,
      outdated: isOutdatedDescription(item.description),
      summary,
      updatedAt: detail.knowledgeCutoff ? new Date(detail.knowledgeCutoff).toISOString() : undefined,
      task: modality === "image" ? "text-to-image" : modality === "audio" ? (transcribes ? "speech-to-text" : "text-to-speech") : undefined,
    }))
  }
  return { records, skipped }
}

export async function fetchOpenAIRecords(fetchText: (url: string) => Promise<string>): Promise<OpenAIBuild> {
  const items = parseModelList(await fetchText(`${DOCS}/models.md`))
  const deprecations = parseDeprecations(await fetchText(`${DOCS}/deprecations.md`))
  const pricing = parsePricingRows(await fetchText(`${DOCS}/pricing.md`))
  const details = new Map<string, OpenAIDetail>()
  let next = 0
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < items.length) {
        const item = items[next++]!
        try {
          details.set(item.id, parseModelDetail(await fetchText(`${DOCS}/models/${item.id}.md`)))
        } catch {
          // one unreadable page must not stop the rest
        }
      }
    }),
  )
  return buildOpenAIRecords(items, details, deprecations, pricing)
}

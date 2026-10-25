import type { ModelRecord, ParamSchema, RegistryModality } from "../types"
import { withReferenceSlot } from "../ref-limits"
import { isOutdatedDescription } from "../lifecycle"
import { geminiImageParams, geminiOmniParams, geminiSpeechParams, geminiTranscribeParams } from "./gemini-params"

/**
 * Google Gemini direct models, read from Google's own documentation (the .md.txt versions of the pages):
 *   models.md.txt          the catalog: model cards with a description and a Stable/Preview tag
 *   pricing.md.txt         one section per model with its price tables
 *   deprecations.md.txt    release dates, shutdown dates and recommended replacements
 *
 * Prices that change on a known date ("$0.75 through December 31, 2026. $1.50 starting January 1, 2027") are
 * resolved against today's date, so the app always shows the price that applies now.
 */

const DOCS = "https://ai.google.dev/gemini-api/docs"

export interface GeminiCard {
  name: string
  id: string
  description: string
  tags: string
}

export interface GeminiDeprecation {
  id: string
  /** ISO date or undefined */
  released?: string
  shutdown?: string
  replacement?: string
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

function toIso(text: string): string | undefined {
  const m = text.match(/([A-Za-z]+) (\d{1,2}), (\d{4})/)
  if (!m) return undefined
  const month = MONTHS.indexOf(m[1]!.toLowerCase())
  return month < 0 ? undefined : new Date(Date.UTC(Number(m[3]), month, Number(m[2]))).toISOString()
}

/** Model cards look like: [### Name\nDescription\nNew Stable](https://ai.google.dev/gemini-api/docs/models/<id>) */
export function parseCards(md: string): GeminiCard[] {
  const out = new Map<string, GeminiCard>()
  for (const m of md.matchAll(/\[### (.+?)\n([\s\S]*?)\n((?:New |Stable |Preview |Deprecated |Experimental |Latest )*[A-Za-z ]*)\]\(https:\/\/ai\.google\.dev\/gemini-api\/docs\/models\/([^)\s]+)\)/g)) {
    const id = m[4]!
    if (!out.has(id)) out.set(id, { name: m[1]!.trim(), id, description: m[2]!.replace(/\s+/g, " ").trim(), tags: m[3]!.trim() })
  }
  return [...out.values()]
}

export function parseDeprecations(md: string): GeminiDeprecation[] {
  const out: GeminiDeprecation[] = []
  for (const line of md.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim())
    const id = cells[0]?.match(/`([^`]+)`/)?.[1]
    if (cells.length < 3 || !id) continue
    out.push({ id, released: toIso(cells[1] ?? ""), shutdown: toIso(cells[2] ?? ""), replacement: cells[3]?.match(/`([^`]+)`/)?.[1] })
  }
  return out
}

/** The price that applies on `now`, out of cell text such as "$0.75 through Dec 31, 2026. $1.50 starting Jan 1, 2027." */
export function currentAmount(cell: string, now = Date.now()): number | null {
  const stepped = cell.match(/\$(\d[\d.,]*)[^$]*?through ([A-Za-z]+ \d{1,2}, \d{4})[^$]*?\$(\d[\d.,]*)[^$]*?starting ([A-Za-z]+ \d{1,2}, \d{4})/)
  if (stepped) {
    const until = Date.parse(toIso(stepped[2]!) ?? "")
    return Number((now <= until ? stepped[1]! : stepped[3]!).replace(/,/g, ""))
  }
  const first = cell.match(/\$(\d[\d.,]*)/)
  return first ? Number(first[1]!.replace(/,/g, "")) : null
}

export interface GeminiPrice {
  input: number
  output: number
}

/**
 * What a second of Omni video costs. Google bills its video by tokens and states the effective price in the footnote of the model's section:
 * "calculated at a rate of 5,792 tokens per second of 720p video ... approximately $0.10 per second".
 */
export function parseVideoSecondPrices(md: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const section of md.split(/^## /m).slice(1)) {
    const codes = [...(section.split("\n").slice(0, 6).join("\n").matchAll(/`(gemini-omni[a-z0-9.\-]*)`/g))].map((m) => m[1]!)
    const sec = section.match(/approximately \$(\d[\d.,]*) per second/i)
    if (sec) for (const code of codes) out.set(code, Number(sec[1]!.replace(/,/g, "")))
  }
  return out
}

/** What a minute of transcription costs: the footnote states the blended rate ("an effective blended rate of ~$0.005 per min for Transcribe"). */
export function parseMinutePrices(md: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const section of md.split(/^## /m).slice(1)) {
    const codes = [...section.split("\n").slice(0, 6).join("\n").matchAll(/`(gemini-[a-z0-9.\-]*transcribe)`/g)].map((m) => m[1]!)
    const min = section.match(/blended rate of\s*\\?~?\$(\d[\d.,]*) per min/i)
    if (min) for (const code of codes) out.set(code, Number(min[1]!.replace(/,/g, "")))
  }
  return out
}

/** Pricing sections: "## Title" then an italic line naming the model codes, then a "### Standard" table. */
export function parsePricing(md: string, now = Date.now()): Map<string, GeminiPrice> {
  const out = new Map<string, GeminiPrice>()
  for (const section of md.split(/^## /m).slice(1)) {
    const codes = [...(section.split("\n").slice(0, 6).join("\n").matchAll(/`([a-z0-9][a-z0-9.\-]*)`/g))].map((m) => m[1]!)
    const standard = section.split(/^### Standard/m)[1]?.split(/^### /m)[0] ?? ""
    let input: number | null = null
    let output: number | null = null
    for (const row of standard.split("\n")) {
      const cells = row.split("|").slice(1, -1).map((c) => c.trim())
      if (cells.length < 3) continue
      if (/^input price/i.test(cells[0]!)) input = currentAmount(cells[2]!, now)
      if (/^output price/i.test(cells[0]!)) output = currentAmount(cells[2]!, now)
    }
    if (input !== null && output !== null) for (const code of codes) out.set(code, { input, output })
  }
  return out
}

type Kind = RegistryModality | null

/** Which cards are creative or chat models the app can use. Live, translate, transcribe and embedding are not. */
export function classify(id: string): Kind {
  // The file transcriber (not its live-streaming twin) is a speech-to-text model
  if (/transcribe/.test(id) && !/live/.test(id)) return "audio"
  if (/live|transcribe|translate|embedding|robotics|computer-use|gemma/.test(id)) return null
  if (/image|nano-banana/.test(id)) return "image"
  if (/veo|omni/.test(id)) return "video"
  if (/tts|lyria/.test(id)) return "audio"
  if (/^gemini-[\d.]+-(flash|pro)/.test(id)) return "text"
  return null
}

const NO_PARAMS: ParamSchema = { type: "object", properties: {} }

export interface GeminiBuild {
  records: ModelRecord[]
  skipped: string[]
}

export function buildGeminiRecords(
  cards: GeminiCard[],
  deprecations: GeminiDeprecation[],
  pricing: Map<string, GeminiPrice>,
  fetchedAt = new Date().toISOString(),
  videoSeconds: Map<string, number> = new Map(),
  minutes: Map<string, number> = new Map(),
): GeminiBuild {
  const dep = new Map(deprecations.map((d) => [d.id, d]))
  const records: ModelRecord[] = []
  const skipped: string[] = []
  for (const card of cards) {
    const modality = classify(card.id)
    if (!modality) {
      skipped.push(card.id)
      continue
    }
    const d = dep.get(card.id)
    const p = pricing.get(card.id)
    // Omni's page is filed under "gemini-omni-flash" but the model is called by its versioned code, "gemini-omni-1.1-flash"
    const code = [...videoSeconds.keys()].find((k) => k.replace(/-\d+(?:\.\d+)*(?=-)/, "") === card.id) ?? card.id
    const perSecond = videoSeconds.get(code)
    const perMinute = minutes.get(code)
    const transcribes = modality === "audio" && /transcribe/.test(card.id)
    records.push(withReferenceSlot({
      id: `gemini/${code}`,
      endpoint: code,
      provider: "gemini",
      name: card.name,
      family: card.id,
      logoKey: "gemini",
      maker: "Google",
      modality,
      inputs: modality === "text" || modality === "image" ? ["text", "image"] : modality === "video" ? ["text", "image", "video", "audio"] : ["text"],
      params: modality === "image" ? geminiImageParams(card.id) : transcribes ? geminiTranscribeParams() : modality === "audio" && /tts/.test(card.id) ? geminiSpeechParams() : modality === "video" && /omni/.test(card.id) ? geminiOmniParams() : NO_PARAMS,
      price: transcribes && perMinute !== undefined
        ? { unit: "per_minute", amount: perMinute, source: "scraped", fetchedAt }
        : modality === "video" && perSecond !== undefined
        ? { unit: "per_second", amount: perSecond, source: "scraped", fetchedAt }
        : p
        ? { unit: "per_1m_tokens", amount: p.input, outputAmount: p.output, source: "scraped", fetchedAt }
        : { unit: "unknown", amount: null, source: "estimate", fetchedAt },
      status: /preview/i.test(card.tags) ? "preview" : "active",
      description: card.description,
      retiresAt: d?.shutdown,
      outdated: isOutdatedDescription(card.description),
      updatedAt: d?.released,
      task: modality === "image" ? "text-to-image" : modality === "audio" ? (transcribes ? "speech-to-text" : "text-to-speech") : modality === "video" ? "text-to-video" : undefined,
    }))
  }
  return { records, skipped }
}

export async function fetchGeminiRecords(fetchText: (url: string) => Promise<string>): Promise<GeminiBuild> {
  const cards = parseCards(await fetchText(`${DOCS}/models.md.txt`))
  const deprecations = parseDeprecations(await fetchText(`${DOCS}/deprecations.md.txt`))
  const pricingText = await fetchText(`${DOCS}/pricing.md.txt`)
  return buildGeminiRecords(cards, deprecations, parsePricing(pricingText), new Date().toISOString(), parseVideoSecondPrices(pricingText), parseMinutePrices(pricingText))
}

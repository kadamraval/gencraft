import type { ModelPrice, ModelRecord, ParamProperty, ParamSchema, PriceRule, RegistryModality } from "../types"
import { applyParamPolicy } from "../param-policy"
import { summarize } from "../summary"
import { detectSlot } from "../slots"
import { detectSafety } from "../safety"
import { REQUEST_VERSION, buildRequestSpec } from "../request"
import { officialFetchList, officialSpecFor } from "../official-specs"
import { withStandardParams } from "../../litellm/params"

/**
 * Replicate models, unlocked by the user's API token.
 *
 *   GET /v1/collections             the topic collections (text-to-image, text-to-video, ...)
 *   GET /v1/collections/{slug}      the models in one collection
 *   GET /v1/models/{owner}/{name}   one model with its latest version and input schema
 *   replicate.com/{owner}/{name}    the model page, which embeds its billing tiers as JSON
 *
 * The API needs a token, and Replicate does not allow browser requests, so the desktop app reaches it through
 * Tauri's HTTP and the dev server reaches it through its proxy. The caller supplies the fetcher.
 */

export type ReplicateFetch = (path: string, init?: RequestInit) => Promise<Response>

interface JsonSchema {
  type?: string
  title?: string
  description?: string
  enum?: Array<string | number>
  default?: string | number | boolean
  minimum?: number
  maximum?: number
  format?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  items?: JsonSchema
  maxItems?: number
  $ref?: string
  "x-cog-array-type"?: string
  "x-cog-array-display"?: string
}

interface OpenApi {
  components?: { schemas?: Record<string, JsonSchema> }
}

interface ModelObject {
  owner: string
  name: string
  description?: string | null
  run_count?: number
  latest_version?: { id: string; created_at?: string; openapi_schema?: OpenApi }
  is_official?: boolean
}

function resolveRef(ref: string, root: OpenApi): JsonSchema | undefined {
  return root.components?.schemas?.[ref.replace("#/components/schemas/", "")]
}

/** Cog schemas wrap enums as allOf: [{$ref}]. Flatten that into one plain schema. */
function flatten(schema: JsonSchema, root: OpenApi, depth = 0): JsonSchema {
  if (depth > 4) return schema
  let out: JsonSchema = { ...schema }
  if (out.$ref) out = { ...flatten(resolveRef(out.$ref, root) ?? {}, root, depth + 1), ...out, $ref: undefined }
  for (const part of [...(out.allOf ?? []), ...(out.anyOf ?? []).filter((p) => p.type !== "null"), ...(out.oneOf ?? []).filter((p) => p.type !== "null")]) {
    const f = flatten(part, root, depth + 1)
    out = { ...f, ...out, enum: out.enum ?? f.enum, type: out.type ?? f.type }
  }
  return out
}

function inferFormat(key: string, s: JsonSchema): ParamProperty["format"] | undefined {
  const isFile = s.format === "uri" || s.format === "data-url" || (s.type === "array" && s.items?.format === "uri")
  if (!isFile) return undefined
  if (/video/.test(key)) return "video"
  if (/audio|speech|voice_sample/.test(key)) return "audio"
  if (/image|frame|photo|picture|reference/.test(key)) return "image"
  return undefined
}

/**
 * What a model returns, read from its own output schema. Language models stream text as a list of string
 * pieces that are joined; media models return a file address.
 */
export function outputKind(detail: ModelObject): "text" | "file" | "other" {
  const out = detail.latest_version?.openapi_schema?.components?.schemas?.Output
  if (!out) return "other"
  if (out.type === "array" && out.items?.type === "string") {
    if (out.items.format === "uri") return "file"
    return out["x-cog-array-display"] === "concatenate" || out["x-cog-array-type"] === "iterator" ? "text" : "other"
  }
  if (out.type === "string") return out.format === "uri" ? "file" : "text"
  return "other"
}

export function extractInput(detail: ModelObject, modality: RegistryModality = "image"): { params: ParamSchema; unknown: string[] } | null {
  const openapi = detail.latest_version?.openapi_schema
  const input = openapi?.components?.schemas?.Input
  if (!openapi || !input) return null
  const properties: Record<string, ParamProperty> = {}
  for (const [key, raw] of Object.entries(input.properties ?? {})) {
    if (key === "prompt") continue // the prompt field is recorded in the request spec, not shown as a control
    const s = flatten(raw, openapi)
    const isFile = s.format === "uri" || s.format === "data-url" || (s.type === "array" && s.items?.format === "uri")
    if (isFile) {
      // What the file is for and how many the model takes come from the model's own schema
      const slot = detectSlot(key, { type: s.type, items: s.items ? { type: s.items.type } : undefined, maxItems: s.maxItems, description: s.description }, modality)
      const format = slot?.kind ?? inferFormat(key, s)
      if (format) properties[key] = { type: "string", title: s.title ?? key, format, ...(slot ? { slot } : {}) }
      continue
    }
    if (s.type === "string" || s.type === "number" || s.type === "integer" || s.type === "boolean") {
      properties[key] = {
        type: s.type,
        title: s.title ?? key,
        description: s.description,
        enum: s.enum,
        default: s.default,
        minimum: s.minimum,
        maximum: s.maximum,
      }
    }
  }
  const policy = applyParamPolicy({ type: "object", properties, required: input.required?.filter((r) => r in properties) })
  // What the maker documents wins over the generic policy: kept fields get their label, missing ones are added as untested
  const official = officialSpecFor("replicate", `${detail.owner}/${detail.name}`)
  if (official) {
    for (const [key, over] of Object.entries(official.keep)) {
      const own = properties[key]
      if (own && !policy.params.properties[key]) policy.params.properties[key] = { ...own, ...over }
    }
    for (const [key, prop] of Object.entries(official.add)) if (!policy.params.properties[key]) policy.params.properties[key] = prop
  }
  const raw =Object.fromEntries(Object.entries(input.properties ?? {}).map(([k, v]) => {
    const f = flatten(v, openapi)
    return [k, { type: f.type, enum: f.enum }]
  }))
  const safety = detectSafety(raw)
  const fields = Object.fromEntries(Object.entries(input.properties ?? {}).map(([k, v]) => {
    const f = flatten(v, openapi)
    return [k, { type: f.type, default: f.default, enum: f.enum, file: Boolean(properties[k]?.format) }]
  }))
  const request = buildRequestSpec(fields, input.required ?? [], new Set(Object.keys(properties)))
  return { params: { ...policy.params, ...(safety ? { safety } : {}), request }, unknown: policy.unknown }
}

/** Collections worth reading, and what each kind of output they hold. */
const COLLECTION_KIND: Array<{ match: RegExp; modality: RegistryModality; task: string }> = [
  { match: /image-to-video|video-generation-from-image/i, modality: "video", task: "image-to-video" },
  { match: /text-to-video|video-generation|official-video/i, modality: "video", task: "text-to-video" },
  { match: /image-edit|edit-image|inpaint/i, modality: "image", task: "image-to-image" },
  { match: /text-to-image|image-generation|flux|official-image/i, modality: "image", task: "text-to-image" },
  { match: /text-to-speech|speech|voice/i, modality: "audio", task: "text-to-speech" },
  { match: /music|sound|audio-generation|text-to-audio/i, modality: "audio", task: "text-to-audio" },
  { match: /language|llm|chat|text-generation/i, modality: "text", task: "text" },
]
const SKIP_COLLECTION = /restor|super-resolution|upscal|caption|detect|segment|embed|3d|train|ocr|classif|remove-background|depth|face-swap|nsfw/i

/**
 * Collections of tools that change a file (upscale, restore, remove a background, separate a voice, edit a video). They are read like the
 * others, but each model's own input decides what it is: a video in means a video tool, a sound in an audio tool, a picture in a picture
 * tool. This is how the AI tools find Replicate models without a hand-kept list.
 */
const TOOL_COLLECTION = /restor|super-resolution|upscal|remove-background|background|enhanc|denois|colori|separat|isolat|interpol|video-edit|audio-edit|dubb|lip-?sync|voice-conver|vocal|relight|inpaint|outpaint/i

export function isToolCollection(slug: string): boolean {
  return TOOL_COLLECTION.test(slug) && !/text-to-|image-generation|official/i.test(slug)
}

/** What a tool model works on, from the files its own input schema takes */
export function toolKindOf(detail: ModelObject): { modality: RegistryModality; task: string } | null {
  const openapi = detail.latest_version?.openapi_schema
  const props = openapi?.components?.schemas?.Input?.properties ?? {}
  const files = Object.entries(props)
    .map(([key, raw]) => ({ key, s: flatten(raw, openapi!) }))
    .filter(({ s }) => s.format === "uri" || s.format === "data-url" || (s.type === "array" && s.items?.format === "uri"))
    .map(({ key }) => key)
  if (files.length === 0) return null
  if (files.some((k) => /video/.test(k))) return { modality: "video", task: "video-to-video" }
  if (files.some((k) => /audio|speech|voice|music|song|stem|track/.test(k))) return { modality: "audio", task: "audio-to-audio" }
  return { modality: "image", task: "image-to-image" }
}

export function collectionKind(slug: string): { modality: RegistryModality; task: string } | null {
  if (SKIP_COLLECTION.test(slug)) return null
  return COLLECTION_KIND.find((c) => c.match.test(slug)) ?? null
}

/**
 * What a file-making model makes, read from its own name and description. Replicate files its newest official media
 * models under "official" (read as chat), so a model that returns a file there is sorted by what it says it is.
 * Video is tested first because "image-to-video" mentions both; audio before image for "voice" and "music".
 */
export function mediaKindOf(detail: Pick<ModelObject, "name" | "description">, fields: string[] = []): { modality: RegistryModality; task: string } | null {
  // Tools that change a file rather than make one from a prompt are not offered here
  if (SKIP_COLLECTION.test(detail.name)) return null
  // The model's own input fields are the surest sign of all: only a voice or a lyric belongs to audio, and a length
  // together with a resolution, a frame or a sound switch belongs to video, whatever the model is called
  const has = (re: RegExp) => fields.some((k) => re.test(k))
  if (has(/^(voice|voice_id|speaker|lyrics|lyrics_prompt|language_code|music_length_ms|seconds_total)$/)) return { modality: "audio", task: has(/^(voice|voice_id|speaker)$/) ? "text-to-speech" : "text-to-audio" }
  if (fields.includes("duration") && has(/^(resolution|aspect_ratio|generate_audio|fps|start_video|start_image|first_frame|image|images)$/)) {
    return { modality: "video", task: has(/^(image|images|start_image|first_frame|start_video)$/) ? "image-to-video" : "text-to-video" }
  }
  const decide = (text: string) => {
    if (/video|animat|motion|film|clip|[rti]2v/.test(text)) return { modality: "video" as const, task: /image-to-video|from an image|animate|i2v/.test(text) ? "image-to-video" : "text-to-video" }
    if (/speech|tts|voice|music|song|audio|sound|lyria|dubb|vocal/.test(text)) return { modality: "audio" as const, task: /speech|tts|voice|dubb/.test(text) ? "text-to-speech" : "text-to-audio" }
    if (/image|picture|photo|illustrat|logo|vector|svg|banana|flux|seedream|imagen|diffusion|edit/.test(text)) return { modality: "image" as const, task: "text-to-image" }
    return null
  }
  // The name is the surest sign ("lyria" is music, "flux" is images even when its description mentions video); the description settles the rest
  return decide(detail.name.toLowerCase()) ?? decide((detail.description ?? "").toLowerCase())
}

export function recordFromReplicate(detail: ModelObject, collectionKind: { modality: RegistryModality; task: string }, fetchedAt: string): ModelRecord | null {
  // The model's own output decides whether it is a language model; the collection only suggests it.
  // A file-making model under the chat collection ("official") is sorted by what it says it is.
  const out = outputKind(detail)
  const isTool = collectionKind.task === "tool"
  // A tool collection: the model's own input says what it works on, and it must return a file
  if (collectionKind.task === "tool") {
    const tool = out === "file" ? toolKindOf(detail) : null
    if (!tool) return null
    collectionKind = tool
  }
  const kind = out === "text" ? { modality: "text" as RegistryModality, task: "text" } : collectionKind.modality === "text" ? (out === "file" ? mediaKindOf(detail, Object.keys(detail.latest_version?.openapi_schema?.components?.schemas?.Input?.properties ?? {})) : null) : collectionKind
  if (!kind) return null
  const extracted = extractInput(detail, kind.modality)
  const params = extracted?.params ?? { type: "object" as const, properties: {} }
  const hasImage = Object.values(params.properties).some((p) => p.format === "image")
  // A model that takes an image but is listed under text-to-video is an image-to-video model
  const task = kind.modality === "video" && hasImage && kind.task === "text-to-video" ? "image-to-video" : kind.task
  const endpoint = `${detail.owner}/${detail.name}`
  const title = detail.name
    .split("-")
    .map((w) => (/^v?\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
  const baseRec: ModelRecord = {
    id: `replicate/${endpoint}`,
    endpoint,
    provider: "replicate",
    name: title,
    family: detail.name,
    logoKey: detail.owner,
    modality: kind.modality,
    inputs: ["text", ...(["image", "video", "audio"] as const).filter((k) => Object.values(params.properties).some((p) => p.format === k))],
    params,
    price: { unit: "unknown", amount: null, source: "estimate", fetchedAt },
    status: "active",
    description: detail.description ?? undefined,
    task,
    ...(isTool ? { utility: true } : {}),
    updatedAt: detail.latest_version?.created_at,
    providerVersion: detail.latest_version?.id,
  }
  const rec = withStandardParams(baseRec)
  return { ...rec, summary: summarize(rec.modality, rec.params, `${title} ${rec.description ?? ""}`, { audioKnown: false }) }
}

export interface ReplicateFetchResult {
  records: ModelRecord[]
  unknown: Record<string, number>
  failed: number
  /** Models whose version had not changed, kept from the earlier load without reading them again */
  unchanged: number
}

/** Reads the catalog the token can see. Bounded: a few hundred models, a few requests at a time. */
export async function fetchReplicateModels(call: ReplicateFetch, opts: { limit?: number; known?: Map<string, ModelRecord>; onProgress?: (done: number, total: number) => void; onBatch?: (records: ModelRecord[]) => void } = {}): Promise<ReplicateFetchResult> {
  const perKind = opts.limit ?? 80
  const fetchedAt = new Date().toISOString()
  const json = async <T>(path: string): Promise<T> => {
    const res = await call(path)
    if (!res.ok) throw new Error(`Replicate ${path}: HTTP ${res.status}`)
    return (await res.json()) as T
  }

  const list = await json<{ results: Array<{ slug: string }> }>("/v1/collections")
  const wanted = list.results.map((c) => ({ slug: c.slug, kind: collectionKind(c.slug) })).filter((c): c is { slug: string; kind: NonNullable<ReturnType<typeof collectionKind>> } => c.kind !== null)
  // Replicate's own hosted models (Claude, GPT, Gemini, Llama and others) sit in "official"; only chat models are taken from it
  const hasOfficial = list.results.some((c) => c.slug === "official")
  if (hasOfficial) wanted.push({ slug: "official", kind: { modality: "text", task: "text" } })
  // Tool collections: what each model is for is read from its own input (see toolKindOf)
  for (const c of list.results) if (isToolCollection(c.slug) && !wanted.some((w) => w.slug === c.slug)) wanted.push({ slug: c.slug, kind: { modality: "image", task: "tool" } })

  const queue = new Map<string, { model: ModelObject; kind: { modality: RegistryModality; task: string } }>()
  for (const c of wanted) {
    try {
      const col = await json<{ models: ModelObject[] }>(`/v1/collections/${c.slug}`)
      for (const m of col.models ?? []) {
        const id = `${m.owner}/${m.name}`
        if (!queue.has(id)) queue.set(id, { model: m, kind: c.kind })
      }
    } catch {
      // a collection that cannot be read is skipped
    }
  }

  // Models a person has checked by hand that no topic list reaches (Nano Banana 2.1 is in none) are fetched by name
  // The kind is decided from the model's own output and description (see mediaKindOf), like any other "official" entry
  for (const id of officialFetchList("replicate")) {
    const [owner, name] = id.split("/")
    if (owner && name && !queue.has(id)) queue.set(id, { model: { owner, name }, kind: { modality: "text", task: "text" } })
  }

  // Newest first, bounded per kind so a flood of image models cannot crowd out chat or audio
  const taken: Record<string, number> = {}
  const pinned = new Set(officialFetchList("replicate"))
  const isPinned = (i: { model: ModelObject }) => (pinned.has(`${i.model.owner}/${i.model.name}`) ? 1 : 0)
  const items = [...queue.values()]
    .sort((a, b) => isPinned(b) - isPinned(a) || (b.model.latest_version?.created_at ?? "").localeCompare(a.model.latest_version?.created_at ?? ""))
    // Chat gets more room: the "official" collection holds many media models that are dropped after their output is read
    .filter((i) => {
      const lane = i.kind.task === "tool" ? "tool" : i.kind.modality
      taken[lane] = (taken[lane] ?? 0) + 1
      return taken[lane]! <= (lane === "text" ? perKind * 2 : perKind)
    })

  const records: ModelRecord[] = []
  const unknown: Record<string, number> = {}
  let failed = 0
  let unchanged = 0
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < items.length) {
        const { model, kind } = items[next++]!
        const before = opts.known?.get(`replicate/${model.owner}/${model.name}`)
        if (before && before.status !== "deprecated" && before.params.request?.v === REQUEST_VERSION && before.providerVersion && before.providerVersion === model.latest_version?.id) {
          records.push(before)
          unchanged++
          opts.onProgress?.(++done, items.length)
          continue
        }
        try {
          // The collection entry may already carry the schema; otherwise ask for the model itself
          const detail = model.latest_version?.openapi_schema ? model : await json<ModelObject>(`/v1/models/${model.owner}/${model.name}`)
          const rec = recordFromReplicate(detail, kind, fetchedAt)
          if (rec) {
            records.push(rec)
            const ex = extractInput(detail, rec.modality)
            for (const k of ex?.unknown ?? []) unknown[k] = (unknown[k] ?? 0) + 1
          }
        } catch {
          failed++
        }
        opts.onProgress?.(++done, items.length)
        if (done % 20 === 0) opts.onBatch?.([...records])
      }
    }),
  )
  return { records, unknown, failed, unchanged }
}

// Prices

interface BillingTier {
  description?: string
  criteria?: Array<{ title?: string; type?: string; value?: string }>
  prices?: Array<{ metric?: string; price?: string; title?: string }>
}

/**
 * What one Replicate price counts, and how to turn the figure into the app's unit. Replicate says it in the title
 * ("per thousand input characters", "per million output tokens", "per output audio file"), so the title decides, never the
 * size of the number: a figure of 0.10 can be $0.10 per thousand characters or $0.10 per million tokens.
 */
export interface PriceKind {
  unit: ModelPrice["unit"]
  /** Multiply the displayed figure by this to get the figure in `unit` (per thousand tokens to per million: 1000) */
  scale: number
  side?: "input" | "output"
}

export function priceKindOf(price: { metric?: string; title?: string }): PriceKind {
  const title = (price.title ?? "").toLowerCase()
  const both = `${price.metric ?? ""} ${title}`.toLowerCase()
  const side = /input/.test(both) ? ("input" as const) : /output/.test(both) ? ("output" as const) : undefined
  const per = (thousand: RegExp, million: RegExp, single: number): number => (million.test(title) ? 1 : thousand.test(title) ? 1000 : single)
  // "per thousand output images" at "$3" is $0.003 an image: the title says what the figure counts, as it does for tokens and characters
  const thousand = /per (thousand|1,000|1000|1k)\b/.test(title) ? 1 / 1000 : 1
  if (/megapixel/.test(both)) return { unit: "per_megapixel", scale: thousand }
  if (/character/.test(both)) {
    // The app counts speech per thousand characters
    const scale = /million/.test(title) ? 1 / 1000 : /thousand|1,000|\b1k\b/.test(title) ? 1 : 1000
    return { unit: "per_1k_chars", scale, side }
  }
  if (/token/.test(both)) return { unit: "per_1m_tokens", scale: per(/thousand|1,000|\b1k\b/, /million|\b1m\b/, 1_000_000), side }
  if (/minute/.test(title)) return { unit: "per_minute", scale: 1 }
  if (/hour/.test(title)) return { unit: "per_second", scale: 1 / 3600 }
  if (/second|duration/.test(both)) return { unit: "per_second", scale: thousand }
  if (/image/.test(both) && !/audio|video/.test(both)) return { unit: "per_image", scale: thousand }
  return { unit: "per_run", scale: thousand }
}

const dollars = (s: string | undefined): number | null => {
  const m = s?.match(/\$([\d.,]+)/)
  return m ? Number(m[1]!.replace(/,/g, "")) : null
}

/** Pulls the balanced {...} that follows a key out of a page of text. */
function jsonAfter(text: string, key: string): string | null {
  const start = text.indexOf(key)
  if (start < 0) return null
  const open = text.indexOf("{", start)
  if (open < 0) return null
  let depth = 0
  let inString = false
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === "\\") i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === "{") depth++
    else if (c === "}" && --depth === 0) return text.slice(open, i + 1)
  }
  return null
}

/** The name a billing condition has in a price rule: the composer's own name where there is one ("target resolution" is "resolution"). */
export function ruleKey(title: string): string {
  const k = title.toLowerCase().trim().replace(/\s+/g, "_")
  if (/resolution/.test(k)) return "resolution"
  if (/duration|seconds/.test(k)) return "duration"
  if (/aspect/.test(k)) return "aspect_ratio"
  if (/audio/.test(k)) return "generate_audio"
  return k
}

/** Prices read before this day kept only the first condition of each tier, so they are read again once. */
export const PRICE_READER_DATE = "2026-10-15T00:00:00.000Z"

/**
 * A model billed by the time it runs has no billing tiers on its page, but the page carries Replicate's own figures: "price" is the rate per
 * second of the hardware it runs on, and "p50price" is the median cost of a run (what Replicate itself says one typically costs). A
 * run is later billed as its predict_time times the rate, so the median is the price before the run and the time is the price after it.
 */
export function parseHardwarePrice(html: string): { unit: ModelPrice["unit"]; amount: number; computeSecond: number } | null {
  const at = html.indexOf('"billingConfig"')
  const page = at >= 0 ? html.slice(Math.max(0, at - 500), at + 4500) : html
  const rate = /"price":\s*"\$([\d.,]+)\s*(?:per second|\/sec|\/s)"/i.exec(page)
  if (!rate) return null
  const perSecond = Number(rate[1]!.replace(/,/g, ""))
  const median = /"p50price":\s*"\$([\d.,]+)"/i.exec(page)
  if (!Number.isFinite(perSecond) || perSecond <= 0) return null
  // With no median, a run of about five seconds is the guess
  const typical = median ? Number(median[1]!.replace(/,/g, "")) : perSecond * 5
  return { unit: "per_run", amount: Number.isFinite(typical) && typical > 0 ? typical : perSecond * 5, computeSecond: perSecond }
}

/** Reads the billing tiers a Replicate model page embeds as JSON. */
export function parseReplicatePrice(html: string): { unit: ModelPrice["unit"]; amount: number; outputAmount?: number; rules?: PriceRule[]; computeSecond?: number } | null {
  const raw = jsonAfter(html, '"billingConfig"')
  if (!raw || /"billingConfig":\s*null/.test(html)) return parseHardwarePrice(html)
  let config: { current_tiers?: BillingTier[] }
  try {
    config = JSON.parse(raw) as { current_tiers?: BillingTier[] }
  } catch {
    return parseHardwarePrice(html)
  }
  const tiers = config.current_tiers ?? []
  const entries = tiers.flatMap((t) => (t.prices ?? []).map((p) => ({ tier: t, price: p, kind: priceKindOf(p) })))
  const first = entries.find((e) => dollars(e.price.price) !== null)
  // A model that runs on the maker's own key ("You pay OpenAI directly") has no Replicate price: the CPU time on the page
  // is not what it costs, so it stays unpriced here and the maker's billing applies.
  if (!first && tiers.some((t) => /pay .{0,40}directly|bring your own/i.test(t.description ?? ""))) return null
  if (!first) return parseHardwarePrice(html)
  const unit = first.kind.unit
  const scaled = (e: (typeof entries)[number]): number | null => {
    const a = dollars(e.price.price)
    return a === null ? null : a * e.kind.scale
  }

  // Language models, speech models and the like bill what goes in and what comes out separately
  if (unit === "per_1m_tokens" || unit === "per_1k_chars") {
    const same = entries.filter((e) => e.kind.unit === unit)
    const input = same.find((e) => e.kind.side === "input") ?? same[0]!
    const output = same.find((e) => e.kind.side === "output")
    const inAmount = scaled(input)
    if (inAmount === null) return null
    const outAmount = output ? scaled(output) : null
    return { unit, amount: inAmount, ...(outAmount !== null ? { outputAmount: outAmount } : {}) }
  }
  // Only the prices that count the same thing take part, and each figure is put in the app's unit before it is compared
  const same = entries.filter((e) => e.kind.unit === unit)
  const rules: PriceRule[] = []
  for (const e of same) {
    const amount = scaled(e)
    const when: Record<string, string | number | boolean> = {}
    for (const c of e.tier.criteria ?? []) {
      if ((c.type === "equals" || !c.type) && c.title && c.value !== undefined) {
        const k = ruleKey(c.title)
        const v = c.value
        if (k === "generate_audio" && (v === "true" || v === "false")) {
          when[k] = v === "true"
        } else {
          when[k] = v
        }
      }
    }
    if (amount !== null && Object.keys(when).length > 0) rules.push({ when, amount })
  }
  const amounts = same.map(scaled).filter((n): n is number => n !== null)
  return { unit, amount: Math.min(...amounts), rules: rules.length > 0 ? rules : undefined }
}

/**
 * Extracts the embedded `dereferenced_openapi_schema` or `openapi_schema` from a public Replicate model page
 * (`https://replicate.com/{owner}/{name}`) without needing an API token.
 */
export function parseReplicatePublicSchema(html: string): { openapi_schema: OpenApi; versionId?: string } | null {
  const rawSchema = jsonAfter(html, '"dereferenced_openapi_schema"') ?? jsonAfter(html, '"openapi_schema"')
  if (!rawSchema) return null
  try {
    const openapi_schema = JSON.parse(rawSchema) as OpenApi
    if (!openapi_schema?.components?.schemas) return null
    const versionMatch = /"version":\s*\{\s*"id":\s*"([0-9a-f]{32,64})"/i.exec(html) ?? /"latest_version":\s*\{\s*"id":\s*"([0-9a-f]{32,64})"/i.exec(html)
    return { openapi_schema, versionId: versionMatch?.[1] }
  } catch {
    return null
  }
}

export async function fetchReplicatePagePrice(endpoint: string, fetcher: (url: string, init?: RequestInit) => Promise<Response>): Promise<ReturnType<typeof parseReplicatePrice>> {
  try {
    const res = await fetcher(`https://replicate.com/${endpoint}`, { headers: { "User-Agent": "Mozilla/5.0" } })
    return res.ok ? parseReplicatePrice(await res.text()) : null
  } catch {
    return null
  }
}

/** Fetches both the exact billing tiers AND the OpenAPI parameter schema from a Replicate public model page in one request. */
export async function fetchReplicatePageDetails(
  endpoint: string,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ price: ReturnType<typeof parseReplicatePrice>; schema: ReturnType<typeof parseReplicatePublicSchema> }> {
  try {
    const res = await fetcher(`https://replicate.com/${endpoint}`, { headers: { "User-Agent": "Mozilla/5.0" } })
    if (!res.ok) return { price: null, schema: null }
    const html = await res.text()
    return {
      price: parseReplicatePrice(html),
      schema: parseReplicatePublicSchema(html),
    }
  } catch {
    return { price: null, schema: null }
  }
}

// Running a model

export interface ReplicateOutput {
  urls: string[]
  /** Language models: the pieces of text joined together */
  text: string
  raw: unknown
}

interface Prediction {
  id: string
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled"
  output?: unknown
  error?: string | null
  logs?: string | null
  urls?: { get?: string }
}

/** Runs a model and waits for it. Uses the version id, which works for official and community models alike. */
export async function runReplicate(opts: {
  call: ReplicateFetch
  token: string
  /** A pinned version, or none for an official model, which is run by its owner/name */
  version?: string
  model?: string
  input: Record<string, unknown>
  signal?: AbortSignal
  timeoutMs?: number
  onStatus?: (message: string) => void
}): Promise<ReplicateOutput> {
  const { call, version, model, input, signal, onStatus } = opts
  const headers = { Authorization: `Bearer ${opts.token.trim()}`, "Content-Type": "application/json", Prefer: "wait=30" }
  const start = () => call(version ? "/v1/predictions" : `/v1/models/${model}/predictions`, { method: "POST", headers, body: JSON.stringify(version ? { version, input } : { input }), signal })
  let create = await start()
  // An account with little credit is limited to a few runs a minute: Replicate says how long to wait, so wait and ask again
  for (let attempt = 0; attempt < 3 && create.status === 429; attempt++) {
    const body = await create.text().catch(() => "")
    const wait = Math.min(30, Number(/"retry_after"\s*:\s*(\d+)/.exec(body)?.[1] ?? create.headers.get("retry-after") ?? 8))
    onStatus?.(`Replicate is limiting this account, waiting ${wait}s`)
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000))
    create = await start()
  }
  if (!create.ok) throw new Error(`Replicate could not start the run (HTTP ${create.status}): ${(await create.text().catch(() => "")).slice(0, 240)}`)
  let prediction = (await create.json()) as Prediction
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000)
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (Date.now() > deadline) throw new Error("Replicate run timed out")
    onStatus?.(prediction.status === "starting" ? "Starting" : "Generating")
    await new Promise((r) => setTimeout(r, 2000))
    const poll = await call(prediction.urls?.get?.replace("https://api.replicate.com", "") ?? `/v1/predictions/${prediction.id}`, { headers: { Authorization: headers.Authorization }, signal })
    if (!poll.ok) throw new Error(`Replicate status check failed (HTTP ${poll.status})`)
    prediction = (await poll.json()) as Prediction
  }
  if (prediction.status !== "succeeded") throw new Error(`Replicate run ${prediction.status}${prediction.error ? `: ${prediction.error}` : ""}`)
  const out = prediction.output
  const pieces = (Array.isArray(out) ? out : [out]).filter((u): u is string => typeof u === "string")
  const urls = pieces.filter((u) => /^https?:/.test(u))
  let text = urls.length === pieces.length ? "" : pieces.join("")
  // Some language models answer with an object ({ text: ... }) instead of a list of pieces
  if (!text && out && typeof out === "object" && !Array.isArray(out)) {
    const o = out as Record<string, unknown>
    const found = [o.text, o.output, o.content, o.response, o.answer].find((v): v is string => typeof v === "string" && v.length > 0)
    if (found) text = found
  }
  return { urls, text, raw: prediction }
}

/** One model by owner/name, for a model the person adds on their own. Replicate does not say what kind of output a model makes, so the person says. */
export async function fetchReplicateRecord(call: ReplicateFetch, id: string, modality: RegistryModality): Promise<ModelRecord> {
  const path = `/v1/models/${id.trim().replace(/^\/+|\/+$/g, "")}`
  const res = await call(path)
  if (!res.ok) throw new Error(res.status === 404 ? `Replicate has no model called ${id.trim()}.` : `Replicate answered HTTP ${res.status}.`)
  const detail = (await res.json()) as ModelObject
  const task = modality === "image" ? "text-to-image" : modality === "video" ? "text-to-video" : modality === "audio" ? "text-to-audio" : "text"
  const record = recordFromReplicate(detail, { modality, task }, new Date().toISOString())
  if (!record) throw new Error("This model's settings could not be read.")
  return record
}

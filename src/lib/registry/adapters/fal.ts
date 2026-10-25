import type { ModelRecord, ParamProperty, ParamSchema, RegistryModality } from "../types"
import { applyParamPolicy, type PolicyResult } from "../param-policy"
import { summarize } from "../summary"
import { detectSlot } from "../slots"
import { detectSafety } from "../safety"
import { buildRequestSpec } from "../request"

interface OpenApiSchema {
  type?: string
  title?: string
  description?: string
  enum?: Array<string | number>
  default?: string | number | boolean
  minimum?: number
  maximum?: number
  properties?: Record<string, OpenApiSchema>
  required?: string[]
  anyOf?: OpenApiSchema[]
  oneOf?: OpenApiSchema[]
  items?: OpenApiSchema & { $ref?: string }
  maxItems?: number
}

export class NoSchemaError extends Error {}

export interface FalMeta {
  endpoint_id: string
  metadata: { display_name: string; category: string; description?: string; status?: string; highlighted?: boolean; pinned?: boolean; updated_at?: string }
  openapi?: { components?: { schemas?: Record<string, OpenApiSchema> }; error?: { message?: string } }
}

const CATEGORY_MODALITY: Record<string, RegistryModality> = {
  "text-to-image": "image",
  "image-to-image": "image",
  "text-to-video": "video",
  "image-to-video": "video",
  "video-to-video": "video",
  "text-to-audio": "audio",
  "text-to-speech": "audio",
  "audio-to-audio": "audio",
  "speech-to-speech": "audio",
  // Models that read speech, put sound to a video, or make a talking video from a voice
  "speech-to-text": "audio",
  "audio-to-text": "audio",
  "video-to-audio": "audio",
  "audio-to-video": "video",
}

const BASE = "https://api.fal.ai/v1/models"


function inferFormat(key: string): ParamProperty["format"] | undefined {
  if (/image_url/.test(key) || key === "image_urls") return "image"
  if (/video_url/.test(key)) return "video"
  if (/audio_url/.test(key)) return "audio"
  return undefined
}

function convertProp(key: string, s: OpenApiSchema, modality: RegistryModality): ParamProperty | null {
  const variant = s.anyOf?.find((v) => v.type && v.type !== "null") ?? s.oneOf?.find((v) => v.type && v.type !== "null") ?? s
  const type = variant.type
  // File fields: what each one is for, and how many files it takes, come from the provider's own schema
  if ((type === "string" && !variant.enum) || type === "array") {
    const slot = detectSlot(
      key,
      {
        type,
        items: variant.items ? { type: variant.items.type, isObject: Boolean(variant.items.$ref) || variant.items.type === "object" } : undefined,
        maxItems: variant.maxItems ?? s.maxItems,
        description: s.description ?? variant.description,
      },
      modality,
    )
    if (slot) return { type: "string", title: s.title ?? key, format: slot.kind, slot }
  }
  const format = inferFormat(key)
  if (format) return { type: "string", title: s.title ?? key, format }
  if (type === "string" || type === "number" || type === "integer" || type === "boolean") {
    return {
      type,
      title: s.title ?? variant.title ?? key,
      description: s.description ?? variant.description,
      enum: variant.enum,
      default: s.default ?? variant.default,
      minimum: variant.minimum,
      maximum: variant.maximum,
    }
  }
  return null
}

/** Converts fal's OpenAPI input into our schema, then keeps only the fields the policy allows. */
export function extractInput(meta: FalMeta, modality: RegistryModality = CATEGORY_MODALITY[meta.metadata.category] ?? "image"): PolicyResult {
  const schemas = meta.openapi?.components?.schemas ?? {}
  const inputKey = Object.keys(schemas).find((k) => /Input$/.test(k) && !/Queue/.test(k))
  const input = inputKey ? schemas[inputKey] : undefined
  const properties: Record<string, ParamProperty> = {}
  for (const [key, raw] of Object.entries(input?.properties ?? {})) {
    const p = convertProp(key, raw, modality)
    if (p) properties[key] = p
  }
  const policy = applyParamPolicy({ type: "object", properties, required: input?.required?.filter((r) => r in properties) })
  // The safety checker is not a creative control, so it is not shown, but its field name is kept for the runner
  const raw = Object.fromEntries(
    Object.entries(input?.properties ?? {}).map(([k, v]) => {
      const variant = v.anyOf?.find((x) => x.type && x.type !== "null") ?? v.oneOf?.find((x) => x.type && x.type !== "null") ?? v
      return [k, { type: variant.type, enum: variant.enum }]
    }),
  )
  const safety = detectSafety(raw)
  // How to build a complete request: the prompt field, and a default for every other required field
  const fields = Object.fromEntries(
    Object.entries(input?.properties ?? {}).map(([k, v]) => {
      const variant = v.anyOf?.find((x) => x.type && x.type !== "null") ?? v.oneOf?.find((x) => x.type && x.type !== "null") ?? v
      return [k, { type: variant.type, default: v.default ?? variant.default, enum: variant.enum, file: Boolean(properties[k]?.format) }]
    }),
  )
  const request = buildRequestSpec(fields, input?.required ?? [], new Set(Object.keys(properties)))
  return { ...policy, params: { ...policy.params, ...(safety ? { safety } : {}), request } }
}

export function extractInputSchema(meta: FalMeta): ParamSchema {
  return extractInput(meta).params
}

/** Puts a fetched schema on a record and derives the facts the picker row shows. */
export function attachSchema(rec: ModelRecord, params: ParamSchema): ModelRecord {
  const hasImage = Object.values(params.properties).some((p) => p.format === "image")
  return {
    ...rec,
    params,
    inputs: hasImage && !rec.inputs.includes("image") ? [...rec.inputs, "image"] : rec.inputs,
    summary: summarize(rec.modality, params, rec.description),
  }
}

export function mapFalModel(meta: FalMeta, fetchedAt: string): ModelRecord | null {
  const modality = CATEGORY_MODALITY[meta.metadata.category]
  if (!modality || meta.metadata.status === "deprecated") return null
  const params = extractInputSchema(meta)
  const hasImage = Object.values(params.properties).some((p) => p.format === "image") || /^image-to|^video-to/.test(meta.metadata.category)
  return {
    id: `fal/${meta.endpoint_id}`,
    endpoint: meta.endpoint_id,
    provider: "fal",
    name: meta.metadata.display_name,
    family: meta.endpoint_id.split("/")[1] ?? meta.metadata.display_name,
    logoKey: meta.endpoint_id.split("/")[0] ?? "fal",
    modality,
    inputs: hasImage ? ["text", "image"] : ["text"],
    params,
    // fal pricing needs an authenticated call; fetchFalPricing fills it once a key exists.
    price: { unit: "unknown", amount: null, source: "estimate", fetchedAt },
    status: meta.metadata.status === "active" ? "active" : "preview",
    description: meta.metadata.description,
    featured: Boolean(meta.metadata.highlighted || meta.metadata.pinned),
    task: meta.metadata.category === "speech-to-speech" ? "audio-to-audio" : meta.metadata.category,
    updatedAt: meta.metadata.updated_at,
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Anonymous callers get roughly one request per 3 to 5 seconds; a key lifts that. */
const MIN_GAP_ANON_MS = 3600
const MIN_GAP_KEYED_MS = 250
let lastCallAt = 0

async function pace(keyed: boolean): Promise<void> {
  const gap = keyed ? MIN_GAP_KEYED_MS : MIN_GAP_ANON_MS
  const delay = lastCallAt + gap - Date.now()
  lastCallAt = Math.max(Date.now(), lastCallAt + gap)
  if (delay > 0) await wait(delay)
}

async function getJson<T>(url: string, apiKey: string | undefined, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = apiKey ? { Authorization: `Key ${apiKey.trim()}` } : {}
  let keyRejected = false
  for (let attempt = 0; ; attempt++) {
    await pace(Boolean(apiKey))
    const res = await fetch(url, { headers: keyRejected ? {} : headers, signal })
    if (res.ok) return (await res.json()) as T
    // Catalog and schema reads are public. A rejected key must not break them, so retry anonymously.
    if ((res.status === 401 || res.status === 403) && apiKey && !keyRejected) {
      keyRejected = true
      continue
    }
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after"))
      await wait((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 4 + attempt * 3) * 1000)
      continue
    }
    throw new Error(`HTTP ${res.status}`)
  }
}

export interface FalFetchResult {
  records: ModelRecord[]
  failedCategories: string[]
}

/** The categories this reader knows, so the build can tell when fal lists one it does not */
export const FAL_KNOWN_CATEGORIES = Object.keys(CATEGORY_MODALITY)

/** How many active models fal lists in each category, read from the whole list with no category filter. */
export async function fetchFalCategoryCounts(opts: { apiKey?: string; signal?: AbortSignal } = {}): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  let cursor: string | null = null
  for (let page = 0; page < 60; page++) {
    const json: { models: FalMeta[]; has_more?: boolean; next_cursor?: string } = await getJson(`${BASE}?status=active&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, opts.apiKey, opts.signal)
    for (const m of json.models) {
      const c = m.metadata?.category ?? "none"
      counts[c] = (counts[c] ?? 0) + 1
    }
    if (!json.has_more || !json.next_cursor) break
    cursor = json.next_cursor
  }
  return counts
}

/** Lists fal models per category. A failing category is reported but never discards the others. */
export async function fetchFalModels(
  opts: { categories?: string[]; pageSize?: number; maxPages?: number; apiKey?: string; signal?: AbortSignal } = {},
): Promise<FalFetchResult> {
  const fetchedAt = new Date().toISOString()
  const categories = opts.categories ?? Object.keys(CATEGORY_MODALITY)
  const pageSize = opts.pageSize ?? 100
  const maxPages = opts.maxPages ?? 3
  const records: ModelRecord[] = []
  const failedCategories: string[] = []
  for (const category of categories) {
    let cursor: string | null = null
    try {
      for (let page = 0; page < maxPages; page++) {
        const url: string = `${BASE}?category=${category}&status=active&limit=${pageSize}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
        const json = await getJson<{ models: FalMeta[]; has_more?: boolean; next_cursor?: string }>(url, opts.apiKey, opts.signal)
        for (const m of json.models) {
          const rec = mapFalModel(m, fetchedAt)
          if (rec) records.push(rec)
        }
        if (!json.has_more || !json.next_cursor) break
        cursor = json.next_cursor
      }
    } catch {
      failedCategories.push(category)
    }
  }
  if (records.length === 0 && failedCategories.length > 0) throw new Error(`fal catalog unavailable (${failedCategories.length} categories failed)`)
  return { records, failedCategories }
}

/** The list endpoint carries no parameters; the schema is fetched once, when a model is first selected. */
export async function fetchFalSchema(endpointId: string, apiKey?: string, signal?: AbortSignal): Promise<ParamSchema> {
  const json = await getJson<{ models: FalMeta[] }>(`${BASE}?endpoint_id=${encodeURIComponent(endpointId)}&expand=openapi-3.0`, apiKey, signal)
  const meta = json.models[0]
  if (!meta) throw new Error(`fal schema (${endpointId}): not found`)
  if (meta.openapi?.error || !meta.openapi?.components) throw new NoSchemaError(meta.openapi?.error?.message ?? "No schema published")
  return extractInputSchema(meta)
}

export interface BatchSchemaResult {
  params?: ParamSchema
  unknown: string[]
  /** The provider publishes no schema for this endpoint */
  none?: boolean
}

/**
 * Up to ten schemas per request. Endpoints without a published schema come back flagged, not as errors.
 * A batch that keeps failing is skipped and reported, and every finished batch is handed to `onBatch`
 * immediately so a long run never loses completed work.
 */
export async function fetchFalSchemas(
  endpointIds: string[],
  opts: {
    apiKey?: string
    signal?: AbortSignal
    onBatch?: (results: Map<string, BatchSchemaResult>) => void
  } = {},
): Promise<{ results: Map<string, BatchSchemaResult>; failed: string[] }> {
  const results = new Map<string, BatchSchemaResult>()
  const failed: string[] = []
  for (let i = 0; i < endpointIds.length; i += 10) {
    const chunk = endpointIds.slice(i, i + 10)
    const qs = chunk.map((id) => `endpoint_id=${encodeURIComponent(id)}`).join("&")
    let json: { models: FalMeta[] } | null = null
    for (let attempt = 0; attempt < 3 && !json; attempt++) {
      try {
        json = await getJson<{ models: FalMeta[] }>(`${BASE}?${qs}&expand=openapi-3.0`, opts.apiKey, opts.signal)
      } catch {
        await wait(2000 * (attempt + 1))
      }
    }
    // One bad model can fail a whole group of ten, so a failed group is asked for one model at a time
    const metas: FalMeta[] = json ? json.models : []
    if (!json) {
      for (const id of chunk) {
        try {
          const one = await getJson<{ models: FalMeta[] }>(`${BASE}?endpoint_id=${encodeURIComponent(id)}&expand=openapi-3.0`, opts.apiKey, opts.signal)
          metas.push(...one.models)
        } catch {
          failed.push(id)
        }
        await wait(1500)
      }
    }
    const batch = new Map<string, BatchSchemaResult>()
    for (const meta of metas) {
      if (meta.openapi?.error || !meta.openapi?.components) batch.set(meta.endpoint_id, { none: true, unknown: [] })
      else {
        const { params, unknown } = extractInput(meta)
        batch.set(meta.endpoint_id, { params, unknown })
      }
    }
    for (const [k, v] of batch) results.set(k, v)
    opts.onBatch?.(batch)
  }
  return { results, failed }
}

/** Authenticated: overlays real per-unit prices onto fal records. */
export async function fetchFalPricing(
  records: ModelRecord[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelRecord[]> {
  const fetchedAt = new Date().toISOString()
  const ids = records.filter((r) => r.provider === "fal").map((r) => r.endpoint)
  const prices = new Map<string, { unit: string; amount: number }>()
  for (let i = 0; i < ids.length; i += 50) {
    const qs = ids
      .slice(i, i + 50)
      .map((id) => `endpoint_id=${encodeURIComponent(id)}`)
      .join("&")
    const res = await fetch(`${BASE}/pricing?${qs}`, { headers: { Authorization: `Key ${apiKey}` }, signal })
    if (!res.ok) throw new Error(`fal pricing: HTTP ${res.status}`)
    const json = (await res.json()) as { prices?: Array<{ endpoint_id: string; unit_price: number; unit: string }> }
    for (const p of json.prices ?? []) prices.set(p.endpoint_id, { unit: p.unit, amount: p.unit_price })
  }
  return records.map((r) => {
    const p = prices.get(r.endpoint)
    if (!p) return r
    const unit = /image/.test(p.unit) ? "per_image" : /second/.test(p.unit) ? "per_second" : /megapixel/.test(p.unit) ? "per_megapixel" : "per_run"
    return { ...r, price: { unit, amount: p.amount, source: "api" as const, fetchedAt } }
  })
}

/** One endpoint, read on its own: for a model the person adds by its id. */
export async function fetchFalRecord(endpointId: string, apiKey?: string, signal?: AbortSignal): Promise<ModelRecord> {
  const json = await getJson<{ models: FalMeta[] }>(`${BASE}?endpoint_id=${encodeURIComponent(endpointId)}&expand=openapi-3.0`, apiKey, signal)
  const meta = json.models[0]
  if (!meta) throw new Error(`fal has no model called ${endpointId}.`)
  const record = mapFalModel(meta, new Date().toISOString())
  if (!record) throw new Error(`${endpointId} is a ${meta.metadata.category} model, a kind this app does not run.`)
  return record
}

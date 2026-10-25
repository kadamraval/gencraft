import type { Category, CatalogSource, Fact, PriceValue } from "../types"

/**
 * fal's own catalog: `GET /v1/models` gives every endpoint with its category, tags, status and update date, with no key. Prices come from
 * `GET /v1/models/pricing`, which needs a key. One caution learned from the real data: fal's category is not exact. A reference-to-video
 * endpoint is filed as image-to-video or video-to-video, and `rife` (video interpolation) is filed as image-to-image. So the category here is
 * a statement to check against the maker list, never the answer.
 */

export const FAL_API = "https://api.fal.ai/v1"

export interface FalModel {
  endpoint_id: string
  metadata?: { display_name?: string; category?: string; status?: string; tags?: string[]; updated_at?: string; date?: string }
}

export interface FalPrice {
  endpoint_id: string
  unit_price: number
  unit: string
  currency: string
}

const CATEGORIES = new Set<string>(["text-to-image", "image-to-image", "text-to-video", "image-to-video", "video-to-video", "text-to-speech", "text-to-audio", "speech-to-text", "audio-to-audio", "video-to-audio", "audio-to-video"])

export function parseFalModels(models: FalModel[], only?: Set<string>): Fact[] {
  const facts: Fact[] = []
  const seen = new Set<string>()
  for (const m of models) {
    if (only && !only.has(m.endpoint_id)) continue
    // fal lists a few endpoints twice
    if (seen.has(m.endpoint_id)) continue
    seen.add(m.endpoint_id)
    const base = { host: "fal", endpoint: m.endpoint_id, source: "fal", confidence: "provider" as const }
    const md = m.metadata ?? {}
    if (md.category && CATEGORIES.has(md.category)) facts.push({ ...base, field: "category", value: md.category as Category })
    if (md.status === "active" || md.status === "deprecated") facts.push({ ...base, field: "status", value: md.status })
    if (md.display_name) facts.push({ ...base, field: "name", value: md.display_name })
    if (md.date) facts.push({ ...base, field: "date", value: md.date })
  }
  return facts
}

const UNIT: Record<string, PriceValue["unit"]> = { image: "per_image", video: "per_video", second: "per_second", seconds: "per_second", megapixel: "per_megapixel", megapixels: "per_megapixel", run: "per_run" }

export function parseFalPrices(prices: FalPrice[]): Fact[] {
  return prices
    .filter((p) => p.currency === "USD" && typeof p.unit_price === "number")
    .map((p) => ({
      host: "fal",
      endpoint: p.endpoint_id,
      field: "price" as const,
      value: { amount: p.unit_price, unit: UNIT[p.unit] ?? "other", currency: "USD" as const, note: UNIT[p.unit] ? undefined : `fal unit: ${p.unit}` } satisfies PriceValue,
      source: "fal",
      confidence: "provider" as const,
    }))
}

type GetJson = (url: string, init?: { headers?: Record<string, string> }) => Promise<unknown>

/** Reads every active endpoint (100 a page, followed by cursor), then the prices of the wanted ones when a key is given */
export function falSource(getJson: GetJson, opts: { only?: Set<string>; apiKey?: string } = {}): CatalogSource {
  return {
    id: "fal",
    fetch: async () => {
      const models: FalModel[] = []
      let cursor: string | null = null
      do {
        const page = (await getJson(`${FAL_API}/models?limit=100&status=active${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)) as { models: FalModel[]; next_cursor: string | null; has_more: boolean }
        models.push(...page.models)
        cursor = page.has_more ? page.next_cursor : null
      } while (cursor)
      const facts = parseFalModels(models, opts.only)
      if (opts.apiKey && opts.only) {
        const ids = [...opts.only]
        for (let i = 0; i < ids.length; i += 50) {
          const q = ids.slice(i, i + 50).map((id) => `endpoint_id=${encodeURIComponent(id)}`).join("&")
          const res = (await getJson(`${FAL_API}/models/pricing?${q}`, { headers: { Authorization: `Key ${opts.apiKey}` } })) as { prices: FalPrice[] }
          facts.push(...parseFalPrices(res.prices))
        }
      }
      return facts
    },
  }
}

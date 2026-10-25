import type { CatalogSource, Fact, PriceValue } from "../types"

/**
 * fal publishes each model's price as a sentence on its public model page ("Your request will cost $0.025 per megapixel"). Reading it needs
 * no key. It is a scraped source, so it ranks below fal's own price API and is also used to cross-check LiteLLM: when the two disagree the
 * sheet keeps both and says so. The sentence reader is the app's own (`registry/adapters/fal-price.ts`); this module only converts its result.
 */

export interface PageRule {
  when: Record<string, string | number | boolean>
  amount: number
}

export interface PagePrice {
  unit: string
  amount: number
  rules?: PageRule[]
}

const UNIT: Record<string, PriceValue["unit"]> = {
  per_second: "per_second",
  per_image: "per_image",
  per_megapixel: "per_megapixel",
  per_1k_chars: "per_thousand_characters",
  per_run: "per_run",
}

/** "480p $0.05, 720p $0.1" or "audio off $0.2, audio on $0.4" */
function noteOf(rules: PageRule[] | undefined): string | undefined {
  if (!rules?.length) return undefined
  return rules
    .map((r) => {
      const what = Object.entries(r.when)
        .map(([k, v]) => (k === "resolution" ? String(v) : k === "generate_audio" ? (v ? "audio on" : "audio off") : `${k} ${String(v)}`))
        .join(" ")
      return `${what} $${r.amount}`
    })
    .join(", ")
}

export function pagePriceFact(endpoint: string, p: PagePrice): Fact | undefined {
  const unit = UNIT[p.unit]
  if (!unit) return undefined
  return {
    host: "fal",
    endpoint,
    field: "price",
    value: { amount: p.amount, unit, currency: "USD", note: noteOf(p.rules) } satisfies PriceValue,
    source: "fal-page",
    confidence: "scraped",
  }
}

export function falPageSource(read: (endpoint: string) => Promise<PagePrice | null>, endpoints: string[]): CatalogSource {
  return {
    id: "fal-page",
    fetch: async () => {
      const facts: Fact[] = []
      let next = 0
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (next < endpoints.length) {
            const endpoint = endpoints[next++]!
            const p = await read(endpoint)
            const fact = p ? pagePriceFact(endpoint, p) : undefined
            if (fact) facts.push(fact)
          }
        }),
      )
      return facts
    },
  }
}

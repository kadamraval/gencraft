import { jobOf } from "./jobs"
import type { Category, Fact, FieldName, Listing, MakerList, Precedence, PriceValue, SheetModel, Sourced } from "./types"

/**
 * Builds the sheet from the maker list and the facts of the sources. The maker list is declared by a person: it says what each model is
 * (category, job) and which endpoints are it. The sources do not decide that; they confirm it or contradict it, and a contradiction is kept
 * on the record as a conflict. Price, status and dates come from the sources, in the order the config gives.
 */

/** What a host may call a category when the maker list says another: fal files reference-to-video under image-to-video or video-to-video */
const ACCEPTED: Partial<Record<Category, Category[]>> = {
  "reference-to-video": ["reference-to-video", "image-to-video", "video-to-video"],
  "audio-to-video": ["audio-to-video", "image-to-video", "video-to-video"],
}

const accepts = (declared: Category, said: Category): boolean => (ACCEPTED[declared] ?? [declared]).includes(said)

const keyOf = (host: string, endpoint: string) => `${host}|${endpoint}`

function bySource(facts: Fact[]): Map<string, Fact[]> {
  const index = new Map<string, Fact[]>()
  for (const f of facts) {
    const k = keyOf(f.host, f.endpoint)
    index.set(k, [...(index.get(k) ?? []), f])
  }
  return index
}

/** The first source in the order that has a value for the field */
function pick<T>(facts: Fact[], field: FieldName, order: string[]): Sourced<T> {
  for (const source of order) {
    const f = facts.find((x) => x.field === field && x.source === source)
    if (f) return { value: f.value as T, source: f.source, confidence: f.confidence }
  }
  return {}
}

/**
 * The winning price by the configured order, with every other source that states the same unit and differs by more than 10 percent kept as a
 * conflict. Two sources that agree are a confirmation; two that disagree are a question for a person.
 */
function pickPrice(facts: Fact[], order: string[]): Sourced<PriceValue> {
  const won = pick<PriceValue>(facts, "price", order)
  if (!won.value) return won
  const conflicts: Array<{ source: string; value: PriceValue }> = []
  for (const f of facts) {
    if (f.field !== "price" || f.source === won.source) continue
    const other = f.value as PriceValue
    if (other.unit === won.value.unit && Math.abs(other.amount - won.value.amount) > 0.1 * Math.max(other.amount, won.value.amount)) conflicts.push({ source: f.source, value: other })
  }
  return conflicts.length ? { ...won, conflicts } : won
}

export function buildSheet(list: MakerList, facts: Fact[], precedence: Precedence): SheetModel[] {
  const index = bySource(facts)
  const viaIndex = new Map<string, Fact[]>()
  for (const f of facts) if (f.via) viaIndex.set(f.via, [...(viaIndex.get(f.via) ?? []), f])

  const models: SheetModel[] = []
  for (const maker of list.makers) {
    for (const m of maker.models) {
      // Every endpoint the maker list names, on each host, plus the host and endpoint of each LiteLLM key it names
      const places = new Map<string, { host: string; endpoint: string }>()
      for (const [host, endpoints] of Object.entries(m.hosts)) for (const endpoint of endpoints) places.set(keyOf(host, endpoint), { host, endpoint })
      for (const key of m.litellm) {
        const f = viaIndex.get(key)?.[0]
        if (f) places.set(keyOf(f.host, f.endpoint), { host: f.host, endpoint: f.endpoint })
      }
      const listings: Listing[] = []
      for (const { host, endpoint } of places.values()) {
        const own = index.get(keyOf(host, endpoint)) ?? []
        // Facts that arrived through a LiteLLM key of this model belong here too
        const viaKeys = m.litellm.flatMap((k) => viaIndex.get(k) ?? []).filter((f) => f.host === host && f.endpoint === endpoint)
        const here = [...own, ...viaKeys.filter((f) => !own.includes(f))]

        // Category: declared; what the sources said is a check
        const said = here.filter((f) => f.field === "category")
        const conflicts = said.filter((f) => !accepts(m.category, f.value as Category)).map((f) => ({ source: f.source, value: f.value as Category }))
        const category: Sourced<Category> = { value: m.category, source: "maker-list", confidence: "maker", ...(conflicts.length ? { conflicts } : {}) }

        // Job: declared; the host's own endpoint name is the check
        const derived = host === "fal" ? jobOf(endpoint, m.category) : undefined
        const job: Sourced<typeof m.job> = {
          value: m.job,
          source: "maker-list",
          confidence: "maker",
          ...(derived && derived.job !== "other" && derived.job !== m.job ? { conflicts: [{ source: `endpoint name "${derived.by || endpoint}"`, value: derived.job }] } : {}),
        }

        const nameFact = pick<string>(here, "name", precedence.name)
        listings.push({
          host,
          endpoint,
          name: nameFact.value,
          seenBy: [...new Set(here.map((f) => f.source))],
          category,
          job,
          price: pickPrice(here, precedence.price),
          status: pick(here, "status", precedence.status),
        })
      }
      models.push({ id: m.id, maker: maker.name, name: m.name, type: m.type, category: m.category, job: m.job, listings })
    }
  }
  return models
}

/**
 * Builds the bundled model registry from live provider catalogs and official pages.
 *
 *   npm run registry:build
 *   FAL_KEY=... npm run registry:build      (optional: faster, and fal's pricing API fills gaps)
 *   REPLICATE_API_TOKEN=... npm run registry:build   (optional: Replicate is read from its API; without a token its public pages are read instead)
 *
 * What it does, in order:
 *   1. Lists models from fal and OpenRouter.
 *   2. Works out which are current (newer versions retire older ones; retired models are dropped).
 *   3. Fetches parameter schemas for the current models, keeps only the fields the parameter policy allows.
 *   4. Reads each fal model's price from its official page.
 *   5. Writes the snapshot the app ships with, plus a review report of anything new it could not classify.
 *
 * Results are cached per model and update date, so a weekly re-run only touches what changed.
 * A step that fails keeps the previous data: the build never replaces good data with less.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fetchFalModels, fetchFalSchemas, attachSchema } from "../src/lib/registry/adapters/fal.ts"
import { fetchFalPagePrice } from "../src/lib/registry/adapters/fal-price.ts"
import { fetchReplicateModels, fetchReplicatePagePrice } from "../src/lib/registry/adapters/replicate.ts"
import type { ReplicateFetch } from "../src/lib/registry/adapters/replicate.ts"
import { publicReplicateCall } from "./lib/replicate-public.mts"
import { fetchOpenRouterModels } from "../src/lib/registry/adapters/openrouter.ts"
import { fetchOpenAIRecords } from "../src/lib/registry/adapters/openai-docs.ts"
import { fetchGeminiRecords } from "../src/lib/registry/adapters/gemini-docs.ts"
import { applyLifecycle, isListed } from "../src/lib/registry/lifecycle.ts"
import { selectWatched } from "../src/lib/registry/watchlist.ts"
import { computeDefaultEnabled } from "../src/lib/registry/enabled.ts"
import { summarize } from "../src/lib/registry/summary.ts"
import type { ModelRecord, ParamSchema, RegistrySnapshot } from "../src/lib/registry/types.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, "../src/lib/registry/registry.snapshot.json")
const cacheDir = path.resolve(here, ".cache")
const cacheFile = path.join(cacheDir, "registry-cache.json")
const reportFile = path.resolve(here, "registry-report.txt")
const falKey = process.env.FAL_KEY

interface Cache {
  schemas: Record<string, { stamp: string; params?: ParamSchema; none?: boolean; unknown: string[] }>
  prices: Record<string, { stamp: string; price: ModelRecord["price"] | null; pv?: number }>
}

const cache: Cache = fs.existsSync(cacheFile) ? (JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Cache) : { schemas: {}, prices: {} }
const save = () => {
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify(cache))
}

const stampOf = (r: ModelRecord) => `${r.updatedAt ?? "none"}|slots2`
/** Schemas carry more than prices do (reference slots, safety field), so they are re-read on their own when that changes */
const schemaStampOf = (r: ModelRecord) => `${r.updatedAt ?? "none"}|slots4|policy3`
/** Bump when the price parser learns a new phrasing: pages it could not read before are tried again. */
const PARSER_VERSION = 2
const started = Date.now()
const log = (msg: string) => console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${msg}`)

async function pool<T>(items: T[], size: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++
        await worker(items[i]!, i)
      }
    }),
  )
}

// 1. catalogs
log("OpenRouter catalog")
const openrouter = await fetchOpenRouterModels()
log(`  ${openrouter.length} models`)

log("OpenAI official docs")
const fetchText = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}
let openai: ModelRecord[] = []
try {
  const built = await fetchOpenAIRecords(fetchText)
  openai = built.records
  log(`  ${openai.length} models (${built.skipped.length} not for generation)`)
} catch (e) {
  log(`  OpenAI docs unavailable (${e instanceof Error ? e.message : String(e)}); keeping previous OpenAI entries`)
  if (fs.existsSync(out)) openai = (JSON.parse(fs.readFileSync(out, "utf8")) as RegistrySnapshot).models.filter((r) => r.provider === "openai")
}

log("Google Gemini official docs")
let gemini: ModelRecord[] = []
try {
  const built = await fetchGeminiRecords(fetchText)
  gemini = built.records
  log(`  ${gemini.length} models (${built.skipped.length} not for generation)`)
} catch (e) {
  log(`  Gemini docs unavailable (${e instanceof Error ? e.message : String(e)}); keeping previous Gemini entries`)
  if (fs.existsSync(out)) gemini = (JSON.parse(fs.readFileSync(out, "utf8")) as RegistrySnapshot).models.filter((r) => r.provider === "gemini")
}

log("Replicate catalog")
let replicate: ModelRecord[] = []
const previousReplicate = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")) as RegistrySnapshot).models.filter((r) => r.provider === "replicate") : []
{
  try {
    // With a token the API is used; without one the same facts are read from replicate.com's public pages
    const token = process.env.REPLICATE_API_TOKEN?.trim()
    const call: ReplicateFetch = token
      ? (p, init = {}) => fetch(`https://api.replicate.com${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...((init.headers as Record<string, string> | undefined) ?? {}) } })
      : publicReplicateCall()
    if (!token) log("  no REPLICATE_API_TOKEN: reading the public pages")
    const got = await fetchReplicateModels(call, { limit: 400, known: new Map(previousReplicate.map((r) => [r.id, r])), onProgress: (d, t) => d % 50 === 0 && log(`  Replicate ${d}/${t}`) })
    replicate = got.records
    // Prices come from each model page; models that already have one keep it
    await pool(replicate.filter((r) => r.price.amount === null), 4, async (r) => {
      const p = await fetchReplicatePagePrice(r.endpoint, (url, init) => fetch(url, init))
      if (p) replicate = replicate.map((x) => (x.id === r.id ? { ...x, price: { unit: p.unit, amount: p.amount, outputAmount: p.outputAmount, rules: p.rules, source: "scraped" as const, fetchedAt: new Date().toISOString() } } : x))
    })
    log(`  ${replicate.length} models (${got.failed} not read)`)
  } catch (e) {
    log(`  Replicate unavailable (${e instanceof Error ? e.message : String(e)}); keeping previous Replicate entries`)
    replicate = previousReplicate
  }
}

log(`fal catalog${falKey ? " (keyed)" : " (anonymous, paced)"}`)
const fal = await fetchFalModels({ apiKey: falKey })
log(`  ${fal.records.length} models${fal.failedCategories.length ? `, failed: ${fal.failedCategories.join(", ")}` : ""}`)

// A category that hit a rate limit must not erase what the previous build knew about it
let falRecords = fal.records
if (fal.failedCategories.length > 0 && fs.existsSync(out)) {
  const previous = JSON.parse(fs.readFileSync(out, "utf8")) as RegistrySnapshot
  const have = new Set(falRecords.map((r) => r.id))
  const kept = previous.models.filter((r) => r.provider === "fal" && !have.has(r.id) && fal.failedCategories.includes(r.task ?? ""))
  falRecords = [...falRecords, ...kept]
  log(`  kept ${kept.length} previous fal models for failed categories`)
}

// 2. lifecycle
let records = applyLifecycle([...falRecords, ...openrouter, ...openai, ...gemini, ...replicate])
const allCurrent = records.filter((r) => isListed(r))
// Only the watch-list ships: the newest models of the makers and product lines in src/lib/registry/watchlist.ts
const watched = selectWatched(allCurrent)
const previousSnapshot = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")) as RegistrySnapshot) : null
const previousById = new Map((previousSnapshot?.models ?? []).map((r) => [r.id, r]))
records = watched.kept
const current = records
log(`watch-list: ${allCurrent.length} current models, ${current.length} kept, ${watched.unmatched.length} on no line`)
log(`lifecycle: ${current.length} current, ${records.filter((r) => r.supersededBy).length} superseded, ${records.filter((r) => r.status === "deprecated").length} retired`)

// 3. schemas for current fal models
const falCurrent = current.filter((r) => r.provider === "fal")
// Models the chat picker offers by default come first; the long tail is fetched only with REGISTRY_FULL=1
// (the app fetches a model's schema itself the first time it is chosen)
const priority = new Set(computeDefaultEnabled(current))
const stale = falCurrent.filter((r) => cache.schemas[r.id]?.stamp !== schemaStampOf(r))
const needSchema = (process.env.REGISTRY_FULL ? stale : stale.filter((r) => priority.has(r.id))).sort(
  (a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)),
)
log(`schemas: ${falCurrent.length - stale.length} cached, ${priority.size} default models, fetching ${needSchema.length}${process.env.REGISTRY_FULL ? " (full)" : ""}`)
const byId = new Map(needSchema.map((r) => [r.endpoint, r]))
const { failed: schemaFailed } = await fetchFalSchemas(needSchema.map((r) => r.endpoint), {
  apiKey: falKey,
  onBatch: (batch) => {
    for (const [endpoint, res] of batch) {
      const r = byId.get(endpoint)
      if (r) cache.schemas[r.id] = { stamp: schemaStampOf(r), params: res.params, none: res.none, unknown: res.unknown }
    }
    save()
  },
})
if (schemaFailed.length) log(`  ${schemaFailed.length} schemas could not be fetched this run; a re-run picks them up`)

// 4. prices from official pages
const needPrice = falCurrent.filter((r) => {
  const c = cache.prices[r.id]
  return !c || c.stamp !== stampOf(r) || (c.price === null && c.pv !== PARSER_VERSION)
})
log(`prices: ${falCurrent.length - needPrice.length} cached, fetching ${needPrice.length}`)
let priced = 0
await pool(needPrice, 5, async (r, i) => {
  const parsed = await fetchFalPagePrice(r.endpoint)
  cache.prices[r.id] = {
    stamp: stampOf(r),
    pv: PARSER_VERSION,
    price: parsed ? { unit: parsed.unit, amount: parsed.amount, rules: parsed.rules, source: "scraped", fetchedAt: new Date().toISOString() } : null,
  }
  if (parsed) priced++
  if ((i + 1) % 100 === 0) {
    log(`  ${i + 1}/${needPrice.length} pages read`)
    save()
  }
})
save()

// 5. assemble
const unknownCount = new Map<string, number>()
let withSchema = 0
let withPrice = 0
records = records.map((r) => {
  let rec = r
  if (r.provider === "fal" && isListed(r)) {
    const sc = cache.schemas[r.id]
    if (sc?.params) {
      rec = attachSchema(rec, sc.params)
      withSchema++
      for (const k of sc.unknown) unknownCount.set(k, (unknownCount.get(k) ?? 0) + 1)
    } else {
      rec = { ...rec, summary: summarize(rec.modality, rec.params, rec.description) }
    }
    const pr = cache.prices[r.id]?.price
    if (pr) {
      rec = { ...rec, price: pr }
      withPrice++
    }
  }
  // A model the previous build did not have is new; one it had keeps its first date
  const was = previousById.get(r.id)
  const addedAt = was ? was.addedAt : previousSnapshot ? new Date().toISOString() : undefined
  return { ...rec, ...(addedAt ? { addedAt } : {}), description: rec.description?.slice(0, 220) }
})

const snapshot: RegistrySnapshot = { version: "2", builtAt: new Date().toISOString(), models: records }
fs.writeFileSync(out, JSON.stringify(snapshot))

const noSchema = falCurrent.filter((r) => cache.schemas[r.id]?.none).length
const lines = [
  `Registry build ${snapshot.builtAt}`,
  `models: ${records.length} (current ${current.length}, superseded ${records.filter((r) => r.supersededBy).length}, retired ${records.filter((r) => r.status === "deprecated").length})`,
  `fal current: ${falCurrent.length}, with schema ${withSchema}, no published schema ${noSchema}, priced ${withPrice}, price unreadable ${falCurrent.length - withPrice}`,
  "",
  `watch-list: ${current.length} models kept. New since the last build: ${records.filter((r) => r.addedAt && !previousById.has(r.id)).length}`,
  "Not on any line (add a line in src/lib/registry/watchlist.ts if a maker matters), by maker:",
  ...Object.entries(watched.unmatched.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.maker ?? r.provider]: (acc[r.maker ?? r.provider] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k, v]) => `  ${String(v).padStart(4)}  ${k}`),
  "",
  "Fields never classified (decide: common, unique, advanced, or noise in src/lib/registry/param-policy.ts):",
  ...[...unknownCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `  ${String(v).padStart(4)}  ${k}`),
]
fs.writeFileSync(reportFile, lines.join("\n"))
log(`wrote ${records.length} models to ${path.relative(process.cwd(), out)}`)
log(`report: ${path.relative(process.cwd(), reportFile)}`)
void priced

/**
 * Builds the standard model database (src/lib/knowledge/pack.json) and its reports.
 *
 *   npm run knowledge:build              uses saved reads in scripts/.cache that are under a day old
 *   npm run knowledge:build -- --refresh reads every source again
 *   npm run knowledge:build -- --offline uses the saved reads whatever their age and fetches nothing
 *
 * Sources, in the order a fact is taken: the provider lists (fal's catalog, OpenAI and Gemini's docs, OpenRouter's API, Replicate's public
 * pages; nothing is a hand-kept list of models), the LiteLLM file pinned to one commit, the page readers for prices a list lacks. The gate (validatePack) must pass
 * before the pack is written; a line that fails is left out and named in docs/knowledge-gaps.md.
 */
import { execFileSync } from "node:child_process"
import { addMakerAbilities } from "../src/lib/knowledge/litellm-abilities.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { FAL_KNOWN_CATEGORIES, attachSchema, fetchFalCategoryCounts, fetchFalModels, fetchFalPricing, fetchFalSchemas } from "../src/lib/registry/adapters/fal.ts"
import { fetchFalPagePrice } from "../src/lib/registry/adapters/fal-price.ts"
import { fetchOpenRouterEmbeddings, fetchOpenRouterModels, lastOpenRouterRead } from "../src/lib/registry/adapters/openrouter.ts"
import { fetchGeminiRecords } from "../src/lib/registry/adapters/gemini-docs.ts"
import { fetchOpenAIRecords } from "../src/lib/registry/adapters/openai-docs.ts"
import { TOOL_NAME, fetchReplicateModels, fetchReplicatePagePrice } from "../src/lib/registry/adapters/replicate.ts"
import { buildPack, isToolEndpoint } from "../src/lib/knowledge/build.ts"
import { makerIndex, makerOf, modelSlugOf, nameKey, publicRepoMatches, publishedOnHub } from "../src/lib/knowledge/identity.ts"
import { GRID_PROVIDERS } from "../src/lib/knowledge/grid.ts"
import { SERVE_COLLECTIONS, servesOfCollection } from "../src/lib/knowledge/collection-serves.ts"
import { validatePack } from "../src/lib/knowledge/schema.ts"
import { emptyCells, gridTable } from "../src/lib/knowledge/grid.ts"
import { familiesTable } from "../src/lib/knowledge/families-report.ts"
import type { PackTask, PackSource } from "../src/lib/knowledge/schema.ts"
import type { ModelPrice, ModelRecord, ParamSchema, RegistrySnapshot } from "../src/lib/registry/types.ts"
import { parseLitellm } from "../src/lib/sheet/sources/litellm.ts"
import type { LitellmEntry } from "../src/lib/sheet/sources/litellm.ts"
import type { MakerList } from "../src/lib/sheet/types.ts"
import { publicReplicateCall, replicateSitemap } from "./lib/replicate-public.mts"

const cache = "scripts/.cache"
mkdirSync(cache, { recursive: true })
const refresh = process.argv.includes("--refresh")
const offline = process.argv.includes("--offline")
const now = new Date().toISOString()
const log = (m: string) => console.log(m)
const fresh = (file: string) => !refresh && existsSync(file) && (offline || Date.now() - Date.parse(JSON.parse(readFileSync(file, "utf8")).savedAt ?? 0) < 86_400_000)
const save = (file: string, data: unknown) => writeFileSync(file, JSON.stringify({ savedAt: now, data }))
const load = <T,>(file: string) => JSON.parse(readFileSync(file, "utf8")).data as T

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) await worker(items[next++]!) }))
}

const tasks = (JSON.parse(readFileSync("src/lib/knowledge/tasks.json", "utf8")) as { tasks: PackTask[] }).tasks
const tools = (JSON.parse(readFileSync("src/lib/knowledge/tools.json", "utf8")) as { tools: PackTask[] }).tools
const makers = JSON.parse(readFileSync("src/lib/sheet/makers.json", "utf8")) as MakerList
const snapshot = JSON.parse(readFileSync("src/lib/registry/registry.snapshot.json", "utf8")) as RegistrySnapshot
const sources: PackSource[] = []

// 1. fal: its own catalog, read now. Which models get their settings and price read is decided from the catalog itself
const records: ModelRecord[] = []
const pagePrices = new Map<string, ModelPrice>()
{
  const listFile = `${cache}/knowledge-fal-list.json`
  let list: ModelRecord[]
  if (fresh(listFile)) list = load(listFile)
  else {
    const got = await fetchFalModels({ pageSize: 100, maxPages: 10, apiKey: process.env.FAL_KEY })
    if (got.failedCategories.length > 0) log(`fal categories not read: ${got.failedCategories.join(", ")}`)
    list = got.records
    save(listFile, list)
    // Coverage: a category fal lists that makes pictures, video or sound and that this reader does not know stops the build, by name
    try {
      save(`${cache}/knowledge-fal-categories.json`, await fetchFalCategoryCounts({ apiKey: process.env.FAL_KEY }) as never)
    } catch (e) {
      log(`fal category counts not read: ${e instanceof Error ? e.message : e}`)
    }
  }
  for (const r of list) if (isToolEndpoint(r)) r.utility = true
  // The models the database may use: the makers' own endpoints, every endpoint whose name says what it does to a file, and the newest of each kind
  const declared = new Set(makers.makers.flatMap((m) => m.models.flatMap((x) => x.hosts.fal ?? [])))
  const chosen = new Map<string, ModelRecord>()
  for (const r of list) if (declared.has(r.endpoint) || r.utility) chosen.set(r.endpoint, r)
  const byKind = new Map<string, ModelRecord[]>()
  for (const r of list) if (!r.utility) byKind.set(`${r.category}|${r.task}`, [...(byKind.get(`${r.category}|${r.task}`) ?? []), r])
  for (const group of byKind.values()) for (const r of [...group].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 14)) chosen.set(r.endpoint, r)
  const picked = [...chosen.values()]
  log(`fal ${list.length} models, ${picked.length} read in full`)

  // Prices from each model page (and fal's pricing API when a key is given); settings from the schema endpoint
  const falPriceFile = `${cache}/knowledge-fal-prices.json`
  const falSchemaFile = `${cache}/knowledge-fal-schemas.json`
  if (fresh(falPriceFile)) for (const [k, v] of Object.entries(load<Record<string, ModelPrice>>(falPriceFile))) pagePrices.set(k, v)
  const noPrice = offline ? [] : picked.filter((r) => !pagePrices.has(`fal|${r.endpoint}`))
  await pool(noPrice, 8, async (r) => {
    const p = await fetchFalPagePrice(r.endpoint)
    if (p) pagePrices.set(`fal|${r.endpoint}`, { unit: p.unit, amount: p.amount, rules: p.rules, ...(p.computeSecond ? { computeSecond: p.computeSecond } : {}), ...(p.outputAmount ? { outputAmount: p.outputAmount } : {}), source: "scraped", fetchedAt: now })
  })
  if (process.env.FAL_KEY && !offline) {
    const priced = await fetchFalPricing(picked.filter((r) => !pagePrices.has(`fal|${r.endpoint}`)), process.env.FAL_KEY)
    for (const r of priced) if (r.price.amount !== null) pagePrices.set(`fal|${r.endpoint}`, r.price)
  }
  save(falPriceFile, Object.fromEntries(pagePrices))
  let schemas: Record<string, ParamSchema> = fresh(falSchemaFile) ? load(falSchemaFile) : {}
  const noSchema = picked.filter((r) => !schemas[r.endpoint]).map((r) => r.endpoint)
  if (noSchema.length > 0 && !offline) {
    const got = await fetchFalSchemas(noSchema)
    for (const [k, v] of got.results) if (v.params) schemas[k] = v.params
    save(falSchemaFile, schemas)
  }
  for (const r of picked) records.push(schemas[r.endpoint] ? attachSchema(r, schemas[r.endpoint]!) : r)
  sources.push({ provider: "fal", method: "api", url: "https://api.fal.ai/v1/models", readOn: now, count: list.length })
  log(`fal prices read ${[...pagePrices.keys()].length}, settings read ${Object.keys(schemas).length}`)
}

// OpenAI and Gemini, read from their own documentation now (the snapshot can be days old, and these providers retire models without notice)
{
  const fetchText = async (url: string) => {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    return res.text()
  }
  for (const [provider, read, url] of [["openai", fetchOpenAIRecords, "https://platform.openai.com/docs/models"], ["gemini", fetchGeminiRecords, "https://ai.google.dev/gemini-api/docs/models"]] as const) {
    const file = `${cache}/knowledge-${provider}.json`
    let got: ModelRecord[]
    if (fresh(file)) got = load(file)
    else {
      try {
        got = (await read(fetchText)).records
        save(file, got)
      } catch (e) {
        console.log(`${provider} docs not readable (${e instanceof Error ? e.message : e}); using the snapshot's ${provider} models`)
        got = snapshot.models.filter((r) => r.provider === provider)
      }
    }
    records.push(...got)
    sources.push({ provider, method: "api", url, readOn: now, count: got.length })
    log(`${provider} ${got.length}`)
  }
}

// 2. OpenRouter, live (it also lists video and speech models)
const orFile = `${cache}/knowledge-openrouter.json`
let openrouter: ModelRecord[]
const orStats = `${cache}/knowledge-openrouter-kinds.json`
if (fresh(orFile) && fresh(orStats)) {
  openrouter = load(orFile)
  Object.assign(lastOpenRouterRead, load(orStats) as never)
} else {
  openrouter = await fetchOpenRouterModels()
  save(orFile, openrouter)
  save(orStats, lastOpenRouterRead as never)
}
// Coverage: every kind of model the provider lists must become records here. Kinds that are not media (chat, embeddings, rerank, decisions) are
// not part of this database; any other kind the provider lists, including one that appears tomorrow, is read or the build stops and names it.
const NOT_MEDIA = new Set(["text", "embeddings", "rerank", "decisions", "unknown"])
const coverageProblems: string[] = []
for (const [kind, n] of Object.entries(lastOpenRouterRead)) {
  if (!NOT_MEDIA.has(kind) && n.mapped < n.listed) coverageProblems.push(`openrouter lists ${n.listed} "${kind}" models and only ${n.mapped} were read`)
}
const falCats = existsSync(`${cache}/knowledge-fal-categories.json`) ? load<Record<string, number>>(`${cache}/knowledge-fal-categories.json`) : {}
for (const [cat, n] of Object.entries(falCats)) {
  if (!FAL_KNOWN_CATEGORIES.includes(cat) && /(^|-to-)(image|video|audio|speech|voice|music|sound)$/i.test(cat)) coverageProblems.push(`fal lists ${n} "${cat}" models and this reader does not know that category`)
}
log(`openrouter kinds: ${Object.entries(lastOpenRouterRead).map(([k, n]) => `${k} ${n.mapped}/${n.listed}`).join(", ")}`)
records.push(...openrouter)
// Embedding models: OpenRouter lists them apart (/api/v1/embeddings/models)
const orEmbFile = `${cache}/knowledge-openrouter-embeddings.json`
let orEmbeddings: ModelRecord[]
if (fresh(orEmbFile)) orEmbeddings = load(orEmbFile)
else {
  orEmbeddings = await fetchOpenRouterEmbeddings()
  save(orEmbFile, orEmbeddings)
}
records.push(...orEmbeddings)
// fal runs OpenRouter's chat and embedding models through its own router (fal.ai/models/openrouter/router), billed by input and output tokens:
// the same models, called and billed by fal, at the token rates the model lists
const viaFal = [...openrouter.filter((r) => r.category === "text" && !r.endpoint.includes(":")), ...orEmbeddings].map((r) => ({ ...r, id: `fal/${r.endpoint}`, provider: "fal" }))
records.push(...viaFal)
log(`openrouter embeddings ${orEmbeddings.length}; fal text and embedding models through its router ${viaFal.length}`)
sources.push({ provider: "openrouter", method: "api", url: "https://openrouter.ai/api/v1/models", readOn: now, count: openrouter.length })
log(`openrouter ${openrouter.length}`)

// 3. Replicate, from its public pages, with the price from each model page
const repFile = `${cache}/knowledge-replicate.json`
let replicate: ModelRecord[]
if (fresh(repFile)) replicate = load(repFile)
else {
  replicate = (await fetchReplicateModels(publicReplicateCall(), { limit: 400, onProgress: (d, t) => d % 200 === 0 && log(`  replicate ${d}/${t}`) })).records
  save(repFile, replicate)
}
// Replicate's full list (its sitemap) names models no collection holds: every one whose name says it is a tool, and every model of a
// known maker's account, is read too
const repExtraFile = `${cache}/knowledge-replicate-extra.json`
let repExtra: ModelRecord[]
let sitemapCount: number | undefined
if (fresh(repExtraFile)) ({ records: repExtra, count: sitemapCount } = load<{ records: ModelRecord[]; count: number }>(repExtraFile))
else {
  const all = await replicateSitemap()
  sitemapCount = all.length
  const have = new Set(replicate.map((r) => r.endpoint.toLowerCase()))
  const owners = new Set(makers.makers.flatMap((m) => [m.id, ...(m.aliases ?? [])]))
  // Sound models are named for what they are, not by a maker account (AudioGen, TangoFlux, MusicGen, Stable Audio)
  const SOUND_NAME = /audiogen|tango|musicgen|stable-audio|audioldm/
  const extra = all.filter((id) => !have.has(id.toLowerCase()) && (TOOL_NAME.test(id.split("/")[1]!.toLowerCase()) || SOUND_NAME.test(id.toLowerCase()) || owners.has(id.split("/")[0]!.toLowerCase())))
  // Only the named models: no collection is read again
  const base = publicReplicateCall()
  const onlyNamed: typeof base = (path) => (path === "/v1/collections" ? Promise.resolve(new Response(JSON.stringify({ results: [] }), { headers: { "content-type": "application/json" } })) : base(path))
  repExtra = (await fetchReplicateModels(onlyNamed, { limit: 10_000, extra })).records
  save(repExtraFile, { records: repExtra, count: sitemapCount })
}
replicate.push(...repExtra)
records.push(...replicate)
sources.push({ provider: "replicate", method: "page", url: "https://replicate.com/sitemap-models.xml", readOn: now, count: sitemapCount ?? replicate.length })
log(`replicate ${replicate.length} (${repExtra.length} from its full list of ${sitemapCount ?? "?"})`)

const repPriceFile = `${cache}/knowledge-replicate-prices.json`
if (fresh(repPriceFile)) for (const [k, v] of Object.entries(load<Record<string, ModelPrice>>(repPriceFile))) pagePrices.set(k, v)
// A model whose price is not saved yet (a new one from the full list) is read now
const unpriced = offline ? [] : replicate.filter((r) => !pagePrices.has(`replicate|${r.endpoint}`))
if (unpriced.length > 0) {
  await pool(unpriced, 8, async (r) => {
    const p = await fetchReplicatePagePrice(r.endpoint, (url, init) => fetch(url, { ...init, headers: { "user-agent": "Mozilla/5.0" } }))
    if (p) pagePrices.set(`replicate|${r.endpoint}`, { unit: p.unit, amount: p.amount, outputAmount: p.outputAmount, rules: p.rules, computeSecond: p.computeSecond, source: "scraped", fetchedAt: now })
  })
  save(repPriceFile, Object.fromEntries(pagePrices))
}
log(`replicate prices read ${[...pagePrices.keys()].filter((k) => k.startsWith("replicate|")).length}`)

// Replicate's own grouping: which collection each model is in says what it is for
const serveTags = new Map<string, string[]>()
let replicateUnread: string[] = []
{
  const tagFile = `${cache}/knowledge-replicate-tags.json`
  let tags: Record<string, string[]>
  if (fresh(tagFile)) tags = load(tagFile)
  else {
    tags = {}
    const call = publicReplicateCall()
    const byEndpoint = new Map(replicate.map((r) => [r.endpoint, r]))
    // Collections Replicate lists that this build does not read are written to the report, so a new topic is seen the day it appears
    const all = await call("/v1/collections")
    if (all.ok) {
      const slugs = ((await all.json()) as { results?: Array<{ slug: string }> }).results?.map((c) => c.slug) ?? []
      tags["_unread"] = slugs.filter((x) => !SERVE_COLLECTIONS.includes(x))
    }
    for (const slug of SERVE_COLLECTIONS) {
      const res = await call(`/v1/collections/${slug}`)
      if (!res.ok) continue
      const col = (await res.json()) as { models: Array<{ owner: string; name: string }> }
      for (const m of col.models) {
        const rec = byEndpoint.get(`${m.owner}/${m.name}`)
        if (!rec) continue
        for (const id of servesOfCollection(slug, rec)) tags[`replicate|${rec.endpoint}`] = [...new Set([...(tags[`replicate|${rec.endpoint}`] ?? []), id])]
      }
    }
    save(tagFile, tags)
  }
  replicateUnread = tags["_unread"] ?? []
  for (const [k, v] of Object.entries(tags)) if (k !== "_unread") serveTags.set(k, v)
  log(`replicate models tagged with a task or tool ${serveTags.size}`)
}

// 4. LiteLLM, pinned to one commit
const litellmFile = `${cache}/litellm.json`
let litellm: Record<string, LitellmEntry>
let pinned = ""
if (!offline) try {
  const head = (await (await fetch("https://api.github.com/repos/BerriAI/litellm/commits/main", { headers: { "user-agent": "gencraft" } })).json()) as { sha?: string }
  pinned = head.sha ?? ""
} catch {
  // the cached copy is used
}
if (fresh(litellmFile)) litellm = load(litellmFile)
else {
  const url = `https://raw.githubusercontent.com/BerriAI/litellm/${pinned || "main"}/model_prices_and_context_window.json`
  litellm = (await (await fetch(url)).json()) as Record<string, LitellmEntry>
  save(litellmFile, litellm)
}
sources.push({ provider: "litellm", method: "litellm", url: "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json", readOn: now, pinnedTo: pinned || undefined })
const facts = parseLitellm(litellm)

// 4b. Hugging Face: a model is open when its maker's own organisation publishes the weights there. Each organisation's list is read once and
// kept a month (makers.json `hub`).
const onHub = new Set<string>()
{
  const hubFile = `${cache}/knowledge-hub.json`
  const saved = existsSync(hubFile) ? (JSON.parse(readFileSync(hubFile, "utf8")) as { savedAt: string; data: Record<string, string[]> }) : undefined
  const stale = !saved || refresh || (!offline && Date.now() - Date.parse(saved.savedAt) > 30 * 86_400_000)
  const repos: Record<string, string[]> = stale ? {} : saved!.data
  if (stale && !offline) {
    for (const mk of makers.makers) {
      for (const org of mk.hub ?? []) {
        try {
          const res = await fetch(`https://huggingface.co/api/models?author=${encodeURIComponent(org)}&limit=1000`)
          if (res.ok) repos[org] = ((await res.json()) as Array<{ id: string }>).map((m) => m.id)
        } catch {
          // an organisation that cannot be read decides nothing
        }
      }
    }
    save(hubFile, repos)
  }
  const index = makerIndex(makers)
  const byMaker = new Map(makers.makers.map((mk) => [mk.id, (mk.hub ?? []).flatMap((o) => repos[o] ?? [])]))
  const ids = new Set<string>()
  for (const r of records) {
    if (!GRID_PROVIDERS.includes(r.provider as never) || r.category === "text") continue
    const m = makerOf(r, index)
    if (m.known) ids.add(`${m.id}/${modelSlugOf(r)}`)
  }
  for (const mk of makers.makers) for (const m of mk.models) ids.add(m.id.split("/").slice(0, 2).join("/"))
  for (const id of ids) if (publishedOnHub(id, byMaker.get(id.split("/")[0]!) ?? [])) onHub.add(id)
  log(`hugging face: ${Object.keys(repos).length} organisations read, ${onHub.size} models published there`)
}
// A model of no known maker: Hugging Face is searched for its name once (kept a month); a well-used repository of that name means open
const publicNames = new Set<string>()
{
  const file = `${cache}/knowledge-hub-names.json`
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { savedAt: string; data: Record<string, boolean> }) : undefined
  const answers: Record<string, boolean> = saved && !refresh && (offline || Date.now() - Date.parse(saved.savedAt) < 30 * 86_400_000) ? saved.data : {}
  const index = makerIndex(makers)
  const keys = new Set<string>()
  for (const r of records) if (GRID_PROVIDERS.includes(r.provider as never) && r.category !== "text" && !r.weights && !makerOf(r, index).known) keys.add(nameKey(r))
  const ask = offline ? [] : [...keys].filter((k) => k.length >= 4 && !(k in answers))
  await pool(ask, 6, async (k) => {
    try {
      const res = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(k)}&sort=downloads&limit=30`)
      if (res.ok) answers[k] = publicRepoMatches(k, (await res.json()) as Array<{ id: string; downloads?: number }>)
    } catch {
      // not answered: asked again next time
    }
  })
  if (ask.length > 0) save(file, answers)
  for (const [k, yes] of Object.entries(answers)) if (yes) publicNames.add(k)
  log(`hugging face by name: ${Object.keys(answers).length} names checked, ${publicNames.size} public`)
}

// 5. Build, then the gate
const pack = buildPack({ makers, tasks, tools, records, pagePrices, litellm: facts, sources, now, serveTags, onHub, publicNames })
// What each model can do, from its maker's own LiteLLM entry (vision, calls tools, reasoning, web search ...)
log(`litellm abilities: ${addMakerAbilities(pack, litellm)} models`)
const allowed = new Set(JSON.parse(readFileSync("src/lib/knowledge/unpriced-allowed.json", "utf8")) as string[])
const blocking = pack.gaps.filter((g) => g.blocking && !allowed.has(g.reason.split(":")[0]!))
// The grid: a cell whose models were all left out (no parameters or no price) means a reader is wrong and stops the build; a cell the
// provider does not offer (its whole list has no model for it) is reported
const notOffered = pack.gaps.filter((g) => g.field === "grid" && !g.blocking).map((g) => g.reason)
const emptySlots = emptyCells(pack)
const problems = [...coverageProblems, ...validatePack(pack), ...blocking.map((g) => (g.field === "price" ? `top model left out for price: ${g.reason}` : `grid: ${g.reason}`))]
// Freshness: what each provider's list held now against the last published database. A list that shrinks a lot or a reader that returns nothing
// means the provider changed its format, so the build stops instead of publishing old or empty data.
const previous = existsSync("src/lib/knowledge/pack.json") ? (JSON.parse(readFileSync("src/lib/knowledge/pack.json", "utf8")) as typeof pack) : undefined
const changes: string[] = []
for (const s of pack.sources) {
  if (s.count === undefined) continue
  const before = previous?.sources.find((x) => x.provider === s.provider)?.count
  changes.push(`- ${s.provider}: ${s.count} models read${before !== undefined ? ` (last time ${before})` : ""}, read on ${s.readOn.slice(0, 10)}`)
  if (before !== undefined && before > 20 && s.count < before * 0.7) problems.push(`${s.provider}'s list shrank from ${before} to ${s.count} models: its format may have changed`)
  if (s.count === 0) problems.push(`${s.provider}'s list was empty`)
}
const wasIds = new Set((previous?.models ?? []).map((m) => m.id))
const nowIds = new Set(pack.models.map((m) => m.id))
const newModels = pack.models.filter((m) => !wasIds.has(m.id)).map((m) => `${m.name} (${m.id})`)
const goneModels = (previous?.models ?? []).filter((m) => !nowIds.has(m.id)).map((m) => `${m.name} (${m.id})`)
const byField: Record<string, number> = {}
for (const g of pack.gaps) byField[g.field] = (byField[g.field] ?? 0) + 1
const lines = pack.models.reduce((n, m) => n + m.lines.length, 0)
log(`models ${pack.models.length}, lines ${lines}, gaps ${pack.gaps.length} ${JSON.stringify(byField)}, gate problems ${problems.length}`)
if (problems.length) {
  console.log(problems.slice(0, 20).join("\n"))
  process.exitCode = 1
}

if (problems.length === 0) writeFileSync("src/lib/knowledge/pack.json", JSON.stringify(pack))
const report = [
  `# Knowledge database: what was found and what is missing`,
  ``,
  `Built ${now}. ${pack.models.length} models, ${lines} provider lines. The gate found ${problems.length} problems.`,
  ``,
  `## Replicate collections not read`,
  `${replicateUnread.join(", ") || "none"}`,
  ``,
  `## What changed since the last build`,
  ...changes,
  `- New in the database (${newModels.length}): ${newModels.slice(0, 60).join(", ") || "none"}`,
  `- No longer in the database (${goneModels.length}): ${goneModels.slice(0, 60).join(", ") || "none"}`,
  ``,
  `## Lines per provider`,
  ...["fal", "replicate", "openrouter", "openai", "gemini"].map((p) => `- ${p}: ${pack.models.reduce((n, m) => n + m.lines.filter((l) => l.provider === p).length, 0)}`),
  ``,
  `## Families: each maker family's latest versions on every provider`,
  ``,
  ...familiesTable(pack),
  `## The grid: at least one model for every task and tool (${emptySlots.length} empty cells)`,
  ``,
  ...gridTable(pack),
  ``,
  `### Not offered by the provider (${notOffered.length})`,
  ...notOffered.map((p) => `- ${p}`),
  ``,
  `## Gaps (${pack.gaps.length}) by kind`,
  ...Object.entries(byField).map(([k, n]) => `- ${k}: ${n}`),
  ``,
  `## Every gap`,
  ...pack.gaps.map((g) => `- [${g.field}] ${g.provider} ${g.modelId}: ${g.reason}`),
].join("\n")
mkdirSync("docs", { recursive: true })
writeFileSync("docs/knowledge-gaps.md", report)
try {
  execFileSync("python", ["scripts/export-knowledge-xlsx.py"], { stdio: "inherit" })
} catch {
  log("workbook not written (python or openpyxl missing)")
}

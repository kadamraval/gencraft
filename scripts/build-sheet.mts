import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { auditSheet, auditText } from "../src/lib/sheet/audit.ts"
import { buildSheet } from "../src/lib/sheet/merge.ts"
import { falSource, FAL_API } from "../src/lib/sheet/sources/fal.ts"
import type { FalModel } from "../src/lib/sheet/sources/fal.ts"
import { falPageSource } from "../src/lib/sheet/sources/falPage.ts"
import type { PagePrice } from "../src/lib/sheet/sources/falPage.ts"
import { fetchFalPagePrice } from "../src/lib/registry/adapters/fal-price.ts"
import { LITELLM_URL, parseLitellm } from "../src/lib/sheet/sources/litellm.ts"
import type { LitellmEntry } from "../src/lib/sheet/sources/litellm.ts"
import type { Fact, MakerList, Precedence } from "../src/lib/sheet/types.ts"

/**
 * Builds the model sheet: the maker list, checked against LiteLLM and fal. Writes src/lib/sheet/model-sheet.json and docs/sheet-audit.md.
 *   npm run sheet:build              uses the saved copies in scripts/.cache when they are under a day old
 *   npm run sheet:build -- --refresh reads LiteLLM and fal again
 * A fal key in FAL_KEY adds fal's own prices. The key is only read from the environment and never written anywhere.
 */

const cache = "scripts/.cache"
mkdirSync(cache, { recursive: true })
const refresh = process.argv.includes("--refresh")
const fresh = (file: string) => existsSync(file) && Date.now() - Date.parse(JSON.parse(readFileSync(file, "utf8")).savedAt ?? 0) < 86_400_000

async function getJson(url: string, init?: { headers?: Record<string, string> }): Promise<unknown> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: init?.headers })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    return res.json()
  }
  throw new Error(`${url}: rate limited`)
}

const list = JSON.parse(readFileSync("src/lib/sheet/makers.json", "utf8")) as MakerList
const precedence = JSON.parse(readFileSync("src/lib/sheet/precedence.json", "utf8")) as Precedence
const wantedKeys = list.makers.flatMap((m) => m.models.flatMap((x) => x.litellm))
const wantedFal = new Set(list.makers.flatMap((m) => m.models.flatMap((x) => x.hosts.fal ?? [])))

// LiteLLM
const litellmFile = `${cache}/litellm.json`
let litellm: Record<string, LitellmEntry>
if (!refresh && fresh(litellmFile)) litellm = JSON.parse(readFileSync(litellmFile, "utf8")).data
else {
  litellm = (await getJson(LITELLM_URL)) as Record<string, LitellmEntry>
  writeFileSync(litellmFile, JSON.stringify({ savedAt: new Date().toISOString(), data: litellm }))
}
const facts: Fact[] = parseLitellm(litellm, wantedKeys)

// fal
const falFile = `${cache}/fal-models.json`
let falFacts: Fact[]
if (!refresh && fresh(falFile)) {
  const models = JSON.parse(readFileSync(falFile, "utf8")).data as FalModel[]
  const { parseFalModels } = await import("../src/lib/sheet/sources/fal.ts")
  falFacts = parseFalModels(models, wantedFal)
} else {
  const models: FalModel[] = []
  let cursor: string | null = null
  do {
    const page = (await getJson(`${FAL_API}/models?limit=100&status=active${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)) as { models: FalModel[]; next_cursor: string | null; has_more: boolean }
    models.push(...page.models)
    cursor = page.has_more ? page.next_cursor : null
  } while (cursor)
  writeFileSync(falFile, JSON.stringify({ savedAt: new Date().toISOString(), data: models }))
  const { parseFalModels } = await import("../src/lib/sheet/sources/fal.ts")
  falFacts = parseFalModels(models, wantedFal)
}
facts.push(...falFacts)
if (process.env.FAL_KEY) facts.push(...(await falSource(getJson, { only: wantedFal, apiKey: process.env.FAL_KEY }).fetch()).filter((f) => f.field === "price"))

// fal's public model pages: a price without a key, and a cross-check for LiteLLM
const pageFile = `${cache}/fal-page-prices.json`
let pageFacts: Fact[]
if (!refresh && fresh(pageFile)) pageFacts = JSON.parse(readFileSync(pageFile, "utf8")).data
else {
  pageFacts = await falPageSource(async (endpoint) => (await fetchFalPagePrice(endpoint)) as PagePrice | null, [...wantedFal]).fetch()
  writeFileSync(pageFile, JSON.stringify({ savedAt: new Date().toISOString(), data: pageFacts }))
}
facts.push(...pageFacts)

const sheet = buildSheet(list, facts, precedence)
const builtAt = new Date().toISOString()
writeFileSync("src/lib/sheet/model-sheet.json", JSON.stringify({ builtAt, models: sheet }, null, 1))
mkdirSync("docs", { recursive: true })
const audit = auditSheet(sheet)
writeFileSync("docs/sheet-audit.md", auditText(audit, builtAt))
console.log(`${audit.models} models, ${audit.listings} listings | no listing ${audit.noListing.length}, unknown endpoint ${audit.notFound.length}, conflicts ${audit.conflicts.length}, no price ${audit.noPrice.length}`)

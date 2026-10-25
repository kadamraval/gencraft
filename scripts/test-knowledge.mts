import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { CATALOG } from "../src/lib/ai-tools/catalog.ts"
import crypto from "node:crypto"
import { intervalOf, isUpdateDue } from "../src/lib/knowledge/update-schedule.ts"
import { buildPack } from "../src/lib/knowledge/build.ts"
import type { ModelRecord } from "../src/lib/registry/types.ts"
import type { MakerList } from "../src/lib/sheet/types.ts"
import { fetchKnowledgePack } from "../src/lib/knowledge/pack-client.ts"
import { buildGeminiRecords, classify, parseVideoSecondPrices } from "../src/lib/registry/adapters/gemini-docs.ts"
import { estimateRun } from "../src/lib/registry/price.ts"
import { statusOf } from "../src/lib/ai-tools/match.ts"
import { toolById } from "../src/lib/ai-tools/catalog.ts"
import { recordsFromPack } from "../src/lib/knowledge/pack-to-registry.ts"
import { ALTERNATIVE_JOBS, jobIdFor } from "../src/lib/knowledge/job-map.ts"
import { promptFor } from "../src/lib/ai-tools/run.ts"
import { PACK_SCHEMA_VERSION, validatePack } from "../src/lib/knowledge/schema.ts"
import type { KnowledgePack, PackJob, PackLine, PackModel } from "../src/lib/knowledge/schema.ts"

let passed = 0
const check = (name: string, fn: () => void) => {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  }
}

const jobs = (JSON.parse(readFileSync("src/lib/knowledge/jobs.json", "utf8")) as { jobs: PackJob[] }).jobs

check("every model tool of the catalog has a job; the jobs with no tool yet are exactly the ones named", () => {
  const toolIds = CATALOG.filter((t) => t.kind === "model").map((t) => t.id)
  const missing = toolIds.filter((id) => !jobs.some((j) => j.id === id))
  assert.deepEqual(missing, [], `tools with no job: ${missing.join(", ")}`)
  // Jobs of the agreed list that the catalog has no tool for yet: they are in the database, and a tool card can be added for each
  const noToolYet = jobs.filter((j) => j.kind === "tool" && !toolIds.includes(j.id)).map((j) => j.id)
  assert.deepEqual(noToolYet, ["audio-transcribe", "image-colorize", "image-edit"])
})

check("every job says where it is used, and picture jobs stay out of Story and Edit", () => {
  for (const j of jobs) {
    assert.ok(j.usedIn.length > 0, `${j.id} is used nowhere`)
    if (j.group === "image") assert.ok(!j.usedIn.includes("story") && !j.usedIn.includes("edit"), `${j.id} must not be in Story/Edit`)
  }
})

check("every model of the maker list maps to a job of the vocabulary", () => {
  const list = JSON.parse(readFileSync("src/lib/sheet/makers.json", "utf8")) as { makers: Array<{ models: Array<{ id: string; type: "image" | "video" | "audio"; category: string; job: string }> }> }
  const unmapped: string[] = []
  for (const mk of list.makers) {
    for (const m of mk.models) {
      const id = jobIdFor(m.type, m.category, m.job)
      if (!id || !jobs.some((j) => j.id === id)) unmapped.push(`${m.id} (${m.type}|${m.category}|${m.job})`)
    }
  }
  assert.deepEqual(unmapped, [])
})

const line = (over: Partial<PackLine> = {}): PackLine => ({
  provider: "fal",
  endpoint: "fal-ai/x",
  jobId: "text-to-image",
  rank: 1,
  role: "model",
  price: { unit: "per_image", amount: 0.04, from: "api", readOn: "2026-10-23" },
  params: { type: "object", properties: { prompt: { type: "string" } } },
  status: "active",
  seenBy: ["fal"],
  ...over,
})
const model = (id: string, lines: PackLine[]): PackModel => ({ id, makerId: "m", name: id, type: "image", category: "text-to-image", jobs: ["text-to-image"], status: "active", latest: true, lines })
const pack = (models: PackModel[]): KnowledgePack => ({
  schemaVersion: PACK_SCHEMA_VERSION,
  generatedAt: "2026-10-23T00:00:00Z",
  makers: [{ id: "m", name: "Maker" }],
  jobs,
  models,
  sources: [],
  gaps: [],
  completeness: [],
})

check("a complete pack passes the gate", () => {
  assert.deepEqual(validatePack(pack([model("m/a", [line()]), model("m/b", [line({ rank: 2, endpoint: "fal-ai/y" })])])), [])
})

check("the gate names the model and the missing field", () => {
  const noPrice = validatePack(pack([model("m/a", [line({ price: { unit: "unknown", amount: null, from: "api", readOn: "2026-10-23" } })])]))
  assert.deepEqual(noPrice, ["m/a on fal: no price"])
  // A zero the provider's own API states is a price (free); a zero from anywhere else is not
  assert.deepEqual(validatePack(pack([model("m/a", [line({ price: { unit: "per_image", amount: 0, from: "api", readOn: "2026-10-23" } })])])), [])
  assert.deepEqual(validatePack(pack([model("m/a", [line({ price: { unit: "per_image", amount: 0, from: "page", readOn: "2026-10-23" } })])])), ["m/a on fal: no price"])
  const noSettings = validatePack(pack([model("m/a", [line({ params: { type: "object", properties: {} } })])]))
  assert.deepEqual(noSettings, ["m/a on fal: no settings"])
  const noEndpoint = validatePack(pack([model("m/a", [line({ endpoint: "" })])]))
  assert.deepEqual(noEndpoint, ["m/a on fal: no endpoint"])
})

check("ranks for one job on one provider run 1, 2, 3 across models with no gap or repeat", () => {
  const two = validatePack(pack([model("m/a", [line()]), model("m/b", [line({ rank: 1 })])]))
  assert.deepEqual(two, ["fal|text-to-image: ranks 1,1 are not 1..2"])
  const gap = validatePack(pack([model("m/a", [line({ rank: 2 })])]))
  assert.deepEqual(gap, ["fal|text-to-image: ranks 2 are not 1..1"])
})

check("an unknown job, an unknown maker, a double listing and a model on no provider are all refused", () => {
  const bad = pack([model("m/a", [line({ jobId: "nope" })]), model("m/a", [])])
  bad.models[0]!.makerId = "ghost"
  const out = validatePack(bad)
  assert.ok(out.some((p) => p.includes("unknown job nope")))
  assert.ok(out.some((p) => p.includes("unknown maker ghost")))
  assert.ok(out.some((p) => p.includes("listed twice")))
  assert.ok(out.some((p) => p.includes("on no provider")))
})

check("the pack becomes registry records that carry their jobs and ranks", () => {
  const p = pack([
    { ...model("m/a", [line({ jobId: "image-upscale", endpoint: "x/up-a", rank: 2 })]), type: "image", category: "image-to-image", jobs: ["image-upscale"] },
    { ...model("m/b", [line({ jobId: "image-upscale", endpoint: "x/up-b", rank: 1, provider: "replicate" })]), type: "image", category: "image-to-image", jobs: ["image-upscale"] },
  ])
  const recs = recordsFromPack(p)
  assert.equal(recs.length, 2)
  const b = recs.find((r) => r.endpoint === "x/up-b")!
  assert.deepEqual(b.jobs, [{ id: "image-upscale", rank: 1, role: "model" }])
  assert.equal(b.utility, true)
  assert.equal(b.price.amount, 0.04)
})

check("a tool offers the models the database ranks for it, best first, and only on providers the person has", () => {
  const p = pack([
    { ...model("m/a", [line({ jobId: "image-upscale", endpoint: "x/up-a", rank: 2 })]), type: "image", category: "image-to-image", jobs: ["image-upscale"] },
    { ...model("m/b", [line({ jobId: "image-upscale", endpoint: "x/up-b", rank: 1 })]), type: "image", category: "image-to-image", jobs: ["image-upscale"] },
    { ...model("m/c", [line({ jobId: "image-upscale", endpoint: "x/up-c", rank: 1, provider: "replicate" })]), type: "image", category: "image-to-image", jobs: ["image-upscale"] },
  ])
  const records = recordsFromPack(p)
  const spec = toolById("image-upscale")!
  const out = statusOf(spec, { records, listed: [], keyed: new Set(["fal"]), runnable: () => true })
  assert.equal(out.status.state, "ready")
  assert.deepEqual(out.candidates.slice(0, 2).map((r) => r.endpoint), ["x/up-b", "x/up-a"])
  assert.ok(!out.candidates.some((r) => r.provider === "replicate"))
  const none = statusOf(spec, { records, listed: [], keyed: new Set(["openai"]), runnable: () => true })
  assert.equal(none.status.state, "needs-model")
})

// ---- the build
const rec = (provider: string, endpoint: string, over: Partial<ModelRecord> = {}): ModelRecord => ({
  id: `${provider}/${endpoint}`, endpoint, provider, name: endpoint.split("/").pop()!, family: "f", logoKey: "f", modality: "image", task: "text-to-image", inputs: ["text"],
  params: { type: "object", properties: { prompt: { type: "string" } } },
  price: { unit: "per_image", amount: 0.05, source: "api", fetchedAt: "2026-10-23" }, status: "active", updatedAt: "2026-10-01", ...over,
})
const makers: MakerList = { version: 1, makers: [{ id: "acme", name: "Acme", models: [{ id: "acme/pix-2/text-to-image", name: "Pix 2", type: "image", category: "text-to-image", job: "generate", litellm: [], hosts: { fal: ["acme/pix-2"] } }] }] }

check("the build puts the maker's model first and fills the rest of the job with the provider's own newest models", () => {
  const records = [rec("fal", "acme/pix-2"), rec("fal", "other/a", { updatedAt: "2026-09-01" }), rec("fal", "other/b", { updatedAt: "2026-10-05" }), rec("fal", "other/c", { updatedAt: "2026-08-01" }), rec("fal", "other/d", { updatedAt: "2026-07-01" })]
  const out = buildPack({ makers, jobs, records, now: "2026-10-23", want: 3 })
  const lines = out.models.flatMap((m) => m.lines).filter((l) => l.provider === "fal" && l.jobId === "text-to-image").sort((a, b) => a.rank - b.rank)
  // The maker's own model is first; the provider's popular and newest models follow, up to the number wanted
  assert.equal(lines[0]!.endpoint, "acme/pix-2")
  assert.equal(lines[0]!.role, "model")
  assert.equal(lines.length, 3)
  assert.deepEqual(validatePack(out), [])
})

check("a provider with none of the maker's models is named as a gap, and still gets its own best ones for the job", () => {
  const records = [rec("fal", "acme/pix-2"), rec("replicate", "o/x", { updatedAt: "2026-10-02" })]
  const out = buildPack({ makers, jobs, records, now: "2026-10-23", want: 2 })
  assert.ok(out.gaps.some((g) => g.provider === "replicate" && g.field === "endpoint" && g.modelId === "acme/pix-2/text-to-image"))
  assert.ok(out.models.some((m) => m.lines.some((l) => l.provider === "replicate" && l.role !== "alternative")))
})

check("an estimate is not a price: the line is left out and the gap says why, and the next model takes its place", () => {
  const records = [rec("fal", "acme/pix-2", { price: { unit: "per_image", amount: 0.05, source: "estimate", fetchedAt: "2026-10-23" } }), rec("fal", "other/a")]
  const out = buildPack({ makers, jobs, records, now: "2026-10-23", want: 1 })
  assert.ok(out.gaps.some((g) => g.field === "price" && g.reason.includes("acme/pix-2")))
  assert.ok(!out.models.flatMap((m) => m.lines).some((l) => l.endpoint === "acme/pix-2"))
  assert.ok(out.models.flatMap((m) => m.lines).some((l) => l.endpoint === "other/a"))
  assert.deepEqual(validatePack(out), [])
})

check("a price from a page or the LiteLLM file is taken when the list has none, and says where it came from", () => {
  const records = [rec("fal", "acme/pix-2", { price: { unit: "unknown", amount: null, source: "api", fetchedAt: "" } })]
  const page = new Map([["fal|acme/pix-2", { unit: "per_image" as const, amount: 0.07, source: "scraped" as const, fetchedAt: "2026-10-22" }]])
  const out = buildPack({ makers, jobs, records, pagePrices: page, now: "2026-10-23", want: 1 })
  const l = out.models[0]!.lines[0]!
  assert.equal(l.price.amount, 0.07)
  assert.equal(l.price.from, "page")
})

check("a model that bills on the maker's own key, with no price of its own, is left out", () => {
  const records = [rec("replicate", "openai/gpt-image-x", { price: { unit: "unknown", amount: null, source: "api", fetchedAt: "" }, description: "You need to bring your own verified OpenAI key to use this model." })]
  const list: MakerList = { version: 1, makers: [{ id: "openai", name: "OpenAI", models: [{ id: "openai/gpt-image-x/text-to-image", name: "GPT Image X", type: "image", category: "text-to-image", job: "generate", litellm: [], hosts: { replicate: ["openai/gpt-image-x"] } }] }] }
  const out = buildPack({ makers: list, jobs, records, now: "2026-10-23", want: 1 })
  assert.equal(out.models.length, 0)
  assert.ok(out.gaps.some((g) => g.field === "price"))
})

check("a newer version of a family is marked latest and the older one is not", () => {
  const list: MakerList = { version: 1, makers: [{ id: "acme", name: "Acme", models: [
    { id: "acme/pix-2/text-to-image", name: "Pix 2", type: "image", category: "text-to-image", job: "generate", litellm: [], hosts: { fal: ["acme/pix-2"] } },
    { id: "acme/pix-3/text-to-image", name: "Pix 3", type: "image", category: "text-to-image", job: "generate", litellm: [], hosts: { fal: ["acme/pix-3"] } },
  ] }] }
  const out = buildPack({ makers: list, jobs, records: [rec("fal", "acme/pix-2"), rec("fal", "acme/pix-3")], now: "2026-10-23", want: 2 })
  assert.equal(out.models.find((m) => m.id === "acme/pix-3")?.latest, true)
  assert.equal(out.models.find((m) => m.id === "acme/pix-2")?.latest, false)
})

check("a price from the database drives the estimate: tiers by setting, and no price gives no number", () => {
  const tiered = pack([{ ...model("m/v", [line({ jobId: "text-to-video", endpoint: "x/v", price: { unit: "per_second", amount: 0.08, rules: [{ when: { resolution: "480p" }, amount: 0.08 }, { when: { resolution: "720p" }, amount: 0.14 }], from: "page", readOn: "2026-10-23" } })]), type: "video", category: "text-to-video", jobs: ["text-to-video"] }])
  const [r] = recordsFromPack(tiered)
  assert.ok(Math.abs((estimateRun(r!, { resolution: "720p", duration: 5 }).usd ?? 0) - 0.7) < 1e-9)
  assert.ok(Math.abs((estimateRun(r!, { resolution: "480p", duration: 5 }).usd ?? 0) - 0.4) < 1e-9)
  const none = pack([{ ...model("m/n", [line({ endpoint: "x/n", price: { unit: "unknown", amount: null, from: "api", readOn: "2026-10-23" } })]) }])
  const [u] = recordsFromPack(none)
  assert.equal(estimateRun(u!, {}).usd, null)
})

check("a provider with few models for a job gets instruction-following picture models as alternatives, ranked after the real ones", () => {
  const editor = (endpoint: string, updatedAt: string) => rec("openai", endpoint, { task: "image-to-image", inputs: ["text", "image"], params: { type: "object", properties: { prompt: { type: "string" }, image: { type: "string", format: "image" } } }, updatedAt })
  const records = [editor("e/new", "2026-10-02"), editor("e/old", "2026-09-01"), rec("openai", "plain/generator", { task: "text-to-image" })]
  const out = buildPack({ makers, jobs, records, now: "2026-10-23", want: 3 })
  const lines = out.models.flatMap((m) => m.lines).filter((l) => l.provider === "openai" && l.jobId === "image-restyle").sort((a, b) => a.rank - b.rank)
  assert.deepEqual(lines.map((l) => [l.endpoint, l.role]), [["e/new", "alternative"], ["e/old", "alternative"]])
  const none = out.models.flatMap((m) => m.lines).filter((l) => l.jobId === "image-upscale")
  assert.equal(none.length, 0)
})

check("an alternative is told what to do, and a real tool model gets the person's words as they are", () => {
  const spec = { id: "image-restyle", instruction: "Redraw this picture in this style, keeping the same layout: {prompt}" }
  const alt = { jobs: [{ id: "image-restyle", rank: 3, role: "alternative" as const }] }
  const real = { jobs: [{ id: "image-restyle", rank: 1, role: "model" as const }] }
  assert.equal(promptFor(spec, alt, "oil painting"), "Redraw this picture in this style, keeping the same layout: oil painting")
  assert.equal(promptFor(spec, real, "oil painting"), "oil painting")
  const relight = { id: "image-relight", instruction: "Change only the lighting of this picture: {prompt}. Keep everything else." }
  assert.equal(promptFor(relight, { jobs: [{ id: "image-relight", rank: 2, role: "alternative" as const }] }, ""), "Change only the lighting of this picture. Keep everything else.")
})

check("every job a picture model can do by instruction has a sentence in the tool catalog", () => {
  for (const id of ALTERNATIVE_JOBS) assert.ok(toolById(id)?.instruction, `${id} has no instruction`)
})

check("Gemini's video model is read from Google's pages: its versioned code, its documented settings and its price per second", () => {
  assert.equal(classify("gemini-omni-flash"), "video")
  const pricing = [
    "## Gemini Omni Flash",
    "",
    "*[`gemini-omni-1.1-flash`](https://x)*",
    "",
    "### Standard",
    "",
    "| | Free | Paid |",
    "|---|---|---|",
    "| Input price | n/a | $1.50 |",
    "",
    "^\\*^ Billing is based on total output token consumption, calculated at a rate of 5,792 tokens per second of 720p video. Under Standard pricing, this equates to an effective price of approximately $0.10 per second.",
    "",
    "## Gemini 3.1 Pro",
    "",
    "*[`gemini-3.1-pro-preview`](https://y)*",
    "",
  ].join("\n")
  const seconds = parseVideoSecondPrices(pricing)
  assert.deepEqual([...seconds], [["gemini-omni-1.1-flash", 0.1]])
  const { records } = buildGeminiRecords([{ name: "Gemini Omni Flash", id: "gemini-omni-flash", description: "video", tags: "Stable" }], [], new Map(), "2026-10-23", seconds)
  const r = records[0]!
  assert.equal(r.endpoint, "gemini-omni-1.1-flash")
  assert.equal(r.modality, "video")
  assert.deepEqual([r.price.unit, r.price.amount], ["per_second", 0.1])
  assert.deepEqual(r.params.properties.resolution?.enum, ["360p", "720p", "1080p", "4k"])
  assert.deepEqual(r.params.properties.aspect_ratio?.enum, ["16:9", "9:16"])
  assert.ok(r.inputs.includes("image"))
})

check("the person chooses when models update: never on its own, daily, weekly or monthly", () => {
  const day = 24 * 3600 * 1000
  const now = Date.UTC(2026, 9, 23)
  assert.equal(intervalOf("click"), undefined)
  assert.equal(intervalOf("daily"), day)
  assert.equal(intervalOf("weekly"), 7 * day)
  assert.equal(intervalOf("monthly"), 30 * day)
  assert.equal(isUpdateDue(undefined, now, "click"), false)
  assert.equal(isUpdateDue(now - 400 * day, now, "click"), false)
  assert.equal(isUpdateDue(undefined, now, "weekly"), true)
  assert.equal(isUpdateDue(now - 3 * day, now, "weekly"), false)
  assert.equal(isUpdateDue(now - 8 * day, now, "weekly"), true)
  assert.equal(isUpdateDue(now - 2 * day, now, "daily"), true)
  assert.equal(isUpdateDue(now - 20 * day, now, "monthly"), false)
})

check("a higher version of a declared family found in a provider's list is added automatically and the older one stops being latest", () => {
  const records = [rec("fal", "acme/pix-2"), rec("fal", "acme/pix-3"), rec("fal", "acme/pix-2.5-fast"), rec("fal", "other/pixel-9")]
  const out = buildPack({ makers, jobs, records, now: "2026-10-23", want: 1 })
  assert.deepEqual((out.newVersions ?? []).map((n) => [n.declared, n.endpoint]), [["Pix 2", "acme/pix-3"]])
  const lines = out.models.flatMap((m) => m.lines).filter((l) => l.endpoint === "acme/pix-3")
  assert.equal(lines[0]?.role, "model")
  assert.equal(out.models.find((m) => m.id === "acme/pix-2")?.latest, false)
})

// ---- the signed download
const sign = async (bytes: Uint8Array, privateKey: CryptoKey) => Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, bytes as BufferSource)).toString("base64url")
const served = (files: Record<string, Uint8Array | string>) => async (url: string): Promise<Response> => {
  const name = url.split("/").pop()!
  const body = files[name]
  return body === undefined ? new Response("no", { status: 404 }) : new Response(body as BodyInit)
}

const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
const publicJwk = (await crypto.subtle.exportKey("jwk", keys.publicKey)) as JsonWebKey
const good = pack([model("m/a", [line()])])
const goodBytes = new TextEncoder().encode(JSON.stringify(good))
const goodSig = await sign(goodBytes, keys.privateKey)

{
  const taken = await fetchKnowledgePack({ source: "https://x.test/k", fetcher: served({ "pack.json": goodBytes, "pack.sig": goodSig }), publicKey: publicJwk })
  check("a signed, complete, newer database is accepted", () => assert.equal(taken.pack?.generatedAt, good.generatedAt))
  const same = await fetchKnowledgePack({ source: "https://x.test/k", fetcher: served({ "pack.json": goodBytes, "pack.sig": goodSig }), publicKey: publicJwk, heldGeneratedAt: good.generatedAt })
  check("one that is not newer than the held one is left alone", () => assert.equal(same.pack, undefined))
  const tampered = new TextEncoder().encode(JSON.stringify({ ...good, generatedAt: "2099-01-01T00:00:00Z" }))
  const forged = await fetchKnowledgePack({ source: "https://x.test/k", fetcher: served({ "pack.json": tampered, "pack.sig": goodSig }), publicKey: publicJwk })
  check("one whose bytes differ from what was signed is refused", () => assert.match(forged.skipped ?? "", /not signed/))
  const incomplete = pack([model("m/a", [line({ price: { unit: "unknown", amount: null, from: "api", readOn: "2026-10-23" } })])])
  const incBytes = new TextEncoder().encode(JSON.stringify(incomplete))
  const failed = await fetchKnowledgePack({ source: "https://x.test/k", fetcher: served({ "pack.json": incBytes, "pack.sig": await sign(incBytes, keys.privateKey) }), publicKey: publicJwk })
  check("a signed database that fails the gate is refused", () => assert.match(failed.skipped ?? "", /failed its checks/))
  const unsigned = await fetchKnowledgePack({ source: "https://x.test/k", fetcher: served({ "pack.json": goodBytes }), publicKey: publicJwk })
  check("a database with no signature file is refused", () => assert.match(unsigned.skipped ?? "", /no signature/))
}

console.log(`${passed} passed`)

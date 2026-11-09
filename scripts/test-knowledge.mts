import assert from "node:assert/strict"
import packJson from "../src/lib/knowledge/pack.json" with { type: "json" }
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
import { servesFor } from "../src/lib/knowledge/serve-map.ts"
import { promptFor } from "../src/lib/ai-tools/run.ts"
import { PACK_SCHEMA_VERSION, validatePack } from "../src/lib/knowledge/schema.ts"
import type { KnowledgePack, PackLine, PackModel, PackTask } from "../src/lib/knowledge/schema.ts"
import { makerIndex, makerOf, modelSlugOf, nameKey, publicRepoMatches, publishedOnHub } from "../src/lib/knowledge/identity.ts"
import { replicateWeights } from "../src/lib/registry/adapters/replicate.ts"
import { actionOf } from "../src/lib/sheet/actions.ts"

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

const tasks = (JSON.parse(readFileSync("src/lib/knowledge/tasks.json", "utf8")) as { tasks: PackTask[] }).tasks
const tools = (JSON.parse(readFileSync("src/lib/knowledge/tools.json", "utf8")) as { tools: PackTask[] }).tools
const entries = [...tasks, ...tools]

check("every model tool of the catalog is a task or tool of the database; the tools with no card yet are exactly the ones named", () => {
  const toolIds = CATALOG.filter((t) => t.kind === "model").map((t) => t.id)
  const missing = toolIds.filter((id) => !entries.some((j) => j.id === id))
  assert.deepEqual(missing, [], `catalog tools not in the database: ${missing.join(", ")}`)
  // Tools of the agreed list that the catalog has no card for yet: they are in the database, and a card can be added for each
  const noToolYet = tools.filter((j) => !toolIds.includes(j.id)).map((j) => j.id)
  // Remove fillers is done by the editor itself (it transcribes and cuts), so it has no model card
  assert.deepEqual(noToolYet, ["video-remove-fillers", "audio-transcribe", "image-edit"])
})

check("every task and tool says where it is used, and picture ones stay out of Story and Edit", () => {
  for (const j of entries) {
    assert.ok(j.usedIn.length > 0, `${j.id} is used nowhere`)
    if (j.category === "image") assert.ok(!j.usedIn.includes("story") && !j.usedIn.includes("edit"), `${j.id} must not be in Story/Edit`)
  }
})

check("every model of the maker list maps to a task or tool", () => {
  const list = JSON.parse(readFileSync("src/lib/sheet/makers.json", "utf8")) as { makers: Array<{ models: Array<{ id: string; category: "image" | "video" | "audio"; task: string; action: string }> }> }
  const unmapped: string[] = []
  for (const mk of list.makers) {
    for (const m of mk.models) {
      const id = servesFor(m.category, m.task, m.action)
      if (!id || !entries.some((j) => j.id === id)) unmapped.push(`${m.id} (${m.category}|${m.task}|${m.action})`)
    }
  }
  assert.deepEqual(unmapped, [])
})

const line = (over: Partial<PackLine> = {}): PackLine => ({
  provider: "fal",
  endpoint: "fal-ai/x",
  serves: "text-to-image",
  rank: 1,
  role: "model",
  price: { unit: "per_image", amount: 0.04, from: "api", readOn: "2026-10-23" },
  parameters: { type: "object", properties: { prompt: { type: "string" } } },
  status: "active",
  seenBy: ["fal"],
  ...over,
})
const model = (id: string, lines: PackLine[]): PackModel => ({ id, makerId: "bfl", name: id, category: "image", tasks: ["text-to-image"], tools: [], capabilities: [], status: "active", latest: true, lines })
const pack = (models: PackModel[]): KnowledgePack => ({
  schemaVersion: PACK_SCHEMA_VERSION,
  generatedAt: "2026-10-23T00:00:00Z",
  makers: [{ id: "bfl", name: "Black Forest Labs" }],
  tasks,
  tools,
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
  const noSettings = validatePack(pack([model("m/a", [line({ parameters: { type: "object", properties: {} } })])]))
  assert.deepEqual(noSettings, ["m/a on fal: no parameters"])
  const noEndpoint = validatePack(pack([model("m/a", [line({ endpoint: "" })])]))
  assert.deepEqual(noEndpoint, ["m/a on fal: no endpoint"])
})

check("ranks for one task on one provider run 1, 2, 3 across models with no gap or repeat", () => {
  const two = validatePack(pack([model("m/a", [line()]), model("m/b", [line({ rank: 1 })])]))
  assert.deepEqual(two, ["fal|text-to-image: ranks 1,1 are not 1..2"])
  const gap = validatePack(pack([model("m/a", [line({ rank: 2 })])]))
  assert.deepEqual(gap, ["fal|text-to-image: ranks 2 are not 1..1"])
})

check("an unknown task or tool, an unknown maker, a double listing and a model on no provider are all refused", () => {
  const bad = pack([model("m/a", [line({ serves: "nope" })]), model("m/a", [])])
  bad.models[0]!.makerId = "ghost"
  const out = validatePack(bad)
  assert.ok(out.some((p) => p.includes("serves unknown nope")))
  assert.ok(out.some((p) => p.includes("unknown maker ghost")))
  assert.ok(out.some((p) => p.includes("listed twice")))
  assert.ok(out.some((p) => p.includes("on no provider")))
})

check("the pack becomes registry records that carry what they serve and their ranks", () => {
  const p = pack([
    { ...model("m/a", [line({ serves: "image-upscale", endpoint: "x/up-a", rank: 2 })]), category: "image", tasks: [], tools: ["image-upscale"] },
    { ...model("m/b", [line({ serves: "image-upscale", endpoint: "x/up-b", rank: 1, provider: "replicate" })]), category: "image", tasks: [], tools: ["image-upscale"] },
  ])
  const recs = recordsFromPack(p)
  assert.equal(recs.length, 2)
  const b = recs.find((r) => r.endpoint === "x/up-b")!
  assert.deepEqual(b.serves, [{ id: "image-upscale", rank: 1, role: "model" }])
  assert.equal(b.utility, true)
  assert.equal(b.price.amount, 0.04)
})

check("a tool offers the models the database ranks for it, best first, and only on providers the person has", () => {
  const p = pack([
    { ...model("m/a", [line({ serves: "image-upscale", endpoint: "x/up-a", rank: 2 })]), category: "image", tasks: [], tools: ["image-upscale"] },
    { ...model("m/b", [line({ serves: "image-upscale", endpoint: "x/up-b", rank: 1 })]), category: "image", tasks: [], tools: ["image-upscale"] },
    { ...model("m/c", [line({ serves: "image-upscale", endpoint: "x/up-c", rank: 1, provider: "replicate" })]), category: "image", tasks: [], tools: ["image-upscale"] },
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

// ---- who a provider's endpoint is
const realMakers = JSON.parse(readFileSync("src/lib/sheet/makers.json", "utf8")) as MakerList
const idx = makerIndex(realMakers)
const ep = (provider: string, endpoint: string, name = "") => ({ provider, endpoint, name })

check("the maker comes from the names the provider uses, never from the model's family", () => {
  assert.equal(makerOf(ep("fal", "fal-ai/kling-video/v3/pro/text-to-video", "Kling Video v3"), idx).id, "kuaishou")
  assert.equal(makerOf(ep("replicate", "kwaivgi/kling-v3-video"), idx).id, "kuaishou")
  assert.equal(makerOf(ep("fal", "bytedance/seedance-2.5/us/text-to-video", "Seedance 2.5 US Text to Video"), idx).id, "bytedance")
  assert.equal(makerOf(ep("openrouter", "x-ai/grok-imagine-video-1.5"), idx).id, "xai")
  assert.equal(makerOf(ep("fal", "blackforestlabs/flux-3/text-to-image"), idx).id, "bfl")
  // Unknown: the owner itself, marked unknown
  assert.deepEqual(makerOf(ep("replicate", "lucataco/remove-bg"), idx), { id: "lucataco", known: false })
})

check("one model is one entry: its task, region and tier are not part of it, and 2.1 is 2-1", () => {
  assert.equal(modelSlugOf(ep("fal", "bytedance/seedance-2.5/us/reference-to-video")), "seedance-2-5")
  assert.equal(modelSlugOf(ep("replicate", "bytedance/seedance-2.5")), "seedance-2-5")
  assert.equal(modelSlugOf(ep("fal", "fal-ai/kling-video/v3/pro/text-to-video")), "kling-video-v3")
  assert.equal(modelSlugOf(ep("fal", "fal-ai/kling-video/v3/standard/image-to-video")), "kling-video-v3")
  assert.equal(modelSlugOf(ep("fal", "google/nano-banana-2.1/edit")), "nano-banana-2-1")
  assert.equal(nameKey(ep("fal", "fal-ai/birefnet/v2")), nameKey(ep("replicate", "men1scus/birefnet")))
})

check("open or closed comes from a real source: a weights link, the maker's own Hugging Face repository, a public repository of that name", () => {
  assert.equal(replicateWeights({ github_url: "https://github.com/xinntao/Real-ESRGAN", is_official: true }), "open")
  assert.equal(replicateWeights({ weight_links: ["https://github.com/replicate/cog-flux"], is_official: true }), "closed")
  assert.equal(replicateWeights({ weight_links: ["https://huggingface.co/datasets/x/y"], is_official: false }), undefined)
  assert.equal(publishedOnHub("alibaba/wan-2-2", ["Wan-AI/Wan2.2-T2V-A14B"]), true)
  assert.equal(publishedOnHub("bfl/flux-3", ["black-forest-labs/flux-3-image-klein"]), false)
  assert.equal(publicRepoMatches("birefnet", [{ id: "ZhengPeng7/BiRefNet", downloads: 900000 }]), true)
  assert.equal(publicRepoMatches("birefnet", [{ id: "someone/BiRefNet-lora", downloads: 3 }]), false)
})

check("a tool is read from a name made of several words (Replicate)", () => {
  assert.equal(actionOf("kwaivgi/kling-v3-motion-control", "video-to-video").action, "motion-transfer")
  assert.equal(actionOf("ryan5453/demucs", "audio-to-audio").action, "separate-audio")
  assert.equal(actionOf("playmore/resemble-denoiser", "audio-to-audio").action, "noise-reduction")
  assert.equal(actionOf("zsxkib/seedvr2", "video-to-video").action, "upscale")
  assert.equal(actionOf("bytedance/seedance-2.5", "text-to-video").action, "generate")
})

// ---- the build
const rec = (provider: string, endpoint: string, over: Partial<ModelRecord> = {}): ModelRecord => ({
  id: `${provider}/${endpoint}`, endpoint, provider, name: endpoint.split("/").pop()!, family: "f", logoKey: "f", category: "image", task: "text-to-image", inputs: ["text"],
  params: { type: "object", properties: { prompt: { type: "string" } } },
  price: { unit: "per_image", amount: 0.05, source: "api", fetchedAt: "2026-10-23" }, status: "active", updatedAt: "2026-10-01", ...over,
})
const makers: MakerList = { version: 1, makers: [{ id: "acme", name: "Acme", families: [{ name: "Pix", words: ["pix"], category: "image" }], models: [{ id: "acme/pix-2/text-to-image", name: "Pix 2", category: "image", task: "text-to-image", action: "generate", litellm: [], hosts: { fal: ["acme/pix-2"] } }] }] }

check("a family's latest versions, newest first and up to four, are its models; a model of no maker family is not", () => {
  const records = ["acme/pix-1", "acme/pix-2", "acme/pix-3", "acme/pix-4", "acme/pix-5", "other/a"].map((e) => rec("fal", e))
  const out = buildPack({ makers, tasks, tools, records, now: "2026-10-23" })
  const lines = out.models.flatMap((m) => m.lines).filter((l) => l.provider === "fal" && l.serves === "text-to-image").sort((a, b) => a.rank - b.rank)
  assert.deepEqual(lines.map((l) => l.endpoint).sort(), ["acme/pix-2", "acme/pix-3", "acme/pix-4", "acme/pix-5"])
  assert.deepEqual(out.models.map((m) => m.name).sort(), ["Pix 2", "Pix 3", "Pix 4", "Pix 5"])
  assert.ok(out.models.every((m) => m.family === "Pix"))
  assert.deepEqual(validatePack(out), [])
})

check("one version is one model on every provider whatever each calls it, and a provider with none of it is reported as not offering the task", () => {
  const records = [rec("fal", "acme/pix-3/text-to-image"), rec("replicate", "acme/pix-3.0"), rec("fal", "acme/pix-3/edit", { task: "image-to-image", inputs: ["text", "image"] })]
  const out = buildPack({ makers, tasks, tools, records, now: "2026-10-23" })
  const pix = out.models.find((m) => m.name === "Pix 3.0")!
  assert.deepEqual([...new Set(pix.lines.map((l) => l.provider))].sort(), ["fal", "replicate"])
  assert.ok(out.gaps.some((g) => g.field === "grid" && g.provider === "openrouter" && g.modelId === "text-to-image" && !g.blocking))
})

check("an estimate is not a price: the line is left out and the gap says why", () => {
  const records = [rec("fal", "acme/pix-2", { price: { unit: "per_image", amount: 0.05, source: "estimate", fetchedAt: "2026-10-23" } }), rec("fal", "acme/pix-1")]
  const out = buildPack({ makers, tasks, tools, records, now: "2026-10-23" })
  assert.ok(out.gaps.some((g) => g.field === "price" && g.reason.includes("acme/pix-2")))
  assert.ok(!out.models.flatMap((m) => m.lines).some((l) => l.endpoint === "acme/pix-2"))
  assert.ok(out.models.flatMap((m) => m.lines).some((l) => l.endpoint === "acme/pix-1"))
  assert.deepEqual(validatePack(out), [])
})

check("a price from a page or the LiteLLM file is taken when the list has none, and says where it came from", () => {
  const records = [rec("fal", "acme/pix-2", { price: { unit: "unknown", amount: null, source: "api", fetchedAt: "" } })]
  const page = new Map([["fal|acme/pix-2", { unit: "per_image" as const, amount: 0.07, source: "scraped" as const, fetchedAt: "2026-10-22" }]])
  const out = buildPack({ makers, tasks, tools, records, pagePrices: page, now: "2026-10-23" })
  const l = out.models[0]!.lines[0]!
  assert.equal(l.price.amount, 0.07)
  assert.equal(l.price.from, "page")
})

check("a model that bills on the maker's own key, with no price of its own, is left out", () => {
  const records = [rec("replicate", "openai/gpt-image-x", { price: { unit: "unknown", amount: null, source: "api", fetchedAt: "" }, description: "You need to bring your own verified OpenAI key to use this model." })]
  const list: MakerList = { version: 1, makers: [{ id: "openai", name: "OpenAI", families: [{ name: "GPT Image", words: ["gpt-image"], category: "image" }], models: [{ id: "openai/gpt-image-x/text-to-image", name: "GPT Image X", category: "image", task: "text-to-image", action: "generate", litellm: [], hosts: { replicate: ["openai/gpt-image-x"] } }] }] }
  const out = buildPack({ makers: list, tasks, tools, records, now: "2026-10-23" })
  assert.equal(out.models.length, 0)
  assert.ok(out.gaps.some((g) => g.field === "price"))
})

check("pro and standard of one version are one model, with the quality as a tier; a variant is a model of its own", () => {
  const records = [rec("fal", "acme/pix-3/pro"), rec("fal", "acme/pix-3/standard"), rec("fal", "acme/pix-3/turbo")]
  const out = buildPack({ makers, tasks, tools, records, now: "2026-10-23" })
  const pix = out.models.find((m) => m.name === "Pix 3")!
  assert.deepEqual(pix.lines.map((l) => l.tier).sort(), ["pro", "standard"])
  assert.ok(out.models.some((m) => m.name === "Pix 3 Turbo"))
})

check("a price from the database drives the estimate: tiers by setting, and no price gives no number", () => {
  const tiered = pack([{ ...model("m/v", [line({ serves: "text-to-video", endpoint: "x/v", price: { unit: "per_second", amount: 0.08, rules: [{ when: { resolution: "480p" }, amount: 0.08 }, { when: { resolution: "720p" }, amount: 0.14 }], from: "page", readOn: "2026-10-23" } })]), category: "video", tasks: ["text-to-video"], tools: [] }])
  const [r] = recordsFromPack(tiered)
  assert.ok(Math.abs((estimateRun(r!, { resolution: "720p", duration: 5 }).usd ?? 0) - 0.7) < 1e-9)
  assert.ok(Math.abs((estimateRun(r!, { resolution: "480p", duration: 5 }).usd ?? 0) - 0.4) < 1e-9)
  const none = pack([{ ...model("m/n", [line({ endpoint: "x/n", price: { unit: "unknown", amount: null, from: "api", readOn: "2026-10-23" } })]) }])
  const [u] = recordsFromPack(none)
  assert.equal(estimateRun(u!, {}).usd, null)
})

check("a tool no real model does on a provider is done by its best edit model, told what to do; a tool an editor cannot do stays empty", () => {
  const editor = (endpoint: string, updatedAt: string) => rec("openai", endpoint, { task: "image-to-image", inputs: ["text", "image"], params: { type: "object", properties: { prompt: { type: "string" }, image: { type: "string", format: "image" } } }, updatedAt })
  const records = [editor("e/new", "2026-10-02"), editor("e/old", "2026-09-01"), rec("openai", "plain/generator", { task: "text-to-image" })]
  const out = buildPack({ makers, tasks, tools, records, now: "2026-10-23" })
  const lines = out.models.flatMap((m) => m.lines).filter((l) => l.provider === "openai" && l.serves === "image-restyle").sort((a, b) => a.rank - b.rank)
  assert.deepEqual(lines.map((l) => [l.endpoint, l.role]), [["e/new", "alternative"]])
  // splitting a song into stems is not something a picture editor can be told to do
  const none = out.models.flatMap((m) => m.lines).filter((l) => l.serves === "audio-stems")
  assert.equal(none.length, 0)
})

check("an alternative is told what to do, and a real tool model gets the person's words as they are", () => {
  const spec = { id: "image-restyle", instruction: "Redraw this picture in this style, keeping the same layout: {prompt}" }
  const rec = (serves: ModelRecord["serves"]) => ({ id: "p/x", endpoint: "x/edit", provider: "p", name: "x", family: "x", logoKey: "p", category: "image", inputs: ["text", "image"], params: { type: "object", properties: {} }, price: { unit: "per_run", amount: 0.1, source: "api", fetchedAt: "" }, status: "active", serves }) as ModelRecord
  const alt = rec([{ id: "image-restyle", rank: 3, role: "alternative" }])
  const real = rec([{ id: "image-restyle", rank: 1, role: "model" }])
  assert.equal(promptFor(spec, alt, "oil painting"), "Redraw this picture in this style, keeping the same layout: oil painting")
  assert.equal(promptFor(spec, real, "oil painting"), "oil painting")
  const relight = { id: "image-relight", instruction: "Change only the lighting of this picture: {prompt}. Keep everything else." }
  assert.equal(promptFor(relight, rec([{ id: "image-relight", rank: 2, role: "alternative" }]), ""), "Change only the lighting of this picture. Keep everything else.")
})

check("every tool a picture model can do by instruction has a sentence in the tool catalog", () => {
  // No list decides it: every job an editor stands in for in the database is one whose card carries the sentence
  for (const m of (packJson as unknown as KnowledgePack).models) for (const l of m.lines) if (l.role === "alternative") assert.ok(toolById(l.serves)?.instruction, `${l.serves} has no instruction`)
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
  assert.equal(r.category, "video")
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

check("a version no longer in use (over eighteen months old) is left out of its family", () => {
  const records = [rec("fal", "acme/pix-3"), rec("fal", "acme/pix-2", { updatedAt: "2024-01-01" })]
  const out = buildPack({ makers, tasks, tools, records, now: "2026-10-23" })
  assert.deepEqual(out.models.map((m) => m.name), ["Pix 3"])
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

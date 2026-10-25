import assert from "node:assert/strict"
import packJson from "../src/lib/knowledge/pack.json" with { type: "json" }
import { recordsFromPack } from "../src/lib/knowledge/pack-to-registry.ts"
import type { KnowledgePack } from "../src/lib/knowledge/schema.ts"
import { CATALOG, toolById } from "../src/lib/ai-tools/catalog.ts"
import { cutToolsFor, featured, statusOf, toolsFor, type MatchContext } from "../src/lib/ai-tools/match.ts"
import { choicesFor, keyFor, optionsFor, paramsFor, priceOf } from "../src/lib/ai-tools/run.ts"
import type { ModelRecord } from "../src/lib/registry/types.ts"

// The tool models are the ones the standard database holds: nothing is listed by hand
const utility = recordsFromPack(packJson as unknown as KnowledgePack).filter((r) => r.utility)
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

const ctx = (over: Partial<MatchContext> = {}): MatchContext => ({ records: utility, listed: [], keyed: new Set(["fal"]), runnable: () => true, ...over })
const audioRecord = (endpoint: string, task: string): ModelRecord => ({ id: `fal/${endpoint}`, endpoint, provider: "fal", name: endpoint, family: endpoint, logoKey: "fal", modality: "audio", inputs: ["text"], params: { type: "object", properties: {} }, price: { unit: "per_run", amount: 0.1, source: "api", fetchedAt: "" }, status: "active", task })

check("every tool has a unique id, and every model tool says how it is done", () => {
  const ids = CATALOG.map((t) => t.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const t of CATALOG) {
    if (t.kind === "model") assert.ok(t.output && t.group, `${t.id} has no way to run`)
    if (t.kind === "cut") assert.ok(t.automation, `${t.id} has no job text`)
  }
})

/** The pack's own models for a tool, best first (what the app offers) */
const modelsOf = (id: string) => utility.filter((r) => r.jobs?.some((j) => j.id === id)).sort((x, y) => (x.jobs!.find((j) => j.id === id)!.rank) - (y.jobs!.find((j) => j.id === id)!.rank))

check("every tool the database has models for lists them with real parameters, and the options are settings they have", () => {
  let tools = 0
  for (const t of CATALOG) {
    if (t.kind !== "model" || t.viaEditAction || t.viaAudioTask) continue
    const models = modelsOf(t.id)
    if (models.length === 0) continue
    tools++
    for (const m of models) assert.ok(Object.keys(m.params.properties).length > 0, `${m.id} has no parameters`)
    for (const o of t.options ?? []) {
      // an option a tool offers must exist on at least one of its models, or the form would show a dead control
      const has = models.some((m) => o.keys.some((k) => m.params.properties[k]))
      if (!has) console.log(`      note: ${t.id}: none of its ${models.length} models has any of ${o.keys.join(", ")} (the form hides it)`)
    }
  }
  assert.ok(tools >= 12, `only ${tools} tools have models in the database`)
})

check("with a fal key, video tools are ready; without one they say what to add", () => {
  const keyed = toolsFor({ kind: "video", surface: "edit" }, ctx())
  assert.equal(keyed.find((o) => o.spec.id === "video-remove-background")?.status.state, "ready")
  assert.ok(keyed.find((o) => o.spec.id === "video-upscale")!.candidates.length >= 3)
  const bare = toolsFor({ kind: "video", surface: "edit" }, ctx({ keyed: new Set() }))
  const st = bare.find((o) => o.spec.id === "video-remove-background")!.status
  assert.equal(st.state, "needs-model")
  assert.match("reason" in st ? st.reason : "", /key/)
  assert.equal(st.state === "needs-model" && st.missing, "key")
})

check("Story/Edit shows no picture tools; Create and Library do", () => {
  assert.equal(toolsFor({ kind: "image", surface: "edit" }, ctx()).length, 0)
  const create = toolsFor({ kind: "image", surface: "create" }, ctx())
  assert.ok(create.some((o) => o.spec.id === "image-remove-background" && o.status.state === "ready"))
  assert.ok(toolsFor({ kind: "image", surface: "library" }, ctx()).length === create.length)
})

check("cut tools belong to Story/Edit and the agent only, and need no model", () => {
  const edit = cutToolsFor("edit")
  assert.ok(edit.length >= 8 && edit.every((o) => o.status.state === "ready"))
  assert.equal(cutToolsFor("create").length, 0)
  assert.equal(cutToolsFor("library").length, 0)
  assert.ok(cutToolsFor("agent").length > 0)
  assert.equal(toolsFor({ kind: "video", surface: "edit" }, ctx()).some((o) => o.spec.kind === "cut"), false)
})

check("text to speech, music and sound effects come from the audio models the person switched on, by task", () => {
  const listed = [audioRecord("elevenlabs/tts/eleven-v4", "text-to-speech"), audioRecord("elevenlabs/music/v2.5", "text-to-audio"), audioRecord("fal-ai/elevenlabs/sound-effects/v2", "text-to-audio")]
  const offers = toolsFor({ kind: "audio", surface: "create" }, ctx({ listed }))
  assert.equal(offers.find((o) => o.spec.id === "audio-text-to-speech")?.candidates[0]?.endpoint, "elevenlabs/tts/eleven-v4")
  assert.equal(offers.find((o) => o.spec.id === "audio-text-to-music")?.candidates[0]?.endpoint, "elevenlabs/music/v2.5")
  assert.equal(offers.find((o) => o.spec.id === "audio-text-to-sfx")?.candidates[0]?.endpoint, "fal-ai/elevenlabs/sound-effects/v2")
  const none = toolsFor({ kind: "audio", surface: "create" }, ctx({ listed: [] }))
  assert.equal(none.find((o) => o.spec.id === "audio-text-to-speech")?.status.state, "needs-model")
})

check("the database's best model comes first, and a model the app cannot run is left out", () => {
  const spec = toolById("video-upscale")!
  const best = modelsOf("video-upscale")[0]!
  const first = statusOf(spec, ctx({ keyed: new Set([best.provider]) }))
  assert.equal(first.candidates[0]?.id, best.id)
  const without = statusOf(spec, ctx({ keyed: new Set([best.provider]), records: utility.filter((r) => r.id !== best.id) }))
  assert.notEqual(without.candidates[0]?.id, best.id)
  const cannot = statusOf(spec, ctx({ runnable: () => false }))
  assert.equal(cannot.status.state, "needs-model")
})

check("featured tools for the task row are ready ones in their order", () => {
  const offers = [...cutToolsFor("edit"), ...toolsFor({ kind: "video", surface: "edit" }, ctx()), ...toolsFor({ kind: "audio", surface: "edit" }, ctx())]
  const row = featured(offers).map((o) => o.spec.id)
  assert.ok(row.length >= 4, row.join())
  assert.deepEqual(row, [...row].sort((a, b) => (toolById(a)!.featured ?? 0) - (toolById(b)!.featured ?? 0)))
})

const rec = (endpoint: string) => utility.find((r) => r.endpoint === endpoint)!

check("options go to the name each model uses, and settings a model does not have are left out", () => {
  const up = toolById("video-upscale")!
  assert.equal(paramsFor(up, rec("topaz/upscale/video/generative"), { factor: 4 }).params.upscale_factor, 4)
  assert.equal(paramsFor(up, rec("fal-ai/flashvsr/upscale/video"), { factor: 4 }).params.upscale_factor, 4)
  const slow = toolById("video-slow-motion")!
  const t = paramsFor(slow, rec("topaz/interpolate/video"), { multiplier: 2, fps: 60 }).params
  assert.equal(t.slowdown_factor, 2)
  assert.equal(t.target_fps, 60)
  // a model with no frame multiplier simply does not get one
  assert.equal(keyFor(slow.options![0]!, rec("fal-ai/rife/video")), undefined)
})

check("a choice the model does not list is not sent, and a required setting is never left empty", () => {
  const reframe = toolById("video-reframe")!
  const luma = rec("luma/agent/ray/v3.2/reframe")
  const out = paramsFor(reframe, luma, { aspect: "4:5" })
  assert.deepEqual(out.skipped, ["Shape"], "4:5 is not on this model's list")
  assert.ok(luma.params.properties.aspect_ratio!.enum!.map(String).includes(String(out.params.aspect_ratio)), "a valid shape is filled in")
  assert.ok(!choicesFor(reframe.options![0]!, luma).some((c) => c.value === "4:5"))
  assert.ok(choicesFor(reframe.options![0]!, rec("fal-ai/ltx-2.3/reframe")).some((c) => c.value === "4:5"))
})

check("a language list is the model's own, and a language is always chosen", () => {
  const dub = toolById("video-dub")!
  const lang = dub.options![0]!
  const model: ModelRecord = { ...audioRecord("someone/dub", "dubbing"), modality: "video", params: { type: "object", properties: { output_language: { type: "string", enum: ["Spanish", "French", "German"] } as never } } }
  const choices = choicesFor(lang, model).map((c) => c.value)
  assert.deepEqual(choices, ["Spanish", "French", "German"])
  assert.equal(paramsFor(dub, model, {}).params.output_language, "Spanish")
  assert.equal(paramsFor(dub, model, { language: "French" }).params.output_language, "French")
})

check("the form shows only the options a model has", () => {
  const up = toolById("video-upscale")!
  assert.equal(optionsFor(up, rec("fal-ai/seedvr/upscale/video")).length, 1)
  assert.equal(optionsFor(toolById("video-remove-background")!, rec("bria/video/background-removal/v3")).length, 0)
})

check("the price follows the length of the clip", () => {
  const bria = rec("bria/video/background-removal/v3")
  const one = priceOf(bria, {}, { url: "x", kind: "video", name: "a", seconds: 10 })
  assert.ok(one !== null && Math.abs(one - 0.5) < 0.01, `expected about 0.50, got ${one}`)
  const two = priceOf(bria, {}, { url: "x", kind: "video", name: "a", seconds: 20 })
  assert.ok(two !== null && Math.abs(two - 1.0) < 0.01)
})

check("a model from another provider is found by what it does, and only when its provider has a key", () => {
  const replicateRec = (endpoint: string, description: string): ModelRecord => ({
    id: `replicate/${endpoint}`, endpoint, provider: "replicate", name: endpoint, family: endpoint, logoKey: "replicate", modality: "video",
    inputs: ["video"], description, params: { type: "object", properties: { video: { type: "string", format: "video" } as never } }, price: { unit: "per_run", amount: 0.05, source: "api", fetchedAt: "" }, status: "active",
  })
  const rembg = replicateRec("someone/video-background-remover", "Removes the background from a video")
  const textToVideo: ModelRecord = { ...replicateRec("someone/cool-video", "Makes video from text"), inputs: ["text"], params: { type: "object", properties: {} } }
  const withRep = ctx({ records: [rembg, textToVideo], keyed: new Set(["replicate"]) })
  const offer = toolsFor({ kind: "video", surface: "edit" }, withRep).find((o) => o.spec.id === "video-remove-background")!
  assert.equal(offer.status.state, "ready")
  assert.equal(offer.candidates[0]?.endpoint, "someone/video-background-remover")
  assert.ok(!offer.candidates.some((c) => c.endpoint === "someone/cool-video"))
  // keys but no model that does it: says model, not key
  const none = toolsFor({ kind: "video", surface: "edit" }, ctx({ records: [], keyed: new Set(["replicate"]) })).find((o) => o.spec.id === "video-colorize")!
  assert.equal(none.status.state === "needs-model" && none.status.missing, "model")
})

console.log(`\n${passed} passed`)
if (process.exitCode) console.log("some failed")
else console.log("all passed")

import assert from "node:assert/strict"
import { computeDefaultEnabled } from "../src/lib/registry/enabled.ts"
import { hasRole, packRankOf, pickByTier, rolesOf } from "../src/lib/registry/roles.ts"
import { groupModelFor, groupModelForTool, resolveGroups, tierOfGroup } from "../src/lib/registry/groups.ts"
import type { ModelRecord } from "../src/lib/registry/types.ts"
import { isToolCollection, recordFromReplicate } from "../src/lib/registry/adapters/replicate.ts"
import { statusOf } from "../src/lib/ai-tools/match.ts"
import { toolById } from "../src/lib/ai-tools/catalog.ts"

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

const rec = (id: string, over: Partial<ModelRecord>): ModelRecord => ({
  id: `p/${id}`, endpoint: id, provider: "p", name: id, family: id, logoKey: "p", modality: "image", inputs: ["text"], params: { type: "object", properties: {} },
  price: { unit: "per_run", amount: 0.05, source: "api", fetchedAt: "" }, status: "active", ...over,
})
const withFile = (kind: "image" | "video" | "audio") => ({ type: "object" as const, properties: { f: { type: "string", format: kind } as never } })

check("the standard database's own models come first: its rank beats featured, and a backup does not count as its own", () => {
  const plain = rec("plain", { task: "text-to-image", featured: true })
  const mine = rec("mine", { task: "text-to-image", jobs: [{ id: "text-to-image", rank: 1, role: "model" }] })
  const backup = rec("backup", { task: "text-to-image", jobs: [{ id: "text-to-image", rank: 1, role: "substitute" }] })
  assert.equal(packRankOf(mine), 1)
  assert.equal(packRankOf(backup), undefined)
  assert.equal(pickByTier([plain, mine], "high")?.endpoint, "mine")
  assert.equal(pickByTier([plain, backup], "high")?.endpoint, "plain")
})

check("the default model for a kind of output is the database's first choice on that provider", () => {
  const a = rec("a", { task: "text-to-image" })
  const b = rec("b", { task: "text-to-image", jobs: [{ id: "text-to-image", rank: 1, role: "model" }] })
  const ids = computeDefaultEnabled([a, b])
  assert.equal(ids.filter((i) => i === b.id).length, 1)
  assert.equal(ids[0], b.id)
})

check("a picture model that only takes a prompt is Image; one that takes a picture is Image edit", () => {
  assert.deepEqual(rolesOf(rec("gen", { task: "text-to-image" })), ["image"])
  assert.deepEqual(rolesOf(rec("edit", { task: "image-to-image", inputs: ["text", "image"], params: withFile("image") })), ["image-edit"])
  // both in one: a generator that also takes reference pictures
  assert.deepEqual(rolesOf(rec("both", { task: "text-to-image", inputs: ["text", "image"], params: withFile("image") })), ["image", "image-edit"])
})

check("video models: making is Video, taking a video file is Video edit", () => {
  assert.deepEqual(rolesOf(rec("t2v", { modality: "video", task: "text-to-video" })), ["video"])
  assert.deepEqual(rolesOf(rec("v2v", { modality: "video", task: "video-to-video", inputs: ["text", "video"], params: withFile("video") })), ["video-edit"])
})

check("speech, music and speech to text come from the task and the file taken", () => {
  assert.deepEqual(rolesOf(rec("tts", { modality: "audio", task: "text-to-speech" })), ["speech"])
  assert.deepEqual(rolesOf(rec("mus", { modality: "audio", task: "text-to-audio" })), ["music"])
  assert.deepEqual(rolesOf(rec("chat", { modality: "text", inputs: ["text", "audio"] })), ["text", "stt"])
  assert.deepEqual(rolesOf(rec("chat2", { modality: "text" })), ["text"])
})

check("a retired model has no role", () => {
  assert.deepEqual(rolesOf(rec("old", { task: "text-to-image", status: "deprecated" })), [])
  assert.equal(hasRole(rec("x", { task: "text-to-image" }), "image"), true)
})

const cheap = rec("cheap", { price: { unit: "per_run", amount: 0.01, source: "api", fetchedAt: "" } })
const mid = rec("mid", { price: { unit: "per_run", amount: 0.05, source: "api", fetchedAt: "" } })
const dear = rec("dear", { price: { unit: "per_run", amount: 0.5, source: "api", fetchedAt: "" }, featured: true })

check("Low is the cheapest, High the best, Medium the middle one", () => {
  const all = [dear, cheap, mid]
  assert.equal(pickByTier(all, "low")?.endpoint, "cheap")
  assert.equal(pickByTier(all, "high")?.endpoint, "dear")
  assert.equal(pickByTier(all, "medium")?.endpoint, "mid")
  assert.equal(pickByTier([], "low"), undefined)
})

check("a bookmarked model wins a tie in price", () => {
  const twin = rec("twin", { price: { unit: "per_run", amount: 0.01, source: "api", fetchedAt: "" } })
  assert.equal(pickByTier([cheap, twin], "low", new Set([twin.id]))?.endpoint, "twin")
})

check("a role the person did not set follows the level; one set by hand keeps their model", () => {
  const listed = [rec("g1", { task: "text-to-image", price: { unit: "per_run", amount: 0.01, source: "api", fetchedAt: "" } }), rec("g2", { task: "text-to-image", price: { unit: "per_run", amount: 0.4, source: "api", fetchedAt: "" }, featured: true })]
  const edits = [
    rec("e1", { task: "image-to-image", inputs: ["image"], params: withFile("image"), price: { unit: "per_run", amount: 0.02, source: "api", fetchedAt: "" } }),
    rec("e2", { task: "image-to-image", inputs: ["image"], params: withFile("image"), price: { unit: "per_run", amount: 0.3, source: "api", fetchedAt: "" }, featured: true }),
  ]
  const all = [...listed, ...edits]
  const groups = resolveGroups(undefined, all)
  const low = groups.find((g) => g.id === "low")!
  const high = groups.find((g) => g.id === "high")!
  assert.equal(tierOfGroup(low), "low")
  assert.equal(groupModelFor(low, "image-edit", all)?.endpoint, "e1")
  assert.equal(groupModelFor(high, "image-edit", all)?.endpoint, "e2")
  assert.equal(groupModelFor({ ...low, extra: { "image-edit": edits[1]!.id } }, "image-edit", all)?.endpoint, "e2")
  // a tool follows the level too, and a hand choice that is no longer there falls back to the level
  assert.equal(groupModelForTool(low, "video-upscale", edits)?.endpoint, "e1")
  assert.equal(groupModelForTool({ ...high, tools: { "video-upscale": "gone" } }, "video-upscale", edits)?.endpoint, "e2")
  // new models count straight away: nothing to assign
  const later = [...all, rec("e0", { task: "image-to-image", inputs: ["image"], params: withFile("image"), price: { unit: "per_run", amount: 0.001, source: "api", fetchedAt: "" } })]
  assert.equal(groupModelFor(resolveGroups(undefined, later).find((g) => g.id === "low"), "image-edit", later)?.endpoint, "e0")
})

check("no model for a role gives nothing, so the page can say so", () => {
  assert.equal(groupModelFor(resolveGroups(undefined, []).find((g) => g.id === "medium"), "speech", []), undefined)
})

check("Replicate tool collections are read, and each model's own input decides what it works on", () => {
  assert.ok(isToolCollection("super-resolution") && isToolCollection("remove-backgrounds") && isToolCollection("video-editing"))
  assert.ok(!isToolCollection("text-to-image") && !isToolCollection("official"))
  const detail = (name: string, input: Record<string, unknown>) =>
    ({ owner: "acme", name, description: "Removes the background from a video", latest_version: { id: "v1", openapi_schema: { components: { schemas: { Input: { type: "object", properties: input }, Output: { type: "string", format: "uri" } } } } } }) as never
  const video = recordFromReplicate(detail("video-background-remover", { video: { type: "string", format: "uri" } }), { modality: "image", task: "tool" }, "")
  assert.ok(video)
  assert.equal(video!.modality, "video")
  assert.equal(video!.utility, true)
  assert.deepEqual(rolesOf(video!), [], "a tool model is never offered to make something with")
  const sound = recordFromReplicate(detail("splitter", { audio: { type: "string", format: "uri" } }), { modality: "image", task: "tool" }, "")
  assert.equal(sound!.modality, "audio")
  const none = recordFromReplicate(detail("nothing", { prompt: { type: "string" } }), { modality: "image", task: "tool" }, "")
  assert.equal(none, null)
  // and the tool matcher finds it with a Replicate key only
  const offer = statusOf(toolById("video-remove-background")!, { records: [video!], listed: [], keyed: new Set(["replicate"]), runnable: () => true })
  assert.equal(offer.status.state, "ready")
  assert.equal(offer.candidates[0]?.endpoint, "acme/video-background-remover")
})

console.log(`\n${passed} passed`)
if (!process.exitCode) console.log("all passed")

import assert from "node:assert/strict"
import packJson from "../src/lib/knowledge/pack.json" with { type: "json" }
import { recordsFromPack } from "../src/lib/knowledge/pack-to-registry.ts"
import type { KnowledgePack } from "../src/lib/knowledge/schema.ts"
import { capabilityOf, capabilityOfExact, standardChips } from "../src/lib/capability/index.ts"
import { modelsFor, type Want } from "../src/lib/capability/match.ts"
import type { ModelRecord } from "../src/lib/registry/types.ts"

// The models the standard database holds: the rule is checked on real data, nothing listed by hand
const pool = recordsFromPack(packJson as unknown as KnowledgePack)
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

const on = (provider: string) => ({ keyed: new Set([provider]) })
const named = (list: ModelRecord[], word: RegExp) => list.some((r) => word.test(r.name))
const removeObject: Want = { gives: "image", given: [{ kind: "image", role: "source" }], does: "remove-object", viaEdit: true }

check("a picture model takes no clips or sounds", () => {
  for (const r of pool.filter((x) => x.category === "image")) assert.ok(!capabilityOfExact(r).takes.some((t) => t.kind !== "image"), r.id)
})

check("picture editors show for Remove object on every provider, and a fixed remover comes before them", () => {
  for (const p of ["fal", "replicate", "openrouter"]) {
    const list = modelsFor(removeObject, pool, on(p))
    assert.ok(list.length >= 3, `${p}: ${list.length}`)
    assert.ok(named(list, /Nano Banana|GPT Image|Seedream|FLUX|Qwen/), `${p}: no picture editor`)
  }
  const rep = modelsFor(removeObject, pool, on("replicate"))
  const fixed = rep.findIndex((r) => capabilityOfExact(r).dedicated.includes("remove-object"))
  const editor = rep.findIndex((r) => !capabilityOfExact(r).dedicated.length)
  if (fixed >= 0 && editor >= 0) assert.ok(fixed < editor, "a fixed remover is listed after an editor")
})

check("a model that only makes pictures from words is not an editor", () => {
  for (const r of modelsFor(removeObject, pool, {})) assert.ok(capabilityOfExact(r).takes.some((t) => t.kind === "image"), r.id)
})

check("a clip model is never offered for a picture job, and a picture model never for a clip job", () => {
  assert.ok(modelsFor(removeObject, pool, {}).every((r) => r.category === "image"))
  assert.ok(modelsFor({ gives: "video", given: [{ kind: "video", role: "source" }], does: "edit" }, pool, {}).every((r) => r.category === "video"))
})

check("a fixed job (upscale) is not a general editor", () => {
  const ups = pool.filter((r) => capabilityOfExact(r).dedicated.includes("upscale"))
  assert.ok(ups.length > 0)
  for (const r of ups) assert.ok(!capabilityOfExact(r).does.includes("edit"), r.id)
})

check("video edit finds clip editors, and a clip that is only copied from (reference) does not make a model an editor", () => {
  const list = modelsFor({ gives: "video", given: [{ kind: "video", role: "source" }], does: "edit" }, pool, {})
  assert.ok(list.length >= 3, `${list.length}`)
  for (const r of list) assert.ok(capabilityOf(r, pool).does.includes("edit"), r.id)
})

check("lip-sync needs a clip and a voice", () => {
  const want: Want = { gives: "video", given: [{ kind: "video", role: "source" }, { kind: "audio" }], does: "lip-sync" }
  const list = modelsFor(want, pool, {})
  assert.ok(list.length > 0)
  for (const r of list) assert.ok(capabilityOfExact(r).takes.some((t) => t.kind === "audio"), r.id)
})

check("a start frame is honoured: image-to-video models take one", () => {
  const list = modelsFor({ gives: "video", given: [{ kind: "image", role: "start" }], does: "make" }, pool, {})
  assert.ok(list.length > 3)
  for (const r of list) assert.ok(capabilityOfExact(r).takes.some((t) => t.role === "start"), r.id)
})

check("one endpoint per model per provider unless every endpoint is asked for", () => {
  const list = modelsFor({ gives: "image", does: "make" }, pool, {})
  const keys = list.map((r) => `${r.provider}|${r.versionId ?? r.id}`)
  assert.equal(new Set(keys).size, keys.length)
})

check("keys and bookmarks: only keyed providers, bookmarked first", () => {
  const list = modelsFor(removeObject, pool, on("fal"))
  assert.ok(list.every((r) => r.provider === "fal"))
  const last = list[list.length - 1]!
  assert.equal(modelsFor(removeObject, pool, { ...on("fal"), bookmarks: new Set([last.id]) })[0]!.id, last.id)
})

check("people see only the standard chips", () => {
  const allowed = new Set(["Create", "Edit", "Start frame", "End frame", "References", "Video in", "Audio in", "With audio", "Vision", "Web search", "Reasoning", "Works with Agent"])
  for (const r of pool) for (const c of standardChips(capabilityOf(r, pool))) assert.ok(allowed.has(c), c)
})

console.log(`\n${passed} passed`)

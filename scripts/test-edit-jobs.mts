import assert from "node:assert/strict"
import packJson from "../src/lib/knowledge/pack.json" with { type: "json" }
import { recordsFromPack } from "../src/lib/knowledge/pack-to-registry.ts"
import type { KnowledgePack } from "../src/lib/knowledge/schema.ts"
import { modelsForJob, statusOf, type MatchContext } from "../src/lib/ai-tools/match.ts"
import { toolById } from "../src/lib/ai-tools/catalog.ts"
import { paramsFor } from "../src/lib/ai-tools/run.ts"
import { capabilityOfExact, verbOfJob } from "../src/lib/capability/index.ts"
import { assignRefs, refCapability } from "../src/lib/registry/slots.ts"
import { settingWords } from "../src/lib/registry/setting-words.ts"
import { arrange, rankBest } from "../src/lib/registry/ranking.ts"
import type { ModelRecord } from "../src/lib/registry/types.ts"

/**
 * The picture edit jobs: every model made for one gets its picture, its mask and its own settings, as its schema says. Nothing here runs a
 * model or touches the network.
 */

const all = recordsFromPack(packJson as unknown as KnowledgePack)
const find = (id: string): ModelRecord => {
  const r = all.find((x) => x.id === id)
  assert.ok(r, `${id} is not in the standard database`)
  return r
}
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

check("a model that names its picture field in its own way (no role in its schema) still gets the picture", () => {
  const odd = { params: { type: "object", properties: { subject_image: { type: "string", format: "image" }, light_source: { type: "string" } }, required: ["subject_image"] } } as unknown as ModelRecord
  const cap = refCapability(odd)
  assert.equal(cap.images?.key, "subject_image")
  assert.equal(assignRefs(cap, { images: ["data:image/png;base64,AAAA"] }).input.subject_image, "data:image/png;base64,AAAA")
})

check("an editor with a required picture field and a list of references: the source goes in the required field, the extras in the list", () => {
  const cap = refCapability(find("fal/ideogram/v4.5/edit"))
  assert.equal(cap.single?.key, "image_url")
  assert.equal(cap.images?.list, true)
  const out = assignRefs(cap, { images: ["source", "ref-1"], mask: "the-mask" })
  assert.equal(out.input.image_url, "source")
  assert.deepEqual(out.input[cap.images!.key], ["ref-1"])
  assert.equal(out.input.mask_url, "the-mask")
})

check("with only the source, the list is left out and the required field is filled", () => {
  const cap = refCapability(find("fal/ideogram/v4.5/edit"))
  const out = assignRefs(cap, { images: ["source"] })
  assert.equal(out.input.image_url, "source")
  assert.equal(cap.images && out.input[cap.images.key], undefined)
})

check("a mask field is a kind of file a model takes, and a model made to erase takes one", () => {
  for (const id of ["fal/ideogram/v4.5/edit", "replicate/bria/eraser", "fal/fal-ai/ideogram/object-removal"]) {
    const takes = capabilityOfExact(find(id)).takes
    assert.ok(takes.some((t) => t.role === "mask"), `${id} has no mask field`)
  }
})

check("a mask never counts as a second source picture", () => {
  const takes = capabilityOfExact(find("replicate/bria/eraser")).takes
  assert.equal(takes.filter((t) => t.kind === "image" && t.role !== "mask").length, 1)
})

const ctx = (): MatchContext => ({ records: all.filter((r) => r.utility), listed: all, keyed: new Set(["fal", "replicate"]), runnable: () => true })
const mask = [{ kind: "image" as const, label: "Area to change", role: "mask" as const, required: true }]

check("a job that needs a mask lists only models that have a mask field", () => {
  const spec = { ...toolById("image-remove-object")!, needs: mask }
  const { candidates } = statusOf(spec, ctx())
  assert.ok(candidates.length > 0, "no model takes a mask")
  for (const r of candidates) assert.ok(capabilityOfExact(r).takes.some((t) => t.role === "mask"), `${r.id} has no mask field`)
})

check("a job with no mask still lists the models made for it", () => {
  const { candidates } = statusOf(toolById("image-remove-object")!, ctx())
  assert.ok(candidates.length > 0)
})

check("relight and restyle models made for the job get the enums they require, never an empty one", () => {
  const relight = find("fal/bria/fibo-edit/relight")
  const { params } = paramsFor(toolById("image-relight")!, relight)
  assert.ok(relight.params.properties.light_direction!.enum!.map(String).includes(String(params.light_direction)))
  const restyle = find("fal/bria/fibo-edit/restyle")
  assert.ok(restyle.params.properties.style!.enum!.map(String).includes(String(paramsFor(toolById("image-restyle")!, restyle).params.style)))
})

check("upscale scale reaches the model under its own name, and only when it has one", () => {
  const spec = toolById("image-upscale")!
  const topaz = find("fal/topaz/upscale/image/precision")
  assert.equal(paramsFor(spec, topaz, { factor: 4 }).params.upscale_factor, 4)
})

const linesOf = (provider: string, job: string) => all.filter((r) => r.provider === provider && r.serves?.some((x) => x.id === job && x.role !== "alternative"))

import makerList from "../src/lib/sheet/makers.json" with { type: "json" }
import { makerIndex, makerOf, officialMakerOf } from "../src/lib/knowledge/identity.ts"
import type { MakerList } from "../src/lib/sheet/types.ts"

const makers = makerIndex(makerList as unknown as MakerList)
const TOOL_JOBS = ["image-upscale", "image-remove-background", "image-relight", "image-restyle", "image-outpaint", "image-remove-object", "video-upscale"]

check("a tool lists only a verified maker's own models, never a community upload (on Replicate the account must be the maker's)", () => {
  const bad: string[] = []
  for (const r of all) for (const sv of r.serves ?? []) {
    if (!TOOL_JOBS.includes(sv.id) || sv.role === "alternative") continue
    if (!officialMakerOf(r, makers)) bad.push(`${r.id}: not the maker's own endpoint`)
  }
  assert.deepEqual(bad, [])
})

check("a community copy of a maker's model has no maker, whatever it is called", () => {
  const copy = { provider: "replicate", endpoint: "lucataco/stable-diffusion-x4-upscaler", name: "Stable Diffusion x4 Upscaler" }
  assert.equal(officialMakerOf(copy, makers), undefined)
  const own = { provider: "replicate", endpoint: "topazlabs/image-upscale", name: "Image Upscale" }
  assert.equal(officialMakerOf(own, makers)?.id, "topaz")
  const person = { provider: "replicate", endpoint: "philz1337x/clarity-upscaler", name: "Clarity Upscaler" }
  assert.equal(officialMakerOf(person, makers), undefined)
})

check("a tool keeps at most five makers on a provider, and at most five models of each maker", () => {
  for (const provider of ["fal", "replicate", "openrouter"]) for (const job of TOOL_JOBS) {
    const byMaker = new Map<string, number>()
    for (const r of linesOf(provider, job)) byMaker.set(makerOf(r, makers).id, (byMaker.get(makerOf(r, makers).id) ?? 0) + 1)
    assert.ok(byMaker.size <= 5, `${job} on ${provider}: ${byMaker.size} makers`)
    for (const [m, n] of byMaker) assert.ok(n <= 5, `${job} on ${provider}: ${n} models of ${m}`)
  }
})

check("Replicate's Topaz upscaler is among the upscale models, not pushed out by older classics", () => {
  const ids = linesOf("replicate", "image-upscale").map((r) => r.endpoint)
  assert.ok(ids.includes("topazlabs/image-upscale"), ids.join(", "))
})

check("every setting a picture tool model shows has a plain name (no field name) and an info line", () => {
  const skip = /^(seed|output_format|output_quality|sync_mode|num_images|number_of_images|n|negative_prompt|prompt|return_model_output|preserve_alpha|retain_original_quality|width|height|steps|num_inference_steps|guidance|guidance_scale|cfg|safety_tolerance|enable_safety_checker)$/
  const bad: string[] = []
  for (const r of all) {
    if (!r.serves?.some((s) => /^image-(upscale|relight|restyle|outpaint|remove-background|restore|remove-object|colorize)$/.test(s.id) && s.role !== "alternative")) continue
    for (const [k, p] of Object.entries(r.params.properties)) {
      if (p.format || skip.test(k) || p.tier === "technical" || (!p.enum && p.type !== "boolean" && p.type !== "number" && p.type !== "integer")) continue
      const w = settingWords(k, p)
      if (!w.info || w.label.includes("_")) bad.push(`${r.id}: ${k}`)
    }
  }
  assert.deepEqual(bad, [])
})

check("a job lists the models made for it first, then at most two top closed editors that follow words", () => {
  for (const job of ["image-upscale", "image-outpaint", "image-relight", "image-remove-background"]) {
    const list = modelsForJob(toolById(job)!, { ...ctx(), keyed: new Set(["fal", "replicate", "openai", "gemini", "openrouter"]) })
    const made = list.filter((r) => capabilityOfExact(r).dedicated.includes(verbOfJob(job)!))
    const editors = list.filter((r) => !made.includes(r))
    assert.ok(made.length > 0, `${job}: nothing made for it`)
    assert.ok(editors.length >= 1 && editors.length <= 2, `${job}: ${editors.length} general editors`)
    assert.ok(list.indexOf(editors[0]!) > list.indexOf(made[made.length - 1]!), `${job}: an editor is listed before a model made for it`)
  }
})

check("a job's models come best first: closed before open, and inside each a maker's models together", () => {
  const keyedAll = { ...ctx(), keyed: new Set(["fal", "replicate", "openai", "gemini", "openrouter"]) }
  for (const job of ["image-upscale", "image-outpaint", "image-remove-background"]) {
    const list = modelsForJob(toolById(job)!, keyedAll).filter((r) => capabilityOfExact(r).dedicated.includes(verbOfJob(job)!))
    const rank = (r: ModelRecord) => (r.weights === "closed" ? 0 : r.weights === "open" ? 1 : 2)
    for (let i = 1; i < list.length; i++) assert.ok(rank(list[i - 1]!) <= rank(list[i]!), `${job}: ${list[i]!.id} (open) is listed before a closed model`)
    // inside closed (or open), a maker's models are together
    const seen = new Set<string>()
    let last = ""
    for (const r of list) {
      const key = `${rank(r)}|${makerOf(r, makers).id}`
      if (key !== last) {
        assert.ok(!seen.has(key), `${job}: ${key} appears in two places`)
        seen.add(key)
        last = key
      }
    }
  }
})

check("Best order for any list: closed before open; stars come first only when the list has stars, each group in Best order", () => {
  for (const category of ["image", "video", "audio", "text"] as const) {
    const list = all.filter((r) => r.category === category).slice(0, 60)
    if (list.length < 4) continue
    const weight = (r: ModelRecord) => (r.weights === "closed" ? 0 : r.weights === "open" ? 1 : 2)
    const best = rankBest(list)
    for (let i = 1; i < best.length; i++) assert.ok(weight(best[i - 1]!) <= weight(best[i]!), `${category}: an open model is before a closed one`)
    // no stars: exactly Best
    assert.deepEqual(arrange(list).map((r) => r.id), best.map((r) => r.id))
    // a starred model comes first, the rest stay in Best order
    const star = best[best.length - 1]!
    const out = arrange(list, { starred: new Set([star.id]) })
    assert.equal(out[0]!.id, star.id)
    assert.deepEqual(out.slice(1).map((r) => r.id), best.filter((r) => r.id !== star.id).map((r) => r.id))
  }
})

console.log(`\n${passed} passed`)

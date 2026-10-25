import { readFileSync } from "node:fs"
import { withOfficial } from "../src/lib/registry/official-specs"
import { buildInput, sendableParams } from "../src/lib/registry/request"
import { storyboardPrompt, shotLength } from "../src/lib/registry/storyboard"
import { rowChips } from "../src/lib/registry/summary"
import type { ModelRecord, ParamProperty } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}

// The storyboard Wan 3.0 follows: one shot per line, each with a time range
const three = "A drone rises over a foggy harbour\nCut to a fisherman lighting a lantern\nWide shot of the boats leaving at dawn"
check("one shot per line becomes timed shots that fill the clip", storyboardPrompt(three, 15) === "0s - 5s: A drone rises over a foggy harbour\n5s - 10s: Cut to a fisherman lighting a lantern\n10s - 15s: Wide shot of the boats leaving at dawn", storyboardPrompt(three, 15))
check("the last shot takes what is left", storyboardPrompt("a\nb\nc", 10).split("\n").map((l) => l.split(":")[0]).join("|") === "0s - 3s|3s - 6s|6s - 10s")
check("a prompt of one line is left alone", storyboardPrompt("Just one idea", 8) === "Just one idea")
check("a prompt the person already timed is left alone", storyboardPrompt("0s - 4s: first\n4s - 8s: second", 8) === "0s - 4s: first\n4s - 8s: second")
check("a clip shorter than its shots still gives each at least a second", storyboardPrompt("a\nb\nc\nd", 2).split("\n").length === 4 && !storyboardPrompt("a\nb\nc\nd", 2).includes("0s - 0s"))
check("blank lines are not shots", storyboardPrompt("a\n\n  \nb", 10) === "0s - 5s: a\n5s - 10s: b")
check("each shot's length is known for a warning", shotLength(three, 15) === 5 && shotLength("one", 15) === undefined)

// Alibaba's own Wan 3.0 entry reaches both hosts, and each host's own list is kept
const rec = (provider: string, endpoint: string, props: Record<string, ParamProperty> = {}): ModelRecord =>
  ({ id: `${provider}/${endpoint}`, endpoint, name: endpoint, provider, modality: "video", family: endpoint, logoKey: "", inputs: ["text"], params: { type: "object", properties: props, request: { promptKey: "prompt", fixed: {}, blockers: [] } }, price: { unit: "unknown", amount: null, source: "estimate", fetchedAt: "" }, status: "active" }) as ModelRecord
const rep = withOfficial(rec("replicate", "alibaba/wan-3", { duration: { type: "integer" } }))
const fal = withOfficial(rec("fal", "alibaba/wan-3.0/text-to-video", { duration: { type: "integer" } }))
check("Wan 3 on Replicate gets Multi-shot and Watermark", Boolean(rep.params.properties.multi_shot) && Boolean(rep.params.properties.watermark))
check("Wan 3.0 on fal gets them too", Boolean(fal.params.properties.multi_shot) && Boolean(fal.params.properties.watermark))
check("the provider's own setting is kept", Boolean(rep.params.properties.duration))
check("Wan 3 Prime is covered", Boolean(withOfficial(rec("replicate", "alibaba/wan-3-prime")).params.properties.multi_shot))
check("another Wan version is not given them", !withOfficial(rec("replicate", "wan-video/wan-2.7-t2v")).params.properties.multi_shot)
check("a field the provider already lists is not replaced", withOfficial(rec("fal", "alibaba/wan-3.0/text-to-video", { watermark: { type: "boolean", default: true } })).params.properties.watermark?.default === true)

// The storyboard control is never sent as a field; the watermark is only sent once changed
check("Multi-shot is never sent to the provider", !("multi_shot" in sendableParams(rep, { multi_shot: true })) && !("multi_shot" in buildInput(rep, "x", { multi_shot: true })))
check("the watermark left at its default is not sent, once changed it is", !("watermark" in sendableParams(rep, { watermark: false })) && sendableParams(rep, { watermark: true }).watermark === true)

// The row says so
const chips = rowChips(rep, [rep])
check("the row shows a Multi-shot chip", chips.includes("Multi-shot"), chips.join())
const snap = JSON.parse(readFileSync(new URL("../src/lib/registry/registry.snapshot.json", import.meta.url), "utf8")) as { models: ModelRecord[] }
const kling = snap.models.find((m) => /kling-video\/v3\/pro\/text-to-video/.test(m.endpoint))!
check("a provider's own multi-shot switch (Kling shot_type) also shows the chip", rowChips(kling, [kling]).includes("Multi-shot"))

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)

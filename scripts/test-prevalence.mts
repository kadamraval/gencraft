import { prevalenceOf, retier, tierFor } from "../src/lib/registry/prevalence"
import type { ModelRecord, ParamProperty } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const rec = (i: number, props: Record<string, ParamProperty>, modality: ModelRecord["modality"] = "video"): ModelRecord =>
  ({ id: `p/${i}`, endpoint: `m/${i}`, name: `M${i}`, provider: "fal", modality, family: "", logoKey: "", inputs: ["text"], params: { type: "object", properties: props }, price: { unit: "unknown", amount: null, source: "estimate", fetchedAt: "" }, status: "active" }) as ModelRecord

// Ten video models: nine take a negative prompt and a camera setting, one takes a rare "loop" and an odd standard-looking field
const pool = Array.from({ length: 10 }, (_, i) =>
  rec(i, {
    duration: { type: "integer", tier: "common" },
    camera_motion: { type: "string", enum: ["a", "b"], tier: i < 9 ? "unique" : undefined },
    seed: { type: "integer", tier: "advanced" },
    ...(i === 0 ? { rare_tool: { type: "boolean", tier: "common" }, style_boost: { type: "boolean", tier: "unique" } } : {}),
  }),
)
const stats = prevalenceOf(pool)
check("a kind with enough models is measured", stats.video?.total === 10)
check("a kind with too few models is not", prevalenceOf(pool.slice(0, 5)).video === undefined)
check("the share is counted per model", stats.video?.share.get("duration") === 1 && stats.video?.share.get("rare_tool") === 0.1, JSON.stringify([...(stats.video?.share ?? [])]))
check("a setting most models have becomes Standard", tierFor("camera_motion", pool[0]!.params.properties.camera_motion!, stats.video!) === "common")
check("a setting few models have is Model specific", tierFor("rare_tool", pool[0]!.params.properties.rare_tool!, stats.video!) === "common" ? false : tierFor("rare_tool", { type: "boolean", tier: "common" }, { total: 10, share: new Map([["rare_tool", 0.05]]) }) === "unique")
check("the core settings never move", tierFor("duration", { type: "integer", tier: "common" }, { total: 10, share: new Map([["duration", 0.01]]) }) === undefined)
check("helpers stay under More however common", tierFor("seed", { type: "integer", tier: "advanced" }, { total: 10, share: new Map([["seed", 1]]) }) === undefined)
check("technical settings never move", tierFor("fps", { type: "integer", tier: "technical" }, { total: 10, share: new Map([["fps", 1]]) }) === undefined)
check("an untested setting never moves", tierFor("x", { type: "boolean", tier: "unique", untested: true }, { total: 10, share: new Map([["x", 1]]) }) === undefined)
const moved = retier(pool[1]!, stats)
check("retier changes the tier and keeps the record otherwise", moved.params.properties.camera_motion?.tier === "common" && moved.id === "p/1")
check("retier returns the same record when nothing moves", retier(pool[0]!, {}) === pool[0])

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)

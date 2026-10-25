import { readFileSync } from "node:fs"
import { baseKey, featureOfEndpoint, featuresOf } from "../src/lib/registry/features"
import { plainName, plainValue } from "../src/lib/registry/plain-names"
import type { ModelRecord } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const snap = (JSON.parse(readFileSync(new URL("../src/lib/registry/registry.snapshot.json", import.meta.url), "utf8")) as { models: ModelRecord[] }).models
const find = (endpoint: string) => snap.find((m) => m.provider === "fal" && m.endpoint === endpoint)!
const offered = (endpoint: string) => featuresOf(find(endpoint), snap).map((o) => `${o.def.id}=${o.record.endpoint}`)

check("motion control is motion transfer", featureOfEndpoint("fal-ai/kling-video/v3/pro/motion-control")?.id === "motion-transfer" && featureOfEndpoint("moonvalley/marey/pose-transfer")?.id === "motion-transfer")
check("extend, edit, lip-sync and transition are found", featureOfEndpoint("fal-ai/veo3.1/extend-video")?.id === "extend" && featureOfEndpoint("fal-ai/wan/v2.7/edit-video")?.id === "edit" && featureOfEndpoint("fal-ai/sync-lipsync/v3")?.id === "lip-sync" && featureOfEndpoint("fal-ai/pixverse/v6/transition")?.id === "transition")
check("an ordinary version is not a feature", featureOfEndpoint("fal-ai/kling-video/v3/pro/text-to-video") === undefined && featureOfEndpoint("alibaba/wan-3.0/image-to-video") === undefined)

const klingPro = find("fal-ai/kling-video/v3/pro/text-to-video")
check("a feature endpoint ties to its model: Kling v3 pro", baseKey(klingPro) === baseKey(find("fal-ai/kling-video/v3/pro/motion-control")), `${baseKey(klingPro)} vs ${baseKey(find("fal-ai/kling-video/v3/pro/motion-control"))}`)
check("the standard tier is not the pro tier", baseKey(klingPro) !== baseKey(find("fal-ai/kling-video/v3/standard/motion-control")))
check("Kling v3 pro offers its own motion transfer", offered("fal-ai/kling-video/v3/pro/text-to-video").includes("motion-transfer=fal-ai/kling-video/v3/pro/motion-control"), offered("fal-ai/kling-video/v3/pro/text-to-video").join())
check("Kling v3 standard offers the standard one", offered("fal-ai/kling-video/v3/standard/text-to-video").includes("motion-transfer=fal-ai/kling-video/v3/standard/motion-control"), offered("fal-ai/kling-video/v3/standard/text-to-video").join())
check("Veo 3.1 offers extend", offered("fal-ai/veo3.1").some((f) => f.startsWith("extend=")), offered("fal-ai/veo3.1").join())
const pix = offered("fal-ai/pixverse/v6/text-to-video")
check("PixVerse v6 offers extend and transition", pix.some((f) => f.startsWith("extend=")) && pix.some((f) => f.startsWith("transition=")), pix.join())
check("Marey offers motion transfer", offered("moonvalley/marey/t2v").some((f) => f.startsWith("motion-transfer=")), offered("moonvalley/marey/t2v").join())
check("a model with no extra endpoints offers none", featuresOf(find("alibaba/wan-3.0/text-to-video"), snap).length === 0, offered("alibaba/wan-3.0/text-to-video").join())
check("a feature does not offer itself", !offered("fal-ai/kling-video/v3/pro/motion-control").some((f) => f.startsWith("motion-transfer=")))
check("another model's feature is not offered", !offered("fal-ai/veo3.1").some((f) => f.includes("kling")))

// What a creator reads
check("technical names become the standard names", plainName("enable_prompt_expansion") === "Prompt enhance" && plainName("cfg_scale") === "CFG scale" && plainName("negative_prompt") === "Negative prompt" && plainName("seed") === "Seed")
check("programmer values become standard words", plainValue("shot_type", "customize") === "Manual" && plainValue("shot_type", "intelligent") === "Auto" && plainValue("aspect_ratio", "adaptive") === "Auto" && plainValue("mode", "pro") === "Pro" && plainValue("mode", "weird") === undefined)
check("a name nobody listed stays unlisted", plainName("zebra_stripes") === undefined)

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)

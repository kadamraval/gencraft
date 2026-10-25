import { readFileSync } from "node:fs"
import { crossHostExtras, crossHostFiles, sameModelElsewhere, pickCheapestHostForModel } from "../src/lib/registry/cross-host"
import { buildLiteLLMRouterChain } from "../src/lib/agent/fallback-router"
import type { ModelRecord, ParamProperty } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}

const rec = (provider: string, endpoint: string, name: string, props: Record<string, ParamProperty>, task = "text-to-image", modality: ModelRecord["modality"] = "image"): ModelRecord =>
  ({ id: `${provider}/${endpoint}`, endpoint, name, provider, modality, task, family: name, logoKey: "", inputs: ["text"], params: { type: "object", properties: props }, price: { unit: "unknown", amount: null, source: "estimate", fetchedAt: "" }, status: "active" }) as ModelRecord

const replicate = rec("replicate", "google/nano-banana-2.1", "Nano Banana 2.1", {
  aspect_ratio: { type: "string", enum: ["1:1"], tier: "common" },
  resolution: { type: "string", enum: ["1K"], tier: "common" },
  google_search: { type: "boolean", tier: "advanced" },
  output_format: { type: "string", enum: ["jpg", "png"], tier: "technical" },
})
const fal = rec("fal", "google/nano-banana-2.1", "Nano Banana 2.1", {
  aspect_ratio: { type: "string", enum: ["auto", "1:1"], tier: "common" },
  resolution: { type: "string", enum: ["1K", "2K"], tier: "common" },
  num_images: { type: "integer", minimum: 1, maximum: 4, tier: "common" },
  seed: { type: "integer", tier: "advanced" },
  thinking_level: { type: "string", enum: ["minimal", "medium", "high"], tier: "unique" },
  system_prompt: { type: "string", tier: "advanced" },
  enable_web_search: { type: "boolean", tier: "advanced" },
  output_format: { type: "string", enum: ["jpeg", "png", "webp"], tier: "technical" },
  image_urls: { type: "string", format: "image" },
  limit_generations: { type: "boolean", tier: "technical" },
})
const otherVersion = rec("fal", "google/nano-banana-2.5", "Nano Banana 2.5", { should_not_travel: { type: "boolean", tier: "unique" } })
const edit = rec("fal", "google/nano-banana-2.1/edit", "Nano Banana 2.1 Edit", { only_for_editing: { type: "boolean", tier: "unique" } }, "image-to-image")
const pool = [replicate, fal, otherVersion, edit]

const extras = crossHostExtras(replicate, pool)
check("a setting the other host lists is added", "thinking_level" in extras && "seed" in extras && "system_prompt" in extras, Object.keys(extras).join())
check("it is marked untested and says where it came from", extras.thinking_level?.untested === true && extras.thinking_level?.listedBy === "fal")
check("a setting this host already has is not added", !("aspect_ratio" in extras) && !("resolution" in extras) && !("output_format" in extras))
check("the same thing under another name is not added twice", !("enable_web_search" in extras), Object.keys(extras).join())
check("results per run does not travel", !("num_images" in extras))
check("file inputs and technical settings do not travel", !("image_urls" in extras) && !("limit_generations" in extras))
check("another version of the model gives nothing", !("should_not_travel" in extras))
check("an editing variant gives nothing to a text-to-image model", !("only_for_editing" in extras))
check("the other host's own record is not changed", !("untested" in (fal.params.properties.seed ?? {})))
check("the same model is found on the other host only", sameModelElsewhere(replicate, pool).map((r) => r.id).join() === "fal/google/nano-banana-2.1")

// A host that publishes nothing takes nothing
const direct = rec("openai", "gpt-image-2.5-sunburst", "gpt-image-2.5-sunburst", {})
const falGpt = rec("fal", "openai/gpt-image-2.5/sunburst/text-to-image", "GPT Image 2.5 Sunburst", { background: { type: "string", enum: ["auto", "opaque"], tier: "unique" } })
check("a direct connector with no schema is left alone", Object.keys(crossHostExtras(direct, [direct, falGpt])).length === 0)

// Video: text, image and reference to video are one kind of work
const repVideo = rec("replicate", "alibaba/wan-3", "Wan 3", { duration: { type: "integer", tier: "common" } }, "image-to-video", "video")
const falVideo = rec("fal", "alibaba/wan-3.0/text-to-video", "Wan 3.0 Text to Video", { duration: { type: "integer", tier: "common" }, enable_thinking: { type: "boolean", tier: "advanced" } }, "text-to-video", "video")
check("video tasks share their settings", "enable_thinking" in crossHostExtras(repVideo, [repVideo, falVideo]), Object.keys(crossHostExtras(repVideo, [repVideo, falVideo])).join())

// Files: real Wan 3.0 on fal against Replicate's one-endpoint Wan 3 (first frame only)
const snap = JSON.parse(readFileSync(new URL("../src/lib/registry/registry.snapshot.json", import.meta.url), "utf8")) as { models: ModelRecord[] }
const repWan3 = rec("replicate", "alibaba/wan-3", "Wan 3", { duration: { type: "integer", tier: "common" }, seed: { type: "integer", tier: "advanced" }, image: { type: "string", format: "image", slot: { kind: "image", role: "start", list: false, max: 1 } } }, "image-to-video", "video")
const files = crossHostFiles(repWan3, [repWan3, ...snap.models])
check("Wan 3 on Replicate gets the end frame fal lists", "end_image_url" in files, Object.keys(files).join())
check("it gets reference images, videos and sounds", "reference_image_urls" in files && "reference_video_urls" in files && "reference_audio_urls" in files, Object.keys(files).join())
check("it does not get a second start frame", !("start_image_url" in files))
check("each is marked untested and says where it came from", Object.values(files).every((f) => f.untested === true && f.listedBy === "fal"))
check("the limits come with them", files.reference_image_urls?.slot?.max === 10 && files.reference_video_urls?.slot?.max === 5)

// A host whose versions already take a kind of file is not given it again
const repI2v = rec("replicate", "wan-video/wan-2.7-i2v", "Wan 2.7 i2v", { first_frame: { type: "string", format: "image", slot: { kind: "image", role: "start", list: false, max: 1 } }, last_frame: { type: "string", format: "image", slot: { kind: "image", role: "end", list: false, max: 1 } } }, "image-to-video", "video")
const repR2v = rec("replicate", "wan-video/wan-2.7-r2v", "Wan 2.7 r2v", { refs: { type: "string", format: "image", slot: { kind: "image", role: "reference", list: true, max: 5 } } }, "image-to-video", "video")
const repT2v = rec("replicate", "wan-video/wan-2.7-t2v", "Wan 2.7 t2v", {}, "text-to-video", "video")
const falI2v = rec("fal", "alibaba/wan-2.7/image-to-video", "Wan 2.7 i2v", { start_image_url: { type: "string", format: "image", slot: { kind: "image", role: "start", list: false, max: 1 } }, end_image_url: { type: "string", format: "image", slot: { kind: "image", role: "end", list: false, max: 1 } } }, "image-to-video", "video")
const falR2v = rec("fal", "alibaba/wan-2.7/reference-to-video", "Wan 2.7 r2v", { reference_image_urls: { type: "string", format: "image", slot: { kind: "image", role: "reference", list: true, max: 9 } } }, "image-to-video", "video")
const p27 = [repI2v, repR2v, repT2v, falI2v, falR2v]
check("a family that already has the files is left alone", [repI2v, repR2v, repT2v].every((r) => Object.keys(crossHostFiles(r, p27)).length === 0), JSON.stringify([repI2v, repR2v, repT2v].map((r) => Object.keys(crossHostFiles(r, p27)))))

// LiteLLM cost-based-routing & multi-key / single-key fallback chain
const falFlux = { ...rec("fal", "fal-ai/flux-pro/v1.1", "FLUX 1.1 Pro", {}), price: { unit: "per_image" as const, amount: 0.05, source: "provider_api" as const, fetchedAt: "" } }
const repFlux = { ...rec("replicate", "black-forest-labs/flux-1.1-pro", "FLUX 1.1 Pro", {}), price: { unit: "per_image" as const, amount: 0.04, source: "scraped" as const, fetchedAt: "" } }
const orFlux = { ...rec("openrouter", "black-forest-labs/flux-1.1-pro", "FLUX 1.1 Pro", {}), price: { unit: "per_image" as const, amount: 0.06, source: "provider_api" as const, fetchedAt: "" } }
const falSchnell = { ...rec("fal", "fal-ai/flux/schnell", "FLUX Schnell", {}), featured: 1, price: { unit: "per_image" as const, amount: 0.003, source: "provider_api" as const, fetchedAt: "" } }
const routerPool = [falFlux, repFlux, orFlux, falSchnell]

check(
  "pickCheapestHostForModel selects Replicate ($0.04) over Fal ($0.05) and OpenRouter ($0.06) when all 3 keys are connected",
  pickCheapestHostForModel(falFlux, routerPool, {}, new Set(["fal", "replicate", "openrouter"])).id === repFlux.id
)
const multiKeyChain = buildLiteLLMRouterChain(falFlux, routerPool, new Set(["fal", "replicate", "openrouter"]))
check(
  "multi-key router chain puts cheapest same-model cross-host equivalent first in fallbacks",
  multiKeyChain[0]?.id === falFlux.id && multiKeyChain[1]?.id === repFlux.id && multiKeyChain[2]?.id === orFlux.id,
  multiKeyChain.map((r) => r.id).join(" -> ")
)
const singleKeyChain = buildLiteLLMRouterChain(falFlux, routerPool, new Set(["fal"]))
check(
  "single-key router chain falls back within the same connected provider",
  singleKeyChain.every((r) => r.provider === "fal") && singleKeyChain.some((r) => r.id === falSchnell.id),
  singleKeyChain.map((r) => r.id).join(" -> ")
)

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)


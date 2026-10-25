import { aspectOf, clampToSchema, countOf, defaultsFor, megapixelsOf, rowOptions, secondsOf } from "../src/lib/registry/param-logic"
import { applyParamPolicy, classifyParam } from "../src/lib/registry/param-policy"
import { buildInput, sendableParams } from "../src/lib/registry/request"
import { applyParamChecks, fieldsNamedIn, recordParamChecks, untestedSent } from "../src/lib/registry/param-checks"
import { mediaKindOf, ruleKey, parseReplicatePrice } from "../src/lib/registry/adapters/replicate"
import { estimateRun } from "../src/lib/registry/price"
import type { ModelRecord, ParamSchema } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}

const schema = {
  type: "object",
  properties: {
    image_size: { type: "string", enum: ["square_hd", "landscape_4_3"], default: { width: 1024, height: 1024 } as never },
    duration: { type: "string", enum: ["auto", "4", "5", "6"], default: "5" },
    n: { type: "integer", minimum: 1, maximum: 4, default: 9 },
    secs: { type: "integer", minimum: 1, maximum: 15, default: 6 },
    ratio: { type: "string", enum: ["16:9", "1:1"], default: 1 as never },
  },
} as unknown as ParamSchema

const d = defaultsFor(schema)
check("an object default is not used; the first choice is", d.image_size === "square_hd", String(d.image_size))
check("a default that is a choice is kept", d.duration === "5")
check("a number default is held inside the range", d.n === 4, String(d.n))
check("a default that is not a choice falls back to the first", d.ratio === "16:9")
check("5 and \"5\" are the same choice", clampToSchema(schema, { duration: 5 }).duration === "5")
check("a choice that no longer exists resets", clampToSchema(schema, { duration: "9" }).duration === "5")
check("a number in range is kept", clampToSchema(schema, { n: 2 }).n === 2)

const opts = rowOptions(schema.properties.secs!, 7)!
check("the row list holds the model's default and the chosen value", opts.includes(6) && opts.includes(7), JSON.stringify(opts))
check("a long range gives a short list", opts.length < 15)
check("a short range lists every value", JSON.stringify(rowOptions({ type: "integer", minimum: 2, maximum: 5 })) === "[2,3,4,5]")
check("a range with no ends offers nothing", rowOptions({ type: "integer" }) === undefined)

check("auto duration is not NaN", secondsOf({ duration: "auto" }) === 5)
check("a text duration is read", secondsOf({ duration: "8" }) === 8)
check("another duration field is read", secondsOf({ duration_seconds: 12 }) === 12)
check("count from the model's own field", countOf({ num_outputs: 3 }) === 3 && countOf({}) === 1 && countOf({ n: "2" }) === 2)

check("a size preset gives its shape", aspectOf({ image_size: "portrait_16_9" }) === "9:16")
check("a width and height text gives its shape", aspectOf({ size: "1920x1080" }) === "16:9")
check("a width and height object gives its shape", aspectOf({ image_size: { width: 1024, height: 768 } }) === "4:3")
check("auto stays auto", aspectOf({ aspect_ratio: "auto" }) === "auto")
check("nothing given uses the fallback", aspectOf({}) === "16:9")

check("2K is about four times 1K", Math.abs(megapixelsOf({ resolution: "2K" }) / megapixelsOf({ resolution: "1K" }) - 4) < 0.1)
check("a size object is measured", Math.abs(megapixelsOf({ image_size: { width: 2000, height: 1000 } }) - 2) < 1e-9)
check("a preset is measured", megapixelsOf({ image_size: "square" }) < 0.3)

const rec = (unit: string) => ({ modality: "image", params: { type: "object", properties: {} }, price: { unit, amount: 0.01, source: "official" } }) as unknown as ModelRecord
const small = estimateRun(rec("per_megapixel"), { resolution: "1K" }).usd!
const big = estimateRun(rec("per_megapixel"), { resolution: "4K" }).usd!
check("a per-megapixel price grows with the size", big > small * 10, `${small} ${big}`)
const openLength = estimateRun({ ...rec("per_second"), modality: "video" } as ModelRecord, { duration: "auto" })
check("a per-second price with an open length is priced at the most it could run, and says so", Number.isFinite(openLength.usd!) && openLength.upTo === true && openLength.usd === 0.1, JSON.stringify(openLength))

check("a billing condition is named the way the composer names it", ruleKey("target resolution") === "resolution" && ruleKey("with audio") === "generate_audio" && ruleKey("model variant") === "model_variant")
const tier = (variant: string, res: string, price: string) => ({ criteria: [{ title: "model variant", type: "equals", value: variant }, { title: "target resolution", type: "equals", value: res }], prices: [{ metric: "video_output_duration_seconds", price, title: "per second of output video" }] })
const page = `<script>"billingConfig": ${JSON.stringify({ current_tiers: [tier("non_video_in", "480p", "$0.08"), tier("non_video_in", "4k", "$1")] })}, "price": "x"</script>`
const parsed = parseReplicatePrice(page)!
check("a tier keeps every condition", parsed.rules?.[1]?.when.resolution === "4k" && parsed.rules?.[1]?.when.model_variant === "non_video_in", JSON.stringify(parsed.rules))
const seed = { modality: "video", params: { type: "object", properties: {} }, price: { unit: parsed.unit, amount: parsed.amount, rules: parsed.rules, source: "scraped" } } as unknown as ModelRecord
check("the price follows the resolution", estimateRun(seed, { resolution: "4k", duration: 5 }, { sourceVideo: false }).usd === 5 && estimateRun(seed, { resolution: "480p", duration: 5 }, { sourceVideo: false }).usd === 0.4)
check("a duration of -1 (auto) still prices", Number.isFinite(estimateRun(seed, { resolution: "480p", duration: -1 }, { sourceVideo: false }).usd!))

for (const k of ["movement_amplitude", "character_orientation", "reference_text", "stability", "similarity_boost", "start_time", "multi_shots", "keep_original_sound"]) check(`${k} is a creator control`, classifyParam(k) === "unique", classifyParam(k))
check("series_amount counts as the image count", classifyParam("series_amount") === "common")
check("plumbing stays hidden", classifyParam("subtalker_top_k") === "plumbing" && classifyParam("timestamps") === "plumbing" && classifyParam("webhook_url") === "plumbing")
check("the safety fields are left to the app's own switch", ["enable_safety_checker", "safety_tolerance", "moderation"].every((k) => classifyParam(k) === "plumbing"))
check("low-level settings are listed, not dropped", ["num_inference_steps", "output_format", "fps", "person_generation", "num_frames"].every((k) => classifyParam(k) === "technical"))

// Nothing a person could use is dropped by the policy
const kept = applyParamPolicy({
  type: "object",
  properties: {
    aspect_ratio: { type: "string", enum: ["1:1"] },
    output_format: { type: "string", enum: ["jpg", "png"], default: "jpg" },
    num_inference_steps: { type: "integer", minimum: 1, maximum: 50, default: 28 },
    webhook_url: { type: "string" },
    prompt: { type: "string" },
  },
}).params.properties
check("output format is kept as technical", kept.output_format?.tier === "technical")
check("steps are kept as technical", kept.num_inference_steps?.tier === "technical")
check("plumbing is left out", !("webhook_url" in kept) && !("prompt" in kept))

// What gets sent for a setting the provider does not list
const nano = {
  params: {
    type: "object",
    properties: {
      resolution: { type: "string", enum: ["1K", "2K"], default: "1K" },
      thinking_level: { type: "string", enum: ["minimal", "medium", "high"], default: "medium", untested: true },
      weird: { type: "string", enum: ["a", "b"], default: "a", rejected: true },
    },
    request: { promptKey: "prompt", fixed: {}, blockers: [] },
  },
} as unknown as ModelRecord
check("an untested setting left at its default is not sent", !("thinking_level" in sendableParams(nano, { resolution: "1K", thinking_level: "medium" })))
check("an untested setting the person changed is sent", sendableParams(nano, { thinking_level: "high" }).thinking_level === "high")
check("a refused setting is never sent", !("weird" in sendableParams(nano, { weird: "b" })))
check("a normal setting is always sent", sendableParams(nano, { resolution: "1K" }).resolution === "1K")
check("the prompt goes in the model's own field", buildInput(nano, "a cat", { thinking_level: "high" }).prompt === "a cat")

// What runs teach
check("only sent, untested settings can be settled", JSON.stringify(untestedSent(nano, { thinking_level: "high", resolution: "1K" })) === JSON.stringify(["thinking_level"]))
check("a refusal that names a setting rejects it", JSON.stringify(fieldsNamedIn("Replicate could not start the run (HTTP 422): Input validation failed: thinking_level is not allowed", ["thinking_level", "resolution"])) === JSON.stringify(["thinking_level"]))
check("a timeout never rejects a setting", fieldsNamedIn("Replicate run timed out while thinking_level was set", ["thinking_level"]).length === 0)
check("a refusal naming nothing sent rejects nothing", fieldsNamedIn("HTTP 422: seed is invalid", ["thinking_level"]).length === 0)
recordParamChecks("test/model-a", ["thinking_level"], "accepted")
const settledRec = applyParamChecks({ id: "test/model-a", params: nano.params }) as unknown as ModelRecord
check("a run that went through settles the setting", settledRec.params.properties.thinking_level?.untested === undefined)
recordParamChecks("test/model-b", ["thinking_level"], "rejected")
const refusedRec = applyParamChecks({ id: "test/model-b", params: nano.params }) as unknown as ModelRecord
check("a refusal flags the setting", refusedRec.params.properties.thinking_level?.rejected === true)

// Sorting a file-making model that Replicate files under "official"
check("an image model is sorted as image", mediaKindOf({ name: "nano-banana-2.1", description: "Google's fast image generation and editing" })?.modality === "image")
check("a video model is sorted as video", mediaKindOf({ name: "veo-3.1", description: "Text-to-video with audio" })?.modality === "video")
check("an image-to-video model keeps its task", mediaKindOf({ name: "x", description: "Animate a still image into a video" })?.task === "image-to-video")
check("a speech model is sorted as audio", mediaKindOf({ name: "tts-hd", description: "Studio voice speech" })?.modality === "audio")
check("a model that says nothing is left out", mediaKindOf({ name: "thing", description: "A useful model" }) === null)
check("the name outranks the description", mediaKindOf({ name: "lyria-3", description: "Music for your video" })?.modality === "audio" && mediaKindOf({ name: "flux-3", description: "Images and short video clips" })?.modality === "image")
check("a tool that changes a file is not offered", mediaKindOf({ name: "video-upscale", description: "Make a video sharper" }) === null && mediaKindOf({ name: "remove-background", description: "Cut out the subject of an image" }) === null)
check("the model's own fields outrank its name: FLUX 3 on Replicate makes video", mediaKindOf({ name: "flux-3", description: "A multimodal model" }, ["draft", "images", "duration", "resolution", "start_video", "aspect_ratio", "generate_audio"])?.modality === "video")
check("a length alone is not video: a music model with a duration stays audio", mediaKindOf({ name: "stable-audio-2.5", description: "Make music" }, ["duration", "seed"])?.modality === "audio")
check("a voice field means audio", mediaKindOf({ name: "something", description: "Generates" }, ["text", "voice"])?.modality === "audio")
check("an image model's fields do not make it video", mediaKindOf({ name: "nano-banana-2.1", description: "Fast image generation" }, ["image_input", "aspect_ratio", "resolution", "output_format"])?.modality === "image")
check("a video model with no cue in its name is sorted by its description", mediaKindOf({ name: "seedance-2.5", description: "Cinematic video with native audio" })?.modality === "video")

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)

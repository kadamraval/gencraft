import { withOfficial } from "../src/lib/registry/official-specs"
import { composePrompt } from "../src/lib/elements/compose"
import { buildInput } from "../src/lib/registry/request"
import { shapeRun } from "../src/lib/models/apply"
import { plannedShots } from "../src/lib/models/recipes/shots"
import "../src/lib/models/profiles"
import { profileFor } from "../src/lib/models/profile"
import { applyRules, emptySelection } from "../src/lib/models/rules"
import { autoValueFor, hostFields, isAuto, toHost, toStandard } from "../src/lib/models/names"
import { cameraCommands, lintCamera, withCameraCommands } from "../src/lib/models/recipes/camera"
import { evenShots, klingShots, lintShots, numberedShots, seedanceStoryboard, wanStoryboard } from "../src/lib/models/recipes/shots"
import type { ModelRecord } from "../src/lib/registry/types"
import type { Selection } from "../src/lib/models/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const rec = (endpoint: string, name: string, modality: ModelRecord["modality"] = "video", props: ModelRecord["params"]["properties"] = {}) =>
  ({ id: `x/${endpoint}`, endpoint, name, modality, provider: "fal", params: { type: "object", properties: props } }) as ModelRecord

// Profile matching: version numbers identical, variants kept apart
check("2.5 matches its profile", profileFor(rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5 Text to Video"))?.id === "seedance-2.5")
check("2.0 matches its profile", profileFor(rec("bytedance/seedance-2.0/text-to-video", "Seedance 2.0 Text to Video"))?.id === "seedance-2.0")
check("2.0 Fast is the 2.0 line", profileFor(rec("bytedance/seedance-2.0/fast/text-to-video", "Seedance 2.0 Fast Text to Video"))?.id === "seedance-2.0")
check("2.0 Mini is the 2.0 line", profileFor(rec("bytedance/seedance-2.0/mini/text-to-video", "Seedance 2.0 Mini Text to Video"))?.id === "seedance-2.0")
check("2.5 does not take a Fast sibling", profileFor(rec("bytedance/seedance-2.5/fast/text-to-video", "Seedance 2.5 Fast")) === undefined)
check("1.5 has no profile", profileFor(rec("fal-ai/bytedance/seedance/v1.5/pro/text-to-video", "Bytedance Seedance V1.5 Pro Text To Video")) === undefined)
check("an image model does not take a video profile", profileFor(rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5", "image")) === undefined)

// Rules: locks, narrowing, order
const sd = profileFor(rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5"))!
const sel = (over: Partial<Selection> & { values?: Record<string, unknown>; inputs?: Partial<Selection["inputs"]> } = {}): Selection => {
  const base = emptySelection(over.values ?? { aspect_ratio: "16:9", duration: 8 })
  return { ...base, ...over, values: base.values, inputs: { ...base.inputs, ...over.inputs } }
}
const edit = applyRules(sd.rules, sel({ feature: "edit", inputs: { sourceVideo: true } }))
check("edit locks ratio to adaptive", edit.values.aspect_ratio === "adaptive" && !!edit.locked.aspect_ratio)
check("edit locks length to the model's own (0)", edit.values.duration === 0 && !!edit.locked.duration)
check("a lock carries a reason in plain words", /keeps the shape/i.test(edit.locked.aspect_ratio?.reason ?? ""))
const ext = applyRules(sd.rules, sel({ feature: "extend", inputs: { sourceVideo: true } }))
check("extend locks ratio but leaves length", ext.values.aspect_ratio === "adaptive" && ext.values.duration === 8 && !ext.locked.duration)
const frames = applyRules(sd.rules, sel({ inputs: { start: true, end: true } }))
check("start and end images lock the ratio and warn about shape", frames.values.aspect_ratio === "adaptive" && frames.warnings.some((w) => /same shape/.test(w)))
const mixed = applyRules(sd.rules, sel({ inputs: { start: true, images: 2 } }))
check("frames with references warn", mixed.warnings.some((w) => /cannot be mixed/.test(w)))
const plain = applyRules(sd.rules, sel())
check("plain text run: nothing locked", Object.keys(plain.locked).length === 0 && plain.values.aspect_ratio === "16:9")
check(
  "the 2.0 profile does not lock edit",
  Object.keys(applyRules(profileFor(rec("bytedance/seedance-2.0/text-to-video", "Seedance 2.0"))!.rules, sel({ feature: "edit", inputs: { sourceVideo: true } })).locked).length === 0,
)

const veoLike = [
  { id: "long", when: (s: Selection) => s.values.resolution === "1080p", only: { duration: [8] }, reason: "1080p needs 8 s" },
  { id: "fixed", when: (s: Selection) => s.inputs.images > 0, lock: (s: Selection) => ({ duration: s.values.resolution === "720p" ? 8 : 8 }), reason: "refs need 8 s" },
]
const narrowed = applyRules(veoLike, sel({ values: { resolution: "1080p", duration: 4 } }))
check("narrowing moves a value outside the list to its first", narrowed.values.duration === 8 && narrowed.narrowed.duration?.allowed[0] === 8)
check("a function lock is computed from the selection", applyRules(veoLike, sel({ values: { resolution: "720p", duration: 4 }, inputs: { images: 1 } })).values.duration === 8)

// Names: standard names and host fields
const host = rec("x", "x", "video", {
  ratio: { type: "string", enum: ["16:9", "9:16", "adaptive"] },
  duration: { type: "integer", minimum: -1, maximum: 30 },
  resolution: { type: "string", enum: ["480p", "720p"] },
  generate_audio: { type: "boolean" },
})
check("host fields found by standard name", hostFields(host).aspect_ratio === "ratio" && hostFields(host).sound === "generate_audio")
check("auto words", isAuto("adaptive") && isAuto("match_input_image") && isAuto(-1) && !isAuto("16:9"))
check("auto value from enum and from minimum -1", autoValueFor(host.params.properties.ratio) === "adaptive" && autoValueFor(host.params.properties.duration) === -1)
check("toHost writes duration 0 as -1", JSON.stringify(toHost(host, "duration", 0)) === JSON.stringify({ key: "duration", value: -1 }))
check("toHost writes adaptive in the host's own word", toHost(host, "aspect_ratio", "adaptive")?.value === "adaptive")
check("toHost keeps a value outside the list out", toHost(host, "resolution", "4k") === undefined)
const std = toStandard(host, { ratio: "16:9", duration: -1, generate_audio: 1 })
check("toStandard reads auto length as 0 and sound as boolean", std.duration === 0 && std.sound === true && std.aspect_ratio === "16:9")

// Shots, each maker's own syntax
const shots = [
  { text: "A cat sleeps", seconds: 3 },
  { text: "It wakes up", seconds: 2 },
]
check("seedance 2.5 timestamps", seedanceStoryboard(shots) === "0s-3s: A cat sleeps\n3s-5s: It wakes up")
check("wan storyboard", wanStoryboard(shots) === "0s - 3s: A cat sleeps\n3s - 5s: It wakes up")
check("numbered shots for 2.0", numberedShots(shots) === "Shot 1: A cat sleeps\nShot 2: It wakes up")
check("kling shots", klingShots(shots) === "shot 1, 3, A cat sleeps; shot 2, 2, It wakes up;")
check("kling shots drop semicolons inside a shot", klingShots([{ text: "a; b", seconds: 2 }]) === "shot 1, 2, a, b;")
check("even shots split whole seconds, last takes the rest", JSON.stringify(evenShots(["a", "b", "c"], 10).map((s) => s.seconds)) === "[3,3,4]")
check("lint: too many shots and too short", lintShots(shots, { maxShots: 1, min: 3 }).length === 2)

// The Seedance recipe writes the shots in its version's syntax
const shape25 = sd.recipe.shape!
const shape20 = profileFor(rec("bytedance/seedance-2.0/text-to-video", "Seedance 2.0"))!.recipe.shape!
const ctx = { prompt: "Night street.", selection: sel(), shots }
check("2.5 recipe writes timestamps", shape25(ctx) === "Night street.\n0s-3s: A cat sleeps\n3s-5s: It wakes up")
check("2.0 recipe writes Shot N", shape20(ctx).includes("Shot 2: It wakes up"))
check("recipe leaves a plain prompt alone", shape25({ prompt: "Night street.", selection: sel() }) === "Night street.")

// Camera commands (Hailuo)
check("camera words become commands in order", JSON.stringify(cameraCommands("slowly push in, then pan left")) === JSON.stringify(["Push in", "Pan left"]))
check("at most three commands", cameraCommands("push in, pan left, tilt up, zoom out, shake").length === 3)
check("commands go in one bracket in front", withCameraCommands("A dog runs.", ["Push in", "Pan left"]) === "[Push in,Pan left] A dog runs.")
check("a prompt with a bracket is left alone", withCameraCommands("[Zoom in] A dog runs.", ["Push in"]) === "[Zoom in] A dog runs.")
check("lint: more than three in a bracket", lintCamera("[Push in,Pan left,Tilt up,Zoom in] x").length === 1)

// The video makers: each host's record finds the right profile
const idOf = (endpoint: string, name: string) => profileFor(rec(endpoint, name))?.id
check("veo 3.1", idOf("fal-ai/veo3.1", "Veo 3.1") === "veo-3.1")
check("veo 3.1 image-to-video is the same model", idOf("fal-ai/veo3.1/image-to-video", "Veo 3.1") === "veo-3.1")
check("veo 3.1 fast", idOf("fal-ai/veo3.1/fast", "Veo 3.1 Fast") === "veo-3.1-fast")
check("veo 3.1 lite", idOf("fal-ai/veo3.1/lite", "Veo3.1 Lite Text to Video") === "veo-3.1-lite")
check("kling O3 is Omni", idOf("fal-ai/kling-video/o3/pro/text-to-video", "Kling O3 Text to Video [Pro]") === "kling-3.0-omni")
check("kling v3 plain has no profile yet", idOf("fal-ai/kling-video/v3/pro/text-to-video", "Kling Video v3 Text to Video [Pro]") === undefined)
check("wan 3.0", idOf("alibaba/wan-3.0/text-to-video", "Wan Text to Video") === undefined || idOf("alibaba/wan-3.0/text-to-video", "Wan 3.0 Text to Video") === "wan-3.0")
check("wan 3.0 prime", idOf("alibaba/wan-3.0-prime/image-to-video", "Wan 3.0 Prime") === "wan-3.0")
check("hailuo 2.3", idOf("minimax/hailuo-2.3/standard/text-to-video", "MiniMax Hailuo 2.3 Text to Video") === "hailuo-2.3")
check("hailuo 02", idOf("fal-ai/minimax/hailuo-02/standard/text-to-video", "MiniMax Hailuo 02 Text to Video") === "hailuo-02")

const veo = profileFor(rec("fal-ai/veo3.1", "Veo 3.1"))!
const hd = applyRules(veo.rules, sel({ values: { resolution: "1080p", duration: 4 } }))
check("veo 1080p moves length to 8", hd.values.duration === 8 && hd.narrowed.duration?.allowed.length === 1)
const refs = applyRules(veo.rules, sel({ values: { resolution: "720p", duration: 6 }, inputs: { images: 2 } }))
check("veo references need 8 s", refs.values.duration === 8)
const veoExt = applyRules(veo.rules, sel({ feature: "extend", values: { resolution: "1080p", duration: 6 }, inputs: { sourceVideo: true } }))
check("veo extension is 8 s at 720p", veoExt.values.duration === 8 && veoExt.values.resolution === "720p")
const lite = profileFor(rec("fal-ai/veo3.1/lite", "Veo3.1 Lite Text to Video"))!
check("veo lite warns about references", applyRules(lite.rules, sel({ inputs: { images: 1 } })).warnings.some((w) => /reference/i.test(w)))
check("veo full does not warn about references", applyRules(veo.rules, sel({ values: { resolution: "720p", duration: 8 }, inputs: { images: 1 } })).warnings.length === 0)

const kling = profileFor(rec("fal-ai/kling-video/o3/pro/text-to-video", "Kling O3"))!
const ks = applyRules(kling.rules, sel({ values: { duration: 5 }, shots: [3, 4, 3] }))
check("kling shots set the length", ks.values.duration === 10 && !!ks.locked.duration)
check("kling recipe writes shot lines", kling.recipe.shape!({ prompt: "", selection: sel(), shots })?.startsWith("shot 1, 3, A cat sleeps;"))
check("kling lint: seven shots", kling.recipe.lint!({ prompt: "", selection: sel(), shots: Array.from({ length: 7 }, () => ({ text: "x", seconds: 1 })) }).length > 0)

const wan = profileFor(rec("alibaba/wan-3.0-prime/image-to-video", "Wan 3.0 Prime"))!
check("wan shots set the length", applyRules(wan.rules, sel({ values: { duration: 5 }, shots: [5, 5] })).values.duration === 10)
check("wan frames with references warn", applyRules(wan.rules, sel({ inputs: { end: true, images: 1 } })).warnings.length === 1)
check("wan recipe writes a storyboard", wan.recipe.shape!({ prompt: "", selection: sel(), shots: [{ text: "a", seconds: 5 }, { text: "b", seconds: 5 }] }) === "0s - 5s: a\n5s - 10s: b")
check("wan lint: a 2 s shot", wan.recipe.lint!({ prompt: "", selection: sel(), shots: [{ text: "a", seconds: 2 }] }).length === 1)

const hl = profileFor(rec("minimax/hailuo-2.3/standard/text-to-video", "MiniMax Hailuo 2.3 Text to Video"))!
check("hailuo 1080P is 6 s", applyRules(hl.rules, sel({ values: { resolution: "1080P", duration: 10 } })).values.duration === 6)
check("hailuo 10 s is 768P", applyRules(hl.rules, sel({ values: { resolution: "1080p", duration: 6 } })).values.duration === 6 && applyRules(hl.rules, sel({ values: { resolution: "512P", duration: 10 } })).values.resolution === "768p")
check("hailuo recipe puts the camera in a bracket", hl.recipe.shape!({ prompt: "slow push in on a cat", selection: sel() }) === "[Push in] slow push in on a cat")

// Image and speech profiles
const imgId = (endpoint: string, name: string, modality: ModelRecord["modality"] = "image") => profileFor(rec(endpoint, name, modality))?.id
check("nano banana 2.1 and its edit", imgId("google/nano-banana-2.1", "Nano Banana 2.1") === "nano-banana-2.1" && imgId("google/nano-banana-2.1/edit", "Nano Banana 2.1 Edit") === "nano-banana-2.1")
check("nano banana 2 and Pro are not 2.1", imgId("fal-ai/nano-banana-pro/edit", "Nano Banana Pro") === undefined && imgId("google/nano-banana-2-lite", "Nano Banana 2 Lite") === undefined)
check("gpt image 2.5 sunburst", imgId("openai/gpt-image-2.5/sunburst/text-to-image", "GPT Image 2.5 Sunburst Text to Image") === "gpt-image-2.5")
check("gpt image 2 is not 2.5", imgId("openai/gpt-image-2", "GPT Image 2 API") === undefined)
check("flux 3 image", imgId("blackforestlabs/flux-3/text-to-image", "Flux 3 Image") === "flux-3-image")
check("eleven v3", imgId("fal-ai/elevenlabs/tts/eleven-v3", "Elevenlabs Tts Eleven V3", "audio") === "eleven-v3")
check("eleven v4 and Turbo", imgId("elevenlabs/tts/eleven-v4", "Eleven v4", "audio") === "eleven-v4" && imgId("elevenlabs/tts/eleven-v4-turbo", "Eleven v4 Turbo", "audio") === "eleven-v4")
const gpt = profileFor(rec("openai/gpt-image-2.5/sunburst/text-to-image", "GPT Image 2.5 Sunburst Text to Image", "image"))!
check("gpt lint: transparent jpeg", gpt.recipe.lint!({ prompt: "x", selection: sel({ values: { background: "transparent", output_format: "jpeg" } }) }).length === 1)
check("gpt lint: transparent png is fine", gpt.recipe.lint!({ prompt: "x", selection: sel({ values: { background: "transparent", output_format: "png" } }) }).length === 0)
const eleven = profileFor(rec("fal-ai/elevenlabs/tts/eleven-v3", "Eleven v3", "audio"))!
check("eleven lint: short text", eleven.recipe.lint!({ prompt: "Hello there.", selection: sel() }).length === 1)

// Speech and Grok profiles from the makers' own pages
check("gemini tts 3.8 matches, 3.1 does not", imgId("google/gemini-3.8-flash-tts", "Gemini 3.8 Flash TTS", "audio") === "gemini-tts-3.8" && imgId("google/gemini-3.1-flash-tts", "Gemini 3.1 Flash Tts", "audio") === undefined)
const gem = profileFor(rec("google/gemini-3.8-flash-tts", "Gemini 3.8 Flash TTS", "audio"))!
check("gemini lint: square-bracket tags", gem.recipe.lint!({ prompt: "Hello [laughs] there", selection: sel() }).length === 1 && gem.recipe.lint!({ prompt: "Hello <laugh> there", selection: sel() }).length === 0)
check("minimax speech 2.8 and 2.6", imgId("minimax/speech-2.8-hd", "Speech 2.8 Hd", "audio") === "minimax-speech-2.8" && imgId("minimax/speech-2.6-turbo", "Speech 2.6 Turbo", "audio") === "minimax-speech-2.6")
const mm = profileFor(rec("minimax/speech-2.8-hd", "Speech 2.8 Hd", "audio"))!
check("minimax 2.8 lint: whisper and doubled pauses", mm.recipe.lint!({ prompt: "a <#1#><#2#> b", selection: sel({ values: { emotion: "whisper" } }) }).length === 2)
const mm6 = profileFor(rec("minimax/speech-2.6-hd", "Speech 2.6 Hd", "audio"))!
check("minimax 2.6 lint: sound tags are 2.8 only", mm6.recipe.lint!({ prompt: "Hi (laughs)", selection: sel() }).length === 1)
check("grok imagine video", idOf("xai/grok-imagine-video", "Grok Imagine Video 1.5") === "grok-imagine-video" && idOf("xai/grok-imagine-video", "Grok Imagine Video") === "grok-imagine-video")

// A shot can carry its own length
check("planned: lengths typed on every line add up", (() => { const r = plannedShots(["4s A", "6s: B"], 5); return r.userSet && r.shots.map((s) => s.seconds).join() === "4,6" && r.shots[1]!.text === "B" })())
check("planned: the rest share what is left", plannedShots(["4s A", "B", "C"], 10).shots.map((s) => s.seconds).join() === "4,3,3")
check("planned: no lengths typed is the even split", !plannedShots(["A", "B"], 6).userSet && plannedShots(["A", "B"], 6).shots.map((s) => s.seconds).join() === "3,3")
const wanH = rec("alibaba/wan-3.0/text-to-video", "Wan 3.0 Text to Video", "video", { duration: { type: "integer", minimum: 2, maximum: 30 }, multi_shot: { type: "boolean", virtual: true } })
const wanTimed = shapeRun(wanH, "4s A knight rides.\n6s He reaches a gate.", { duration: 5, multi_shot: true })
check("seam: typed lengths write the storyboard and set the clip length", wanTimed.prompt === "0s - 4s: A knight rides.\n4s - 10s: He reaches a gate." && wanTimed.params.duration === 10 && !!wanTimed.locked.duration)
check("seam: an even split leaves the length free", Object.keys(shapeRun(wanH, "A.\nB.", { duration: 8, multi_shot: true }).locked).length === 0)

// Seedance tasks need the trigger words the maker lists
const sd25 = profileFor(rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5"))!
check("seedance edit without a trigger word is flagged", sd25.recipe.lint!({ prompt: "The man at night", selection: sel({ feature: "edit", inputs: { sourceVideo: true } }) }).some((w) => /what to do/i.test(w)))
check("seedance edit with a trigger word is fine", sd25.recipe.lint!({ prompt: "Replace the man with the knight in Image 1", selection: sel({ feature: "edit", inputs: { sourceVideo: true } }) }).length === 0)
check("seedance extend without a trigger word is flagged", sd25.recipe.lint!({ prompt: "A woman enters", selection: sel({ feature: "extend", inputs: { sourceVideo: true } }) }).length === 1)
check("seedance 2.5 has edit and extend tasks", (sd25.tasks ?? []).map((t) => t.id).join() === "edit,extend")

function sdHostForTask() {
  return rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5 Text to Video", "video", {
    ratio: { type: "string", enum: ["16:9", "9:16", "adaptive"] },
    duration: { type: "integer", minimum: -1, maximum: 30 },
  })
}
// The chosen task travels with the settings and never reaches a host
const taskRun = shapeRun(sdHostForTask(), "Replace the man.", { ratio: "16:9", duration: 8, __task: "edit" }, { sourceVideo: true })
check("seam: a chosen task locks like an edit and is not sent", taskRun.params.ratio === "adaptive" && taskRun.params.duration === -1 && !("__task" in taskRun.params))
check("a double-underscore key is never sent", !("__task" in buildInput(sdHostForTask(), "x", { __task: "edit", duration: 5 })))

// The seam: one function shapes a run for every caller
const wanHost = rec("alibaba/wan-3.0/text-to-video", "Wan 3.0 Text to Video", "video", {
  duration: { type: "integer", minimum: 2, maximum: 30 },
  resolution: { type: "string", enum: ["720p", "1080p"] },
  multi_shot: { type: "boolean", virtual: true },
})
const lines = "A knight rides.\nHe reaches a gate.\nThe gate opens."
const w = shapeRun(wanHost, lines, { duration: 12, multi_shot: true })
check("seam: shot lines become the maker's storyboard", w.prompt === "0s - 4s: A knight rides.\n4s - 8s: He reaches a gate.\n8s - 12s: The gate opens." && w.profiled)
check("seam: shots off leaves the prompt alone", shapeRun(wanHost, lines, { duration: 12 }).prompt === lines)
const sdHost = rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5 Text to Video", "video", {
  ratio: { type: "string", enum: ["16:9", "9:16", "adaptive"] },
  duration: { type: "integer", minimum: -1, maximum: 30 },
  generate_audio: { type: "boolean" },
})
const e = shapeRun(sdHost, "Replace the man.", { ratio: "16:9", duration: 8 }, { sourceVideo: true, images: 1 }, "edit")
check("seam: edit writes the host's own words for the locks", e.params.ratio === "adaptive" && e.params.duration === -1)
check("seam: the locks say why", /keeps the shape/.test(e.locked.ratio ?? ""))
check("seam: no feature leaves the settings alone", shapeRun(sdHost, "x", { ratio: "16:9", duration: 8 }, { sourceVideo: true }).params.ratio === "16:9")
const h = shapeRun(sdHost, "x", { ratio: "16:9", duration: 8 }, { start: true })
check("seam: a start image makes the ratio follow it", h.params.ratio === "adaptive")
const sd2 = shapeRun(rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5", "video", { multi_shot: { type: "boolean", virtual: true } }), "One.\nTwo.", { multi_shot: true, duration: 6 })
check("seam: Seedance 2.5 shots carry timestamps", sd2.prompt === "0s-3s: One.\n3s-6s: Two.")
const extra = shapeRun(wanHost, `${lines}\n\nStyle: noir.`, { duration: 12, multi_shot: true })
check("seam: what the composer adds stays out of the shots", extra.prompt.endsWith("8s - 12s: The gate opens.\n\nStyle: noir.") && extra.prompt.split("\n").filter((l) => /^\d/.test(l)).length === 3)
check("seam: a host with its own multi-shot switch is left alone", shapeRun(rec("alibaba/wan-3.0/text-to-video", "Wan 3.0", "video", { multi_shot: { type: "boolean" } }), lines, { duration: 12, multi_shot: true }).prompt === lines)
const offered = withOfficial({ ...rec("bytedance/seedance-2.5", "Seedance 2.5"), provider: "replicate" } as ModelRecord)
check("a maker that takes shots in the prompt gets Multi-shot", offered.params.properties.multi_shot?.virtual === true)
check("a host with its own switch does not get a second one", withOfficial(rec("bytedance/seedance-2.5", "Seedance 2.5", "video", { multi_shot: { type: "boolean" } })).params.properties.multi_shot?.virtual !== true)
const attached = [{ id: "a", name: "Aria", url: "u1" }, { id: "b", name: "Gate", url: "u2" }]
const plainCompose = composePrompt({ prompt: "@Aria walks to @Gate", elements: [], references: attached, referenceLimit: 5 })
check("compose: default words are image N", plainCompose.prompt.startsWith("Aria (image 1) walks to Gate (image 2)"))
const tagged = composePrompt({ prompt: "@Aria walks to @Gate", elements: [], references: attached, referenceLimit: 5, imageTag: profileFor(rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5"))!.imageTag })
check("compose: Seedance numbers by upload order", tagged.prompt.startsWith("Aria (Image 1) walks to Gate (Image 2)"))
const fluxTag = profileFor(rec("blackforestlabs/flux-3/text-to-image", "Flux 3 Image", "image"))!.imageTag!
check("compose: FLUX 3 counts from zero in angle brackets", fluxTag(1) === "<ref_image_0>" && fluxTag(3) === "<ref_image_2>")
check("flux 3 video", profileFor(rec("blackforestlabs/flux-3/text-to-video", "Flux 3"))?.id === "flux-3-video" && profileFor(rec("blackforestlabs/flux-3/text-to-image", "Flux 3 Image", "image"))?.id === "flux-3-image")
check("flux 3 continuation is capped", applyRules(profileFor(rec("blackforestlabs/flux-3/text-to-video", "Flux 3"))!.rules, sel({ values: { duration: 20 }, inputs: { sourceVideo: true } })).warnings.length === 1)
const plainModel = shapeRun(rec("x/unknown", "Unknown Model"), "Hello", { a: 1 })
check("seam: a model with no profile passes through", plainModel.prompt === "Hello" && !plainModel.profiled && plainModel.params.a === 1)
const hailuoHost = rec("minimax/hailuo-2.3/standard/text-to-video", "MiniMax Hailuo 2.3 Text to Video", "video", { prompt_optimizer: { type: "boolean" }, duration: { type: "integer" } })
const hh = shapeRun(hailuoHost, "pan left across the beach", { duration: 6 })
check("seam: Hailuo gets a camera bracket and its optimizer default", hh.prompt === "[Pan left] pan left across the beach" && hh.params.prompt_optimizer === true)
check("seam: a default never overrides the person's choice", shapeRun(hailuoHost, "x", { prompt_optimizer: false }).params.prompt_optimizer === false)

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
process.exit(fails ? 1 : 0)

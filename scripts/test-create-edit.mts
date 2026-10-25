import { withOfficial } from "../src/lib/registry/official-specs"
import { shotsSwitch } from "../src/lib/registry/shots"
import { shapeRun } from "../src/lib/models/apply"
import { buildInput } from "../src/lib/registry/request"
import { MAX_REPEAT, repeatOf } from "../src/lib/registry/param-logic"
import { parseShotRows as parseShots, serializeShotRows as serializeShots } from "../src/lib/models/recipes/shots"
import "../src/lib/models/profiles"
import { composePrompt } from "../src/lib/elements/compose"
import { editActionsFor } from "../src/lib/registry/edit-actions"
import { enhancePrompt, keepsOriginal } from "../src/lib/models/enhance"
import { freshSeed } from "../src/lib/models/seed"
import { clampDockWidth, dock, DOCK_DEFAULT } from "../src/lib/ui/composer-dock"
import { allChips, chipFromError, clearChips, dismissChip, maskSecrets, raiseChip } from "../src/lib/ui/chips"
import type { ElementItem } from "../src/lib/elements/types"
import type { ModelRecord } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const rec = (endpoint: string, name: string, modality: ModelRecord["modality"] = "video", props: ModelRecord["params"]["properties"] = {}) =>
  ({ id: `x/${endpoint}`, endpoint, name, modality, provider: "fal", params: { type: "object", properties: props } }) as ModelRecord

// Shots switch: the host's own yes/no switch under either spelling, or the app's own for a maker that writes shots in the prompt
check("multi_shots (native) is the switch", shotsSwitch(rec("wan/2.6", "Wan 2.6", "video", { multi_shots: { type: "boolean" } }))?.key === "multi_shots")
check("native switch is not virtual", shotsSwitch(rec("wan/2.6", "Wan 2.6", "video", { multi_shot: { type: "boolean" } }))?.virtual === false)
check("a rejected switch is not offered", shotsSwitch(rec("wan/2.6", "Wan 2.6", "video", { multi_shots: { type: "boolean", rejected: true } })) === undefined)
check("an image model has no shots", shotsSwitch(rec("x/img", "Img", "image", { multi_shot: { type: "boolean" } })) === undefined)

// Kling 3.0 Omni on fal lists shot_type and multi_prompt but no yes/no switch: it still gets the Shots switch
const kling = rec("fal-ai/kling-video/o3/standard/text-to-video", "Kling 3.0 Omni Text to Video", "video", {
  shot_type: { type: "string", enum: ["customize", "intelligent"] },
  multi_prompt: { type: "array" },
  duration: { type: "integer", minimum: 3, maximum: 15 },
})
const klingOffered = withOfficial(kling)
check("Kling on fal gets the Shots switch", shotsSwitch(klingOffered)?.virtual === true)
check("a host with a native yes/no switch keeps it alone", shotsSwitch(withOfficial(rec("bytedance/seedance-2.5", "Seedance 2.5", "video", { multi_shot: { type: "boolean" } })))?.virtual === false)
const klingRun = shapeRun(klingOffered, "A knight rides.\nHe reaches a gate.", { duration: 6, multi_shot: true })
check("Kling shots are written in its syntax", /^shot 1, 3, A knight rides\.; shot 2, 3, He reaches a gate\.;$/.test(klingRun.prompt), klingRun.prompt)

// Shot strip: the value is one shot per line, with a length when the person set one
const rows = parseShots("4s A knight rides.\nHe reaches a gate.")
check("strip: a length prefix is read", rows[0]!.seconds === "4" && rows[0]!.text === "A knight rides." && rows[1]!.seconds === "")
check("strip: round trip keeps lengths", serializeShots(rows, true) === "4s A knight rides.\nHe reaches a gate.")
check("strip: empty shots are not written", serializeShots([{ text: "A", seconds: "" }, { text: " ", seconds: "3" }], true) === "A")
check("strip: lengths are left out when the host reads the prompt itself", serializeShots(rows, false) === "A knight rides.\nHe reaches a gate.")
check("strip: an empty value is one blank shot", parseShots("").length === 1)
const timed = shapeRun(klingOffered, serializeShots([{ text: "A knight rides.", seconds: "4" }, { text: "He reaches a gate.", seconds: "2" }], true), { duration: 10, multi_shot: true })
check("strip: shot lengths add up to the clip", /shot 1, 4,.*shot 2, 2,/.test(timed.prompt), timed.prompt)

// Send as typed: the maker's rules hold, its prompt shape and starting values are skipped
const hailuo = rec("minimax/hailuo-2.3/standard/text-to-video", "MiniMax Hailuo 2.3 Text to Video", "video", { prompt_optimizer: { type: "boolean" }, duration: { type: "integer" } })
const shaped = shapeRun(hailuo, "pan left across the beach", { duration: 6 })
check("shaped: Hailuo gets a camera bracket", shaped.prompt === "[Pan left] pan left across the beach" && shaped.params.prompt_optimizer === true)
const typed = shapeRun(hailuo, "pan left across the beach", { duration: 6, __plain: true })
check("as typed: the words are untouched", typed.prompt === "pan left across the beach")
check("as typed: the starting values are skipped", !("prompt_optimizer" in typed.params))
check("as typed: the flag is never sent", !("__plain" in typed.params))
const typedShots = shapeRun(klingOffered, "A knight rides.\nHe reaches a gate.", { duration: 6, multi_shot: true, __plain: true })
check("as typed: shots still use the maker's syntax", /^shot 1,/.test(typedShots.prompt), typedShots.prompt)

// Elements: pictures where the model takes them, the element's own words where it does not, presets as words everywhere
const el = (id: string, category: ElementItem["category"], name: string, imageUrls: string[], text = ""): ElementItem => ({ id, category, name, imageUrls, text, origin: "written", createdAt: 0 })
const aria = el("a", "character", "Aria", ["u1"], "a tall woman with short red hair")
const bare = el("b", "location", "Gate", ["u2"])
const camera = el("c", "camera", "Push in", [], "slow push in")
const withSlots = composePrompt({ prompt: "@Aria at the gate", elements: [aria, camera], references: [], referenceLimit: 3 })
check("elements: a picture slot sends the picture", withSlots.imageUrls.length === 1 && /Sent as image 1/.test(withSlots.reads.a ?? ""), JSON.stringify(withSlots.reads))
check("elements: a look is added as words", /camera: slow push in/.test(withSlots.prompt) && /Added to the prompt/.test(withSlots.reads.c ?? ""))
const noSlots = composePrompt({ prompt: "@Aria at the gate", elements: [aria, bare, camera], references: [], referenceLimit: 0 })
check("elements: no picture slot, the element's words stand in", noSlots.imageUrls.length === 0 && /Aria \(character\): a tall woman with short red hair/.test(noSlots.prompt), noSlots.prompt)
check("elements: words are said to be used", /written into the prompt in words/i.test(noSlots.reads.a ?? ""))
check("elements: no picture slot and no words, it is left out and says so", !noSlots.prompt.includes("Gate (") && /Left out/.test(noSlots.reads.b ?? "") && noSlots.notes.some((n) => /Gate was left out/.test(n)))
check("elements: the look still works with no picture slot", /camera: slow push in/.test(noSlots.prompt))
const crowded = composePrompt({ prompt: "x", elements: [aria, el("d", "character", "Bo", ["u3"], "a short man in blue")], references: [], referenceLimit: 1 })
check("elements: more than fit, the rest go in words", crowded.imageUrls.length === 1 && /Bo \(character\): a short man in blue/.test(crowded.prompt), crowded.prompt)

// The opened video: only actions a switched-on model really has
const slotVideo = { type: "string", slot: { kind: "video", role: "source", list: false, max: 1 } } as never
const slotVideos = { type: "array", slot: { kind: "video", role: "reference", list: true, max: 10 } } as never
const seedanceRef = rec("bytedance/seedance-2.5/reference-to-video", "Seedance 2.5 Reference to Video", "video", { reference_videos: slotVideos })
const seedanceText = rec("bytedance/seedance-2.5/text-to-video", "Seedance 2.5 Text to Video", "video", {})
const klingMotion = rec("fal-ai/kling-video/v3/pro/motion-control", "Kling 3.0 Motion Control", "video", { video_url: slotVideo })
const klingEdit = rec("fal-ai/kling-video/o3/video-edit", "Kling 3.0 Omni Edit Video", "video", { video_url: slotVideo })
const everything = [seedanceRef, seedanceText, klingMotion, klingEdit]
const on = (...r: ModelRecord[]) => new Set(r.map((x) => x.id))
const kinds = (a: ReturnType<typeof editActionsFor>) => a.map((x) => x.kind).join()
check("edit actions: nothing switched on, nothing offered", editActionsFor(everything, new Set()).length === 0)
check("edit actions: a model without a video input offers nothing", editActionsFor([seedanceText], on(seedanceText)).length === 0)
const seedanceOnly = editActionsFor(everything, on(seedanceRef))
check("edit actions: Seedance 2.5 takes edit and extend as tasks", kinds(seedanceOnly) === "edit,extend" && seedanceOnly.every((a) => a.task === a.kind), kinds(seedanceOnly))
const motionOnly = editActionsFor(everything, on(klingMotion))
check("edit actions: a motion-control endpoint offers motion transfer, needing a picture", kinds(motionOnly) === "motion-transfer" && motionOnly[0]!.alsoNeeds === "image" && !motionOnly[0]!.task)
const both = editActionsFor(everything, on(seedanceRef, klingEdit))
check("edit actions: a model's own edit endpoint beats a task inside another model", both.find((a) => a.kind === "edit")?.record.id === klingEdit.id && both.find((a) => a.kind === "extend")?.record.id === seedanceRef.id, JSON.stringify(both.map((a) => a.id)))
check("edit actions: no upscale, background removal or relight is ever offered", editActionsFor(everything, on(...everything)).every((a) => ["edit", "extend", "lip-sync", "motion-transfer"].includes(a.kind)))

// Quiet prompt improvement: only what is missing, only for a short prompt, the person's words untouched
const short = enhancePrompt("a knight at dusk", { modality: "image" })
check("enhance: a short prompt gets the missing camera and style, not the light it already has", short.added.join() === "camera,style" && !short.added.includes("light"), JSON.stringify(short))
check("enhance: the person's words come first, unchanged", short.prompt.startsWith("a knight at dusk."))
check("enhance: the original is kept as written", keepsOriginal("a knight at dusk", short.prompt))
check("enhance: nothing added to a prompt that already says it all", enhancePrompt("a knight at dusk, soft rim light, close-up, cinematic film still", { modality: "image" }).added.length === 0)
check("enhance: a detailed prompt is left alone", enhancePrompt(Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "), { modality: "image" }).prompt.split(" ").length === 30)
check("enhance: video also gets motion", enhancePrompt("a knight", { modality: "video" }).added.includes("motion"))
check("enhance: shots on lines are left alone", enhancePrompt("4s A knight rides.\nHe reaches a gate.", { modality: "video" }).added.length === 0)
check("enhance: a mention or tagged reference is left alone", enhancePrompt("@Aria walks", { modality: "video" }).added.length === 0 && enhancePrompt("Image 1 walks", { modality: "video" }).added.length === 0)
check("enhance: text that must appear is left alone", enhancePrompt('a sign that says "OPEN"', { modality: "image" }).added.length === 0)
check("enhance: attached files, tasks and a native enhancer switch it off", enhancePrompt("a knight", { modality: "image", hasFiles: true }).added.length === 0 && enhancePrompt("a knight", { modality: "video", hasTask: true }).added.length === 0 && enhancePrompt("a knight", { modality: "image", nativeOn: true }).added.length === 0)
check("enhance: audio and text are never touched", enhancePrompt("a calm voice", { modality: "audio" }).added.length === 0 && enhancePrompt("hi", { modality: "text" }).added.length === 0)
check("enhance: off means off", enhancePrompt("a knight", { modality: "image", off: true }).added.length === 0)

const imageHost = rec("fal-ai/some-image", "Some Image", "image", { seed: { type: "integer", default: 5555 } })
const preview = shapeRun(imageHost, "a knight", { seed: 5555 })
check("seam: the preview is not changed (no improvement, no new seed)", preview.prompt === "a knight" && preview.params.seed === 5555 && preview.improved.length === 0)
const liveRun = shapeRun(imageHost, "a knight", { seed: 5555 }, {}, undefined, true)
check("seam: a real run improves a short prompt", liveRun.prompt.startsWith("a knight.") && liveRun.improved.length > 0, liveRun.prompt)
check("seam: a real run replaces a fixed default seed", typeof liveRun.params.seed === "number" && liveRun.params.seed !== 5555)
check("seam: a seed the person typed is kept", shapeRun(imageHost, "a knight", { seed: 42 }, {}, undefined, true).params.seed === 42)
check("seam: the switch in Settings turns improvement off", shapeRun(imageHost, "a knight", { seed: 5555, __noenhance: true }, {}, undefined, true).prompt === "a knight")
check("seam: sent as typed also skips it", shapeRun(imageHost, "a knight", { __plain: true }, {}, undefined, true).prompt === "a knight")
check("seam: files attached, nothing added", shapeRun(imageHost, "a knight", {}, { images: 1 }, undefined, true).prompt === "a knight")
check("seam: the flags are never sent", !("__noenhance" in shapeRun(imageHost, "a knight", { __noenhance: true }, {}, undefined, true).params))
const twice = new Set([1, 2, 3, 4, 5].map(() => shapeRun(imageHost, "a knight", {}, {}, undefined, true).params.seed))
check("seam: each run gets its own seed", twice.size > 1)

// Seeds
const seedRec = (def: unknown, extra: object = {}) => rec("x/seeded", "Seeded", "image", { seed: { type: "integer", default: def, ...extra } as never })
const lo = () => 0
const hi = () => 0.999999
check("seed: a fixed default is replaced", freshSeed(seedRec(5555), 5555, lo)?.value === 0 && (freshSeed(seedRec(5555), 5555, hi)?.value ?? 0) > 2_000_000_000)
check("seed: the person's own number is kept", freshSeed(seedRec(5555), 7, lo) === undefined)
check("seed: an unset default is left to the host", freshSeed(seedRec(undefined), undefined, lo) === undefined)
check("seed: a host's random marker (-1) is left", freshSeed(seedRec(-1), -1, lo) === undefined)
check("seed: a model with no seed field gets none", freshSeed(rec("x/none", "None", "image", {}), undefined, lo) === undefined)
check("seed: the model's own range is respected", (freshSeed(seedRec(10, { minimum: 0, maximum: 99 }), 10, hi)?.value ?? 1000) <= 99)

// Error chips: every error becomes one chip, with the right actions, nothing secret, no duplicates
const kindsToCheck: Array<[string, string, string]> = [
  ["HTTP 401 Unauthorized: invalid api key", "auth", "settings"],
  ["HTTP 402 Payment required: insufficient credits", "credit", "settings"],
  ["HTTP 429 Too many requests", "rate-limit", "retry"],
  ["HTTP 503 Service unavailable", "provider-fault", "retry"],
  ["The request timed out", "timeout", "retry"],
  ["Failed to fetch", "network", "retry"],
]
for (const [raw, kind, action] of kindsToCheck) {
  const c = chipFromError(raw, { provider: "fal", model: "Wan" }, { retry: () => undefined })
  check(`chips: "${raw.slice(0, 30)}" is a ${kind} chip with ${action}`, c.kind === kind && (c.actions as string[]).includes(action) && c.level === "error", `${c.kind} ${c.actions.join()}`)
}
check("chips: no retry offered when there is nothing to retry", !chipFromError("HTTP 503 Service unavailable", {}, {}).actions.includes("retry"))
check("chips: a missing key offers settings, not retry", (() => { const c = chipFromError("No fal key is set. Add one in Settings.", { provider: "fal" }, { retry: () => undefined }); return c.actions.includes("settings") && !c.actions.includes("retry") })())
check("chips: keys and tokens are masked", !/sk-abcdefgh12345|r8_secret123456|Bearer abcdef123456789/.test(maskSecrets("failed with Bearer abcdef123456789 and sk-abcdefgh12345 and r8_secret123456")))
check("chips: an api_key value is masked", !maskSecrets('{"api_key": "abcd1234efgh5678"}').includes("abcd1234efgh5678"))
check("chips: the raw text is masked too", !chipFromError("HTTP 401 Bearer abcdef123456789 rejected", { provider: "fal" }).raw!.includes("abcdef123456789"))
clearChips(/./)
raiseChip({ key: "k1", level: "warning", kind: "input", title: "Needs start image", message: "m" })
raiseChip({ key: "k1", level: "warning", kind: "input", title: "Needs start image", message: "m" })
check("chips: the same key is one chip", allChips().length === 1)
raiseChip({ key: "k2", level: "error", kind: "unknown", title: "Something went wrong", message: "m" })
check("chips: different keys are separate chips", allChips().length === 2)
clearChips("k1")
check("chips: a fixed warning clears by key", allChips().length === 1 && allChips()[0]!.key === "k2")
dismissChip(allChips()[0]!.id)
check("chips: dismissing removes it", allChips().length === 0)
raiseChip({ key: "error:a", level: "error", kind: "unknown", title: "x", message: "m" })
raiseChip({ key: "limit:b", level: "info", kind: "limit", title: "y", message: "m" })
clearChips(/^(error|limit):/)
check("chips: a new run clears the last run's errors and limits", allChips().length === 0)

// One dock setting for every screen with a composer
check("dock: starts at the bottom with the default width", dock.get().side === "bottom" && dock.get().width === DOCK_DEFAULT.width)
dock.setSide("right")
check("dock: docking right is one shared choice", dock.get().side === "right")
dock.setWidth(5)
check("dock: width stays within its limits (low)", dock.get().width === 18)
dock.setWidth(99)
check("dock: width stays within its limits (high)", dock.get().width === 45)
dock.reset()
check("dock: reset goes back to the default width and keeps the side", dock.get().width === DOCK_DEFAULT.width && dock.get().side === "right")
check("dock: an unreadable width falls back to the default", clampDockWidth(Number.NaN) === DOCK_DEFAULT.width)
dock.setSide("bottom")

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
process.exit(fails ? 1 : 0)

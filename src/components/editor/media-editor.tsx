import { Camera, ChevronDown, Contrast, Paintbrush, RotateCcw, RotateCw, X, Crop, Eraser, ImagePlus, Lock, Maximize2, Palette, Plus, SlidersHorizontal, Smile, Sparkles, Sun, Unlock, Wand2 } from "lucide-react"
import * as React from "react"
import { useToolContext } from "@/components/ai-tools/use-tool-context"
import type { ToolHost } from "@/components/ai-tools/tool-host"
import type { DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import { byTier, isEditable } from "@/components/composer/schema-form"
import { ModelPickerButton } from "@/components/models/model-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import toolOptions from "@/lib/knowledge/tool-options.json"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { ErrorNotice } from "@/components/ui/error-notice"
import { explainError } from "@/lib/errors/explain"
import { showNotice } from "@/lib/notice"
import { ColorDot, ColorStrip } from "@/components/ui/color-dot"
import { SettingSegments, SettingSelect, SettingSlider, SettingSwitch } from "@/components/ui/setting-field"
import { choiceWords, editorInfo, settingWords } from "@/lib/registry/setting-words"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toolById } from "@/lib/ai-tools/catalog"
import { modelsForJob, statusOf } from "@/lib/ai-tools/match"
import { verbOfJob } from "@/lib/capability"
import { priceOf, paramsFor, runTool } from "@/lib/ai-tools/run"
import type { ToolSpec } from "@/lib/ai-tools/types"
import { capabilityOfExact } from "@/lib/capability"
import { centred, cropped, sizeOf } from "@/lib/media/image-ops"
import { FX, GRADING_RANGES, markedPicture, maskOf, wand, type Stroke, MIXER_COLOURS, adjustDefaults, adjusted, applyFx, composited, fxDefaults, isNeutral, tone4Defaults, type AdjustSettings, type GradingRange, type MixerColour, type Tone4 } from "@/lib/media/image-fx"
import type { ModelRecord } from "@/lib/registry/types"
import type { MediaAsset, SettingsState } from "@/types"
import { cn } from "@/lib/utils"

/**
 * The full-screen editor for a picture, clip or sound. A picture: versions on the left (the original first, never changed), the picture in
 * the middle, the edit options on the right and one prompt bar below. Every result is a new version and is also saved to the Library.
 * Options that need a model pick the best one by the capability rule (Auto) and the person can choose another; crop, adjust and filters
 * run in the app, free. A clip or a sound uses the same layout with the edit panel of its kind.
 */

interface Version {
  id: string
  url: string
  label: string
}

/** A job done by a model that edits a picture as words say, with no card of its own in the catalog */
const EDIT: ToolSpec = { id: "image-edit", name: "Edit", group: "image", kind: "model", hint: "Changes a picture as you describe", output: "image", instruction: "{prompt}", prompt: { label: "What to change", placeholder: "Describe the change", required: true } }

/** The standard options of each job, from the data file: a pattern on the setting names providers use, and the job's own name for it */
const STANDARD: Record<string, Array<{ label: string; keys: RegExp }>> = Object.fromEntries(Object.entries(toolOptions.jobs).map(([job, list]) => [job, list.map((o) => ({ label: o.label, keys: new RegExp(o.keys) }))]))

/** The same jobs when the area to change is a real mask: only models that have a mask field are offered */
const MASK_NEED = [{ kind: "image" as const, label: "Area to change", role: "mask" as const, required: true }]
const EDIT_MASKED: ToolSpec = { ...EDIT, needs: MASK_NEED }
const ERASE_MASKED: ToolSpec = { ...toolById("image-remove-object")!, needs: MASK_NEED, prompt: { label: "What to remove", placeholder: "", required: false }, instruction: "Remove what is inside the masked area and fill it so it looks natural. Change nothing else. {prompt}" }

type OptionId = "upscale" | "resize" | "background" | "camera" | "skin" | "relight" | "adjust" | "restyle" | "filters"
const OPTIONS: Array<{ id: OptionId; name: string; icon: React.ElementType }> = [
  { id: "upscale", name: "Upscale", icon: Maximize2 },
  { id: "resize", name: "Resize", icon: Crop },
  { id: "background", name: "Background", icon: Eraser },
  { id: "camera", name: "Change camera", icon: Camera },
  { id: "skin", name: "Skin enhancer", icon: Smile },
  { id: "relight", name: "Relight", icon: Sun },
  { id: "adjust", name: "Adjust", icon: SlidersHorizontal },
  { id: "restyle", name: "Restyle", icon: Wand2 },
  { id: "filters", name: "Filters", icon: Palette },
]

const RATIOS: Array<[string, number]> = [["1:1", 1], ["21:9", 21 / 9], ["16:9", 16 / 9], ["9:16", 9 / 16], ["2:3", 2 / 3], ["3:4", 3 / 4], ["1:2", 1 / 2]]
const MORE_RATIOS: Array<[string, number]> = [["4:5", 4 / 5], ["5:4", 5 / 4], ["3:2", 3 / 2], ["4:3", 4 / 3], ["9:21", 9 / 21]]
const FILLS = ["transparent", "white", "black", "salmon", "gold", "limegreen", "lightseagreen", "royalblue", "mediumpurple", "deeppink", "gray", "gradient"]
const DIRECTIONS: Array<[string, number, number]> = [["Top", 0, 80], ["Front", 0, 0], ["Right", 90, 0], ["Left", 270, 0], ["Back", 180, 0], ["Bottom", 0, -80]]
const LIGHT_COLOURS: Array<[string, string]> = [["white", "white"], ["warm", "gold"], ["orange", "orange"], ["red", "tomato"], ["pink", "hotpink"], ["blue", "lightskyblue"], ["green", "limegreen"]]
const SKIN_VERSIONS = ["Faithful", "Creative", "Flexible"]
const SKIN_FOR = ["Enhance skin", "Enhance everything", "Improve light", "Transform to real", "No makeup"]
const UPSCALE_FOR = ["Standard Ultra", "Portrait (Soft)", "Portrait (Hard)", "Art & Illustration", "Videogame Assets", "Nature & Landscapes", "Films & Photography", "3D Renders", "Science Fiction & Horror"]
const PRESETS: Record<string, { creativity: number; hdr: number; resemblance: number; fractality: number }> = {
  Subtle: { creativity: -3, hdr: 0, resemblance: 3, fractality: 0 },
  Vivid: { creativity: 1, hdr: 3, resemblance: 0, fractality: 1 },
  Wild: { creativity: 4, hdr: 5, resemblance: -2, fractality: 3 },
}
const STYLES = ["Classic anime", "Vector", "3D character", "Dotted", "Holographic", "Risograph", "Neoclassical", "Fantasy art", "Whimsy", "Moody black and white", "Oil painting", "Watercolour"]
const PALETTES: Array<[string, string[]]> = [
  ["Wildgrove", ["darkolivegreen", "olivedrab", "khaki", "wheat"]],
  ["Candy pink", ["hotpink", "pink", "lavenderblush", "plum"]],
  ["Mistwood", ["slategray", "darkseagreen", "lightgray", "tan"]],
  ["Cotton candy", ["lightskyblue", "pink", "thistle", "white"]],
  ["Red love", ["darkred", "crimson", "tomato", "mistyrose"]],
  ["Blue and yellow", ["navy", "royalblue", "gold", "lemonchiffon"]],
  ["Green forest", ["darkgreen", "forestgreen", "seagreen", "palegreen"]],
  ["Frozen mist", ["lightcyan", "lightsteelblue", "white", "powderblue"]],
  ["Icy depth", ["midnightblue", "steelblue", "lightblue", "azure"]],
  ["Forest mist", ["darkslategray", "cadetblue", "darkseagreen", "honeydew"]],
]

function SliderRow(props: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return <SettingSlider {...props} info={editorInfo(props.label)} />
}

/** A model that takes a second picture along with the first (a light to copy, a background to use, a look to follow) */
const takesTwo = (r: ModelRecord) => capabilityOfExact(r).takes.filter((t) => t.kind === "image").reduce((n, t) => n + t.max, 0) >= 2

type MyFilter = { id: string; name: string; fx: string; vals: Record<string, number> }
const MINE_KEY = "gencraft.myFilters"
const readMine = (): MyFilter[] => {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]") as MyFilter[]
  } catch {
    return []
  }
}
const writeMine = (list: MyFilter[]) => {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(list))
  } catch {
    /* kept for this session only */
  }
}

/** The models found for each job, kept while the same models and keys are in use */
const jobCache = new WeakMap<object, Map<string, ModelRecord[]>>()

const NO_SETTINGS = { aiEngine: {} } as unknown as SettingsState

/**
 * The Edit tab of the picture popup: one session (versions, zoom, the open option, the busy state) shared by the picture in the middle, the
 * bar below it and the options on the right, so Info, Edit and Comments are all one popup. Nothing runs until an option is used.
 */
export function useEditSession(item: DetailMediaItem, host: ToolHost | null) {
  const settings = host?.settings ?? NO_SETTINGS
  const ctx = useToolContext(settings)
  const kind = item.type
  const [versions, setVersions] = React.useState<Version[]>([{ id: "original", url: item.url, label: "Original" }])
  const [currentId, setCurrentId] = React.useState("original")
  const current = versions.find((v) => v.id === currentId) ?? versions[0]!
  const [open, setOpen] = React.useState<OptionId | null>(null)
  const [busy, setBusy] = React.useState(false)
  const stopper = React.useRef<AbortController | null>(null)
  // Why the last run failed (shown by the standard error card), and what is being worked on now
  const [failure, setFailure] = React.useState<{ raw: string; provider?: string; model?: string } | null>(null)
  const [busyLabel, setBusyLabel] = React.useState<string | null>(null)
  const lastRun = React.useRef<(() => void) | null>(null)
  const [prompt, setPrompt] = React.useState("")
  const [picked, setPicked] = React.useState<Record<string, string>>({})
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  React.useEffect(() => {
    if (kind !== "image") return
    // The picture on screen sets the size when the pixels cannot be read (a provider's address that forbids it)
    void sizeOf(current.url)
      .then(setSize)
      .catch(() => {
        const probe = new Image()
        probe.onload = () => setSize({ w: probe.naturalWidth, h: probe.naturalHeight })
        probe.src = current.url
      })
  }, [current.url, kind])

  // Marks on the picture, and the tools that draw them
  const [marks, setMarks] = React.useState<Stroke[]>([])
  const [undone, setUndone] = React.useState<Stroke[]>([])
  const [marking, setMarking] = React.useState(false)
  const [tool, setTool] = React.useState<"retouch" | "erase" | "annotate">("retouch")
  const [pen, setPen] = React.useState<"brush" | "polygon" | "freehand" | "select">("brush")
  const [refUrl, setRefUrl] = React.useState<string | null>(null)
  const [cropBox, setCropBox] = React.useState({ x: 0, y: 0, w: 1, h: 1 })
  const [mine, setMine] = React.useState<MyFilter[]>(readMine)
  const [fxTab, setFxTab] = React.useState("official")
  const [brush, setBrush] = React.useState(30)
  const [markColour, setMarkColour] = React.useState<"primary" | "destructive" | "foreground">("primary")
  const [precise, setPrecise] = React.useState(false)
  const addMark = (s: Stroke) => {
    setMarks((m) => [...m, s.kind === "pin" ? { ...s, n: m.filter((x) => x.kind === "pin").length + 1 } : s])
    setUndone([])
  }
  const undo = () => setMarks((m) => (m.length ? (setUndone((u) => [...u, m[m.length - 1]!]), m.slice(0, -1)) : m))
  const redo = () => setUndone((u) => (u.length ? (setMarks((m) => [...m, u[u.length - 1]!]), u.slice(0, -1)) : u))
  const removeMark = (i: number) => setMarks((m) => m.filter((_, k) => k !== i))
  const clearMarks = () => {
    setMarks([])
    setUndone([])
  }

  // The picked model's own settings, by model (its strength, light direction, style, output size ...)
  const [moreOpen, setMoreOpen] = React.useState("")
  const [native, setNative] = React.useState<Record<string, Record<string, unknown>>>({})

  // Option settings
  const [preset, setPreset] = React.useState("Subtle")
  const [advanced, setAdvanced] = React.useState({ ...PRESETS.Subtle! })
  const [optimized, setOptimized] = React.useState(UPSCALE_FOR[0]!)
  const [fill, setFill] = React.useState("transparent")
  const [bgMode, setBgMode] = React.useState("remove")
  const [bgWords, setBgWords] = React.useState("")
  const [bgRef, setBgRef] = React.useState<string | null>(null)
  const [cutout, setCutout] = React.useState<{ base: string; cut: string } | null>(null)
  const [bgTone, setBgTone] = React.useState({ back: tone4Defaults(), front: tone4Defaults() })
  const [layer, setLayer] = React.useState<"back" | "front">("back")
  const [camera, setCamera] = React.useState({ rotate: 0, vertical: 0, zoom: 0 })
  const [skin, setSkin] = React.useState({ version: SKIN_VERSIONS[0]!, aim: SKIN_FOR[0]!, sharpen: 0, grain: 2 })
  const [relightMode, setRelightMode] = React.useState("relight")
  const [light, setLight] = React.useState({ rotate: 0, elevation: 0, intensity: 5, colour: "white" })
  const [lightRef, setLightRef] = React.useState<string | null>(null)
  const [adj, setAdj] = React.useState<AdjustSettings>(adjustDefaults())
  const [adjGroup, setAdjGroup] = React.useState("light")
  const [gradeRange, setGradeRange] = React.useState<GradingRange>("shadows")
  const [mixColour, setMixColour] = React.useState<MixerColour>("red")
  const [restyleTab, setRestyleTab] = React.useState("style")
  const [style, setStyle] = React.useState("")
  const [palette, setPalette] = React.useState("")
  const [styleWords, setStyleWords] = React.useState("")
  const [fxId, setFxId] = React.useState<string | null>(null)
  const [fxVals, setFxVals] = React.useState<Record<string, number>>({})
  const [fxSearch, setFxSearch] = React.useState("")
  const [resizeMode, setResizeMode] = React.useState("crop")
  const [moreRatios, setMoreRatios] = React.useState(false)
  const [expandTo, setExpandTo] = React.useState("16:9")
  const [lock, setLock] = React.useState(true)
  const [want, setWant] = React.useState({ w: 0, h: 0 })
  React.useEffect(() => setCropBox({ x: 0, y: 0, w: 1, h: 1 }), [current.url])
  React.useEffect(() => setWant({ w: Math.max(1, Math.round(cropBox.w * size.w)), h: Math.max(1, Math.round(cropBox.h * size.h)) }), [cropBox, size.w, size.h])

  // The picture shows a small live preview while Adjust or a filter is being set
  const [preview, setPreview] = React.useState<string | null>(null)
  React.useEffect(() => {
    let job: (() => Promise<string>) | null = null
    if (kind === "image" && open === "adjust" && !isNeutral(adj)) job = () => adjusted(current.url, adj, 900)
    else if (kind === "image" && open === "filters" && fxId) job = () => applyFx(current.url, fxId, fxVals, 900)
    if (!job) {
      setPreview(null)
      return
    }
    let dead = false
    const timer = setTimeout(() => void job!().then((u) => !dead && setPreview(u)).catch(() => undefined), 150)
    return () => {
      dead = true
      clearTimeout(timer)
    }
  }, [kind, open, adj, fxId, fxVals, current.url])

  /** Says something: a failure goes to the standard error card, anything else to the standard notice at the top of the window */
  const say = (text: string, error = false): false => {
    if (error) setFailure({ raw: text })
    else showNotice(text)
    return false
  }

  /** A new version: shown at once and saved to the Library */
  const addVersion = (url: string, label: string, assets?: MediaAsset[]) => {
    const id = `v-${Date.now()}`
    setVersions((prev) => [...prev, { id, url, label }])
    setCurrentId(id)
    if (!assets) {
      host?.onAssets([
        {
          id: `edit-${Date.now()}`,
          batchId: `edit-${Date.now()}`,
          type: "image",
          title: `${label}: ${item.title}`,
          prompt: item.prompt ?? "",
          url,
          thumbnailUrl: url,
          aspectRatio: item.aspectRatio ?? "16:9",
          model: label,
          provider: "device" as never,
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          status: "completed",
          source: "generated",
          cost: "",
          params: { from: item.title },
        },
      ])
    }
  }

  /**
   * The models for a job (see modelsForJob): those made for it, then the top closed editors; a job nothing is made for (camera, skin)
   * lists the editors that can follow words. Worked out once per job.
   */
  const candidatesOf = (spec: ToolSpec): ModelRecord[] => {
    let byJob = jobCache.get(ctx)
    if (!byJob) jobCache.set(ctx, (byJob = new Map()))
    const key = `${spec.id}:${(spec.needs ?? []).map((n) => n.role ?? n.kind).join(",")}`
    const hit = byJob.get(key)
    if (hit) return hit
    const list = modelsForJob(spec, ctx)
    byJob.set(key, list)
    return list
  }

  /** Runs a job on the current picture with the chosen (or the best) model */
  const run = async (spec: ToolSpec, words: string, options?: Record<string, string | number | boolean>, after?: (url: string) => Promise<string>, from?: string, ref?: string, mask?: string): Promise<boolean> => {
    if (!host || busy) return false
    lastRun.current = () => void run(spec, words, options, after, from, ref, mask)
    const list = ref ? candidatesOf(spec).filter(takesTwo) : candidatesOf(spec)
    const record = list.find((r) => r.id === picked[spec.id]) ?? list[0]
    if (!record && ref) return say("None of the models you can use takes a second picture yet. Add a key for a provider that has an image editor taking several pictures.", true)
    if (!record) return say(statusOf(spec, ctx).status.state === "needs-model" ? ("reason" in statusOf(spec, ctx).status ? (statusOf(spec, ctx).status as { reason: string }).reason : "No model can do this yet.") : "No model can do this yet.", true)
    setBusy(true)
    setFailure(null)
    setBusyLabel(spec.name)
    stopper.current = new AbortController()
    try {
      const done = await runTool(spec, record, { media: { url: from ?? current.url, kind: "image", name: item.title }, prompt: words, options, imageUrl: ref, maskUrl: mask, params: { ...keepSize(record), ...(native[record.id] ?? {}) } }, { settings: host.settings, projectId: host.projectId, signal: stopper.current?.signal })
      const made = done.assets[0]
      if (!made) throw new Error("Nothing came back.")
      host.onAssets(done.assets)
      // A result changed in the app (a colour put behind the cut-out) is a new picture of its own, saved too
      const final = after ? await after(made.url) : made.url
      addVersion(final, spec.name, final === made.url ? done.assets : undefined)
      say(`Done with ${record.name}.`)
      return true
    } catch (e) {
      if (stopper.current?.signal.aborted) return say("Stopped.")
      setFailure({ raw: e instanceof Error ? e.message : "That did not work.", provider: record.provider, model: record.name })
      return false
    } finally {
      stopper.current = null
      setBusyLabel(null)
      setBusy(false)
    }
  }

  /** A free job done in the app */
  const free = async (label: string, job: () => Promise<string>) => {
    if (busy) return
    lastRun.current = () => void free(label, job)
    setBusy(true)
    setFailure(null)
    setBusyLabel(label)
    const mine = new AbortController()
    stopper.current = mine
    try {
      const url = await job()
      // Stopped while it was working: the result is dropped
      if (mine.signal.aborted) return void say("Stopped.")
      addVersion(url, label)
      say(`${label} done.`)
    } catch (e) {
      setFailure({ raw: e instanceof Error ? e.message : "That did not work." })
    } finally {
      stopper.current = null
      setBusyLabel(null)
      setBusy(false)
    }
  }

  /** The output size that keeps the picture's own: the largest size the model lists that is not bigger than the picture */
  const keepSize = (record: ModelRecord): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    const long = Math.max(size.w, size.h)
    const pixels = (v: string | number) => {
      const t = String(v)
      const k = /^(\d+(?:\.\d+)?)K$/i.exec(t)
      if (k) return Number(k[1]) * 1024
      const n = /^(\d+)p?$/i.exec(t)
      return n ? Number(n[1]) : NaN
    }
    for (const key of ["resolution", "image_size", "size"]) {
      const prop = record.params.properties[key]
      if (!prop?.enum?.length || long === 0) continue
      const ranked = prop.enum.map((v) => ({ v, px: pixels(v) })).filter((x) => !Number.isNaN(x.px)).sort((a, b) => b.px - a.px)
      if (ranked.length === 0) continue
      out[key] = (ranked.find((x) => x.px <= long * 1.05) ?? ranked[ranked.length - 1]!).v
    }
    return out
  }

  /** The model that will run for a job: the chosen one, else the first the capability rule lists */
  const chosenFor = (spec: ToolSpec, only?: (r: ModelRecord) => boolean): ModelRecord | undefined => {
    const list = only ? candidatesOf(spec).filter(only) : candidatesOf(spec)
    return list.find((r) => r.id === picked[spec.id]) ?? list[0]
  }

  /** Whether the model that will run is made for this job (its own settings are the controls) rather than a general editor (words are) */
  const isMade = (spec: ToolSpec, only?: (r: ModelRecord) => boolean): boolean => {
    const r = chosenFor(spec, only)
    const verb = verbOfJob(spec.id)
    return Boolean(r && verb !== undefined && capabilityOfExact(r).dedicated.includes(verb))
  }

  const kindLine = (_spec: ToolSpec, _only?: (r: ModelRecord) => boolean): null => null

  /** The chosen model's own settings for this job, in its own names and ranges (nothing is shown that it does not have) */
  const nativeSettings = (spec: ToolSpec, only?: (r: ModelRecord) => boolean, hide: string[] = []) => {
    const r = chosenFor(spec, only)
    if (!r) return null
    const skip = /^(seed|output_format|output_quality|sync_mode|num_images|number_of_images|n|negative_prompt|prompt|return_model_output|preserve_alpha|retain_original_quality|width|height|steps|num_inference_steps|guidance|guidance_scale|cfg|safety_tolerance|enable_safety_checker)$/
    const keys = Object.entries(r.params.properties)
      .filter(([k, p]) => isEditable(p) && !skip.test(k) && !hide.includes(k) && p.tier !== "technical")
      .map(([k]) => k)
      .sort(byTier(r.params.properties))
    if (keys.length === 0) return null
    const set = (k: string, v: unknown) => setNative((n) => ({ ...n, [r.id]: { ...n[r.id], [k]: v } }))
    const props = r.params.properties
    // The standard options of this job the chosen model has a setting for, in the job's order, with the job's own names for them
    const named = new Map<string, string>()
    for (const o of STANDARD[spec.id] ?? []) {
      const k = keys.find((x) => o.keys.test(x) && !named.has(x))
      if (k) named.set(k, o.label)
    }
    const mainKeys = [...named.keys()]
    const moreKeys = keys.filter((k) => !named.has(k))
    const controls = (list: string[]) => {
    // The scale comes first; then choices, then sliders, then switches, so every kind sits with its own kind
    const scaleFirst = (a: string, b: string) => Number(/scale|factor/.test(b)) - Number(/scale|factor/.test(a))
    const allChoices = list.filter((k) => props[k]!.enum?.length).sort(scaleFirst)
    // A scale (None, 2x, 4x, 6x) is a few short choices: shown side by side, with the size each one gives
    const isScale = (k: string) => /scale|factor/.test(k) && props[k]!.enum!.length <= 6 && props[k]!.enum!.every((e) => String(e).length <= 5)
    const scales = allChoices.filter(isScale)
    const choices = allChoices.filter((k) => !isScale(k))
    // Rows of two where two short choices sit together; a long one, or one with no partner, takes the whole row (never an empty half)
    const isWide = (k: string) => props[k]!.enum!.some((e) => String(e).length > 14) || settingWords(k, props[k]!).label.length > 16
    const spans = new Map<string, boolean>()
    for (let i = 0; i < choices.length; ) {
      const k = choices[i]!
      const next = choices[i + 1]
      if (!isWide(k) && next !== undefined && !isWide(next)) {
        spans.set(k, false)
        spans.set(next, false)
        i += 2
      } else {
        spans.set(k, true)
        i += 1
      }
    }
    const ranges = list.filter((k) => !props[k]!.enum?.length && (props[k]!.type === "number" || props[k]!.type === "integer") && props[k]!.minimum !== undefined && props[k]!.maximum !== undefined)
    const switches = list.filter((k) => props[k]!.type === "boolean" && !props[k]!.enum?.length)
    const valueOf = (k: string) => native[r.id]?.[k] ?? keepSize(r)[k] ?? props[k]!.default
    const timesOf = (v: string | number) => Number.parseFloat(String(v).replace(/[^0-9.]/g, "")) || 1
      return (
      <div className="space-y-2.5">
        {scales.map((k) => {
          const prop = props[k]!
          const words = { ...settingWords(k, prop), label: named.get(k) ?? settingWords(k, prop).label }
          return (
            <SettingSegments
              key={k}
              label={words.label}
              info={words.info}
              value={String(valueOf(k) ?? prop.enum![0])}
              options={prop.enum!.map((e) => {
                const n = timesOf(e)
                return {
                  value: String(e),
                  label: `x${n}`,
                  disabled: size.w * n > 16000 || size.h * n > 16000,
                  hint: size.w > 0 ? `${Math.round(size.w * n)}×${Math.round(size.h * n)}` : undefined,
                }
              })}
              onChange={(v) => set(k, prop.enum!.find((e) => String(e) === v) ?? v)}
            />
          )
        })}
        {choices.length > 0 && (
          <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
            {choices.map((k) => {
              const prop = props[k]!
              const words = { ...settingWords(k, prop), label: named.get(k) ?? settingWords(k, prop).label }
              const names = prop.enum!.map(String)
              const wide = spans.get(k) === true
              return (
                <SettingSelect
                  key={k}
                  label={words.label}
                  info={words.info}
                  className={wide ? "col-span-2" : undefined}
                  value={String(valueOf(k) ?? names[0])}
                  options={names.map((n) => {
                    const w = choiceWords(k, n)
                    return { value: n, label: w.label, info: w.info }
                  })}
                  onChange={(v) => set(k, prop.enum!.find((e) => String(e) === v) ?? v)}
                />
              )
            })}
          </div>
        )}
        {ranges.map((k) => {
          const prop = props[k]!
          const words = { ...settingWords(k, prop), label: named.get(k) ?? settingWords(k, prop).label }
          const num = typeof valueOf(k) === "number" ? (valueOf(k) as number) : prop.minimum!
          return <SettingSlider key={k} label={words.label} info={words.info} value={Number(num.toFixed(2))} min={prop.minimum!} max={prop.maximum!} step={prop.type === "integer" ? 1 : Number(((prop.maximum! - prop.minimum!) / 100).toPrecision(2))} start={typeof prop.default === "number" ? prop.default : undefined} onChange={(v) => set(k, v)} />
        })}
        {switches.map((k) => {
          const words = { ...settingWords(k, props[k]!), label: named.get(k) ?? settingWords(k, props[k]!).label }
          return <SettingSwitch key={k} label={words.label} info={words.info} checked={Boolean(valueOf(k))} onChange={(v) => set(k, v)} />
        })}
      </div>
    )
    }
    return (
      <div className="space-y-2.5">
        {controls(mainKeys)}
        {moreKeys.length > 0 && section("more", "More Options", moreOpen, setMoreOpen, controls(moreKeys))}
      </div>
    )
  }

  /** The one model selector of the app, limited to the models that can do this job (the capability rule); the first is used until another is chosen */
  /** What a run of this job would cost with the chosen model, or null when it is free or unknown */
  const priceOfJob = (spec: ToolSpec, only?: (r: ModelRecord) => boolean): number | null => {
    const r = chosenFor(spec, only)
    if (!r) return null
    return priceOf(r, { ...paramsFor(spec, r, {}).params, ...keepSize(r), ...(native[r.id] ?? {}) }, { url: current.url, kind: "image", name: item.title })
  }
  /** The price of the job the open panel runs; set by the panel, read by its button */
  let jobPrice: number | null = null

  const modelPicker = (spec: ToolSpec, only?: (r: ModelRecord) => boolean) => {
    const list = only ? candidatesOf(spec).filter(only) : candidatesOf(spec)
    const shown = list.find((r) => r.id === picked[spec.id]) ?? list[0]
    if (list.length === 0) return <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">No model you can use does this yet. Add a key for a provider that has one (Settings → Providers).</p>
    return (
      <div className="space-y-1.5">
        <ModelPickerButton ordered records={list} value={shown?.id} side="left" className="h-9 w-full rounded-lg border border-border bg-secondary/60 px-3 text-xs transition-colors hover:bg-secondary" onChange={(id) => setPicked((p) => ({ ...p, [spec.id]: id }))} />
      </div>
    )
  }

  const go = (label: string, onClick: () => void, disabled = false) => (
    <Button type="button" variant={busy ? "secondary" : "default"} className="h-9 w-full justify-between rounded-lg px-3 text-sm" disabled={busy ? false : disabled} onClick={busy ? () => stopper.current?.abort() : onClick}>
      <span>{busy ? "Stop" : label}</span>
      <span className="flex items-center gap-2">
        {!busy && jobPrice !== null && <span className="text-xs font-normal opacity-70">{`~$${jobPrice < 0.01 ? jobPrice.toFixed(4) : jobPrice.toFixed(2)}`}</span>}
        {busy ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </span>
    </Button>
  )

  /** Why the last run failed, under the button that was pressed, in the app's standard error card (what happened, what to do, retry) */
  const outcome = failure && (
    <ErrorNotice info={explainError(failure.raw, { provider: failure.provider, model: failure.model })} fallbackTitle="That did not work" message={failure.raw} onRetry={lastRun.current ?? undefined} onOpenSettings={host?.onOpenSettings} />
  )

  /** A small heading over a field */
  const caption = (text: string) => <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{text}</p>

  const chips = (names: string[], value: string, onPick: (v: string) => void, cols = "grid-cols-2") => <ChoiceChips options={names} value={value} onChange={onPick} columns={cols} />

  const tabs = (value: string, onChange: (v: string) => void, items: Array<[string, string]>) => (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList className="w-full">
        {items.map(([id, name]) => (
          <TabsTrigger key={id} value={id} className="flex-1 text-xs">
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )

  const SECTION_ICON: Record<string, React.ElementType> = { light: Sun, colour: Palette, grading: Contrast, mixer: Paintbrush, rotate: RotateCw }
  const section = (id: string, name: string, shown: string, set: (v: string) => void, body: React.ReactNode) => {
    const Icon = SECTION_ICON[id]
    return (
      <div className={cn("overflow-hidden rounded-lg border border-border bg-background/40")}>
        <Button type="button" variant="ghost" aria-expanded={shown === id} onClick={() => set(shown === id ? "" : id)} className="h-9 w-full justify-between rounded-lg px-3 text-xs font-medium transition-colors hover:bg-accent">
          <span className="flex items-center gap-2.5">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {name}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", shown === id && "rotate-180")} />
        </Button>
        {shown === id && <div className="animate-fade-in space-y-2 px-2 pb-3 pt-1">{body}</div>}
      </div>
    )
  }

  const pickFile = (onFile: (url: string) => void) => (
    <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-secondary">
      <ImagePlus className="h-3.5 w-3.5" />
      Add a reference picture
      <Input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(URL.createObjectURL(e.target.files[0]))} />
    </label>
  )

  const patch = (key: keyof AdjustSettings) => (v: number) => setAdj((a) => ({ ...a, [key]: v }))
  const adjSlider = (key: keyof AdjustSettings, label: string, min = -100, max = 100) => <SliderRow label={label} value={adj[key] as number} min={min} max={max} onChange={patch(key)} />

  /** Upscale: a model made for it takes the settings as they are; a general editor is told in a sentence */
  const upscaleSpec = (): ToolSpec => {
    const base = toolById("image-upscale")!
    if (isMade(base)) return base
    return { ...base, prompt: { label: "Upscale settings", placeholder: "", required: false }, instruction: "Upscale this picture to a much higher resolution and add fine detail. Change nothing else: {prompt}" }
  }

  const panel = (id: OptionId) => {
    jobPrice = null
    switch (id) {
      case "upscale": {
        const spec = upscaleSpec()
        const creative = !isMade(spec)
        jobPrice = priceOfJob(spec)
        const record = chosenFor(spec)
        const factorKey = ["upscale_factor", "scale_factor", "scale", "factor"].find((k) => record?.params.properties[k])
        const rawScale = factorKey ? (native[record!.id]?.[factorKey] ?? record!.params.properties[factorKey]?.default) : undefined
        // The model's own words for it ("2x", 2, "None"): the number in them, or 1 when there is none
        const scaleNow = Number.parseFloat(String(rawScale ?? "").replace(/[^0-9.]/g, "")) || 1
        return (
          <div className="space-y-2.5">
            {modelPicker(spec)}
            {creative && (
              <>
                <div className="grid grid-cols-2 gap-x-2">
                  <SettingSelect
                    label="Presets"
                    info={editorInfo("Presets")}
                    value={preset}
                    options={[...Object.keys(PRESETS), "Custom"]}
                    onChange={(p) => {
                      setPreset(p)
                      if (PRESETS[p]) setAdvanced({ ...PRESETS[p]! })
                    }}
                  />
                  <SettingSelect label="Optimized for" info={editorInfo("Optimized for")} value={optimized} options={UPSCALE_FOR} onChange={setOptimized} />
                </div>
                {(["creativity", "hdr", "resemblance", "fractality"] as const).map((k) => (
                  <SliderRow key={k} label={k[0]!.toUpperCase() + k.slice(1)} value={advanced[k]} min={k === "creativity" || k === "resemblance" ? -10 : 0} max={10} onChange={(v) => { setPreset("Custom"); setAdvanced((a) => ({ ...a, [k]: v })) }} />
                ))}
              </>
            )}
            {nativeSettings(spec)}
            {go("Upscale", () => void run(spec, creative ? `optimized for ${optimized}; creativity ${advanced.creativity}, HDR ${advanced.hdr}, resemblance ${advanced.resemblance}, fractality ${advanced.fractality}` : ""))}
            {size.w > 0 && factorKey && <p className="text-center text-xs text-muted-foreground">{`Final size: ${Math.round(size.w * scaleNow)}x${Math.round(size.h * scaleNow)}`}</p>}
          </div>
        )
      }
      case "resize": {
        const outpaint = toolById("image-outpaint")!
        const expandModel = chosenFor(outpaint)
        const byRatio = Boolean(expandModel?.params.properties.aspect_ratio)
        jobPrice = resizeMode === "expand" ? priceOfJob(outpaint) : null
        const ratios = moreRatios ? [...RATIOS, ...MORE_RATIOS] : RATIOS
        const ratioOf = want.h > 0 ? want.w / want.h : 1
        const setW = (w: number) => setWant(lock ? { w, h: Math.max(1, Math.round(w / ratioOf)) } : (x) => ({ ...x, w }))
        const setH = (h: number) => setWant(lock ? { h, w: Math.max(1, Math.round(h * ratioOf)) } : (x) => ({ ...x, h }))
        return (
          <div className="space-y-3">
            {tabs(resizeMode, setResizeMode, [["crop", "Crop"], ["expand", "Expand"]])}
            <div className="grid grid-cols-4 gap-1.5">
              {ratios.map(([name, ratio]) => (
                <Button
                  key={name}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  disabled={busy || size.w === 0 || (resizeMode === "expand" && !byRatio)}
                  aria-pressed={resizeMode === "expand" && expandTo === name}
                  onClick={() => (resizeMode === "crop" ? setCropBox(centred(size.w, size.h, ratio)) : setExpandTo(name))}
                >
                  {name}
                </Button>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setMoreRatios(!moreRatios)}>
                {moreRatios ? "Less" : "More"}
              </Button>
            </div>
            {resizeMode === "crop" ? (
              <>
                <div className="flex items-center gap-2">
                  <Input type="number" value={want.w} onChange={(e) => setW(Number(e.target.value))} aria-label="Width in pixels" className="h-8 text-xs" />
                  <Button type="button" variant="ghost" size="icon" aria-label={lock ? "Unlock the ratio" : "Lock the ratio"} aria-pressed={lock} className="h-8 w-8 shrink-0" onClick={() => setLock(!lock)}>
                    {lock ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </Button>
                  <Input type="number" value={want.h} onChange={(e) => setH(Number(e.target.value))} aria-label="Height in pixels" className="h-8 text-xs" />
                </div>
                {go("Resize", () => void free(`Resize ${want.w}x${want.h}`, () => cropped(current.url, cropBox, { w: Math.max(1, want.w), h: Math.max(1, want.h) })), want.w < 1 || want.h < 1)}
              </>
            ) : (
              <>
                {modelPicker(outpaint)}
                {kindLine(outpaint)}
                {nativeSettings(outpaint, undefined, ["aspect_ratio"])}
                {go("Expand", () => void run(outpaint, "", byRatio ? { aspect: expandTo } : undefined), !expandModel)}
              </>
            )}
          </div>
        )
      }
      case "background": {
        const remove = toolById("image-remove-background")!
        jobPrice = bgMode === "remove" ? priceOfJob(remove) : bgMode === "replace" ? priceOfJob(EDIT, bgRef ? takesTwo : undefined) : null
        const tone = bgTone[layer]
        const setTone = (k: keyof Tone4) => (v: number) => setBgTone((t) => ({ ...t, [layer]: { ...t[layer], [k]: v } }))
        const resetTone = () => setBgTone({ back: tone4Defaults(), front: tone4Defaults() })
        return (
          <div className="space-y-3">
            {tabs(bgMode, setBgMode, [["remove", "Remove"], ["replace", "Replace"], ["adjust", "Adjust"]])}
            {bgMode === "remove" && (
              <>
                <div className="grid grid-cols-6 gap-1.5">
                  {FILLS.map((c) => (
                    <ColorDot
                      key={c}
                      label={c === "transparent" ? "Transparent" : c === "gradient" ? "Gradient" : `Fill ${c}`}
                      color={c === "transparent" || c === "gradient" ? undefined : c}
                      selected={fill === c}
                      shape="chip"
                      onClick={() => setFill(c)}
                      className={cn(c === "gradient" && "border-solid bg-gradient-to-br from-primary to-accent")}
                    >
                      {c === "transparent" ? "None" : null}
                    </ColorDot>
                  ))}
                </div>
                {modelPicker(remove)}
                {kindLine(remove)}
                {nativeSettings(remove)}
                {go("Remove background", () =>
                  void run(remove, "", undefined, async (url) => {
                    if (fill === "transparent") {
                      setCutout({ base: current.url, cut: url })
                      return url
                    }
                    const img = await createImageBitmap(await (await fetch(url)).blob())
                    const c = document.createElement("canvas")
                    c.width = img.width
                    c.height = img.height
                    const g = c.getContext("2d")!
                    if (fill === "gradient") {
                      const grad = g.createLinearGradient(0, 0, c.width, c.height)
                      grad.addColorStop(0, "mediumpurple")
                      grad.addColorStop(1, "lightseagreen")
                      g.fillStyle = grad
                    } else g.fillStyle = fill
                    g.fillRect(0, 0, c.width, c.height)
                    g.drawImage(img, 0, 0)
                    return await new Promise<string>((res, rej) => c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error("The picture could not be saved."))), "image/png"))
                  }),
                )}
              </>
            )}
            {bgMode === "replace" && (
              <>
                {modelPicker(EDIT, bgRef ? takesTwo : undefined)}
                {kindLine(EDIT, bgRef ? takesTwo : undefined)}
                {nativeSettings(EDIT, bgRef ? takesTwo : undefined)}
                {bgRef ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <img src={bgRef} alt="Reference" className="h-10 w-10 rounded object-cover" />
                    <span className="flex-1">Reference picture added</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBgRef(null)}>Remove</Button>
                  </div>
                ) : (
                  pickFile(setBgRef)
                )}
                <Input value={bgWords} onChange={(e) => setBgWords(e.target.value)} placeholder="Describe the background you want to generate" aria-label="New background" className="text-xs" />
                {go("Replace background", () => void run(EDIT, `Replace the background with: ${bgWords}.${bgRef ? " Use the second picture as the new background." : ""} Keep the main subject exactly as it is.`, undefined, undefined, undefined, bgRef ?? undefined), !bgWords.trim() && !bgRef)}
              </>
            )}
            {bgMode === "adjust" &&
              (cutout ? (
                <>
                  {tabs(layer, (v) => setLayer(v as "back" | "front"), [["back", "Background"], ["front", "Foreground"]])}
                  <SliderRow label="Blur" value={tone.blur} min={0} max={20} unit="px" onChange={setTone("blur")} />
                  <SliderRow label="Grayscale" value={tone.grayscale} min={0} max={100} unit="%" onChange={setTone("grayscale")} />
                  <SliderRow label="Sepia" value={tone.sepia} min={0} max={100} unit="%" onChange={setTone("sepia")} />
                  <SliderRow label="Brightness" value={tone.brightness} min={0} max={200} unit="%" onChange={setTone("brightness")} />
                  <SliderRow label="Contrast" value={tone.contrast} min={0} max={200} unit="%" onChange={setTone("contrast")} />
                  <SliderRow label="Saturation" value={tone.saturation} min={0} max={200} unit="%" onChange={setTone("saturation")} />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={resetTone}>Cancel</Button>
                    <Button type="button" className="flex-1" disabled={busy} onClick={() => void free("Background adjust", () => composited(cutout.base, cutout.cut, bgTone.back, bgTone.front)).then(resetTone)}>Save</Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Remove the background first (with no fill). Then the background and the subject can be changed on their own.</p>
              ))}
          </div>
        )
      }
      case "camera":
        jobPrice = priceOfJob(EDIT)
        return (
          <div className="space-y-3">
            <SliderRow label="Rotate" value={camera.rotate} min={-90} max={90} unit="°" onChange={(v) => setCamera((c) => ({ ...c, rotate: v }))} />
            <SliderRow label="Vertical" value={camera.vertical} min={-45} max={45} unit="°" onChange={(v) => setCamera((c) => ({ ...c, vertical: v }))} />
            <SliderRow label="Zoom" value={camera.zoom} min={-50} max={50} unit="%" onChange={(v) => setCamera((c) => ({ ...c, zoom: v }))} />
            {modelPicker(EDIT)}
            {kindLine(EDIT)}
            {nativeSettings(EDIT)}
            {go("Change camera", () =>
              void run(EDIT, `Show this same scene from a different camera angle: the camera moved ${camera.rotate} degrees around the subject, ${camera.vertical} degrees ${camera.vertical < 0 ? "down" : "up"}, and ${camera.zoom < 0 ? "pulled back" : "moved in"} by ${Math.abs(camera.zoom)} percent. Keep the people, objects and light exactly as they are.`),
              camera.rotate === 0 && camera.vertical === 0 && camera.zoom === 0,
            )}
          </div>
        )
      case "skin":
        jobPrice = priceOfJob(EDIT)
        return (
          <div className="space-y-3">
            <SettingSelect label="Version" info={editorInfo("Version")} value={skin.version} options={SKIN_VERSIONS} onChange={(v) => setSkin((x) => ({ ...x, version: v }))} />
            <SettingSelect label="Optimized for" info="What to improve: the skin, everything, the light, or a more real look." value={skin.aim} options={SKIN_FOR} onChange={(v) => setSkin((x) => ({ ...x, aim: v }))} />
            <SliderRow label="Sharpen" value={skin.sharpen} min={0} max={100} unit="%" onChange={(v) => setSkin((s) => ({ ...s, sharpen: v }))} />
            <SliderRow label="Smart grain" value={skin.grain} min={0} max={100} unit="%" onChange={(v) => setSkin((s) => ({ ...s, grain: v }))} />
            {modelPicker(EDIT)}
            {kindLine(EDIT)}
            {nativeSettings(EDIT)}
            {go("Enhance skin", () =>
              void run(EDIT, `${skin.aim} on the people in this picture, ${skin.version.toLowerCase()} to the original look: natural skin with real texture and no plastic smoothing. Sharpen detail ${skin.sharpen} percent and add film grain ${skin.grain} percent. Change nothing else.`),
            )}
          </div>
        )
      case "relight": {
        const spec = toolById("image-relight")!
        jobPrice = relightMode === "relight" ? priceOfJob(spec) : priceOfJob(EDIT, takesTwo)
        return (
          <div className="space-y-3">
            {tabs(relightMode, setRelightMode, [["relight", "Relight"], ["transfer", "Light transfer"]])}
            {relightMode === "relight" ? (
              <>
                {modelPicker(spec)}
                {kindLine(spec)}
                {isMade(spec) ? null : (
                  <>
                {caption("Quick select")}
                {chips(DIRECTIONS.map(([d]) => d), DIRECTIONS.find(([, r, e]) => r === light.rotate && e === light.elevation)?.[0] ?? "", (d) => {
                  const hit = DIRECTIONS.find(([n]) => n === d)!
                  setLight((l) => ({ ...l, rotate: hit[1], elevation: hit[2] }))
                }, "grid-cols-3")}
                <div className="flex flex-wrap gap-1.5">
                  {LIGHT_COLOURS.map(([name, css]) => (
                    <ColorDot key={name} label={`${name} light`} color={css} selected={light.colour === name} onClick={() => setLight((l) => ({ ...l, colour: name }))} />
                  ))}
                </div>
                <SliderRow label="Rotate" value={light.rotate} min={0} max={360} unit="°" onChange={(v) => setLight((l) => ({ ...l, rotate: v }))} />
                <SliderRow label="Elevation" value={light.elevation} min={-90} max={90} unit="°" onChange={(v) => setLight((l) => ({ ...l, elevation: v }))} />
                <SliderRow label="Intensity" value={light.intensity} min={1} max={10} onChange={(v) => setLight((l) => ({ ...l, intensity: v }))} />
                  </>
                )}
                {nativeSettings(spec)}
                {go("Relight", () => void run(spec, `light from ${light.rotate} degrees around and ${light.elevation} degrees up, ${light.colour} colour, intensity ${light.intensity} out of 10`))}
              </>
            ) : (
              <>
                {lightRef ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <img src={lightRef} alt="Light reference" className="h-10 w-10 rounded object-cover" />
                    <span className="flex-1">Light reference added</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLightRef(null)}>Remove</Button>
                  </div>
                ) : (
                  pickFile(setLightRef)
                )}
                {modelPicker(EDIT, takesTwo)}
                {go("Relight", () => void run(EDIT, "Relight the first picture with the lighting of the second picture: copy its light direction, colour, softness and contrast. Keep the people, objects and layout of the first picture exactly as they are.", undefined, undefined, undefined, lightRef!), !lightRef)}
                {candidatesOf(EDIT).some(takesTwo) ? null : <p className="text-xs text-muted-foreground">No model you can use takes a second picture yet.</p>}
              </>
            )}
          </div>
        )
      }
      case "adjust": {
        const grade = adj.grading[gradeRange]
        const setGrade = (k: "hue" | "amount" | "luminance") => (v: number) => setAdj((a) => ({ ...a, grading: { ...a.grading, [gradeRange]: { ...a.grading[gradeRange], [k]: v } } }))
        return (
          <div className="space-y-2">
            {section("light", "Light", adjGroup, setAdjGroup, (
              <>
                {adjSlider("exposure", "Exposure")}
                {adjSlider("contrast", "Contrast")}
                {adjSlider("brightness", "Brightness")}
                {adjSlider("highlights", "Highlights")}
                {adjSlider("shadows", "Shadows")}
              </>
            ))}
            {section("colour", "Color", adjGroup, setAdjGroup, (
              <>
                {adjSlider("saturation", "Saturation")}
                {adjSlider("hue", "Hue rotation", -180, 180)}
                {adjSlider("temperature", "Temperature")}
                {adjSlider("tint", "Tint")}
              </>
            ))}
            {section("grading", "Color grading", adjGroup, setAdjGroup, (
              <>
                {chips([...GRADING_RANGES], gradeRange, (v) => setGradeRange(v as GradingRange), "grid-cols-3")}
                <SliderRow label="Hue" value={grade.hue} min={0} max={359} unit="°" onChange={setGrade("hue")} />
                <SliderRow label="Amount" value={grade.amount} min={0} max={100} onChange={setGrade("amount")} />
                <SliderRow label="Luminance" value={grade.luminance} min={-100} max={100} onChange={setGrade("luminance")} />
              </>
            ))}
            {section("mixer", "Color mixer", adjGroup, setAdjGroup, (
              <>
                {chips([...MIXER_COLOURS], mixColour, (v) => setMixColour(v as MixerColour), "grid-cols-4")}
                {(["hue", "saturation", "luminance"] as const).map((k) => (
                  <SliderRow key={k} label={k[0]!.toUpperCase() + k.slice(1)} value={adj.mixer[mixColour][k]} min={-100} max={100} onChange={(v) => setAdj((a) => ({ ...a, mixer: { ...a.mixer, [mixColour]: { ...a.mixer[mixColour], [k]: v } } }))} />
                ))}
              </>
            ))}
            {section("rotate", "Rotate", adjGroup, setAdjGroup, (
              <>
                <SliderRow label="Straighten" value={adj.straighten} min={-45} max={45} unit="°" onChange={patch("straighten")} />
                <div className="grid grid-cols-2 gap-1.5">
                  <Button type="button" variant="outline" size="sm" aria-pressed={adj.flipH} className={cn("text-xs", adj.flipH && "border-foreground")} onClick={() => setAdj((a) => ({ ...a, flipH: !a.flipH }))}>Flip horizontal</Button>
                  <Button type="button" variant="outline" size="sm" aria-pressed={adj.flipV} className={cn("text-xs", adj.flipV && "border-foreground")} onClick={() => setAdj((a) => ({ ...a, flipV: !a.flipV }))}>Flip vertical</Button>
                </div>
              </>
            ))}
            <div className="sticky bottom-0 z-10 -mx-3 flex gap-2 bg-secondary px-3 pb-1 pt-2">
              <Button type="button" variant="ghost" className="h-10 flex-1 gap-1.5 rounded-lg text-muted-foreground" onClick={() => setAdj(adjustDefaults())}>
                <RotateCcw className="h-4 w-4" />
                Reset all
              </Button>
              <Button type="button" className="h-10 flex-[1.3] rounded-lg" disabled={busy || isNeutral(adj)} onClick={() => void free("Adjust", () => adjusted(current.url, adj)).then(() => setAdj(adjustDefaults()))}>
                Apply
              </Button>
            </div>
          </div>
        )
      }
      case "restyle": {
        const spec = toolById("image-restyle")!
        jobPrice = priceOfJob(spec)
        const words = [style, palette && `${palette} colour palette`, styleWords].filter(Boolean).join(", ")
        return (
          <div className="space-y-3">
            {modelPicker(spec)}
            {kindLine(spec)}
            {nativeSettings(spec)}
            {isMade(spec) && chosenFor(spec)?.params.properties.style ? null : tabs(restyleTab, setRestyleTab, [["style", "Style"], ["colors", "Colors"]])}
            {isMade(spec) && chosenFor(spec)?.params.properties.style ? null : restyleTab === "style" ? (
              <>
                {chips(STYLES, style, (v) => setStyle(style === v ? "" : v))}
                <Input value={styleWords} onChange={(e) => setStyleWords(e.target.value)} placeholder="Or describe a style" aria-label="Style" className="text-xs" />
              </>
            ) : (
              <div className="space-y-1.5">
                {PALETTES.map(([name, colours]) => (
                  <Button key={name} type="button" variant="outline" size="sm" aria-pressed={palette === name} className={cn("h-9 w-full justify-between px-3 text-xs", palette === name && "border-foreground")} onClick={() => setPalette(palette === name ? "" : name)}>
                    {name}
                    <ColorStrip colors={colours} />
                  </Button>
                ))}
              </div>
            )}
            {go("Restyle", () => void run(spec, words), !words && !(isMade(spec) && chosenFor(spec)?.params.properties.style))}
          </div>
        )
      }
      case "filters": {
        const chosen = FX.find((f) => f.id === fxId)
        const shown = FX.filter((f) => f.name.toLowerCase().includes(fxSearch.toLowerCase()))
        if (chosen)
          return (
            <div className="space-y-3">
              <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 text-xs" onClick={() => setFxId(null)}>
                ← All filters
              </Button>
              <p className="text-sm font-medium">{chosen.name}</p>
              <p className="text-xs text-muted-foreground">{chosen.about}</p>
              {chosen.controls.map((c) => (
                <SliderRow key={c.id} label={c.label} value={fxVals[c.id] ?? c.value} min={c.min} max={c.max} unit={c.unit} onChange={(v) => setFxVals((x) => ({ ...x, [c.id]: v }))} />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const next = [...mine, { id: `mine-${Date.now()}`, name: `${chosen.name} ${mine.filter((m) => m.fx === chosen.id).length + 1}`, fx: chosen.id, vals: { ...fxDefaults(chosen.id), ...fxVals } }]
                  setMine(next)
                  writeMine(next)
                }}
              >
                Save as mine
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setFxVals(fxDefaults(chosen.id))}>Reset</Button>
                <Button type="button" className="flex-1" disabled={busy} onClick={() => void free(chosen.name, () => applyFx(current.url, chosen.id, fxVals)).then(() => setFxId(null))}>Use filter</Button>
              </div>
              </div>
          )
        return (
          <div className="space-y-3">
            {tabs(fxTab, setFxTab, [["official", `Official (${FX.length})`], ["mine", `Mine (${mine.length})`]])}
            {fxTab === "mine" ? (
              <div className="space-y-1.5">
                {mine.map((m) => (
                  <div key={m.id} className="flex items-center gap-1">
                    <Button type="button" variant="outline" className="h-9 flex-1 justify-start px-3 text-xs" onClick={() => { setFxId(m.fx); setFxVals(m.vals) }}>
                      {m.name}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${m.name}`} className="h-9 w-9" onClick={() => { const next = mine.filter((x) => x.id !== m.id); setMine(next); writeMine(next) }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {mine.length === 0 && <p className="text-xs text-muted-foreground">Open an official filter, set it how you like, then press Save as mine.</p>}
              </div>
            ) : (
              <>
            <Input value={fxSearch} onChange={(e) => setFxSearch(e.target.value)} placeholder="Search filters" aria-label="Search filters" className="h-8 text-xs" />
            <div className="space-y-1.5">
              {shown.map((f) => (
                <Button key={f.id} type="button" variant="outline" className="h-auto w-full flex-col items-start gap-0.5 px-3 py-2 text-left" onClick={() => { setFxId(f.id); setFxVals(fxDefaults(f.id)) }}>
                  <span className="text-xs font-medium">{f.name}</span>
                  <span className="whitespace-normal text-xs font-normal text-muted-foreground">{f.about}</span>
                </Button>
              ))}
              {shown.length === 0 && <p className="text-xs text-muted-foreground">No filter has that name.</p>}
            </div>
              </>
            )}
          </div>
        )
      }
    }
  }

  /** The prompt bar: with marks on the picture the model gets the marked picture and is told to change only that area */
  const send = (colour = "magenta") => {
    const words = prompt.trim()
    if (marks.length === 0) {
      if (!words) return
      void run(EDIT, refUrl ? `${words}. The second picture is a reference; follow it where the request points to it.` : words, undefined, undefined, undefined, refUrl ?? undefined).then((ok) => ok && setPrompt(""))
      return
    }
    const pinned = marks.some((m) => m.kind === "pin")
    if ((tool === "retouch" || pinned) && !words) return
    const keep = precise ? " Everything outside the marked area must stay pixel-identical." : " Keep everything outside the marked area as it is."
    const asked = pinned
      ? `The picture has numbered pins painted on it. Make the changes by pin number, each at its pin: ${words}.${keep} Do not leave the pins in the result.`
      : tool === "erase"
        ? `Remove what is inside the area painted with the translucent colour and fill it so it looks natural.${keep} Do not leave the colour in the result.`
        : `Change only the area painted with the translucent colour: ${words}.${keep} Do not leave the colour in the result.`
    void (async () => {
      try {
        // Areas (brush, lasso, wand) go as a real mask to a model that has a mask field; otherwise as the picture with the area painted on it
        const masked = pinned ? undefined : tool === "erase" ? ERASE_MASKED : EDIT_MASKED
        if (masked && chosenFor(masked)) {
          const mask = await maskOf(marks, size.w, size.h)
          const said = tool === "erase" ? words : `${words}. Change only the masked area.${precise ? " Keep everything else pixel-identical." : ""}`
          const done = await run(masked, said, undefined, undefined, undefined, refUrl ?? undefined, mask)
          if (done) {
            clearMarks()
            setPrompt("")
          }
          return
        }
        const marked = await markedPicture(current.url, marks, colour)
        const ok = await run(EDIT, refUrl ? `${asked} The second picture is a reference; follow it where the request points to it.` : asked, undefined, undefined, marked, refUrl ?? undefined)
        if (ok) {
          clearMarks()
          setPrompt("")
        }
      } catch (e) {
        say(e instanceof Error ? e.message : "That did not work.", true)
      }
    })()
  }

  /** A click with the Select tool: the region of that colour becomes a mark */
  const selectAt = async (x: number, y: number) => {
    try {
      addMark({ kind: "mask", size: 0, pts: [], mask: await wand(current.url, x, y) })
    } catch (e) {
      say(e instanceof Error ? e.message : "That did not work.", true)
    }
  }
  /** The model the prompt bar uses: Auto, or one of those that can edit a picture */
  const barModels = refUrl ? candidatesOf(EDIT).filter(takesTwo) : candidatesOf(EDIT)
  const setBarModel = (id: string) => setPicked((p) => ({ ...p, [EDIT.id]: id }))

  // An option that opens is brought into view, smoothly
  React.useEffect(() => {
    if (open) setTimeout(() => document.getElementById(`edit-option-${open}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60)
  }, [open])

  const optionsView = (
    <div className="space-y-2">
      {OPTIONS.map((o) => (
        <div key={o.id} id={`edit-option-${o.id}`} className={cn("rounded-xl border bg-secondary transition-colors", open === o.id ? "border-border" : "border-transparent")}>
          <Button type="button" variant="ghost" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)} className="h-11 w-full justify-between rounded-xl px-3 text-sm font-medium transition-colors hover:bg-accent">
            <span className="flex items-center gap-3">
              <o.icon className="h-4 w-4 text-foreground" />
              {o.name}
            </span>
            {open === o.id ? <X className="h-4 w-4 text-muted-foreground" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
          </Button>
          {open === o.id && <div className="animate-fade-in space-y-2.5 px-3 pb-3 pt-1">{panel(o.id)}{outcome}</div>}
        </div>
      ))}
    </div>
  )

  return {
    versions,
    currentId,
    setCurrentId,
    current,
    size,
    marks,
    selectAt,
    refUrl,
    setRefUrl,
    canRef: candidatesOf(EDIT).some(takesTwo),
    cropping: open === "resize" && resizeMode === "crop",
    cropBox,
    setCropBox,
    /** The 3D-style preview the picture shows while Change camera or Relight is open */
    camera: open === "camera" ? camera : null,
    light: open === "relight" && relightMode === "relight" ? light : null,
    lightCss: LIGHT_COLOURS.find(([n]) => n === light.colour)?.[1],
    setLightAt: (rotate: number, elevation: number) => setLight((l) => ({ ...l, rotate, elevation })),
    undone: undone.length,
    addMark,
    undo,
    redo,
    clearMarks,
    removeMark,
    marking,
    setMarking,
    tool,
    setTool,
    pen,
    setPen,
    brush,
    setBrush,
    markColour,
    setMarkColour,
    precise,
    setPrecise,
    barModels: barModels,
    barModel: picked[EDIT.id] || barModels[0]?.id,
    setBarModel,
    open,
    openName: OPTIONS.find((o) => o.id === open)?.name ?? null,
    closeOption: () => setOpen(null),
    setOpen,
    /** A live preview of the open option (Adjust, a filter), shown in place of the picture */
    preview,
    busyLabel,
    prompt,
    setPrompt,
    send,
    busy,
    optionsView,
  }
}

export type EditSession = ReturnType<typeof useEditSession>

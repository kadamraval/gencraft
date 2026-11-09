import { capabilityOfExact, verbOfJob } from "@/lib/capability"
import { DEVICE_PROVIDER, DEVICE_STEMS, splitStemsOnDevice } from "@/lib/device/stems"
import { usageLedger } from "@/lib/ledger/usage-store"
import { dispatchLiveProviderRequest } from "@/lib/providers/live-connectors"
import { clampToSchema, defaultsFor } from "@/lib/registry/param-logic"
import { estimateRun } from "@/lib/registry/price"
import { resolveModelInfo } from "@/lib/agent/fallback-router"
import type { ActualCost } from "@/lib/ledger/actual-cost"
import type { ModelRecord } from "@/lib/registry/types"
import type { MediaAsset, ProviderType, SettingsState } from "@/types"
import type { MediaKind, ToolChoice, ToolOption, ToolSpec } from "./types"

/**
 * Runs one AI tool on one piece of media with one model. It does what any generation does (the same connectors, the same cost record), but
 * it runs exactly the chosen model and never fails over to another: a stand-in model would be a different tool.
 */

export interface ToolMedia {
  url: string
  kind: MediaKind
  name: string
  /** For the price: how long a clip or sound is */
  seconds?: number
}

export interface ToolInputs {
  media: ToolMedia
  /** The extra file a tool needs: the voice for lip-sync, the picture for motion transfer */
  audioUrl?: string
  imageUrl?: string
  /** The area to change, white where the model should work (a model with a mask field gets it) */
  maskUrl?: string
  /** Settings under the model's own names (its strength, light direction, style, size ...); only names the model has are used */
  params?: Record<string, unknown>
  prompt?: string
  /** The person's choices, by option id */
  options?: Record<string, string | number | boolean>
}

export interface ToolResult {
  assets: MediaAsset[]
  costUsd: number
}

// ---- turning plain options into the model's own settings

/** The first of an option's names that the model really has */
export function keyFor(option: ToolOption, record: ModelRecord): string | undefined {
  return option.keys.find((k) => record.params.properties[k])
}

/** What the person can choose for an option with this model: the model's own list, or ours narrowed to what it accepts */
export function choicesFor(option: ToolOption, record: ModelRecord): ToolChoice[] {
  const key = keyFor(option, record)
  const listed = key ? record.params.properties[key]?.enum : undefined
  if (option.fromSchema) return (listed ?? []).map((v) => ({ value: v, label: String(v) }))
  if (!listed) return option.choices ?? []
  const allowed = new Set(listed.map(String))
  return (option.choices ?? []).filter((c) => allowed.has(String(c.value)))
}

/** The options this model has a setting for, so the form shows only what will be used */
export function optionsFor(spec: ToolSpec, record: ModelRecord): ToolOption[] {
  return (spec.options ?? []).filter((o) => keyFor(o, record) !== undefined && (o.type !== "choice" || choicesFor(o, record).length > 0))
}

/**
 * The settings a run sends: the model's defaults, the person's choices under the model's own names, and for any required setting still
 * empty the first value the model lists. Returns what could not be used so the form can say so.
 */
export function paramsFor(spec: ToolSpec, record: ModelRecord, options: Record<string, string | number | boolean> = {}): { params: Record<string, unknown>; skipped: string[] } {
  const chosen: Record<string, unknown> = {}
  const skipped: string[] = []
  for (const o of spec.options ?? []) {
    const value = options[o.id] ?? o.default
    if (value === undefined || value === "") continue
    const key = keyFor(o, record)
    if (!key) {
      skipped.push(o.label)
      continue
    }
    const prop = record.params.properties[key]!
    if (prop.enum && !prop.enum.map(String).includes(String(value))) {
      skipped.push(o.label)
      continue
    }
    chosen[key] = (prop.type === "number" || prop.type === "integer") && typeof value === "string" ? Number(value) : value
  }
  const params = clampToSchema(record.params, { ...defaultsFor(record.params), ...chosen })
  for (const [key, prop] of Object.entries(record.params.properties)) {
    if (!(record.params.required ?? []).includes(key) || params[key] !== undefined || prop.format) continue
    if (prop.enum?.length) params[key] = prop.enum[0]
  }
  return { params, skipped }
}

/** What a run would cost, or null when the price is not known. The price is per second of media for most tools. */
export function priceOf(record: ModelRecord, params: Record<string, unknown>, media: ToolMedia): number | null {
  const values = { ...params }
  if (media.seconds && values.duration === undefined) values.duration = Math.max(1, Math.round(media.seconds))
  return estimateRun(record, values, { sourceVideo: media.kind === "video" }).usd
}

// ---- running

export interface RunDeps {
  settings: SettingsState
  projectId?: string
  signal?: AbortSignal
  onLog?: (line: string) => void
}

/**
 * What is sent as the prompt. A model that does this tool by following instructions (an editor, not one made for this job) is told what to
 * do, with the person's words in the sentence; every other model gets the person's words as they are.
 */
export function promptFor(spec: Pick<ToolSpec, "id" | "instruction">, record: ModelRecord, typed: string, options: Record<string, unknown> = {}): string {
  // A model made for this job gets the person's words; one that edits by words is told the job in a sentence
  const verb = verbOfJob(spec.id)
  const madeForIt = verb !== undefined && capabilityOfExact(record).dedicated.includes(verb)
  const viaInstruction = spec.instruction !== undefined && !madeForIt
  if (!viaInstruction) return typed
  // The person's words and chosen settings fill the sentence ("{language}"); a setting left empty drops out
  const filled = spec.instruction!.replace("{prompt}", typed).replace(/\{(\w+)\}/g, (_, k: string) => (options[k] !== undefined && options[k] !== "" ? String(options[k]) : "the chosen language"))
  return filled.replace(/:\s*\./, ".").replace(/\s+/g, " ").trim()
}

/** A job done on this computer (the stem splitter): no provider, no cost */
async function runOnDevice(spec: ToolSpec, inputs: ToolInputs, deps: RunDeps): Promise<ToolResult> {
  const { media } = inputs
  const stems = await splitStemsOnDevice(media.url, deps.onLog, deps.signal)
  const when = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const batch = `tool-${Date.now()}`
  const assets = stems.map<MediaAsset>((s, i) => ({
    id: `tool-audio-${Date.now()}-${i}`,
    type: "audio",
    title: `${s.name.charAt(0).toUpperCase()}${s.name.slice(1)}: ${media.name}`,
    prompt: spec.name,
    url: s.url,
    thumbnailUrl: "",
    aspectRatio: "16:9",
    model: DEVICE_STEMS.name,
    provider: DEVICE_PROVIDER as ProviderType,
    createdAt: when,
    batchId: batch,
    projectId: deps.projectId,
    cost: "",
    status: "completed",
    source: "generated",
    params: { tool: spec.id, endpoint: DEVICE_STEMS.endpoint, from: media.name, stem: s.name },
  }))
  return { assets, costUsd: 0 }
}

export async function runTool(spec: ToolSpec, record: ModelRecord, inputs: ToolInputs, deps: RunDeps): Promise<ToolResult> {
  if (record.provider === DEVICE_PROVIDER) return runOnDevice(spec, inputs, deps)
  const model = resolveModelInfo(record.id, record.category)
  const base = paramsFor(spec, record, inputs.options).params
  const own = Object.fromEntries(Object.entries(inputs.params ?? {}).filter(([k, v]) => v !== undefined && record.params.properties[k] !== undefined))
  const params = Object.keys(own).length > 0 ? clampToSchema(record.params, { ...base, ...own }) : base
  const { media } = inputs
  const typed = (inputs.prompt ?? "").trim() || spec.defaultPrompt || ""
  const prompt = promptFor(spec, record, typed, inputs.options ?? {})
  if (spec.prompt?.required && !typed) throw new Error(`${spec.prompt.label} is needed.`)
  for (const need of spec.needs ?? []) {
    if (need.required && !(need.role === "mask" ? inputs.maskUrl : need.kind === "audio" ? inputs.audioUrl : inputs.imageUrl)) throw new Error(`${need.label} is needed.`)
  }

  const log = deps.onLog ?? (() => undefined)
  let actual: ActualCost | undefined
  const live = await dispatchLiveProviderRequest({
    onActualCost: (c) => {
      actual = c
    },
    model,
    category: record.category,
    prompt,
    settings: deps.settings,
    params,
    references: {
      images: [media.kind === "image" ? media.url : undefined, inputs.imageUrl].filter((u): u is string => Boolean(u)),
      sourceVideoUrl: media.kind === "video" ? media.url : undefined,
      sourceAudioUrl: media.kind === "audio" ? media.url : inputs.audioUrl,
      maskUrl: inputs.maskUrl,
    },
    imageParams: { batchCount: 1 },
    videoParams: {},
    audioParams: {},
    onLog: log,
  })
  if (deps.signal?.aborted) throw new Error("Stopped.")
  const urls = record.category === "image" ? (live.imageUrls ?? []) : record.category === "video" ? (live.videoUrl ? [live.videoUrl] : []) : live.audioUrl ? [live.audioUrl] : []
  if (urls.length === 0) throw new Error(`${record.name} finished but sent back no file.`)

  const estimate = estimateRun(record, params, { sourceVideo: media.kind === "video" })
  const costUsd = actual ? Math.round(actual.usd * 1_000_000) / 1_000_000 : Math.round((estimate.usd ?? 0) * 10_000) / 10_000
  usageLedger.addRecord({
    modelName: record.name,
    modelId: record.id,
    category: record.category,
    provider: model.provider,
    action: "Deducted",
    costUsd,
    credits: Math.round(costUsd * 25 * 100) / 100,
    specs: record.endpoint,
    feature: `${record.name} (${spec.name})`,
    basis: actual ? actual.basis : "estimated",
    endpoint: record.endpoint,
  })

  const when = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const batch = `tool-${Date.now()}`
  const assets = urls.map<MediaAsset>((url, i) => ({
    id: `tool-${record.category}-${Date.now()}-${i}`,
    type: record.category as MediaAsset["type"],
    title: `${spec.name}: ${media.name}`,
    prompt: prompt || spec.name,
    url,
    thumbnailUrl: record.category === "image" ? url : "",
    aspectRatio: typeof params.aspect_ratio === "string" ? params.aspect_ratio : "16:9",
    model: record.name,
    provider: record.provider as ProviderType,
    createdAt: when,
    batchId: batch,
    projectId: deps.projectId,
    cost: "",
    status: "completed",
    source: "generated",
    params: { tool: spec.id, endpoint: record.endpoint, from: media.name },
  }))
  return { assets, costUsd }
}

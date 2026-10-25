import * as React from "react"
import type { AIModel, ProviderType } from "@/types"
import { getAllModels } from "@/lib/providers/catalog"
import { resolveModelCapabilities } from "@/lib/providers/model-capabilities"
import { attachSchema, fetchFalModels, fetchFalPricing, fetchFalSchema, NoSchemaError } from "./adapters/fal"
import { fetchFalChatModels } from "./adapters/fal-chat"
import { fetchOpenRouterModels } from "./adapters/openrouter"
import { fetchOpenAIRecords } from "./adapters/openai-docs"
import { PRICE_READER_DATE, fetchReplicateModels, fetchReplicatePagePrice } from "./adapters/replicate"
import { fetchGeminiRecords } from "./adapters/gemini-docs"
import { fetchFalPagePrice } from "./adapters/fal-price"
import { computeDefaultEnabled } from "./enabled"
import { appFetch, fetchText, isDesktopApp, replicateCall, replicatePageFetch } from "./net"
import bundledJson from "./registry.snapshot.json"
import { getKnowledgeRecords, jobsOf, subscribeKnowledge } from "../knowledge/store"
import { isUpdateDue } from "../knowledge/update-schedule"
import { EMPTY_SCHEMA } from "./types"
import { REQUEST_VERSION } from "./request"
import { applyParamChecks, onParamChecksChange } from "./param-checks"
import { withCrossHost } from "./cross-host"
import { withOfficial } from "./official-specs"
import { familyKey, isEditTask } from "./families"
import { baseKey, featuresOf } from "./features"
import type { FeatureOffer } from "./features"
import { refSummary } from "./slots"
import { prevalenceOf, retier } from "./prevalence"
import { applyLifecycle, isListed } from "./lifecycle"
import { PROVIDER_IDS, isRunnable } from "./providers"
import { selectWatched } from "./watchlist"
import { readCustomModels, readModelNames, saveCustomModels, writeModelNames } from "./custom-models"
import type { ModelRecord, ParamSchema, PriceOverride, RegistryModality, RegistrySnapshot } from "./types"

const STORAGE_KEY = "gencraft_registry_snapshot_v2"
const OVERLAY_KEY = "gencraft_registry_schemas_v2"
const SNAPSHOT_VERSION = "1"

type Listener = () => void
const listeners = new Set<Listener>()
const bundled = bundledJson as unknown as RegistrySnapshot
/** The models behind the AI tools (Remove background, Upscale...). They never appear in the pickers; the tools find them by endpoint. */
const withJobs = (r: ModelRecord): ModelRecord => {
  const jobs = jobsOf(r.id)
  return jobs ? { ...r, jobs } : r
}
/** Tool models: the ones the standard database lists, on every provider */
function utilityList(): ModelRecord[] {
  return getKnowledgeRecords().filter((r) => r.utility).map(withJobs)
}
let utility = utilityList()

// The registry is stored in IndexedDB: it is far larger than localStorage allows, and a refused save there used
// to make the app forget a provider's catalog and load it again on every launch.
const DB_NAME = "gencraft-registry"
const DB_STORE = "snapshot"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readStored(): Promise<RegistrySnapshot | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("current")
    req.onsuccess = () => resolve((req.result as RegistrySnapshot | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function writeStored(snap: RegistrySnapshot): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite")
    tx.objectStore(DB_STORE).put(snap, "current")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

type SchemaOverlay = Record<string, Pick<ModelRecord, "params" | "inputs" | "summary">>

function loadOverlay(): SchemaOverlay {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY)
    return raw ? (JSON.parse(raw) as SchemaOverlay) : {}
  } catch {
    return {}
  }
}

/** Schemas fetched on demand live in a small side map so the big snapshot is not rewritten per model. */
let overlay: SchemaOverlay = loadOverlay()

// Models the person added by hand ride along with every catalog change, so a refresh never drops them
let custom: ModelRecord[] = readCustomModels()
let modelNames: Record<string, string> = readModelNames()

function applyOverlay(records: ModelRecord[]): ModelRecord[] {
  const mapped = records.map((r) => (overlay[r.id] ? { ...r, ...overlay[r.id] } : r))
  if (custom.length === 0) return mapped
  const own = new Set(custom.map((c) => c.id))
  return [...mapped.filter((r) => !own.has(r.id)), ...custom]
}

let live: ModelRecord[] = applyOverlay(bundled.models)
let version = 0

// What a user can see depends on which providers have a key. Without one, a provider shows nothing.
export type KeyState = { status: "checking" | "ok" | "rejected" | "unverified"; checkedAt: number; message?: string }
const KEY_STATUS_KEY = "gencraft_key_status_v1"
const CHECKED_KEY = "gencraft_provider_checked_v1"

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable: nothing to persist
  }
}

let keyStates: Record<string, KeyState> = readJson(KEY_STATUS_KEY, {})
let lastChecked: Record<string, number> = readJson(CHECKED_KEY, {})
const ATTEMPT_KEY = "gencraft_provider_attempt_v2"
let lastAttempt: Record<string, number> = readJson(ATTEMPT_KEY, {})

function markAttempt(provider: string) {
  lastAttempt = { ...lastAttempt, [provider]: Date.now() }
  writeJson(ATTEMPT_KEY, lastAttempt)
}
let providersWithKey = new Set<string>()
let keyed = new Set<string>()

function recomputeKeyed() {
  keyed = new Set([...providersWithKey].filter((p) => keyStates[p]?.status !== "rejected"))
}

/** Tells the registry which providers have a key saved. Called whenever settings change. */
export function setProviderKeys(ids: string[]) {
  providersWithKey = new Set(ids)
  recomputeKeyed()
  emit()
}

export function getKeyState(provider: string): KeyState | undefined {
  return keyStates[provider]
}

export function setKeyState(provider: string, state: KeyState | null) {
  keyStates = { ...keyStates }
  if (state) keyStates[provider] = state
  else delete keyStates[provider]
  writeJson(KEY_STATUS_KEY, keyStates)
  recomputeKeyed()
  emit()
}

export function getLastChecked(provider: string): number | undefined {
  return lastChecked[provider]
}

function markChecked(provider: string) {
  lastChecked = { ...lastChecked, [provider]: Date.now() }
  writeJson(CHECKED_KEY, lastChecked)
}

export function getKeyedProviders(): string[] {
  return [...keyed]
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let saveFailed = false

/** Saves the registry shortly after the last change, so a burst of updates is one write. */
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const snap: RegistrySnapshot = { version: SNAPSHOT_VERSION, builtAt: new Date().toISOString(), models: live }
    writeStored(snap).then(
      () => {
        saveFailed = false
      },
      () => {
        saveFailed = true
        emit()
      },
    )
  }, 400)
}

/** True when the browser refused to keep the catalog. The app says so instead of reloading on every launch. */
export function registrySaveFailed(): boolean {
  return saveFailed
}

/**
 * Loads what an earlier session saved. A newer bundled catalog replaces the providers it covers, but a
 * provider the bundle does not carry (Replicate lists only for a token) keeps what it had.
 */
async function hydrate(): Promise<void> {
  try {
    const stored = await readStored()
    if (stored && stored.models.length > 0) {
      if (stored.builtAt >= bundled.builtAt) live = applyOverlay(stored.models)
      else {
        const covered = new Set(bundled.models.map((r) => r.provider))
        live = applyOverlay([...bundled.models, ...stored.models.filter((r) => !covered.has(r.provider))])
      }
      emit()
    }
    // The old localStorage copy only used up room
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem("gencraft_registry_snapshot_v1")
  } catch {
    // no IndexedDB: the bundled catalog is used
  }
}

export const registryReady: Promise<void> = typeof indexedDB === "undefined" ? Promise.resolve() : hydrate()

function emit() {
  version++
  listeners.forEach((l) => l())
}

// A newer standard database changes the tool models and the jobs of every model
subscribeKnowledge(() => {
  utility = utilityList()
  emit()
})

export function getLiveRecords(): ModelRecord[] {
  return live
}

export function getLastRefresh(): string | null {
  const last = Math.max(...Object.values(lastChecked), 0)
  return last ? new Date(last).toISOString() : bundled.builtAt
}

/**
 * Merge a fresh fetch into the stored registry.
 *  - A model missing from a refreshed provider is kept and flagged deprecated, never silently dropped.
 *  - A fresh list entry carries no schema or price, so what the registry already knew is kept.
 */
export function mergeRecords(previous: ModelRecord[], fetched: ModelRecord[], refreshedProviders: string[]): ModelRecord[] {
  const old = new Map(previous.map((r) => [r.id, r]))
  const next = new Map<string, ModelRecord>()
  for (const fresh of fetched) {
    const was = old.get(fresh.id)
    next.set(
      fresh.id,
      was
        ? {
            ...fresh,
            params: Object.keys(fresh.params.properties).length > 0 ? fresh.params : was.params,
            inputs: fresh.params.properties && Object.keys(fresh.params.properties).length > 0 ? fresh.inputs : was.inputs,
            summary: fresh.summary && Object.keys(fresh.summary).length > 0 ? fresh.summary : was.summary,
            price: fresh.price.amount === null ? was.price : fresh.price,
          }
        : fresh,
    )
  }
  for (const was of previous) {
    if (next.has(was.id)) continue
    next.set(was.id, refreshedProviders.includes(was.provider) ? { ...was, status: "deprecated" } : was)
  }
  return [...next.values()]
}

export type RefreshProvider = "fal" | "openrouter" | "openai" | "gemini"

export interface RefreshOptions {
  providers?: RefreshProvider[]
  /** BYOK keys raise provider rate limits; catalogs still load without them. */
  keys?: { fal?: string }
  signal?: AbortSignal
}

export interface RefreshReport {
  ok: boolean
  added: number
  deprecated: number
  errors: Record<string, string>
  /** Providers that returned a catalog but missed some categories (rate limits). */
  partial: string[]
}

const LAST_CHECK_KEY = "gencraft_registry_checked_at"

export async function refreshRegistry(opts: RefreshOptions = {}): Promise<RefreshReport> {
  // OpenAI and Gemini documentation pages need the desktop app's HTTP access
  const providers = opts.providers ?? (["fal", "openrouter", ...(isDesktopApp() ? ["openai", "gemini"] : [])] as RefreshProvider[])
  const errors: Record<string, string> = {}
  const fetched: ModelRecord[] = []
  const ok: string[] = []
  const partial: string[] = []

  await Promise.all(
    providers.map(async (p) => {
      try {
        if (p === "fal") {
          const res = await fetchFalModels({ apiKey: opts.keys?.fal, signal: opts.signal })
          fetched.push(...res.records)
          if (res.failedCategories.length > 0) partial.push("fal")
          // fal's chat models: if their list cannot be read now, the ones already saved are kept
          try {
            fetched.push(...(await fetchFalChatModels(opts.signal)))
          } catch {
            if (!partial.includes("fal")) partial.push("fal")
          }
        } else if (p === "openrouter") {
          fetched.push(...(await fetchOpenRouterModels(opts.signal)))
        } else if (p === "openai") {
          fetched.push(...(await fetchOpenAIRecords(fetchText)).records)
        } else {
          fetched.push(...(await fetchGeminiRecords(fetchText)).records)
        }
        ok.push(p)
      } catch (e) {
        errors[p] = e instanceof Error ? e.message : String(e)
      }
    }),
  )

  const before = new Set(live.map((r) => r.id))
  // A provider that answered only partly must not retire the models it failed to list
  const merged = applyLifecycle(mergeRecords(live, fetched, ok.filter((p) => !partial.includes(p))))
  const added = merged.filter((r) => !before.has(r.id)).length
  const deprecated = merged.filter((r) => r.status === "deprecated").length
  if (ok.length > 0) {
    live = applyOverlay(merged)
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))
    } catch {
      // the next launch simply checks again
    }
    persist()
    emit()
  }
  return { ok: ok.length > 0, added, deprecated, errors, partial }
}

/**
 * Reads the price from fal's official page for models the chat picker offers and that have no price yet.
 * Bounded and polite: a few models at a time, never the whole catalog.
 */
export async function refreshMissingPrices(limit = 60): Promise<number> {
  if (!isDesktopApp()) return 0
  const on = new Set(computeDefaultEnabled(getListedModels()))
  const targets = live.filter((r) => r.provider === "fal" && r.modality !== "text" && on.has(r.id) && r.price.amount === null).slice(0, limit)
  let found = 0
  let next = 0
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < targets.length) {
        const r = targets[next++]!
        const parsed = await fetchFalPagePrice(r.endpoint, undefined, appFetch)
        if (!parsed) continue
        found++
        live = live.map((x) => (x.id === r.id ? { ...x, price: { unit: parsed.unit, amount: parsed.amount, rules: parsed.rules, source: "scraped" as const, fetchedAt: new Date().toISOString() } } : x))
      }
    }),
  )
  if (found > 0) {
    persist()
    emit()
  }
  return found
}

export const WEEK_MS = 7 * 24 * 3600 * 1000
const CHECK_EVERY_MS = 6 * 3600 * 1000
const RETRY_AFTER_MS = 6 * 3600 * 1000
const EMPTY_RETRY_MS = 2 * 60 * 1000

/** When a provider will next be checked on its own: a week after the last check. */
export function nextCheckAt(provider: string): number | undefined {
  const last = lastChecked[provider]
  return last ? last + WEEK_MS : undefined
}

/**
 * Replicate loads once when the key is saved, then once a week. An empty list loads it too (first launch, or
 * cleared data), but never more than once every few hours, so a failure cannot turn into a reload on every launch.
 */
const TOOLS_READ_KEY = "gencraft_replicate_tools_v1"
/** Whether Replicate's tool collections (upscale, background removal ...) have been read on this device */
function replicateToolsRead(): boolean {
  try {
    return localStorage.getItem(TOOLS_READ_KEY) === "1"
  } catch {
    return true
  }
}
function markReplicateToolsRead() {
  try {
    localStorage.setItem(TOOLS_READ_KEY, "1")
  } catch {
    // storage unavailable: it is read again next start
  }
}

function shouldLoadReplicate(): boolean {
  const now = Date.now()
  const attempted = lastAttempt.replicate ?? 0
  const empty = !live.some((r) => r.provider === "replicate")
  // Nothing is shown while the list is empty, so a failed try is repeated soon; a list that exists is only refreshed every few hours
  // The one-time read of the tool collections ignores the wait, except right after a try
  if (!empty && !replicateToolsRead() && now - attempted > 2 * 60_000) return true
  if (now - attempted < (empty ? EMPTY_RETRY_MS : RETRY_AFTER_MS)) return false
  // Models saved by an older version lack the request spec and safety switch, so they are read again
  const outdated = live.some((r) => r.provider === "replicate" && r.params.request?.v !== REQUEST_VERSION)
  // A list read before the tool collections were added is read once more, so the AI tools find Replicate's models
  return empty || outdated || !replicateToolsRead() || isUpdateDue(lastChecked.replicate || undefined, now)
}

/**
 * The desktop app's own "cron job": on launch, and every few hours while open, refresh the registry if it is
 * more than a week old. Lifecycle (newer versions, retirement dates) is recomputed every time, so a model
 * whose shutdown date passes drops out of the picker without any network call at all.
 */
export function startRegistryScheduler(keys?: () => { fal?: string; replicate?: string }): () => void {
  const tick = async () => {
    await registryReady
    // Expiry works offline: recompute lifecycle against today's date
    live = applyLifecycle(live)
    emit()
    let last = 0
    try {
      last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0)
    } catch {
      last = 0
    }
    // Replicate lists nothing without a token, so its catalog is loaded here: first launch with a key, then weekly
    const replicateKey = keys?.().replicate
    if (replicateKey && keyed.has("replicate") && shouldLoadReplicate()) void unlockProvider("replicate", replicateKey)
    // The person chooses how often (Settings, General); "only when I click" means this never runs on its own
    if (!isUpdateDue(last || undefined) || keyed.size === 0) return
    const report = await refreshRegistry({ providers: [...keyed].filter((p): p is RefreshProvider => ["fal", "openrouter", "openai", "gemini"].includes(p)), keys: keys?.() })
    if (report.ok) await refreshMissingPrices()
  }
  // Wait a moment so the saved keys are in place before the first check
  const first = window.setTimeout(() => void tick(), 1500)
  const id = window.setInterval(() => void tick(), CHECK_EVERY_MS)
  return () => {
    window.clearTimeout(first)
    window.clearInterval(id)
  }
}

/** none = the provider publishes no schema for this endpoint; the model runs with prompt only. */
export type SchemaStatus = { state: "idle" | "loading" | "ready" | "none" | "error"; error?: string }
const schemaStatus = new Map<string, SchemaStatus>()

export function getSchemaStatus(id: string): SchemaStatus {
  return schemaStatus.get(id) ?? { state: "idle" }
}

function setStatus(id: string, status: SchemaStatus) {
  schemaStatus.set(id, status)
  emit()
}

/**
 * fal list entries have no parameters yet. Fetch the real schema the first time a model is used,
 * store it, and let subscribers re-render. Safe to call repeatedly; failures can be retried.
 */
export async function ensureSchema(id: string, falKey?: string): Promise<void> {
  const rec = live.find((r) => r.id === id)
  if (!rec || rec.provider !== "fal") return
  if (Object.keys(rec.params.properties).length > 0) return
  if (getSchemaStatus(id).state === "loading") return
  setStatus(id, { state: "loading" })
  try {
    const updated = attachSchema(rec, await fetchFalSchema(rec.endpoint, falKey))
    overlay = { ...overlay, [id]: { params: updated.params, inputs: updated.inputs, summary: updated.summary } }
    live = live.map((r) => (r.id === id ? updated : r))
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay))
    } catch {
      // quota: schema will be refetched next time
    }
    setStatus(id, { state: "ready" })
  } catch (e) {
    if (e instanceof NoSchemaError) {
      setStatus(id, { state: "none" })
      return
    }
    setStatus(id, { state: "error", error: e instanceof Error ? e.message : String(e) })
  }
}

function legacySchema(model: AIModel): ParamSchema {
  const caps = resolveModelCapabilities(model)
  const properties: ParamSchema["properties"] = {}
  const isVisual = model.type === "video" || model.type === "image"
  if (isVisual) {
    properties.aspect_ratio = { type: "string", title: "Aspect ratio", enum: caps.supportedAspectRatios, default: caps.supportedAspectRatios[0] }
    properties.resolution = { type: "string", title: "Resolution", enum: caps.supportedResolutions, default: caps.supportedResolutions[0] }
  }
  if (model.type === "video" || model.type === "audio") {
    properties.duration = { type: "integer", title: "Duration (s)", enum: caps.supportedDurations, default: caps.supportedDurations[0] }
  }
  if (model.type === "image") {
    const counts = model.supportedBatchCounts?.length ? model.supportedBatchCounts : [1, 2, 4]
    properties.num_images = { type: "integer", title: "Images", enum: counts, default: counts[0] }
  }
  if (model.type === "video" && caps.supportsCameraControl) {
    properties.camera_motion = {
      type: "string",
      title: "Camera",
      enum: ["static", "pan-left", "pan-right", "zoom-in", "zoom-out", "orbit", "crane-up"],
      default: "static",
    }
  }
  return { type: "object", properties }
}

const TYPE_TO_MODALITY: Record<AIModel["type"], RegistryModality> = {
  video: "video",
  image: "image",
  audio: "audio",
  chat: "text",
  plan: "text",
  multimodal: "text",
}

/** Bridges the bundled catalog into registry records so the whole app reads one shape. */
export function recordFromLegacy(model: AIModel): ModelRecord {
  const caps = resolveModelCapabilities(model)
  const inputs: ModelRecord["inputs"] = ["text"]
  if (caps.supportsReferenceImage) inputs.push("image")
  if (caps.supportsReferenceVideo) inputs.push("video")
  return {
    id: model.id,
    endpoint: model.id,
    provider: model.provider,
    name: model.name,
    family: model.family ?? model.name,
    logoKey: model.family ?? model.provider,
    modality: TYPE_TO_MODALITY[model.type],
    inputs,
    params: model.type === "chat" || model.type === "plan" || model.type === "multimodal" ? EMPTY_SCHEMA : legacySchema(model),
    price: { unit: "per_run", amount: model.costNumeric, source: "estimate", fetchedAt: new Date(0).toISOString() },
    status: "active",
    description: model.description,
  }
}

/** Converts a live record into the AIModel shape the generation pipeline already consumes. */
export function toAIModel(rec: ModelRecord): AIModel {
  const type: AIModel["type"] = rec.modality === "text" ? "chat" : rec.modality
  const enumOf = (key: string) => rec.params.properties[key]?.enum
  return {
    id: rec.id,
    name: rec.name,
    provider: rec.provider as ProviderType,
    type,
    family: rec.family,
    costPerRun: rec.price.amount === null ? "n/a" : `$${rec.price.amount.toFixed(3)}`,
    costNumeric: rec.price.amount ?? 0,
    resolution: "auto",
    latency: "—",
    characterConsistencyScore: 80,
    description: rec.description ?? "",
    supportsReferences: rec.inputs.includes("image"),
    supportedAspectRatios: enumOf("aspect_ratio")?.map(String),
    supportedResolutions: enumOf("resolution")?.map(String),
    supportedDurations: enumOf("duration")?.map(Number),
    supportedBatchCounts: enumOf("num_images")?.map(Number),
  }
}

/**
 * Every model the registry knows from the five supported providers, including superseded and retiring
 * ones: a project may still use them and needs the lookup to show a warning.
 */
export function getRegistryModels(): ModelRecord[] {
  return live.filter((r) => PROVIDER_IDS.includes(r.provider)).map(withOverride)
}

// Prices the user corrected. They are applied when records are read, so no refresh can overwrite them.
let overrides: Record<string, PriceOverride> = {}

export function setPriceOverrides(next: Record<string, PriceOverride> | undefined) {
  overrides = next ?? {}
  emit()
}

// Settings that other hosts list for the same model, worked out once per catalog change
let extrasFor: ModelRecord[] | null = null
// Only the parameter list is kept: the name and the price can change at any time (a rename, an edited price)
const extrasCache = new Map<string, ModelRecord["params"]>()

let prevalence: ReturnType<typeof prevalenceOf> = {}

// The model's versions at one provider, grouped once per catalog change
let familiesFor: ModelRecord[] | null = null
const familyIndex = new Map<string, ModelRecord[]>()

// The endpoints that do something extra for a model (motion transfer, extend, lip-sync), grouped once per catalog change
let featuresIndexFor: ModelRecord[] | null = null
const baseIndex = new Map<string, ModelRecord[]>()

/** What the model can do besides making a clip or picture from words: each is another endpoint of the same model at its provider. */
export function getFeatures(record: ModelRecord): FeatureOffer[] {
  if (featuresIndexFor !== live) {
    baseIndex.clear()
    for (const r of live) {
      if (r.status === "deprecated") continue
      const key = baseKey(r)
      baseIndex.set(key, [...(baseIndex.get(key) ?? []), r])
    }
    featuresIndexFor = live
  }
  return featuresOf(record, baseIndex.get(baseKey(record)) ?? []).map((o) => ({ def: o.def, record: withOverride(o.record) }))
}

/** The model's versions at its provider (text, image and reference versions), including the record itself. */
export function getFamily(record: ModelRecord): ModelRecord[] {
  // A tool that edits a file describes only itself
  if (isEditTask(record)) return [record]
  if (familiesFor !== live) {
    familyIndex.clear()
    for (const r of live) {
      if (r.status === "deprecated") continue
      const key = familyKey(r)
      familyIndex.set(key, [...(familyIndex.get(key) ?? []), r])
    }
    familiesFor = live
  }
  // Each version as the catalog sees it, with what other providers list for it added
  const members = (familyIndex.get(familyKey(record)) ?? []).filter((r) => r.id === record.id || !isEditTask(r)).map(withHostExtras)
  return members.some((r) => r.id === record.id) ? members : [record, ...members]
}

/** The record as the catalog sees it: other hosts' settings added, each field in the tier the catalog gives it. */
function withHostExtras(r: ModelRecord): ModelRecord {
  if (extrasFor !== live) {
    extrasCache.clear()
    extrasFor = live
    prevalence = prevalenceOf(live.filter((x) => x.status !== "deprecated"))
  }
  let params = extrasCache.get(r.id)
  if (!params) {
    params = retier(withCrossHost(withOfficial(r), live), prevalence).params
    extrasCache.set(r.id, params)
  }
  if (params === r.params) return r
  // Files that were added (a start frame, reference images) change what the row can say the model takes
  const refs = refSummary({ params })
  return { ...r, params, summary: refs ? { ...r.summary, refs } : r.summary }
}

function withOverride(r: ModelRecord): ModelRecord {
  const named = modelNames[r.id] ? { ...r, name: modelNames[r.id]! } : r
  const o = overrides[r.id]
  const priced = o ? { ...named, price: { unit: o.unit, amount: o.amount, outputAmount: o.outputAmount, source: "edited" as const, fetchedAt: o.editedAt } } : named
  // The maker's settings that this host does not list but another host does, then what real runs have shown about them
  return applyParamChecks(withHostExtras(priced))
}

// A run that settles a setting changes what the pickers show
onParamChecksChange(() => emit())

/** The provider's own record and price, ignoring any edit, plus whether the provider's number has moved since the edit. */
export function getPriceState(id: string): { raw?: ModelRecord; override?: PriceOverride; providerMoved: boolean } {
  const raw = live.find((r) => r.id === id)
  const override = overrides[id]
  const providerMoved = Boolean(override && raw && raw.price.amount !== null && override.providerAmount !== raw.price.amount)
  return { raw, override, providerMoved }
}

/** What the picker and Settings offer for new work: current, not retiring, and something the app can run. */
// The app offers only the newest models of the makers and lines on the watch-list. Worked out once per catalog change.
let watchedFor: ModelRecord[] | null = null
let watchedIds = new Set<string>()
/** A provider whose watch-list result is this small shows its newest models anyway, so a key never opens an empty list. */
const MIN_SHOWN = 12
const FALLBACK_SHOWN = 60

function watched(): Set<string> {
  if (watchedFor !== live) {
    const current = live.filter((r) => isListed(r))
    const ids = new Set(selectWatched(current).kept.map((r) => r.id))
    for (const provider of new Set(current.map((r) => r.provider))) {
      const mine = current.filter((r) => r.provider === provider && isRunnable(r.provider, r.modality))
      if (mine.filter((r) => ids.has(r.id)).length >= MIN_SHOWN) continue
      for (const r of [...mine].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, FALLBACK_SHOWN)) ids.add(r.id)
    }
    watchedIds = ids
    watchedFor = live
  }
  return watchedIds
}

/** What is saved for a provider and what the app offers from it, for the panel to explain an empty list. */
export function providerCounts(provider: string): { saved: number; offered: number } {
  return { saved: live.filter((r) => r.provider === provider).length, offered: getListedModels().filter((r) => r.provider === provider).length }
}

/** True when the model is one the app still offers (on the watch-list, newest of its line, or added by hand). */
export function isWatchedModel(id: string): boolean {
  return watched().has(id) || custom.some((c) => c.id === id)
}

/** Keeps a model the person added. It is listed whatever the watch-list says. */
export function addCustomModel(record: ModelRecord) {
  custom = [...custom.filter((c) => c.id !== record.id), { ...record, custom: true }]
  saveCustomModels(custom)
  live = applyOverlay(live)
  emit()
}

export function removeCustomModel(id: string) {
  custom = custom.filter((c) => c.id !== id)
  saveCustomModels(custom)
  live = live.filter((r) => r.id !== id)
  emit()
}

/** A name the person gave a model. An empty name goes back to the provider's. */
export function renameModel(id: string, name: string) {
  const next = { ...modelNames }
  if (name.trim()) next[id] = name.trim()
  else delete next[id]
  modelNames = next
  writeModelNames(next)
  emit()
}

export function isCustomModel(id: string): boolean {
  return custom.some((c) => c.id === id)
}

export function getListedModels(now = Date.now()): ModelRecord[] {
  return live.filter((r) => keyed.has(r.provider) && PROVIDER_IDS.includes(r.provider) && isRunnable(r.provider, r.modality) && !r.utility && (r.custom || (isListed(r, now) && watched().has(r.id)))).map(withOverride).map(withJobs)
}

export function getRecord(id: string): ModelRecord | undefined {
  const r = live.find((x) => x.id === id) ?? utility.find((x) => x.id === id)
  return r ? withJobs(withOverride(r)) : undefined
}

/** Every model the AI tools can look through: the live registry and the utility models */
export function getToolRecords(): ModelRecord[] {
  const have = new Set(live.map((r) => r.id))
  return [...live.map(withJobs), ...utility.filter((r) => !have.has(r.id))]
}

/** Resolve an AIModel for any id, including live-only models the legacy catalog has never heard of. */
export function resolveAIModel(id: string): AIModel | undefined {
  const legacy = getAllModels().find((m) => m.id === id)
  if (legacy) return legacy
  const rec = live.find((r) => r.id === id) ?? utility.find((r) => r.id === id)
  return rec ? toAIModel(rec) : undefined
}

export function useSchemaStatus(id: string | undefined): SchemaStatus {
  useRegistry()
  return id ? getSchemaStatus(id) : { state: "idle" }
}

export function useRegistry(): ModelRecord[] {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => getRegistryModels(), [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useListedModels(): ModelRecord[] {
  useRegistry()
  return React.useMemo(() => getListedModels(), [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Adding a key unlocks a provider's models

export type UnlockStatus = { state: "idle" | "loading" | "done" | "error"; message?: string; done?: number; total?: number; count?: number }
const unlockStatus = new Map<string, UnlockStatus>()
const UNLOCK_ERROR_KEY = "gencraft_unlock_error_v1"

/** The last failure is kept across restarts, so the panel can say why nothing loaded instead of staying silent. */
function storedUnlockError(provider: string): string | undefined {
  return readJson<Record<string, string>>(UNLOCK_ERROR_KEY, {})[provider]
}

function storeUnlockError(provider: string, message: string | undefined) {
  const all = readJson<Record<string, string>>(UNLOCK_ERROR_KEY, {})
  if (message) all[provider] = message
  else delete all[provider]
  writeJson(UNLOCK_ERROR_KEY, all)
}

export function getUnlockStatus(provider: string): UnlockStatus {
  const live = unlockStatus.get(provider)
  if (live) return live
  const failed = storedUnlockError(provider)
  return failed ? { state: "error", message: failed } : { state: "idle" }
}

function setUnlock(provider: string, status: UnlockStatus) {
  unlockStatus.set(provider, status)
  emit()
}

export function useUnlockStatus(provider: string): UnlockStatus {
  useRegistry()
  return getUnlockStatus(provider)
}

/**
 * Called when a provider key is saved and accepted. The key opens the provider for this user, then everything
 * about it is checked live:
 *  - the catalog (new models, retired models, release and shutdown dates)
 *  - prices (fal: official pages and the pricing API; OpenRouter: the list itself; Replicate: model pages)
 *  - Replicate lists nothing without a token, so its whole catalog loads here
 * Pages that web browsers cannot read (OpenAI and Gemini docs, Replicate) are read through the desktop app.
 */
export async function unlockProvider(provider: string, key: string): Promise<void> {
  if (!key.trim()) return
  if (unlockStatus.get(provider)?.state === "loading") return
  storeUnlockError(provider, undefined)
  try {
    if (provider === "replicate") {
      setUnlock(provider, { state: "loading", message: "Reading your Replicate catalog", done: 0, total: 0 })
      // Models whose version has not changed are kept as they are; only new or updated ones are read again
      const known = new Map(live.filter((r) => r.provider === "replicate").map((r) => [r.id, r]))
      const result = await fetchReplicateModels(replicateCall(key), {
        known,
        // Models appear and are saved as they are read, so a restart in the middle loses nothing
        onBatch: (batch) => {
          live = applyOverlay(mergeRecords(live, batch, []))
          persist()
          emit()
        },
        onProgress: (done, total) => setUnlock(provider, { state: "loading", message: "Reading model details", done, total }),
      })
      if (result.records.length === 0) throw new Error("Replicate returned no models. Check that the token is valid.")
      live = applyOverlay(applyLifecycle(mergeRecords(live, result.records, ["replicate"])))
      markReplicateToolsRead()
      persist()
      emit()
      // Prices come from each model's page, read for every model so none is left blank
      {
        const targets = live.filter((r) => r.provider === "replicate" && (r.price.amount === null || (r.price.source === "scraped" && r.price.fetchedAt < PRICE_READER_DATE)))
        let next = 0
        let done = 0
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            while (next < targets.length) {
              const r = targets[next++]!
              const p = await fetchReplicatePagePrice(r.endpoint, replicatePageFetch)
              if (p) live = live.map((x) => (x.id === r.id ? { ...x, price: { unit: p.unit, amount: p.amount, outputAmount: p.outputAmount, rules: p.rules, ...("computeSecond" in p && p.computeSecond ? { computeSecond: p.computeSecond } : {}), source: "scraped" as const, fetchedAt: new Date().toISOString() } } : x))
              setUnlock(provider, { state: "loading", message: "Reading prices", done: ++done, total: targets.length })
              if (done % 25 === 0) {
                persist()
                emit()
              }
            }
          }),
        )
        persist()
        emit()
      }
      markChecked(provider)
      setUnlock(provider, { state: "done", count: live.filter((r) => r.provider === "replicate").length, message: `${result.records.length} models loaded${result.unchanged > 0 ? `, ${result.records.length - result.unchanged} new or updated` : ""}${(() => {
          const mine = live.filter((r) => r.provider === "replicate")
          const n = (m: string) => mine.filter((r) => r.modality === m).length
          return ` (${n("text")} chat, ${n("image")} image, ${n("video")} video, ${n("audio")} audio) · ${mine.filter((r) => r.price.amount !== null).length} with prices`
        })()}` })
      return
    }

    setUnlock(provider, { state: "loading", message: "Checking the live catalog" })
    const report = await refreshRegistry({ providers: [provider as RefreshProvider], keys: provider === "fal" ? { fal: key } : undefined })
    const failure = report.errors[provider]
    let note = ""
    if (failure) {
      const docsOnly = (provider === "openai" || provider === "gemini") && !isDesktopApp()
      if (!docsOnly) throw new Error(failure)
      note = "The official pages can only be read inside the desktop app, so these models come from the last full check."
    }

    if (provider === "fal") {
      setUnlock(provider, { state: "loading", message: "Reading prices with your key" })
      const missing = live.filter((r) => r.provider === "fal" && isListed(r) && r.price.amount === null)
      if (missing.length > 0) {
        try {
          const priced = await fetchFalPricing(missing, key)
          const byId = new Map(priced.map((r) => [r.id, r]))
          live = live.map((r) => {
            const p = byId.get(r.id)
            return p && p.price.amount !== null ? { ...r, price: p.price } : r
          })
          persist()
        } catch (e) {
          note = `Prices could not be read with this key (${e instanceof Error ? e.message : String(e)}).`
        }
      }
    }

    markChecked(provider)
    const count = live.filter((r) => r.provider === provider && isListed(r)).length
    setUnlock(provider, {
      state: "done",
      count,
      message: note || `${count} current models · ${report.added} new · ${report.deprecated} retired`,
    })
  } catch (e) {
    // Only a real failure holds off the next automatic try; a restart in the middle of a load must not
    if (provider === "replicate") markAttempt(provider)
    const message = e instanceof Error ? e.message : String(e)
    storeUnlockError(provider, message)
    setUnlock(provider, { state: "error", message })
  }
}

export function useKeyedProviders(): string[] {
  useRegistry()
  return React.useMemo(() => [...keyed], [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

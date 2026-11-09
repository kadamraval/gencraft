import { taskOf } from "../registry/tasks"
import { matchScore } from "../registry/shortlist"
import { actionOf } from "../sheet/actions"
import type { ProviderTask, Fact, MakerList, MakerModel, PriceValue } from "../sheet/types"
import type { ModelPrice, ModelRecord, PriceUnit } from "../registry/types"
import { toolById } from "../ai-tools/catalog"
import { capabilityOfExact } from "../capability"
import { PACK_SCHEMA_VERSION } from "./schema"
import { makerIndex, makerOf, modelSlugOf, nameKey, officialMakerOf, popularityOf, weightsOf } from "./identity"
import { GRID_PROVIDERS } from "./grid"
import { familyIndex, versionKey, versionName, versionId, versionOf as readVersion, type ModelVersion } from "./versions"
import { capabilitiesOf, fieldsOf } from "./capabilities"
import type { KnowledgePack, PackGap, PackLine, PackMaker, PackModel, PackPrice, PackSource, PackTask, Provider } from "./schema"

/**
 * Builds the standard database from the maker list and what the sources said. Nothing is guessed: a line is published only when its
 * endpoint, parameters and price each came from a source; everything else goes to `gaps` with the reason.
 *
 * Order for a fact: the provider's standard list and API (the records), the LiteLLM file, the page scraper (`pagePrices`). A price that
 * was only an estimate is not a price.
 */

/** What a fal endpoint's own name says it does to a file. Anything else is a model that makes things. */
const TOOL_ACTIONS = new Set(["remove-background", "upscale", "interpolate", "relight", "restyle", "reframe", "remove-object", "fill", "colorize", "restore", "lip-sync", "motion-transfer", "extend", "isolate-voice", "noise-reduction", "separate-audio", "voice-change", "dub", "transcribe"])

/** A model that changes a file (upscale, remove a background ...) rather than making something from a prompt: read from the endpoint's own name, never from a list */
export function isToolEndpoint(rec: Pick<ModelRecord, "provider" | "endpoint" | "task">): boolean {
  return rec.provider === "fal" && TOOL_ACTIONS.has(actionOf(rec.endpoint, rec.task as ProviderTask | undefined).action)
}

/** The tasks (and the few tools such as transcription) a model does, from its provider task and what it takes in */
export function servesOfRecord(rec: ModelRecord): string[] {
  const task = taskOf(rec)
  const out: string[] = []
  if (task === "text-to-image") out.push("text-to-image")
  // General editing only for a model whose name says edit or nothing more specific (an "expand" model is outpainting, not editing)
  if (task === "image-edit" && ["edit", "generate", "other"].includes(actionOf(rec.endpoint, "image-to-image").action)) out.push("image-edit")
  if (task === "text-to-video") out.push("text-to-video")
  if (task === "image-to-video" || takesPicture(rec)) out.push("image-to-video")
  if (task === "reference-to-video") out.push("reference-to-video")
  if (task === "speech") out.push("audio-text-to-speech")
  // fal files turn detection and forced alignment under speech-to-text too; only a model that says it transcribes is a transcriber
  if (task === "transcription" && !/align|turn|diariz|vad/i.test(rec.endpoint) && (/whisper|wizper|scribe|transcri|speech-to-text|asr|stt|parakeet|canary|voxtral|chirp|nova/i.test(rec.endpoint) || /transcri/i.test(rec.description ?? ""))) out.push("audio-transcribe")
  // A model that pulls a sound out of a clip (separates it) makes no new sound for it
  if (task === "audio-from-video" && !/separat|isolat|extract/i.test(rec.endpoint)) out.push(/music|score|soundtrack/i.test(rec.endpoint) ? "video-music" : "video-sound-effects")
  if (task === "video-from-audio") out.push("video-lip-sync")
  if (task === "audio-generation") {
    out.push(/sound-?effects?|sfx|foley/i.test(rec.endpoint) ? "audio-text-to-sfx" : "audio-text-to-music")
    // A sound maker its provider describes as making sounds as well as music does both
    if (MAKES_SOUNDS.test(rec.description ?? "")) out.push("audio-text-to-sfx")
  }
  return [...new Set(out)]
}

export const PROVIDERS: Provider[] = ["fal", "replicate", "openrouter", "openai", "gemini"]

export interface BuildInput {
  makers: MakerList
  tasks: PackTask[]
  tools: PackTask[]
  /** What each provider's own list says, as registry records */
  records: ModelRecord[]
  /** Prices read from model pages, keyed `provider|endpoint` */
  pagePrices?: Map<string, ModelPrice>
  /** LiteLLM facts (price, via the file's key) */
  litellm?: Fact[]
  /** Where the sources were read, for the Sources sheet */
  sources?: PackSource[]
  now: string
  /** Models whose maker publishes the weights on Hugging Face, by model id (read by the build script) */
  onHub?: Set<string>
  /** Model names (see nameKey) with a well-used public repository on Hugging Face: open weights for a model of no known maker */
  publicNames?: Set<string>
  /** Task and tool ids a provider's own grouping gives a model (Replicate collections), keyed `provider|endpoint` */
  serveTags?: Map<string, string[]>
}

/** Hosts file reference-to-video under image-to-video or video-to-video; a tool's provider task stands for its own task */
const TASK_CATEGORY: Record<string, ProviderTask[]> = {
  "text-to-image": ["text-to-image"],
  "image-edit": ["image-to-image"],
  "text-to-video": ["text-to-video"],
  "image-to-video": ["image-to-video"],
  "reference-to-video": ["reference-to-video", "image-to-video", "video-to-video"],
  "video-edit": ["video-to-video", "audio-to-video"],
  speech: ["text-to-speech"],
  "audio-generation": ["text-to-audio"],
  "audio-edit": ["audio-to-audio", "speech-to-text"],
  chat: [],
  transcription: ["speech-to-text"],
  "audio-from-video": ["video-to-audio"],
  "video-from-audio": ["audio-to-video"],
}

const LITELLM_UNIT: Record<PriceValue["unit"], PriceUnit> = {
  per_image: "per_image",
  per_second: "per_second",
  per_video: "per_run",
  per_megapixel: "per_megapixel",
  per_run: "per_run",
  per_million_tokens: "per_1m_tokens",
  per_thousand_characters: "per_1k_chars",
  other: "unknown",
}

// A video model that takes a picture in (its own list says so) also turns a picture into video, whatever task its list files it under
const takesPicture = (rec: ModelRecord) => rec.category === "video" && rec.inputs.includes("image") && rec.task !== "video-to-video"

// OpenRouter files a picture model that takes a text prompt and optionally a picture under one task; it does both text-to-image and edit
const makesFromText = (rec: ModelRecord) => rec.provider === "openrouter" && rec.category === "image" && rec.inputs.includes("text")

const fits = (task: string, rec: ModelRecord): boolean => (task === "text-to-image" && makesFromText(rec)) || (TASK_CATEGORY[taskOf(rec)] ?? []).includes(task as ProviderTask) || (task === "image-to-video" && takesPicture(rec)) || (rec.category === "audio" && task === "speech-to-text" && rec.task === "speech-to-text")

/** The price a record carries, kept only when a source said it. An estimate or a bundled guess is not one. */
function priceOf(rec: ModelRecord, page: ModelPrice | undefined, lite: PriceValue | undefined, now: string): PackPrice | null {
  const own = rec.price
  if (((own.amount !== null && own.amount > 0) || (own.amount === 0 && own.source === "api") || (own.computeSecond ?? 0) > 0) && (own.source === "api" || own.source === "scraped" || own.source === "curated" || own.source === "edited")) {
    return { unit: own.unit, amount: own.amount ?? null, outputAmount: own.outputAmount, cachedAmount: own.cachedAmount, computeSecond: own.computeSecond, rules: own.rules, from: own.source === "api" ? "api" : own.source === "scraped" ? "page" : "maker", readOn: own.fetchedAt || now }
  }
  if (page && ((page.amount !== null && page.amount > 0) || (page.computeSecond ?? 0) > 0)) return { unit: page.unit, amount: page.amount ?? null, outputAmount: page.outputAmount, computeSecond: page.computeSecond, rules: page.rules, from: "page", readOn: page.fetchedAt || now }
  if (lite) return { unit: LITELLM_UNIT[lite.unit], amount: lite.amount, from: "litellm", readOn: now }
  return null
}

const versionOf = (s: string): number[] => (s.match(/\d+(?:\.\d+)*/g) ?? []).flatMap((x) => x.split(".").map(Number))
const cmpVersion = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  return 0
}

/** A provider's name that says nothing on its own ("Video", "V1.1") is replaced by the maker and the model's own words */
function displayName(name: string, makerId: string, modelId: string): string {
  if (/[a-z]{3,}/i.test(name.replace(/\bvideo\b|\bimage\b|\baudio\b/gi, ""))) return name
  const words = (modelId.split("/")[1] ?? "").split("-").map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
  return `${makerId.charAt(0).toUpperCase()}${makerId.slice(1)} ${words.join(" ")}`.trim()
}

export function buildPack(input: BuildInput): KnowledgePack {
  const { makers, records, now } = input
  const index = makerIndex(makers)
  const entries = [...input.tasks, ...input.tools]
  const toolIds = new Set(input.tools.map((t) => t.id))
  const gaps: PackGap[] = []
  const byProvider = new Map<Provider, ModelRecord[]>()
  for (const p of PROVIDERS) byProvider.set(p, records.filter((r) => r.provider === p && r.status !== "deprecated"))
  const liteByKey = new Map<string, PriceValue>()
  for (const f of input.litellm ?? []) {
    if (f.field !== "price") continue
    if (f.via) liteByKey.set(f.via, f.value as PriceValue)
    // The same price, found by the provider and endpoint it belongs to
    if (!liteByKey.has(`${f.host}|${f.endpoint}`)) liteByKey.set(`${f.host}|${f.endpoint}`, f.value as PriceValue)
  }

  // 1. Who each endpoint is: its maker, the one model it is, and whether that model's weights are public. A model of the maker list is
  // found by the endpoints it declares (or by name); everything else by the names the provider uses.
  interface Identity {
    makerId: string
    knownMaker: boolean
    modelId: string
    name: string
    weights?: "open" | "closed"
    declared?: MakerModel
    /** The maker family it belongs to ("Kling"), when the maker list names it: its name is then already the clean one */
    family?: string
  }
  const ident = new Map<ModelRecord, Identity>()
  for (const mk of makers.makers) {
    for (const m of mk.models) {
      for (const p of PROVIDERS) {
        const pool = byProvider.get(p) ?? []
        const named = m.hosts[p] ?? []
        const rec = pool.find((r) => named.includes(r.endpoint)) ?? matchIn(pool, m, mk.name)
        const modelId = m.id.split("/").slice(0, 2).join("/")
        if (rec && !ident.has(rec)) ident.set(rec, { makerId: mk.id, knownMaker: true, modelId, name: m.name, declared: m, weights: weightsOf(rec, mk.id, index, input.onHub?.has(modelId) || input.onHub?.has(`${mk.id}/${modelSlugOf(rec)}`)) })
      }
    }
  }
  const identityOf = (rec: ModelRecord): Identity => {
    let id = ident.get(rec)
    if (!id) {
      const maker = makerOf(rec, index)
      const modelId = `${maker.id}/${modelSlugOf(rec)}`
      id = { makerId: maker.id, knownMaker: maker.known, modelId, name: rec.name, weights: weightsOf(rec, maker.id, index, input.onHub?.has(modelId)) }
      ident.set(rec, id)
    }
    return id
  }

  // One model has one answer: what one provider says about its weights holds on every provider that runs it
  for (const p of PROVIDERS) for (const r of byProvider.get(p) ?? []) identityOf(r)
  const known = new Map<string, "open" | "closed">()
  for (const who of ident.values()) if (who.weights && !known.has(who.modelId)) known.set(who.modelId, who.weights)
  for (const who of ident.values()) if (!who.weights && known.has(who.modelId)) who.weights = known.get(who.modelId)
  // A model of no known maker is the same open model as one of the same name that another provider shows as open, or that is public on
  // Hugging Face under that name
  const openNames = new Set<string>()
  for (const [rec, who] of ident) if (who.weights === "open") openNames.add(nameKey(rec))
  for (const [rec, who] of ident) if (!who.weights && !who.knownMaker && (openNames.has(nameKey(rec)) || input.publicNames?.has(nameKey(rec)))) who.weights = "open"

  const packMakers = new Map<string, PackMaker>()
  const models = new Map<string, PackModel>()
  const taken = new Set<string>() // provider|endpoint|task-or-tool already used by a line

  /** The model a record belongs to. One model makes one category: the same name in another category is another model. */
  const modelFor = (rec: ModelRecord): PackModel => {
    const who = identityOf(rec)
    const existing = models.get(who.modelId)
    const id = existing && existing.category !== rec.category ? `${who.modelId}-${rec.category}` : who.modelId
    let model = models.get(id)
    if (!model) {
      model = { id, makerId: who.makerId, name: who.family ? who.name : displayName(who.name, who.makerId, who.modelId), ...(who.family ? { family: who.family } : {}), version: versionOf(who.name).join(".") || undefined, category: rec.category, tasks: [], tools: [], capabilities: [], ...(who.weights ? { weights: who.weights } : {}), status: rec.status, latest: true, lines: [] }
      models.set(id, model)
      if (!packMakers.has(who.makerId)) packMakers.set(who.makerId, { id: who.makerId, name: index.names.get(who.makerId) ?? who.makerId, ...(index.weights.get(who.makerId) ? { weights: index.weights.get(who.makerId) } : {}) })
    }
    return model
  }

  /** A line is added only when the provider lists parameters and a source states a price; otherwise the next candidate takes its place */
  const addLine = (rec: ModelRecord, serveId: string, role: PackLine["role"], tier?: string): boolean => {
    const provider = rec.provider as Provider
    const key = `${provider}|${rec.endpoint}|${serveId}`
    if (taken.has(key)) return false
    const who = identityOf(rec)
    if (Object.keys(rec.params.properties).length === 0) {
      gaps.push({ modelId: who.modelId, provider, field: "parameters", reason: `${rec.endpoint}: the provider lists no parameters` })
      return false
    }
    // A model that runs on the maker's own key is priced by the maker: its price is the maker's, found in the LiteLLM file by the model's name
    const byo = rec.description !== undefined && /pay .{0,40}directly|bring your own/i.test(rec.description)
    const lite = [...(who.declared?.litellm ?? []), `${provider}|${rec.endpoint}`, ...(byo ? [`openai|${rec.endpoint.split("/").pop()}`, `gemini|${rec.endpoint.split("/").pop()}`] : [])].map((k) => liteByKey.get(k)).find((v) => v !== undefined)
    const price = priceOf(rec, input.pagePrices?.get(`${provider}|${rec.endpoint}`), lite, now)
    if (!price) {
      // A model of the maker list without a readable price stops the build and is named: the reader is wrong, not the model
      gaps.push({ modelId: who.modelId, provider, field: "price", reason: `${who.modelId} on ${provider}: ${rec.endpoint} has no price published by the provider, its page or LiteLLM`, ...(who.declared ? { blocking: true } : {}) })
      return false
    }
    taken.add(key)
    modelFor(rec).lines.push({
      provider,
      endpoint: rec.endpoint,
      serves: serveId,
      rank: 0,
      role,
      price,
      parameters: rec.params,
      fields: fieldsOf(rec.params),
      ...(tier ? { tier } : {}),
      status: rec.status,
      seenBy: [provider],
      providerVersion: rec.providerVersion,
    })
    return true
  }

  /** The tasks and tools a record serves, from the provider's own grouping, its provider task and its endpoint's action */
  const servesOf = (rec: ModelRecord): string[] => {
    const tags = input.serveTags?.get(`${rec.provider}|${rec.endpoint}`)
    // The provider's own grouping decides; a model it files only under a making task (a collection of editors) may also serve the other
    // making tasks its own provider task fits. One it files only under tools (Whisper: transcription) makes nothing.
    // An edit model (picture or clip plus words) also makes from them: it serves the making tasks its provider task fits
    const tagsMake = tags?.some((t) => !toolIds.has(t) || t === "image-edit" || t === "video-edit")
    const out = new Set(entries.filter((e) => fitsServe(rec, e, toolIds.has(e.id), tags) || (tagsMake && !toolIds.has(e.id) && fitsServe(rec, e, false))).map((e) => e.id))
    if (!tags) for (const id of servesOfRecord(rec)) out.add(id)
    // A stem splitter that can give the vocals alone (a stem choice that includes them) also isolates the voice
    if (out.has("audio-stems") && Object.values(rec.params.properties).some((p) => p.enum?.some((v) => String(v).toLowerCase() === "vocals"))) out.add("audio-voice-isolation")
    return [...out]
  }

  // 2. The grid: for every task and tool on every provider, the most popular latest closed model and open model. A slot no real model
  // fills gets an alternative (a model that does it by being told to); a slot nothing fills is a gap, named with the provider and the reason.
  const cells = new Map<string, ModelRecord[]>()
  for (const p of PROVIDERS) {
    for (const rec of byProvider.get(p) ?? []) {
      if (rec.category === "text" && !rec.utility && !servesOfRecord(rec).length) continue
      for (const id of servesOf(rec)) cells.set(`${p}|${id}`, [...(cells.get(`${p}|${id}`) ?? []), rec])
    }
  }
  /** A model's family: its maker and its name before the version ("wan-2-2-t2v-fast" and "wan-2-1-t2v-480p" are both alibaba/wan); a name with no version is its own family */
  const family = (modelId: string) => {
    const [maker, name = ""] = modelId.split("/")
    const words = name.split("-")
    const at = words.findIndex((w) => /^v?\d/.test(w))
    return `${maker}/${at > 0 ? words.slice(0, at).join("-") : name}`
  }
  /** The version right after the family name: "wan-2-2-t2v-fast" is 2.2, "kling-video-v3" is 3 */
  const versionIn = (modelId: string): number[] => {
    const words = (modelId.split("/")[1] ?? "").split("-")
    const at = words.findIndex((w) => /^v?\d/.test(w))
    const out: number[] = []
    for (const w of at < 0 ? [] : words.slice(at)) {
      const m = /^v?(\d+)$/.exec(w)
      if (!m) break
      out.push(Number(m[1]))
    }
    return out
  }
  // Latest first: a model whose current version is over eighteen months old comes after every newer one
  const STALE = Date.parse(now) - 548 * 86_400_000
  const stale = (r: ModelRecord) => (r.updatedAt ? Date.parse(r.updatedAt) < STALE : false)
  /**
   * Most popular first. For a task (making something) the latest models of known makers lead: the maker list, the leaderboard, a known
   * maker, then how much the provider's users run it. For a tool the classic that everyone uses (Whisper, Real-ESRGAN) is the right one:
   * the maker list, then use, whoever made it and however old its last version.
   */
  const orderFor = (tool: boolean) => (a: ModelRecord, b: ModelRecord) => {
    const wa = identityOf(a)
    const wb = identityOf(b)
    if (!tool && stale(a) !== stale(b)) return stale(a) ? 1 : -1
    if (Boolean(wa.declared) !== Boolean(wb.declared)) return wa.declared ? -1 : 1
    const [ra, pa, ua] = popularityOf(a)
    const [rb, pb, ub] = popularityOf(b)
    if (ra !== rb) return ra - rb
    if (!tool && wa.knownMaker !== wb.knownMaker) return wa.knownMaker ? -1 : 1
    if (pa !== pb) return pa - pb
    return ub.localeCompare(ua)
  }
  const order = orderFor(false)
  /** Tools that make new content follow the latest-first rule of tasks; utility tools (upscale, stems, transcription ...) follow use */
  const MAKES_NEW = new Set(["video-edit", "video-extend", "video-lip-sync", "video-motion-transfer", "video-dub", "video-sound-effects", "video-music", "video-restyle", "video-relight", "image-edit", "image-restyle", "image-relight", "image-outpaint", "audio-voice-changer"])
  const byUse = (id: string) => toolIds.has(id) && !MAKES_NEW.has(id)
  // 2a. The families: for every category, each maker family's latest versions (up to four, newest first), on every provider that runs
  // them. One version is one model whatever a provider calls it; what an endpoint is for and its quality tier (standard, pro, 4k) are not
  // part of it. The family list is the maker list's own (makers.json `families`).
  const fams = familyIndex(makers)
  const taskIds = new Set(input.tasks.map((t) => t.id))
  const makesOf = (rec: ModelRecord): string[] => (rec.category === "text" ? ["chat"] : (rec.category as string) === "embedding" ? ["text-embedding"] : servesOf(rec).filter((id) => taskIds.has(id)))
  interface Found {
    v: ModelVersion
    rec: ModelRecord
    serves: string[]
  }
  const byVersion = new Map<string, Found[]>()
  for (const p of PROVIDERS) {
    for (const rec of byProvider.get(p) ?? []) {
      const serves = makesOf(rec)
      if (serves.length === 0) continue
      const v = readVersion(rec, index, fams, rec.category)
      if (!v) continue
      byVersion.set(versionKey(v), [...(byVersion.get(versionKey(v)) ?? []), { v, rec, serves }])
    }
  }
  // "Pro" written into a name is a quality tier when the same provider has a standard of that version (OpenRouter: kling-v3.0-pro, -std)
  for (const key of [...byVersion.keys()]) {
    // Read the list now: a move into this version may have happened since the loop began
    const rest = (byVersion.get(key) ?? []).filter((x) => {
      if (x.v.variant[x.v.variant.length - 1]?.toLowerCase() !== "pro") return true
      const base: ModelVersion = { ...x.v, variant: x.v.variant.slice(0, -1) }
      const siblings = byVersion.get(versionKey(base)) ?? []
      if (!siblings.some((y) => y.rec.provider === x.rec.provider && /^(std|standard)$/.test(y.v.tier ?? ""))) return true
      byVersion.set(versionKey(base), [...siblings, { ...x, v: { ...base, tier: "pro" } }])
      return false
    })
    if (rest.length === 0) byVersion.delete(key)
    else byVersion.set(key, rest)
  }
  const numOf = (key: string) => (key.split("|")[2] ?? "").replace(/^[A-Z]/, "").split(".").map(Number)
  const groups = new Map<string, string[]>()
  for (const key of byVersion.keys()) {
    const fam = key.split("|").slice(0, 2).join("|")
    groups.set(fam, [...(groups.get(fam) ?? []), key])
  }
  const kept = new Set<string>()
  for (const keys of groups.values()) {
    const fresh = keys.filter((k) => {
      const dates = byVersion.get(k)!.map((x) => x.rec.updatedAt).filter((d): d is string => Boolean(d))
      return dates.length === 0 || dates.some((d) => Date.parse(d) >= STALE)
    })
    // Newest version first; the plain version before its variants (Kling 3.0 before Kling 3.0 Turbo)
    fresh.sort((a, b) => cmpVersion(numOf(b), numOf(a)) || (a.split("|")[3] ? 1 : 0) - (b.split("|")[3] ? 1 : 0) || a.localeCompare(b))
    for (const k of fresh.slice(0, 4)) kept.add(k)
  }
  for (const key of kept) {
    const found = byVersion.get(key)!
    // The version as the maker writes it: with its letter ("H3") and its ".0" ("3.0") when any provider writes it so
    const forms = found.map((x) => x.v.version)
    let shown = forms.find((x) => /^[A-Z]/.test(x)) ?? forms.find((x) => x.includes(".")) ?? forms[0]!
    // A family that writes its versions with a decimal writes all of them so (Kling 3.0, so Kling 4.0)
    const fam = key.split("|").slice(0, 2).join("|")
    const familyDecimals = [...kept].some((k) => k.startsWith(`${fam}|`) && byVersion.get(k)!.some((x) => x.v.version.includes(".")))
    if (familyDecimals && /^\d+$/.test(shown)) shown = `${shown}.0`
    const v = { ...found[0]!.v, version: shown }
    const id = versionId(v)
    const name = versionName(v)
    const weights = found.map((x) => identityOf(x.rec).weights).find(Boolean)
    for (const x of found) {
      ident.set(x.rec, { ...identityOf(x.rec), makerId: v.makerId, knownMaker: true, modelId: id, name, family: v.family, ...(weights ? { weights } : {}) })
      for (const serve of x.serves) addLine(x.rec, serve, "model", x.v.tier)
    }
  }

  /** A tool (an upscaler, a relighter) keeps its top makers, and for each its newest models. The making categories (2a) keep their strict cut. */
  const TOOL_MAKERS = 5
  const TOOL_PER_MAKER = 5
  // 2b. The tools: for every tool on every provider, the top model (closed and open when both exist), else an alternative
  for (const entry of entries) {
    for (const provider of PROVIDERS) {
      const inGrid = GRID_PROVIDERS.includes(provider)
      // Making something is the families' work (2a): a provider whose list has no family model for it does not offer it
      if (!toolIds.has(entry.id)) {
        const served = [...models.values()].some((m) => m.lines.some((l) => l.provider === provider && l.serves === entry.id))
        if (inGrid && !served) gaps.push({ modelId: entry.id, provider, field: "grid", reason: `${entry.id} is not offered on ${provider}: no model of the maker list's families for it` })
        continue
      }
      const all = cells.get(`${provider}|${entry.id}`) ?? []
      // Latest only: an older version of the same family steps aside. Compared within one kind, so a newer closed version does not push
      // out the latest open one.
      const keyOf = (r: ModelRecord) => `${family(identityOf(r).modelId)}|${identityOf(r).weights ?? ""}`
      const best = new Map<string, number[]>()
      for (const r of all) {
        const v = versionIn(identityOf(r).modelId)
        if (!best.has(keyOf(r)) || cmpVersion(v, best.get(keyOf(r))!) > 0) best.set(keyOf(r), v)
      }
      const latest = all.filter((r) => cmpVersion(versionIn(identityOf(r).modelId), best.get(keyOf(r)) ?? []) === 0)
      const sorted = [...latest].sort(orderFor(byUse(entry.id)))
      // Only a verified maker's own models: the maker is on the maker list and the endpoint sits in the maker's own account (or the
      // provider's, for its own models). A community upload of a famous model is not the maker's, whatever it is called.
      const official = (r: ModelRecord): boolean => officialMakerOf(r, index) !== undefined
      // The top makers of this job, most popular first; for each, its newest models (five at most). Open or closed does not matter.
      const byMaker = new Map<string, ModelRecord[]>()
      for (const r of sorted.filter(official)) byMaker.set(identityOf(r).makerId, [...(byMaker.get(identityOf(r).makerId) ?? []), r])
      const newest = (x: ModelRecord, y: ModelRecord) => cmpVersion(versionIn(identityOf(y).modelId), versionIn(identityOf(x).modelId)) || (y.updatedAt ?? "").localeCompare(x.updatedAt ?? "")
      let added = 0
      // `sorted` is most popular first, so the makers come in that order
      for (const list of [...byMaker.values()].slice(0, TOOL_MAKERS)) for (const r of [...list].sort(newest).slice(0, TOOL_PER_MAKER)) if (addLine(r, entry.id, "model")) added++
      if (added > 0) continue
      // Nothing real: a model that does it by being told to (the tool card carries the sentence)
      // Only a job that can be said in a sentence (its card carries one for editors) is done this way
      if (toolById(entry.id)?.instruction !== undefined) {
        // The provider's models that edit by a sentence (its "edit by prompt" ones) do it when told to
        // and, for clips and sounds, every model whose capability is to change that kind of file by words (Seedance with a clip, GPT Audio)
        const byWords = records.filter((r) => r.provider === provider && r.category === entry.category && r.status !== "deprecated" && capabilityOfExact(r).does.includes("edit") && capabilityOfExact(r).takes.some((t) => t.kind === entry.category))
        const editors = [...new Set([...(cells.get(`${provider}|${entry.category}-edit`) ?? []), ...byWords])].sort(order)
        if (editors.some((r) => addLine(r, entry.id, "alternative"))) continue
      }
      // OpenAI and Gemini serve their own models only: an empty cell there is not a gap
      if (!inGrid) continue
      // A provider whose list has no model for it does not offer it (its whole list is read and checked). One whose models for it were all
      // left out (no parameters or no price) means a reader is wrong: the build stops.
      gaps.push(
        all.length === 0
          ? { modelId: entry.id, provider, field: "grid", reason: `${entry.id} is not offered on ${provider}: its list has no model for it` }
          : !all.some(official)
            ? { modelId: entry.id, provider, field: "grid", reason: `${entry.id} on ${provider}: its ${all.length} model(s) for it are community uploads, none from a verified maker` }
            : { modelId: entry.id, provider, field: "grid", reason: `${entry.id} on ${provider}: ${all.length} model(s) for it, none with parameters and a price`, blocking: true },
      )
    }
  }

  // 3. Ranks: for each task or tool on each provider, the most popular first
  const finished = [...models.values()].filter((m) => m.lines.length > 0)
  const recordOf = new Map(records.map((r) => [`${r.provider}|${r.endpoint}`, r]))
  for (const entry of entries) {
    for (const provider of PROVIDERS) {
      const lines = finished.flatMap((m) => m.lines.filter((l) => l.provider === provider && l.serves === entry.id))
      lines.sort((a, b) => (a.role === "alternative" ? 1 : 0) - (b.role === "alternative" ? 1 : 0) || orderFor(byUse(entry.id))(recordOf.get(`${provider}|${a.endpoint}`)!, recordOf.get(`${provider}|${b.endpoint}`)!))
      lines.forEach((l, i) => (l.rank = i + 1))
    }
  }
  // Each fact once: a model's tasks, tools and capabilities are read from its lines
  for (const m of finished) {
    const served = [...new Set(m.lines.map((l) => l.serves))]
    m.tasks = served.filter((id) => !toolIds.has(id))
    m.tools = served.filter((id) => toolIds.has(id))
    m.capabilities = capabilitiesOf(m.lines.map((l) => l.parameters))
  }
  const total = makers.makers.reduce((n, mk) => n + mk.models.length, 0)

  return {
    schemaVersion: PACK_SCHEMA_VERSION,
    generatedAt: now,
    makers: [...packMakers.values()],
    tasks: input.tasks,
    tools: input.tools,
    models: finished,
    sources: input.sources ?? [],
    gaps,
    completeness: [{ scope: "maker-list models with at least one line", total, filled: makers.makers.reduce((n, mk) => n + mk.models.filter((m) => finished.some((f) => f.id === m.id.split("/").slice(0, 2).join("/"))).length, 0), score: 0 }].map((c) => ({ ...c, score: c.total ? Math.round((c.filled / c.total) * 1000) / 1000 : 0 })),
  }

  function matchIn(pool: ModelRecord[], m: MakerModel, makerName: string): ModelRecord | undefined {
    const wantAction = m.action
    const scored = pool
      .filter((r) => fits(m.task, r))
      .filter((r) => {
        if (wantAction === "generate") return true
        const seen = actionOf(r.endpoint, m.task as ProviderTask).action
        return seen === wantAction
      })
      .map((r) => ({ r, s: matchScore(m.name, r, makerName) }))
      .filter((x) => x.s >= 0.5)
      .sort((a, b) => b.s - a.s)
    return scored[0]?.r
  }
}

/** A sound-effects model, by its own name (AudioGen, TangoFlux and Tango are sound-effect models; Mustango is music) */
const SFX_NAME = /sound-?effects?|sfx|foley|audiogen|tangoflux|(^|\/)tango(-|$)/i
/** The provider's own description says the model makes sounds, not only music ("music and sound") */
const MAKES_SOUNDS = /\bsound effects?\b|\bmusic and sounds?\b|\bsounds? and music\b|\bsfx\b/i

/** A record serves a task or tool when its provider task fits, and for a tool the endpoint's own name says the same action */
function fitsServe(rec: ModelRecord, entry: PackTask, isTool: boolean, tags?: string[]): boolean {
  // Making from words alone: a model that must be given a picture or a clip cannot do it, whatever group the provider files it in
  if (!isTool && /^text-to-|^audio-text-to-/.test(entry.id) && (Object.entries(rec.params.properties).some(([k, p]) => p.slot && (rec.params.required ?? []).includes(k)) || /(^|[-/_])i2v([-/_]|$)|image-to-video/.test(rec.endpoint))) return false
  // The provider's own grouping, where it gives one, decides
  if (tags) return tags.includes(entry.id)
  // A tool: what the endpoint says it does decides, when it takes a file to work on (a motion-control model filed as image-to-video is still motion transfer)
  if (isTool && ACTION_OF_TOOL[entry.id.replace(/^(video|image|audio)-/, "")] && rec.inputs.some((k) => k !== "text") && actionOf(rec.endpoint, entry.providerTask as ProviderTask).action === ACTION_OF_TOOL[entry.id.replace(/^(video|image|audio)-/, "")] && (rec.category === entry.category || rec.task === entry.providerTask)) return true
  if (!fits(entry.providerTask, rec)) return false
  // Music and sound effects share a provider task; the model's own name tells them apart
  if (entry.id === "audio-text-to-music") return !rec.utility && /music|song|lyria|melody|compose/i.test(rec.endpoint) && !SFX_NAME.test(rec.endpoint)
  if (entry.id === "audio-text-to-sfx") return !rec.utility && (SFX_NAME.test(rec.endpoint) || MAKES_SOUNDS.test(rec.description ?? ""))
  if (!isTool) return !rec.utility
  const seen = actionOf(rec.endpoint, entry.providerTask as ProviderTask).action
  const tail = entry.id.replace(/^(video|image|audio)-/, "")
  return ACTION_OF_TOOL[tail] !== undefined && seen === ACTION_OF_TOOL[tail]
}

/** The action an endpoint's name must say for each tool (the tool id without its category) */
const ACTION_OF_TOOL: Record<string, string> = {
  "remove-background": "remove-background", upscale: "upscale", "slow-motion": "interpolate", denoise: "restore", restore: "restore", relight: "relight", restyle: "restyle",
  reframe: "reframe", "remove-object": "remove-object", outpaint: "fill", colorize: "colorize", "lip-sync": "lip-sync", "motion-transfer": "motion-transfer",
  extend: "extend", edit: "edit", dub: "dub", "voice-isolation": "isolate-voice", "noise-reduction": "noise-reduction", stems: "separate-audio", "voice-changer": "voice-change",
}

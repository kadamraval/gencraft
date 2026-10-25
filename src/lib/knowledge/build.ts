import { computeDefaultEnabled } from "../registry/enabled"
import { rolesOf } from "../registry/roles"
import { taskOf } from "../registry/tasks"
import { matchScore } from "../registry/shortlist"
import { jobOf } from "../sheet/jobs"
import type { Category, Fact, MakerList, MakerModel, PriceValue } from "../sheet/types"
import type { ModelPrice, ModelRecord, PriceUnit } from "../registry/types"
import { ALTERNATIVE_JOBS, jobIdFor } from "./job-map"
import { PACK_SCHEMA_VERSION } from "./schema"
import type { KnowledgePack, PackGap, PackJob, PackLine, PackMaker, PackModel, PackPrice, PackSource, Provider } from "./schema"

/**
 * Builds the standard database from the maker list and what the sources said. Nothing is guessed: a line is published only when its
 * endpoint, settings and price each came from a source; everything else goes to `gaps` with the reason.
 *
 * Order for a fact: the provider's standard list and API (the records), the LiteLLM file, the page scraper (`pagePrices`). A price that
 * was only an estimate is not a price.
 */

/** What a fal endpoint's own name says it does to a file. Anything else is a model that makes things. */
const TOOL_JOBS = new Set(["remove-background", "upscale", "interpolate", "relight", "restyle", "reframe", "remove-object", "fill", "colorize", "restore", "lip-sync", "motion-transfer", "extend", "isolate-voice", "noise-reduction", "separate-audio", "voice-change", "dub", "transcribe"])

/** A model that changes a file (upscale, remove a background ...) rather than making something from a prompt: read from the endpoint's own name, never from a list */
export function isToolEndpoint(rec: Pick<ModelRecord, "provider" | "endpoint" | "task">): boolean {
  return rec.provider === "fal" && TOOL_JOBS.has(jobOf(rec.endpoint, rec.task as Category | undefined).job)
}

/** The jobs a model that makes things does, from its own task and what it takes in: the jobs of Create */
export function createJobsOf(rec: ModelRecord): string[] {
  const task = taskOf(rec)
  const out: string[] = []
  if (task === "text-to-image") out.push("text-to-image")
  if (task === "image-edit") out.push("image-edit")
  if (task === "text-to-video") out.push("text-to-video")
  if (task === "image-to-video" || takesPicture(rec)) out.push("image-to-video")
  if (task === "reference-to-video") out.push("reference-to-video")
  if (task === "speech") out.push("audio-text-to-speech")
  // fal files turn detection and forced alignment under speech-to-text too; only a model that says it transcribes is a transcriber
  if (task === "transcription" && !/align|turn|diariz|vad/i.test(rec.endpoint) && (/whisper|wizper|scribe|transcri|speech-to-text|asr|stt|parakeet|canary|voxtral|chirp|nova/i.test(rec.endpoint) || /transcri/i.test(rec.description ?? ""))) out.push("audio-transcribe")
  if (task === "audio-from-video") out.push(/music|score|soundtrack/i.test(rec.endpoint) ? "video-music" : "video-sound-effects")
  if (task === "video-from-audio") out.push("video-lip-sync")
  if (task === "audio-generation") out.push(/sound-?effects?|sfx|foley/i.test(rec.endpoint) ? "audio-text-to-sfx" : "audio-text-to-music")
  return [...new Set(out)]
}

export const PROVIDERS: Provider[] = ["fal", "replicate", "openrouter", "openai", "gemini"]

export interface BuildInput {
  makers: MakerList
  jobs: PackJob[]
  /** What each provider's own list says, as registry records */
  records: ModelRecord[]
  /** Prices read from model pages, keyed `provider|endpoint` */
  pagePrices?: Map<string, ModelPrice>
  /** LiteLLM facts (price, via the file's key) */
  litellm?: Fact[]
  /** Where the sources were read, for the Sources sheet */
  sources?: PackSource[]
  now: string
  /** Hand-declared endpoints for each tool job (any provider). They are checked against the provider lists: one that exists nowhere is a gap. */
  toolEndpoints?: Record<string, string[]>
  /** Job ids a provider's own grouping gives a model (Replicate collections), keyed `provider|endpoint` */
  jobTags?: Map<string, string[]>
  /** Lines wanted for each job on each provider: the first choice and its backups. Default 4. */
  want?: number
}

/** Hosts file reference-to-video under image-to-video or video-to-video; a tool category stands for its own task */
const TASK_CATEGORY: Record<string, Category[]> = {
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
const takesPicture = (rec: ModelRecord) => rec.modality === "video" && rec.inputs.includes("image") && rec.task !== "video-to-video"

// OpenRouter files a picture model that takes a text prompt and optionally a picture under one task; it does both text-to-image and edit
const makesFromText = (rec: ModelRecord) => rec.provider === "openrouter" && rec.modality === "image" && rec.inputs.includes("text")

const fits = (category: string, rec: ModelRecord): boolean => (category === "text-to-image" && makesFromText(rec)) || (TASK_CATEGORY[taskOf(rec)] ?? []).includes(category as Category) || (category === "image-to-video" && takesPicture(rec)) || (rec.modality === "audio" && category === "speech-to-text" && rec.task === "speech-to-text")

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

/** The words of a name that identify its family ("Seedance 2.5" is "seedance", "Nano Banana 2.1" is "nano banana") */
const wordsOf = (name: string) => familyOfName(name).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1)
const familyOfName = (s: string) => s.replace(/\s*v?\d+(?:\.\d+)*.*$/i, "").trim() || s

/** The version that follows a family's words in a text: "bytedance/seedance-2.5/text-to-video" gives 2.5, "kling-video/v3/pro" gives 3 */
function versionAfter(text: string, words: string[]): number[] | undefined {
  const t = text.toLowerCase()
  let at = -1
  for (const w of words) {
    const i = t.indexOf(w)
    if (i < 0) return undefined
    at = Math.max(at, i + w.length)
  }
  const m = /^[\s\-_/.]{0,14}(?:v|ver|version)?[\s\-_]*(\d+(?:\.\d+)*)/.exec(t.slice(at))
  return m ? m[1]!.split(".").map(Number) : undefined
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "")
const versionOf = (s: string): number[] => (s.match(/\d+(?:\.\d+)*/g) ?? []).flatMap((x) => x.split(".").map(Number))
const familyOf = (s: string) => s.replace(/\s*v?\d+(?:\.\d+)*\s*$/i, "").trim() || s
const cmpVersion = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  return 0
}

export function buildPack(input: BuildInput): KnowledgePack {
  const { makers, jobs, records, now } = input
  const want = input.want ?? 4
  const jobById = new Map(jobs.map((j) => [j.id, j]))
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

  const packMakers = new Map<string, PackMaker>()
  const models = new Map<string, PackModel>()
  const taken = new Set<string>() // provider|endpoint|job already used by a line

  const addLine = (model: PackModel, rec: ModelRecord, jobId: string, role: PackLine["role"], liteKeys: string[] = []) => {
    const provider = rec.provider as Provider
    const key = `${provider}|${rec.endpoint}|${jobId}`
    if (taken.has(key)) return false
    // A model that runs on the maker's own key is priced by the maker: its price is the maker's, found in the LiteLLM file by the model's name
    const byo = rec.description !== undefined && /pay .{0,40}directly|bring your own/i.test(rec.description)
    const lite = [...liteKeys, `${provider}|${rec.endpoint}`, ...(byo ? [`openai|${rec.endpoint.split("/").pop()}`, `gemini|${rec.endpoint.split("/").pop()}`] : [])].map((k) => liteByKey.get(k)).find((v) => v !== undefined)
    const price = priceOf(rec, input.pagePrices?.get(`${provider}|${rec.endpoint}`), lite, now)
    const where = `${model.id} on ${provider}`
    if (Object.keys(rec.params.properties).length === 0) {
      gaps.push({ modelId: model.id, provider, field: "settings", reason: `${rec.endpoint}: the provider lists no settings` })
      return false
    }
    // A model is in the database only with a price that a source states. One without (billed by compute time, billed to the maker's own
    // account, or simply unpublished) is left out and named, and the next model for the job takes its place.
    if (!price) {
      // A top model (the makers' own list or an auto-chosen popular one) without a readable price stops the build and is named: the reader is
      // wrong, not the model. A backup or alternative without one is simply skipped.
      gaps.push({ modelId: model.id, provider, field: "price", reason: `${where}: ${rec.endpoint} has no price published by the provider, its page or LiteLLM`, ...(role === "model" ? { blocking: true } : {}) })
      return false
    }
    taken.add(key)
    model.lines.push({
      provider,
      endpoint: rec.endpoint,
      jobId,
      rank: 0,
      role,
      price,
      params: rec.params,
      status: rec.status,
      seenBy: [provider],
      providerVersion: rec.providerVersion,
    })
    return true
  }

  const modelFor = (rec: ModelRecord, job: PackJob): { model: PackModel; fresh: boolean } => {
    const makerId = slug(rec.maker ?? rec.family ?? rec.provider)
    const id = `${makerId}/${slug(rec.name)}`
    const found = models.get(id)
    if (found) {
      if (!found.jobs.includes(job.id)) found.jobs.push(job.id)
      return { model: found, fresh: false }
    }
    return { model: { id, makerId, name: rec.name, version: rec.version?.join("."), type: rec.modality, category: job.category, jobs: [job.id], status: rec.status, latest: true, lines: [] }, fresh: true }
  }
  const commit = (model: PackModel, rec: ModelRecord, fresh: boolean) => {
    if (!fresh) return
    models.set(model.id, model)
    if (!packMakers.has(model.makerId)) packMakers.set(model.makerId, { id: model.makerId, name: rec.maker ?? rec.family ?? rec.provider })
  }
  function addToolLine(rec: ModelRecord, job: PackJob) {
    const { model, fresh } = modelFor(rec, job)
    if (addLine(model, rec, job.id, "model")) commit(model, rec, fresh)
  }

  // 1. The maker list: each declared model on every provider that runs it
  const familyBest = new Map<string, number[]>()
  for (const mk of makers.makers) {
    for (const m of mk.models) {
      const fam = `${mk.id}/${slug(familyOf(m.name))}|${m.type}`
      const v = versionOf(m.name)
      if (!familyBest.has(fam) || cmpVersion(v, familyBest.get(fam)!) > 0) familyBest.set(fam, v)
    }
  }
  for (const mk of makers.makers) {
    packMakers.set(mk.id, { id: mk.id, name: mk.name })
    for (const m of mk.models) {
      const jobId = jobIdFor(m.type, m.category, m.job)
      if (!jobId || !jobById.has(jobId)) {
        gaps.push({ modelId: m.id, provider: "-", field: "job", reason: `no job for ${m.type}|${m.category}|${m.job}` })
        continue
      }
      const id = m.id.split("/").slice(0, 2).join("/")
      let model = models.get(id)
      if (!model) {
        const fam = `${mk.id}/${slug(familyOf(m.name))}|${m.type}`
        model = { id, makerId: mk.id, name: m.name, version: versionOf(m.name).join(".") || undefined, type: m.type, category: m.category, jobs: [], status: "active", latest: cmpVersion(versionOf(m.name), familyBest.get(fam) ?? []) === 0, lines: [] }
        models.set(id, model)
      }
      if (!model.jobs.includes(jobId)) model.jobs.push(jobId)
      for (const p of PROVIDERS) {
        const pool = byProvider.get(p) ?? []
        const declared = m.hosts[p] ?? []
        let rec = pool.find((r) => declared.includes(r.endpoint))
        if (!rec) rec = matchIn(pool, m, mk.name)
        if (rec) addLine(model, rec, jobId, "model", m.litellm)
        else gaps.push({ modelId: m.id, provider: p, field: "endpoint", reason: `${p} lists no ${m.name} for ${jobId}` })
      }
    }
  }

  // 1b. Tool jobs: the declared endpoints, each found on whichever provider lists it
  for (const [jobId, endpoints] of Object.entries(input.toolEndpoints ?? {})) {
    const job = jobById.get(jobId)
    if (!job) {
      gaps.push({ modelId: jobId, provider: "-", field: "job", reason: `declared tool endpoints for unknown job ${jobId}` })
      continue
    }
    for (const endpoint of endpoints) {
      const hits = records.filter((r) => r.endpoint === endpoint && PROVIDERS.includes(r.provider as Provider))
      if (hits.length === 0) {
        gaps.push({ modelId: jobId, provider: "-", field: "endpoint", reason: `${endpoint} is declared for ${jobId} but no provider lists it` })
        continue
      }
      for (const rec of hits) addToolLine(rec, job)
    }
  }

  // 1b2. Newer versions: for each family the maker list names, a provider's own list may already hold a higher version (same family words, same
  // kind of work). It is added as a top model, the older one stops being "latest", and the find is written to the report.
  const newVersions: NonNullable<KnowledgePack["newVersions"]> = []
  for (const mk of makers.makers) {
    for (const m of mk.models) {
      const words = wordsOf(m.name)
      const declaredVersion = versionOf(m.name)
      const jobId = jobIdFor(m.type, m.category, m.job)
      const job = jobId ? jobById.get(jobId) : undefined
      if (words.length === 0 || declaredVersion.length === 0 || !job) continue
      // "O3" and "C1" are lines of their own (a letter then a digit), not a version of the family before them
      if (/\b[a-uw-z]\d+(?:\.\d+)*$/i.test(m.name.trim())) continue
      const ownOwners = new Set(mk.models.flatMap((x) => (x.hosts.replicate ?? []).map((e) => e.split("/")[0]!)))
      for (const provider of PROVIDERS) {
        let best: { rec: ModelRecord; version: number[] } | undefined
        for (const rec of byProvider.get(provider) ?? []) {
          if (rec.modality !== m.type || rec.utility || !fits(m.category, rec)) continue
          if (m.job !== "generate" && jobOf(rec.endpoint, m.category as Category).job !== m.job) continue
          const v = versionAfter(`${rec.name} ${rec.endpoint}`, words)
          if (!v || cmpVersion(v, declaredVersion) <= 0) continue
          // A number far above the declared one is a date, a step count or a size ("2512", "3000 steps", "20b"), not the next version
          if (v[0]! > declaredVersion[0]! * 3 + 2 || v[0]! >= 100) continue
          // Replicate lists anyone's models: only the maker's own account counts (an owner the maker list already uses, or one named like the family)
          if (provider === "replicate") {
            const owner = rec.endpoint.split("/")[0]!.toLowerCase()
            if (!ownOwners.has(owner) && !words.some((w) => owner.includes(w))) continue
          }
          if (!best || cmpVersion(v, best.version) > 0) best = { rec, version: v }
        }
        if (!best) continue
        const { model, fresh } = modelFor(best.rec, job)
        if (addLine(model, best.rec, jobId!, "model")) {
          commit(model, best.rec, fresh)
          newVersions.push({ declared: m.name, found: best.rec.name, provider, endpoint: best.rec.endpoint })
          const older = models.get(m.id.split("/").slice(0, 2).join("/"))
          if (older) older.latest = false
        }
      }
    }
  }

  // 1c. Popular and latest: every provider's own leaders (the arena leaderboards) and the newest releases of the leading makers, for every
  // job they do. They are "model" lines like the makers' own list: no cap, and a missing price stops the build.
  for (const provider of PROVIDERS) {
    const pool = (byProvider.get(provider) ?? []).filter((r) => r.modality !== "text" && !r.utility)
    const byId = new Map(pool.map((r) => [r.id, r]))
    for (const id of computeDefaultEnabled(pool)) {
      const rec = byId.get(id)
      if (!rec) continue
      for (const jobId of createJobsOf(rec)) {
        const job = jobById.get(jobId)
        if (!job) continue
        const { model, fresh } = modelFor(rec, job)
        if (addLine(model, rec, jobId, "model")) commit(model, rec, fresh)
      }
    }
  }

  // 1d. Jobs no leaderboard ranks (transcription, sound for a video, a talking video from a voice): the provider's newest models for each, up to
  // eight, as "model" lines
  for (const provider of PROVIDERS) {
    const pool = (byProvider.get(provider) ?? [])
      .filter((r) => !r.utility && ["transcription", "audio-from-video", "video-from-audio"].includes(taskOf(r)))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || Number(b.featured ?? 0) - Number(a.featured ?? 0))
    const taken8 = new Map<string, number>()
    for (const rec of pool) {
      for (const jobId of createJobsOf(rec)) {
        if ((taken8.get(jobId) ?? 0) >= 8) continue
        const job = jobById.get(jobId)
        if (!job) continue
        const { model, fresh } = modelFor(rec, job)
        if (addLine(model, rec, jobId, "model")) {
          taken8.set(jobId, (taken8.get(jobId) ?? 0) + 1)
          commit(model, rec, fresh)
        }
      }
    }
  }

  // 2. Backups: where a job has fewer than `want` lines on a provider, the provider's own newest complete models for it fill the rest
  // Every job of the in-scope list, on every provider: a provider with no model of the maker's still gets its own best ones for the job
  const jobsUsed = new Set<string>()
  for (const j of jobs) for (const p of PROVIDERS) jobsUsed.add(`${p}|${j.id}`)
  for (const key of jobsUsed) {
    const [provider, jobId] = key.split("|") as [Provider, string]
    const job = jobById.get(jobId)!
    const have = [...models.values()].reduce((n, mo) => n + mo.lines.filter((l) => l.provider === provider && l.jobId === jobId).length, 0)
    if (have >= want) continue
    const pool = (byProvider.get(provider) ?? [])
      .filter((r) => fitsJob(r, job, input.jobTags?.get(`${provider}|${r.endpoint}`)))
      .filter((r) => !taken.has(`${provider}|${r.endpoint}|${jobId}`))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || Number(b.featured ?? 0) - Number(a.featured ?? 0))
    let added = have
    for (const rec of pool) {
      if (added >= want) break
      const { model, fresh } = modelFor(rec, job)
      if (addLine(model, rec, jobId, "substitute")) {
        added++
        commit(model, rec, fresh)
      }
    }
    if (added < want) gaps.push({ modelId: jobId, provider, field: "backups", reason: `${provider} has ${added} complete model(s) for ${jobId}, ${want} wanted` })
  }

  // 2b. Alternatives: where a provider still has fewer than `want` models for a job a picture model can do by being told to, the provider's own
  // picture models that take a picture and follow instructions fill the rest (the AI tool carries the instruction)
  for (const jobId of ALTERNATIVE_JOBS) {
    const job = jobById.get(jobId)
    if (!job) continue
    for (const provider of PROVIDERS) {
      const have = [...models.values()].reduce((n, mo) => n + mo.lines.filter((l) => l.provider === provider && l.jobId === jobId).length, 0)
      if (have >= want) continue
      const pool = (byProvider.get(provider) ?? [])
        .filter((r) => r.modality === "image" && !r.utility && rolesOf(r).includes("image-edit") && !taken.has(`${provider}|${r.endpoint}|${jobId}`))
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || Number(b.featured ?? 0) - Number(a.featured ?? 0))
      let added = have
      for (const rec of pool) {
        if (added >= want) break
        const { model, fresh } = modelFor(rec, job)
        if (addLine(model, rec, jobId, "alternative")) {
          added++
          commit(model, rec, fresh)
        }
      }
    }
  }

  // 3. Ranks: for each job on each provider, the maker-list models first (in list order), then the backups newest first, then the alternatives
  const order = [...models.values()]
  for (const key of jobsUsed) {
    const [provider, jobId] = key.split("|")
    let rank = 1
    for (const role of ["model", "substitute", "alternative"] as const) {
      for (const model of order) for (const l of model.lines) if (l.provider === provider && l.jobId === jobId && l.role === role) l.rank = rank++
    }
  }
  const finished = order.filter((m) => m.lines.length > 0)
  const total = makers.makers.reduce((n, mk) => n + mk.models.length, 0)

  return {
    schemaVersion: PACK_SCHEMA_VERSION,
    generatedAt: now,
    makers: [...packMakers.values()],
    jobs,
    models: finished,
    sources: input.sources ?? [],
    gaps,
    newVersions,
    completeness: [{ scope: "in-scope models with at least one complete line", total, filled: makers.makers.reduce((n, mk) => n + mk.models.filter((m) => finished.some((f) => f.id === m.id.split("/").slice(0, 2).join("/"))).length, 0), score: 0 }].map((c) => ({ ...c, score: c.total ? Math.round((c.filled / c.total) * 1000) / 1000 : 0 })),
  }

  function matchIn(pool: ModelRecord[], m: MakerModel, makerName: string): ModelRecord | undefined {
    const wantJob = m.job
    const scored = pool
      .filter((r) => fits(m.category, r))
      .filter((r) => {
        if (wantJob === "generate") return true
        const seen = jobOf(r.endpoint, m.category as Category).job
        return seen === wantJob
      })
      .map((r) => ({ r, s: matchScore(m.name, r, makerName) }))
      .filter((x) => x.s >= 0.5)
      .sort((a, b) => b.s - a.s)
    return scored[0]?.r
  }
}

/** A record serves a job when its task fits the job's category, and for a tool job the endpoint's own name says the same job */
function fitsJob(rec: ModelRecord, job: PackJob, tags?: string[]): boolean {
  // The provider's own grouping, where it gives one, decides
  if (tags) return tags.includes(job.id)
  if (!fits(job.category, rec)) return false
  // Music and sound effects share a category; the model's own name tells them apart
  if (job.id === "audio-text-to-music") return !rec.utility && /music|song|lyria|melody|compose/i.test(rec.endpoint) && !/sound-?effects?|sfx|foley/i.test(rec.endpoint)
  if (job.id === "audio-text-to-sfx") return !rec.utility && /sound-?effects?|sfx|foley/i.test(rec.endpoint)
  if (job.kind === "create") return !rec.utility
  const seen = jobOf(rec.endpoint, job.category as Category).job
  const WANT: Record<string, string> = {
    "remove-background": "remove-background", upscale: "upscale", "slow-motion": "interpolate", denoise: "restore", restore: "restore", relight: "relight", restyle: "restyle",
    reframe: "reframe", "remove-object": "remove-object", outpaint: "fill", colorize: "colorize", "lip-sync": "lip-sync", "motion-transfer": "motion-transfer",
    extend: "extend", edit: "edit", dub: "dub", "voice-isolation": "isolate-voice", "noise-reduction": "noise-reduction", stems: "separate-audio", "voice-changer": "voice-change",
  }
  const tail = job.id.replace(/^(video|image|audio)-/, "")
  return WANT[tail] !== undefined && seen === WANT[tail]
}

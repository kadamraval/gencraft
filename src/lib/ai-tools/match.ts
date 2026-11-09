import { capabilityOfExact, verbOfJob } from "@/lib/capability"
import { modelsFor, type Given, type Want } from "@/lib/capability/match"
import { rankBest } from "@/lib/registry/ranking"
import { MAX_PER_MAKER, topMakerOf } from "@/lib/registry/top-makers"
import { DEVICE_PROVIDER, DEVICE_STEMS } from "@/lib/device/stems"

/** Models that run on this computer */
const DEVICE_MODELS: ModelRecord[] = [DEVICE_STEMS]
import type { EditAction } from "@/lib/registry/edit-actions"
import type { ModelRecord, AppCategory } from "@/lib/registry/types"
import { CATALOG } from "./catalog"
import type { MediaKind, Surface, ToolSpec, ToolStatus } from "./types"

/**
 * Which tools can this media use right now. A tool is offered with a working button only when something can really run it: a model the
 * person has a key for, or a routine that needs none. Otherwise the tool is listed with the reason, so nobody clicks a button that does
 * nothing. Pure: the app passes in what it knows, so the rules are tested without any provider.
 */

export interface MatchContext {
  /** Every model record the app knows, utility models included */
  records: ModelRecord[]
  /** The audio models the person switched on (for text to speech, music and sound effects) */
  listed: ModelRecord[]
  /** Providers the person has a key for */
  keyed: ReadonlySet<string>
  /** Whether the app can run a provider's models of a kind */
  runnable: (provider: string, category: AppCategory) => boolean
  /** The edit actions of the person's switched-on video models (Extend, Lip-sync, Motion transfer, Edit) */
  editActions?: EditAction[]
  /** Bookmarked models come first */
  bookmarks?: ReadonlySet<string>
}

export interface ToolOffer {
  spec: ToolSpec
  status: ToolStatus
  /** The models that can do it, the preferred first */
  candidates: ModelRecord[]
  /** Other models that take the right kind of file but did not say they do this job: shown under Show all */
  more: ModelRecord[]
}


/** Whether a model takes a file of this kind: a settings field marked as one, or the kind in its inputs */
function takesFile(r: ModelRecord, group: MediaKind): boolean {
  return Object.values(r.params.properties).some((p) => p.format === group) || r.inputs.includes(group)
}

/**
 * What a job asks of a model, in the one shape every screen uses: what it gives, the file it works on (and any second file it needs),
 * the job itself, and whether a model that edits by words can do it (the job has an instruction or is said in words).
 */
export function wantOf(spec: ToolSpec): Want | undefined {
  if (spec.kind !== "model") return undefined
  const verb = verbOfJob(spec.id)
  if (!verb) return undefined
  // Voice, music and sound effects are made from words: no file goes in
  const makesFromWords = verb === "speech" || verb === "music" || verb === "sfx"
  const given: Given[] = makesFromWords ? [] : [{ kind: spec.group, role: "source" }, ...(spec.needs ?? []).filter((n) => n.required).map((n) => ({ kind: n.kind, ...(n.role ? { role: n.role } : {}) }))]
  // Sound for a clip may come back as the clip with sound or as the sound alone
  const gives: Want["gives"] = verb === "sound-for-video" || verb === "music-for-video" ? ["video", "audio"] : spec.output
  return { gives, given, does: verb, viaEdit: spec.instruction !== undefined }
}

// The pool is the same for every tool while the lists are the same: built once, so what each model can do is worked out once too
const pools = new WeakMap<ModelRecord[], WeakMap<ModelRecord[], ModelRecord[]>>()
function poolOf(ctx: MatchContext): ModelRecord[] {
  let byListed = pools.get(ctx.records)
  if (!byListed) pools.set(ctx.records, (byListed = new WeakMap()))
  const hit = byListed.get(ctx.listed)
  if (hit) return hit
  const have = new Set(ctx.records.map((r) => r.id))
  const pool = [...ctx.records, ...ctx.listed.filter((l) => !have.has(l.id)), ...DEVICE_MODELS]
  byListed.set(ctx.listed, pool)
  return pool
}

export function statusOf(spec: ToolSpec, ctx: MatchContext): { status: ToolStatus; candidates: ModelRecord[]; more: ModelRecord[] } {
  if (spec.kind === "cut" || spec.kind === "local") return { status: { state: "ready" }, candidates: [], more: [] }

  // Models that run on this computer need no key and are offered by the same rule (the stem splitter)
  const pool = poolOf(ctx)
  const keyed: ReadonlySet<string> = new Set([...ctx.keyed, DEVICE_PROVIDER])
  const runnable = (provider: string, category: AppCategory) => provider === DEVICE_PROVIDER || ctx.runnable(provider, category)
  const usable = (r: ModelRecord) => r.status !== "deprecated" && keyed.has(r.provider) && runnable(r.provider, r.category)
  const want = wantOf(spec)
  const opts = { keyed, runnable, bookmarks: ctx.bookmarks }
  // The one rule: every model whose capability fits, on the providers the person has a key for
  let candidates = want ? modelsFor(want, pool, opts) : []
  // The top makers only, at most five models of each, best first
  const perMaker = new Map<string, number>()
  candidates = candidates.filter((c) => {
    const maker = topMakerOf(c)
    if (!maker) return false
    const n = (perMaker.get(maker) ?? 0) + 1
    perMaker.set(maker, n)
    return n <= MAX_PER_MAKER
  })
  const taken = new Set(candidates.map((c) => c.id))
  const more = want && want.given && want.given.length > 0 ? pool.filter((r) => !taken.has(r.id) && usable(r) && r.category === spec.output && takesFile(r, spec.group)) : []
  if (candidates.length > 0) return { status: { state: "ready" }, candidates, more }
  // Without a key nothing can run; with keys, the models the person has cannot do this job yet
  const anyKeyedRunnable = [...ctx.keyed].some((p) => ctx.runnable(p, spec.output))
  const noKey = ctx.keyed.size === 0 || !anyKeyedRunnable
  const missing = noKey ? ("key" as const) : ("model" as const)
  const reason = noKey ? "Add a key in Settings, Providers to use this." : "None of your models does this yet."
  return { status: { state: "needs-model", reason, missing }, candidates: [], more }
}

/**
 * The models a job offers: those made for it first (an upscaler for Upscale), then the top closed general editors the database lists for
 * the job's candidates (they follow words, so they can do it too), at most two. A job nothing is made for lists the editors that can follow words.
 */
export function modelsForJob(spec: ToolSpec, ctx: MatchContext): ModelRecord[] {
  const all = statusOf(spec, ctx).candidates
  const verb = verbOfJob(spec.id)
  const made = verb ? all.filter((r) => capabilityOfExact(r).dedicated.includes(verb)) : []
  if (made.length === 0) return rankBest(all, spec.id)
  // The general editors come in the capability rule's own order (best first): the first two whose weights are closed
  const editors = all.filter((r) => !made.includes(r) && r.weights === "closed").slice(0, 2)
  return [...rankBest(made, spec.id), ...editors]
}

/** The tools for a piece of media in one place, in the catalog's order. Story/Edit offers no picture tools. */
export function toolsFor(input: { kind: MediaKind; surface: Surface }, ctx: MatchContext, specs: ToolSpec[] = CATALOG): ToolOffer[] {
  return specs
    .filter((s) => s.kind !== "cut" && s.group === input.kind && !(input.surface === "edit" && s.group === "image"))
    .map((spec) => ({ spec, ...statusOf(spec, ctx) }))
}

/** The jobs that act on the whole cut: only Story/Edit and the agents have them, and they need no model */
export function cutToolsFor(surface: Surface, specs: ToolSpec[] = CATALOG): ToolOffer[] {
  if (surface !== "edit" && surface !== "agent") return []
  return specs.filter((s) => s.kind === "cut").map((spec) => ({ spec, status: { state: "ready" as const }, candidates: [], more: [] }))
}

/** The tools to show first on a surface: the ready ones that are featured, in their order */
export function featured(offers: ToolOffer[]): ToolOffer[] {
  return offers.filter((o) => o.spec.featured !== undefined && o.status.state === "ready").sort((a, b) => (a.spec.featured ?? 0) - (b.spec.featured ?? 0))
}

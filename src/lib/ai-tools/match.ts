import { taskOf } from "@/lib/registry/tasks"
import type { EditAction } from "@/lib/registry/edit-actions"
import type { ModelRecord, RegistryModality } from "@/lib/registry/types"
import { CATALOG } from "./catalog"
import { FINDERS } from "./finders"
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
  runnable: (provider: string, modality: RegistryModality) => boolean
  /** The edit actions of the person's switched-on video models (Extend, Lip-sync, Motion transfer, Edit) */
  editActions?: EditAction[]
}

export interface ToolOffer {
  spec: ToolSpec
  status: ToolStatus
  /** The models that can do it, the preferred first */
  candidates: ModelRecord[]
  /** Other models that take the right kind of file but did not say they do this job: shown under Show all */
  more: ModelRecord[]
}

const musicLike = /music|song|lyria|melody/i
const sfxLike = /sound-?effects?|sfx|foley/i

function audioCandidates(task: "speech" | "music" | "sfx", listed: ModelRecord[]): ModelRecord[] {
  return listed.filter((r) => {
    if (r.modality !== "audio" || r.status === "deprecated") return false
    const t = taskOf(r)
    if (task === "speech") return t === "speech"
    if (t !== "audio-generation") return false
    return task === "music" ? musicLike.test(r.endpoint) && !sfxLike.test(r.endpoint) : sfxLike.test(r.endpoint)
  })
}

/** Whether a model takes a file of this kind: a settings field marked as one, or the kind in its inputs */
function takesFile(r: ModelRecord, group: MediaKind): boolean {
  return Object.values(r.params.properties).some((p) => p.format === group) || r.inputs.includes(group)
}

export function statusOf(spec: ToolSpec, ctx: MatchContext): { status: ToolStatus; candidates: ModelRecord[]; more: ModelRecord[] } {
  if (spec.kind === "cut" || spec.kind === "local") return { status: { state: "ready" }, candidates: [], more: [] }

  const pool = [...ctx.records, ...ctx.listed.filter((l) => !ctx.records.some((r) => r.id === l.id))]
  let candidates: ModelRecord[] = []
  let anyUnkeyed = false
  if (spec.viaEditAction) {
    candidates = (ctx.editActions ?? []).filter((a) => a.kind === spec.viaEditAction).map((a) => a.record)
  } else if (spec.viaAudioTask) {
    candidates = audioCandidates(spec.viaAudioTask, ctx.listed)
  } else if (spec.kind === "model") {
    // First the standard database's own answer: the models it ranks for this job, best first, on the providers the person has
    const seenIds = new Set<string>()
    const rankFor = (r: ModelRecord) => r.jobs?.find((j) => j.id === spec.id)?.rank
    const ranked = pool.filter((r) => r.status !== "deprecated" && rankFor(r) !== undefined)
    for (const rec of ranked) {
      if (ctx.keyed.has(rec.provider) && ctx.runnable(rec.provider, rec.modality)) seenIds.add(rec.id)
      else anyUnkeyed = true
    }
    candidates = ranked
      .filter((r) => seenIds.has(r.id))
      .sort((a, b) => (rankFor(a) ?? 99) - (rankFor(b) ?? 99) || (a.price.amount ?? 1e9) - (b.price.amount ?? 1e9))
    // Then any other model, from any provider, that does this by what it says it does and takes this kind of file
    const find = FINDERS[spec.id]
    if (find) {
      const words = new RegExp(find.words, "i")
      const not = find.not ? new RegExp(find.not, "i") : undefined
      const have = new Set(candidates.map((c) => c.id))
      const found = pool.filter((r) => {
        if (have.has(r.id) || r.status === "deprecated" || r.outdated || !ctx.keyed.has(r.provider) || !ctx.runnable(r.provider, r.modality)) return false
        if (r.modality !== spec.output || !takesFile(r, spec.group)) return false
        const text = `${r.endpoint} ${r.name} ${r.description ?? ""}`
        return words.test(text) && !(not && not.test(text))
      })
      found.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.price.amount ?? 1e9) - (b.price.amount ?? 1e9))
      candidates.push(...found)
    }
  }
  const taken = new Set(candidates.map((c) => c.id))
  const more = spec.kind === "model" && !spec.viaEditAction && !spec.viaAudioTask
    ? pool.filter((r) => !taken.has(r.id) && r.status !== "deprecated" && ctx.keyed.has(r.provider) && ctx.runnable(r.provider, r.modality) && r.modality === spec.output && takesFile(r, spec.group))
    : []
  if (candidates.length > 0) return { status: { state: "ready" }, candidates, more }
  const noKey = ctx.keyed.size === 0 || (anyUnkeyed && ![...ctx.keyed].some((p) => ctx.runnable(p, spec.output)))
  const missing = noKey ? ("key" as const) : ("model" as const)
  const reason = noKey ? "Add a key in Settings, Providers to use this." : spec.viaEditAction || spec.viaAudioTask ? "Switch on a model that does this in Settings, Providers." : "None of your models does this. Add one in Settings, Providers."
  return { status: { state: "needs-model", reason, missing }, candidates: [], more }
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

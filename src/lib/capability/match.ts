import type { AppCategory, ModelRecord } from "@/lib/registry/types"
import { capabilityOf, capabilityOfExact, verbOfJob, type Ability, type Capability, type Does, type FileKind, type FileRole, type Gives } from "./index"

/**
 * The one rule every screen uses to list models: show every model whose capability fits what the person gave and wants. Create, Edit,
 * the apps, the Agent, the background jobs and the model selector all ask here, so a model shows everywhere it fits and nowhere it does
 * not. Pure: the caller passes the models and what it knows (keys, bookmarks), so the rule is tested without any provider.
 */

export interface Given {
  kind: FileKind
  /** Unset: any field of that kind will do */
  role?: FileRole
  count?: number
}

export interface Want {
  /** What comes out; a job like sound for a clip may come back as the clip with sound or as the sound alone */
  gives: Gives | Gives[]
  given?: Given[]
  /** The job. Unset: any model that gives this. */
  does?: Does | Does[]
  /** The job can be said in words, so a model that edits by words does it too */
  viaEdit?: boolean
  abilities?: Ability[]
}

export interface MatchOptions {
  keyed?: ReadonlySet<string>
  runnable?: (provider: string, category: AppCategory) => boolean
  bookmarks?: ReadonlySet<string>
  /** Keep every endpoint instead of one per model per provider */
  allEndpoints?: boolean
}

export type FitKind = "dedicated" | "edit" | "general"

const givesOk = (r: ModelRecord, w: Want) => (Array.isArray(w.gives) ? w.gives.includes(r.category) : r.category === w.gives)
const jobs = (w: Want): Does[] => (w.does === undefined ? [] : Array.isArray(w.does) ? w.does : [w.does])

/** Whether the endpoint takes what is given, in a role that fits, and has everything it cannot run without */
export function takesGiven(c: Pick<Capability, "takes">, given: Given[] = []): boolean {
  for (const g of given) {
    const fields = c.takes.filter((t) => t.kind === g.kind && (!g.role || t.role === g.role))
    if (fields.length === 0) return false
    const room = fields.reduce((n, t) => n + t.max, 0)
    if ((g.count ?? 1) > room) return false
  }
  for (const t of c.takes) {
    if (!t.required) continue
    if (!given.some((g) => g.kind === t.kind && (!g.role || g.role === t.role))) return false
  }
  return true
}

/** How the endpoint fits the job, or undefined when it does not */
export function fitOf(r: ModelRecord, want: Want, pool: ModelRecord[] = []): FitKind | undefined {
  if (r.status === "deprecated" || !givesOk(r, want)) return undefined
  const own = capabilityOfExact(r)
  // The maker's model can do what any of its versions shows on any provider; this endpoint's own fields decide what it can be given
  const all = pool.length > 0 ? capabilityOf(r, pool) : own
  const editsClips = r.category === "video" && all.does.includes("edit") && !own.takes.some((t) => t.kind === "video" && t.role === "source")
  const c: Capability = {
    ...own,
    does: all.does,
    takes: editsClips ? own.takes.map((t) => (t.kind === "video" && t.role === "reference" ? { ...t, role: "source" as const } : t)) : own.takes,
  }
  if (want.abilities?.some((a) => !c.abilities.includes(a))) return undefined
  if (!takesGiven(c, want.given)) return undefined
  const wanted = jobs(want)
  if (wanted.length === 0) return "general"
  if (wanted.some((j) => c.dedicated.includes(j))) return "dedicated"
  if (wanted.some((j) => c.does.includes(j))) return wanted.includes("make") || wanted.includes("edit") || wanted.includes("chat") ? "general" : "dedicated"
  if (want.viaEdit && c.does.includes("edit")) return "edit"
  // Something made from words alone that can be said in a sentence (a sound effect) is made by any maker of that kind, told what to make
  if (want.viaEdit && (want.given ?? []).length === 0 && c.does.includes("make")) return "edit"
  return undefined
}

const FIT_ORDER: Record<FitKind, number> = { dedicated: 0, general: 1, edit: 2 }

/** The database's own order for this job on its provider (1 = first), when it lists one */
function rankOf(r: ModelRecord, wanted: Does[]): number {
  let best = 99
  for (const s of r.serves ?? []) if (s.role !== "alternative" && wanted.length > 0 && wanted.includes(verbOfJob(s.id) as Does)) best = Math.min(best, s.rank)
  return best
}

/** Every model that fits, best first: bookmarked, made for this job, general, editors; then the database's order, popularity, newer, cheaper */
export function modelsFor(want: Want, pool: ModelRecord[], opts: MatchOptions = {}): ModelRecord[] {
  const wanted = jobs(want)
  const scored: Array<{ r: ModelRecord; fit: FitKind }> = []
  for (const r of pool) {
    if (opts.keyed && !opts.keyed.has(r.provider)) continue
    if (opts.runnable && !opts.runnable(r.provider, r.category)) continue
    const fit = fitOf(r, want, pool)
    if (fit) scored.push({ r, fit })
  }
  const marked = opts.bookmarks
  const key = (x: { r: ModelRecord; fit: FitKind }) =>
    [marked?.has(x.r.id) ? 0 : 1, FIT_ORDER[x.fit], rankOf(x.r, wanted), -(x.r.runs ?? 0)] as const
  scored.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!
    return (b.r.updatedAt ?? "").localeCompare(a.r.updatedAt ?? "") || (a.r.price.amount ?? 1e9) - (b.r.price.amount ?? 1e9) || a.r.endpoint.length - b.r.endpoint.length
  })
  if (opts.allEndpoints) return scored.map((x) => x.r)
  // One endpoint per model per provider: the best-fitting one
  const seen = new Set<string>()
  const out: ModelRecord[] = []
  for (const { r } of scored) {
    const k = `${r.provider}|${r.versionId ?? r.id}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

/** Whether the model as a whole (all its versions, on any provider) can do the job: for showing apps and Edit options */
export function modelCanDo(r: ModelRecord, want: Want, pool: ModelRecord[]): boolean {
  if (!givesOk(r, want) || r.status === "deprecated") return false
  const c = capabilityOf(r, pool)
  const wanted = jobs(want)
  if (wanted.length === 0) return true
  return wanted.some((j) => c.does.includes(j)) || Boolean(want.viaEdit && c.does.includes("edit"))
}

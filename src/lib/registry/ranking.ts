import { popularityOf } from "@/lib/knowledge/identity"
import { topMakerOf } from "./top-makers"
import type { ModelRecord } from "./types"

/**
 * The one order models are shown in, wherever a person has to pick one and cannot be expected to know every model and maker.
 *
 * Best: closed models, then open ones. Inside each, the makers that rank best for what is being done come first (the database ranks every
 * model of a task or a tool on its provider, best = 1, from the maker list, the leaderboard and how much it is used), and for each maker its
 * newest models follow. Nothing here names a model, a maker or a provider: it reads only what the database says about each record.
 */

/** How well a model ranks for a task or tool: its rank for `job` when it has one, else its best rank for anything it serves, else its use */
const standingOf = (r: ModelRecord, job?: string): [number, number] => {
  const ranks = (r.serves ?? []).filter((s) => !job || s.id === job).map((s) => s.rank)
  return ranks.length > 0 ? [Math.min(...ranks), 0] : [1000, popularityOf(r)[1]]
}

export function rankBest(list: ModelRecord[], job?: string): ModelRecord[] {
  const weight = (r: ModelRecord) => (r.weights === "closed" ? 0 : r.weights === "open" ? 1 : 2)
  const makerOf = (r: ModelRecord) => topMakerOf(r) ?? r.provider
  const standing = new Map<string, [number, number]>()
  const count = new Map<string, number>()
  for (const r of list) {
    const mine = standingOf(r, job)
    const had = standing.get(makerOf(r))
    if (!had || mine[0] < had[0] || (mine[0] === had[0] && mine[1] < had[1])) standing.set(makerOf(r), mine)
    count.set(makerOf(r), (count.get(makerOf(r)) ?? 0) + 1)
  }
  return [...list].sort((a, b) => {
    const sa = standing.get(makerOf(a))!
    const sb = standing.get(makerOf(b))!
    // Makers with equal standing: the one with more models for the job is the one the job is known for
    return weight(a) - weight(b) || sa[0] - sb[0] || sa[1] - sb[1] || count.get(makerOf(b))! - count.get(makerOf(a))! || makerOf(a).localeCompare(makerOf(b)) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
  })
}

/**
 * A list as a person sees it. Always Best. Where the person has chosen models of their own (the stars on a category list: image, video,
 * audio, chat) those come first, in Best order too; a job's list (an edit option, an app) has no stars, only Best.
 */
export function arrange(list: ModelRecord[], opts: { job?: string; starred?: ReadonlySet<string> } = {}): ModelRecord[] {
  const best = rankBest(list, opts.job)
  const stars = opts.starred
  if (!stars || stars.size === 0) return best
  return [...best.filter((r) => stars.has(r.id)), ...best.filter((r) => !stars.has(r.id))]
}

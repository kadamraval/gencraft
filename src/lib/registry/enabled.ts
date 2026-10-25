import { isLeadingMaker, makerRank } from "./logo-rules"
import { packRankOf } from "./roles"
import { entryFor } from "./shortlist"
import type { ShortlistEntry } from "./shortlist"
import type { ModelRecord, RegistryModality } from "./types"

/**
 * Which models the chat picker offers.
 *
 * Settings has an on/off switch per model. Only switched-on models appear in the chat picker. Until the user
 * changes anything, a sensible default is on: the best models of each kind of output, taken from the arena
 * leaderboards (see shortlist.ts), for each provider on its own so a person with one key still gets the best of it.
 * Where a provider has too few models on a board, the newest couple per maker and task fill in. Everything else is
 * one switch away in Settings.
 */

const PER_MAKER_AND_TASK = 2
const MAX_PER_MODALITY = 24
/** Per provider and kind of output: the best closed models and the best open-weights models */
const CLOSED_SHOWN = 10
const OPEN_SHOWN = 5
/** A provider with fewer models than this on the boards is filled in the older way */
const MIN_SHORTLISTED = 3
/** The newest releases of the leading makers, added after the industry leaders */
const NEWEST_SHOWN = 4

const promptFirst = (r: ModelRecord) => (r.task ? (r.task.startsWith("text-to") || r.task.startsWith("image-to") ? 0 : 1) : 0)

function newest(a: ModelRecord, b: ModelRecord): number {
  const v = (b.version?.[0] ?? 0) * 100 + (b.version?.[1] ?? 0) - ((a.version?.[0] ?? 0) * 100 + (a.version?.[1] ?? 0))
  if (v) return v
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
}

/** Of several records for one board row, the one a person would start from: text to X first, then image to X, then the plainest name. */
const startRank = (r: ModelRecord) => (!r.task || r.task.startsWith("text-to") ? 0 : r.task.startsWith("image-to") ? 1 : 2)
const plainer = (a: ModelRecord, b: ModelRecord) => startRank(a) - startRank(b) || a.endpoint.length - b.endpoint.length

/** One provider's best models of one kind: the top closed ones and the top open-weights ones, best first. */
export function shortlistedFor(pool: ModelRecord[], entries?: ShortlistEntry[]): ModelRecord[] {
  const rows = new Map<number, { record: ModelRecord; entry: ShortlistEntry }>()
  for (const r of pool) {
    const entry = entryFor(r, entries)
    if (!entry) continue
    const held = rows.get(entry.rank)
    if (!held || plainer(r, held.record) < 0) rows.set(entry.rank, { record: r, entry })
  }
  const ranked = [...rows.values()].sort((a, b) => a.entry.rank - b.entry.rank)
  const closed = ranked.filter((x) => !x.entry.open).slice(0, CLOSED_SHOWN)
  const open = ranked.filter((x) => x.entry.open).slice(0, OPEN_SHOWN)
  return [...closed, ...open].sort((a, b) => a.entry.rank - b.entry.rank).map((x) => x.record)
}

/** The older way: for each maker and task the newest couple of models, strongest makers first. */
function newestPerMaker(pool: ModelRecord[], modality: RegistryModality): ModelRecord[] {
  const byLine = new Map<string, ModelRecord[]>()
  for (const r of pool) {
    const key = `${r.maker ?? r.provider}|${r.task ?? r.modality}`
    byLine.set(key, [...(byLine.get(key) ?? []), r])
  }
  const picks: ModelRecord[] = []
  for (const group of byLine.values()) picks.push(...[...group].sort(newest).slice(0, PER_MAKER_AND_TASK))
  return picks.sort(
    (a, b) =>
      makerRank({ name: a.name, endpoint: a.endpoint, family: a.family }, modality) - makerRank({ name: b.name, endpoint: b.endpoint, family: b.family }, modality) ||
      Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
      newest(a, b),
  )
}

/** The latest releases of the leading makers, newest first, that are not already in `have` */
function newestReleases(pool: ModelRecord[], modality: RegistryModality, have: Set<string>): ModelRecord[] {
  return pool
    .filter((r) => !have.has(r.id) && isLeadingMaker({ name: r.name, endpoint: r.endpoint, family: r.family }, modality))
    .sort(newest)
    .slice(0, NEWEST_SHOWN)
}

/** Top models: the industry leaders first (arena leaderboards for pictures, video and sound; the leading makers for chat), then the newest releases. */
export function computeDefaultEnabled(listed: ModelRecord[]): string[] {
  const out: string[] = []
  for (const modality of ["text", "image", "video", "audio"] as RegistryModality[]) {
    const pool = listed.filter((r) => r.modality === modality && promptFirst(r) === 0)
    if (modality === "text") {
      const lead = newestPerMaker(pool, modality).slice(0, MAX_PER_MODALITY)
      out.push(...lead.map((r) => r.id), ...newestReleases(pool, modality, new Set(lead.map((r) => r.id))).map((r) => r.id))
      continue
    }
    const picks: Array<{ record: ModelRecord; rank: number }> = []
    for (const provider of new Set(pool.map((r) => r.provider))) {
      const mine = pool.filter((r) => r.provider === provider)
      const best = shortlistedFor(mine)
      const chosen = best.length >= MIN_SHORTLISTED ? best : newestPerMaker(mine, modality).slice(0, MAX_PER_MODALITY)
      for (const [i, record] of chosen.entries()) picks.push({ record, rank: entryFor(record)?.rank ?? 1000 + i })
      // The standard database's own models come first on their provider
      for (const record of mine) {
        const own = packRankOf(record)
        if (own !== undefined) picks.push({ record, rank: own - 100 })
      }
      for (const [i, record] of newestReleases(mine, modality, new Set(chosen.map((r) => r.id))).entries()) picks.push({ record, rank: 2000 + i })
    }
    // Best first across providers: this order decides the model a fresh composer starts with
    picks.sort((a, b) => a.rank - b.rank)
    out.push(...new Set(picks.map((p) => p.record.id)))
  }
  return out
}

/**
 * Every model that can be offered. There are no per-model switches any more: a model with a usable key is available, and bookmarks
 * (see bookmarks.ts) only decide the order. The second argument is kept for callers written when switches existed.
 */
export function enabledSet(listed: ModelRecord[], _legacyChoice?: string[]): Set<string> {
  return new Set(listed.map((r) => r.id))
}

/** The strongest current model for one kind of output, used when nothing usable is configured. */
export function defaultModelFor(modality: RegistryModality, listed: ModelRecord[]): ModelRecord | undefined {
  const byId = new Map(listed.map((r) => [r.id, r]))
  return computeDefaultEnabled(listed)
    .map((id) => byId.get(id))
    .find((r): r is ModelRecord => Boolean(r) && r!.modality === modality)
}

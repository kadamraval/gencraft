import makerList from "../sheet/makers.json"
import { makerIndex, officialMakerOf } from "../knowledge/identity"
import type { MakerList } from "../sheet/types"
import type { ModelRecord } from "./types"

/**
 * What people are offered: the top makers only, and at most five models of each maker in each category, the newest ones. When a maker
 * has open models too, the newest open one is among the five. A model the person added by hand is always kept.
 */

export const MAX_PER_MAKER = 5

const index = makerIndex(makerList as unknown as MakerList)

/** The top maker of a record by its name in the maker list, or undefined when it is not one of them */
export function topMakerOf(r: ModelRecord): string | undefined {
  // A record from the standard database already passed the maker's-own-endpoint check when it was built
  if (r.maker && [...index.names.values()].includes(r.maker)) return r.maker
  // Any other record (a provider's live list) counts only when it is the maker's own endpoint, never a community copy of its model
  const found = officialMakerOf(r, index)
  return found ? index.names.get(found.id) : undefined
}

/** One model, whatever endpoint or provider runs it */
const unitOf = (r: ModelRecord) => r.versionId ?? `${r.category}|${r.name}|${r.variant ?? ""}`

/** The numbers in a model's name, for "newer": 3.1 beats 3.0, which beats 2.5 */
const versionOf = (r: ModelRecord): number[] => (r.name.match(/\d+(\.\d+)?/g) ?? []).map(Number)
const newer = (a: ModelRecord, b: ModelRecord): number => {
  const d = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
  if (d !== 0) return d
  const x = versionOf(a)
  const y = versionOf(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0)
  return a.name.localeCompare(b.name)
}

export function topMakersOnly(list: ModelRecord[], max = MAX_PER_MAKER): ModelRecord[] {
  const groups = new Map<string, Map<string, ModelRecord[]>>()
  const kept: ModelRecord[] = []
  for (const r of list) {
    if (r.custom) {
      kept.push(r)
      continue
    }
    const maker = topMakerOf(r)
    if (!maker) continue
    const key = `${r.category}|${maker}`
    if (!groups.has(key)) groups.set(key, new Map())
    const units = groups.get(key)!
    const u = unitOf(r)
    units.set(u, [...(units.get(u) ?? []), r.maker === maker ? r : { ...r, maker }])
  }
  for (const units of groups.values()) {
    const ranked = [...units.values()].sort((a, b) => newer(a.reduce((m, r) => (newer(r, m) < 0 ? r : m)), b.reduce((m, r) => (newer(r, m) < 0 ? r : m))))
    const chosen = ranked.slice(0, max)
    // Closed and open both: the newest open model takes the last place when none of the five is open
    const open = ranked.find((u) => u.some((r) => r.weights === "open"))
    if (open && !chosen.includes(open) && chosen.length === max) chosen[max - 1] = open
    for (const u of chosen) kept.push(...u)
  }
  return kept
}

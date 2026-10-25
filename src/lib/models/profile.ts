import { matchScore, tokensOf } from "../registry/shortlist"
import type { ModelRecord } from "../registry/types"
import type { Profile } from "./types"

/**
 * Finds the maker's profile for a host's record. A profile names the model the way its maker does ("Seedance 2.5"); the
 * host's record is matched on the same terms the leaderboard match uses: version numbers identical, every word present,
 * the closest name wins. A variant's words ("fast", "lite") must be in the record, and a sibling's words must not be, so
 * "Seedance 2.0" never takes "Seedance 2.0 Fast".
 */

const registered: Profile[] = []

export function registerProfiles(...profiles: Profile[]) {
  for (const p of profiles) if (!registered.some((r) => r.id === p.id)) registered.push(p)
}

export const allProfiles = (): readonly Profile[] => registered

type Target = Pick<ModelRecord, "name" | "endpoint" | "modality">

/** Hosts run a name into its number ("veo3.1"); a word of three letters or more is split from the digits after it. */
const spaced = (s: string) => s.replace(/([a-z]{3,})(?=\d)/gi, "$1 ")

function scoreOf(profile: Profile, source: Target): number {
  if (profile.kind !== source.modality) return 0
  const record = { ...source, name: spaced(source.name), endpoint: spaced(source.endpoint) }
  const haystack = tokensOf(`${record.name} ${record.endpoint.replace(/\//g, " ")}`)
  if ((profile.variantWords ?? []).some((w) => !haystack.includes(w))) return 0
  if ((profile.notWords ?? []).some((w) => haystack.includes(w))) return 0
  let best = 0
  for (const name of profile.names) best = Math.max(best, matchScore(name, record, profile.maker))
  return best
}

const held = new Map<string, Profile | undefined>()

/** The profile of this record, or undefined when the maker's page has not been captured for it. */
export function profileFor(record: Target): Profile | undefined {
  const key = `${registered.length}|${record.modality}|${record.name}|${record.endpoint}`
  if (held.has(key)) return held.get(key)
  let best: { p: Profile; score: number } | undefined
  for (const p of registered) {
    const score = scoreOf(p, record)
    if (score < 0.3) continue
    // The same score: the profile that says more about itself (a named variant) is the closer one
    const more = (p.variantWords?.length ?? 0) > (best?.p.variantWords?.length ?? 0)
    if (!best || score > best.score || (score === best.score && more)) best = { p, score }
  }
  held.set(key, best?.p)
  return best?.p
}

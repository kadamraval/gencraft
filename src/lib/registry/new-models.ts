import type { ModelRecord } from "./types"

/**
 * New top models switch themselves on.
 *
 * A person who has saved their own on/off choices would never see a model that climbs the leaderboard after that, because
 * it is not in their list. So the models the catalog ranks as top that the person has not yet decided about are switched
 * on by themselves. A model is decided once the person has been shown the list and saved a change: switching one off then
 * keeps it off for good.
 *
 * The first time this runs there is no record of what was decided. Everything the person already chose, and every model
 * the catalog does not rank as top, counts as decided; only top models they have not chosen are new.
 */

const KEY = "gencraft_decided_models_v1"

function read(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function write(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    // storage unavailable: the choice lasts until the app closes
  }
}

let memory: Set<string> | null = null

/** The top models the person has not decided about. Empty when they have no saved choices (the defaults apply anyway). */
export function newTopModels(listed: ModelRecord[], userChoice: string[] | undefined, top: string[]): string[] {
  if (!userChoice || userChoice.length === 0) return []
  let decided = memory ?? read()
  if (!decided) {
    const topSet = new Set(top)
    decided = new Set([...userChoice, ...listed.map((r) => r.id).filter((id) => !topSet.has(id))])
    write(decided)
  }
  memory = decided
  const chosen = new Set(userChoice)
  return top.filter((id) => !decided!.has(id) && !chosen.has(id))
}

/** Notes that the person has been shown these models and had the chance to switch them off. */
export function markDecided(ids: Iterable<string>) {
  const decided = new Set(memory ?? read() ?? [])
  for (const id of ids) decided.add(id)
  memory = decided
  write(decided)
}

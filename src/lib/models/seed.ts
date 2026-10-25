import type { ModelRecord } from "../registry/types"

/**
 * A seed is the number that picks a run's starting noise: the same seed with the same prompt and settings repeats a result,
 * a different one makes a new take. Most hosts pick a random one when none is sent. A few ship a fixed default (Fibo uses 5555),
 * so pressing Generate twice would give the same picture. This sends a fresh random seed in that case, and leaves everything else
 * alone: a seed the person typed is kept, a model with no seed field gets none, and a host's own "random" marker (-1) is left.
 */

const SAFE_MAX = 2 ** 31 - 1

type Target = Pick<ModelRecord, "params">

/** The seed field of a model and its range, when the model takes one. */
function seedField(record: Target): { key: string; min: number; max: number; fixedDefault: boolean } | undefined {
  for (const [key, p] of Object.entries(record.params.properties)) {
    if (key.toLowerCase() !== "seed" || p.rejected || (p.type !== "integer" && p.type !== "number")) continue
    const min = typeof p.minimum === "number" ? Math.max(0, p.minimum) : 0
    const max = typeof p.maximum === "number" ? Math.min(SAFE_MAX, p.maximum) : SAFE_MAX
    const d = p.default
    // -1 or 0 or nothing mean "pick one for me" on a host; any other default is a fixed seed
    const fixedDefault = typeof d === "number" && d > 0
    return { key, min, max: max > min ? max : min + 1, fixedDefault }
  }
  return undefined
}

/**
 * The seed to send for this run, or undefined when the run should be left as it is. `chosen` is the value in the run's settings:
 * it counts as the person's own only when it differs from the model's fixed default.
 */
export function freshSeed(record: Target, chosen: unknown, random: () => number = Math.random): { key: string; value: number } | undefined {
  const field = seedField(record)
  if (!field) return undefined
  const given = typeof chosen === "number" ? chosen : typeof chosen === "string" && chosen.trim() !== "" ? Number(chosen) : undefined
  const prop = record.params.properties[field.key]!
  // The person's own seed (a real number that is not the model's fixed default) is theirs
  if (given !== undefined && Number.isFinite(given) && given >= 0 && given !== prop.default) return undefined
  // Otherwise the host picks a random one itself, unless the model ships a fixed default
  if (!field.fixedDefault) return undefined
  return { key: field.key, value: field.min + Math.floor(random() * (field.max - field.min + 1)) }
}

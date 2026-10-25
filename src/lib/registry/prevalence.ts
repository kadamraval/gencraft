import { attributeOfField } from "./attributes"
import { AUDIO_SWITCH_KEYS } from "./canonical"
import type { ModelRecord, ParamProperty, RegistryModality } from "./types"

/**
 * What is standard for a kind of output, worked out from the models themselves.
 *
 * A setting most models of a kind have (aspect ratio, resolution, duration) is Standard. A setting few have is what
 * sets a model apart, so it is Model specific. The name rules in param-policy.ts give every field a first place; this
 * moves a field up or down when the catalog says it is more or less common than its name suggested.
 */

/** The settings every creator expects, whatever the catalog says */
const CORE = new Set(["aspect_ratio", "resolution", "quality", "duration", "count", "sound"])
/** Settings that are helpers, not choices about the result: they stay under More however many models have them */
const HELPERS = new Set(["seed", "negative_prompt", "prompt_enhance", "guidance"])

/** A setting at least this share of a kind's models have is Standard */
const STANDARD_SHARE = 0.5
/** Fewer models than this say nothing about what is standard */
const MIN_MODELS = 8

export interface Prevalence {
  total: number
  /** Share of the kind's models that have each setting, by standard name where there is one */
  share: Map<string, number>
}

const keyOf = (field: string): string => (AUDIO_SWITCH_KEYS as readonly string[]).includes(field) ? "sound" : (attributeOfField(field) ?? field)

export function prevalenceOf(pool: ModelRecord[]): Partial<Record<RegistryModality, Prevalence>> {
  const out: Partial<Record<RegistryModality, Prevalence>> = {}
  for (const modality of ["image", "video", "audio"] as RegistryModality[]) {
    const models = pool.filter((r) => r.modality === modality && Object.values(r.params.properties).some((p) => !p.format))
    if (models.length < MIN_MODELS) continue
    const counts = new Map<string, number>()
    for (const r of models) {
      // One vote per model, however many fields it has for the same setting
      const keys = new Set(Object.entries(r.params.properties).filter(([, p]) => !p.format && !p.untested).map(([k]) => keyOf(k)))
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    out[modality] = { total: models.length, share: new Map([...counts].map(([k, n]) => [k, n / models.length])) }
  }
  return out
}

/** The tier the catalog gives a field, or undefined when it keeps the one it has. */
export function tierFor(key: string, p: ParamProperty, stats: Prevalence): ParamProperty["tier"] | undefined {
  if (p.format || p.untested || p.rejected || p.tier === "technical") return undefined
  const k = keyOf(key)
  if (CORE.has(k) || HELPERS.has(k)) return undefined
  const share = stats.share.get(k) ?? 0
  if ((p.tier === "unique" || p.tier === "advanced" || p.tier === undefined) && share >= STANDARD_SHARE) return "common"
  if (p.tier === "common" && share < 0.1) return "unique"
  return undefined
}

/** The record with each field in the tier the catalog gives it. Returns the same record when nothing moves. */
export function retier(record: ModelRecord, all: Partial<Record<RegistryModality, Prevalence>>): ModelRecord {
  const stats = all[record.modality]
  if (!stats) return record
  let moved = false
  const properties: Record<string, ParamProperty> = {}
  for (const [key, p] of Object.entries(record.params.properties)) {
    const tier = tierFor(key, p, stats)
    if (tier && tier !== p.tier) {
      moved = true
      properties[key] = { ...p, tier }
    } else properties[key] = p
  }
  return moved ? { ...record, params: { ...record.params, properties } } : record
}

import { attributeOfField } from "../registry/attributes"
import { AUDIO_SWITCH_KEYS } from "../registry/canonical"
import type { ModelRecord, ParamProperty } from "../registry/types"

/**
 * Rules and recipes are written once, against the standard names (resolution, duration, aspect_ratio, sound). Each host
 * calls them something else, so this finds the host's field for a standard name, reads a host's values as standard ones,
 * and writes a standard value back in the words the host's own list accepts ("adaptive" is "match_input_image" on one
 * host and "auto" on another).
 */

export type StandardName = "aspect_ratio" | "resolution" | "duration" | "sound" | "quality" | "count" | "seed"

/** The host's field for each standard name this model has. */
export function hostFields(record: Pick<ModelRecord, "params">): Partial<Record<StandardName, string>> {
  const out: Partial<Record<StandardName, string>> = {}
  for (const [key, p] of Object.entries(record.params.properties)) {
    if (p.format || p.slot) continue
    const name: StandardName | undefined = (AUDIO_SWITCH_KEYS as readonly string[]).includes(key) ? "sound" : (attributeOfField(key) as StandardName | undefined)
    if (name && ["aspect_ratio", "resolution", "duration", "sound", "quality", "count", "seed"].includes(name) && !out[name]) out[name] = key
  }
  return out
}

/** Words hosts use for "the model decides". */
const AUTO = ["adaptive", "auto", "match_input_image", "match_input", "-1"]

const norm = (v: unknown) => String(v).trim().toLowerCase().replace(/[\s-]+/g, "_")

/** True when a value means "the model decides". */
export const isAuto = (v: unknown): boolean => AUTO.includes(norm(v)) || (typeof v === "number" && v <= 0)

/** The host's own word for "the model decides" for this field, or undefined when the host has none. */
export function autoValueFor(p: ParamProperty | undefined): unknown {
  if (!p) return undefined
  if (p.enum?.length) return p.enum.find((v) => isAuto(v))
  if ((p.type === "integer" || p.type === "number") && p.minimum !== undefined && p.minimum <= -1) return -1
  return undefined
}

/** The host's values read as standard ones: the same numbers under the standard names. */
export function toStandard(record: Pick<ModelRecord, "params">, values: Record<string, unknown>): Record<string, unknown> {
  const fields = hostFields(record)
  const out: Record<string, unknown> = { ...values }
  for (const [name, key] of Object.entries(fields)) if (key && key in values) out[name] = values[key]
  // Sound is a switch on every host; the standard value is a plain true or false
  if (fields.sound && fields.sound in values) out.sound = Boolean(values[fields.sound])
  // A length the model decides is 0 in the standard words
  if (fields.duration && isAuto(values[fields.duration])) out.duration = 0
  return out
}

/** One standard value in the host's words: the closest value its list accepts, or undefined if it has no such field. */
export function toHost(record: Pick<ModelRecord, "params">, name: StandardName, value: unknown): { key: string; value: unknown } | undefined {
  const key = hostFields(record)[name]
  if (!key) return undefined
  const p = record.params.properties[key]
  if (name === "duration" && (value === 0 || isAuto(value))) {
    const auto = autoValueFor(p)
    return auto === undefined ? undefined : { key, value: auto }
  }
  if (name === "aspect_ratio" && isAuto(value)) {
    const auto = autoValueFor(p)
    return auto === undefined ? undefined : { key, value: auto }
  }
  if (p?.enum?.length) {
    const hit = p.enum.find((o) => norm(o) === norm(value))
    return hit === undefined ? undefined : { key, value: hit }
  }
  return { key, value }
}

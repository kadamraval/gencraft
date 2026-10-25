import type { ModelRecord, RequestSpec } from "./types"

/** Raise when the reader learns something new, so models saved earlier are read again (Replicate keeps them otherwise) */
export const REQUEST_VERSION = 5

/**
 * Builds the request a model really expects, from its own input schema.
 *
 * Models do not all call the prompt `prompt` (speech models use `text`, some chat models `input` or `message`),
 * and some require fields the composer never shows (a mode, a steps count). The spec records the prompt field
 * and a default for every other required field, so the request is complete without the user seeing plumbing.
 * A required field with no default is reported as a blocker, so the app says so before sending anything.
 */

interface RawField {
  type?: string
  default?: unknown
  enum?: Array<string | number>
  /** A file input: handled by the reference slots, not here */
  file?: boolean
}

const PROMPT_KEYS = ["prompt", "text", "input", "inputs", "query", "message", "text_prompt", "instruction", "user_prompt", "texts"]

export function buildRequestSpec(fields: Record<string, RawField>, required: string[], handled: Set<string>): RequestSpec {
  const promptKey = PROMPT_KEYS.find((k) => fields[k] && (fields[k]!.type === "string" || fields[k]!.type === "array")) ?? "prompt"
  const fixed: Record<string, unknown> = {}
  const blockers: string[] = []
  for (const key of required) {
    const f = fields[key]
    if (!f || key === promptKey || handled.has(key) || f.file) continue
    if (f.default !== undefined && f.default !== null) fixed[key] = f.default
    else if (f.enum?.length) fixed[key] = f.enum[0]
    else if (f.type === "boolean") fixed[key] = false
    else if (f.type === "integer" || f.type === "number") fixed[key] = 0
    else if (f.type === "string") fixed[key] = ""
    else blockers.push(key)
  }
  return { promptKey, fixed, blockers, v: REQUEST_VERSION }
}

/**
 * The settings that go in a request. A setting the provider refused is never sent. A setting the provider does not
 * list (an official one, still untested there) is sent only once the person has changed it from its default, so a
 * provider that rejects unknown fields is never hit by a setting nobody asked for.
 */
export function sendableParams(record: Pick<ModelRecord, "params">, params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    const p = record.params.properties[key]
    if (p?.rejected || p?.virtual || key.startsWith("__")) continue
    if (p?.untested && String(value) === String(p.default)) continue
    out[key] = value
  }
  return out
}

/** The request body for a run: the model's own defaults, the user's settings, then the prompt in the field the model uses. */
export function buildInput(record: Pick<ModelRecord, "params">, prompt: string, params: Record<string, unknown> = {}): Record<string, unknown> {
  const spec = record.params.request
  return { ...(spec?.fixed ?? {}), ...sendableParams(record, params), [spec?.promptKey ?? "prompt"]: spec?.promptKey === "texts" ? [prompt] : prompt }
}

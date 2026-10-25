import type { ModelRecord, ParamProperty } from "./types"

/**
 * What real runs have shown about a setting the provider does not list for a model.
 *
 * The maker's own list is the master list, so a documented setting is shown for every host. Until a run proves the
 * host takes it, it is marked untested. A successful run that sent it settles it as accepted; a refusal that names it
 * settles it as rejected. The result is kept on this computer and applied to the model's record whenever it is read,
 * so nobody has to maintain it by hand.
 */

export type Verdict = "accepted" | "rejected"

const KEY = "gencraft_param_checks_v1"

type Store = Record<string, Record<string, Verdict>>

let cache: Store | null = null
const listeners = new Set<() => void>()

function read(): Store {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    cache = {}
  }
  return cache
}

function write(next: Store) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage unavailable: the result lasts until the app closes
  }
  listeners.forEach((l) => l())
}

export function onParamChecksChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function paramVerdict(modelId: string, field: string): Verdict | undefined {
  return read()[modelId]?.[field]
}

/** Notes the outcome for each field. An unchanged verdict does not notify anyone. */
export function recordParamChecks(modelId: string, fields: string[], verdict: Verdict): void {
  if (fields.length === 0) return
  const store = read()
  const mine = store[modelId] ?? {}
  const changed = fields.filter((f) => mine[f] !== verdict)
  if (changed.length === 0) return
  write({ ...store, [modelId]: { ...mine, ...Object.fromEntries(changed.map((f) => [f, verdict])) } })
}

/** The record with what runs have shown applied: accepted settings lose the untested mark, rejected ones are flagged. */
export function applyParamChecks<T extends Pick<ModelRecord, "id" | "params">>(record: T): T {
  const known = read()[record.id]
  if (!known) return record
  let touched = false
  const properties: Record<string, ParamProperty> = {}
  for (const [key, p] of Object.entries(record.params.properties)) {
    const verdict = known[key]
    if (verdict === "rejected") {
      touched = true
      properties[key] = { ...p, rejected: true }
    } else if (verdict === "accepted" && p.untested) {
      touched = true
      const { untested: _untested, ...rest } = p
      properties[key] = rest
    } else properties[key] = p
  }
  return touched ? { ...record, params: { ...record.params, properties } } : record
}

/** Words a provider uses when it refuses a request because of its content rather than because it is busy or broke. */
const REFUSAL = /validation|invalid|unprocessable|unexpected|unknown (field|parameter|input)|not (allowed|permitted|supported|a valid)|HTTP 4(00|22)/i

/**
 * The fields a refusal names. Only fields the run actually sent can be named, and only when the message reads like a
 * refusal of the request, so a timeout or an empty result never marks a setting as rejected.
 */
export function fieldsNamedIn(message: string, sent: string[]): string[] {
  if (!REFUSAL.test(message)) return []
  return sent.filter((f) => new RegExp(`(^|[^a-z0-9_])${f}([^a-z0-9_]|$)`, "i").test(message))
}

/** The sent fields that are still untested for this model: the ones a run can settle. */
export function untestedSent(record: Pick<ModelRecord, "params">, input: Record<string, unknown>): string[] {
  return Object.keys(input).filter((k) => record.params.properties[k]?.untested)
}

import type { SafetyControl } from "./types"

/**
 * The safety checker, read from what each model really offers.
 *
 * Providers name it differently, and many models have no switch at all (OpenAI, Gemini and most closed video
 * models filter on their side and cannot be changed). The control is read from each model's own input schema,
 * so the app sends a safety field only to a model that has one, and says so when it does not.
 */

interface RawField {
  type?: string
  enum?: Array<string | number>
}

export function detectSafety(fields: Record<string, RawField>): SafetyControl | undefined {
  for (const key of ["enable_safety_checker", "safety_checker", "enable_safety_filter"]) {
    if (fields[key]?.type === "boolean") return { key, kind: "enable" }
  }
  for (const key of ["disable_safety_checker", "disable_safety_filter"]) {
    if (fields[key]?.type === "boolean") return { key, kind: "disable" }
  }
  const tol = fields.safety_tolerance
  if (tol?.enum?.length) return { key: "safety_tolerance", kind: "tolerance", values: tol.enum }
  return undefined
}

/** The fields to add to a request. `filterOn` is the Settings choice: true keeps the provider's checker. */
export function safetyInput(control: SafetyControl | undefined, filterOn: boolean): Record<string, unknown> {
  if (!control) return {}
  if (control.kind === "enable") return { [control.key]: filterOn }
  if (control.kind === "disable") return { [control.key]: !filterOn }
  // A tolerance scale: with the filter off use the most permissive step the model offers; with it on, the model's own default
  if (control.kind === "tolerance" && !filterOn && control.values?.length) {
    const numeric = control.values.map((v) => ({ v, n: Number(v) })).filter((x) => Number.isFinite(x.n))
    if (numeric.length === control.values.length) return { [control.key]: numeric.sort((a, b) => b.n - a.n)[0]!.v }
  }
  return {}
}

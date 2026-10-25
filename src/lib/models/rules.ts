import type { Rule, RuleResult, Selection } from "./types"

/**
 * Applies a maker's rules to what the person has chosen.
 *
 * Rules run in order. A lock wins over a narrowing (a fixed value is not a choice). A value left outside a narrowed list
 * moves to the list's first choice, and the reason is kept so the screen can say so. Nothing here knows a model: the
 * rules come from its profile.
 */

const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase()

export function applyRules(rules: Rule[], selection: Selection): RuleResult {
  const values: Record<string, unknown> = { ...selection.values }
  const locked: RuleResult["locked"] = {}
  const narrowed: RuleResult["narrowed"] = {}
  const hidden: RuleResult["hidden"] = {}
  const warnings: string[] = []

  for (const rule of rules) {
    if (!rule.when({ ...selection, values })) continue
    for (const [key, allowed] of Object.entries(rule.only ?? {})) {
      const before = narrowed[key]?.allowed
      const list = before ? allowed.filter((v) => before.some((b) => same(b, v))) : allowed
      narrowed[key] = { allowed: list, reason: rule.reason }
      if (list.length > 0 && !list.some((v) => same(v, values[key]))) values[key] = list[0]
    }
    const lock = typeof rule.lock === "function" ? rule.lock({ ...selection, values }) : (rule.lock ?? {})
    for (const [key, value] of Object.entries(lock)) {
      values[key] = value
      locked[key] = { value, reason: rule.reason }
    }
    for (const key of rule.hide ?? []) hidden[key] = rule.reason
    if (rule.warn) warnings.push(rule.warn)
  }
  return { values, locked, narrowed, hidden, warnings }
}

/** The empty selection: nothing attached, nothing chosen. A starting point for tests and defaults. */
export const emptySelection = (values: Record<string, unknown> = {}): Selection => ({
  values,
  inputs: { start: false, end: false, images: 0, videos: 0, audios: 0, sourceVideo: false, sourceAudio: false },
})

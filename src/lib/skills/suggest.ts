import type { SkillView } from "./store"

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Offers a skill that fits what is being typed, without any model call: it counts how many of a skill's trigger
 * words appear as whole words in the text. Nothing is applied until the user accepts the suggestion.
 */
export function suggestSkill(text: string, choices: SkillView[], chosen: string[]): SkillView | undefined {
  const lower = text.toLowerCase()
  if (lower.trim().split(/\s+/).length < 3) return undefined
  let best: { skill: SkillView; score: number } | undefined
  for (const skill of choices) {
    if (chosen.includes(skill.id)) continue
    const score = (skill.triggers ?? []).filter((t) => new RegExp(`(^|[^a-z])${escape(t.toLowerCase())}([^a-z]|$)`).test(lower)).length
    if (score > 0 && (!best || score > best.score)) best = { skill, score }
  }
  return best?.skill
}

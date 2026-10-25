import { isEditable } from "@/components/composer/schema-form"
import type { ParamSchema } from "@/lib/registry/types"

/**
 * Which of a model's settings an app shows, and where. The common ones (a choice, a switch, a number with a range:
 * aspect ratio, count, length, quality) are listed; the rest wait behind "More". An app's author may name the ones to show.
 * Settings an input already controls, and the model's picture and file slots, are never listed.
 */
export function settingKeys(schema: ParamSchema, userSettings: string[] | undefined, controlled: string[]): { main: string[]; more: string[] } {
  const all = Object.entries(schema.properties)
    .filter(([k, p]) => isEditable(p) && !p.format && !p.rejected && !controlled.includes(k))
    .map(([k]) => k)
  if (userSettings && userSettings.length > 0) return { main: userSettings.filter((k) => all.includes(k)), more: [] }
  const main = all.filter((k) => {
    const p = schema.properties[k]!
    if (p.tier === "advanced" || p.tier === "technical") return false
    return Boolean(p.enum?.length) || p.type === "boolean" || (p.minimum !== undefined && p.maximum !== undefined)
  })
  return { main, more: all.filter((k) => !main.includes(k)) }
}

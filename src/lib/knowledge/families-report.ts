import type { KnowledgePack } from "./schema"
import { GRID_PROVIDERS } from "./grid"

/**
 * The families table for the build report and the owner: per category, each maker family with its versions (newest first) and which of
 * fal, Replicate and OpenRouter run each one, marked closed or open.
 */
export function familiesTable(pack: KnowledgePack): string[] {
  const out: string[] = []
  const makerName = new Map(pack.makers.map((m) => [m.id, m.name]))
  for (const category of ["image", "video", "audio", "text", "embedding"] as const) {
    const models = pack.models.filter((m) => m.category === category && m.family && m.tasks.length > 0)
    if (models.length === 0) continue
    out.push(`### ${category.charAt(0).toUpperCase()}${category.slice(1)}`, "", `| Maker | Model | Type | ${GRID_PROVIDERS.join(" | ")} |`, `|---|---|---|${GRID_PROVIDERS.map(() => "---").join("|")}|`)
    const families = [...new Set(models.map((m) => `${m.makerId}|${m.family}`))]
    for (const fam of families) {
      for (const m of models.filter((x) => `${x.makerId}|${x.family}` === fam)) {
        const cells = GRID_PROVIDERS.map((p) => (m.lines.some((l) => l.provider === p) ? "✓" : "✗"))
        out.push(`| ${makerName.get(m.makerId) ?? m.makerId} | ${m.name} | ${m.weights ?? "?"} | ${cells.join(" | ")} |`)
      }
    }
    out.push("")
  }
  return out
}

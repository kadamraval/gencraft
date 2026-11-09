import type { KnowledgePack, Provider } from "./schema"
import { tasksAndTools } from "./schema"

/**
 * The grid the database fills (docs/terms.md): for every task and tool, on each of fal, Replicate and OpenRouter, at least one model, the
 * latest from a popular maker: a closed one and an open one when both exist. A cell no real model fills gets an alternative (a model that
 * does it by being told to). OpenAI and Gemini serve their own models and are outside the grid.
 */
export const GRID_PROVIDERS: Provider[] = ["fal", "replicate", "openrouter"]

export interface GridCell {
  closed?: string
  open?: string
  /** A model no source says is open or closed */
  other?: string
  alternatives: string[]
}

export function gridOf(pack: KnowledgePack): Map<string, Map<Provider, GridCell>> {
  const out = new Map<string, Map<Provider, GridCell>>()
  for (const entry of tasksAndTools(pack)) {
    const row = new Map<Provider, GridCell>()
    for (const p of GRID_PROVIDERS) {
      const cell: GridCell = { alternatives: [] }
      for (const m of pack.models) {
        for (const l of m.lines) {
          if (l.provider !== p || l.serves !== entry.id) continue
          if (l.role === "alternative") cell.alternatives.push(m.name)
          else if (m.weights === "closed" && !cell.closed) cell.closed = m.name
          else if (m.weights === "open" && !cell.open) cell.open = m.name
          else if (!m.weights && !cell.other) cell.other = m.name
        }
      }
      row.set(p, cell)
    }
    out.set(entry.id, row)
  }
  return out
}

/** Every empty cell: no model and no alternative */
export function emptyCells(pack: KnowledgePack): string[] {
  const out: string[] = []
  for (const [id, row] of gridOf(pack)) for (const [p, c] of row) if (!c.closed && !c.open && !c.other && c.alternatives.length === 0) out.push(`${id} on ${p}`)
  return out
}

/** The grid as a table for the build report: C = closed model, O = open model, M = weights not stated, A = alternatives, - = empty */
export function gridTable(pack: KnowledgePack): string[] {
  const rows = [...gridOf(pack)].map(([id, row]) => `| ${id} | ${GRID_PROVIDERS.map((p) => {
    const c = row.get(p)!
    const parts = [c.closed ? `C: ${c.closed}` : "", c.open ? `O: ${c.open}` : "", c.other ? `M: ${c.other}` : "", c.alternatives.length ? `A: ${c.alternatives.join(", ")}` : ""].filter(Boolean)
    return parts.join("<br>") || "-"
  }).join(" | ")} |`)
  return [`| task or tool | ${GRID_PROVIDERS.join(" | ")} |`, `|---|${GRID_PROVIDERS.map(() => "---").join("|")}|`, ...rows]
}

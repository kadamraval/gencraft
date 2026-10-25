import type { SheetModel } from "./types"

/**
 * The audit: where the sheet is weak, in plain lines. A model in this report is not guessed at; it is listed with what is missing.
 */

export interface Audit {
  models: number
  listings: number
  byType: Record<string, number>
  noListing: string[]
  notFound: string[]
  noPrice: string[]
  conflicts: string[]
  deprecated: string[]
}

export function auditSheet(sheet: SheetModel[]): Audit {
  const a: Audit = { models: sheet.length, listings: 0, byType: {}, noListing: [], notFound: [], noPrice: [], conflicts: [], deprecated: [] }
  for (const m of sheet) {
    a.byType[m.type] = (a.byType[m.type] ?? 0) + 1
    if (m.listings.length === 0) a.noListing.push(`${m.id}: no host and no LiteLLM entry`)
    for (const l of m.listings) {
      a.listings++
      const where = `${m.id} on ${l.host} ${l.endpoint}`
      if (l.seenBy.length === 0) a.notFound.push(`${where}: no source knows this endpoint`)
      if (!l.price.value) a.noPrice.push(where)
      if (l.status.value === "deprecated") a.deprecated.push(where)
      for (const c of l.category.conflicts ?? []) a.conflicts.push(`${where}: category is ${m.category}, ${c.source} says ${c.value}`)
      for (const c of l.price.conflicts ?? []) a.conflicts.push(`${where}: price is $${l.price.value?.amount} (${l.price.source}), ${c.source} says $${c.value.amount} ${c.value.unit.replace("per_", "per ")}`)
      for (const c of l.job.conflicts ?? []) a.conflicts.push(`${where}: job is ${m.job}, ${c.source} suggests ${c.value}`)
    }
  }
  return a
}

export function auditText(a: Audit, builtAt: string): string {
  const list = (title: string, rows: string[]) => (rows.length ? [`## ${title} (${rows.length})`, "", ...rows.map((r) => `- ${r}`), ""] : [`## ${title}: none`, ""])
  return [
    "# Model sheet audit",
    "",
    `Built ${builtAt}. ${a.models} models, ${a.listings} listings. By type: ${Object.entries(a.byType).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    "",
    ...list("No listing at all", a.noListing),
    ...list("Endpoint no source knows", a.notFound),
    ...list("Conflicts (a source contradicts the maker list)", a.conflicts),
    ...list("Listings with no price", a.noPrice),
    ...list("Deprecated on the host", a.deprecated),
  ].join("\n")
}

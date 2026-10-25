import type { DateRangeFilter, MediaActivityFilter, MediaStatusFilter } from "@/types"

/**
 * The filters in the header, written once and used by the Library and by Create's galleries, so every option does what it says.
 *
 *  - Date: a result's time comes from its id, which every result is given when it is made ("image-asset-1760000000000").
 *  - Activity: generated or uploaded (from where it came from), liked (the heart), downloaded (saved with Download).
 */

export interface Filterable {
  id: string
  title: string
  prompt?: string
  model?: string
  status?: "completed" | "generating" | "failed"
  type: string
  activity?: "generated" | "uploaded" | "liked" | "downloaded"
}

export interface Filters {
  search?: string
  type?: string
  model?: string
  status?: MediaStatusFilter
  hideFailed?: boolean
  activity?: MediaActivityFilter
  date?: DateRangeFilter
}

/** When a result was made, in milliseconds, read from its id; undefined when the id carries no time */
export function madeAtOf(id: string): number | undefined {
  const m = /(?:^|[^0-9])(1[5-9]\d{11})(?:[^0-9]|$)/.exec(id)
  return m ? Number(m[1]) : undefined
}

const DAY = 24 * 3600 * 1000

/** Whether a time is inside a range, counted back from now (today is since midnight) */
export function inDateRange(at: number | undefined, range: DateRangeFilter | undefined, now = Date.now()): boolean {
  if (!range || range === "all") return true
  // A result with no time in its id is kept: it cannot be told apart, so it is not hidden by a date it cannot be checked against
  if (at === undefined) return true
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  switch (range) {
    case "today":
      return at >= start.getTime()
    case "7days":
      return at >= now - 7 * DAY
    case "30days":
      return at >= now - 30 * DAY
    default:
      return true
  }
}

export function applyFilters<T extends Filterable>(items: T[], f: Filters, state: { liked: Set<string>; downloaded: Set<string> }, now = Date.now()): T[] {
  const q = f.search?.trim().toLowerCase()
  return items.filter((item) => {
    if (q && !(item.title.toLowerCase().includes(q) || (item.prompt ?? "").toLowerCase().includes(q) || (item.model ?? "").toLowerCase().includes(q))) return false
    if (f.type && f.type !== "all" && item.type !== f.type) return false
    if (f.model && f.model !== "all" && item.model && !item.model.toLowerCase().includes(f.model.toLowerCase())) return false
    if (f.status && f.status !== "all" && item.status && item.status !== f.status) return false
    if (f.hideFailed && item.status === "failed") return false
    if (f.activity && f.activity !== "all") {
      if (f.activity === "liked" && !state.liked.has(item.id)) return false
      if (f.activity === "downloaded" && !state.downloaded.has(item.id)) return false
      if ((f.activity === "generated" || f.activity === "uploaded") && item.activity && item.activity !== f.activity) return false
    }
    if (!inDateRange(madeAtOf(item.id), f.date, now)) return false
    return true
  })
}

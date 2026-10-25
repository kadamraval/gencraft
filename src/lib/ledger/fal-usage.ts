import { appFetch, isDesktopApp } from "@/lib/registry/net"
import type { UsageLedgerItem } from "./usage-store"
import { setCalibration } from "@/lib/registry/calibration"
import { usageLedger } from "./usage-store"

/**
 * fal does not say what a run cost in its answer, so a fal run starts as an estimate from the price list. fal's billing API
 * (GET https://api.fal.ai/v1/models/usage, with a key that has billing access) says what each endpoint was really billed, per day.
 * This matches that to the runs we made and corrects them, so the totals are fal's own.
 *
 *  - One run of an endpoint that day: its cost is fal's figure for that endpoint and day, and is marked exact.
 *  - Several runs of the same endpoint that day: fal's total is shared among them in proportion to their estimates, and is marked computed.
 *  - Nothing is changed when fal's figure is far from ours (a factor outside 0.25 to 4): the workspace may be used by something
 *    else too, and that usage is not ours.
 */

export interface FalLine {
  endpoint_id: string
  unit?: string
  quantity?: number
  unit_price?: number
  cost_total: number
  currency?: string
}
export interface FalBucket {
  /** ISO 8601 start of the bucket, in the requested time zone (UTC here) */
  bucket: string
  results: FalLine[]
}

export interface Correction {
  id: string
  costUsd: number
  basis: "exact" | "computed"
}

const isFalRun = (it: UsageLedgerItem) => it.provider === "fal" && it.category !== "text" && it.action === "Deducted" && Boolean(it.endpoint)

const day = (iso: string) => iso.slice(0, 10)
const dayOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const LOW = 0.25
const HIGH = 4

/** The corrections for runs whose cost is still an estimate, from fal's billing per endpoint and day. Pure: no network. */
export function reconcileFal(items: UsageLedgerItem[], buckets: FalBucket[]): Correction[] {
  const billed = new Map<string, number>()
  for (const b of buckets) {
    for (const line of b.results) {
      if (line.currency && line.currency !== "USD") continue
      const key = `${line.endpoint_id}|${day(b.bucket)}`
      billed.set(key, (billed.get(key) ?? 0) + line.cost_total)
    }
  }
  // Our fal media runs, grouped by endpoint and day. A group is looked at when it has a run that is still an estimate; fal's figure is
  // for the whole day, so every run of the group takes part, each by what it was estimated at (kept on the entry once corrected).
  const groups = new Map<string, UsageLedgerItem[]>()
  for (const it of items) {
    if (!isFalRun(it)) continue
    const key = `${it.endpoint}|${dayOfMs(it.timestamp)}`
    groups.set(key, [...(groups.get(key) ?? []), it])
  }
  const out: Correction[] = []
  for (const [key, runs] of groups) {
    if (!runs.some((r) => r.basis === "estimated")) continue
    const total = billed.get(key)
    if (total === undefined) continue
    const weight = (r: UsageLedgerItem) => r.estimateUsd ?? r.costUsd
    const ours = runs.reduce((n, r) => n + weight(r), 0)
    if (ours <= 0 || total / ours < LOW || total / ours > HIGH) continue
    for (const r of runs) {
      const share = runs.length === 1 ? total : (total * weight(r)) / ours
      out.push({ id: r.id, costUsd: Math.round(share * 1_000_000) / 1_000_000, basis: runs.length === 1 ? "exact" : "computed" })
    }
  }
  return out
}

/**
 * What fal's bills have come to against the price list, for one endpoint: the middle of the ratios of the runs fal has billed (the bill
 * over the price list's own estimate, with any earlier correction taken out). Needs three billed runs, ignores a ratio within 3% of 1, and
 * is kept between half and double so one odd day cannot swing it.
 */
export function learnedRatio(items: UsageLedgerItem[], endpoint: string): number | null {
  const ratios = items
    .filter((i) => isFalRun(i) && i.endpoint === endpoint && (i.basis === "exact" || i.basis === "computed") && i.estimateUsd && i.estimateUsd > 0)
    .map((i) => i.costUsd / (i.estimateUsd! / (i.factor ?? 1)))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b)
  if (ratios.length < 3) return null
  const mid = ratios.length % 2 === 1 ? ratios[(ratios.length - 1) / 2]! : (ratios[ratios.length / 2 - 1]! + ratios[ratios.length / 2]!) / 2
  if (Math.abs(mid - 1) < 0.03) return null
  return Math.min(2, Math.max(0.5, mid))
}

// Prices are asked for many times a second by the screens; the ratio is worked out once per endpoint until the ledger changes
const learned = new Map<string, number | null>()
usageLedger.subscribe(() => learned.clear())
setCalibration((rec) => {
  if (rec.provider !== "fal") return null
  if (!learned.has(rec.endpoint)) learned.set(rec.endpoint, learnedRatio(usageLedger.getAllItems(), rec.endpoint))
  return learned.get(rec.endpoint) ?? null
})

export type FalAccess = "ok" | "denied" | "unknown"
let access: FalAccess = "unknown"
/** Whether the fal key may read billing, as far as the last check could tell */
export const falBillingAccess = (): FalAccess => access

/** fal's usage by endpoint and day since a date. A key without billing access gives "denied". */
export async function fetchFalUsage(apiKey: string, sinceMs: number, fetcher: typeof fetch = isDesktopApp() ? (appFetch as typeof fetch) : fetch): Promise<FalBucket[] | null> {
  const out: FalBucket[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ start: new Date(sinceMs).toISOString(), timeframe: "day", expand: "time_series", timezone: "UTC", limit: "200" })
    if (cursor) q.set("cursor", cursor)
    let res: Response
    try {
      res = await fetcher(`https://api.fal.ai/v1/models/usage?${q}`, { headers: { Authorization: `Key ${apiKey.trim()}` } })
    } catch {
      return null
    }
    if (res.status === 401 || res.status === 403) {
      access = "denied"
      return null
    }
    if (!res.ok) return null
    const json = (await res.json()) as { time_series?: FalBucket[]; next_cursor?: string | null }
    out.push(...(json.time_series ?? []))
    cursor = json.next_cursor ?? null
    if (!cursor) break
  }
  access = "ok"
  return out
}

let lastRun = 0
/** Corrects the estimated fal runs from fal's billing. Quiet when there is no key, no access or nothing to correct. At most once in ten minutes. */
export async function reconcileFalUsage(apiKey: string | undefined, now = Date.now(), force = false): Promise<number> {
  if (!apiKey || (!force && now - lastRun < 10 * 60 * 1000)) return 0
  const pending = usageLedger.getAllItems().filter((i) => isFalRun(i) && i.basis === "estimated")
  if (pending.length === 0) return 0
  lastRun = now
  const since = Math.min(...pending.map((i) => i.timestamp)) - 24 * 3600 * 1000
  const buckets = await fetchFalUsage(apiKey, since)
  if (!buckets) return 0
  const fixes = reconcileFal(usageLedger.getAllItems(), buckets)
  usageLedger.applyCorrections(fixes)
  return fixes.length
}

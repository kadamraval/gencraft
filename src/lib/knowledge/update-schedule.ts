/**
 * When the person wants model information refreshed: never on its own, only when they click, or every day, week or month. One choice covers
 * the standard model database and each provider's own model list. It is kept on this device.
 */

export type UpdateFrequency = "click" | "daily" | "weekly" | "monthly"

export const FREQUENCIES: Array<{ value: UpdateFrequency; label: string }> = [
  { value: "click", label: "Only when I click" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
]

const KEY = "gencraft_model_updates_v1"
const DAY_MS = 24 * 3600 * 1000

interface Stored {
  frequency: UpdateFrequency
  /** When something was last read, and what came of it */
  lastRun?: number
  lastNote?: string
}

const DEFAULT: Stored = { frequency: "daily" }
const listeners = new Set<() => void>()
let cached: Stored | undefined

function read(): Stored {
  if (cached) return cached
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Stored> | null
    cached = { ...DEFAULT, ...(raw && FREQUENCIES.some((f) => f.value === raw.frequency) ? raw : {}) }
  } catch {
    cached = { ...DEFAULT }
  }
  return cached
}

function write(next: Stored) {
  cached = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // the choice lasts until the app closes
  }
  listeners.forEach((l) => l())
}

export const getUpdateFrequency = (): UpdateFrequency => read().frequency
export const getLastUpdate = (): { at?: number; note?: string } => ({ at: read().lastRun, note: read().lastNote })
export const setUpdateFrequency = (frequency: UpdateFrequency) => write({ ...read(), frequency })
export const recordUpdate = (note: string, at = Date.now()) => write({ ...read(), lastRun: at, lastNote: note })

/** How long after a read the next one is due, or undefined when the person only updates by hand */
export function intervalOf(frequency: UpdateFrequency): number | undefined {
  return frequency === "daily" ? DAY_MS : frequency === "weekly" ? 7 * DAY_MS : frequency === "monthly" ? 30 * DAY_MS : undefined
}

/** Whether an automatic read is due now, given when the last one was */
export function isUpdateDue(last: number | undefined, now = Date.now(), frequency: UpdateFrequency = getUpdateFrequency()): boolean {
  const every = intervalOf(frequency)
  if (every === undefined) return false
  return last === undefined || now - last >= every
}

export function subscribeUpdateSchedule(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

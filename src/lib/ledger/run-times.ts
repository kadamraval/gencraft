/**
 * How long runs really took on this machine, per model, so the next run can say "about 25 s".
 * Providers publish no estimate, so nothing is shown until a model has been used once.
 */
const KEY = "gencraft_run_times_v1"
const KEEP = 8

type Store = Record<string, number[]>

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store
  } catch {
    return {}
  }
}

export function recordRunTime(modelId: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return
  const all = read()
  all[modelId] = [...(all[modelId] ?? []), Math.round(seconds * 10) / 10].slice(-KEEP)
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage unavailable: the estimate simply does not improve
  }
}

/** The middle of the recent runs, with how many runs it rests on. */
export function expectedRun(modelId: string): { seconds: number; runs: number } | undefined {
  const runs = read()[modelId]
  if (!runs || runs.length === 0) return undefined
  const sorted = [...runs].sort((a, b) => a - b)
  return { seconds: sorted[Math.floor(sorted.length / 2)]!, runs: runs.length }
}

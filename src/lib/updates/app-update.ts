import { isUpdateDue } from "../knowledge/update-schedule"

/**
 * Updates of the app itself (the desktop app only; the browser copy always runs the newest page). The update files are published by the release
 * workflow and signed; the desktop app checks the signature before it installs anything. How often to look follows the person's own choice for
 * model updates, and "Check now" always works.
 */

const KEY = "gencraft_app_update_v1"

export interface AppUpdateState {
  /** When the app last looked */
  checkedAt?: number
  /** The newer version found, if any */
  version?: string
  notes?: string
}

type Listener = () => void
const listeners = new Set<Listener>()
let pending: { downloadAndInstall: (onEvent?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> } | null = null

export const isDesktopApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export function getAppUpdateState(): AppUpdateState {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as AppUpdateState
  } catch {
    return {}
  }
}

function save(state: AppUpdateState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // remembered until the app closes
  }
  listeners.forEach((l) => l())
}

export function subscribeAppUpdate(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Looks for a newer version. Returns its number, or null when this one is the newest. Throws a readable message when the check could not be made. */
export async function checkAppUpdate(): Promise<string | null> {
  if (!isDesktopApp()) throw new Error("Updates are for the desktop app. This page is always the newest.")
  const { check } = await import("@tauri-apps/plugin-updater")
  const update = await check()
  pending = update
  save({ checkedAt: Date.now(), version: update?.version, notes: update?.body ?? undefined })
  return update?.version ?? null
}

/** Downloads the newer version, installs it and restarts the app */
export async function installAppUpdate(): Promise<void> {
  if (!pending) {
    await checkAppUpdate()
    if (!pending) return
  }
  await pending.downloadAndInstall()
  const { relaunch } = await import("@tauri-apps/plugin-process")
  await relaunch()
}

/** Looks at start-up when the person's schedule says it is due, then every few hours while the app is open */
export function startAppUpdateScheduler(frequencyDue: (last: number | undefined) => boolean = isUpdateDue): () => void {
  if (!isDesktopApp()) return () => undefined
  const tick = () => {
    if (frequencyDue(getAppUpdateState().checkedAt)) void checkAppUpdate().catch(() => undefined)
  }
  tick()
  const timer = window.setInterval(tick, 6 * 3600 * 1000)
  return () => window.clearInterval(timer)
}

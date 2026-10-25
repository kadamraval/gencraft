import * as React from "react"
import { saveBlobToCloud } from "@/lib/integrations/cloud-sync"
import { appFetch } from "@/lib/registry/net"
import { createBackup } from "./backup"
import { onItemAddedToFolder } from "@/lib/library/folders-store"
import { listResults } from "@/lib/library/results-store"
import { currentFolder, writeToFolder } from "./folder"

/**
 * Backups on demand and on a schedule, and copies of new results into the chosen folder. A backup goes to the
 * chosen folder, or to a Google Drive or Dropbox folder through the connection made in Integrations.
 */

export type BackupDestination = "folder" | "googledrive" | "dropbox"
export type BackupSchedule = "off" | "daily" | "weekly"

export interface BackupState {
  destination: BackupDestination
  schedule: BackupSchedule
  /** Also copy every new result into the chosen folder */
  saveResults: boolean
  lastAt?: number
  lastName?: string
  lastError?: string
  running: boolean
}

const KEY = "gencraft_backup_v1"
const INTERVAL: Record<Exclude<BackupSchedule, "off">, number> = { daily: 24 * 3600 * 1000, weekly: 7 * 24 * 3600 * 1000 }

function read(): BackupState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<BackupState> | null
    return { destination: "folder", schedule: "off", saveResults: false, ...(raw ?? {}), running: false }
  } catch {
    return { destination: "folder", schedule: "off", saveResults: false, running: false }
  }
}

let state: BackupState = read()
const listeners = new Set<() => void>()

export function setBackupState(patch: Partial<BackupState>) {
  state = { ...state, ...patch }
  try {
    const { running, ...kept } = state
    void running
    localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // storage unavailable: the choice lasts until the app closes
  }
  listeners.forEach((l) => l())
}

export function useBackupState(): BackupState {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Makes a backup now and puts it where the person chose. `scheduled` runs never open a download. */
export async function runBackup(composioKey: string, scheduled = false): Promise<void> {
  if (state.running) return
  setBackupState({ running: true, lastError: undefined })
  try {
    const { blob, name } = await createBackup()
    if (state.destination === "folder") {
      if (await currentFolder()) await writeToFolder(name, blob, "Backups")
      else if (scheduled) throw new Error("No folder is chosen for backups.")
      else download(blob, name)
    } else {
      if (!composioKey) throw new Error("Add your Composio key in Settings, Integrations first.")
      await saveBlobToCloud(composioKey, state.destination, name, blob, "Gencraft Backups")
    }
    setBackupState({ running: false, lastAt: Date.now(), lastName: name })
  } catch (e) {
    setBackupState({ running: false, lastError: e instanceof Error ? e.message : String(e) })
  }
}

export function backupDue(now = Date.now()): boolean {
  if (state.schedule === "off") return false
  return !state.lastAt || now - state.lastAt >= INTERVAL[state.schedule]
}

/** Checks once a few seconds after launch and then every hour while the app is open. */
export function startBackupScheduler(getKey: () => string): () => void {
  const check = () => {
    if (backupDue()) void runBackup(getKey(), true)
  }
  const first = window.setTimeout(check, 20000)
  const id = window.setInterval(check, 3600 * 1000)
  return () => {
    window.clearTimeout(first)
    window.clearInterval(id)
  }
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/wav": "wav" }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "result"

/** Project names by id, kept up to date by the app so a result can be filed under its project. */
let projectNames: Record<string, string> = {}
export function setProjectNames(projects: Array<{ id: string; title: string }>) {
  projectNames = Object.fromEntries(projects.map((p) => [p.id, p.title]))
}
const projectOf = (projectId?: string) => (projectId && projectNames[projectId]) || "No project"

export interface SavedAsset {
  id: string
  title: string
  url: string
  projectId?: string
}

async function copyAsset(a: SavedAsset, ...path: string[]): Promise<void> {
  const res = await (/^https?:/i.test(a.url) ? appFetch(a.url) : fetch(a.url))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const ext = EXT[blob.type] ?? (blob.type.split("/")[1] || "bin")
  await writeToFolder(`${slug(a.title)}-${a.id.replace(/[^a-z0-9]+/gi, "").slice(-8)}.${ext}`, blob, ...path)
}

const copying = async () => state.saveResults && Boolean(await currentFolder())

/**
 * Copies new results into the save folder, in a folder named after their project, when that is switched on.
 * A failure is shown in Settings.
 */
export async function saveResultsToFolder(assets: SavedAsset[]): Promise<void> {
  if (!(await copying())) return
  for (const a of assets) {
    try {
      await copyAsset(a, projectOf(a.projectId))
      if (state.lastError?.startsWith("Results:")) setBackupState({ lastError: undefined })
    } catch (e) {
      setBackupState({ lastError: `Results: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
}

/**
 * A result put into a Library folder is also copied to a folder of that name inside its project's folder.
 * Returns the function that stops listening.
 */
export function startFolderMirror(): () => void {
  return onItemAddedToFolder((folder, itemId) => {
    void (async () => {
      if (!(await copying())) return
      const asset = (await listResults()).find((r) => r.id === itemId)
      if (!asset?.url || asset.status !== "completed") return
      try {
        await copyAsset(asset, projectOf(asset.projectId), folder.title)
      } catch (e) {
        setBackupState({ lastError: `Results: ${e instanceof Error ? e.message : String(e)}` })
      }
    })()
  })
}

import { assertCanAdd } from "@/lib/license"
import * as React from "react"

/**
 * Library folders. "Default" always exists and holds everything that was made or uploaded; folders the user
 * creates hold the items they were added to. An item can be in several folders. Deleting a folder never
 * deletes its items, which stay in Default.
 */

export const DEFAULT_FOLDER_ID = "default"

export interface Folder {
  id: string
  title: string
  createdAt: number
}

interface State {
  folders: Folder[]
  /** folder id -> ids of the items added to it */
  members: Record<string, string[]>
}

const KEY = "gencraft_folders_v1"

function read(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null
    if (raw && Array.isArray(raw.folders)) return { folders: raw.folders, members: raw.members ?? {} }
  } catch {
    // unreadable: start clean
  }
  return { folders: [], members: {} }
}

let state: State = read()
let version = 0
const listeners = new Set<() => void>()

function commit(next: State) {
  state = next
  version++
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable: folders last for this session
  }
  listeners.forEach((l) => l())
}

export function createFolder(title: string): Folder {
  assertCanAdd("folders", state.folders.length)
  const folder: Folder = { id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: title.trim() || "Untitled", createdAt: Date.now() }
  commit({ ...state, folders: [...state.folders, folder] })
  return folder
}

export function renameFolder(id: string, title: string) {
  commit({ ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, title: title.trim() || f.title } : f)) })
}

export function deleteFolder(id: string) {
  const members = { ...state.members }
  delete members[id]
  commit({ folders: state.folders.filter((f) => f.id !== id), members })
}

const addedListeners = new Set<(folder: Folder, itemId: string) => void>()

/** Told when an item is put into a folder (not when it is taken out). Used to mirror it into the save folder. */
export function onItemAddedToFolder(listener: (folder: Folder, itemId: string) => void): () => void {
  addedListeners.add(listener)
  return () => addedListeners.delete(listener)
}

export function setItemInFolder(folderId: string, itemId: string, inside: boolean) {
  if (folderId === DEFAULT_FOLDER_ID) return
  const current = state.members[folderId] ?? []
  const was = current.includes(itemId)
  const next = inside ? [...new Set([...current, itemId])] : current.filter((i) => i !== itemId)
  commit({ ...state, members: { ...state.members, [folderId]: next } })
  const folder = state.folders.find((f) => f.id === folderId)
  if (inside && !was && folder) addedListeners.forEach((l) => l(folder, itemId))
}

/** Removes deleted items from every folder. */
export function forgetItems(ids: string[]) {
  const gone = new Set(ids)
  const members = Object.fromEntries(Object.entries(state.members).map(([f, items]) => [f, items.filter((i) => !gone.has(i))]))
  commit({ ...state, members })
}

export function useFolders(): { folders: Folder[]; members: Record<string, string[]> } {
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    const l = () => tick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => state, [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The items a folder shows: everything for Default, otherwise only what was added. */
export function itemsInFolder<T extends { id: string }>(folderId: string, items: T[], members: Record<string, string[]>): T[] {
  if (folderId === DEFAULT_FOLDER_ID) return items
  const ids = new Set(members[folderId] ?? [])
  return items.filter((i) => ids.has(i.id))
}

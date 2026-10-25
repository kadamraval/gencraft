import { isDesktopApp } from "@/lib/registry/net"

/**
 * A folder on this computer that the app may write into: for backups and for copies of new results.
 * The desktop app starts with Documents/Gencraft and the person can change it with the system's folder dialog.
 * A browser (development) has no default: it needs the browser's folder picker and keeps the permission given.
 */

export interface FolderChoice {
  /** What to show: the folder's path, or its name in a browser */
  label: string
  kind: "path" | "handle"
  /** The folder the app starts with, not one the person chose */
  isDefault: boolean
}

const PATH_KEY = "gencraft_save_folder_v1"
const DEFAULT_NAME = "Gencraft"
const DB_NAME = "gencraft-folder"
const STORE = "handles"

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>
  requestPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putHandle(handle: DirHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(handle, "folder")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getHandle(): Promise<DirHandle | undefined> {
  try {
    const db = await openDb()
    return await new Promise<DirHandle | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get("folder")
      req.onsuccess = () => resolve(req.result as DirHandle | undefined)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

const storedPath = (): string | null => {
  try {
    return localStorage.getItem(PATH_KEY)
  } catch {
    return null
  }
}

/** Documents/Gencraft, the desktop app's folder until the person picks another. */
async function defaultPath(): Promise<string | null> {
  if (!isDesktopApp()) return null
  try {
    const { documentDir, join } = await import("@tauri-apps/api/path")
    return await join(await documentDir(), DEFAULT_NAME)
  } catch {
    return null
  }
}

export function canChooseFolder(): boolean {
  return isDesktopApp() || (typeof window !== "undefined" && "showDirectoryPicker" in window)
}

/** The folder in use: the one chosen, or the desktop app's default. Null when a browser has none yet. */
export async function currentFolder(): Promise<FolderChoice | null> {
  const path = storedPath()
  if (path) return { label: path, kind: "path", isDefault: false }
  const handle = await getHandle()
  if (handle) return { label: handle.name, kind: "handle", isDefault: false }
  const fallback = await defaultPath()
  return fallback ? { label: fallback, kind: "path", isDefault: true } : null
}

/**
 * What Settings shows for the save folder. Always something: the folder in use, or the default. A browser's
 * default is its Downloads folder, where a backup lands as a download; it cannot copy results there by itself,
 * so `writable` is false until a folder is chosen.
 */
export async function shownFolder(): Promise<{ label: string; isDefault: boolean; writable: boolean }> {
  const folder = await currentFolder()
  if (folder) return { label: folder.label, isDefault: folder.isDefault, writable: true }
  return { label: "Your browser's Downloads folder", isDefault: true, writable: false }
}

/** Opens the system's folder dialog. Returns null when the person cancels. */
export async function chooseFolder(): Promise<FolderChoice | null> {
  if (isDesktopApp()) {
    const { open } = await import("@tauri-apps/plugin-dialog")
    // recursive: the app also writes into folders it makes inside the chosen one
    const picked = await open({ directory: true, multiple: false, recursive: true, title: "Choose a folder" })
    if (typeof picked !== "string") return null
    localStorage.setItem(PATH_KEY, picked)
    return { label: picked, kind: "path", isDefault: false }
  }
  const picker = (window as unknown as { showDirectoryPicker?: (o: { mode: "readwrite" }) => Promise<DirHandle> }).showDirectoryPicker
  if (!picker) return null
  try {
    const handle = await picker.call(window, { mode: "readwrite" })
    await putHandle(handle)
    localStorage.removeItem(PATH_KEY)
    return { label: handle.name, kind: "handle", isDefault: false }
  } catch {
    return null
  }
}

/** Goes back to the default folder (the desktop app) or to no folder (a browser). */
export async function forgetFolder(): Promise<void> {
  try {
    localStorage.removeItem(PATH_KEY)
  } catch {
    // nothing stored
  }
  try {
    const db = await openDb()
    db.transaction(STORE, "readwrite").objectStore(STORE).delete("folder")
  } catch {
    // nothing stored
  }
}

/** A name safe to use as a file or folder name on Windows, macOS and Linux. */
export function safeName(name: string, fallback = "Untitled"): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 60)
    .trim()
  return cleaned || fallback
}

/**
 * Writes a file into the folder in use, inside the sub-folders named in `path` (made when missing). Throws a
 * plain message when it cannot, for example when the folder is gone or a browser needs the permission again.
 */
export async function writeToFolder(name: string, data: Blob, ...path: string[]): Promise<void> {
  const bytes = new Uint8Array(await data.arrayBuffer())
  const sub = path.map((p) => safeName(p))
  const root = storedPath() ?? (await getHandle().then((h) => (h ? null : defaultPath())))
  if (root && isDesktopApp()) {
    const { mkdir, writeFile, exists } = await import("@tauri-apps/plugin-fs")
    const { join } = await import("@tauri-apps/api/path")
    // join keeps the system's own separators, which the folder permission is matched against
    const dir = await join(root, ...sub)
    if (!(await exists(dir))) await mkdir(dir, { recursive: true })
    await writeFile(await join(dir, name), bytes)
    return
  }
  const handle = await getHandle()
  if (!handle) throw new Error("No folder is chosen. Choose one in Settings, General, Backup.")
  if (handle.queryPermission && (await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
    if (!handle.requestPermission || (await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("The browser needs permission for the folder again. Choose it once more in Settings, General, Backup.")
  }
  let dir: FileSystemDirectoryHandle = handle
  for (const part of sub) dir = await dir.getDirectoryHandle(part, { create: true })
  const file = await dir.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(bytes)
  await writable.close()
}

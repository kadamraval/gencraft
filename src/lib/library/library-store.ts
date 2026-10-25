import * as React from "react"
import { findDuplicate, fingerprint } from "./fingerprint"
import type { Duplicate, KnownFile, Print } from "./fingerprint"

/**
 * The user's own files and favourites, kept on this machine.
 * Uploads are real files, so they go in IndexedDB (localStorage cannot hold video). Likes are a small set of ids.
 */

export interface UploadRecord {
  id: string
  projectId: string
  title: string
  type: "image" | "video" | "audio"
  blob: Blob
  createdAt: number
  /** SHA-256 of the bytes, and how the picture looks: for telling a file you already have */
  hash?: string
  look?: string
}

export interface UploadItem {
  id: string
  projectId: string
  title: string
  type: "image" | "video" | "audio"
  /** Object URL for this session */
  url: string
  createdAt: number
}

const DB_NAME = "gencraft-library"
const STORE = "uploads"
const LIKES_KEY = "gencraft_liked_ids"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

const urlCache = new Map<string, string>()
const toItem = (r: UploadRecord): UploadItem => {
  let url = urlCache.get(r.id)
  if (!url) {
    url = URL.createObjectURL(r.blob)
    urlCache.set(r.id, url)
  }
  return { id: r.id, projectId: r.projectId, title: r.title, type: r.type, url, createdAt: r.createdAt }
}

export async function listUploads(): Promise<UploadItem[]> {
  try {
    const rows = await tx<UploadRecord[]>("readonly", (s) => s.getAll())
    return rows.map(toItem).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

/** An upload, and, when it is one you already have, which one and how: the same file, the same name and size, or a look-alike picture */
export type UploadResult = UploadItem & { duplicate?: { kind: Duplicate["kind"]; of: UploadItem } }

async function allRecords(): Promise<UploadRecord[]> {
  try {
    return await tx<UploadRecord[]>("readonly", (s) => s.getAll())
  } catch {
    return []
  }
}

/**
 * Saves a file. A file that is exactly one you already have in the project is not saved again: the one you have is returned (with
 * duplicate set to "same"). A file with the same name and size, or a picture that looks like one you have, is saved and says so.
 */
export async function addUpload(file: File, projectId: string, keep?: { id: string; title: string; createdAt: number }): Promise<UploadResult> {
  const type: UploadRecord["type"] = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image"
  const title = keep?.title ?? file.name.replace(/\.[^/.]+$/, "")
  let print: Print | null = null
  let duplicate: UploadResult["duplicate"]
  // A file being restored from a backup is put back as it was
  if (!keep) {
    print = await fingerprint(file).catch(() => null)
    if (print) {
      const rows = await allRecords()
      const known: KnownFile[] = []
      for (const r of rows) {
        let { hash, look } = r
        // Files saved before duplicates were checked get their fingerprint now, once
        if (!hash && r.projectId === projectId && r.type === type && known.length < 400) {
          const p = await fingerprint(r.blob).catch(() => null)
          if (p) {
            hash = p.hash
            look = p.look
            void tx("readwrite", (s) => s.put({ ...r, hash, look })).catch(() => undefined)
          }
        }
        known.push({ id: r.id, projectId: r.projectId, title: r.title, type: r.type, bytes: r.blob.size, hash, look })
      }
      const found = findDuplicate({ projectId, title, type, print }, known)
      const row = found ? rows.find((r) => r.id === found.of) : undefined
      if (found && row) {
        if (found.kind === "same") return { ...toItem(row), duplicate: { kind: "same", of: toItem(row) } }
        duplicate = { kind: found.kind, of: toItem(row) }
      }
    }
  }
  const record: UploadRecord = {
    id: keep?.id ?? `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    title,
    type,
    blob: file,
    createdAt: keep?.createdAt ?? Date.now(),
    ...(print ? { hash: print.hash, look: print.look } : {}),
  }
  try {
    await tx("readwrite", (s) => s.put(record))
  } catch {
    // storage refused (private window or quota): the upload still works for this session
  }
  emit()
  return { ...toItem(record), duplicate }
}

export async function removeUpload(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id))
  } catch {
    // nothing stored, nothing to remove
  }
  const url = urlCache.get(id)
  if (url) URL.revokeObjectURL(url)
  urlCache.delete(id)
  emit()
}

/** How many bytes the uploaded files take on this device. */
export async function uploadedBytes(): Promise<number> {
  try {
    const db = await open()
    return await new Promise<number>((resolve) => {
      let total = 0
      const request = db.transaction(STORE, "readonly").objectStore(STORE).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(total)
        total += (cursor.value as UploadRecord).blob.size
        cursor.continue()
      }
      request.onerror = () => resolve(total)
    })
  } catch {
    return 0
  }
}

export function onUploadsChanged(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useUploads(): UploadItem[] {
  const [items, setItems] = React.useState<UploadItem[]>([])
  React.useEffect(() => {
    let alive = true
    const load = () => void listUploads().then((rows) => alive && setItems(rows))
    load()
    listeners.add(load)
    return () => {
      alive = false
      listeners.delete(load)
    }
  }, [])
  return items
}

// Likes

function readLikes(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKES_KEY) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}

let likes = readLikes()

export function isLiked(id: string): boolean {
  return likes.has(id)
}

export function toggleLike(id: string) {
  likes = new Set(likes)
  if (likes.has(id)) likes.delete(id)
  else likes.add(id)
  try {
    localStorage.setItem(LIKES_KEY, JSON.stringify([...likes]))
  } catch {
    // storage unavailable: likes last for this session
  }
  emit()
}

// Downloads

const DOWNLOADS_KEY = "gencraft_downloaded_ids"
function readDownloads(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DOWNLOADS_KEY) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}
let downloaded = readDownloads()

/** Remembers that a result was downloaded, for the Downloaded filter */
export function markDownloaded(id: string) {
  if (downloaded.has(id)) return
  downloaded = new Set(downloaded).add(id)
  try {
    localStorage.setItem(DOWNLOADS_KEY, JSON.stringify([...downloaded].slice(-2000)))
  } catch {
    // storage unavailable: it lasts for this session
  }
  emit()
}

export function useDownloaded(): Set<string> {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => downloaded, [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useLikes(): Set<string> {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => likes, [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

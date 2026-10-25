import type { MediaAsset } from "@/types"
import { appFetch } from "@/lib/registry/net"

/**
 * Everything the studio generates is kept on this device.
 *
 * Providers hand back links that can expire, so each result is downloaded the moment it finishes and stored
 * as a file in IndexedDB with what made it (prompt, model, settings). The Library and chat history read from
 * here, so nothing disappears when the app restarts or a link dies. If a download is refused, the link is kept
 * and the item is marked as not saved on this device.
 */

const DB_NAME = "gencraft-results"
const STORE = "results"

export interface ResultRecord {
  asset: Omit<MediaAsset, "url" | "thumbnailUrl">
  blob?: Blob
  thumbnail?: Blob
  /** Set when the file could not be downloaded: the provider link, which may expire */
  remoteUrl?: string
  savedAt: number
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "asset.id" })
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

// Object addresses made for this session, and which provider address each came from
const objectUrls = new Map<string, string>()
const idByUrl = new Map<string, string>()

const urlFor = (id: string, blob: Blob): string => {
  let u = objectUrls.get(id)
  if (!u) {
    u = URL.createObjectURL(blob)
    objectUrls.set(id, u)
  }
  return u
}

async function download(url: string): Promise<Blob | null> {
  try {
    const res = url.startsWith("data:") || url.startsWith("blob:") ? await fetch(url) : await appFetch(url)
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

/** Downloads one result and stores it. Safe to call again for the same asset. */
export async function saveResult(asset: MediaAsset): Promise<void> {
  const { url, thumbnailUrl, ...meta } = asset
  if (asset.status === "failed") {
    // A failed run has no file, but it is kept so it can be seen, read about and tried again
    try {
      await tx("readwrite", (s) => s.put({ asset: meta, savedAt: Date.now() } satisfies ResultRecord))
      emit()
    } catch {
      // storage refused
    }
    return
  }
  if (!asset.url) return
  const blob = await download(url)
  const thumbnail = thumbnailUrl && thumbnailUrl !== url && asset.type === "video" ? await download(thumbnailUrl) : null
  const record: ResultRecord = { asset: meta, blob: blob ?? undefined, thumbnail: thumbnail ?? undefined, remoteUrl: blob ? undefined : url, savedAt: Date.now() }
  try {
    await tx("readwrite", (s) => s.put(record))
  } catch {
    return
  }
  idByUrl.set(url, asset.id)
  if (blob) idByUrl.set(urlFor(asset.id, blob), asset.id)
  emit()
}

function toAsset(r: ResultRecord): MediaAsset {
  const url = r.blob ? urlFor(r.asset.id, r.blob) : (r.remoteUrl ?? "")
  const thumb = r.thumbnail ? urlFor(`${r.asset.id}:thumb`, r.thumbnail) : r.asset.type === "image" ? url : ""
  return { ...r.asset, url, thumbnailUrl: thumb }
}

export async function listResults(): Promise<MediaAsset[]> {
  try {
    const rows = await tx<ResultRecord[]>("readonly", (s) => s.getAll())
    for (const r of rows) {
      const a = toAsset(r)
      if (r.blob) idByUrl.set(a.url, a.id)
    }
    return rows.sort((a, b) => b.savedAt - a.savedAt).map(toAsset)
  } catch {
    return []
  }
}

export async function removeResults(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await tx("readwrite", (s) => s.delete(id))
    } catch {
      // already gone
    }
    for (const key of [id, `${id}:thumb`]) {
      const u = objectUrls.get(key)
      if (u) {
        URL.revokeObjectURL(u)
        idByUrl.delete(u)
        objectUrls.delete(key)
      }
    }
  }
  emit()
}

/** How many bytes the stored results take on this device (files and video thumbnails). */
export async function storedBytes(): Promise<number> {
  try {
    const db = await open()
    return await new Promise<number>((resolve) => {
      let total = 0
      const request = db.transaction(STORE, "readonly").objectStore(STORE).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(total)
        const r = cursor.value as ResultRecord
        total += (r.blob?.size ?? 0) + (r.thumbnail?.size ?? 0)
        cursor.continue()
      }
      request.onerror = () => resolve(total)
    })
  } catch {
    return 0
  }
}

/** True when the item is stored as a file here, not only linked. */
export async function isSavedLocally(id: string): Promise<boolean> {
  try {
    const r = await tx<ResultRecord | undefined>("readonly", (s) => s.get(id))
    return Boolean(r?.blob)
  } catch {
    return false
  }
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export function onResultsChanged(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const REF = "result:"

/** For saving a conversation: every address that belongs to a stored result becomes `result:<id>`. */
export function encodeUrls<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "string" && idByUrl.has(v) ? `${REF}${idByUrl.get(v)}` : v))) as T
}

/** For opening a saved conversation: `result:<id>` becomes a live address for the stored file. */
export async function decodeUrls<T>(value: T): Promise<T> {
  const ids = new Set<string>()
  JSON.stringify(value, (_k, v) => {
    if (typeof v === "string" && v.startsWith(REF)) ids.add(v.slice(REF.length))
    return v
  })
  const resolved = new Map<string, string>()
  for (const id of ids) {
    try {
      const r = await tx<ResultRecord | undefined>("readonly", (s) => s.get(id))
      if (r) resolved.set(`${REF}${id}`, toAsset(r).url)
    } catch {
      // the file is gone: the address stays as it is and the card shows empty
    }
  }
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "string" && resolved.has(v) ? resolved.get(v) : v))) as T
}

/** Deletes failed runs saved more than `days` days ago. Results that worked are never touched. */
export async function removeOldFailed(days: number): Promise<number> {
  try {
    const rows = await tx<ResultRecord[]>("readonly", (s) => s.getAll())
    const cutoff = Date.now() - days * 86400000
    const old = rows.filter((r) => r.asset.status === "failed" && r.savedAt < cutoff).map((r) => r.asset.id)
    if (old.length > 0) await removeResults(old)
    return old.length
  } catch {
    return 0
  }
}

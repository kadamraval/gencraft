import { assertCanAdd } from "@/lib/license"
import * as React from "react"
import type { ElementCategory, ElementItem, ElementRecord } from "./types"
import { PRESETS } from "./presets"

/**
 * The user's saved elements, kept on this machine in IndexedDB (images are real files).
 * Presets ship with the app and are listed beside the user's own; they are never stored.
 */

const DB_NAME = "gencraft-elements"
const STORE = "elements"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" })
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
const emit = () => listeners.forEach((l) => l())

const urls = new Map<string, string[]>()
function toItem(r: ElementRecord): ElementItem {
  let imageUrls = urls.get(r.id)
  if (!imageUrls) {
    imageUrls = r.images.map((b) => URL.createObjectURL(b))
    urls.set(r.id, imageUrls)
  }
  return { id: r.id, category: r.category, name: r.name, imageUrls, text: r.text, origin: r.origin, describedBy: r.describedBy, createdAt: r.createdAt }
}

export const presetItems = (): ElementItem[] =>
  PRESETS.map((p) => ({ id: p.id, category: p.category, name: p.name, imageUrls: [], text: p.text, origin: "preset" as const, createdAt: 0 }))

export async function listElements(): Promise<ElementItem[]> {
  try {
    const rows = await tx<ElementRecord[]>("readonly", (s) => s.getAll())
    return rows.map(toItem).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export interface NewElement {
  category: ElementCategory
  name: string
  images?: Blob[]
  text?: string
  origin?: ElementRecord["origin"]
  describedBy?: string
  /** Put back from a backup: keeps its own id and date, and is not held to the Free plan limit */
  restore?: { id: string; createdAt: number }
}

export async function saveElement(input: NewElement): Promise<ElementItem> {
  if (!input.restore) assertCanAdd("elements", (await listElements()).filter((e) => e.origin !== "preset").length)
  const record: ElementRecord = {
    id: input.restore?.id ?? `element-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: input.category,
    name: input.name.trim() || "Untitled",
    images: input.images ?? [],
    text: input.text?.trim() ?? "",
    origin: input.origin ?? (input.images?.length ? "written" : "written"),
    describedBy: input.describedBy,
    createdAt: input.restore?.createdAt ?? Date.now(),
  }
  await tx("readwrite", (s) => s.put(record))
  emit()
  return toItem(record)
}

export async function removeElement(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id))
  for (const u of urls.get(id) ?? []) URL.revokeObjectURL(u)
  urls.delete(id)
  emit()
}

/** The user's elements followed by the built-in presets. */
export function useElements(): ElementItem[] {
  const [mine, setMine] = React.useState<ElementItem[]>([])
  React.useEffect(() => {
    let alive = true
    const load = () => void listElements().then((rows) => alive && setMine(rows))
    load()
    listeners.add(load)
    return () => {
      alive = false
      listeners.delete(load)
    }
  }, [])
  return React.useMemo(() => [...mine, ...presetItems()], [mine])
}

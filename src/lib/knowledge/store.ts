import { appFetch } from "../registry/net"
import type { ModelRecord } from "../registry/types"
import bundledJson from "./pack.json"
import { fetchKnowledgePack } from "./pack-client"
import { recordsFromPack } from "./pack-to-registry"
import type { KnowledgePack } from "./schema"
import { isUpdateDue, recordUpdate } from "./update-schedule"

/**
 * The standard model database as the app holds it: the one built into the app, or a newer signed one downloaded since (the app keeps the
 * newer of the two). Everything that needs to know what a model can do, which jobs it ranks for or what it costs asks this module.
 */

const SOURCE_KEY = "gencraft_knowledge_source_v1"
const CHECKED_KEY = "gencraft_knowledge_checked_v1"
const DB_NAME = "gencraft-knowledge"
const DB_STORE = "pack"

/** Where the publisher serves the signed database (a folder holding pack.json and pack.sig). Empty until the owner publishes one. */
export const DEFAULT_KNOWLEDGE_SOURCE = "https://kadamraval.github.io/gencraft/knowledge/"

type Listener = () => void
const listeners = new Set<Listener>()
const bundled = bundledJson as unknown as KnowledgePack
let current: KnowledgePack = bundled
let records: ModelRecord[] = recordsFromPack(current)
let jobsById = new Map(records.map((r) => [r.id, r.jobs ?? []]))

function use(pack: KnowledgePack) {
  current = pack
  records = recordsFromPack(pack)
  jobsById = new Map(records.map((r) => [r.id, r.jobs ?? []]))
  listeners.forEach((l) => l())
}

export const getKnowledgePack = (): KnowledgePack => current
/** Every model of the database as registry records */
export const getKnowledgeRecords = (): ModelRecord[] => records
/** The jobs the database gives a model, with its rank for each */
export const jobsOf = (id: string) => jobsById.get(id)
export function subscribeKnowledge(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ---- the downloaded copy

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function readHeld(): Promise<KnowledgePack | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("current")
    req.onsuccess = () => resolve((req.result as KnowledgePack | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}
async function writeHeld(pack: KnowledgePack): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite")
    tx.objectStore(DB_STORE).put(pack, "current")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Resolves once a downloaded copy, if there is one, has been looked at */
export const knowledgeReady: Promise<void> =
  typeof indexedDB === "undefined"
    ? Promise.resolve()
    : readHeld().then(
        (held) => {
          if (held && held.schemaVersion === bundled.schemaVersion && held.generatedAt > bundled.generatedAt) use(held)
        },
        () => undefined,
      )

// ---- checking for a newer one

export function getKnowledgeSource(): string {
  try {
    return localStorage.getItem(SOURCE_KEY) ?? DEFAULT_KNOWLEDGE_SOURCE
  } catch {
    return DEFAULT_KNOWLEDGE_SOURCE
  }
}
export function setKnowledgeSource(url: string) {
  try {
    localStorage.setItem(SOURCE_KEY, url.trim())
  } catch {
    // the choice lasts until the app closes
  }
}

export interface KnowledgeReport {
  taken: boolean
  skipped?: string
}

export async function refreshKnowledge(): Promise<KnowledgeReport> {
  await knowledgeReady
  const source = getKnowledgeSource()
  if (!source) return { taken: false, skipped: "no address for the model database is set" }
  try {
    const got = await fetchKnowledgePack({ source, fetcher: appFetch, heldGeneratedAt: current.generatedAt })
    try {
      localStorage.setItem(CHECKED_KEY, String(Date.now()))
    } catch {
      // checked again next start
    }
    if (!got.pack) {
      recordUpdate(got.skipped ?? "nothing newer")
      return { taken: false, skipped: got.skipped }
    }
    await writeHeld(got.pack).catch(() => undefined)
    use(got.pack)
    recordUpdate(`model database of ${got.pack.generatedAt.slice(0, 10)} taken`)
    return { taken: true }
  } catch (e) {
    return { taken: false, skipped: e instanceof Error ? e.message : String(e) }
  }
}

/** Checks at start when a day has passed, then every few hours while the app is open. Returns the stop function. */
export function startKnowledgeScheduler(): () => void {
  const due = () => {
    let last: number | undefined
    try {
      const raw = localStorage.getItem(CHECKED_KEY)
      last = raw ? Number(raw) : undefined
    } catch {
      // treated as never checked
    }
    // The person's own choice decides: never on its own when they only update by hand
    if (getKnowledgeSource() && isUpdateDue(last)) void refreshKnowledge()
  }
  due()
  const timer = window.setInterval(due, 6 * 3600 * 1000)
  return () => window.clearInterval(timer)
}

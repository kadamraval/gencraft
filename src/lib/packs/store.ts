import * as React from "react"
import baseline from "./baseline.json"
import pkg from "../../../package.json"
import { appFetch } from "../registry/net"
import { syncChannel } from "./sync"
import { appAtLeast, validatePack } from "./validate"
import type { Channel, Pack, PackItem, PackType } from "./types"
import { CHANNEL_OF } from "./types"

/**
 * The packs the app uses: the ones built in, and the newer ones fetched from GitHub. The same pack id at a higher version replaces
 * the older one; a pack that needs a newer app than this one is left out; a pack the person switched off is left out.
 * Components and the agent read items through `getItems` / `usePackItems`, never the files.
 */

export const APP_VERSION: string = pkg.version

/** Where each channel is published. Empty until the repositories exist; a person can point them elsewhere for testing. */
export const DEFAULT_SOURCES: Record<Channel, string> = { editor: "https://kadamraval.github.io/gencraft/packs/editor/", library: "https://kadamraval.github.io/gencraft/packs/library/" }

const SOURCES_KEY = "gencraft_pack_sources_v1"
const DISABLED_KEY = "gencraft_packs_disabled_v1"
const META_KEY = "gencraft_packs_meta_v1"

export interface PackMeta {
  lastChecked: Partial<Record<Channel, number>>
  etag: Partial<Record<Channel, string>>
  error: Partial<Record<Channel, string>>
  skipped: Partial<Record<Channel, string[]>>
}

// ---- the pure part

/** The packs in use: highest version per id, newer-app packs and switched-off packs removed */
export function mergePacks(built: Pack[], fetched: Pack[], appVersion: string, disabled: ReadonlySet<string>): Pack[] {
  // A pack this app cannot use is dropped first, so the older one it would have replaced stays in use
  const best = new Map<string, Pack>()
  for (const p of [...built, ...fetched]) {
    if (p.minApp && !appAtLeast(appVersion, p.minApp)) continue
    const have = best.get(p.id)
    if (!have || p.version > have.version) best.set(p.id, p)
  }
  return [...best.values()].filter((p) => !disabled.has(p.id))
}

/** All items of one type, in pack order. When two packs use the same item id, the first one wins. */
export function itemsOf(packs: Pack[], type: PackType): PackItem[] {
  const seen = new Set<string>()
  const out: PackItem[] = []
  for (const p of packs) {
    if (p.type !== type) continue
    for (const it of p.items) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      out.push(it)
    }
  }
  return out
}

// ---- state

const builtIn: Pack[] = ((baseline as { packs: unknown[] }).packs ?? []).flatMap((raw) => {
  const result = validatePack(raw)
  return "pack" in result ? [result.pack] : []
})

let fetchedPacks: Pack[] = []
let disabled = new Set<string>(readJson<string[]>(DISABLED_KEY, []))
let meta: PackMeta = readJson<PackMeta>(META_KEY, { lastChecked: {}, etag: {}, error: {}, skipped: {} })
let merged: Pack[] = mergePacks(builtIn, fetchedPacks, APP_VERSION, disabled)
let version = 0
const listeners = new Set<() => void>()

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // only a convenience
  }
}

function publish() {
  merged = mergePacks(builtIn, fetchedPacks, APP_VERSION, disabled)
  version++
  listeners.forEach((l) => l())
}

export const subscribePacks = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const getPacks = (): Pack[] => merged
export const getItems = (type: PackType): PackItem[] => itemsOf(merged, type)
export const getPackMeta = (): PackMeta => meta

/** Every pack held (switched off ones too), for the Settings list */
export function listAllPacks(): Array<{ pack: Pack; builtIn: boolean; enabled: boolean; usable: boolean }> {
  const best = new Map<string, { pack: Pack; builtIn: boolean }>()
  for (const p of builtIn) best.set(p.id, { pack: p, builtIn: true })
  for (const p of fetchedPacks) {
    const have = best.get(p.id)
    if (!have || p.version > have.pack.version) best.set(p.id, { pack: p, builtIn: false })
  }
  return [...best.values()].map((x) => ({ ...x, enabled: !disabled.has(x.pack.id), usable: !x.pack.minApp || appAtLeast(APP_VERSION, x.pack.minApp) }))
}

export function setPackEnabled(id: string, enabled: boolean) {
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  writeJson(DISABLED_KEY, [...disabled])
  publish()
}

export function getSources(): Record<Channel, string> {
  return { ...DEFAULT_SOURCES, ...readJson<Partial<Record<Channel, string>>>(SOURCES_KEY, {}) }
}
export function setSource(channel: Channel, url: string) {
  writeJson(SOURCES_KEY, { ...readJson<Record<string, string>>(SOURCES_KEY, {}), [channel]: url.trim() })
}

/** A number that changes whenever packs, switches or the last check change, to redraw a component */
export const usePacksVersion = (): number => React.useSyncExternalStore(subscribePacks, () => version)

/** Reads items for a component and redraws it when packs change */
export function usePackItems(type: PackType): PackItem[] {
  const tick = React.useSyncExternalStore(subscribePacks, () => version)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useMemo(() => getItems(type), [type, tick])
}

// ---- the fetched packs are kept in IndexedDB so they are there offline and at the next start

const DB = "gencraft_packs"
const idb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore("kv")
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
async function readFetched(): Promise<Pack[]> {
  const db = await idb()
  return new Promise((resolve) => {
    const req = db.transaction("kv").objectStore("kv").get("fetched")
    req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as unknown[]).flatMap((r) => { const v = validatePack(r); return "pack" in v ? [v.pack] : [] }) : [])
    req.onerror = () => resolve([])
  })
}
async function writeFetched(packs: Pack[]) {
  const db = await idb()
  await new Promise<void>((resolve) => {
    const tx = db.transaction("kv", "readwrite")
    tx.objectStore("kv").put(packs, "fetched")
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export const packsReady: Promise<void> =
  typeof indexedDB === "undefined"
    ? Promise.resolve()
    : readFetched().then(
        (packs) => {
          fetchedPacks = packs
          publish()
        },
        () => undefined,
      )

// ---- checking for updates

export interface RefreshReport {
  channel: Channel
  added: string[]
  skipped: string[]
  error?: string
  unchanged?: boolean
}

export async function refreshPacks(channels: Channel[] = ["editor", "library"]): Promise<RefreshReport[]> {
  await packsReady
  const sources = getSources()
  const reports: RefreshReport[] = []
  for (const channel of channels) {
    const source = sources[channel]
    if (!source) continue
    const held: Record<string, number> = {}
    for (const p of [...builtIn, ...fetchedPacks]) if (CHANNEL_OF[p.type] === channel) held[p.id] = Math.max(held[p.id] ?? 0, p.version)
    try {
      const result = await syncChannel({ channel, source, held, appVersion: APP_VERSION, fetcher: appFetch, etag: meta.etag[channel] })
      if (result.packs.length > 0) {
        const byId = new Map(fetchedPacks.map((p) => [p.id, p]))
        for (const p of result.packs) byId.set(p.id, p)
        fetchedPacks = [...byId.values()]
        await writeFetched(fetchedPacks)
      }
      meta = { ...meta, lastChecked: { ...meta.lastChecked, [channel]: Date.now() }, etag: { ...meta.etag, [channel]: result.etag }, error: { ...meta.error, [channel]: undefined }, skipped: { ...meta.skipped, [channel]: result.skipped } }
      reports.push({ channel, added: result.packs.map((p) => `${p.id}@${p.version}`), skipped: result.skipped, unchanged: result.unchanged })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      meta = { ...meta, lastChecked: { ...meta.lastChecked, [channel]: Date.now() }, error: { ...meta.error, [channel]: error } }
      reports.push({ channel, added: [], skipped: [], error })
    }
    writeJson(META_KEY, meta)
  }
  publish()
  return reports
}

const DAY_MS = 24 * 3600 * 1000

/** Checks once at start (when a day has passed) and then every few hours while the app is open. Returns the stop function. */
export function startPackScheduler(): () => void {
  const due = () => {
    const sources = getSources()
    const stale = (["editor", "library"] as Channel[]).filter((c) => sources[c] && Date.now() - (meta.lastChecked[c] ?? 0) > DAY_MS)
    if (stale.length > 0) void refreshPacks(stale)
  }
  due()
  const timer = window.setInterval(due, 6 * 3600 * 1000)
  return () => window.clearInterval(timer)
}

/**
 * The app used to be called T18 (and T20 and CineZinc before that). Everything it stores on the device now carries the name Gencraft. This is the one
 * place that still knows the old names: it moves what an earlier version saved to the new names the first time the app starts, keeps the old backup
 * and licence formats readable, and then does nothing.
 */

/** Old licence keys started with this; new ones start with GC- */
export const LEGACY_LICENSE_PREFIX = "T18-"
/** Backups made before the rename */
export const LEGACY_BACKUP_EXTENSION = "t18backup"
export const LEGACY_BACKUP_APP = "T18 Studio"
/** The password lock kept the password in plain text under these (read once by auth/lock.ts, turned into a hash and removed) */
export const LEGACY_LOCK_KEYS = { lock: "t20_master_pw", settings: "cinezinc_master_pw", session: "t20_auth_session" } as const

const PREFIXES: Array<[string, string]> = [
  ["t18_", "gencraft_"],
  ["t20_", "gencraft_"],
]
/** Left for lock.ts, which reads and removes them itself */
const LEFT_ALONE = new Set<string>(Object.values(LEGACY_LOCK_KEYS))

const LEGACY_DATABASES = ["t18-results", "t18-registry", "t18-library", "t18-knowledge", "t18-history", "t18-folder", "t18-elements", "t18_packs"]
const newDatabaseName = (old: string) => old.replace(/^t18/, "gencraft")

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">

/** Moves every value saved under an old key to the new key (a value already under the new key wins) and removes the old one. Returns how many moved. */
export function migrateLocalStorage(storage: KeyValueStore): number {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k) keys.push(k)
  }
  let moved = 0
  for (const key of keys) {
    if (LEFT_ALONE.has(key)) continue
    const rule = PREFIXES.find(([from]) => key.startsWith(from))
    if (!rule) continue
    const target = rule[1] + key.slice(rule[0].length)
    const value = storage.getItem(key)
    if (value !== null && storage.getItem(target) === null) storage.setItem(target, value)
    storage.removeItem(key)
    moved++
  }
  return moved
}

// ---- databases

interface StoreCopy {
  name: string
  keyPath: string | string[] | null
  autoIncrement: boolean
  indexes: Array<{ name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }>
  keys: IDBValidKey[]
  values: unknown[]
}

const request = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function readAll(name: string): Promise<{ version: number; stores: StoreCopy[] } | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  try {
    const names = [...db.objectStoreNames]
    const stores: StoreCopy[] = []
    if (names.length > 0) {
      const tx = db.transaction(names, "readonly")
      for (const storeName of names) {
        const store = tx.objectStore(storeName)
        stores.push({
          name: storeName,
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: [...store.indexNames].map((i) => {
            const ix = store.index(i)
            return { name: i, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }
          }),
          keys: await request(store.getAllKeys()),
          values: await request(store.getAll()),
        })
      }
    }
    return { version: db.version, stores }
  } finally {
    db.close()
  }
}

async function writeAll(name: string, copy: { version: number; stores: StoreCopy[] }): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, copy.version)
    req.onupgradeneeded = () => {
      for (const s of copy.stores) {
        const store = req.result.createObjectStore(s.name, { keyPath: s.keyPath ?? undefined, autoIncrement: s.autoIncrement })
        for (const i of s.indexes) store.createIndex(i.name, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  try {
    if (copy.stores.length > 0) {
      const tx = db.transaction(copy.stores.map((s) => s.name), "readwrite")
      for (const s of copy.stores) {
        const store = tx.objectStore(s.name)
        s.values.forEach((value, i) => {
          if (s.keyPath === null) store.put(value, s.keys[i])
          else store.put(value)
        })
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    }
  } finally {
    db.close()
  }
}

/** True when a database has no records in any store (the app made it empty before the old one could be moved) */
async function isEmpty(name: string): Promise<boolean> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  try {
    const names = [...db.objectStoreNames]
    if (names.length === 0) return true
    const tx = db.transaction(names, "readonly")
    for (const n of names) if ((await request(tx.objectStore(n).count())) > 0) return false
    return true
  } finally {
    db.close()
  }
}

const deleteDatabase = (name: string) =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })

/** Copies each database an earlier version made into one with the new name, then removes the old one. A copy that fails leaves the old one in place. */
export async function migrateDatabases(): Promise<number> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return 0
  const have = new Set((await indexedDB.databases()).map((d) => d.name))
  let moved = 0
  for (const old of LEGACY_DATABASES) {
    if (!have.has(old)) continue
    const target = newDatabaseName(old)
    try {
      // A database under the new name that holds data is never overwritten, and the old one stays; an empty one is replaced by the copy
      if (have.has(target)) {
        if (!(await isEmpty(target))) continue
        await deleteDatabase(target)
      }
      const copy = await readAll(old)
      if (copy) await writeAll(target, copy)
      await deleteDatabase(old)
      moved++
    } catch (e) {
      console.warn(`Could not move ${old} to ${target}; it stays where it is`, e)
    }
  }
  return moved
}

/** Runs once at start-up, before anything reads what it stores */
export async function migrateLegacyNames(): Promise<void> {
  try {
    migrateLocalStorage(localStorage)
  } catch {
    // storage unavailable: nothing to move
  }
  try {
    await migrateDatabases()
  } catch (e) {
    console.warn("Old data could not be moved", e)
  }
}

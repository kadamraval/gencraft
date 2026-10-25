import { LEGACY_BACKUP_APP } from "../legacy-names"
import { unzipSync, zipSync } from "fflate"
import { listConversations, loadConversation, saveConversation } from "@/lib/chat/history-store"
import { addUpload, listUploads } from "@/lib/library/library-store"
import { listResults, saveResult } from "@/lib/library/results-store"
import { listElements, saveElement } from "@/lib/elements/store"
import type { ElementCategory } from "@/lib/elements/types"
import type { MediaAsset } from "@/types"

/**
 * A backup is one file: a zip with your Library files, results, saved elements, chats, skills, folders and
 * preferences. API keys and the app password are never put in it, so a backup can be kept in a cloud folder
 * without carrying anything that opens your accounts.
 */

const VERSION = 1
export const BACKUP_EXTENSION = "gencraftbackup"

/** Settings kept on this device that a backup carries. */
const PREF_KEYS = ["gencraft_folders_v1", "gencraft_skills_v1", "gencraft_appearance_v1", "gencraft_composer_mode", "gencraft_model_names_v1", "gencraft_custom_models_v1", "gencraft_cloud_sync_v1", "gencraft_run_times_v1", "gencraft_price_overrides_v1"]
const SETTINGS_KEY = "gencraft_studio_settings"

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/webm": "webm" }

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))
const decode = <T>(b: Uint8Array | undefined): T | undefined => (b ? (JSON.parse(new TextDecoder().decode(b)) as T) : undefined)

async function bytesOf(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type }
  } catch {
    return null
  }
}

/** Settings without the keys. A backup never holds a key. */
function settingsWithoutKeys(): unknown {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as { aiEngine?: Record<string, unknown> } | null
    if (!raw) return null
    const aiEngine = Object.fromEntries(Object.entries(raw.aiEngine ?? {}).filter(([k]) => !/apikey/i.test(k)))
    return { ...raw, aiEngine }
  } catch {
    return null
  }
}

export interface BackupSummary {
  uploads: number
  results: number
  elements: number
  chats: number
}

export async function createBackup(): Promise<{ blob: Blob; name: string; summary: BackupSummary }> {
  const files: Record<string, Uint8Array> = {}
  const summary: BackupSummary = { uploads: 0, results: 0, elements: 0, chats: 0 }

  const prefs: Record<string, string> = {}
  for (const key of PREF_KEYS) {
    const v = localStorage.getItem(key)
    if (v !== null) prefs[key] = v
  }
  files["prefs.json"] = encode({ prefs, settings: settingsWithoutKeys() })

  const uploads = await listUploads()
  const uploadIndex: Array<{ id: string; title: string; projectId: string; createdAt: number; file: string }> = []
  for (const u of uploads) {
    const got = await bytesOf(u.url)
    if (!got) continue
    const file = `uploads/${u.id}.${EXT[got.type] ?? "bin"}`
    files[file] = got.bytes
    uploadIndex.push({ id: u.id, title: u.title, projectId: u.projectId, createdAt: u.createdAt, file })
  }
  files["uploads.json"] = encode(uploadIndex)
  summary.uploads = uploadIndex.length

  const results = await listResults()
  const resultIndex: Array<{ asset: Omit<MediaAsset, "url" | "thumbnailUrl">; file?: string; remoteUrl?: string }> = []
  for (const a of results) {
    const { url, thumbnailUrl, ...meta } = a
    void thumbnailUrl
    if (a.status === "failed" || !url) {
      resultIndex.push({ asset: meta })
      continue
    }
    if (/^https?:/i.test(url)) {
      resultIndex.push({ asset: meta, remoteUrl: url })
      continue
    }
    const got = await bytesOf(url)
    if (!got) continue
    const file = `results/${a.id}.${EXT[got.type] ?? "bin"}`
    files[file] = got.bytes
    resultIndex.push({ asset: meta, file })
  }
  files["results.json"] = encode(resultIndex)
  summary.results = resultIndex.length

  const elements = (await listElements()).filter((e) => e.origin !== "preset")
  const elementIndex: Array<{ id: string; category: ElementCategory; name: string; text: string; origin?: string; describedBy?: string; createdAt: number; images: string[] }> = []
  for (const e of elements) {
    const images: string[] = []
    for (const [i, url] of e.imageUrls.entries()) {
      const got = await bytesOf(url)
      if (!got) continue
      const file = `elements/${e.id}-${i}.${EXT[got.type] ?? "bin"}`
      files[file] = got.bytes
      images.push(file)
    }
    elementIndex.push({ id: e.id, category: e.category, name: e.name, text: e.text, origin: e.origin, describedBy: e.describedBy, createdAt: e.createdAt, images })
  }
  files["elements.json"] = encode(elementIndex)
  summary.elements = elementIndex.length

  const chats = []
  for (const c of await listConversations()) {
    const full = await loadConversation(c.id)
    if (full) chats.push(full)
  }
  files["chats.json"] = encode(chats)
  summary.chats = chats.length

  files["manifest.json"] = encode({ app: "Gencraft", version: VERSION, createdAt: new Date().toISOString(), summary })
  const zipped = zipSync(files, { level: 1 })
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "")
  return { blob: new Blob([zipped as BlobPart], { type: "application/zip" }), name: `gencraft-backup-${stamp}.${BACKUP_EXTENSION}`, summary }
}

/** Puts a backup back. Keys on this device are kept as they are. The caller reloads the app afterwards. */
export async function restoreBackup(file: File): Promise<BackupSummary> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error("This is not a backup file this app can read.")
  }
  const manifest = decode<{ app?: string; version?: number }>(files["manifest.json"])
  if (manifest?.app !== "Gencraft" && manifest?.app !== LEGACY_BACKUP_APP) throw new Error("This is not a backup made by this app.")
  if ((manifest.version ?? 0) > VERSION) throw new Error("This backup was made by a newer version of the app. Update the app first.")
  const summary: BackupSummary = { uploads: 0, results: 0, elements: 0, chats: 0 }

  const prefs = decode<{ prefs: Record<string, string>; settings: { aiEngine?: Record<string, unknown> } | null }>(files["prefs.json"])
  if (prefs) {
    for (const [k, v] of Object.entries(prefs.prefs)) localStorage.setItem(k, v)
    if (prefs.settings) {
      // Keys already on this device stay; everything else comes from the backup
      const current = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as { aiEngine?: Record<string, unknown> }
      const keys = Object.fromEntries(Object.entries(current.aiEngine ?? {}).filter(([k]) => /apikey/i.test(k)))
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prefs.settings, aiEngine: { ...(prefs.settings.aiEngine ?? {}), ...keys } }))
    }
  }

  const blobOf = (path: string): Blob | null => {
    const data = files[path]
    if (!data) return null
    const ext = path.split(".").pop() ?? ""
    const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream"
    return new Blob([data as BlobPart], { type })
  }

  for (const u of decode<Array<{ id: string; title: string; projectId: string; createdAt: number; file: string }>>(files["uploads.json"]) ?? []) {
    const blob = blobOf(u.file)
    if (!blob) continue
    await addUpload(new File([blob], `${u.title}.${u.file.split(".").pop()}`, { type: blob.type }), u.projectId, { id: u.id, title: u.title, createdAt: u.createdAt })
    summary.uploads++
  }

  for (const r of decode<Array<{ asset: Omit<MediaAsset, "url" | "thumbnailUrl">; file?: string; remoteUrl?: string }>>(files["results.json"]) ?? []) {
    const blob = r.file ? blobOf(r.file) : null
    const url = blob ? URL.createObjectURL(blob) : (r.remoteUrl ?? "")
    await saveResult({ ...r.asset, url, thumbnailUrl: r.asset.type === "image" ? url : "" } as MediaAsset)
    summary.results++
  }

  for (const e of decode<Array<{ id: string; category: ElementCategory; name: string; text: string; origin?: "written" | "described" | "preset"; describedBy?: string; createdAt: number; images: string[] }>>(files["elements.json"]) ?? []) {
    const images = e.images.map(blobOf).filter((b): b is Blob => b !== null)
    await saveElement({ category: e.category, name: e.name, text: e.text, origin: e.origin, describedBy: e.describedBy, images, restore: { id: e.id, createdAt: e.createdAt } })
    summary.elements++
  }

  for (const c of decode<Parameters<typeof saveConversation>[0][]>(files["chats.json"]) ?? []) {
    await saveConversation(c)
    summary.chats++
  }
  return summary
}

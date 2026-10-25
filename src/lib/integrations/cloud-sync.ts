import SparkMD5 from "spark-md5"
import { composioCall, appFetch, isDesktopApp } from "@/lib/registry/net"
import { ComposioError, executeTool, isConnected, readComposioState } from "./composio"

/**
 * Saves finished results to Google Drive or Dropbox through Composio, in a folder the person names.
 * Drive takes the file as a staged upload (Composio holds it for a moment). Dropbox takes it on a one-time
 * upload link. Each save is recorded, so a result is sent once and a failure is shown, not hidden.
 */

export type CloudTarget = "googledrive" | "dropbox"

export const CLOUD_TARGETS: Record<CloudTarget, { label: string; defaultFolder: string }> = {
  googledrive: { label: "Google Drive", defaultFolder: "Gencraft" },
  dropbox: { label: "Dropbox", defaultFolder: "Gencraft" },
}

export interface CloudSettings {
  enabled: boolean
  folder: string
  /** Drive: the folder's id, once found or made */
  folderId?: string
  saved: number
  lastOkAt?: number
  lastError?: string
}

const SETTINGS_KEY = "gencraft_cloud_sync_v1"
const DONE_KEY = "gencraft_cloud_done_v1"

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable: the choice lasts until the app closes
  }
}

export function readCloud(target: CloudTarget): CloudSettings {
  const all = readJson<Partial<Record<CloudTarget, CloudSettings>>>(SETTINGS_KEY, {})
  return { enabled: false, folder: CLOUD_TARGETS[target].defaultFolder, saved: 0, ...(all[target] ?? {}) }
}

export function writeCloud(target: CloudTarget, patch: Partial<CloudSettings>) {
  const all = readJson<Partial<Record<CloudTarget, CloudSettings>>>(SETTINGS_KEY, {})
  all[target] = { ...readCloud(target), ...patch }
  writeJson(SETTINGS_KEY, all)
  emit()
}

export function subscribeCloud(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const doneIds = (target: CloudTarget): string[] => readJson<Record<string, string[]>>(DONE_KEY, {})[target] ?? []
function markDone(target: CloudTarget, id: string) {
  const all = readJson<Record<string, string[]>>(DONE_KEY, {})
  all[target] = [...(all[target] ?? []).filter((x) => x !== id), id].slice(-500)
  writeJson(DONE_KEY, all)
}

// Reading the file

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a" }

async function readBytes(url: string): Promise<Blob> {
  const remote = /^https?:/i.test(url)
  const res = remote ? await appFetch(url) : await fetch(url)
  if (!res.ok) throw new ComposioError(`The file could not be read (HTTP ${res.status}).`)
  return res.blob()
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "result"

function fileNameFor(title: string, id: string, blob: Blob, url: string): string {
  const fromUrl = url.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1]?.toLowerCase()
  const ext = EXT[blob.type] ?? fromUrl ?? (blob.type.split("/")[1] || "bin")
  return `${slug(title)}-${id.replace(/[^a-z0-9]+/gi, "").slice(-8)}.${ext}`
}

// Drive: stage the file at Composio, then create it

async function stageFile(key: string, toolkit: string, toolSlug: string, name: string, blob: Blob): Promise<{ name: string; mimetype: string; s3key: string }> {
  const mimetype = blob.type || "application/octet-stream"
  const buffer = await blob.arrayBuffer()
  const md5 = SparkMD5.ArrayBuffer.hash(buffer)
  const res = await composioCall(key)("/api/v3.1/files/upload/request", {
    method: "POST",
    body: JSON.stringify({ toolkit_slug: toolkit, tool_slug: toolSlug, filename: name, mimetype, md5 }),
  })
  const body = (await res.json().catch(() => null)) as { key?: string; new_presigned_url?: string; metadata?: { storage_backend?: string }; error?: { message?: string } } | null
  if (!res.ok || !body?.key || !body.new_presigned_url) throw new ComposioError(body?.error?.message ?? "Composio would not accept the file for upload.")
  const headers: Record<string, string> = { "Content-Type": mimetype }
  if (body.metadata?.storage_backend === "azure_blob_storage") headers["x-ms-blob-type"] = "BlockBlob"
  const put = await (isDesktopApp() ? appFetch : fetch)(body.new_presigned_url, { method: "PUT", headers, body: buffer })
  if (!put.ok) throw new ComposioError(`Uploading the file failed (HTTP ${put.status}).`)
  return { name, mimetype, s3key: body.key }
}

const asObject = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {})

/** The id of a Drive folder with this name, found or made. */
async function driveFolderId(key: string, name: string, own = false): Promise<string> {
  const known = readCloud("googledrive")
  if (!own && known.folderId && known.folder === name) return known.folderId
  const found = asObject(await executeTool(key, "googledrive", "GOOGLEDRIVE_FIND_FOLDER", { name_exact: name, page_size: 5 }))
  const files = (found.files ?? asObject(found.data).files ?? found.items) as Array<{ id?: string }> | undefined
  let id = Array.isArray(files) ? files.find((f) => f.id)?.id : undefined
  if (!id) {
    const made = asObject(await executeTool(key, "googledrive", "GOOGLEDRIVE_CREATE_FOLDER", { name }))
    id = (made.id as string | undefined) ?? (asObject(made.data).id as string | undefined)
  }
  if (!id) throw new ComposioError("Google Drive did not return the folder.")
  if (!own) writeCloud("googledrive", { folderId: id })
  return id
}

async function uploadToDrive(key: string, folder: string, name: string, blob: Blob) {
  const parent = await driveFolderId(key, folder)
  const file = await stageFile(key, "googledrive", "GOOGLEDRIVE_CREATE_FILE", name, blob)
  await executeTool(key, "googledrive", "GOOGLEDRIVE_CREATE_FILE", { name, parents: [parent], file_to_upload: file })
}

// Dropbox: a one-time upload link

const dropboxPath = (folder: string) => `/${folder.replace(/^\/+|\/+$/g, "")}`

async function uploadToDropbox(key: string, folder: string, name: string, blob: Blob) {
  const base = dropboxPath(folder)
  try {
    await executeTool(key, "dropbox", "DROPBOX_CREATE_FOLDER", { path: base })
  } catch (e) {
    // A folder that already exists is fine
    if (!(e instanceof ComposioError && /conflict|exists/i.test(e.message))) throw e
  }
  const link = asObject(
    await executeTool(key, "dropbox", "DROPBOX_GET_TEMPORARY_UPLOAD_LINK", { commit_info: { path: `${base}/${name}`, mode: "add", autorename: true, mute: true } }),
  )
  const url = (link.link as string | undefined) ?? (asObject(link.data).link as string | undefined)
  if (!url) throw new ComposioError("Dropbox did not return an upload link.")
  const res = await (isDesktopApp() ? appFetch : fetch)(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: blob })
  if (!res.ok) throw new ComposioError(`Dropbox did not accept the file (HTTP ${res.status}).`)
}

export interface SyncAsset {
  id: string
  title: string
  url: string
  type: string
}

/** Saves one result to one target. Throws with a plain message when it fails. */
export async function saveToCloud(key: string, target: CloudTarget, asset: SyncAsset): Promise<void> {
  const cfg = readCloud(target)
  const blob = await readBytes(asset.url)
  const name = fileNameFor(asset.title, asset.id, blob, asset.url)
  if (target === "googledrive") await uploadToDrive(key, cfg.folder || CLOUD_TARGETS.googledrive.defaultFolder, name, blob)
  else await uploadToDropbox(key, cfg.folder || CLOUD_TARGETS.dropbox.defaultFolder, name, blob)
}

let chain: Promise<void> = Promise.resolve()

/** Queues new results for every connected target that has saving switched on. One at a time, so a burst stays gentle. */
export function syncNewAssets(key: string, assets: SyncAsset[]) {
  if (!key) return
  for (const target of Object.keys(CLOUD_TARGETS) as CloudTarget[]) {
    if (!readCloud(target).enabled || !isConnected(target) || !readComposioState().accounts[target]) continue
    for (const asset of assets) {
      if (!asset.url || doneIds(target).includes(asset.id)) continue
      chain = chain.then(async () => {
        try {
          await saveToCloud(key, target, asset)
          markDone(target, asset.id)
          writeCloud(target, { saved: readCloud(target).saved + 1, lastOkAt: Date.now(), lastError: undefined })
        } catch (e) {
          writeCloud(target, { lastError: e instanceof Error ? e.message : String(e) })
        }
      })
    }
  }
}

/** Saves a file that is not a result (a backup) to a folder of the given name in Drive or Dropbox. */
export async function saveBlobToCloud(key: string, target: CloudTarget, name: string, blob: Blob, folder: string): Promise<void> {
  if (!isConnected(target)) throw new ComposioError(`${CLOUD_TARGETS[target].label} is not connected. Connect it in Settings, Integrations.`)
  if (target === "googledrive") {
    const parent = await driveFolderId(key, folder, true)
    const file = await stageFile(key, "googledrive", "GOOGLEDRIVE_CREATE_FILE", name, blob)
    await executeTool(key, "googledrive", "GOOGLEDRIVE_CREATE_FILE", { name, parents: [parent], file_to_upload: file })
  } else await uploadToDropbox(key, folder, name, blob)
}

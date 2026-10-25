import { currentFolder, safeName, writeToFolder } from "@/lib/backup/folder"
import { markDownloaded } from "./library-store"
import { appFetch, isDesktopApp } from "@/lib/registry/net"

/**
 * Download a picture, a clip or a sound, and say plainly where it went.
 *
 *  - In the desktop app it is saved in the save folder (Settings, General, Backup; Documents/Gencraft until another is chosen),
 *    in a folder named Downloads, with the right file ending, and the notice names the full place.
 *  - In a browser it goes to the browser's Downloads folder, and the notice says so.
 */

export interface Downloadable {
  /** The result's id, so the Downloaded filter can find it */
  id?: string
  url: string
  title: string
  type: "image" | "video" | "audio"
}

const ENDINGS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
}

const FALLBACK = { image: "png", video: "mp4", audio: "mp3" } as const

/** The file ending for what was fetched: from its type, then from the address, then by the kind of thing it is */
export function endingFor(mime: string, url: string, type: Downloadable["type"]): string {
  const clean = mime.split(";")[0]!.trim().toLowerCase()
  if (ENDINGS[clean]) return ENDINGS[clean]!
  const fromUrl = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url.split("?")[0] ?? "")?.[1]?.toLowerCase()
  if (fromUrl && Object.values(ENDINGS).includes(fromUrl)) return fromUrl
  return FALLBACK[type]
}

/** The file name: the title made safe, with the right ending, and not ending twice */
export function fileNameFor(title: string, ending: string): string {
  const base = safeName(title.replace(/\.[a-z0-9]{2,4}$/i, ""), "Result").replace(/\s+/g, "_")
  return `${base}.${ending}`
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = /^https?:/i.test(url) && isDesktopApp() ? await appFetch(url) : await fetch(url)
  if (!res.ok) throw new Error(`The file could not be read (${res.status}).`)
  return res.blob()
}

/** Offers a file to the browser as a download (its Downloads folder) */
function viaBrowser(href: string, name: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function downloadMedia(item: Downloadable): Promise<{ ok: boolean; message: string }> {
  const done = (r: { ok: boolean; message: string }) => {
    if (item.id) markDownloaded(item.id)
    return r
  }
  let blob: Blob
  try {
    blob = await fetchBlob(item.url)
  } catch {
    // The address cannot be read from here (another site's rules): the browser may still be able to fetch it itself
    viaBrowser(item.url, fileNameFor(item.title, endingFor("", item.url, item.type)))
    return done({ ok: true, message: "Sent to your browser's Downloads folder." })
  }
  const name = fileNameFor(item.title, endingFor(blob.type, item.url, item.type))
  const folder = await currentFolder().catch(() => null)
  if (folder) {
    try {
      await writeToFolder(name, blob, "Downloads")
      return done({ ok: true, message: `Saved ${name} in ${folder.label}${/[\\/]$/.test(folder.label) ? "" : folder.label.includes("\\") ? "\\" : "/"}Downloads.` })
    } catch (e) {
      // The folder cannot be written to now (gone, or the browser needs the permission again): the browser's own Downloads still works
      const reason = e instanceof Error ? e.message : ""
      const href = URL.createObjectURL(blob)
      viaBrowser(href, name)
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000)
      return done({ ok: true, message: `Sent to your browser's Downloads folder. The save folder could not be used${reason ? `: ${reason}` : "."}` })
    }
  }
  const href = URL.createObjectURL(blob)
  viaBrowser(href, name)
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000)
  return done({ ok: true, message: `Saved ${name} in your browser's Downloads folder.` })
}

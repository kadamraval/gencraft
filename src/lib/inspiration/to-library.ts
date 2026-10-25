import { appFetch } from "@/lib/registry/net"
import { addUpload } from "@/lib/library/library-store"
import { createFolder, setItemInFolder } from "@/lib/library/folders-store"

/**
 * Puts pictures into the app's own Library as real files on this device, optionally in a folder named after a
 * Pinterest board. Each picture is read from Pinterest, so one that cannot be read is counted, not hidden.
 */

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "pin"

export interface LibraryPin {
  id: string
  title: string
  image?: string
  thumb?: string
}

export async function addPinsToLibrary(
  pins: LibraryPin[],
  opts: { projectId: string; folderName?: string; onProgress?: (done: number, total: number) => void },
): Promise<{ added: number; failed: number; folder?: string }> {
  const folder = opts.folderName && pins.length > 0 ? createFolder(opts.folderName) : undefined
  let added = 0
  let failed = 0
  let done = 0
  let next = 0
  const worker = async () => {
    while (next < pins.length) {
      const pin = pins[next++]!
      const url = pin.image ?? pin.thumb
      try {
        if (!url) throw new Error("no picture")
        const res = await appFetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg"
        const file = new File([blob], `${slug(pin.title)}.${EXT[type] ?? "jpg"}`, { type })
        const item = await addUpload(file, opts.projectId)
        if (folder) setItemInFolder(folder.id, item.id, true)
        added++
      } catch {
        failed++
      }
      opts.onProgress?.(++done, pins.length)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return { added, failed, folder: folder?.title }
}

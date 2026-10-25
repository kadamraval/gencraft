import * as React from "react"
import { showNotice } from "@/lib/notice"
import { onUploadsChanged, uploadedBytes } from "./library-store"
import { onResultsChanged, storedBytes } from "./results-store"

const GB = 1024 ** 3

/** Everything the Library keeps on this device: generated results and uploaded files. */
export async function libraryBytes(): Promise<number> {
  const [results, uploads] = await Promise.all([storedBytes(), uploadedBytes()])
  return results + uploads
}

export function formatSize(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(0, Math.round(bytes / 1024))} KB`
}

/** The Library's size, kept current as results and uploads are added or removed. */
export function useLibraryBytes(): number | null {
  const [bytes, setBytes] = React.useState<number | null>(null)
  React.useEffect(() => {
    let alive = true
    const load = () => void libraryBytes().then((b) => alive && setBytes(b))
    load()
    const offResults = onResultsChanged(load)
    const offUploads = onUploadsChanged(load)
    return () => {
      alive = false
      offResults()
      offUploads()
    }
  }, [])
  return bytes
}

// The limit a warning was already shown for, so one crossing is told once and not after every result
let warnedFor: number | undefined

/** Tells the person once when the Library grows past the size they set in Settings, General, Limits. */
export function useLibrarySizeWarning(limitGb: number | undefined) {
  React.useEffect(() => {
    if (!limitGb) return
    let timer = 0
    let alive = true
    const check = async () => {
      const bytes = await libraryBytes()
      if (!alive) return
      if (bytes < limitGb * GB) {
        warnedFor = undefined
        return
      }
      if (warnedFor === limitGb) return
      warnedFor = limitGb
      showNotice(`The Library is using ${formatSize(bytes)}, over the ${limitGb} GB you set. Delete what you no longer need or raise the limit (Settings, General, Limits).`)
    }
    // Soon after launch and a moment after each change, so a burst of new results is checked once
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void check(), 2500)
    }
    later()
    const offResults = onResultsChanged(later)
    const offUploads = onUploadsChanged(later)
    return () => {
      alive = false
      window.clearTimeout(timer)
      offResults()
      offUploads()
    }
  }, [limitGb])
}

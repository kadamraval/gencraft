import { appFetch, isDesktopApp } from "@/lib/registry/net"

/**
 * Making files readable from the page. A picture or video from another site can be shown but not read back (drawn onto the export,
 * decoded for its sound) unless that site allows it, and the desktop windows differ in how strict they are. So before reading, a
 * file at a web address is fetched once, the way the app fetches everything else (the desktop app has no such limit), and used from
 * memory. Files already in memory (blob: and data: addresses) are left alone.
 */

const isWeb = (url: string) => /^https?:/i.test(url)

/** The bytes of a file, fetched the way that works in this window */
export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = isWeb(url) && isDesktopApp() ? await appFetch(url) : await fetch(url)
  if (!res.ok) throw new Error(`The file could not be read (${res.status}).`)
  return res.arrayBuffer()
}

export interface Localized {
  /** The address to use in place of the original; the original when it could not be fetched */
  use: (url: string | undefined) => string | undefined
  /** Frees what was fetched */
  release: () => void
}

export async function localize(urls: Array<string | undefined>, signal?: AbortSignal): Promise<Localized> {
  const made = new Map<string, string>()
  const unique = [...new Set(urls.filter((u): u is string => Boolean(u) && isWeb(u as string)))]
  await Promise.all(
    unique.map(async (url) => {
      if (signal?.aborted) return
      try {
        const res = isDesktopApp() ? await appFetch(url) : await fetch(url)
        if (!res.ok) return
        made.set(url, URL.createObjectURL(await res.blob()))
      } catch {
        // keep the original address; the window may still be able to use it
      }
    }),
  )
  return {
    use: (url) => (url ? (made.get(url) ?? url) : url),
    release: () => made.forEach((blob) => URL.revokeObjectURL(blob)),
  }
}

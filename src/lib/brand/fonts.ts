import type * as React from "react"

import list from "./google-fonts.json"

/** Every Google Font family, most used first, with its kind. Bundled, so listing and searching need no key and no network. */
export type FontKind = "sans" | "serif" | "display" | "script" | "mono"
export const GOOGLE_FONTS = list as Array<[string, FontKind]>
export const FONT_KINDS: Array<{ id: FontKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "script", label: "Script" },
  { id: "mono", label: "Mono" },
]

const loaded = new Set<string>()

/** Asks Google Fonts for the given families once, so the page can show them in their own face. */
export function loadFonts(families: string[]) {
  const fresh = families.filter((f) => f && !loaded.has(f))
  if (fresh.length === 0) return
  fresh.forEach((f) => loaded.add(f))
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.crossOrigin = "anonymous"
  link.href = `https://fonts.googleapis.com/css2?${fresh.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&")}&display=swap`
  document.head.appendChild(link)
}

/** The style for text in a family. Quoted so names with spaces work. */
export const face = (family: string | undefined): React.CSSProperties => (family ? { fontFamily: `"${family}", sans-serif` } : {})

/** Colors from the user's palette applied to a box or to text. */
export const paint = (background: string | undefined): React.CSSProperties => (background ? { background } : {})
export const ink = (color: string | undefined): React.CSSProperties => (color ? { color } : {})

/** Black or white, whichever reads better on the given background. */
export function readableOn(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim())
  if (!m) return "#ffffff" // allow-color
  const n = parseInt(m[1]!, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? "#111111" : "#ffffff" // allow-color
}

// ---- loading a family so the canvas can draw with it

const wanted = new Map<string, Promise<boolean>>()
const watchers = new Set<() => void>()

/** Calls back whenever a font finishes loading, so a canvas that drew with a stand-in can draw again */
export function onFontLoaded(cb: () => void): () => void {
  watchers.add(cb)
  return () => {
    watchers.delete(cb)
  }
}

function addStylesheet(href: string): Promise<boolean> {
  return new Promise((resolve) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.crossOrigin = "anonymous"
    link.href = href
    link.onload = () => resolve(true)
    link.onerror = () => {
      link.remove()
      resolve(false)
    }
    document.head.appendChild(link)
  })
}

/**
 * Makes one weight of a Google Fonts family ready to draw: asks for its stylesheet (first with the weight, and plain if the family does
 * not have that weight), then waits until the browser has the font itself. Resolves false when it could not be had (offline, unknown
 * family); the canvas then draws with the system font.
 */
export function ensureFont(family: string, weight = 400, italic = false): Promise<boolean> {
  if (!family || typeof document === "undefined") return Promise.resolve(true)
  const key = `${family}|${weight}|${italic ? 1 : 0}`
  const have = wanted.get(key)
  if (have) return have
  const name = encodeURIComponent(family).replace(/%20/g, "+")
  const job = (async () => {
    let ok = await addStylesheet(`https://fonts.googleapis.com/css2?family=${name}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`)
    if (!ok) ok = await addStylesheet(`https://fonts.googleapis.com/css2?family=${name}&display=swap`)
    if (!ok) return false
    try {
      await Promise.race([document.fonts.load(`${italic ? "italic " : ""}${weight} 32px "${family}"`), new Promise((r) => setTimeout(r, 6000))])
    } catch {
      return false
    }
    const done = document.fonts.check(`${italic ? "italic " : ""}${weight} 32px "${family}"`)
    watchers.forEach((w) => w())
    return done
  })()
  wanted.set(key, job)
  return job
}

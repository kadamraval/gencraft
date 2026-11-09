import { appFetch } from "@/lib/registry/net"
/**
 * Picture edits that need no model: crop, and colour changes (brightness, contrast, saturation, warmth, blur, grayscale, sepia). They run
 * in the app, cost nothing and work with any provider. Each returns a new picture as a blob address; the original is never changed.
 */

export interface Tone {
  brightness: number
  contrast: number
  saturation: number
  /** Warm (+) or cool (-), in degrees of hue */
  warmth: number
  blur: number
  grayscale: number
  sepia: number
}

export const NEUTRAL: Tone = { brightness: 100, contrast: 100, saturation: 100, warmth: 0, blur: 0, grayscale: 0, sepia: 0 }

/** Ready looks: each is a tone, so a filter is one click and its strength is a blend with the plain picture */
export const FILTERS: Array<{ id: string; name: string; tone: Partial<Tone> }> = [
  { id: "bw", name: "Black and white", tone: { grayscale: 100, contrast: 110 } },
  { id: "vintage", name: "Vintage", tone: { sepia: 45, contrast: 90, saturation: 85, brightness: 105 } },
  { id: "film", name: "Film", tone: { contrast: 115, saturation: 90, sepia: 12, brightness: 98 } },
  { id: "vivid", name: "Vivid", tone: { saturation: 145, contrast: 110 } },
  { id: "warm", name: "Warm", tone: { warmth: 12, saturation: 110, brightness: 103 } },
  { id: "cool", name: "Cool", tone: { warmth: -14, saturation: 105 } },
  { id: "fade", name: "Fade", tone: { contrast: 85, brightness: 110, saturation: 80 } },
  { id: "noir", name: "Noir", tone: { grayscale: 100, contrast: 140, brightness: 90 } },
]

export const toneCss = (t: Tone): string =>
  `brightness(${t.brightness}%) contrast(${t.contrast}%) saturate(${t.saturation}%) hue-rotate(${t.warmth}deg) blur(${t.blur}px) grayscale(${t.grayscale}%) sepia(${t.sepia}%)`

/** A tone moved part of the way from plain to `to` (strength 0 to 100) */
export function blend(to: Partial<Tone>, strength: number): Tone {
  const k = strength / 100
  const out = { ...NEUTRAL }
  for (const key of Object.keys(NEUTRAL) as Array<keyof Tone>) {
    const target = to[key] ?? NEUTRAL[key]
    out[key] = NEUTRAL[key] + (target - NEUTRAL[key]) * k
  }
  return out
}

/**
 * Opens a picture so its pixels can be read. A provider's address may forbid reading the pixels (and a web page may not fetch it), so a
 * remote file is fetched into memory first, through the desktop app's own HTTP when there is one. Loaded, not decoded: decode() can wait
 * forever on some pictures, and the pixels are ready once the picture has loaded.
 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  let src = url
  let temporary = false
  if (!url.startsWith("blob:") && !url.startsWith("data:")) {
    // The webview's own fetch is fast; the desktop app's HTTP (slow for big files) is only the way round a provider that forbids a web page
    let res: Response
    try {
      res = await fetch(url)
    } catch {
      res = await appFetch(url)
    }
    if (!res.ok) throw new Error(`The picture could not be read (HTTP ${res.status}).`)
    src = URL.createObjectURL(await res.blob())
    temporary = true
  }
  const img = new Image()
  img.src = src
  try {
    if (!img.complete) {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error("The picture could not be opened."))
      })
    }
  } finally {
    if (temporary) URL.revokeObjectURL(src)
  }
  return img
}

const load = loadImage

const png = (canvas: HTMLCanvasElement) =>
  new Promise<string>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("The picture could not be saved."))), "image/png"))

/** The picture with a tone applied */
export async function toned(url: string, tone: Tone): Promise<string> {
  const img = await load(url)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.filter = toneCss(tone)
  ctx.drawImage(img, 0, 0)
  return png(canvas)
}

/** The picture cut to a rectangle (fractions of its width and height) and, when asked, scaled to an exact size */
export async function cropped(url: string, box: { x: number; y: number; w: number; h: number }, size?: { w: number; h: number }): Promise<string> {
  const img = await load(url)
  const sx = Math.round(box.x * img.naturalWidth)
  const sy = Math.round(box.y * img.naturalHeight)
  const sw = Math.max(1, Math.round(box.w * img.naturalWidth))
  const sh = Math.max(1, Math.round(box.h * img.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = size?.w ?? sw
  canvas.height = size?.h ?? sh
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return png(canvas)
}

/** The largest centred rectangle of a shape (width over height) inside a picture, as fractions */
export function centred(imgW: number, imgH: number, ratio: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(imgW, imgH * ratio)
  const h = w / ratio
  return { x: (imgW - w) / 2 / imgW, y: (imgH - h) / 2 / imgH, w: w / imgW, h: h / imgH }
}

export async function sizeOf(url: string): Promise<{ w: number; h: number }> {
  // The size needs no pixels, so the picture is simply opened where it is: nothing is downloaded a second time
  try {
    const probe = new Image()
    probe.src = url
    await new Promise<void>((resolve, reject) => {
      if (probe.complete && probe.naturalWidth > 0) return resolve()
      probe.onload = () => resolve()
      probe.onerror = () => reject(new Error("The picture could not be opened."))
    })
    return { w: probe.naturalWidth, h: probe.naturalHeight }
  } catch {
    const img = await load(url)
    return { w: img.naturalWidth, h: img.naturalHeight }
  }
}

/** The picture as a file in another format (PNG keeps transparency; JPG gets a white page behind it) */
export async function exportAs(url: string, format: "png" | "jpg" | "webp"): Promise<Blob> {
  const img = await load(url)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  if (format === "jpg") {
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0)
  const type = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png"
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be saved."))), type, 0.92))
}

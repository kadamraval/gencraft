/**
 * Picture edits done in the app, with no model: the Adjust groups (light, colour, colour grading, colour mixer, rotate) and nine filters.
 * Each works on a copy of the picture's pixels and returns a new picture as a blob address; the original is never changed.
 */

import { loadImage } from "@/lib/media/image-ops"

export const MIXER_COLOURS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const
export type MixerColour = (typeof MIXER_COLOURS)[number]
/** The hue (degrees) each mixer colour is centred on */
const MIXER_HUE: Record<MixerColour, number> = { red: 0, orange: 30, yellow: 60, green: 120, cyan: 180, blue: 240, purple: 280, pink: 320 }
export const GRADING_RANGES = ["shadows", "midtones", "highlights"] as const
export type GradingRange = (typeof GRADING_RANGES)[number]

export interface AdjustSettings {
  exposure: number
  contrast: number
  brightness: number
  highlights: number
  shadows: number
  saturation: number
  hue: number
  temperature: number
  tint: number
  grading: Record<GradingRange, { hue: number; amount: number; luminance: number }>
  mixer: Record<MixerColour, { hue: number; saturation: number; luminance: number }>
  straighten: number
  flipH: boolean
  flipV: boolean
}

export const adjustDefaults = (): AdjustSettings => ({
  exposure: 0,
  contrast: 0,
  brightness: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  grading: { shadows: { hue: 0, amount: 0, luminance: 0 }, midtones: { hue: 0, amount: 0, luminance: 0 }, highlights: { hue: 0, amount: 0, luminance: 0 } },
  mixer: Object.fromEntries(MIXER_COLOURS.map((c) => [c, { hue: 0, saturation: 0, luminance: 0 }])) as AdjustSettings["mixer"],
  straighten: 0,
  flipH: false,
  flipV: false,
})

export const isNeutral = (a: AdjustSettings): boolean => JSON.stringify(a) === JSON.stringify(adjustDefaults())

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    const x = ((t % 1) + 1) % 1
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p
  }
  return [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)]
}
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** The pixels with the light, colour, grading and mixer settings applied */
export function adjustPixels(data: Uint8ClampedArray, a: AdjustSettings): void {
  const stops = Math.pow(2, a.exposure / 50)
  const grade = GRADING_RANGES.map((range) => ({ range, ...a.grading[range], rgb: hslToRgb(a.grading[range].hue, 1, 0.5) }))
  const mixing = MIXER_COLOURS.filter((c) => a.mixer[c].hue || a.mixer[c].saturation || a.mixer[c].luminance)
  const needHsl = a.hue !== 0 || mixing.length > 0
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]! / 255
    let g = data[i + 1]! / 255
    let b = data[i + 2]! / 255
    r *= stops
    g *= stops
    b *= stops
    const br = a.brightness / 200
    r += br
    g += br
    b += br
    const ct = 1 + a.contrast / 100
    r = (r - 0.5) * ct + 0.5
    g = (g - 0.5) * ct + 0.5
    b = (b - 0.5) * ct + 0.5
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const lift = (a.shadows / 100) * 0.3 * (1 - clamp01(l)) ** 2 + (a.highlights / 100) * 0.3 * clamp01(l) ** 2
    r += lift
    g += lift
    b += lift
    r += a.temperature / 400
    b -= a.temperature / 400
    g -= a.tint / 400
    l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const sat = 1 + a.saturation / 100
    r = l + (r - l) * sat
    g = l + (g - l) * sat
    b = l + (b - l) * sat
    const lw = clamp01(l)
    for (const gr of grade) {
      if (!gr.amount && !gr.luminance) continue
      const w = gr.range === "shadows" ? (1 - lw) ** 2 : gr.range === "highlights" ? lw ** 2 : 4 * lw * (1 - lw)
      const k = (gr.amount / 100) * 0.35 * w
      r += (gr.rgb[0] - 0.5) * k * 2 + (gr.luminance / 100) * 0.3 * w
      g += (gr.rgb[1] - 0.5) * k * 2 + (gr.luminance / 100) * 0.3 * w
      b += (gr.rgb[2] - 0.5) * k * 2 + (gr.luminance / 100) * 0.3 * w
    }
    if (needHsl) {
      let [h, s, v] = rgbToHsl(clamp01(r), clamp01(g), clamp01(b))
      h = (h + a.hue + 360) % 360
      for (const c of mixing) {
        const w = Math.max(0, 1 - hueGap(h, MIXER_HUE[c]) / 40)
        if (w <= 0) continue
        const m = a.mixer[c]
        h = (h + (m.hue / 100) * 30 * w + 360) % 360
        s = clamp01(s * (1 + (m.saturation / 100) * w))
        v = clamp01(v + (m.luminance / 100) * 0.3 * w)
      }
      ;[r, g, b] = hslToRgb(h, s, v)
    }
    data[i] = clamp01(r) * 255
    data[i + 1] = clamp01(g) * 255
    data[i + 2] = clamp01(b) * 255
  }
}

const load = loadImage

const toUrl = (canvas: HTMLCanvasElement) =>
  new Promise<string>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("The picture could not be saved."))), "image/png"))

/** The picture drawn turned and flipped, at `max` pixels on its long side at most */
function drawn(img: HTMLImageElement, a: AdjustSettings, max?: number): HTMLCanvasElement {
  const k = max ? Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)) : 1
  const w = Math.max(1, Math.round(img.naturalWidth * k))
  const h = Math.max(1, Math.round(img.naturalHeight * k))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.translate(w / 2, h / 2)
  ctx.rotate((a.straighten * Math.PI) / 180)
  ctx.scale(a.flipH ? -1 : 1, a.flipV ? -1 : 1)
  // Turning leaves corners empty: the picture is scaled up just enough to fill the frame
  const rad = Math.abs((a.straighten * Math.PI) / 180)
  const fill = Math.cos(rad) + Math.max(w / h, h / w) * Math.sin(rad)
  ctx.scale(Math.max(1, fill), Math.max(1, fill))
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  return canvas
}

/** The picture with the Adjust settings applied; `max` makes a small copy for a live preview */
export async function adjusted(url: string, a: AdjustSettings, max?: number): Promise<string> {
  const img = await load(url)
  const canvas = drawn(img, a, max)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  adjustPixels(pixels.data, a)
  ctx.putImageData(pixels, 0, 0)
  return toUrl(canvas)
}

// ───────────────────────────── Filters ─────────────────────────────

export interface FxControl {
  id: string
  label: string
  min: number
  max: number
  value: number
  unit?: string
}
export interface FxSpec {
  id: string
  name: string
  about: string
  controls: FxControl[]
}

export const FX: FxSpec[] = [
  { id: "grain", name: "Cinematic Film Grain", about: "Film grain with control over amount, size, softness and colour.", controls: [{ id: "amount", label: "Grain amount", min: 0, max: 100, value: 40, unit: "%" }, { id: "size", label: "Grain size", min: 1, max: 6, value: 2 }, { id: "softness", label: "Softness", min: 0, max: 100, value: 20, unit: "%" }, { id: "colour", label: "Colour grain", min: 0, max: 100, value: 30, unit: "%" }] },
  { id: "motion", name: "Cinematic Motion Blur", about: "A directional blur, as a moving camera would leave.", controls: [{ id: "amount", label: "Amount", min: 1, max: 100, value: 30, unit: "%" }, { id: "angle", label: "Angle", min: 0, max: 180, value: 0, unit: "°" }] },
  { id: "droplets", name: "Water Droplets", about: "Drops of water on the lens.", controls: [{ id: "amount", label: "Drops", min: 1, max: 100, value: 40 }, { id: "size", label: "Size", min: 1, max: 100, value: 30 }, { id: "shine", label: "Shine", min: 0, max: 100, value: 60, unit: "%" }] },
  { id: "grade", name: "Color Grade Pro", about: "Contrast, saturation, warmth, tint and a faded look.", controls: [{ id: "contrast", label: "Contrast", min: -100, max: 100, value: 15 }, { id: "saturation", label: "Saturation", min: -100, max: 100, value: 10 }, { id: "temperature", label: "Temperature", min: -100, max: 100, value: 0 }, { id: "tint", label: "Tint", min: -100, max: 100, value: 0 }, { id: "fade", label: "Fade", min: 0, max: 100, value: 0, unit: "%" }] },
  { id: "finish", name: "Photo Finish", about: "Sharpening and a touch of vibrance.", controls: [{ id: "sharpen", label: "Sharpen", min: 0, max: 100, value: 50, unit: "%" }, { id: "vibrance", label: "Vibrance", min: 0, max: 100, value: 30, unit: "%" }] },
  { id: "vignette", name: "Vignette Pro", about: "Darkens the edges to draw the eye in.", controls: [{ id: "amount", label: "Amount", min: 0, max: 100, value: 50, unit: "%" }, { id: "size", label: "Size", min: 10, max: 100, value: 60, unit: "%" }, { id: "softness", label: "Softness", min: 0, max: 100, value: 60, unit: "%" }] },
  { id: "duotone", name: "Duotone", about: "Two colours, one for the shadows and one for the highlights.", controls: [{ id: "shadow", label: "Shadow colour", min: 0, max: 359, value: 240, unit: "°" }, { id: "highlight", label: "Highlight colour", min: 0, max: 359, value: 30, unit: "°" }] },
  { id: "halftone", name: "Halftone", about: "The picture as printed dots.", controls: [{ id: "dot", label: "Dot size", min: 3, max: 30, value: 8 }, { id: "colour", label: "Colour", min: 0, max: 100, value: 100, unit: "%" }] },
  { id: "chromatic", name: "Chromatic", about: "Colour fringes at the edges, like a cheap lens.", controls: [{ id: "amount", label: "Amount", min: 0, max: 40, value: 6, unit: "px" }] },
]

export const fxDefaults = (id: string): Record<string, number> => Object.fromEntries((FX.find((f) => f.id === id)?.controls ?? []).map((c) => [c.id, c.value]))

/** A grey of one level (0-255) at one opacity, as a canvas colour */
const grey = (level: number, alpha: number) => `rgb(${level} ${level} ${level} / ${alpha})`

/** A pseudo-random number from a seed, so a filter looks the same each time it is applied */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

export async function applyFx(url: string, id: string, v: Record<string, number>, max?: number): Promise<string> {
  const img = await load(url)
  const canvas = drawn(img, adjustDefaults(), max)
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const px = () => ctx.getImageData(0, 0, w, h)
  const rand = rng(7)

  if (id === "grain") {
    const d = px()
    const cell = Math.max(1, Math.round(v.size!))
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const n = (rand() - 0.5) * 2 * (v.amount! / 100) * 90
        const c = [(rand() - 0.5) * (v.colour! / 100) * 60, (rand() - 0.5) * (v.colour! / 100) * 60, (rand() - 0.5) * (v.colour! / 100) * 60]
        for (let dy = 0; dy < cell && y + dy < h; dy++) {
          for (let dx = 0; dx < cell && x + dx < w; dx++) {
            const i = ((y + dy) * w + x + dx) * 4
            d.data[i] = d.data[i]! + n + c[0]!
            d.data[i + 1] = d.data[i + 1]! + n + c[1]!
            d.data[i + 2] = d.data[i + 2]! + n + c[2]!
          }
        }
      }
    }
    ctx.putImageData(d, 0, 0)
    if (v.softness! > 0) {
      const copy = document.createElement("canvas")
      copy.width = w
      copy.height = h
      copy.getContext("2d")!.drawImage(canvas, 0, 0)
      ctx.filter = `blur(${(v.softness! / 100) * cell}px)`
      ctx.drawImage(copy, 0, 0)
      ctx.filter = "none"
    }
  } else if (id === "motion") {
    const copy = document.createElement("canvas")
    copy.width = w
    copy.height = h
    copy.getContext("2d")!.drawImage(canvas, 0, 0)
    const len = (v.amount! / 100) * Math.min(w, h) * 0.12
    const rad = (v.angle! * Math.PI) / 180
    const steps = 18
    ctx.clearRect(0, 0, w, h)
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1) - 0.5
      ctx.globalAlpha = 1 / (i + 1)
      ctx.drawImage(copy, Math.cos(rad) * len * t, Math.sin(rad) * len * t)
    }
    ctx.globalAlpha = 1
  } else if (id === "droplets") {
    const copy = document.createElement("canvas")
    copy.width = w
    copy.height = h
    copy.getContext("2d")!.drawImage(canvas, 0, 0)
    const count = Math.round(v.amount! * 1.2)
    for (let i = 0; i < count; i++) {
      const r = (4 + rand() * (v.size! / 100) * Math.min(w, h) * 0.06) | 0
      const x = rand() * w
      const y = rand() * h
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.clip()
      // The drop shows the picture turned over and enlarged, as a lens would
      ctx.translate(x, y)
      ctx.scale(-1.6, -1.6)
      ctx.drawImage(copy, -x, -y)
      ctx.restore()
      const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r)
      shine.addColorStop(0, `${grey(255, 0.6 * (v.shine! / 100))}`)
      shine.addColorStop(0.5, grey(255, 0))
      shine.addColorStop(1, `${grey(0, 0.35 * (v.shine! / 100))}`)
      ctx.fillStyle = shine
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (id === "grade") {
    const d = px()
    const a = adjustDefaults()
    a.contrast = v.contrast!
    a.saturation = v.saturation!
    a.temperature = v.temperature!
    a.tint = v.tint!
    adjustPixels(d.data, a)
    const fade = (v.fade! / 100) * 60
    if (fade) for (let i = 0; i < d.data.length; i += 4) for (let k = 0; k < 3; k++) d.data[i + k] = d.data[i + k]! * (1 - fade / 255) + fade
    ctx.putImageData(d, 0, 0)
  } else if (id === "finish") {
    const d = px()
    const src = new Uint8ClampedArray(d.data)
    const k = v.sharpen! / 100
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4
        for (let c = 0; c < 3; c++) {
          const blur = (src[i + c - 4]! + src[i + c + 4]! + src[i + c - w * 4]! + src[i + c + w * 4]!) / 4
          d.data[i + c] = src[i + c]! + (src[i + c]! - blur) * k * 1.5
        }
      }
    }
    // Vibrance lifts the colours that are still dull and leaves the strong ones
    for (let i = 0; i < d.data.length; i += 4) {
      const mx = Math.max(d.data[i]!, d.data[i + 1]!, d.data[i + 2]!)
      const mn = Math.min(d.data[i]!, d.data[i + 1]!, d.data[i + 2]!)
      const dull = 1 - (mx - mn) / 255
      const lum = 0.299 * d.data[i]! + 0.587 * d.data[i + 1]! + 0.114 * d.data[i + 2]!
      const boost = 1 + (v.vibrance! / 100) * dull * 0.8
      for (let c = 0; c < 3; c++) d.data[i + c] = lum + (d.data[i + c]! - lum) * boost
    }
    ctx.putImageData(d, 0, 0)
  } else if (id === "vignette") {
    const g = ctx.createRadialGradient(w / 2, h / 2, (Math.min(w, h) / 2) * (v.size! / 100) * (1 - v.softness! / 130), w / 2, h / 2, Math.hypot(w, h) / 2)
    g.addColorStop(0, grey(0, 0))
    g.addColorStop(1, grey(0, v.amount! / 100))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  } else if (id === "duotone") {
    const d = px()
    const lo = hslToRgb(v.shadow!, 0.7, 0.35)
    const hi = hslToRgb(v.highlight!, 0.8, 0.7)
    for (let i = 0; i < d.data.length; i += 4) {
      const l = (0.299 * d.data[i]! + 0.587 * d.data[i + 1]! + 0.114 * d.data[i + 2]!) / 255
      for (let c = 0; c < 3; c++) d.data[i + c] = (lo[c]! + (hi[c]! - lo[c]!) * l) * 255
    }
    ctx.putImageData(d, 0, 0)
  } else if (id === "halftone") {
    const d = px()
    const cell = Math.round(v.dot!)
    ctx.fillStyle = "black"
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const i = (Math.min(h - 1, y + (cell >> 1)) * w + Math.min(w - 1, x + (cell >> 1))) * 4
        const r = d.data[i]!
        const g2 = d.data[i + 1]!
        const b = d.data[i + 2]!
        const l = (0.299 * r + 0.587 * g2 + 0.114 * b) / 255
        const mix = v.colour! / 100
        const grey = l * 255
        ctx.fillStyle = `rgb(${grey + (r - grey) * mix},${grey + (g2 - grey) * mix},${grey + (b - grey) * mix})`
        ctx.beginPath()
        ctx.arc(x + cell / 2, y + cell / 2, (cell / 2) * Math.sqrt(0.15 + l), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (id === "chromatic") {
    const d = px()
    const src = new Uint8ClampedArray(d.data)
    const shift = Math.round(v.amount!)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        d.data[i] = src[(y * w + Math.min(w - 1, x + shift)) * 4]!
        d.data[i + 2] = src[(y * w + Math.max(0, x - shift)) * 4 + 2]!
      }
    }
    ctx.putImageData(d, 0, 0)
  }
  return toUrl(canvas)
}

/** A cut-out subject drawn over the original, each with its own colour changes: Background adjust and Foreground adjust */
export async function composited(originalUrl: string, cutoutUrl: string, background: Tone4, foreground: Tone4): Promise<string> {
  const [base, cut] = await Promise.all([load(originalUrl), load(cutoutUrl)])
  const canvas = document.createElement("canvas")
  canvas.width = base.naturalWidth
  canvas.height = base.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.filter = css(background)
  ctx.drawImage(base, 0, 0)
  ctx.filter = css(foreground)
  ctx.drawImage(cut, 0, 0, canvas.width, canvas.height)
  ctx.filter = "none"
  return toUrl(canvas)
}

/** A mark drawn on the picture to say where a change goes: a brush stroke (a line with a width) or a closed area, in the picture's own pixels */
export interface Stroke {
  kind: "brush" | "area" | "pin" | "mask"
  size: number
  pts: Array<[number, number]>
  /** A numbered pin: its number */
  n?: number
  /** A selected region: a picture, white where it is selected */
  mask?: string
}

/** The region of similar colour around a point (a magic wand), as a mask picture: white where selected */
export async function wand(url: string, x: number, y: number, tolerance = 40): Promise<string> {
  const img = await load(url)
  const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * k))
  const h = Math.max(1, Math.round(img.naturalHeight * k))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const sx = Math.min(w - 1, Math.max(0, Math.round(x * k)))
  const sy = Math.min(h - 1, Math.max(0, Math.round(y * k)))
  const s0 = (sy * w + sx) * 4
  const seed = [d[s0]!, d[s0 + 1]!, d[s0 + 2]!]
  const seen = new Uint8Array(w * h)
  const out = ctx.createImageData(w, h)
  const stack = [sy * w + sx]
  seen[sy * w + sx] = 1
  while (stack.length) {
    const at = stack.pop()!
    const i = at * 4
    if (Math.max(Math.abs(d[i]! - seed[0]!), Math.abs(d[i + 1]! - seed[1]!), Math.abs(d[i + 2]! - seed[2]!)) > tolerance) continue
    out.data[i] = out.data[i + 1] = out.data[i + 2] = out.data[i + 3] = 255
    const px = at % w
    const py = (at - px) / w
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = ny * w + nx
      if (!seen[n]) {
        seen[n] = 1
        stack.push(n)
      }
    }
  }
  ctx.putImageData(out, 0, 0)
  return toUrl(canvas)
}

/** The picture with its marks painted over it, translucent, so a model can be told to change only the marked area */
export async function markedPicture(url: string, strokes: Stroke[], colour: string): Promise<string> {
  const img = await load(url)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)
  ctx.globalAlpha = 0.55
  ctx.strokeStyle = colour
  ctx.fillStyle = colour
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  for (const s of strokes) {
    if (s.kind === "mask" && s.mask) {
      const m = await load(s.mask)
      const tint = document.createElement("canvas")
      tint.width = canvas.width
      tint.height = canvas.height
      const t = tint.getContext("2d")!
      t.drawImage(m, 0, 0, tint.width, tint.height)
      t.globalCompositeOperation = "source-in"
      t.fillStyle = colour
      t.fillRect(0, 0, tint.width, tint.height)
      ctx.drawImage(tint, 0, 0)
      continue
    }
    if (s.kind === "pin" && s.pts[0]) {
      const r = Math.max(14, Math.min(canvas.width, canvas.height) * 0.03)
      ctx.globalAlpha = 1
      ctx.fillStyle = colour
      ctx.beginPath()
      ctx.arc(s.pts[0][0], s.pts[0][1], r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "white"
      ctx.font = `bold ${Math.round(r * 1.2)}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(s.n ?? 1), s.pts[0][0], s.pts[0][1])
      ctx.globalAlpha = 0.55
      ctx.fillStyle = colour
      continue
    }
    if (s.pts.length === 0) continue
    ctx.beginPath()
    ctx.moveTo(s.pts[0]![0], s.pts[0]![1])
    for (const p of s.pts.slice(1)) ctx.lineTo(p[0], p[1])
    if (s.kind === "area") {
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.lineWidth = s.size
      if (s.pts.length === 1) ctx.lineTo(s.pts[0]![0] + 0.01, s.pts[0]![1])
      ctx.stroke()
    }
  }
  return toUrl(canvas)
}

/** The marks as a mask picture the size of the original: white where the model should work, black everywhere else. Pins are positions, not areas, so they are left out. */
export async function maskOf(strokes: Stroke[], w: number, h: number): Promise<string> {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = "white"
  ctx.fillStyle = "white"
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  for (const s of strokes) {
    if (s.kind === "mask" && s.mask) {
      ctx.drawImage(await load(s.mask), 0, 0, w, h)
      continue
    }
    if (s.kind === "pin" || s.pts.length === 0) continue
    ctx.beginPath()
    ctx.moveTo(s.pts[0]![0], s.pts[0]![1])
    for (const p of s.pts.slice(1)) ctx.lineTo(p[0], p[1])
    if (s.kind === "area") {
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.lineWidth = s.size
      if (s.pts.length === 1) ctx.lineTo(s.pts[0]![0] + 0.01, s.pts[0]![1])
      ctx.stroke()
    }
  }
  return toUrl(canvas)
}

export interface Tone4 {
  blur: number
  grayscale: number
  sepia: number
  brightness: number
  contrast: number
  saturation: number
}
export const tone4Defaults = (): Tone4 => ({ blur: 0, grayscale: 0, sepia: 0, brightness: 100, contrast: 100, saturation: 100 })
const css = (t: Tone4) => `blur(${t.blur}px) grayscale(${t.grayscale}%) sepia(${t.sepia}%) brightness(${t.brightness}%) contrast(${t.contrast}%) saturate(${t.saturation}%)`

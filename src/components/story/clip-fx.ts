import type * as React from "react"
import { resolveKeys, type CaptionStyle, type ClipFx } from "./edit-model"

/**
 * How a clip's look is drawn. The preview uses CSS and the export uses the canvas, and both read the numbers
 * through these functions so a cut looks the same in both.
 */

export const FX_DEFAULT = { opacity: 100, scale: 100, x: 0, y: 0, rotation: 0, speed: 100, brightness: 100, contrast: 100, saturation: 100, blur: 0, fadeIn: 0, fadeOut: 0, volume: 1, crop: 0 } as const

const BLEND: Record<NonNullable<ClipFx["blend"]>, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
}

const CAPTION_SIZE = { s: 28, m: 40, l: 56, xl: 76 } as const

/**
 * How a caption is drawn at a time inside it, on a picture 720 pixels on its short side: the type size in pixels, where it sits
 * (a share of the height from the top), how visible it is and how far it has risen. The preview and the export share it.
 */
export const CAPTION_FONT = {
  sans: "system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', monospace",
  display: "Impact, 'Arial Black', sans-serif",
  condensed: "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', sans-serif",
  rounded: "'Trebuchet MS', 'Segoe UI', 'Arial Rounded MT Bold', sans-serif",
  script: "'Segoe Script', 'Brush Script MT', cursive",
} as const
export const CAPTION_COLOR = { white: "#fff", yellow: "#ffd400", black: "#000", red: "#ff3b30", cyan: "#22d3ee", orange: "#ff8a00", green: "#22c55e", pink: "#ff4fa3", blue: "#3b82f6", lime: "#a3e635" } as const // allow-color
const SPACING = { tight: -0.02, normal: 0, wide: 0.12 } as const
const DARK_TEXT = "#111" // allow-color

/** Whether dark letters read better than white ones on a plate of this colour */
const darkOn = (hex: string) => {
  const n = parseInt(hex.slice(1).length === 3 ? hex.slice(1).replace(/./g, (d) => d + d) : hex.slice(1), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.55
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export function captionLook(style: CaptionStyle | undefined, into: number, duration: number) {
  const size = CAPTION_SIZE[style?.size ?? "m"]
  const position = style?.position ?? "bottom"
  const y = position === "top" ? 0.12 : position === "middle" ? 0.5 : 0.88
  const edge = Math.min(0.3, duration / 3)
  const t = Math.max(0, Math.min(1, Math.min(into, duration - into) / edge))
  const animation = style?.animation ?? "none"
  const grow = Math.max(0, Math.min(1, into / edge))
  const exit = Math.max(0, Math.min(1, (duration - into) / edge))
  const typed = animation === "typewriter" ? Math.max(0, Math.min(1, into / Math.max(0.2, Math.min(duration * 0.6, 2)))) : 1
  const colorId = style?.color ?? "white"
  const mode = style?.look ?? "outline"
  const accent = CAPTION_COLOR[colorId]
  const box = mode === "box" || mode === "boxlight" || mode === "boxcolor"
  const boxFill = mode === "box" ? "rgba(0,0,0,0.7)" : mode === "boxlight" ? "rgba(255,255,255,0.92)" : mode === "boxcolor" ? accent : undefined // allow-color
  return {
    size,
    y,
    alpha: animation === "none" || animation === "typewriter" ? 1 : animation === "pop" ? exit : animation === "bounce" ? Math.min(1, grow * 4) * exit : t,
    rise: animation === "rise" ? (1 - t) * 24 : animation === "slide" ? (1 - t) * 46 : 0,
    /** Pop and bounce: the title springs up to size at its start. Zoom: it settles in from larger. */
    scale: animation === "pop" ? 0.6 + 0.4 * (1 - Math.pow(1 - grow, 3)) : animation === "bounce" ? 0.35 + 0.65 * easeOutBack(grow) : animation === "zoom" ? 1.35 - 0.35 * (1 - Math.pow(1 - grow, 3)) : 1,
    /** Typewriter: the share of the letters shown so far */
    typed,
    position,
    font: CAPTION_FONT[style?.font ?? "sans"],
    // Letters on a light plate are dark; on a colour plate dark or white, whichever reads
    fill: mode === "boxlight" ? DARK_TEXT : mode === "boxcolor" ? (darkOn(accent) ? DARK_TEXT : CAPTION_COLOR.white) : mode === "neon" ? CAPTION_COLOR.white : accent,
    // A dark word needs a light edge and the other way round
    edge: colorId === "black" ? CAPTION_COLOR.white : CAPTION_COLOR.black,
    mode,
    box,
    boxFill,
    /** The colour of the glow, for glow and neon */
    glow: accent,
    upper: style?.case === "upper",
    spacing: SPACING[style?.spacing ?? "normal"],
    italic: style?.italic === true,
  }
}

/** The CSS for caption text in a look: its font, colour, plate and how the letters are kept readable. The preview and the style cards share it. */
export function captionCss(look: ReturnType<typeof captionLook>): React.CSSProperties {
  const g = look.glow
  return {
    fontFamily: look.font,
    color: look.fill,
    textShadow:
      look.mode === "outline"
        ? `0 0 3px ${look.edge}, 0 0 3px ${look.edge}, 0 0 3px ${look.edge}`
        : look.mode === "shadow"
          ? `0 2px 6px ${CAPTION_COLOR.black}`
          : look.mode === "glow"
            ? `0 0 6px ${g}, 0 0 16px ${g}, 0 0 30px ${g}`
            : look.mode === "neon"
              ? `0 0 4px #fff, 0 0 10px ${g}, 0 0 22px ${g}, 0 0 42px ${g}` // allow-color
              : undefined,
    WebkitTextStroke: look.mode === "stroke" ? `0.14em ${look.edge}` : undefined,
    paintOrder: look.mode === "stroke" ? "stroke fill" : undefined,
    backgroundColor: look.boxFill,
    padding: look.box ? "0.08em 0.5em" : undefined,
    borderRadius: look.box ? "0.22em" : undefined,
    textTransform: look.upper ? "uppercase" : undefined,
    letterSpacing: look.spacing ? `${look.spacing}em` : undefined,
    fontStyle: look.italic ? "italic" : undefined,
  }
}

/** 0 to 1: how far through its fade in and fade out a clip is at a time inside it */
export function fadeFactor(fx: ClipFx | undefined, into: number, duration: number): number {
  const fin = fx?.fadeIn ?? 0
  const fout = fx?.fadeOut ?? 0
  const up = fin > 0 ? Math.min(1, into / fin) : 1
  const down = fout > 0 ? Math.min(1, (duration - into) / fout) : 1
  return Math.max(0, Math.min(1, up * down))
}

/** 0 to 1: how much of the clip shows, with the fades at its start and end */
export function fxAlpha(fx: ClipFx | undefined, into: number, duration: number): number {
  return Math.max(0, Math.min(1, ((fx?.opacity ?? FX_DEFAULT.opacity) / 100) * fadeFactor(fx, into, duration)))
}

const filterOf = (fx: ClipFx | undefined, blurScale: number) => {
  const parts: string[] = []
  if (fx?.brightness !== undefined && fx.brightness !== 100) parts.push(`brightness(${fx.brightness}%)`)
  if (fx?.contrast !== undefined && fx.contrast !== 100) parts.push(`contrast(${fx.contrast}%)`)
  if (fx?.saturation !== undefined && fx.saturation !== 100) parts.push(`saturate(${fx.saturation}%)`)
  if (fx?.blur) parts.push(`blur(${fx.blur * blurScale}px)`)
  return parts.length ? parts.join(" ") : "none"
}

/** The style of the picture in the preview. `width` is the preview's width, so blur matches the 1280 wide export. */
export function fxStyle(raw: ClipFx | undefined, into: number, duration: number, width: number): React.CSSProperties {
  const fx = resolveKeys(raw, into)
  const s = (fx?.scale ?? FX_DEFAULT.scale) / 100
  const crop = [fx?.cropT ?? 0, fx?.cropR ?? 0, fx?.cropB ?? 0, fx?.cropL ?? 0]
  return {
    opacity: fxAlpha(fx, into, duration),
    transform: `translate(${fx?.x ?? 0}%, ${fx?.y ?? 0}%) rotate(${fx?.rotation ?? 0}deg) scale(${fx?.flipH ? -s : s}, ${fx?.flipV ? -s : s})`,
    filter: filterOf(fx, width > 0 ? width / 1280 : 1),
    mixBlendMode: fx?.blend && fx.blend !== "normal" ? fx.blend : undefined,
    clipPath: crop.some((c) => c > 0) ? `inset(${crop[0]}% ${crop[1]}% ${crop[2]}% ${crop[3]}%)` : undefined,
  }
}

/** Puts the picture where the look says (position, turn, flip, crop, scale), with no colour or fade, on any canvas */
function drawLayer(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, W: number, H: number, fx: ClipFx | undefined) {
  const k = (fx?.scale ?? FX_DEFAULT.scale) / 100
  const fit = Math.min(W / sw, H / sh) * k
  ctx.save()
  ctx.translate(W / 2 + ((fx?.x ?? 0) / 100) * W, H / 2 + ((fx?.y ?? 0) / 100) * H)
  ctx.rotate(((fx?.rotation ?? 0) * Math.PI) / 180)
  ctx.scale(fx?.flipH ? -1 : 1, fx?.flipV ? -1 : 1)
  const l = fx?.cropL ?? 0
  const t = fx?.cropT ?? 0
  const r = fx?.cropR ?? 0
  const b = fx?.cropB ?? 0
  if (l + t + r + b > 0) {
    ctx.beginPath()
    ctx.rect((-W / 2 + (l / 100) * W) * k, (-H / 2 + (t / 100) * H) * k, W * (1 - (l + r) / 100) * k, H * (1 - (t + b) / 100) * k)
    ctx.clip()
  }
  ctx.drawImage(source, (-sw * fit) / 2, (-sh * fit) / 2, sw * fit, sh * fit)
  ctx.restore()
}

/** Safari and the macOS desktop window draw with no canvas filter; there the colour is worked out pixel by pixel */
const canvasFilterWorks = (ctx: CanvasRenderingContext2D) => "filter" in ctx

let scratch: HTMLCanvasElement | null = null
let small: HTMLCanvasElement | null = null

/** The same brightness, contrast, saturation and blur as the CSS filter, in that order, on a canvas */
function filterPixels(c: HTMLCanvasElement, fx: ClipFx) {
  const g = c.getContext("2d", { willReadFrequently: true })
  if (!g) return
  const bright = (fx.brightness ?? 100) / 100
  const contrast = (fx.contrast ?? 100) / 100
  const sat = (fx.saturation ?? 100) / 100
  if (bright !== 1 || contrast !== 1 || sat !== 1) {
    const img = g.getImageData(0, 0, c.width, c.height)
    const d = img.data
    const m = [0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat, 0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat, 0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat]
    const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i]! * bright
      let gg = d[i + 1]! * bright
      let b = d[i + 2]! * bright
      r = (r - 127.5) * contrast + 127.5
      gg = (gg - 127.5) * contrast + 127.5
      b = (b - 127.5) * contrast + 127.5
      d[i] = clamp(m[0]! * r + m[1]! * gg + m[2]! * b)
      d[i + 1] = clamp(m[3]! * r + m[4]! * gg + m[5]! * b)
      d[i + 2] = clamp(m[6]! * r + m[7]! * gg + m[8]! * b)
    }
    g.putImageData(img, 0, 0)
  }
  if (fx.blur && fx.blur > 0) {
    // Blur by drawing small and large again, which is cheap and close enough for a soft look
    const f = 1 + fx.blur / 2
    small = small ?? document.createElement("canvas")
    small.width = Math.max(1, Math.round(c.width / f))
    small.height = Math.max(1, Math.round(c.height / f))
    const sg = small.getContext("2d")
    if (!sg) return
    sg.imageSmoothingQuality = "high"
    sg.clearRect(0, 0, small.width, small.height)
    sg.drawImage(c, 0, 0, small.width, small.height)
    g.save()
    g.globalCompositeOperation = "copy"
    g.imageSmoothingQuality = "high"
    g.drawImage(small, 0, 0, c.width, c.height)
    g.restore()
  }
}

/** Draws a picture or a video frame onto the export canvas the way the preview shows it */
export function drawWithFx(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, W: number, H: number, raw: ClipFx | undefined, into: number, duration: number) {
  const fx = resolveKeys(raw, into)
  const filter = filterOf(fx, 1)
  ctx.save()
  ctx.globalAlpha = fxAlpha(fx, into, duration)
  ctx.globalCompositeOperation = BLEND[fx?.blend ?? "normal"]
  if (filter === "none" || canvasFilterWorks(ctx)) {
    ctx.filter = filter
    drawLayer(ctx, source, sw, sh, W, H, fx)
  } else if (fx) {
    scratch = scratch ?? document.createElement("canvas")
    if (scratch.width !== W || scratch.height !== H) {
      scratch.width = W
      scratch.height = H
    }
    const sg = scratch.getContext("2d", { willReadFrequently: true })
    if (sg) {
      sg.clearRect(0, 0, W, H)
      drawLayer(sg, source, sw, sh, W, H, fx)
      filterPixels(scratch, fx)
      ctx.drawImage(scratch, 0, 0)
    }
  }
  ctx.restore()
}

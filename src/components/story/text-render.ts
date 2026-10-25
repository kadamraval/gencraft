import { trackOf } from "./edit-model"
import type { EditCaption, EditProject, RichText, TextAnim } from "./edit-model"

/**
 * Draws text layers on a 2D canvas. The preview draws them on a canvas over the picture and the export draws them on the frame,
 * both with this one function, so a title looks the same in both. Sizes are on a picture 720 pixels on its short side.
 */

const SYSTEM = "system-ui, 'Segoe UI', Arial, sans-serif"
export const fontStack = (family: string): string => (family ? `"${family}", ${SYSTEM}` : SYSTEM)

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
const easeOutBack = (p: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

interface Anim {
  alpha: number
  /** Offsets in design pixels (720 short side) */
  dx: number
  dy: number
  scale: number
  blur: number
  /** 0 to 1: how much of a wipe or of the typed letters shows, or how far the letters have come in */
  reveal: number
  mode: "plain" | "wipe" | "typewriter" | "letters"
}

/** The state of an animation when it is `p` of the way (0 hidden, 1 settled) */
function animate(kind: TextAnim, p: number): Anim {
  const e = easeOut(p)
  const base: Anim = { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0, reveal: 1, mode: "plain" }
  switch (kind) {
    case "fade":
      return { ...base, alpha: p }
    case "slide-up":
      return { ...base, alpha: e, dy: (1 - e) * 70 }
    case "slide-down":
      return { ...base, alpha: e, dy: -(1 - e) * 70 }
    case "slide-left":
      return { ...base, alpha: e, dx: (1 - e) * 160 }
    case "slide-right":
      return { ...base, alpha: e, dx: -(1 - e) * 160 }
    case "pop":
      return { ...base, alpha: Math.min(1, p * 3), scale: 0.6 + 0.4 * e }
    case "bounce":
      return { ...base, alpha: Math.min(1, p * 4), scale: 0.3 + 0.7 * easeOutBack(p) }
    case "zoom":
      return { ...base, alpha: e, scale: 1.4 - 0.4 * e }
    case "blur":
      return { ...base, alpha: e, blur: (1 - e) * 16 }
    case "wipe":
      return { ...base, mode: "wipe", reveal: e }
    case "typewriter":
      return { ...base, mode: "typewriter", reveal: p }
    case "letters":
      return { ...base, mode: "letters", reveal: p }
    default:
      return base
  }
}

const both = (a: Anim, b: Anim): Anim => ({
  alpha: a.alpha * b.alpha,
  dx: a.dx + b.dx,
  dy: a.dy + b.dy,
  scale: a.scale * b.scale,
  blur: Math.max(a.blur, b.blur),
  reveal: Math.min(a.reveal, b.reveal),
  mode: a.mode !== "plain" ? a.mode : b.mode,
})

const applyCase = (text: string, c: RichText["case"]) => (c === "upper" ? text.toUpperCase() : c === "lower" ? text.toLowerCase() : text)

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split("\n")) {
    let line = ""
    for (const word of para.split(" ")) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line)
        line = word
      } else line = test
    }
    lines.push(line)
  }
  return lines
}

/** The size of a layer's block on a frame W by H, for a handle or a hit test: its middle and its width and height in pixels */
export function richBounds(ctx: CanvasRenderingContext2D, cap: EditCaption, W: number, H: number): { cx: number; cy: number; w: number; h: number } | null {
  const r = cap.rich
  if (!r) return null
  const k = Math.min(W, H) / 720
  const px = r.size * k
  ctx.save()
  ctx.font = `${r.italic ? "italic " : ""}${r.weight} ${px}px ${fontStack(r.family)}`
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${((r.spacing / 100) * px).toFixed(2)}px`
  const lines = wrap(ctx, applyCase(cap.text, r.case), (r.width / 100) * W)
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width))
  ctx.restore()
  return { cx: (r.x / 100) * W, cy: (r.y / 100) * H, w, h: lines.length * px * r.lineHeight }
}

/** Draws one text layer at a time `t` on the cut */
export function drawRichText(ctx: CanvasRenderingContext2D, cap: EditCaption, t: number, W: number, H: number) {
  const r = cap.rich
  if (!r || !cap.text) return
  const into = t - cap.start
  const dur = cap.duration
  if (into < 0 || into >= dur) return
  const inLen = r.animIn && r.animIn.kind !== "none" ? Math.max(0.05, Math.min(r.animIn.duration, dur / 2)) : 0
  const outLen = r.animOut && r.animOut.kind !== "none" ? Math.max(0.05, Math.min(r.animOut.duration, dur / 2)) : 0
  const pIn = inLen ? clamp(into / inLen) : 1
  const pOut = outLen ? clamp((dur - into) / outLen) : 1
  const a = both(animate(r.animIn?.kind ?? "none", pIn), animate(r.animOut?.kind ?? "none", pOut))
  if (a.alpha <= 0.001 || a.reveal <= 0) return

  const k = Math.min(W, H) / 720
  const px = r.size * k
  ctx.save()
  ctx.font = `${r.italic ? "italic " : ""}${r.weight} ${px}px ${fontStack(r.family)}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  ctx.lineJoin = "round"
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${((r.spacing / 100) * px).toFixed(2)}px`
  const text = applyCase(cap.text, r.case)
  const lines = wrap(ctx, text, (r.width / 100) * W)
  const lineH = px * r.lineHeight
  const widths = lines.map((l) => ctx.measureText(l).width)
  const bw = Math.max(...widths)
  const bh = lines.length * lineH

  ctx.globalAlpha = Math.max(0, Math.min(1, a.alpha * (r.opacity / 100)))
  ctx.translate((r.x / 100) * W + a.dx * k, (r.y / 100) * H + a.dy * k)
  if (r.rotation) ctx.rotate((r.rotation * Math.PI) / 180)
  if (a.scale !== 1) ctx.scale(a.scale, a.scale)
  if (a.blur > 0 && "filter" in ctx) ctx.filter = `blur(${(a.blur * k).toFixed(2)}px)`

  const padX = (r.bg?.padX ?? 0) * k
  const padY = (r.bg?.padY ?? 0) * k
  if (a.mode === "wipe") {
    ctx.beginPath()
    ctx.rect(-bw / 2 - padX - 4 * k, -bh / 2 - padY - 4 * k, (bw + padX * 2 + 8 * k) * a.reveal, bh + padY * 2 + 8 * k)
    ctx.clip()
  }

  // The plate behind the text
  if (r.bg && r.bg.opacity > 0) {
    ctx.save()
    ctx.globalAlpha *= r.bg.opacity / 100
    ctx.fillStyle = r.bg.color
    ctx.beginPath()
    ctx.roundRect(-bw / 2 - padX, -bh / 2 - padY, bw + padX * 2, bh + padY * 2, Math.min(r.bg.radius * k, (bh + padY * 2) / 2))
    ctx.fill()
    ctx.restore()
  }

  // The fill: one colour, or a blend across the block
  let fill: string | CanvasGradient = r.color
  if (r.gradient) {
    const th = (r.gradient.angle * Math.PI) / 180
    const len = Math.abs(bw * Math.cos(th)) + Math.abs(bh * Math.sin(th))
    const g = ctx.createLinearGradient((-Math.cos(th) * len) / 2, (-Math.sin(th) * len) / 2, (Math.cos(th) * len) / 2, (Math.sin(th) * len) / 2)
    g.addColorStop(0, r.color)
    g.addColorStop(1, r.gradient.color)
    fill = g
  }

  const paint = (str: string, x: number, y: number, extraAlpha = 1) => {
    if (!str) return
    const keep = ctx.globalAlpha
    ctx.globalAlpha = keep * extraAlpha
    if (r.glow && r.glow.blur > 0) {
      ctx.shadowColor = r.glow.color
      ctx.shadowBlur = r.glow.blur * k
      ctx.fillStyle = fill
      ctx.fillText(str, x, y)
      ctx.fillText(str, x, y)
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
    }
    if (r.shadow && (r.shadow.blur > 0 || r.shadow.x !== 0 || r.shadow.y !== 0)) {
      ctx.shadowColor = r.shadow.color
      ctx.shadowBlur = r.shadow.blur * k
      ctx.shadowOffsetX = r.shadow.x * k
      ctx.shadowOffsetY = r.shadow.y * k
      ctx.fillStyle = fill
      ctx.fillText(str, x, y)
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    }
    if (r.stroke && r.stroke.width > 0) {
      ctx.lineWidth = r.stroke.width * 2 * k
      ctx.strokeStyle = r.stroke.color
      ctx.strokeText(str, x, y)
    }
    ctx.fillStyle = fill
    ctx.fillText(str, x, y)
    ctx.globalAlpha = keep
  }

  const total = lines.reduce((n, l) => n + [...l].filter((c) => c !== " ").length, 0)
  let drawn = 0
  lines.forEach((line, i) => {
    const x0 = r.align === "left" ? -bw / 2 : r.align === "right" ? bw / 2 - widths[i]! : -widths[i]! / 2
    const y = -bh / 2 + i * lineH + lineH / 2
    if (a.mode === "typewriter") {
      const show = Math.max(0, Math.ceil(total * a.reveal) - drawn)
      let seen = 0
      const part = [...line].filter((ch) => (ch === " " ? seen < show : ++seen <= show)).join("")
      paint(part, x0, y)
    } else if (a.mode === "letters") {
      // Each letter comes in a little after the one before it
      const chars = [...line]
      chars.forEach((ch, ci) => {
        if (ch === " ") return
        const n = drawn + chars.slice(0, ci).filter((c) => c !== " ").length
        const local = clamp((a.reveal - (n / Math.max(1, total)) * 0.6) / 0.4)
        if (local <= 0) return
        const e = easeOut(local)
        paint(ch, x0 + ctx.measureText(chars.slice(0, ci).join("")).width, y + (1 - e) * px * 0.5, e)
      })
    } else paint(line, x0, y)
    drawn += [...line].filter((c) => c !== " ").length
  })
  ctx.restore()
}

/** Draws every text layer showing at a time. Muted captions row hides them too. */
export function drawTexts(ctx: CanvasRenderingContext2D, p: EditProject, t: number, W: number, H: number) {
  if (trackOf(p, "captions").mute) return
  for (const cap of p.captions) if (cap.rich && t >= cap.start && t < cap.start + cap.duration) drawRichText(ctx, cap, t, W, H)
}

import * as React from "react"
import { cn } from "@/lib/utils"
import { captionCss, captionLook, fxStyle } from "./clip-fx"
import { PREVIEW_H, PREVIEW_W, paintEffect, previewCompositor } from "./preview-gpu"
import type { ClipFx } from "./edit-model"
import type { CaptionStyleCard, FxPreset, TransitionKind } from "./fx-presets"

/** What a card carries when it is dragged onto the timeline */
export const FX_MIME = "application/x-gencraft-fx"
export type FxDrag = { type: "effect"; id: string } | { type: "transition"; id: TransitionKind } | { type: "overlap"; id: string }

/** A picture to show an effect on: a frame of the cut when there is one, otherwise a plain sample with shapes that make every effect visible */
export interface SampleMedia {
  url: string
  kind: "video" | "image"
}

function SamplePicture({ media, variant = 0, style }: { media?: SampleMedia; variant?: 0 | 1; style?: React.CSSProperties }) {
  if (media?.kind === "image") return <img src={media.url} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={style} />
  if (media?.kind === "video") return <video src={`${media.url}#t=0.5`} muted playsInline preload="metadata" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={style} />
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br", variant === 0 ? "from-primary/70 to-secondary" : "from-secondary to-primary/40")} style={style}>
      <div className={cn("absolute rounded-full bg-foreground/80", variant === 0 ? "left-1/4 top-1/4 h-6 w-6" : "right-1/4 top-1/4 h-6 w-6")} />
      <div className="absolute bottom-0 left-0 h-1/3 w-2/3 rounded-tr-full bg-foreground/40" />
      <div className="absolute bottom-2 right-3 h-3 w-8 rounded-sm bg-foreground/60" />
    </div>
  )
}

const dragStart = (e: React.DragEvent, payload: FxDrag) => {
  e.dataTransfer.setData(FX_MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = "copy"
}

const CARD = "group relative cursor-grab overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-select focus-visible:border-select focus-visible:outline-none active:cursor-grabbing"

const gpuCards = previewCompositor() !== null

/** A sample photo drawn through a look by the graphics card, so grades, glow, grain and light leaks show as they will in the cut. It moves while `animate` is on. */
function GpuPicture({ fx, animate }: { fx: ClipFx; animate: boolean }) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const el = canvas.current
    if (!el) return
    if (!animate) {
      paintEffect(el, fx, 1)
      return
    }
    let raf = 0
    const run = (now: number) => {
      paintEffect(el, fx, now / 1000)
      raf = requestAnimationFrame(run)
    }
    raf = requestAnimationFrame(run)
    return () => cancelAnimationFrame(raf)
  }, [fx, animate])
  return <canvas ref={canvas} width={PREVIEW_W} height={PREVIEW_H} className="pointer-events-none absolute inset-0 h-full w-full" />
}

/** One look on a small card, shown on a picture. Click it for the selected clip, or drag it onto any clip on the timeline. */
export function EffectCard({ preset, media, onApply }: { preset: FxPreset; media?: SampleMedia; onApply: () => void }) {
  const speed = preset.patch.speed
  const [hover, setHover] = React.useState(false)
  return (
    <div role="button" tabIndex={0} draggable onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label={`${preset.label}: click to use on the selected clip, or drag onto a clip`} onDragStart={(e) => dragStart(e, { type: "effect", id: preset.id })} onClick={onApply} onKeyDown={(e) => e.key === "Enter" && onApply()} className={CARD}>
      <div className="relative aspect-video w-full overflow-hidden bg-background">
        {gpuCards ? <GpuPicture fx={preset.patch} animate={hover} /> : <SamplePicture media={media} style={fxStyle(preset.patch, 1, 2, 400)} />}
        {speed !== undefined && <span className="absolute right-1 top-1 rounded bg-background/80 px-1 font-mono text-xs text-foreground">{speed / 100}x</span>}
      </div>
      <div className="truncate px-1.5 py-1 text-xs text-foreground">{preset.label}</div>
    </div>
  )
}

const ROUND = 2200

/** The steps of each transition's small film: opacity of the picture that comes in (A) and of the one after it (B) */
const FRAMES: Record<TransitionKind, { a: number[]; b?: number[] }> = {
  "fade-in": { a: [0, 1, 1, 1] },
  "fade-out": { a: [1, 1, 1, 0] },
  "fade-both": { a: [0, 1, 1, 0] },
  dip: { a: [1, 1, 0, 0, 0], b: [0, 0, 0, 1, 1] },
  none: { a: [1, 1, 0, 0], b: [0, 0, 1, 1] },
}

/** A transition on a small card that plays it over and over, with the pictures of the cut or a sample */
export function TransitionCard({ id, label, hint, media, mediaB, onApply }: { id: TransitionKind; label: string; hint: string; media?: SampleMedia; mediaB?: SampleMedia; onApply: () => void }) {
  const a = React.useRef<HTMLDivElement>(null)
  const b = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const frames = FRAMES[id]
    const play = (el: HTMLDivElement | null, steps: number[] | undefined, hard: boolean) => {
      if (!el || !steps || typeof el.animate !== "function") return undefined
      return el.animate(
        steps.map((opacity, i) => ({ opacity, offset: i / (steps.length - 1), easing: hard ? "steps(1, end)" : "linear" })),
        { duration: ROUND, iterations: Infinity },
      )
    }
    const hard = id === "none"
    const runs = [play(a.current, frames.a, hard), play(b.current, frames.b, hard)]
    return () => runs.forEach((r) => r?.cancel())
  }, [id])
  const second = showsTwo(id)
  return (
    <div role="button" tabIndex={0} draggable aria-label={`${label}: ${hint}. Click to use on the selected clip, or drag onto a clip`} title={hint} onDragStart={(e) => dragStart(e, { type: "transition", id })} onClick={onApply} onKeyDown={(e) => e.key === "Enter" && onApply()} className={CARD}>
      <div className="relative aspect-video w-full overflow-hidden bg-background">
        {second && (
          <div className="absolute inset-0">
            <SamplePicture media={mediaB ?? media} variant={1} />
          </div>
        )}
        <div ref={a} className="absolute inset-0">
          <SamplePicture media={media} variant={0} />
        </div>
        {second && <div ref={b} className="absolute inset-0 opacity-0">
          <SamplePicture media={mediaB ?? media} variant={1} />
        </div>}
      </div>
      <div className="truncate px-1.5 py-1 text-xs text-foreground">{label}</div>
    </div>
  )
}

/** Whether a transition shows two pictures (a cut, or a dip between two clips) */
function showsTwo(id: TransitionKind) {
  return id === "dip" || id === "none"
}

/** One caption style on a small card: a sample word drawn the way the style draws captions. Click to use it on the selected caption. */
export function CaptionStyleCardView({ card, onApply }: { card: CaptionStyleCard; onApply: () => void }) {
  const look = captionLook(card.style, 1, 3)
  return (
    <div role="button" tabIndex={0} aria-label={`${card.label}: ${card.hint || "click to use on the selected caption"}`} title={card.hint} onClick={onApply} onKeyDown={(e) => e.key === "Enter" && onApply()} className={CARD}>
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-secondary">
        <span className="px-1.5 text-center text-sm font-bold leading-tight" style={captionCss(look)}>
          Aa Sample
        </span>
      </div>
      <div className="truncate px-2 py-1 text-xs text-foreground">{card.label}</div>
    </div>
  )
}

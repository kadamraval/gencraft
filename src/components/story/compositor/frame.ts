import { getItems } from "@/lib/packs/store"
import { fxAlpha } from "../clip-fx"
import { resolveKeys } from "../edit-model"
import type { ClipFx } from "../edit-model"
import type { Compositor, LayerInput } from "./compositor"

/** One picture ready to draw at a moment: which layer it is on, when it runs, its look, and where its pixels are. */
export interface DrawItem {
  /** 1 is the main track, 2 and up are layers above it */
  layer: number
  start: number
  duration: number
  fx?: ClipFx
  /** The transition from the clip before, when this is a main-track clip */
  transitionIn?: { id: string; duration: number }
  source: TexImageSource
  sw: number
  sh: number
}

const layerOf = (it: DrawItem, t: number): LayerInput => {
  const into = t - it.start
  const fx = resolveKeys(it.fx, into)
  return { source: it.source, sw: it.sw, sh: it.sh, fx, alpha: fxAlpha(fx, into, it.duration), time: into }
}

/** How far a transition between two main-track clips has gone at a time, or null when no two clips overlap there */
export function transitionProgress(main: Array<{ start: number; duration: number }>, t: number): number | null {
  if (main.length < 2) return null
  const a = main[main.length - 2]!
  const b = main[main.length - 1]!
  const over = a.start + a.duration - b.start
  return over > 0 ? Math.max(0, Math.min(1, (t - b.start) / over)) : null
}

/** Draws one frame of the cut on the compositor, the way the preview does. Returns false when a transition fell back to a cross-fade. */
export function composeAt(c: Compositor, t: number, items: DrawItem[]): boolean {
  const main = items.filter((i) => i.layer === 1).sort((a, b) => a.start - b.start)
  const overlays = items.filter((i) => i.layer > 1).sort((a, b) => a.layer - b.layer)
  const progress = transitionProgress(main, t)
  const incoming = main[main.length - 1]
  const entry = progress !== null && incoming?.transitionIn ? getItems("transition").find((x) => x.id === incoming.transitionIn!.id) : undefined
  const shader = entry?.data.kind === "shader" ? entry : undefined
  return c.render({
    base: main.slice(-2).map((i) => layerOf(i, t)),
    transition: shader && progress !== null ? { glsl: String(shader.data.glsl), params: shader.data.params as Record<string, number | number[] | boolean> | undefined, progress } : undefined,
    overlays: overlays.map((i) => layerOf(i, t)),
  })
}

/**
 * Where the graphics card cannot draw, a transition is a plain cross-fade: the clip coming in fades up over the one going out. Returns the
 * look to draw a piece with at a time.
 */
export function fallbackFx<T extends { id: string; layer: number; start: number; duration: number; fx?: ClipFx }>(pieces: T[], piece: T, t: number): ClipFx | undefined {
  if (piece.layer !== 1) return piece.fx
  const active = pieces.filter((x) => x.layer === 1 && t >= x.start && t < x.start + x.duration).sort((a, b) => a.start - b.start)
  const progress = transitionProgress(active, t)
  if (progress === null || active[active.length - 1]?.id !== piece.id) return piece.fx
  return { ...(piece.fx ?? {}), opacity: (piece.fx?.opacity ?? 100) * progress }
}

type Span = { id: string; layer: number; start: number; duration: number }

/** How long a main-track clip overlaps the clip before it (`in`) and the clip after it (`out`), where a transition runs */
export function overlapSpans(pieces: Span[], piece: Span): { in: number; out: number } {
  if (piece.layer !== 1) return { in: 0, out: 0 }
  const main = pieces.filter((x) => x.layer === 1).sort((a, b) => a.start - b.start)
  const i = main.findIndex((x) => x.id === piece.id)
  const before = main[i - 1]
  const after = main[i + 1]
  return {
    in: before ? Math.max(0, before.start + before.duration - piece.start) : 0,
    out: after ? Math.max(0, piece.start + piece.duration - after.start) : 0,
  }
}

/** The clip's own sound level at a time, 0 to 1, through the overlaps: it fades up as the clip comes in and down as the next one takes over */
export function overlapGain(pieces: Span[], piece: Span, t: number): number {
  const o = overlapSpans(pieces, piece)
  let g = 1
  if (o.in > 0 && t < piece.start + o.in) g *= Math.max(0, Math.min(1, (t - piece.start) / o.in))
  if (o.out > 0 && t > piece.start + piece.duration - o.out) g *= Math.max(0, Math.min(1, (piece.start + piece.duration - t) / o.out))
  return g
}

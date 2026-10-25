import * as React from "react"
import { cn } from "@/lib/utils"
import type { PackItem } from "@/lib/packs/types"
import { PREVIEW_H, PREVIEW_W, previewCompositor, scene } from "./preview-gpu"

/**
 * A card for a transition from the library. It shows the change between two sample pictures, drawn by the same shader the cut will use:
 * a still at the middle of the change, and the whole change playing while the pointer is over it. One small compositor is shared by every
 * card, because a window can only hold so many graphics contexts.
 */

const W = PREVIEW_W
const H = PREVIEW_H

/** Draws the change at one moment onto a card's own canvas. Returns false when the shader would not run. */
function paint(target: HTMLCanvasElement, item: PackItem, progress: number): boolean {
  const comp = previewCompositor()
  if (!comp) return false
  const ok = comp.render({
    base: [
      { source: scene("a"), sw: W, sh: H, alpha: 1 },
      { source: scene("b"), sw: W, sh: H, alpha: 1 },
    ],
    transition: { glsl: String(item.data.glsl), params: item.data.params as Record<string, number | number[] | boolean> | undefined, progress },
    overlays: [],
  })
  target.getContext("2d")?.drawImage(comp.canvas, 0, 0, target.width, target.height)
  return ok
}

export function ShaderTransitionCard({ item, onApply, onDragStart }: { item: PackItem; onApply: () => void; onDragStart?: (e: React.DragEvent) => void }) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const raf = React.useRef(0)
  React.useEffect(() => {
    const el = canvas.current
    if (el) paint(el, item, 0.5)
    return () => cancelAnimationFrame(raf.current)
  }, [item])
  const play = () => {
    const el = canvas.current
    if (!el) return
    cancelAnimationFrame(raf.current)
    const start = performance.now()
    const run = (now: number) => {
      const t = ((now - start) % 1600) / 1600
      // Hold the first picture, run the change, hold the second
      paint(el, item, Math.max(0, Math.min(1, (t - 0.15) / 0.6)))
      raf.current = requestAnimationFrame(run)
    }
    raf.current = requestAnimationFrame(run)
  }
  const stop = () => {
    cancelAnimationFrame(raf.current)
    if (canvas.current) paint(canvas.current, item, 0.5)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      aria-label={`${item.name}: ${item.description ?? "click to use between the selected clip and the one before it"}`}
      title={item.description}
      onMouseEnter={play}
      onMouseLeave={stop}
      onFocus={play}
      onBlur={stop}
      onClick={onApply}
      onKeyDown={(e) => e.key === "Enter" && onApply()}
      className={cn("group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-select focus-visible:border-select focus-visible:outline-none")}
    >
      <canvas ref={canvas} width={W} height={H} className="aspect-video w-full bg-background" />
      <div className="truncate px-2 py-1 text-xs text-foreground">{item.name}</div>
    </div>
  )
}

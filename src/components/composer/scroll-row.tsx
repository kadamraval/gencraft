import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * One row that never wraps. When it is wider than its box the ends fade out, and a small arrow slides it when the pointer is
 * over the row (the mouse wheel slides it too). Nothing is hidden behind a menu to make it fit.
 */
export function ScrollRow({ children, className }: { children: React.ReactNode; className?: string }) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [edge, setEdge] = React.useState({ left: false, right: false })

  const measure = React.useCallback(() => {
    const el = scroller.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdge((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  React.useEffect(() => {
    const el = scroller.current
    if (!el) return
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    // Controls come and go as the model changes
    const mutation = new MutationObserver(() => {
      measure()
      for (const child of Array.from(el.children)) resize.observe(child)
    })
    mutation.observe(el, { childList: true, subtree: true })
    for (const child of Array.from(el.children)) resize.observe(child)
    return () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [measure])

  const slide = (direction: 1 | -1) => scroller.current?.scrollBy({ left: direction * Math.max(160, (scroller.current?.clientWidth ?? 0) * 0.6), behavior: "smooth" })

  const fade = edge.left || edge.right
  const mask = fade
    ? `linear-gradient(to right, ${edge.left ? "transparent 0, black 28px" : "black 0"}, ${edge.right ? "black calc(100% - 28px), transparent 100%" : "black 100%"})`
    : undefined

  return (
    <div className={cn("group/row relative min-w-0 flex-1", className)}>
      <div
        ref={scroller}
        onScroll={measure}
        onWheel={(e) => {
          const el = scroller.current
          // A plain wheel turn slides the row when it is wider than its box
          if (el && el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
        }}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className="no-scrollbar flex flex-nowrap items-center gap-1.5 overflow-x-auto py-0.5"
        data-testid="scroll-row"
      >
        {children}
      </div>
      {edge.left && (
        <Button
          type="button"
          variant="pill"
          size="chipIcon"
          aria-label="Slide left"
          onClick={() => slide(-1)}
          className="absolute left-0 top-1/2 h-7 w-7 -translate-y-1/2 bg-card/95 opacity-0 shadow-sm transition-opacity group-hover/row:opacity-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      )}
      {edge.right && (
        <Button
          type="button"
          variant="pill"
          size="chipIcon"
          aria-label="Slide right"
          onClick={() => slide(1)}
          className="absolute right-0 top-1/2 h-7 w-7 -translate-y-1/2 bg-card/95 opacity-0 shadow-sm transition-opacity group-hover/row:opacity-100"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

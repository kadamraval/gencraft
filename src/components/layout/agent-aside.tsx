import * as React from "react"
import { ArrowDownToLine, ArrowRightToLine, PanelRightClose, PanelRightOpen, RotateCcw, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The Agent column used on Story and Brand, so both look and behave the same: 22% wide by default, drag the line
 * to resize, double-click it to reset, fold it to a strip, clear it, or dock the composer to the bottom.
 */

export const AGENT_WIDTH = 22
const MIN = 17
const MAX = 45

/** Width, open/closed and dragging for the column. `container` is the element the percentage is taken from. */
export function useAgentColumn() {
  const container = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(AGENT_WIDTH)
  const [open, setOpen] = React.useState(true)
  const [dock, setDock] = React.useState<"right" | "bottom">("right")
  const [dragging, setDragging] = React.useState(false)
  React.useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => {
      const rect = container.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      setWidth(Math.min(Math.max(((rect.right - e.clientX) / rect.width) * 100, MIN), MAX))
    }
    const up = () => setDragging(false)
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
  }, [dragging])
  return { container, width, setWidth, open, setOpen, dock, setDock, dragging, setDragging }
}

/** The thin line between the page and the column */
export function AgentDivider({ onStartDrag, onReset }: { onStartDrag: () => void; onReset: () => void }) {
  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault()
        onStartDrag()
      }}
      onDoubleClick={onReset}
      title={`Drag to resize · Double-click to reset (${AGENT_WIDTH}%)`}
      className="z-20 w-1 shrink-0 cursor-col-resize bg-border/30 transition-all hover:w-1.5 hover:bg-foreground/40"
    />
  )
}

function IconButton({ label, onClick, children, side = "left" }: { label: string; onClick: () => void; children: React.ReactNode; side?: "left" | "top" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className="h-6 w-6 rounded-md p-0 text-muted-foreground hover:text-foreground">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The button that puts the column back on the right, for a composer docked at the bottom */
export function DockRightButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Dock to Right Panel" onClick={onClick} className="h-9 w-9 shrink-0 rounded-xl border border-border/70 p-0 text-muted-foreground hover:text-foreground">
          <ArrowRightToLine className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">Dock to Right Panel</TooltipContent>
    </Tooltip>
  )
}

interface AsideProps {
  open: boolean
  width: number
  onOpen: (open: boolean) => void
  onClear: () => void
  onDockBottom: () => void
  /** The conversation. Fills the middle and scrolls. */
  children: React.ReactNode
  /** The composer at the bottom */
  footer: React.ReactNode
  feedRef?: React.Ref<HTMLDivElement>
}

export function AgentAside({ open, width, onOpen, onClear, onDockBottom, children, footer, feedRef }: AsideProps) {
  return (
    <aside style={open ? { width: `${width}%` } : undefined} className={cn("relative flex h-full shrink-0 flex-col overflow-hidden border-l border-border/40 bg-background/40", !open && "w-11 items-center")}>
      {!open ? (
        <div className="flex flex-col items-center gap-1 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={() => onOpen(true)} className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-foreground" aria-label="Open agent">
                <PanelRightOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Open agent</TooltipContent>
          </Tooltip>
          <div className="my-1 h-px w-5 bg-border/40" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={() => onOpen(true)} className="h-7 w-7 rounded-md p-0 text-primary" aria-label="Agent">
                <Wand2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Agent</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <>
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 px-3.5">
            <div className="flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">Agent</span>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="Clear" onClick={onClear}>
                <RotateCcw className="h-3 w-3" />
              </IconButton>
              <IconButton label="Dock to Bottom Bar" onClick={onDockBottom}>
                <ArrowDownToLine className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Collapse agent" onClick={() => onOpen(false)}>
                <PanelRightClose className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
          <div ref={feedRef} className="flex-1 space-y-2.5 overflow-y-auto p-3 no-scrollbar">
            {children}
          </div>
          <div className="shrink-0 border-t border-border/40 p-2">{footer}</div>
        </>
      )}
    </aside>
  )
}

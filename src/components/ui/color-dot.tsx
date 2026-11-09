import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A colour a person can pick: a round dot (or a wide chip) painted in the given colour, with a ring when chosen. A colour is the one
 * value a class cannot hold, so it is set here, in this one place, and nowhere else. No colour means "none": a dashed empty dot.
 */
const paint = (color?: string): React.CSSProperties | undefined => (color ? { backgroundColor: color } : undefined)

export function ColorDot({ color, label, selected, onClick, shape = "dot", children, className }: { color?: string; label: string; selected?: boolean; onClick: () => void; shape?: "dot" | "chip"; children?: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      style={paint(color)}
      className={cn(
        "flex items-center justify-center border border-border text-xs text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        shape === "dot" ? "h-7 w-7 rounded-full" : "h-8 w-full rounded-lg",
        !color && "border-dashed bg-secondary",
        selected && "ring-2 ring-select ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {children}
    </button>
  )
}

/** A strip of colours shown side by side (a palette) */
export function ColorStrip({ colors, className }: { colors: string[]; className?: string }) {
  return (
    <span className={cn("flex overflow-hidden rounded-md", className)}>
      {colors.map((c) => (
        <span key={c} style={paint(c)} className="h-4 w-4" />
      ))}
    </span>
  )
}

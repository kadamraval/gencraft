import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Laid over a picture (or clip) while it is being worked on: a soft veil, a band of light that sweeps across it and a small label with a
 * turning sparkle. It takes no clicks, so the picture underneath can still be looked at.
 */
export function ProcessingOverlay({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("pointer-events-none absolute inset-0 z-20 overflow-hidden", className)}>
      <div className="absolute inset-0 animate-pulse bg-background/30 backdrop-blur-[2px]" />
      <div className="absolute inset-y-0 left-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 animate-spin" />
          {label}
        </span>
      </div>
    </div>
  )
}

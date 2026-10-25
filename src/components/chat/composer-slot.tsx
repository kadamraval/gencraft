import * as React from "react"
import { cn } from "@/lib/utils"
import type { DockSide } from "@/lib/ui/composer-dock"

/**
 * The one place that decides how a composer is laid out around itself: the same width, padding and edge in every screen. At the
 * bottom it is centred and at most 4xl wide; in the right dock it fills the column with a hairline above it. Screens only say which.
 */
export function ComposerSlot({ side, children, className }: { side: DockSide; children: React.ReactNode; className?: string }) {
  return side === "bottom" ? (
    <div className={cn("relative mx-auto w-full max-w-4xl shrink-0 pointer-events-auto", className)} data-composer-slot="bottom">
      {children}
    </div>
  ) : (
    <div className={cn("w-full shrink-0 border-t border-border/40 p-2", className)} data-composer-slot="right">
      {children}
    </div>
  )
}

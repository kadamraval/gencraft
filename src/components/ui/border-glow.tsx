import * as React from "react"
import { cn } from "@/lib/utils"

interface BorderGlowProps {
  children: React.ReactNode
  className?: string
  /** Kept for callers; the outline no longer spins */
  glowClassName?: string
  active?: boolean
}

/** The outline round the composer: a still hairline that turns soft blue-grey while it is in use. Never black. */
export function BorderGlow({ children, className, active = false }: BorderGlowProps) {
  return (
    <div className={cn("relative rounded-2xl p-[1px] transition-colors duration-200", active ? "bg-select/40" : "bg-border/70 hover:bg-border", className)}>
      <div className="relative rounded-[15px] bg-card text-card-foreground">{children}</div>
    </div>
  )
}

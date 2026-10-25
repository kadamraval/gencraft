import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** The one banner used wherever there is nothing to show yet: a dashed box with what is missing and what to do. */
export function EmptyState({ icon: Icon, title, hint, children, className }: { icon: LucideIcon; title: string; hint?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-dashed border-border bg-secondary/20 p-4", className)}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 text-xs">
        <p className="font-medium text-foreground">{title}</p>
        {hint && <p className="mt-0.5 text-muted-foreground">{hint}</p>}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}

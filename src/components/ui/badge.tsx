import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground border border-border/50",
        outline: "text-foreground border border-border bg-transparent",
        zinc: "bg-muted text-muted-foreground border border-border/40",
        emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
        amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
        cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30",
        destructive: "bg-destructive/15 text-destructive border border-destructive/30",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

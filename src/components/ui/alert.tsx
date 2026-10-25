import * as React from "react"
import { cn } from "@/lib/utils"

export const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn("flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground", className)} {...props} />
))
Alert.displayName = "Alert"

export const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-xs text-muted-foreground", className)} {...props} />
))
AlertDescription.displayName = "AlertDescription"

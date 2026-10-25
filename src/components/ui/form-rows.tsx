import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * The shared look for forms: a card with a titled header and a divider, and windows laid out the same way with
 * labelled rows (icon, label, field) separated by lines.
 */

/** The box a Textarea gets inside a form, so it has the same border as the single-line fields (the base Textarea has none) */
export const TEXT_BOX = "rounded-lg border border-input bg-background/60 focus-visible:border-select/60 focus-visible:bg-background"

/** A small square holding an icon, used at the start of headers */
export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground", className)}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

/** Icon, title and a short line at the left, one small button at the right, a divider, then the details. */
export function FormCard({ icon, title, hint, action, children, bare, hidden }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; /** No padding around the details, for rows and lists that run edge to edge */ bare?: boolean; /** Fold the details away and show only the header */ hidden?: boolean }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <header className="flex items-center gap-3 px-4 py-3">
        <IconTile icon={icon} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </header>
      {!hidden && <div className={cn("border-t border-border/60", !bare && "p-4")}>{children}</div>}
    </section>
  )
}

/** Rows that sit one under another with a line between them */
export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border/50", className)}>{children}</div>
}

/** One row: the icon and label on the left, the field on the right */
export function Field({ icon: Icon, label, top, children, className }: { icon: LucideIcon; label: string; /** Line the label up with the top of a tall field */ top?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0", top ? "items-start" : "items-center", className)}>
      <span className={cn("flex items-center gap-2 text-xs font-medium text-muted-foreground", top && "pt-2")}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** A window with a header (icon, title, line), a divider, the rows, a divider and a footer of buttons */
export function FormDialog({
  open,
  onClose,
  icon,
  title,
  description,
  children,
  footer,
  note,
  wide,
}: {
  open: boolean
  onClose: () => void
  icon: LucideIcon
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Small text at the left of the footer */
  note?: React.ReactNode
  wide?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center gap-3 px-5 py-4 pr-12">
          <IconTile icon={icon} />
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1 leading-snug">{description ?? " "}</DialogDescription>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto border-t border-border/60 px-5 py-4 no-scrollbar">{children}</div>
        {footer && (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-secondary/20 px-5 py-3">
            <div className="min-w-0 truncate text-xs text-muted-foreground">{note}</div>
            <div className="flex shrink-0 items-center gap-2">{footer}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

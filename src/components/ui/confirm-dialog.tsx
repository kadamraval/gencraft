import type { LucideIcon } from "lucide-react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

interface ConfirmDialogProps {
  open: boolean
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel?: string
  /** A question rather than a deletion: a neutral icon and a normal button */
  neutral?: { icon: LucideIcon }
  onConfirm: () => void
  onCancel: () => void
}

/** The one "are you sure" box: a red icon, what will happen, and Cancel / Delete. */
export function ConfirmDialog({ open, title, description, confirmLabel = "Delete", neutral, onConfirm, onCancel }: ConfirmDialogProps) {
  const Icon = neutral?.icon ?? Trash2
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm gap-5">
        <div className="flex gap-3.5 pr-6">
          <span className={neutral ? "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-foreground" : "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <DialogTitle className="text-sm leading-tight">{title}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">{description}</DialogDescription>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant={neutral ? "default" : "destructive"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UpgradeCard } from "@/components/license/upgrade-card"
import type { AppMeta } from "@/lib/apps/app-types"

/** Stands in for the App builder dialog in the community build. Built-in Apps still run. */
export function NewAppDialog({ open, onClose }: { open: boolean; onClose: () => void; onContinue: (meta: AppMeta) => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="sr-only">Build an App</DialogTitle>
          <DialogDescription className="sr-only">Building your own Apps is part of the paid plan.</DialogDescription>
        </DialogHeader>
        <UpgradeCard feature="Building your own Apps" communityBuild />
      </DialogContent>
    </Dialog>
  )
}

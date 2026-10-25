import { Lock } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Shown where a paid feature would be. In the official app the person has the Free plan and a licence key unlocks it; in a community build
 * (made from the public source) the feature is not part of the code at all.
 */
export function UpgradeCard({ feature, communityBuild, className }: { feature: string; communityBuild?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto flex min-h-80 max-w-md flex-col items-center justify-center gap-3 px-6 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-foreground">
        <Lock className="h-5 w-5" />
      </span>
      <h2 className="text-sm font-semibold text-foreground">{feature}: part of the paid plan</h2>
      <p className="text-xs text-muted-foreground">
        {communityBuild
          ? `This is the community build, which does not include ${feature}. The official Gencraft app includes it with a licence.`
          : "Add a licence key in Settings, General to turn it on. Everything else keeps working on the Free plan."}
      </p>
    </div>
  )
}

/** The same card in a dialog, for a button that starts a paid feature */
export function UpgradeDialog({ open, onClose, feature, communityBuild }: { open: boolean; onClose: () => void; feature: string; communityBuild?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="sr-only">{feature}</DialogTitle>
          <DialogDescription className="sr-only">{feature}: part of the paid plan.</DialogDescription>
        </DialogHeader>
        <UpgradeCard feature={feature} communityBuild={communityBuild} />
      </DialogContent>
    </Dialog>
  )
}

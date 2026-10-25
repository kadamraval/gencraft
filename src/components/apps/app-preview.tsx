import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { appColor, appIcon } from "./icons"
import { AppInputs } from "./app-blocks"
import type { AppSpec } from "@/lib/apps/types"
import { cn } from "@/lib/utils"

/** The app as it is taking shape in the chat: its icon and name, then what the person will fill in. Nothing here can be run yet. */
export function AppPreview({ spec }: { spec: AppSpec }) {
  const Icon = appIcon(spec.icon)
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-2.5">
        <div className={cn("flex size-8 flex-shrink-0 items-center justify-center rounded-lg", appColor(spec.color))}>
          <Icon className="size-4" />
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{spec.name}</p>
      </div>
      {spec.description && <p className="text-xs text-muted-foreground">{spec.description}</p>}
      <div className="pointer-events-none mx-auto w-80 max-w-full">
        <AppInputs inputs={spec.inputs} values={{}} onChange={() => undefined} />
      </div>
      <div className="space-y-1.5 border-t border-border pt-3">
        {spec.steps.map((s, n) => (
          <p key={s.id} className="text-xs text-muted-foreground">{`${n + 1}. ${s.title}`}</p>
        ))}
      </div>
    </div>
  )
}

/** The card that opens a finished app */
export function AppReadyCard({ spec, onOpen }: { spec: AppSpec; onOpen: () => void }) {
  const Icon = appIcon(spec.icon)
  return (
    <Button type="button" variant="ghost" onClick={onOpen} className="group h-auto w-full justify-start gap-3 rounded-xl bg-secondary p-3 text-left animate-in fade-in slide-in-from-bottom-1 duration-300 hover:bg-secondary/70">
      <span className={cn("flex size-10 flex-shrink-0 items-center justify-center rounded-xl", appColor(spec.color))}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{spec.name}</span>
        <span className="block text-xs font-normal text-muted-foreground">Your app is built. Click to open it.</span>
      </span>
      <ArrowRight className="size-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Button>
  )
}

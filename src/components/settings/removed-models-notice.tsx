import * as React from "react"
import { Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { dismissRemovedModels, takeRemovedModels } from "@/lib/registry/migrate"

/** Said once when a model you had chosen is no longer offered, so it never just disappears. */
export function RemovedModelsNotice() {
  const [ids, setIds] = React.useState<string[]>(() => takeRemovedModels())
  if (ids.length === 0) return null
  const names = ids.map((id) => id.split("/").slice(-2).join("/"))
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-xs">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 leading-relaxed text-muted-foreground">
        {names.length === 1 ? "A model you had chosen is" : `${names.length} models you had chosen are`} no longer offered, because the app now keeps only the newest models of the main makers: <span className="text-foreground">{names.slice(0, 4).join(", ")}</span>
        {names.length > 4 ? " and more" : ""}. Pick a replacement in General.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Dismiss"
        className="h-6 w-6"
        onClick={() => {
          dismissRemovedModels()
          setIds([])
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

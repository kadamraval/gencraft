import * as React from "react"
import { Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ModelLogo } from "@/components/ui/model-logo"
import { ModelChips } from "@/components/ui/model-chips"
import { PriceCell } from "@/components/ui/price-cell"
import { PriceEditor } from "./price-editor"
import { ModelTestSection } from "./model-dialogs"
import { ModelParamsBody, paramsSummary } from "./model-params-dialog"
import { isCustomModel, removeCustomModel, renameModel } from "@/lib/registry/store"
import type { ModelRecord, PriceOverride } from "@/lib/registry/types"
import type { SettingsState } from "@/types"

interface Props {
  model: ModelRecord | null
  settings: SettingsState
  onClose: () => void
  onPrice: (id: string, next: PriceOverride | null) => void
}

/** Everything about one model in one place: its name, its price, a test run, every setting it takes, and remove for one you added. */
export function ModelDetailsDialog({ model, settings, onClose, onPrice }: Props) {
  const [name, setName] = React.useState("")

  React.useEffect(() => {
    setName(model?.name ?? "")
  }, [model?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!model) return null
  const renamed = name.trim() !== "" && name.trim() !== model.name
  const custom = isCustomModel(model.id)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-4" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="space-y-2">
          <DialogTitle className="sr-only">{model.name}</DialogTitle>
          <div className="flex items-center gap-2.5 pr-8">
            <ModelLogo name={model.name} endpoint={model.endpoint} family={model.family} provider={model.provider} size={24} />
            <Input
              value={name}
              aria-label="Model name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && renamed && renameModel(model.id, name)}
              className="h-9 flex-1 text-sm font-semibold"
            />
            <Button type="button" variant="secondary" size="icon" aria-label="Save the name" disabled={!renamed} onClick={() => renameModel(model.id, name)} className="h-9 w-9">
              <Check className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription className="truncate font-mono text-xs">{model.endpoint}</DialogDescription>
          <ModelChips model={model} showId={false} />
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2">
          <span className="text-xs font-semibold text-foreground">Price</span>
          <span className="flex items-center gap-2">
            <PriceCell price={model.price} category={model.category} model={model} />
            <PriceEditor model={model} onChange={onPrice} />
          </span>
        </div>

        <ModelTestSection model={model} settings={settings} />

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground">Parameters</h3>
            <span className="truncate text-xs text-muted-foreground">{paramsSummary(model)}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border/60 p-3">
            <ModelParamsBody model={model} />
          </div>
        </div>

        {custom && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 self-start text-xs text-destructive"
            onClick={() => {
              removeCustomModel(model.id)
              onClose()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove this model
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

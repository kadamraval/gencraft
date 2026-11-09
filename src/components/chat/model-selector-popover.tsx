import * as React from "react"
import { RefreshCw, Settings as SettingsIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelPicker } from "@/components/models/model-picker"
import { getProviderApiKey } from "@/lib/providers/live-connectors"
import { capabilityOfExact, sameModel } from "@/lib/capability"
import { takesGiven, type Given } from "@/lib/capability/match"
import { refreshRegistry, useKeyedProviders, useListedModels } from "@/lib/registry/store"
import type { ModelRecord, AppCategory } from "@/lib/registry/types"
import type { SettingsState } from "@/types"

interface ModelSelectorPopoverProps {
  activeModelId: string
  /** The popup only lists models of the current mode: Video mode shows video models only. */
  category: AppCategory
  onSelectModel: (modelId: string) => void
  onClose: () => void
  settings?: SettingsState
  onOpenSettings?: (tab?: string) => void
  /** The docked composer is narrow: names and prices only */
  compact?: boolean
  /** What is attached now. A model that cannot take one of these shows muted, with the reason, and can still be chosen. */
  needs?: { start?: boolean; end?: boolean; images?: number; video?: boolean; audio?: boolean }
}

/** The first thing attached that this model (any of its versions, which the composer switches to) cannot take, in a few words */
function missingFor(m: ModelRecord, pool: ModelRecord[], needs?: ModelSelectorPopoverProps["needs"]): string | undefined {
  if (!needs) return undefined
  const versions = sameModel(m, pool).filter((r) => r.provider === m.provider)
  const can = (given: Given[]) => versions.some((r) => takesGiven(capabilityOfExact(r), given))
  if (needs.start && !can([{ kind: "image", role: "start" }])) return "no start frame"
  if (needs.end && !can([{ kind: "image", role: "end" }])) return "no end frame"
  if ((needs.images ?? 0) > 0 && !can([{ kind: "image", count: needs.images }])) return "no reference images"
  if (needs.video && !can([{ kind: "video" }])) return "no video input"
  if (needs.audio && !can([{ kind: "audio" }])) return "no audio input"
  return undefined
}

/** The composer's model choice: the app's one model selector, for the current mode, above the composer. */
export function ModelSelectorPopover({ activeModelId, category, onSelectModel, onClose, settings, onOpenSettings, compact, needs }: ModelSelectorPopoverProps) {
  const keyedCount = useKeyedProviders().length
  const listed = useListedModels()
  const [syncing, setSyncing] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)

  const sync = async () => {
    setSyncing(true)
    setNote(null)
    const report = await refreshRegistry({ keys: { fal: settings ? getProviderApiKey("fal", settings) : undefined } })
    const parts: string[] = [report.ok ? `${report.added} new` : "Could not reach providers"]
    if (report.partial.length) parts.push("rate limited")
    setNote(parts.join(" · "))
    setSyncing(false)
  }

  const openProviders = () => {
    onClose()
    onOpenSettings?.("providers")
  }

  return (
    <div className="absolute bottom-full left-4 right-4 z-50 mb-3 flex h-[26rem] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150">
      <ModelPicker
        mode="pick"
        categories={[category]}
        activeId={activeModelId}
        compact={compact}
        mutedReason={(m) => missingFor(m, listed, needs)}
        onPick={(m) => {
          onSelectModel(m.id)
          onClose()
        }}
        empty={
          <div className="space-y-2 py-10 text-center text-xs text-muted-foreground">
            <p>{keyedCount === 0 ? "Add an API key to load models." : `No ${category} models yet.`}</p>
            {onOpenSettings && (
              <Button type="button" variant="outline" size="sm" onClick={openProviders}>
                {keyedCount === 0 ? "Add an API key" : "Open Providers"}
              </Button>
            )}
          </div>
        }
        className="min-h-0 flex-1"
      />
      <div className="flex flex-shrink-0 items-center justify-between border-t border-border/70 px-2 py-1">
        <span className="truncate text-xs text-muted-foreground">{note ?? "One row per model version"}</span>
        <div className="flex flex-shrink-0 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="iconSm" aria-label="Refresh model list" onClick={sync} disabled={syncing}>
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh from providers</TooltipContent>
          </Tooltip>
          {onOpenSettings && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="iconSm" aria-label="Providers and keys" onClick={openProviders}>
                  <SettingsIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Providers and keys</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

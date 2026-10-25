import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ModelRecord } from "@/lib/registry/types"

/**
 * A small circled N on models whose safety filter can be switched off. The provider gives these a setting for it
 * (Settings, General, Safety filter). Models without the mark always filter on the provider's side.
 */
export function FilterBadge({ model }: { model: ModelRecord }) {
  if (!model.params.safety) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label="Safety filter can be turned off" className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500/15 text-[9px] font-bold leading-none text-emerald-500">
          N
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-xs">
        This model can make NSFW. Turn the Safety filter off in Settings, General. Models without N always filter.
      </TooltipContent>
    </Tooltip>
  )
}

const NEW_DAYS = 21

/** Marks a model the catalog gained in the last three weeks. */
export function NewBadge({ model }: { model: ModelRecord }) {
  if (!model.addedAt || Date.now() - Date.parse(model.addedAt) > NEW_DAYS * 86400000) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex-shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase leading-none text-primary">New</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Added to the catalog recently.
      </TooltipContent>
    </Tooltip>
  )
}

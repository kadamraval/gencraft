import * as React from "react"
import { AlertCircle, AlertTriangle, ChevronDown, Info, RotateCw, Settings, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { dismissChip, useChips } from "@/lib/ui/chips"
import type { Chip } from "@/lib/ui/chips"
import { cn } from "@/lib/utils"

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info } as const
const TONE = { error: "text-destructive", warning: "text-amber-600 dark:text-amber-400", info: "text-muted-foreground" } as const

function ChipItem({ chip, onOpenSettings }: { chip: Chip; onOpenSettings?: (tab?: string) => void }) {
  const Icon = ICON[chip.level]
  const [open, setOpen] = React.useState(false)
  return (
    <div className="inline-flex h-7 max-w-[16rem] items-center rounded-full border border-border/50 bg-card pl-1 pr-0.5 text-xs text-foreground animate-in fade-in slide-in-from-bottom-1 duration-150" data-testid="error-chip" data-level={chip.level} data-kind={chip.kind}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label={chip.title} className="h-6 min-w-0 gap-1.5 rounded-full px-2 text-xs font-medium text-foreground hover:bg-secondary">
            <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", TONE[chip.level])} />
            <span className="truncate">{chip.title}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-80 space-y-2 p-3 text-xs">
          <p className="text-foreground">{chip.message}</p>
          {chip.hint && <p className="text-muted-foreground">{chip.hint}</p>}
          {chip.actions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {chip.actions.includes("retry") && chip.retry && (
                <Button
                  type="button"
                  variant="pill"
                  size="sm"
                  onClick={() => {
                    setOpen(false)
                    chip.retry?.()
                    dismissChip(chip.id)
                  }}
                  className="gap-1.5"
                >
                  <RotateCw className="h-3 w-3" />
                  Retry
                </Button>
              )}
              {chip.actions.includes("settings") && onOpenSettings && (
                <Button
                  type="button"
                  variant="pill"
                  size="sm"
                  onClick={() => {
                    setOpen(false)
                    onOpenSettings(chip.settingsTab)
                  }}
                  className="gap-1.5"
                >
                  <Settings className="h-3 w-3" />
                  Settings
                </Button>
              )}
            </div>
          )}
          {chip.raw && chip.raw !== chip.message && (
            <Collapsible>
              <CollapsibleTrigger className="group flex items-center gap-1 text-muted-foreground hover:text-foreground">
                Details
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-1.5 max-h-40 select-text overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/60 p-2 font-mono text-xs text-muted-foreground">{chip.raw}</pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </PopoverContent>
      </Popover>
      <Button type="button" variant="ghost" size="iconSm" aria-label={`Dismiss ${chip.title}`} onClick={() => dismissChip(chip.id)} className="h-6 w-6 flex-shrink-0 rounded-full p-0">
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

/**
 * What went wrong, as small chips just above the composer: always visible, never behind it, at most three with a count for the rest.
 * A chip opens to the full message, what to do, and the provider's own words. Errors stay until dismissed or retried.
 */
export function ErrorChips({ onOpenSettings }: { onOpenSettings?: (tab?: string) => void }) {
  const chips = useChips()
  if (chips.length === 0) return null
  const shown = chips.slice(-3)
  const more = chips.length - shown.length
  return (
    <div className="relative z-30 mb-2 flex flex-wrap items-center gap-1.5 px-4" data-testid="error-chips" role="status" aria-live="polite">
      {shown.map((c) => (
        <ChipItem key={c.id} chip={c} onOpenSettings={onOpenSettings} />
      ))}
      {more > 0 && <span className="text-xs text-muted-foreground">+{more}</span>}
    </div>
  )
}

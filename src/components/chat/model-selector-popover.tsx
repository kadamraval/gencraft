import * as React from "react"
import { RefreshCw, Check, Layers, Settings as SettingsIcon, ListFilter, ArrowDownUp, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModelLogo } from "@/components/ui/model-logo"
import { PriceCell } from "@/components/ui/price-cell"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command } from "@/components/ui/command"
import { ModelSelectorEmpty, ModelSelectorInput, ModelSelectorItem, ModelSelectorList, ModelSelectorName } from "@/components/ai-elements/model-selector"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getProviderApiKey, isLiveProviderReady } from "@/lib/providers/live-connectors"
import { toggleBookmark, useBookmarks } from "@/lib/registry/bookmarks"
import { standardRun } from "@/lib/registry/price"
import { PROVIDERS, providerLabel } from "@/lib/registry/providers"
import { makerRank } from "@/lib/registry/logo-rules"
import { refreshRegistry, useKeyedProviders, useListedModels } from "@/lib/registry/store"
import { resRank } from "@/lib/registry/summary"
import { ModelChips } from "@/components/ui/model-chips"
import { FilterBadge, NewBadge } from "@/components/ui/filter-badge"
import type { ModelRecord, RegistryModality } from "@/lib/registry/types"
import type { SettingsState } from "@/types"
import { cn } from "@/lib/utils"

const MAX_ROWS = 60

interface ModelSelectorPopoverProps {
  activeModelId: string
  /** The popup only lists models of the current mode: Video mode shows video models only. */
  modality: RegistryModality
  onSelectModel: (modelId: string) => void
  onClose: () => void
  settings?: SettingsState
  onOpenSettings?: (tab?: string) => void
  /** The docked composer is narrow: names and prices only */
  compact?: boolean
  /** What is attached now. A model that cannot take one of these shows muted, with the reason, and can still be chosen. */
  needs?: { start?: boolean; end?: boolean; images?: number; video?: boolean; audio?: boolean }
}

/** The first thing attached that this model (all its versions together) cannot take, in a few words. */
function missingFor(m: { summary?: { refs?: { images: number; start: boolean; end: boolean; videos: number; audios: number; elements: boolean } } }, needs?: ModelSelectorPopoverProps["needs"]): string | undefined {
  const refs = m.summary?.refs
  if (!needs) return undefined
  if (needs.start && !refs?.start) return "no start frame"
  if (needs.end && !refs?.end) return "no end frame"
  if ((needs.images ?? 0) > 0 && !(refs && (refs.images > 0 || refs.elements || (needs.images === 1 && refs.start)))) return "no reference images"
  if (needs.video && !(refs && refs.videos > 0)) return "no video input"
  if (needs.audio && !(refs && refs.audios > 0)) return "no audio input"
  return undefined
}

type SortKey = "newest" | "price-asc" | "price-desc" | "name" | "longest" | "resolution"

const SORTS: Array<{ key: SortKey; label: string; only?: RegistryModality[] }> = [
  { key: "newest", label: "Newest" },
  { key: "price-asc", label: "Price, low to high" },
  { key: "price-desc", label: "Price, high to low" },
  { key: "name", label: "Name A to Z" },
  { key: "longest", label: "Longest clips", only: ["video", "audio"] },
  { key: "resolution", label: "Highest resolution", only: ["video", "image"] },
]

interface Filters {
  task?: string
  audio?: boolean
  minSeconds?: number
  minRes?: number
  minImages?: number
  minContext?: number
}

interface FilterGroup {
  id: keyof Filters
  label: string
  options: Array<{ label: string; value: string | number | boolean | undefined }>
  only: RegistryModality[]
}

const FILTERS: FilterGroup[] = [
  {
    id: "task",
    label: "Input",
    only: ["video", "image", "audio"],
    options: [
      { label: "Any", value: undefined },
      { label: "Text to video / image", value: "text-to" },
      { label: "From an image", value: "image-to" },
    ],
  },
  { id: "audio", label: "Audio", only: ["video"], options: [{ label: "Any", value: undefined }, { label: "With audio", value: true }] },
  {
    id: "minSeconds",
    label: "Clip length",
    only: ["video", "audio"],
    options: [{ label: "Any", value: undefined }, { label: "8s or more", value: 8 }, { label: "10s or more", value: 10 }, { label: "15s or more", value: 15 }],
  },
  {
    id: "minRes",
    label: "Resolution",
    only: ["video", "image"],
    options: [{ label: "Any", value: undefined }, { label: "1080p or more", value: 3 }, { label: "4K", value: 6 }],
  },
  { id: "minImages", label: "Images per run", only: ["image"], options: [{ label: "Any", value: undefined }, { label: "2 or more", value: 2 }, { label: "4 or more", value: 4 }] },
  {
    id: "minContext",
    label: "Context",
    only: ["text"],
    options: [{ label: "Any", value: undefined }, { label: "200K or more", value: 200_000 }, { label: "1M or more", value: 1_000_000 }],
  },
]

function matchesFilters(r: ModelRecord, f: Filters): boolean {
  const s = r.summary
  if (f.task && !(r.task ?? "").startsWith(f.task)) return false
  if (f.audio && !s?.audio) return false
  if (f.minSeconds && (s?.maxSeconds ?? 0) < f.minSeconds) return false
  if (f.minRes && (s?.maxResolution ? resRank(s.maxResolution) : -1) < f.minRes) return false
  if (f.minImages && (s?.maxImages ?? 1) < f.minImages) return false
  if (f.minContext && (s?.contextTokens ?? 0) < f.minContext) return false
  return true
}

function versionScore(r: ModelRecord): number {
  return (r.version?.[0] ?? 0) * 1000 + (r.version?.[1] ?? 0)
}

function comparator(sort: SortKey, hasKey: (p: string) => boolean): (a: ModelRecord, b: ModelRecord) => number {
  // What a standard run costs, so a per-second and a per-image price sort together
  const price = (r: ModelRecord) => (r.modality === "text" ? r.price.amount : standardRun(r).estimate.usd) ?? Number.POSITIVE_INFINITY
  const maker = (r: ModelRecord) => makerRank({ name: r.name, endpoint: r.endpoint, family: r.family }, r.modality)
  const byKey = (a: ModelRecord, b: ModelRecord) => Number(hasKey(b.provider)) - Number(hasKey(a.provider))
  switch (sort) {
    case "price-asc":
      return (a, b) => price(a) - price(b)
    case "price-desc":
      return (a, b) => (price(b) === Infinity ? -1 : price(a) === Infinity ? 1 : price(b) - price(a))
    case "name":
      return (a, b) => a.name.localeCompare(b.name)
    case "longest":
      return (a, b) => (b.summary?.maxSeconds ?? 0) - (a.summary?.maxSeconds ?? 0)
    case "resolution":
      return (a, b) => (b.summary?.maxResolution ? resRank(b.summary.maxResolution) : -1) - (a.summary?.maxResolution ? resRank(a.summary.maxResolution) : -1)
    default:
      return (a, b) =>
        byKey(a, b) ||
        maker(a) - maker(b) ||
        Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
        versionScore(b) - versionScore(a) ||
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
  }
}

export function ModelSelectorPopover({ activeModelId, modality, onSelectModel, onClose, settings, onOpenSettings, compact, needs }: ModelSelectorPopoverProps) {
  const listed = useListedModels()
  const keyedCount = useKeyedProviders().length
  const [provider, setProvider] = React.useState("all")
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<SortKey>("newest")
  const [filters, setFilters] = React.useState<Filters>({})
  const [syncing, setSyncing] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)

  const hasKey = React.useCallback((p: string) => (settings ? isLiveProviderReady(p, settings) : false), [settings])
  const marked = useBookmarks()

  const inMode = React.useMemo(() => listed.filter((m) => m.modality === modality), [listed, modality])

  const counts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const m of inMode) map.set(m.provider, (map.get(m.provider) ?? 0) + 1)
    return map
  }, [inMode])

  const rows = React.useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return inMode
      .filter((m) => provider === "all" || m.provider === provider)
      .filter((m) => matchesFilters(m, filters))
      .filter((m) => {
        if (tokens.length === 0) return true
        const hay = `${m.name} ${m.endpoint} ${m.family} ${m.maker ?? ""}`.toLowerCase()
        return tokens.every((t) => hay.includes(t))
      })
      .sort(comparator(sort, hasKey))
  }, [inMode, provider, filters, query, sort, hasKey])
  // Bookmarked first, then a divider, then the rest; each part keeps the chosen sort
  const ordered = React.useMemo(() => [...rows.filter((m) => marked.has(m.id)), ...rows.filter((m) => !marked.has(m.id))], [rows, marked])
  const starredCount = React.useMemo(() => rows.filter((m) => marked.has(m.id)).length, [rows, marked])

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined).length

  const sync = async () => {
    setSyncing(true)
    setNote(null)
    const report = await refreshRegistry({ keys: { fal: settings ? getProviderApiKey("fal", settings) : undefined } })
    const parts: string[] = [report.ok ? `${report.added} new` : "Could not reach providers"]
    if (report.partial.length) parts.push("rate limited")
    setNote(parts.join(" · "))
    setSyncing(false)
  }

  return (
    <div className="absolute bottom-full left-4 right-4 z-50 mb-3 flex h-96 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150">
      {/* Left: every supported provider, always, with a tooltip */}
      <div className={cn("w-12 flex-shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/70 bg-secondary/20 p-1.5 no-scrollbar", compact ? "hidden" : "flex")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant={provider === "all" ? "secondary" : "ghost"} size="icon" aria-label="All providers" onClick={() => setProvider("all")}>
              <Layers className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">All providers · {inMode.length} models</TooltipContent>
        </Tooltip>
        {PROVIDERS.map((p) => {
          const n = counts.get(p.id) ?? 0
          return (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={provider === p.id ? "secondary" : "ghost"}
                  size="icon"
                  aria-label={p.label}
                  onClick={() => setProvider(p.id)}
                  className={cn("relative", n === 0 && "opacity-40")}
                >
                  <ModelLogo provider={p.id} size={16} />
                  <span className={cn("absolute right-1 top-1 h-1.5 w-1.5 rounded-full", hasKey(p.id) ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {p.label} · {n} {modality} models · {hasKey(p.id) ? "key set" : "no key yet"}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Right: search, filter, sort, list */}
      <Command shouldFilter={false} className="flex min-w-0 flex-1 flex-col rounded-none bg-transparent">
        <div className="flex items-center gap-1.5 border-b border-border/70 p-2">
          <div className="min-w-0 flex-1">
            <ModelSelectorInput autoFocus value={query} onValueChange={setQuery} placeholder="Search" className="py-1.5 text-xs" />
          </div>

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" variant={activeFilterCount ? "secondary" : "ghost"} size="icon" aria-label="Filter" className="relative">
                    <ListFilter className="h-4 w-4" />
                    {activeFilterCount > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Filter</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-64 space-y-3">
              {FILTERS.filter((g) => g.only.includes(modality)).map((g) => (
                <div key={g.id} className="space-y-1">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">{g.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.options.map((o) => (
                      <Button
                        key={o.label}
                        type="button"
                        size="sm"
                        variant={filters[g.id] === o.value ? "secondary" : "ghost"}
                        onClick={() => setFilters((f) => ({ ...f, [g.id]: o.value }))}
                      >
                        {o.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {activeFilterCount > 0 && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setFilters({})}>
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Sort">
                    <ArrowDownUp className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Sort: {SORTS.find((s) => s.key === sort)?.label}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-52 p-1">
              {SORTS.filter((s) => !s.only || s.only.includes(modality)).map((s) => (
                <Button
                  key={s.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSort(s.key)}
                  className={cn("h-8 w-full justify-between", sort === s.key && "bg-secondary text-foreground")}
                >
                  {s.label}
                  {sort === s.key && <Check className="h-3.5 w-3.5" />}
                </Button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <ModelSelectorList className="max-h-none flex-1 p-1 no-scrollbar">
          {rows.length === 0 && (
            <ModelSelectorEmpty className="space-y-2 py-10 text-center text-xs text-muted-foreground">
              <p>
                {keyedCount === 0
                  ? "Add an API key to load models."
                  : inMode.length === 0
                    ? `No ${modality} models yet.`
                    : "Nothing matches."}
              </p>
              {inMode.length === 0 && onOpenSettings && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose()
                    onOpenSettings("providers")
                  }}
                >
                  {keyedCount === 0 ? "Add an API key" : "Open Providers"}
                </Button>
              )}
            </ModelSelectorEmpty>
          )}
          {ordered.slice(0, MAX_ROWS).map((m, index) => {
            const selected = m.id === activeModelId
            // Muted, never blocked: choosing it simply hides what it cannot take (and it comes back when you switch back)
            const mutedReason = missingFor(m, needs)
            return (
              <React.Fragment key={m.id}>
              {starredCount > 0 && index === starredCount && <div className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">More</div>}
              <ModelSelectorItem
                value={m.id}
                title={mutedReason ? `Muted: ${mutedReason}` : undefined}
                data-muted={mutedReason ? "true" : undefined}
                onSelect={() => {
                  onSelectModel(m.id)
                  onClose()
                }}
                className={cn("grid h-auto w-full cursor-pointer items-center justify-items-start gap-3 px-2 py-2 text-left", compact ? "grid-cols-[1.125rem_minmax(0,1fr)_auto]" : "grid-cols-[1.125rem_11rem_minmax(0,1fr)_auto]", selected && "bg-secondary text-foreground", mutedReason && "opacity-40")}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <ModelLogo name={m.name} endpoint={m.endpoint} family={m.family} provider={m.provider} size={18} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{m.maker ?? providerLabel(m.provider)}</TooltipContent>
                </Tooltip>
                <span className="flex min-w-0 max-w-full items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ModelSelectorName className="truncate text-xs font-medium text-foreground">{m.name}</ModelSelectorName>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {m.name}
                      <span className="block font-mono text-xs opacity-70">{m.id}</span>
                    </TooltipContent>
                  </Tooltip>
                  <FilterBadge model={m} />
                  <NewBadge model={m} />
                </span>
                {!compact && (
                  <span className="block w-full min-w-0">
                    <ModelChips model={m} showId={false} fit />
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <PriceCell price={m.price} modality={m.modality} model={m} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    aria-label={marked.has(m.id) ? `Remove the bookmark from ${m.name}` : `Bookmark ${m.name}`}
                    aria-pressed={marked.has(m.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleBookmark(m.id)
                    }}
                    className={cn("h-6 w-6", marked.has(m.id) ? "text-foreground" : "text-muted-foreground")}
                  >
                    <Star className={cn("h-3.5 w-3.5", marked.has(m.id) && "fill-current")} />
                  </Button>
                  <Check className={cn("h-3.5 w-3.5", !selected && "invisible")} />
                </span>
              </ModelSelectorItem>
              </React.Fragment>
            )
          })}
          {rows.length > MAX_ROWS && <p className="py-2 text-center text-xs text-muted-foreground">Search to see {rows.length - MAX_ROWS} more</p>}
        </ModelSelectorList>

        <div className="flex items-center justify-between border-t border-border/70 px-2 py-1">
          <span className="truncate text-xs text-muted-foreground">{note ?? `${rows.length} models`}</span>
          <div className="flex flex-shrink-0 items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="iconSm" aria-label="Refresh model list" onClick={sync} disabled={syncing}>
                  <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh from providers</TooltipContent>
            </Tooltip>
            {onOpenSettings && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    aria-label="Providers and keys"
                    onClick={() => {
                      onClose()
                      onOpenSettings("providers")
                    }}
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Providers and keys</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </Command>
    </div>
  )
}

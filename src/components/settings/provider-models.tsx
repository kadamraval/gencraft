import * as React from "react"
import { ArrowDownUp, Check, ChevronDown, KeyRound, ListFilter, Loader2, Plus, Search, Settings2, SlidersHorizontal, Star, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelLogo } from "@/components/ui/model-logo"
import { EmptyState } from "@/components/ui/empty-state"
import { PriceCell } from "@/components/ui/price-cell"
import { PriceEditor } from "./price-editor"
import { RemovedModelsNotice } from "./removed-models-notice"
import { AddModelDialog, EditModelDialog } from "./model-dialogs"
import { ModelParamsDialog } from "./model-params-dialog"
import { standardRun } from "@/lib/registry/price"
import { computeDefaultEnabled } from "@/lib/registry/enabled"
import { addBookmark, toggleBookmark, useBookmarks } from "@/lib/registry/bookmarks"
import { providerCounts, unlockProvider, useListedModels, useRegistry, useUnlockStatus } from "@/lib/registry/store"
import { PROVIDERS } from "@/lib/registry/providers"
import { ModelChips } from "@/components/ui/model-chips"
import { FilterBadge, NewBadge } from "@/components/ui/filter-badge"
import type { ModelRecord, RegistryModality } from "@/lib/registry/types"
import type { PriceOverride } from "@/lib/registry/types"
import type { SettingsState } from "@/types"

const TABS: Array<{ id: RegistryModality; label: string }> = [
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Audio" },
  { id: "text", label: "Chat" },
]

type SortId = "best" | "newest" | "cheapest" | "priciest" | "name"
const SORTS: Array<{ id: SortId; label: string }> = [
  { id: "best", label: "Latest and best" },
  { id: "newest", label: "Newest" },
  { id: "cheapest", label: "Price, low to high" },
  { id: "priciest", label: "Price, high to low" },
  { id: "name", label: "Name" },
]

const released = (m: ModelRecord): string => m.updatedAt ?? ""

interface ProviderModelListProps {
  providerId: string
  settings: SettingsState
  onPrices: (next: Record<string, PriceOverride>) => void
}

/** Says why a provider has no models, with a button to read them now. */
function EmptyProvider({ providerId, settings }: { providerId: string; settings: SettingsState }) {
  useRegistry()
  const status = useUnlockStatus(providerId)
  const provider = PROVIDERS.find((p) => p.id === providerId)
  const key = provider ? ((settings.aiEngine[provider.keyField] as string | undefined) ?? "") : ""
  const { saved } = providerCounts(providerId)
  if (!key) return <EmptyState icon={KeyRound} title={`Add your ${provider?.label ?? "provider"} key`} hint="Nothing is shown until a key is added. Paste it above and save." />
  if (status.state === "loading") return <EmptyState icon={Loader2} title="Reading the model list" hint={`${status.message ?? "Loading"}${status.total ? ` ${status.done}/${status.total}` : ""}. Models appear here as they are read.`} />
  return (
    <EmptyState
      icon={Search}
      title={saved > 0 ? "Saved models cannot run here yet" : "No models read yet"}
      hint={status.state === "error" ? `Last try failed: ${status.message}` : saved > 0 ? `${saved} models are saved but none of them is something this app can run.` : "Your key is saved. Read the model list from the provider now."}
    >
      <Button type="button" size="sm" className="h-7 text-xs" onClick={() => void unlockProvider(providerId, key)}>
        Read models now
      </Button>
    </EmptyState>
  )
}

/** A section header that opens and closes its rows. */
function Disclosure({ title, count, note, open, onToggle }: { title: string; count: number; note?: string; open: boolean; onToggle: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={onToggle} aria-expanded={open} className="h-8 w-full justify-between px-2 text-xs">
      <span className="flex items-center gap-2">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="font-mono text-muted-foreground">{count}</span>
        {note && <span className="text-muted-foreground">{note}</span>}
      </span>
      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
    </Button>
  )
}

/** How trustworthy a price is, as a dot: green is the provider's own list or your edit, grey was read from a page, amber is missing. */
function PriceTrust({ m }: { m: ModelRecord }) {
  const missing = m.price.amount === null
  const tone = missing ? "bg-amber-500" : m.price.source === "api" || m.price.source === "edited" || m.price.source === "curated" ? "bg-emerald-500" : "bg-muted-foreground/50"
  const text = missing
    ? "No price found. Use the pencil to enter it."
    : m.price.source === "api"
      ? "Price from the provider's own price list"
      : m.price.source === "edited"
        ? "Price edited by you"
        : m.price.source === "curated"
          ? "Reviewed price"
          : "Price read from the provider's model page"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${tone}`} />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

/** Every current model of one provider, with the switch that decides whether it appears in the chat picker. */
export function ProviderModelList({ providerId, settings, onPrices }: ProviderModelListProps) {
  const listed = useListedModels()
  const [tab, setTab] = React.useState<RegistryModality>("video")
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<SortId>("best")
  const [maker, setMaker] = React.useState("")
  const [audioOnly, setAudioOnly] = React.useState(false)
  const [onOnly, setOnOnly] = React.useState(false)
  const [showOthers, setShowOthers] = React.useState(false)
  const [showTop, setShowTop] = React.useState(true)
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<ModelRecord | null>(null)
  const [viewing, setViewing] = React.useState<ModelRecord | null>(null)

  const marked = useBookmarks()
  const unlock = useUnlockStatus(providerId)
  const reading = unlock.state === "loading"
  const providerKey = (() => {
    const provider = PROVIDERS.find((x) => x.id === providerId)
    return provider ? ((settings.aiEngine[provider.keyField] as string | undefined) ?? "") : ""
  })()

  const mine = React.useMemo(() => listed.filter((m) => m.provider === providerId), [listed, providerId])

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of mine) c[m.modality] = (c[m.modality] ?? 0) + 1
    return c
  }, [mine])

  // Open on the first kind of output this provider actually has
  React.useEffect(() => {
    if (!counts[tab]) {
      const first = TABS.find((t) => counts[t.id])
      if (first) setTab(first.id)
    }
  }, [counts, tab])

  const makers = React.useMemo(() => [...new Set(mine.filter((m) => m.modality === tab).map((m) => m.maker).filter((x): x is string => Boolean(x)))].sort(), [mine, tab])
  const filtered = Boolean(maker) || audioOnly || onOnly

  const rows = React.useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const byPrice = (dir: 1 | -1) => (a: ModelRecord, b: ModelRecord) => {
      // Compared as what a standard run costs: a per-second price and a per-image price cannot be compared as raw figures
      const x = a.modality === "text" ? a.price.amount : standardRun(a).estimate.usd
      const y = b.modality === "text" ? b.price.amount : standardRun(b).estimate.usd
      if (x === null && y === null) return 0
      return x === null ? 1 : y === null ? -1 : (x - y) * dir
    }
    const compare: Record<SortId, (a: ModelRecord, b: ModelRecord) => number> = {
      best: (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || released(b).localeCompare(released(a)) || a.name.localeCompare(b.name),
      newest: (a, b) => released(b).localeCompare(released(a)) || a.name.localeCompare(b.name),
      cheapest: byPrice(1),
      priciest: byPrice(-1),
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return mine
      .filter((m) => m.modality === tab)
      .filter((m) => tokens.every((t) => `${m.name} ${m.endpoint} ${m.maker ?? ""}`.toLowerCase().includes(t)))
      .filter((m) => !maker || m.maker === maker)
      .filter((m) => !audioOnly || m.summary?.audio === true)
      .filter((m) => !onOnly || marked.has(m.id))
      .sort(compare[sort])
  }, [mine, tab, query, sort, maker, audioOnly, onOnly, marked])

  // Top models: the industry leaders first, then the newest releases of the leading makers. Everything else is an add-on.
  const topOrder = React.useMemo(() => new Map(computeDefaultEnabled(mine).map((id, i) => [id, i])), [mine])
  const topIds = React.useMemo(() => new Set([...topOrder.keys(), ...mine.filter((m) => m.custom).map((m) => m.id)]), [topOrder, mine])
  const split = true
  const starredRows = rows.filter((m) => marked.has(m.id))
  const topRows = (split ? rows.filter((m) => topIds.has(m.id) && !marked.has(m.id)) : rows).sort((a, b) => (sort === "best" ? (topOrder.get(a.id) ?? 9999) - (topOrder.get(b.id) ?? 9999) : 0))
  const otherRows = split ? rows.filter((m) => !topIds.has(m.id) && !marked.has(m.id)) : []
  const searching = query.trim().length > 0

  const setPrice = (id: string, next: PriceOverride | null) => {
    const all = { ...(settings.aiEngine.priceOverrides ?? {}) }
    if (next) all[id] = next
    else delete all[id]
    onPrices(all)
  }

  const renderRow = (m: ModelRecord) => {
          return (
            <div key={m.id} className="grid grid-cols-[1.125rem_13rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/50 px-2.5 py-2">
              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <ModelLogo name={m.name} endpoint={m.endpoint} family={m.family} provider={m.provider} size={18} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{m.maker ?? PROVIDERS.find((p) => p.id === m.provider)?.label ?? m.provider}</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate text-xs font-medium text-foreground">{m.name}</span>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {m.name}
                    <span className="block font-mono text-xs opacity-70">{m.id}</span>
                  </TooltipContent>
                </Tooltip>
                <FilterBadge model={m} />
                <NewBadge model={m} />
              </div>
              <div className="min-w-0">
                <ModelChips model={m} showId={false} fit />
              </div>
              <div className="flex flex-shrink-0 items-center justify-end gap-3">
                <PriceTrust m={m} />
                <PriceCell price={m.price} modality={m.modality} model={m} />
                <PriceEditor model={m} onChange={setPrice} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="iconSm" aria-label={`Settings of ${m.name}`} onClick={() => setViewing(m)} className="h-7 w-7 text-muted-foreground">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>All settings ({Object.values(m.params.properties).filter((p) => !p.format).length})</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="iconSm" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)} className="h-7 w-7 text-muted-foreground">
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Rename, test or remove</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="iconSm" aria-label={marked.has(m.id) ? `Remove the bookmark from ${m.name}` : `Bookmark ${m.name}`} aria-pressed={marked.has(m.id)} onClick={() => toggleBookmark(m.id)} className={`h-7 w-7 ${marked.has(m.id) ? "text-foreground" : "text-muted-foreground"}`}>
                      <Star className={`h-3.5 w-3.5 ${marked.has(m.id) ? "fill-current" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{marked.has(m.id) ? "Bookmarked: shown first" : "Bookmark: show first"}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )
  }

  return (
    <div className="space-y-2">
      <RemovedModelsNotice />
      <div className="flex items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as RegistryModality)}>
          <TabsList>
            {TABS.filter((t) => counts[t.id]).map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5 text-xs">
                {t.label}
                <span className="font-mono text-muted-foreground">{counts[t.id]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-8 pl-8 text-xs" />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Read models again" disabled={reading || !providerKey} onClick={() => void unlockProvider(providerId, providerKey)} className="h-8 w-8 text-muted-foreground">
              <RefreshCw className={`h-4 w-4 ${reading ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{reading ? "Reading the model list" : "Read the model list again"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Add a model" onClick={() => setAdding(true)} className="h-8 w-8 text-muted-foreground">
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add a model</TooltipContent>
        </Tooltip>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Filter" className={`relative h-8 w-8 ${filtered ? "text-foreground" : "text-muted-foreground"}`}>
                  <ListFilter className="h-4 w-4" />
                  {filtered && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Filter</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-56 space-y-2 p-2">
            <label className="flex items-center justify-between gap-2 px-1 text-xs">
              Bookmarked only
              <Switch checked={onOnly} onCheckedChange={setOnOnly} />
            </label>
            {tab === "video" && (
              <label className="flex items-center justify-between gap-2 px-1 text-xs">
                Makes audio
                <Switch checked={audioOnly} onCheckedChange={setAudioOnly} />
              </label>
            )}
            {makers.length > 1 && (
              <div>
                <div className="px-1 pb-1 text-xs font-semibold uppercase text-muted-foreground">Maker</div>
                <div className="max-h-48 overflow-y-auto">
                  {["", ...makers].map((name) => (
                    <Button key={name || "all"} type="button" variant="ghost" size="sm" onClick={() => setMaker(name)} className="h-7 w-full justify-between px-2 text-xs">
                      {name || "All makers"}
                      {maker === name && <Check className="h-3 w-3" />}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {filtered && (
              <Button type="button" variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => { setMaker(""); setAudioOnly(false); setOnOnly(false) }}>
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Sort" className="h-8 w-8 text-muted-foreground">
                  <ArrowDownUp className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Sort: {SORTS.find((x) => x.id === sort)?.label}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-52 p-1">
            {SORTS.map((o) => (
              <Button key={o.id} type="button" variant="ghost" size="sm" onClick={() => setSort(o.id)} className="h-7 w-full justify-between px-2 text-xs">
                {o.label}
                {sort === o.id && <Check className="h-3 w-3" />}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {mine.length === 0 && <EmptyProvider providerId={providerId} settings={settings} />}

      {split ? (
        <>
          {starredRows.length > 0 && (
            <>
              <div className="px-2 pt-1 text-xs font-semibold text-foreground">Bookmarked <span className="font-mono text-muted-foreground">{starredRows.length}</span></div>
              <div className="space-y-1">{starredRows.map(renderRow)}</div>
            </>
          )}
          <Disclosure title="Top models" count={topRows.length} note="industry leaders and newest" open={showTop || searching} onToggle={() => setShowTop((v) => !v)} />
          {(showTop || searching) && <div className="space-y-1">{topRows.map(renderRow)}</div>}
          {otherRows.length > 0 && (
            <>
              <Disclosure title="Other models" count={otherRows.length} note="the rest, older and niche" open={showOthers || searching} onToggle={() => setShowOthers((v) => !v)} />
              {(showOthers || searching) && <div className="space-y-1">{otherRows.map(renderRow)}</div>}
            </>
          )}
        </>
      ) : (
        <div className="space-y-1">{topRows.map(renderRow)}</div>
      )}
      <AddModelDialog
        open={adding}
        onClose={() => setAdding(false)}
        settings={settings}
        onAdded={(record) => addBookmark(record.id)}
      />
      <EditModelDialog model={editing} onClose={() => setEditing(null)} settings={settings} />
      <ModelParamsDialog model={viewing ? (listed.find((r) => r.id === viewing.id) ?? viewing) : null} onClose={() => setViewing(null)} />
    </div>
  )
}

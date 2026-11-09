import * as React from "react"
import { ArrowDownUp, Check, ChevronDown, LayoutGrid, Layers, ListFilter, Search, SlidersHorizontal, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelLogo } from "@/components/ui/model-logo"
import { PriceCell } from "@/components/ui/price-cell"
import { ModelChips } from "@/components/ui/model-chips"
import { FilterBadge, NewBadge } from "@/components/ui/filter-badge"
import { toggleBookmark, useBookmarks } from "@/lib/registry/bookmarks"
import { arrange } from "@/lib/registry/ranking"
import { standardRun } from "@/lib/registry/price"
import { PROVIDERS } from "@/lib/registry/providers"
import { useListedModels } from "@/lib/registry/store"
import { versionRows } from "@/lib/registry/families"
import { resRank } from "@/lib/registry/summary"
import type { AppCategory, ModelRecord } from "@/lib/registry/types"
import { capabilityOf, capabilityOfExact, standardChips, type StandardChip } from "@/lib/capability"
import { cn } from "@/lib/utils"

/**
 * The one model selector of the app. Search, filter and sort on top; then providers (logos), makers and their models. Everywhere a model is
 * chosen it is this: the composer, the AI tools, Elements and Settings → Providers. One row per model version, in Best order (closed before open, the most popular makers first, a maker's newest models; starred models first on a category list).
 * "pick" chooses a model on click; "manage" opens its details.
 */

const CATEGORIES: Array<{ id: AppCategory; label: string }> = [
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Audio" },
  { id: "text", label: "Chat" },
]

type SortKey = "best" | "newest" | "price-asc" | "price-desc" | "name" | "longest" | "resolution"
const SORTS: Array<{ key: SortKey; label: string; only?: AppCategory[] }> = [
  { key: "best", label: "Best" },
  { key: "newest", label: "Newest" },
  { key: "price-asc", label: "Price, low to high" },
  { key: "price-desc", label: "Price, high to low" },
  { key: "name", label: "Name A to Z" },
  { key: "longest", label: "Longest clips", only: ["video", "audio"] },
  { key: "resolution", label: "Highest resolution", only: ["video", "image"] },
]

interface Filters {
  bookmarked?: boolean
  task?: string
  audio?: boolean
  minSeconds?: number
  minRes?: number
  minContext?: number
  /** What it can do, in the standard words people see */
  can?: StandardChip
}
const FILTERS: Array<{ id: keyof Filters; label: string; only?: AppCategory[]; options: Array<{ label: string; value: string | number | boolean | undefined }> }> = [
  { id: "bookmarked", label: "Show", options: [{ label: "All", value: undefined }, { label: "Bookmarked", value: true }] },
  { id: "task", label: "Input", only: ["video", "image"], options: [{ label: "Any", value: undefined }, { label: "From words", value: "text-to" }, { label: "From an image", value: "image-to" }] },
  { id: "audio", label: "Audio", only: ["video"], options: [{ label: "Any", value: undefined }, { label: "With audio", value: true }] },
  { id: "minSeconds", label: "Clip length", only: ["video", "audio"], options: [{ label: "Any", value: undefined }, { label: "10s or more", value: 10 }, { label: "15s or more", value: 15 }] },
  { id: "minRes", label: "Resolution", only: ["video", "image"], options: [{ label: "Any", value: undefined }, { label: "1080p or more", value: 3 }, { label: "4K", value: 6 }] },
  { id: "minContext", label: "Context", only: ["text"], options: [{ label: "Any", value: undefined }, { label: "200K or more", value: 200_000 }, { label: "1M or more", value: 1_000_000 }] },
  {
    id: "can",
    label: "Can do",
    options: [{ label: "Any", value: undefined }, ...(["Create", "Edit", "Start frame", "End frame", "References", "Video in", "Audio in", "Vision", "Web search", "Reasoning", "Works with Agent"] as const).map((c) => ({ label: c, value: c }))],
  },
]

/** Models the app uses for its own work (the Agent's brain, embeddings for search): the Decision tab */
const isDecision = (r: ModelRecord): boolean => {
  const c = capabilityOfExact(r)
  return (r.category === "text" && c.abilities.includes("actions")) || c.does.includes("embed")
}

const matches = (r: ModelRecord, f: Filters, marked: ReadonlySet<string>, pool: ModelRecord[]): boolean => {
  const s = r.summary
  if (f.can && !standardChips(capabilityOf(r, pool), Boolean(s?.audio)).includes(f.can)) return false
  if (f.bookmarked && !marked.has(r.id)) return false
  if (f.task && !(r.task ?? "").startsWith(f.task)) return false
  if (f.audio && !s?.audio) return false
  if (f.minSeconds && (s?.maxSeconds ?? 0) < f.minSeconds) return false
  if (f.minRes && (s?.maxResolution ? resRank(s.maxResolution) : -1) < f.minRes) return false
  if (f.minContext && (s?.contextTokens ?? 0) < f.minContext) return false
  return true
}

/** Newest first: the version, then the day the provider last updated it */
const newest = (a: ModelRecord, b: ModelRecord) => {
  const v = (r: ModelRecord) => (r.version?.[0] ?? 0) * 1000 + (r.version?.[1] ?? 0)
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || v(b) - v(a) || a.name.localeCompare(b.name)
}
const price = (r: ModelRecord) => (r.category === "text" ? r.price.amount : standardRun(r).estimate.usd) ?? Number.POSITIVE_INFINITY
const COMPARE: Record<SortKey, (a: ModelRecord, b: ModelRecord) => number> = {
  best: () => 0,
  newest,
  "price-asc": (a, b) => price(a) - price(b),
  "price-desc": (a, b) => (price(b) === Infinity ? -1 : price(a) === Infinity ? 1 : price(b) - price(a)),
  name: (a, b) => a.name.localeCompare(b.name),
  longest: (a, b) => (b.summary?.maxSeconds ?? 0) - (a.summary?.maxSeconds ?? 0),
  resolution: (a, b) => (b.summary?.maxResolution ? resRank(b.summary.maxResolution) : -1) - (a.summary?.maxResolution ? resRank(a.summary.maxResolution) : -1),
}

/** Who made a model, as the makers column names it: the database's maker, else the brand its provider files it under */
export const makerName = (m: ModelRecord): string => m.maker || (m.logoKey ? m.logoKey.charAt(0).toUpperCase() + m.logoKey.slice(1) : "Other")

export interface ModelPickerProps {
  /** pick: a click chooses the model. manage: a click opens it (Settings). */
  mode: "pick" | "manage"
  /** The categories it may show; one category hides the tabs. Default: all four. */
  categories?: AppCategory[]
  /** Only this provider's models, and no provider column (Settings, where the provider is chosen above) */
  provider?: string
  /** The models to choose from, when not every listed one fits (the models a tool can use, the vision models) */
  records?: ModelRecord[]
  activeId?: string
  onPick?: (m: ModelRecord) => void
  onOpen?: (m: ModelRecord) => void
  /** Why a model does not fit what is attached; shown muted with the reason, still choosable */
  mutedReason?: (m: ModelRecord) => string | undefined
  /** Narrow places: no provider and maker columns, names and prices only */
  compact?: boolean
  /** Extra buttons at the end of the top row (Settings: add a model) */
  actions?: React.ReactNode
  /** Shown instead of the list when there is nothing at all */
  empty?: React.ReactNode
  /** Extra marks after the price in a row (Settings: where the price came from) */
  rowExtra?: (m: ModelRecord) => React.ReactNode
  /** The records are a job's models already in their best order: shown in that order (Best), not by bookmark or newest */
  ordered?: boolean
  className?: string
}

export function ModelPicker({ ordered, mode, categories = CATEGORIES.map((c) => c.id), provider: fixedProvider, records, activeId, onPick, onOpen, mutedReason, compact, actions, empty, rowExtra, className }: ModelPickerProps) {
  const listed = useListedModels()
  const marked = useBookmarks()
  const [query, setQuery] = React.useState("")
  // Always Best to start with: a person choosing a model cannot be expected to know every model and maker
  const [sort, setSort] = React.useState<SortKey>("best")
  const [filters, setFilters] = React.useState<Filters>({})
  const [providerPick, setProviderPick] = React.useState("all")
  const [maker, setMaker] = React.useState("")
  const [tab, setTab] = React.useState<AppCategory | "all" | "decision">(categories.length === 1 ? categories[0]! : "all")
  const [closed, setClosed] = React.useState<Set<AppCategory>>(new Set())
  const provider = fixedProvider ?? providerPick

  // One row per model version: its text, image, reference and edit endpoints are one model
  const pool = React.useMemo(() => versionRows((records ?? listed).filter((m) => categories.includes(m.category))), [records, listed, categories])
  const byProvider = React.useMemo(() => pool.filter((m) => provider === "all" || m.provider === provider), [pool, provider])
  const inTab = React.useMemo(() => byProvider.filter((m) => tab === "all" || (tab === "decision" ? isDecision(m) : m.category === tab)), [byProvider, tab])

  // Where each model stands in Best: a job's list keeps the order it was handed in; any other list is ranked here (stars first on it)
  const standing = React.useMemo(() => {
    const order = ordered && records ? records : arrange(inTab, { starred: marked })
    return new Map(order.map((r, i) => [r.id, i]))
  }, [ordered, records, inTab, marked])
  const place = (m: ModelRecord) => standing.get(m.id) ?? [...standing.entries()].find(([id]) => id.split("|")[0] === m.id)?.[1] ?? 9999

  const tabCounts = React.useMemo(() => {
    const c: Record<string, number> = { all: byProvider.length }
    for (const m of byProvider) {
      c[m.category] = (c[m.category] ?? 0) + 1
      if (isDecision(m)) c.decision = (c.decision ?? 0) + 1
    }
    return c
  }, [byProvider])

  // The makers of what is shown, most models first
  const makers = React.useMemo(() => {
    const by = new Map<string, { count: number; sample: ModelRecord }>()
    for (const m of inTab) {
      const k = makerName(m)
      const e = by.get(k)
      if (e) e.count++
      else by.set(k, { count: 1, sample: m })
    }
    const first = new Map<string, number>()
    for (const m of inTab) first.set(makerName(m), Math.min(first.get(makerName(m)) ?? 9999, place(m)))
    const list = [...by.entries()].map(([name, e]) => ({ name, ...e }))
    return sort === "best" ? list.sort((a, b) => first.get(a.name)! - first.get(b.name)!) : list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [inTab, sort, standing]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (maker && !makers.some((x) => x.name === maker)) setMaker("")
  }, [maker, makers])

  // Bookmarked first, then the rest; each part in the chosen order (newest to oldest unless another sort is chosen)
  const rows = React.useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const found = inTab
      .filter((m) => !maker || makerName(m) === maker)
      .filter((m) => matches(m, filters, marked, listed))
      .filter((m) => tokens.every((t) => `${m.name} ${m.variant ?? ""} ${m.endpoint} ${makerName(m)} ${m.family}`.toLowerCase().includes(t)))
      .sort(sort === "best" ? (a, b) => place(a) - place(b) : COMPARE[sort])
    // Best already has the stars first (on a category list) or none (a job's list); every other sort puts starred models first
    if (sort === "best" || ordered) return found
    return [...found.filter((m) => marked.has(m.id)), ...found.filter((m) => !marked.has(m.id))]
  }, [inTab, maker, filters, marked, query, sort, listed, ordered, standing]) // eslint-disable-line react-hooks/exhaustive-deps

  const shownCategory = tab === "all" ? undefined : tab === "decision" ? "text" : tab
  const activeFilters = Object.values(filters).filter((v) => v !== undefined).length

  const row = (m: ModelRecord) => {
    const selected = m.id === activeId
    const why = mutedReason?.(m)
    const act = () => (mode === "pick" ? onPick?.(m) : onOpen?.(m))
    return (
      <div
        key={m.id}
        role="button"
        tabIndex={0}
        aria-label={mode === "pick" ? `Choose ${m.name}` : `Open ${m.name}`}
        aria-current={selected || undefined}
        title={why ? `Muted: ${why}` : undefined}
        onClick={act}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault()
            act()
          }
        }}
        className={cn(
          "grid cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "grid-cols-[1.125rem_minmax(0,1fr)_auto]" : "grid-cols-[1.125rem_11rem_minmax(0,1fr)_auto]",
          selected && "bg-secondary",
          why && "opacity-40",
        )}
      >
        <ModelLogo name={m.name} endpoint={m.endpoint} family={m.family} provider={m.provider} size={18} />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground" title={m.id}>
            {m.name}
          </span>
          {m.variant && <span className="flex-shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 text-xs leading-none text-foreground/70">{m.variant}</span>}
          <FilterBadge model={m} />
          <NewBadge model={m} />
        </span>
        {!compact && (
          <span className="min-w-0">
            <ModelChips model={m} showId={false} fit />
          </span>
        )}
        <span className="flex flex-shrink-0 items-center justify-end gap-2">
          {rowExtra?.(m)}
          <span className="flex w-24 justify-end">
            <PriceCell price={m.price} category={m.category} model={m} />
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
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
                onKeyDown={(e) => e.stopPropagation()}
                className={cn("h-7 w-7", marked.has(m.id) ? "text-foreground" : "text-muted-foreground")}
              >
                <Star className={cn("h-3.5 w-3.5", marked.has(m.id) && "fill-current")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{marked.has(m.id) ? "Bookmarked: shown first" : "Bookmark: show first"}</TooltipContent>
          </Tooltip>
          {mode === "manage" && onOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  aria-label={`Options for ${m.name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(m)
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-7 w-7 text-muted-foreground"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings, price and details</TooltipContent>
            </Tooltip>
          )}
          {mode === "pick" && <Check className={cn("h-3.5 w-3.5", !selected && "invisible")} />}
        </span>
      </div>
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* Top: categories (when there are several), search, filter, sort */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border/70 p-2">
        {categories.length > 1 && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as AppCategory | "all" | "decision")}>
            <TabsList>
              <TabsTrigger value="all" className="gap-1.5 text-xs">
                All <span className="font-mono text-muted-foreground">{tabCounts.all ?? 0}</span>
              </TabsTrigger>
              {CATEGORIES.filter((c) => categories.includes(c.id) && tabCounts[c.id]).map((c) => (
                <TabsTrigger key={c.id} value={c.id} className="gap-1.5 text-xs">
                  {c.label} <span className="font-mono text-muted-foreground">{tabCounts[c.id]}</span>
                </TabsTrigger>
              ))}
              {categories.includes("text") && Boolean(tabCounts.decision) && (
                <TabsTrigger value="decision" className="gap-1.5 text-xs" title="Models the app uses for its own work: the Agent and search">
                  Decision <span className="font-mono text-muted-foreground">{tabCounts.decision}</span>
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        )}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus={mode === "pick"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search models" className="h-8 pl-8 text-xs" />
        </div>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Filter" className={cn("relative h-8 w-8", activeFilters ? "text-foreground" : "text-muted-foreground")}>
                  <ListFilter className="h-4 w-4" />
                  {activeFilters > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Filter</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-64 space-y-3">
            {FILTERS.filter((g) => !g.only || !shownCategory || g.only.includes(shownCategory)).map((g) => (
              <div key={g.id} className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">{g.label}</div>
                <div className="flex flex-wrap gap-1">
                  {g.options.map((o) => (
                    <Button key={o.label} type="button" size="sm" variant={filters[g.id] === o.value ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setFilters((f) => ({ ...f, [g.id]: o.value }))}>
                      {o.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {activeFilters > 0 && (
              <Button type="button" variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => setFilters({})}>
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
            <TooltipContent>Sort: {SORTS.find((s) => s.key === sort)?.label}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-52 p-1">
            {SORTS.filter((s) => !s.only || !shownCategory || s.only.includes(shownCategory)).map((s) => (
              <Button key={s.key} type="button" variant="ghost" size="sm" onClick={() => setSort(s.key)} className="h-7 w-full justify-between px-2 text-xs">
                {s.label}
                {sort === s.key && <Check className="h-3 w-3" />}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
        {actions}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Providers: logos only */}
        {!fixedProvider && !compact && (
          <nav aria-label="Providers" className="flex w-12 flex-shrink-0 flex-col items-center gap-1 overflow-y-auto scroll-smooth border-r border-border/70 py-2 no-scrollbar">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant={provider === "all" ? "secondary" : "ghost"} size="icon" aria-label="All providers" aria-pressed={provider === "all"} onClick={() => setProviderPick("all")} className="h-8 w-8">
                  <Layers className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">All providers · {pool.length}</TooltipContent>
            </Tooltip>
            {PROVIDERS.map((p) => {
              const n = pool.filter((m) => m.provider === p.id).length
              return (
                <Tooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <Button type="button" variant={provider === p.id ? "secondary" : "ghost"} size="icon" aria-label={p.label} aria-pressed={provider === p.id} onClick={() => setProviderPick(p.id)} className={cn("h-8 w-8", n === 0 && "opacity-40")}>
                      <ModelLogo provider={p.id} size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {p.label} · {n}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </nav>
        )}

        {/* Makers */}
        {!compact && (
          <nav aria-label="Makers" className="flex w-44 flex-shrink-0 flex-col gap-1 overflow-y-auto scroll-smooth border-r border-border/70 p-2 no-scrollbar">
            {[{ name: "", count: inTab.length, sample: null as ModelRecord | null }, ...makers].map((x) => {
              const active = maker === x.name
              return (
                <Button
                  key={x.name || "all"}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={active}
                  onClick={() => setMaker(x.name)}
                  className={cn("h-8 w-full flex-shrink-0 justify-between gap-2 rounded-lg px-2 text-xs", active ? "bg-secondary font-semibold text-foreground" : "font-normal text-muted-foreground")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {x.sample ? <ModelLogo name={x.sample.name} endpoint={x.sample.endpoint} family={x.sample.family} provider={x.sample.provider} size={14} /> : <LayoutGrid className="h-3.5 w-3.5 flex-shrink-0" />}
                    <span className="truncate">{x.name || "All makers"}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">{x.count}</span>
                </Button>
              )
            })}
          </nav>
        )}

        {/* Models */}
        <div className="min-h-0 min-w-0 flex-1 space-y-1 overflow-y-auto scroll-smooth p-2 no-scrollbar">
          {pool.length === 0 && empty}
          {pool.length > 0 && rows.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">Nothing matches. Try another maker, search or filter.</p>}
          {tab === "all"
            ? CATEGORIES.filter((c) => rows.some((m) => m.category === c.id)).map((c) => {
                const open = !closed.has(c.id)
                const list = rows.filter((m) => m.category === c.id)
                return (
                  <section key={c.id} className="space-y-1">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-expanded={open}
                      onClick={() => setClosed((prev) => (prev.has(c.id) ? new Set([...prev].filter((x) => x !== c.id)) : new Set([...prev, c.id])))}
                      className="h-8 w-full justify-between px-2 text-xs"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{c.label}</span>
                        <span className="font-mono text-muted-foreground">{list.length}</span>
                      </span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
                    </Button>
                    {open && list.map(row)}
                  </section>
                )
              })
            : rows.map(row)}
        </div>
      </div>
    </div>
  )
}

/**
 * A model field: the chosen model as a button that opens the one model selector, limited to the models that fit (a tool's models, the
 * vision models). Used wherever a form asks for a model.
 */
export function ModelPickerButton({ records, value, onChange, label = "Model", className, side = "bottom", ordered }: { records: ModelRecord[]; ordered?: boolean; value?: string; onChange: (id: string) => void; label?: string; className?: string; /** Which side of the button the list opens on; it always stays inside the window */ side?: "top" | "bottom" | "left" | "right" }) {
  const [open, setOpen] = React.useState(false)
  const chosen = records.find((r) => r.id === value)
  const categories = React.useMemo(() => [...new Set(records.map((r) => r.category))], [records])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" aria-label={label} className={cn("h-8 min-w-0 justify-between gap-2 px-2 text-xs font-normal", className)}>
          <span className="flex min-w-0 items-center gap-2">
            {chosen && <ModelLogo name={chosen.name} endpoint={chosen.endpoint} family={chosen.family} provider={chosen.provider} size={14} />}
            <span className="truncate">{chosen?.name ?? "Choose a model"}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align="start" collisionPadding={16} className="h-[26rem] max-h-[var(--radix-popover-content-available-height)] w-[44rem] max-w-[var(--radix-popover-content-available-width)] p-0">
        <ModelPicker
          mode="pick"
          ordered={ordered}
          records={records}
          categories={categories}
          activeId={value}
          onPick={(m) => {
            onChange(m.id)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

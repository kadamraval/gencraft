import * as React from "react"
import {
  Search,
  RefreshCw,
  Clock,
  Plug,
  Wallet,
  X,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useMoney } from "@/lib/currency/currency"
import { useKeyedProviders } from "@/lib/registry/store"
import {
  usageLedger,
  UsageDateRange,
  UsageLedgerItem,
  SpendOverviewData,
  ModalityCategory,
  ProviderId,
} from "@/lib/ledger/usage-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProviderLogo, BrandLogo } from "@/components/chat/brand-logos"
import { falBillingAccess, reconcileFalUsage } from "@/lib/ledger/fal-usage"
import { getProviderApiKey } from "@/lib/providers/live-connectors"
import type { SettingsState } from "@/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface UsageHistoryViewProps {
  onClose?: () => void
  /** For fal's billing data: the fal key is read from here */
  settings?: SettingsState
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
  fal: "fal.ai",
  openai: "OpenAI",
  gemini: "Google Gemini",
  replicate: "Replicate",
  openrouter: "OpenRouter",
}

const CATEGORY_LABELS: Record<ModalityCategory, string> = {
  video: "Video",
  image: "Image",
  audio: "Audio",
  text: "Text",
  embedded: "Embedding",
}

/** One figure with what it means, as its own card. */
function StatCard({ icon: Icon, label, value, caption }: { icon: LucideIcon; label: string; value: string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className="truncate text-xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{caption}</div>
    </div>
  )
}

export function UsageHistoryView({ onClose: _onClose, settings }: UsageHistoryViewProps) {
  const money = useMoney()
  const keyedCount = useKeyedProviders().length
  const [searchQuery, setSearchQuery] = React.useState("")
  const [dateRange, setDateRange] = React.useState<UsageDateRange>("3months")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [providerFilter, setProviderFilter] = React.useState<string>("all")
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [, setTick] = React.useState(0)

  // Subscribe to ledger updates
  React.useEffect(() => {
    return usageLedger.subscribe(() => setTick((t) => t + 1))
  }, [])

  // fal does not say what a run cost, so its runs are estimates until fal's own billing data is read (lib/ledger/fal-usage.ts)
  const falKey = settings ? getProviderApiKey("fal", settings) : ""
  React.useEffect(() => {
    void reconcileFalUsage(falKey)
  }, [falKey])
  const falEstimated = usageLedger.getAllItems().some((i) => i.provider === "fal" && i.category !== "text" && i.basis === "estimated")

  const overview: SpendOverviewData = React.useMemo(() => {
    return usageLedger.getSpendOverview(dateRange)
  }, [dateRange])

  const filteredItems: UsageLedgerItem[] = React.useMemo(() => {
    const raw = usageLedger.getFilteredItems(dateRange, categoryFilter, "all", providerFilter)
    if (!searchQuery.trim()) return raw
    const q = searchQuery.toLowerCase()
    return raw.filter((item) => {
      const matchName = item.modelName.toLowerCase().includes(q)
      const matchProv = PROVIDER_NAMES[item.provider]?.toLowerCase().includes(q)
      const matchCat = item.category.toLowerCase().includes(q)
      const matchSpecs = item.specs?.toLowerCase().includes(q)
      return matchName || matchProv || matchCat || matchSpecs
    })
  }, [dateRange, categoryFilter, providerFilter, searchQuery])

  const lastRun = usageLedger.getFilteredItems("all", "all", "all", "all")[0]

  const handleRefresh = () => {
    setIsRefreshing(true)
    void reconcileFalUsage(falKey, Date.now(), true)
    setTimeout(() => {
      setIsRefreshing(false)
      setTick((t) => t + 1)
    }, 300)
  }

  const dateLabels: Record<UsageDateRange, string> = {
    today: "Today",
    weekly: "This week",
    monthly: "This month",
    "3months": "Last 3 months",
    all: "All time",
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="w-full space-y-6 select-none">
        {falEstimated && falBillingAccess() === "denied" && (
          <p className="text-xs text-muted-foreground">fal does not report what a run cost, so fal runs show an estimate. Use a fal key with billing access to make them exact.</p>
        )}
        {/* ------------------------------------------------------------- */}
        {/* 1. TOP TOOLBAR: SEARCH (LEFT) + FILTER, DATE, REFRESH (RIGHT) */}
        {/* Spacious, uncrowded single-row toolbar                        */}
        {/* ------------------------------------------------------------- */}
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-border/60 flex-wrap">
          {/* Left: Search input */}
          <div className="relative flex-1 min-w-56 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search runs, models, providers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-8 text-xs bg-secondary/30 border-border/70 focus-visible:ring-1"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-foreground p-0 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Category / Modality Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-32 text-xs bg-secondary/30 border-border/70">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modalities</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="embedded">Embedding</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range Selector */}
            <Select
              value={dateRange}
              onValueChange={(val) => setDateRange(val as UsageDateRange)}
            >
              <SelectTrigger className="h-9 w-36 text-xs font-medium border-border/70 bg-secondary/30">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="weekly">This week</SelectItem>
                <SelectItem value="monthly">This month</SelectItem>
                <SelectItem value="3months">Last 3 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  className="h-9 px-3 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-secondary/60 text-xs flex items-center gap-1.5 cursor-pointer"
                  aria-label="Refresh telemetry"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`}
                  />
                  <span className="hidden sm:inline text-xs">Sync</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>Refresh telemetry</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Summary: one card per figure */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Wallet} label="Spent" value={money.format(overview.totalCostUsd)} caption={`${dateLabels[dateRange]}, paid straight to your providers`} />
          <StatCard
            icon={Zap}
            label="Runs"
            value={String(overview.totalGenerations)}
            caption={overview.totalGenerations > 0 ? `${money.format(overview.avgCostPerRun)} on average` : "Nothing generated yet"}
          />
          <StatCard icon={Plug} label="Providers" value={`${keyedCount} of ${Object.keys(PROVIDER_NAMES).length}`} caption="have a key saved" />
          <StatCard icon={Clock} label="Last run" value={lastRun ? lastRun.date.split(" ").slice(-2).join(" ") : "None yet"} caption={lastRun ? lastRun.modelName : "Runs appear here as you generate"} />
        </div>

        {/* Providers: a card each, click to filter the history below */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="font-semibold text-foreground">Providers</span>
            {providerFilter !== "all" ? (
              <Button variant="ghost" size="sm" onClick={() => setProviderFilter("all")} className="h-5 px-2 text-xs text-primary hover:text-primary/80 font-medium cursor-pointer">
                Reset filter ({filteredItems.length} runs shown)
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Click a provider to filter the history</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {overview.providers.map((p) => {
              const isSelected = providerFilter === p.provider
              return (
                <Button
                  key={p.provider}
                  variant="ghost"
                  type="button"
                  onClick={() => setProviderFilter(isSelected ? "all" : p.provider)}
                  aria-label={p.label}
                  className={`h-auto flex-col items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                    isSelected ? "border-select/50 bg-select/10" : "border-border/70 bg-card hover:bg-secondary/50"
                  }`}
                >
                  <span className="flex w-full items-center gap-2">
                    <ProviderLogo provider={p.provider} size={18} />
                    <span className="truncate text-xs font-medium text-foreground">{p.label}</span>
                  </span>
                  <span className="text-base font-semibold tracking-tight text-foreground">{money.format(p.costUsd)}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.runs} run{p.runs === 1 ? "" : "s"}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 4. RUN HISTORY TABLE: FULL SCROLL (NO FIXED HEIGHT BOX)       */}
        {/* Generous row height, authentic model logos & clear alignment  */}
        {/* ------------------------------------------------------------- */}
        <div className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
          {/* Table Header: Sticky at top of container with generous padding */}
          <div className="sticky top-0 z-10 grid grid-cols-[160px_1fr_120px_120px_100px] items-center gap-4 py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-secondary/40 backdrop-blur-sm">
            <div>Provider</div>
            <div>Model & Specs</div>
            <div>Modality</div>
            <div className="text-right">Direct Cost</div>
            <div className="text-right">Recorded</div>
          </div>

          {/* Table Data Rows: Full natural flow, no inner scroll trap */}
          <div className="divide-y divide-border/30">
            {filteredItems.length === 0 ? (
              <div className="py-20 text-center text-xs text-muted-foreground">
                No telemetry records found matching your active filters.
              </div>
            ) : (
              filteredItems.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[160px_1fr_120px_120px_100px] items-center gap-4 py-3.5 px-4 hover:bg-muted/40 transition-colors text-xs"
                >
                  {/* Provider: Authentic Logo + Label */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <ProviderLogo provider={row.provider} size={18} />
                    <span className="font-semibold text-foreground truncate">
                      {PROVIDER_NAMES[row.provider] || row.provider}
                    </span>
                  </div>

                  {/* Model & Specs: Authentic Model Brand Logo + Specs */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <BrandLogo brand={row.modelName} size={18} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate" title={row.modelName}>
                        {row.modelName}
                      </div>
                      {row.specs && (
                        <div className="text-muted-foreground text-xs truncate mt-0.5">
                          {row.specs}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modality Category */}
                  <div>
                    <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-secondary/80 text-foreground">
                      {CATEGORY_LABELS[row.category] || row.category}
                    </span>
                  </div>

                  {/* Cost */}
                  <div className="text-right font-mono font-bold text-foreground">
                    {row.basis === "estimated" ? "≈ " : ""}
                    {money.format(row.costUsd)}
                  </div>

                  {/* Timestamp */}
                  <div className="text-right text-muted-foreground font-mono text-xs truncate">
                    {row.date.split(" ").slice(-2).join(" ")}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Table Footer: Pinned at bottom of the full list */}
          <div className="px-4 py-3 border-t border-border/50 bg-secondary/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {filteredItems.length} records in {dateLabels[dateRange]}
            </span>
            <span className="font-mono">Direct Telemetry · BYOK Wholesale</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

import * as React from "react"
import {
  Search,
  SlidersHorizontal,
  Minus,
  Square,
  X,
  Check,
  FolderKanban,
  Sparkles,
  Calendar,
  CircleDashed,
  Upload,
  Heart,
  Download,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  Clapperboard,
  Layers,
  Compass,
  Palette,
  Blocks,
  Sun,
  Moon,
  Activity,
  Settings,
  Home,
  HelpCircle,
  BookOpen,
  LifeBuoy,
  PlayCircle,
} from "lucide-react"
import {
  MediaTypeFilter,
  MediaStatusFilter,
  DateRangeFilter,
  MediaActivityFilter,
  LayoutMode,
  CardSizeStep,
  Project,
  MainNavTab,
} from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usageLedger, UsageDateRange } from "@/lib/ledger/usage-store"
import { closeWindow, inDesktopApp, minimizeWindow, toggleMaximizeWindow } from "@/lib/window"

interface TitleBarProps {
  /** Create is showing its pictures, videos or sounds: the view and filter tools are shown there too (without the Type and Activity filters, which do not apply) */
  showMediaTools?: boolean
  layoutMode: LayoutMode
  onLayoutModeChange: (mode: LayoutMode) => void
  cardSizeStep: CardSizeStep
  onCardSizeStepChange: (step: CardSizeStep) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  typeFilter: MediaTypeFilter
  onTypeFilterChange: (type: MediaTypeFilter) => void
  modelFilter?: string
  onModelFilterChange?: (model: string) => void
  dateRangeFilter?: DateRangeFilter
  onDateRangeFilterChange?: (range: DateRangeFilter) => void
  statusFilter: MediaStatusFilter
  onStatusFilterChange: (status: MediaStatusFilter) => void
  hideFailed: boolean
  onHideFailedChange: (hide: boolean) => void
  activityFilter: MediaActivityFilter
  onActivityFilterChange: (activity: MediaActivityFilter) => void
  onLockApp: () => void
  activeProject?: Project
  onOpenProjects?: () => void
  activeTab?: MainNavTab
  onTabChange?: (tab: MainNavTab) => void
  isDark?: boolean
  onToggleTheme?: () => void
  onOpenSettings?: (tab?: string) => void
  onOpenUsage?: () => void
  /** Beside the project button: History in Chat and Agent, Library in the media modes */
  contextAction?: React.ReactNode
}

type FilterSubMenu = null | "type" | "model" | "date" | "status"

const NAV_TABS = [
  { id: "chat" as const, label: "Create", icon: MessageSquare },
  { id: "story" as const, label: "Story", icon: Clapperboard },
  { id: "library" as const, label: "Library", icon: Layers },
  { id: "inspiration" as const, label: "Inspiration", icon: Compass },
  { id: "brand" as const, label: "Brand", icon: Palette },
  { id: "apps" as const, label: "Apps", icon: Blocks, badge: undefined },
]

/* Precise SVG matching user's Square Layout Icon */
function SquareLayoutIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  )
}

/* Precise SVG matching user's Masonry Layout Icon */
function MasonryLayoutIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="14" x2="12" y2="14" />
      <line x1="12" y1="9" x2="21" y2="9" />
    </svg>
  )
}

export function TitleBar({
  showMediaTools = false,
  layoutMode = "masonry",
  onLayoutModeChange,
  cardSizeStep = 1,
  onCardSizeStepChange,
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  modelFilter = "all",
  onModelFilterChange,
  dateRangeFilter = "all",
  onDateRangeFilterChange,
  statusFilter,
  onStatusFilterChange,
  hideFailed,
  onHideFailedChange,
  activityFilter,
  onActivityFilterChange,
  onLockApp,
  activeProject,
  onOpenProjects,
  activeTab = "chat",
  onTabChange,
  isDark = true,
  onToggleTheme,
  onOpenSettings,
  onOpenUsage,
  contextAction,
}: TitleBarProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [searchPopoverOpen, setSearchPopoverOpen] = React.useState(false)
  const [activeSubMenu, setActiveSubMenu] = React.useState<FilterSubMenu>(null)
  const [filterPopoverOpen, setFilterPopoverOpen] = React.useState(false)
  const [viewPopoverOpen, setViewPopoverOpen] = React.useState(false)

  // Interactive hover card date range state
  const [hoverDateRange, setHoverDateRange] = React.useState<UsageDateRange>("3months")

  // Live BYOK spend ledger subscription
  const [ledgerOverview, setLedgerOverview] = React.useState(() => usageLedger.getSpendOverview(hoverDateRange))

  React.useEffect(() => {
    return usageLedger.subscribe(() => {
      setLedgerOverview(usageLedger.getSpendOverview(hoverDateRange))
    })
  }, [hoverDateRange])

  const hoverOverview = React.useMemo(() => {
    return usageLedger.getSpendOverview(hoverDateRange)
  }, [hoverDateRange, ledgerOverview])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setSearchPopoverOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 80)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleFilterOpenChange = (open: boolean) => {
    setFilterPopoverOpen(open)
    if (!open) {
      setActiveSubMenu(null)
    }
  }

  // Label helpers for active selections
  const getTypeLabel = () => {
    switch (typeFilter) {
      case "video":
        return "Videos"
      case "image":
        return "Images"
      case "audio":
        return "Audio"
      default:
        return "All types"
    }
  }

  const getModelLabel = () => {
    if (!modelFilter || modelFilter === "all") return "All models"
    if (modelFilter.toLowerCase().includes("kling")) return "Kling v1.5 Pro"
    if (modelFilter.toLowerCase().includes("flux")) return "FLUX.1 Schnell"
    if (modelFilter.toLowerCase().includes("runway")) return "Runway Gen-3"
    if (modelFilter.toLowerCase().includes("gemini")) return "Gemini 2.0"
    if (modelFilter.toLowerCase().includes("audio")) return "AudioCraft"
    return modelFilter
  }

  const getDateLabel = () => {
    switch (dateRangeFilter) {
      case "today":
        return "Today"
      case "7days":
        return "Past 7 days"
      case "30days":
        return "Past 30 days"
      default:
        return "Date range"
    }
  }

  const getStatusLabel = () => {
    switch (statusFilter) {
      case "completed":
        return "Completed"
      case "generating":
        return "Generating"
      case "failed":
        return "Failed"
      default:
        return "Status"
    }
  }

  const hasActiveFilters =
    typeFilter !== "all" ||
    modelFilter !== "all" ||
    dateRangeFilter !== "all" ||
    statusFilter !== "all" ||
    hideFailed ||
    activityFilter !== "all"

  return (
    <TooltipProvider delayDuration={150}>
      <header data-tauri-drag-region className="relative h-12 w-full flex-shrink-0 flex items-center justify-between px-5 bg-transparent select-none z-30">
        {/* ------------------------------------------------------------- */}
        {/* LEFT: GENCRAFT LOGO + COMPACT SEARCH (ICON + SHORTCUT ONLY) */}
        {/* ------------------------------------------------------------- */}
        <div data-tauri-drag-region className="flex items-center gap-3 shrink-0">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-foreground border border-border shadow-xs">
              <span className="font-bold text-xs font-mono">GC</span>
            </div>
            <span className="text-xs font-bold text-foreground tracking-tight hidden sm:inline">
              Gencraft
            </span>
          </div>

          {/* Search Trigger: Icon + Shortcut Key Only */}
          <Popover open={searchPopoverOpen} onOpenChange={setSearchPopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all text-xs cursor-pointer"
                    aria-label="Search"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <kbd className="text-xs font-mono text-muted-foreground/70 bg-secondary/60 px-1 py-0.2 rounded border border-border/50">
                      ⌘K
                    </kbd>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Search generations, prompts, tags (Ctrl+K)</TooltipContent>
            </Tooltip>

            <PopoverContent
              align="start"
              className="w-72 p-2 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl"
            >
              <div className="relative flex items-center">
                <Search className="h-3.5 w-3.5 text-muted-foreground ml-2 shrink-0 pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search (Ctrl+K)..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="h-8 w-full bg-transparent border-0 shadow-none pl-2 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
                  autoFocus
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="iconSm"
                    type="button"
                    onClick={() => onSearchChange("")}
                    className="absolute right-1 text-muted-foreground hover:text-foreground text-xs p-1"
                    aria-label="Clear"
                  >
                    ✕
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* CENTER: PROJECT SELECTOR (ON LEFT OF CHAT) + TOP NAVIGATION   */}
        {/* ------------------------------------------------------------- */}
        <div data-tauri-drag-region className="flex items-center gap-2 shrink-0">
          {contextAction}
          {/* Project Selector - Must be on the left side of Chat */}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onOpenProjects}
            className="h-8 px-2.5 rounded-xl border border-border/70 hover:bg-secondary/60 transition-all flex items-center gap-2 text-xs text-foreground font-medium shrink-0 group cursor-pointer"
            title="Switch Project"
          >
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="truncate max-w-32 text-xs font-semibold">
              {activeProject?.title || "Cyberpunk 2099"}
            </span>
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"
              title="Active Project"
            />
          </Button>

          {/* Subtle Vertical Divider */}
          <div className="h-4 w-px bg-border/60 shrink-0 mx-0.5" />

          {/* Main Navigation Tabs: Icon and Name */}
          <nav className="flex items-center gap-1 shrink-0 bg-secondary/30 p-0.5 rounded-xl border border-border/50">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-label="Home"
                  onClick={() => onTabChange?.("home")}
                  className={`h-7 w-7 p-0 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                    activeTab === "home"
                      ? "bg-card text-foreground shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                  }`}
                >
                  <Home className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Home</TooltipContent>
            </Tooltip>
            {NAV_TABS.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => onTabChange?.(item.id)}
                  className={`h-7 px-2.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? "bg-card text-foreground font-bold shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-xs px-1 py-0.2 rounded bg-primary/20 text-primary font-mono ml-0.5">
                      {item.badge}
                    </span>
                  )}
                </Button>
              )
            })}
          </nav>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* RIGHT, left to right: filter and view (Library only), light/dark, settings, price */}
        {/* ------------------------------------------------------------- */}
        <div data-tauri-drag-region className="flex items-center gap-1.5 shrink-0 justify-end">
          {/* Filter and View only where there is a list: Library and Inspiration */}
          {(activeTab === "library" || activeTab === "inspiration" || showMediaTools) && (
            <>
              {/* 1. VIEW POPOVER (Layout Square/Masonry + Card size 4-step slider) */}
              <Popover open={viewPopoverOpen} onOpenChange={setViewPopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="rounded-lg h-7 w-7 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                        aria-label="View options"
                      >
                        {layoutMode === "square" ? (
                          <SquareLayoutIcon className="h-3.5 w-3.5" />
                        ) : (
                          <MasonryLayoutIcon className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>View Options</TooltipContent>
                </Tooltip>

                <PopoverContent
                  align="end"
                  className="w-52 p-2.5 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl select-none"
                >
                  <div className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">
                    Layout
                  </div>

                  <div className="space-y-0.5">
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => onLayoutModeChange("square")}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <SquareLayoutIcon className="h-4 w-4 shrink-0 text-foreground" />
                        <span>Square</span>
                      </div>
                      {layoutMode === "square" && <Check className="h-4 w-4 text-foreground" />}
                    </Button>

                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => onLayoutModeChange("masonry")}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <MasonryLayoutIcon className="h-4 w-4 shrink-0 text-foreground" />
                        <span>Masonry</span>
                      </div>
                      {layoutMode === "masonry" && <Check className="h-4 w-4 text-foreground" />}
                    </Button>
                  </div>

                  <div className="h-px bg-border my-2" />

                  <div className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground">
                    Card Size
                  </div>
                  <div className="px-2 pt-1 pb-2">
                    <div className="relative flex items-center">
                      <div className="w-full h-1 bg-secondary rounded-full relative">
                        <div
                          className="absolute left-0 top-0 h-full bg-foreground rounded-full"
                          style={{ width: `${(cardSizeStep / 3) * 100}%` }}
                        />
                        {[0, 1, 2, 3].map((step) => (
                          <Button
                            key={step}
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => onCardSizeStepChange(step as CardSizeStep)}
                            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 p-0 rounded-full border-2 transition-all cursor-pointer ${
                              cardSizeStep >= step
                                ? "bg-foreground border-background"
                                : "bg-secondary border-muted-foreground/30"
                            }`}
                            style={{ left: `${(step / 3) * 100}%` }}
                            aria-label={`Step ${step}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {(activeTab === "library" || showMediaTools) && (
                <>
                  {/* 2. FILTER POPOVER */}
                  <Popover open={filterPopoverOpen} onOpenChange={handleFilterOpenChange}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            className={`rounded-lg h-7 w-7 transition-colors cursor-pointer relative ${
                              hasActiveFilters
                                ? "text-foreground bg-secondary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                            aria-label="Filter"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            {hasActiveFilters && (
                              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-foreground" />
                            )}
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Filter</TooltipContent>
                    </Tooltip>

                    <PopoverContent
                      align="end"
                      className="w-56 p-2 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl select-none"
                    >
                      {/* SUBMENU: TYPE DRILL-DOWN */}
                      {activeSubMenu === "type" && (
                        <div className="animate-fade-in space-y-0.5">
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setActiveSubMenu(null)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-lg cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>Back to Filter</span>
                          </Button>
                          <div className="h-px bg-border/60 my-1" />
                          {[
                            { id: "all", label: "All types" },
                            { id: "video", label: "Videos" },
                            { id: "image", label: "Images" },
                            { id: "audio", label: "Audio" },
                          ].map((t) => (
                            <Button
                              variant="ghost"
                              key={t.id}
                              type="button"
                              onClick={() => {
                                onTypeFilterChange(t.id as MediaTypeFilter)
                                setActiveSubMenu(null)
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <span>{t.label}</span>
                              {typeFilter === t.id && <Check className="h-4 w-4 text-foreground" />}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* SUBMENU: MODEL DRILL-DOWN */}
                      {activeSubMenu === "model" && (
                        <div className="animate-fade-in space-y-0.5">
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setActiveSubMenu(null)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-lg cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>Back to Filter</span>
                          </Button>
                          <div className="h-px bg-border/60 my-1" />
                          {[
                            { id: "all", label: "All models" },
                            { id: "kling", label: "Kling v1.5 Pro" },
                            { id: "flux", label: "FLUX.1 Schnell" },
                            { id: "runway", label: "Runway Gen-3" },
                            { id: "gemini", label: "Gemini 2.0 Flash" },
                            { id: "audiocraft", label: "AudioCraft Score" },
                          ].map((m) => (
                            <Button
                              variant="ghost"
                              key={m.id}
                              type="button"
                              onClick={() => {
                                onModelFilterChange?.(m.id)
                                setActiveSubMenu(null)
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <span>{m.label}</span>
                              {modelFilter === m.id && <Check className="h-4 w-4 text-foreground" />}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* SUBMENU: DATE RANGE DRILL-DOWN */}
                      {activeSubMenu === "date" && (
                        <div className="animate-fade-in space-y-0.5">
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setActiveSubMenu(null)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-lg cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>Back to Filter</span>
                          </Button>
                          <div className="h-px bg-border/60 my-1" />
                          {[
                            { id: "all", label: "All time" },
                            { id: "today", label: "Today" },
                            { id: "7days", label: "Past 7 days" },
                            { id: "30days", label: "Past 30 days" },
                          ].map((d) => (
                            <Button
                              variant="ghost"
                              key={d.id}
                              type="button"
                              onClick={() => {
                                onDateRangeFilterChange?.(d.id as DateRangeFilter)
                                setActiveSubMenu(null)
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <span>{d.label}</span>
                              {dateRangeFilter === d.id && <Check className="h-4 w-4 text-foreground" />}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* SUBMENU: STATUS DRILL-DOWN */}
                      {activeSubMenu === "status" && (
                        <div className="animate-fade-in space-y-0.5">
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setActiveSubMenu(null)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-lg cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>Back to Filter</span>
                          </Button>
                          <div className="h-px bg-border/60 my-1" />
                          {[
                            { id: "all", label: "All status" },
                            { id: "completed", label: "Completed" },
                            { id: "generating", label: "Generating" },
                            { id: "failed", label: "Failed" },
                          ].map((s) => (
                            <Button
                              variant="ghost"
                              key={s.id}
                              type="button"
                              onClick={() => {
                                onStatusFilterChange(s.id as MediaStatusFilter)
                                setActiveSubMenu(null)
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <span>{s.label}</span>
                              {statusFilter === s.id && <Check className="h-4 w-4 text-foreground" />}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* ROOT MENU */}
                      {activeSubMenu === null && (
                        <div className="animate-fade-in">
                          {!showMediaTools && (
                          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
                            Type
                          </div>
                          )}

                          <div className="space-y-0.5">
                            {!showMediaTools && (
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => setActiveSubMenu("type")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5">
                                <SquareLayoutIcon className="h-4 w-4 shrink-0 text-foreground" />
                                <span className="truncate">{getTypeLabel()}</span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </Button>
                            )}

                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => setActiveSubMenu("model")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5">
                                <Sparkles className="h-4 w-4 shrink-0 text-foreground" />
                                <span className="truncate">{getModelLabel()}</span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </Button>

                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => setActiveSubMenu("date")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5">
                                <Calendar className="h-4 w-4 shrink-0 text-foreground" />
                                <span className="truncate">{getDateLabel()}</span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </Button>

                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => setActiveSubMenu("status")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5">
                                <CircleDashed className="h-4 w-4 shrink-0 text-foreground" />
                                <span className="truncate">{getStatusLabel()}</span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </Button>

                            {/* Hide failed toggle */}
                            <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground">
                              <span>Hide failed</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                role="switch"
                                aria-checked={hideFailed}
                                onClick={() => onHideFailedChange(!hideFailed)}
                                className={`relative inline-flex h-4 w-7 p-0 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out hover:bg-transparent ${
                                  hideFailed ? "bg-foreground" : "bg-muted"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                                    hideFailed ? "translate-x-3" : "translate-x-0"
                                  }`}
                                />
                              </Button>
                            </div>
                          </div>

                          <>
                          <div className="h-px bg-border/60 my-1" />

                          {/* Activity */}
                          <div className="px-3 pt-1 pb-1 text-xs font-semibold text-muted-foreground">
                            Activity
                          </div>
                          <div className="space-y-0.5">
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => onActivityFilterChange("all")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <span>All activity</span>
                              {activityFilter === "all" && <Check className="h-4 w-4 text-foreground" />}
                            </Button>

                            {!showMediaTools && (
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => onActivityFilterChange("uploaded")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                <Upload className="h-4 w-4 shrink-0 text-foreground" />
                                <span>Uploaded</span>
                              </div>
                              {activityFilter === "uploaded" && <Check className="h-4 w-4 text-foreground" />}
                            </Button>
                            )}

                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => onActivityFilterChange("liked")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                <Heart className="h-4 w-4 shrink-0 text-foreground" />
                                <span>Liked</span>
                              </div>
                              {activityFilter === "liked" && <Check className="h-4 w-4 text-foreground" />}
                            </Button>

                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => onActivityFilterChange("downloaded")}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                <Download className="h-4 w-4 shrink-0 text-foreground" />
                                <span>Downloaded</span>
                              </div>
                              {activityFilter === "downloaded" && <Check className="h-4 w-4 text-foreground" />}
                            </Button>
                          </div>
                          </>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </>
          )}

          {/* 4. LIGHT / DARK THEME TOGGLE */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleTheme}
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary p-0 cursor-pointer"
                aria-label="Toggle Theme"
              >
                {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}</TooltipContent>
          </Tooltip>

          {/* 5. SETTINGS BUTTON */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenSettings?.("general")}
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary p-0 cursor-pointer"
                aria-label="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings & Preferences</TooltipContent>
          </Tooltip>

          {/* HELP: documentation, support and tutorials */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary p-0 cursor-pointer"
                    aria-label="Help"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Help</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-56 p-1">
              {(
                [
                  { id: "docs" as const, label: "Documentation", text: "Guides for every tool", icon: BookOpen },
                  { id: "support" as const, label: "Support", text: "Answers and contact", icon: LifeBuoy },
                  { id: "tutorials" as const, label: "Tutorials", text: "Video courses", icon: PlayCircle },
                ]
              ).map((item) => (
                <PopoverClose key={item.id} asChild>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => onTabChange?.(item.id)}
                  className="flex h-auto w-full items-center justify-start gap-2.5 rounded-lg px-2.5 py-2 text-left font-normal"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.text}</span>
                  </span>
                </Button>
                </PopoverClose>
              ))}
            </PopoverContent>
          </Popover>

          {/* 3. DIRECT ESTIMATED API COST PILL WITH MINIMAL HOVER CARD */}
          <HoverCard openDelay={100} closeDelay={250}>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenUsage}
                className="h-7 px-2.5 rounded-lg border border-border/60 hover:bg-secondary text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer transition-colors"
                aria-label="Estimated Cost"
              >
                <Activity className="h-3 w-3 text-primary" />
                <span className="font-mono font-medium">${hoverOverview.totalCostUsd.toFixed(2)}</span>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent
              align="end"
              sideOffset={8}
              className="w-72 p-3.5 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl space-y-2.5"
            >
              {/* Row 1: Date ------ Select */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Date</span>
                <Select
                  value={hoverDateRange}
                  onValueChange={(val) => setHoverDateRange(val as UsageDateRange)}
                >
                  <SelectTrigger className="h-6 w-28 text-xs bg-secondary/50 border-border/60 rounded-md px-2 font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[70]">
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="weekly">This week</SelectItem>
                    <SelectItem value="monthly">This month</SelectItem>
                    <SelectItem value="3months">Last 3 months</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Row 2: Estimated Cost ------------ $X.XX */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="text-muted-foreground font-medium">Estimated Cost</span>
                <span className="text-sm font-bold font-mono text-foreground">
                  ${hoverOverview.totalCostUsd.toFixed(2)}
                </span>
              </div>

              {/* Multi-segment mini distribution bar */}
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden flex border border-border/40">
                <div
                  style={{ width: `${hoverOverview.modalities.text.percentage}%` }}
                  className="h-full bg-purple-500 first:rounded-l-full last:rounded-r-full transition-all"
                />
                <div
                  style={{ width: `${hoverOverview.modalities.image.percentage}%` }}
                  className="h-full bg-sky-500 first:rounded-l-full last:rounded-r-full transition-all"
                />
                <div
                  style={{ width: `${hoverOverview.modalities.video.percentage}%` }}
                  className="h-full bg-emerald-500 first:rounded-l-full last:rounded-r-full transition-all"
                />
                <div
                  style={{ width: `${hoverOverview.modalities.audio.percentage}%` }}
                  className="h-full bg-pink-500 first:rounded-l-full last:rounded-r-full transition-all"
                />
                <div
                  style={{ width: `${hoverOverview.modalities.embedded.percentage}%` }}
                  className="h-full bg-amber-500 first:rounded-l-full last:rounded-r-full transition-all"
                />
              </div>

              {/* Row 3+: Modality Breakdown */}
              <div className="space-y-1.5 pt-0.5">
                {[
                  { label: "Text", stat: hoverOverview.modalities.text, dotClass: "bg-purple-500" },
                  { label: "Image", stat: hoverOverview.modalities.image, dotClass: "bg-sky-500" },
                  { label: "Video", stat: hoverOverview.modalities.video, dotClass: "bg-emerald-500" },
                  { label: "Audio", stat: hoverOverview.modalities.audio, dotClass: "bg-pink-500" },
                  { label: "Embeded", stat: hoverOverview.modalities.embedded, dotClass: "bg-amber-500" },
                ].map((m) => (
                  <div key={m.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${m.dotClass}`} />
                      <span className="text-foreground font-medium">{m.label}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-foreground font-medium">${m.stat.costUsd.toFixed(2)}</span>
                      <span className="text-muted-foreground w-8 text-right">{m.stat.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Minimal footer action */}
              <div className="pt-2 border-t border-border/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenUsage}
                  className="h-6 w-full text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 justify-center rounded-md font-medium cursor-pointer"
                >
                  View Full Usage History →
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* Windows Frame Controls */}
          <div className="flex items-center ml-1 border-l border-border/60 pl-1.5">
            <Button
              variant="ghost"
              onClick={minimizeWindow}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer p-0"
              title="Minimize"
              aria-label="Minimize"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              onClick={toggleMaximizeWindow}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer p-0"
              title="Maximize"
              aria-label="Maximize"
            >
              <Square className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              onClick={inDesktopApp() ? closeWindow : onLockApp}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer p-0"
              title={inDesktopApp() ? "Close" : "Lock"}
              aria-label={inDesktopApp() ? "Close" : "Lock"}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </header>
    </TooltipProvider>
  )
}

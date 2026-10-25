import {
  FolderKanban,
  MessageSquare,
  Clapperboard,
  Blocks,
  Palette,
  Layers,
  Compass,
  Settings,
  Moon,
  Sun,
  Activity,
} from "lucide-react"
import { MainNavTab } from "@/types"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface FloatingDockProps {
  activeTab: MainNavTab
  onTabChange: (tab: MainNavTab) => void
  onOpenProjects: () => void
  onOpenSettings: () => void
  onOpenUsage?: () => void
  isDark: boolean
  onToggleTheme: () => void
}

export function FloatingDock({
  activeTab,
  onTabChange,
  onOpenProjects,
  onOpenSettings,
  onOpenUsage,
  isDark,
  onToggleTheme,
}: FloatingDockProps) {
  const navItems = [
    {
      id: "projects" as const,
      label: "Projects",
      icon: FolderKanban,
      onClick: onOpenProjects,
      badge: undefined,
    },
    {
      id: "chat" as const,
      label: "Chat Studio",
      icon: MessageSquare,
      onClick: () => onTabChange("chat"),
      badge: undefined,
    },
    {
      id: "story" as const,
      label: "Story Studio",
      icon: Clapperboard,
      onClick: () => onTabChange("story"),
      badge: undefined,
    },
    {
      id: "apps" as const,
      label: "Apps",
      icon: Blocks,
      onClick: () => onTabChange("apps"),
      badge: undefined,
    },
    {
      id: "brand" as const,
      label: "Brand Studio",
      icon: Palette,
      onClick: () => onTabChange("brand"),
      badge: undefined,
    },
    {
      id: "library" as const,
      label: "Library",
      icon: Layers,
      onClick: () => onTabChange("library"),
      badge: undefined,
    },
    {
      id: "inspiration" as const,
      label: "Inspiration",
      icon: Compass,
      onClick: () => onTabChange("inspiration"),
      badge: undefined,
    },
  ]

  return (
    <TooltipProvider delayDuration={150}>
      <aside className="fixed left-5 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1.5 select-none">
        {/* Vertical Floating Pill Dock */}
        <div className="flex flex-col items-center gap-1 rounded-xl bg-card p-1 border border-border shadow-lg">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={item.onClick}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors group p-0 ${
                      isActive
                        ? "bg-primary text-primary-foreground font-medium shadow-xs hover:bg-primary hover:text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                    aria-label={item.label}
                  >
                    <Icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-105" />
                    {item.badge && !isActive && (
                      <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60 ring-2 ring-card" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <span>{item.label}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}

          <div className="my-0.5 h-px w-4 bg-border" />

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleTheme}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors group p-0"
                aria-label="Toggle Theme"
              >
                {isDark ? (
                  <Sun className="h-4 w-4 transition-transform duration-200 group-hover:rotate-45" />
                ) : (
                  <Moon className="h-4 w-4 transition-transform duration-200 group-hover:-rotate-12" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isDark ? "Light Mode" : "Dark Obsidian"}
            </TooltipContent>
          </Tooltip>

          {/* Direct API Telemetry */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenUsage}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-secondary transition-colors group relative p-0"
                aria-label="Direct API Telemetry"
              >
                <Activity className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>Direct API Telemetry · View usage</span>
            </TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors group p-0"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}

import * as React from "react"
import {
  Sliders,
  Cpu,
  Cloud,
  Brain,
  Check,
  BarChart3,
  Settings as SettingsIcon,
} from "lucide-react"
import { sanitizeApiKey } from "@/lib/providers/live-connectors"
import { UsageHistoryView } from "./usage-history-view"
import { SettingsState } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  ProviderLogo,
} from "@/components/chat/brand-logos"
import { ProviderModelList } from "./provider-models"
import { IntegrationsPanel } from "./integrations-panel"
import { UpgradeCard } from "@/components/license/upgrade-card"
import { FEATURE_NAMES, useFeature } from "@/lib/license"
import { useMoney } from "@/lib/currency/currency"
import { usageLedger } from "@/lib/ledger/usage-store"
import { NoKeyBanner, ProviderKeyBar } from "./provider-key-bar"
import { PROVIDERS } from "@/lib/registry/providers"
import { getKeyState, useKeyedProviders } from "@/lib/registry/store"
import { GeneralSettings } from "./general-settings"
import { MemoryPage } from "./memory-list"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: SettingsState
  onSaveSettings: (settings: SettingsState) => void
  initialTab?: TabType
}

type TabType = "general" | "providers" | "usage" | "integrations" | "memory"

export function SettingsModal({
  open,
  onOpenChange,
  settings,
  onSaveSettings,
  initialTab,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>(initialTab || "general")
  const canConnect = useFeature("connectors")
  const money = useMoney()
  const [, tickLedger] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => usageLedger.subscribe(tickLedger), [])
  const monthSpend = usageLedger.getSpendOverview("monthly")
  const [localSettings, setLocalSettings] = React.useState<SettingsState>(settings)

  // Provider Selection (Strictly 5 providers)
  const [selectedProviderId, setSelectedProviderId] = React.useState<(typeof PROVIDERS)[number]["id"]>("fal")
  const keyedProviders = useKeyedProviders()

  React.useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  React.useEffect(() => {
    if (initialTab) {
      if (String(initialTab) === "aiEngine") {
        setActiveTab("providers")
      } else {
        setActiveTab(initialTab)
      }
    }
  }, [initialTab, open])

  const selectedProvider = PROVIDERS.find((p) => p.id === selectedProviderId) ?? PROVIDERS[0]

  const saveSettings = (next: SettingsState) => {
    setLocalSettings(next)
    onSaveSettings(next)
  }

  const [saveFeedback, setSaveFeedback] = React.useState(false)

  const handleSaveAndClose = () => {
    const cleanedSettings: SettingsState = {
      ...localSettings,
      aiEngine: {
        ...localSettings.aiEngine,
        geminiApiKey: sanitizeApiKey(localSettings.aiEngine.geminiApiKey || ""),
        openaiApiKey: sanitizeApiKey(localSettings.aiEngine.openaiApiKey || ""),
        falApiKey: sanitizeApiKey(localSettings.aiEngine.falApiKey || ""),
        replicateApiKey: sanitizeApiKey(localSettings.aiEngine.replicateApiKey || ""),
        openrouterApiKey: sanitizeApiKey(localSettings.aiEngine.openrouterApiKey || ""),
      },
    }
    onSaveSettings(cleanedSettings)
    try {
      localStorage.setItem("gencraft_studio_settings", JSON.stringify(cleanedSettings))
    } catch {}
    setSaveFeedback(true)
    setTimeout(() => {
      setSaveFeedback(false)
      onOpenChange(false)
    }, 450)
  }

  const tabsConfig = [
    { id: "general" as const, label: "General", icon: Sliders },
    { id: "providers" as const, label: "Providers", icon: Cpu },
    { id: "usage" as const, label: "Usage", icon: BarChart3 },
    { id: "integrations" as const, label: "Connectors", icon: Cloud },
    { id: "memory" as const, label: "Memory", icon: Brain },
  ]

  const handleModalClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      const cleanedSettings: SettingsState = {
        ...localSettings,
        aiEngine: {
          ...localSettings.aiEngine,
          geminiApiKey: sanitizeApiKey(localSettings.aiEngine.geminiApiKey || ""),
          openaiApiKey: sanitizeApiKey(localSettings.aiEngine.openaiApiKey || ""),
          falApiKey: sanitizeApiKey(localSettings.aiEngine.falApiKey || ""),
          replicateApiKey: sanitizeApiKey(localSettings.aiEngine.replicateApiKey || ""),
          openrouterApiKey: sanitizeApiKey(localSettings.aiEngine.openrouterApiKey || ""),
        },
      }
      onSaveSettings(cleanedSettings)
      try {
        localStorage.setItem("gencraft_studio_settings", JSON.stringify(cleanedSettings))
      } catch {}
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-5xl h-[85vh] max-h-[85vh] p-0 overflow-hidden flex flex-col gap-0 rounded-2xl bg-background text-foreground border border-border shadow-2xl">
        <TooltipProvider delayDuration={150}>
          {/* TOP BAR: Clean, token-consistent header */}
          <DialogHeader className="px-5 py-2.5 border-b border-border/70 flex-row items-center justify-between space-y-0 bg-background flex-shrink-0">
            <div className="flex items-center gap-4">
              <DialogTitle className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                <SettingsIcon className="h-4 w-4 text-primary" />
                <span>Settings</span>
              </DialogTitle>

              {/* Navigation Tabs: Icon with Name */}
              <div className="flex items-center bg-secondary/80 p-0.5 rounded-lg gap-1 border border-border/50">
                {tabsConfig.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id

                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab(tab.id)}
                      className={`h-7 rounded-md flex items-center gap-1.5 px-2.5 text-xs transition-all ${
                        isActive
                          ? "bg-card text-foreground font-semibold border border-border/70 shadow-xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                      aria-label={tab.label}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{tab.label}</span>
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Header Right: Clean area with spacing for modal close button (Done button removed) */}
            <div className="flex items-center pr-6" />
          </DialogHeader>

          {/* MAIN SETTINGS BODY */}
          <main className={`flex-1 overflow-hidden bg-background text-foreground ${activeTab === "providers" ? "" : "p-5"}`}>
            {/* Providers fills the whole body, so its divider runs from the header line to the footer line */}
            {activeTab === "providers" && (
          <div className="flex h-full animate-in fade-in duration-150">
            <div className="flex w-52 flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/70 p-4">
              {PROVIDERS.map((prov) => {
                const isSelected = selectedProviderId === prov.id
                const keyed = keyedProviders.includes(prov.id)
                const spent = monthSpend.providers.find((p) => p.provider === prov.id)
                return (
                  <Button
                    key={prov.id}
                    type="button"
                    variant="ghost"
                    onClick={() => setSelectedProviderId(prov.id)}
                    className={`h-11 w-full justify-between rounded-xl px-2.5 ${isSelected ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ProviderLogo provider={prov.id} size={14} />
                      <span className="flex min-w-0 flex-col items-start leading-tight">
                        <span className="truncate text-xs font-medium">{prov.label}</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">{spent ? `${money.format(spent.costUsd)} this month` : "No usage this month"}</span>
                      </span>
                    </span>
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${keyed ? "bg-emerald-500" : "bg-muted-foreground/30"}`} title={keyed ? "Connected" : "No key"} />
                  </Button>
                )
              })}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5 no-scrollbar">
              <ProviderKeyBar provider={selectedProvider} settings={localSettings} onSave={saveSettings} />
              {keyedProviders.includes(selectedProvider.id) ? (
                <ProviderModelList
                  providerId={selectedProvider.id}
                  settings={localSettings}
                  onPrices={(priceOverrides) => saveSettings({ ...localSettings, aiEngine: { ...localSettings.aiEngine, priceOverrides } })}
                />
              ) : (
                <NoKeyBanner provider={selectedProvider} rejected={getKeyState(selectedProvider.id)?.status === "rejected"} />
              )}
            </div>
          </div>
            )}
            <ScrollArea className={`h-full pr-2 ${activeTab === "providers" ? "hidden" : ""}`}>
              {/* TAB 1: GENERAL */}
              {activeTab === "general" && (
                <div className="mx-auto max-w-3xl pb-8 animate-in fade-in duration-150">
                  <GeneralSettings settings={localSettings} onChange={setLocalSettings} />
                </div>
              )}

              {/* TAB 3: INTEGRATIONS */}
              {activeTab === "integrations" && (canConnect ? <IntegrationsPanel settings={localSettings} onSave={saveSettings} /> : <UpgradeCard feature={FEATURE_NAMES.connectors} />)}

              {/* TAB 5: MEMORY */}
              {activeTab === "memory" && (
                <div className="mx-auto max-w-3xl pb-8 animate-in fade-in duration-150">
                  <MemoryPage settings={localSettings} onChange={setLocalSettings} />
                </div>
              )}

              {/* TAB: USAGE HISTORY (FULL SCROLL, SPACIOUS & AIRY) */}
              {activeTab === "usage" && (
                <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-150 pb-8">
                  <UsageHistoryView settings={settings} />
                </div>
              )}

            </ScrollArea>
          </main>

          {/* BOTTOM FOOTER: Save Changes at last */}
          <div className="px-5 py-3 border-t border-border/70 bg-background flex items-center justify-between flex-shrink-0">
            <div className="text-xs text-muted-foreground">
              {saveFeedback ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Preferences saved successfully
                </span>
              ) : (
                <span>Preferences apply automatically across your workspace</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs h-7 px-3 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveAndClose}
                className="text-xs font-medium h-7 px-4 rounded-lg shadow-xs"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}

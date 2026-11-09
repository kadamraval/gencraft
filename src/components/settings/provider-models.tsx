import * as React from "react"
import { KeyRound, Loader2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/ui/empty-state"
import { ModelPicker } from "@/components/models/model-picker"
import { RemovedModelsNotice } from "./removed-models-notice"
import { AddModelDialog } from "./model-dialogs"
import { ModelDetailsDialog } from "./model-details-dialog"
import { addBookmark } from "@/lib/registry/bookmarks"
import { getToolRecords, providerCounts, unlockProvider, useKeyedProviders, useListedModels, useRegistry, useUnlockStatus } from "@/lib/registry/store"
import { topMakersOnly } from "@/lib/registry/top-makers"
import { PROVIDERS } from "@/lib/registry/providers"
import type { ModelRecord } from "@/lib/registry/types"
import type { PriceOverride } from "@/lib/registry/types"
import type { SettingsState } from "@/types"

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

/** How trustworthy a price is, as a dot: green is the provider's own list or your edit, grey was read from a page, amber is missing. */
function PriceTrust({ m }: { m: ModelRecord }) {
  const missing = m.price.amount === null
  const tone = missing ? "bg-amber-500" : m.price.source === "api" || m.price.source === "edited" || m.price.source === "curated" ? "bg-emerald-500" : "bg-muted-foreground/50"
  const text = missing
    ? "No price found. Open the model to enter it."
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

/** Every current model of one provider, in the app's one model selector: makers on the left, models on the right; a click opens a model. */
export function ProviderModelList({ providerId, settings, onPrices }: ProviderModelListProps) {
  const listed = useListedModels()
  const keyed = useKeyedProviders()
  useRegistry()
  // Every model the app can use here, the ones that change a file (upscalers, removers) too, so this list matches what Edit offers
  const all = React.useMemo(() => {
    const edits = keyed.includes(providerId) ? getToolRecords().filter((r) => r.utility && r.provider === providerId && r.status !== "deprecated") : []
    const have = new Set(listed.map((r) => r.id))
    return [...listed, ...topMakersOnly(edits.filter((r) => !have.has(r.id)))]
  }, [listed, keyed, providerId])
  const [adding, setAdding] = React.useState(false)
  const [viewing, setViewing] = React.useState<ModelRecord | null>(null)

  const setPrice = (id: string, next: PriceOverride | null) => {
    const all = { ...(settings.aiEngine.priceOverrides ?? {}) }
    if (next) all[id] = next
    else delete all[id]
    onPrices(all)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RemovedModelsNotice />
      <ModelPicker
        mode="manage"
        provider={providerId}
        records={all}
        onOpen={setViewing}
        rowExtra={(m) => <PriceTrust m={m} />}
        empty={<EmptyProvider providerId={providerId} settings={settings} />}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Add a model" onClick={() => setAdding(true)} className="h-8 w-8 text-muted-foreground">
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a model</TooltipContent>
          </Tooltip>
        }
        className="min-h-0 flex-1"
      />
      <AddModelDialog open={adding} onClose={() => setAdding(false)} settings={settings} onAdded={(record) => addBookmark(record.id)} />
      <ModelDetailsDialog model={viewing ? (all.find((r) => r.id === viewing.id) ?? viewing) : null} settings={settings} onClose={() => setViewing(null)} onPrice={setPrice} />
    </div>
  )
}

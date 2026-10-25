export type ModalityCategory = "text" | "image" | "video" | "audio" | "embedded"
export type ProviderId = "fal" | "openai" | "gemini" | "replicate" | "openrouter"

/** How sure the cost is: reported by the provider, computed from what it says was used, estimated from a price list or a guess at the tokens, or the model has no price */
export type CostBasis = "exact" | "computed" | "estimated" | "unpriced"

export const USAGE_LEDGER_EVENT = "usage-ledger-changed"

export interface UsageLedgerItem {
  id: string
  modelName: string
  category: ModalityCategory
  provider: ProviderId
  action: "Deducted" | "Refunded"
  costUsd: number
  date: string
  timestamp: number
  specs?: string
  feature: string
  color?: string
  credits: number
  basis?: CostBasis
  /** The model's address at its provider (for example a fal endpoint), so its own billing data can be matched to this run */
  endpoint?: string
  modelId?: string
  /** What the run was estimated at before the provider's own figure replaced it */
  estimateUsd?: number
  /** The learned correction that was in that estimate, so the price list's own figure can be told apart */
  factor?: number
}

export type UsageDateRange = "today" | "weekly" | "monthly" | "3months" | "all"

export interface ModalityStat {
  category: ModalityCategory
  label: string
  costUsd: number
  percentage: number
  runs: number
  color: string
}

export interface ProviderStat {
  provider: ProviderId
  label: string
  runs: number
  costUsd: number
  percentage: number
}

export interface SpendSegment {
  name: string
  percentage: number
  costUsd: number
  color: string
}

export interface SpendOverviewData {
  totalCostUsd: number
  totalGenerations: number
  avgCostPerRun: number
  modalities: {
    text: ModalityStat
    image: ModalityStat
    video: ModalityStat
    audio: ModalityStat
    embedded: ModalityStat
  }
  providers: ProviderStat[]
  topProvider: {
    provider: ProviderId
    label: string
    runs: number
    costUsd: number
    percentage: number
  }
  topModel: {
    modelName: string
    provider: ProviderId
    category: ModalityCategory
    runs: number
    costUsd: number
  }
  segments: SpendSegment[]
  featuresUsedCount: number
  creditsSpent: number
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  fal: "fal.ai",
  openai: "OpenAI",
  gemini: "Google Gemini",
  replicate: "Replicate",
  openrouter: "OpenRouter",
}

// Seed baseline of realistic BYOK generation records across all 5 modalities
const LEDGER_KEY = "gencraft_usage_ledger_v1"

/** The ledger holds only what really ran on this machine. It is stored locally and starts empty. */
function loadHistory(): UsageLedgerItem[] {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    return raw ? (JSON.parse(raw) as UsageLedgerItem[]) : []
  } catch {
    return []
  }
}

class UsageLedgerStore {
  private items: UsageLedgerItem[] = []
  private listeners: Set<() => void> = new Set()

  constructor() {
    this.items = loadHistory()
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  public getAllItems(): UsageLedgerItem[] {
    return [...this.items]
  }

  public addRecord(record: {
    modelName?: string
    modelId?: string
    category: ModalityCategory
    provider?: ProviderId
    action?: "Deducted" | "Refunded"
    costUsd: number
    specs?: string
    feature?: string
    color?: string
    credits?: number
    basis?: CostBasis
    endpoint?: string
    factor?: number
  }) {
    const now = new Date()
    const dateStr =
      now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " +
      now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

    const modelName = record.modelName || record.modelId || "Custom Model"
    const provider = record.provider || (record.category === "text" ? "gemini" : "fal")
    const action = record.action || "Deducted"
    const feature = record.feature || `${modelName} (${record.specs || record.category})`

    const newItem: UsageLedgerItem = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      modelName,
      category: record.category,
      provider,
      action,
      costUsd: record.costUsd,
      date: dateStr,
      timestamp: now.getTime(),
      specs: record.specs,
      feature,
      color: record.color,
      credits: record.credits ?? Math.round(record.costUsd * 25 * 100) / 100,
      basis: record.basis,
      endpoint: record.endpoint,
      modelId: record.modelId,
      factor: record.factor,
    }

    this.items.unshift(newItem)
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(this.items.slice(0, 2000)))
    } catch {
      // storage unavailable: the ledger lasts for this session
    }
    this.notify()
    return newItem
  }

  /** Replaces estimated costs with the provider's own figures (fal's billing). The estimate is kept on the entry. */
  public applyCorrections(fixes: Array<{ id: string; costUsd: number; basis: CostBasis }>) {
    if (fixes.length === 0) return
    const by = new Map(fixes.map((f) => [f.id, f]))
    this.items = this.items.map((it) => {
      const fix = by.get(it.id)
      if (!fix) return it
      return { ...it, estimateUsd: it.estimateUsd ?? it.costUsd, costUsd: fix.costUsd, credits: Math.round(fix.costUsd * 25 * 100) / 100, basis: fix.basis }
    })
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(this.items.slice(0, 2000)))
    } catch {
      // storage unavailable: the ledger lasts for this session
    }
    this.notify()
  }

  public getAvailableCredits(): number {
    return 0
  }

  public getFilteredItems(
    dateRange: UsageDateRange = "3months",
    categoryFilter: string = "all",
    actionFilter: string = "all",
    providerFilter: string = "all"
  ): UsageLedgerItem[] {
    const now = Date.now()
    const msInDay = 86400000

    let cutoff = 0
    if (dateRange === "today") cutoff = now - msInDay
    else if (dateRange === "weekly") cutoff = now - msInDay * 7
    else if (dateRange === "monthly") cutoff = now - msInDay * 30
    else if (dateRange === "3months") cutoff = now - msInDay * 90
    else if (dateRange === "all") cutoff = 0

    return this.items.filter((item) => {
      if (cutoff > 0 && item.timestamp < cutoff) return false
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false
      if (providerFilter !== "all" && item.provider !== providerFilter) return false
      if (actionFilter !== "all" && item.action.toLowerCase() !== actionFilter.toLowerCase()) return false
      return true
    })
  }

  public getSpendOverview(dateRange: UsageDateRange = "3months"): SpendOverviewData {
    const filtered = this.getFilteredItems(dateRange, "all", "all", "all")
    const billedRuns = filtered.filter((i) => i.action === "Deducted")
    const totalCostUsd = Math.round(billedRuns.reduce((acc, curr) => acc + curr.costUsd, 0) * 1000) / 1000
    const totalGenerations = billedRuns.length
    const avgCostPerRun = totalGenerations > 0 ? Math.round((totalCostUsd / totalGenerations) * 1000) / 1000 : 0

    // Modality-wise statistics
    const buildModalityStat = (cat: ModalityCategory, label: string, color: string): ModalityStat => {
      const catRuns = billedRuns.filter((i) => i.category === cat)
      const cost = Math.round(catRuns.reduce((acc, curr) => acc + curr.costUsd, 0) * 1000) / 1000
      const percentage = totalCostUsd > 0 ? Math.round((cost / totalCostUsd) * 100) : 0
      return {
        category: cat,
        label,
        costUsd: cost,
        percentage,
        runs: catRuns.length,
        color,
      }
    }

    const modalities = {
      text: buildModalityStat("text", "Text", "#a855f7"),
      image: buildModalityStat("image", "Image", "#06b6d4"),
      video: buildModalityStat("video", "Video", "#22c55e"),
      audio: buildModalityStat("audio", "Audio", "#ec4899"),
      embedded: buildModalityStat("embedded", "Embeded", "#eab308"),
    }

    // Provider usage breakdown
    const providerIds: ProviderId[] = ["fal", "openai", "gemini", "replicate", "openrouter"]
    const providers: ProviderStat[] = providerIds.map((prov) => {
      const pRuns = billedRuns.filter((i) => i.provider === prov)
      const cost = Math.round(pRuns.reduce((acc, curr) => acc + curr.costUsd, 0) * 1000) / 1000
      const percentage = totalCostUsd > 0 ? Math.round((cost / totalCostUsd) * 100) : 0
      return {
        provider: prov,
        label: PROVIDER_LABELS[prov],
        runs: pRuns.length,
        costUsd: cost,
        percentage,
      }
    }).sort((a, b) => b.runs - a.runs)

    const topProvider = providers[0] || {
      provider: "fal" as ProviderId,
      label: "fal.ai",
      runs: 0,
      costUsd: 0,
      percentage: 0,
    }

    // Model usage ranking
    const modelMap = new Map<string, { runs: number; costUsd: number; prov: ProviderId; cat: ModalityCategory }>()
    billedRuns.forEach((r) => {
      const existing = modelMap.get(r.modelName) || { runs: 0, costUsd: 0, prov: r.provider, cat: r.category }
      existing.runs += 1
      existing.costUsd += r.costUsd
      modelMap.set(r.modelName, existing)
    })

    let topModelName = "Kling 1.5 Pro"
    let topModelData = { runs: 0, costUsd: 0, prov: "fal" as ProviderId, cat: "video" as ModalityCategory }
    modelMap.forEach((data, name) => {
      if (data.runs > topModelData.runs) {
        topModelName = name
        topModelData = data
      }
    })

    const topModel = {
      modelName: topModelName,
      provider: topModelData.prov,
      category: topModelData.cat,
      runs: topModelData.runs,
      costUsd: Math.round(topModelData.costUsd * 1000) / 1000,
    }

    // Segments array for progress visualization
    const segments: SpendSegment[] = [
      { name: "Video", percentage: modalities.video.percentage, costUsd: modalities.video.costUsd, color: "#22c55e" },
      { name: "Image", percentage: modalities.image.percentage, costUsd: modalities.image.costUsd, color: "#06b6d4" },
      { name: "Audio", percentage: modalities.audio.percentage, costUsd: modalities.audio.costUsd, color: "#ec4899" },
      { name: "Text", percentage: modalities.text.percentage, costUsd: modalities.text.costUsd, color: "#a855f7" },
      { name: "Embeded", percentage: modalities.embedded.percentage, costUsd: modalities.embedded.costUsd, color: "#eab308" },
    ].filter((s) => s.percentage > 0 || s.costUsd > 0)

    return {
      totalCostUsd,
      totalGenerations,
      avgCostPerRun,
      modalities,
      providers,
      topProvider,
      topModel,
      segments,
      featuresUsedCount: 5,
      creditsSpent: Math.round(totalCostUsd * 25 * 100) / 100,
    }
  }
}

export const usageLedger = new UsageLedgerStore()

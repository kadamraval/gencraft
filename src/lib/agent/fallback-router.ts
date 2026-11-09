import { capabilityOfExact } from "@/lib/capability"
import { SettingsState } from "@/types"
import { usageLedger, Category, ProviderId } from "@/lib/ledger/usage-store"
import type { ActualCost } from "@/lib/ledger/actual-cost"
import { getListedModels, getRecord } from "@/lib/registry/store"
import { readCustomModels } from "@/lib/registry/custom-models"
import { computeDefaultEnabled, defaultModelFor } from "@/lib/registry/enabled"
import { sameModelElsewhere, pickCheapestHostForModel } from "@/lib/registry/cross-host"
import { estimateRun } from "@/lib/registry/price"
import type { PriceContext } from "@/lib/registry/price"
import type { ModelRecord } from "@/lib/registry/types"

export interface ResolvedModelInfo {
  id: string
  name: string
  provider: ProviderId
  category: Category
  costNumeric: number
  costDisplay: string
  specs: string
  latency: string
  badge?: string
  description?: string
  isCustom?: boolean
}

export interface FallbackExecutionOptions<T> {
  category: Category
  settings: SettingsState
  actionName: string
  /**
   * The actual generation / API worker function.
   * Receives the candidate model info and the attempt index (0 = primary, 1 = fallback 1, etc.).
   */
  /** `report` is for a provider that says what the run really cost; the ledger then records that, not an estimate */
  execute: (model: ResolvedModelInfo, attemptIndex: number, report: (cost: ActualCost) => void) => Promise<T>
  /**
   * Optional callback for streaming diagnostic logs to chat or UI drawers.
   */
  onDiagnosticLog?: (log: string) => void
  /**
   * Multiplier for cost calculation (e.g. number of 10s chunks, image batch count, etc.). Defaults to 1.
   */
  costMultiplier?: number
  /**
   * The settings of this run. With them the ledger records what the run costs for the model that really ran (the
   * composer's pick or a fallback), at the chosen resolution, length and sound; without them it records the model's
   * default price.
   */
  cost?: { values: Record<string, unknown>; context?: PriceContext }
  /**
   * Optional model IDs to deliberately fail for testing / verifying failover behavior.
   */
  simulateFailuresOn?: string[]
  /**
   * The model the user picked in the composer. Overrides the settings default for this call.
   */
  primaryModelId?: string
}

export interface FallbackExecutionResult<T> {
  result: T
  executedModel: ResolvedModelInfo
  chain: ResolvedModelInfo[]
  attemptIndex: number
  failoverOccurred: boolean
  logs: string[]
  costUsd: number
  credits: number
}

const PROVIDERS: ProviderId[] = ["fal", "openai", "gemini", "replicate", "openrouter"]

function infoOf(rec: ModelRecord, isCustom?: boolean): ResolvedModelInfo {
  const est = estimateRun(rec, {})
  return {
    id: rec.id,
    name: rec.name,
    provider: PROVIDERS.includes(rec.provider as ProviderId) ? (rec.provider as ProviderId) : "fal",
    category: rec.category,
    // No price known means none is made up: the ledger records the run's own estimate or what the provider reports
    costNumeric: est.usd ?? 0,
    costDisplay: est.usd === null && est.display === "—" ? "price unknown" : est.display,
    specs: rec.endpoint,
    latency: "—",
    description: rec.description,
    isCustom,
  }
}

/**
 * The model behind an id, as the registry knows it: the standard database, the providers' live lists, and the models the person added.
 * An id none of them knows keeps its name and provider and carries no price.
 */
export function resolveModelInfo(
  modelId: string,
  targetCategory: Category = "video"
): ResolvedModelInfo {
  const record = getRecord(modelId)
  const custom = readCustomModels().find((m) => m.id === modelId)
  if (record) return infoOf(record, Boolean(custom))
  if (custom) return infoOf(custom, true)

  const parts = (modelId || "").trim().split("/")
  const provider = parts[0] as ProviderId
  return {
    id: modelId,
    name: parts[parts.length - 1] || modelId,
    provider: PROVIDERS.includes(provider) ? provider : "fal",
    category: targetCategory,
    costNumeric: 0,
    costDisplay: "price unknown",
    specs: modelId,
    latency: "—",
    description: "Not in the model database or any provider's list.",
  }
}

/**
 * LiteLLM-Style Multi-Provider & Single-Provider Router Chain Builder:
 * - Single Key Mode (1 provider connected): builds intra-provider fallback chain across same-category models.
 * - Multi-Key Mode (2–5 providers connected):
 *   1. If `strategy === "cost-based-routing"`, promotes the cheapest cross-host equivalent of the same model to primary.
 *   2. Places same-model cross-provider equivalents (`sameModelElsewhere`) sorted by lowest `estimateRun` cost first.
 *   3. Appends best cross-provider category fallbacks, then intra-provider fallbacks.
 */
export function buildLiteLLMRouterChain(
  primaryRecord: ModelRecord,
  pool: ModelRecord[],
  connectedProviders?: ReadonlySet<string>,
  params: Record<string, unknown> = {},
  strategy: "cost-based-routing" | "primary-first" = "primary-first"
): ModelRecord[] {
  const usablePool = connectedProviders
    ? pool.filter((r) => connectedProviders.has(r.provider))
    : pool

  const effectivePrimary =
    strategy === "cost-based-routing"
      ? pickCheapestHostForModel(primaryRecord, usablePool, params, connectedProviders)
      : primaryRecord

  // 1. Same model hosted on other connected providers, sorted by lowest estimated cost
  const crossHostEquivalents = sameModelElsewhere(effectivePrimary, usablePool)
    .slice()
    .sort((a, b) => (estimateRun(a, params).usd ?? 1e9) - (estimateRun(b, params).usd ?? 1e9))

  // 2. Best default-enabled models on other connected providers for the same category
  const byId = new Map(usablePool.map((r) => [r.id, r]))
  const seenProviders = new Set<string>([
    effectivePrimary.provider,
    ...crossHostEquivalents.map((r) => r.provider),
  ])
  const crossProviderCategory: ModelRecord[] = []
  for (const id of computeDefaultEnabled(usablePool)) {
    const rec = byId.get(id)
    if (!rec || rec.category !== effectivePrimary.category || seenProviders.has(rec.provider)) continue
    seenProviders.add(rec.provider)
    crossProviderCategory.push(rec)
  }

  // 3. Intra-provider fallbacks (essential when user only connects 1 provider key)
  const intraProviderFallbacks = computeDefaultEnabled(usablePool)
    .map((id) => byId.get(id))
    .filter(
      (rec): rec is ModelRecord =>
        Boolean(rec) &&
        rec!.category === effectivePrimary.category &&
        rec!.provider === effectivePrimary.provider &&
        rec!.id !== effectivePrimary.id
    )
    .slice(0, 2)

  const seenIds = new Set<string>()
  const result: ModelRecord[] = []
  for (const candidate of [
    effectivePrimary,
    ...crossHostEquivalents,
    ...crossProviderCategory,
    ...intraProviderFallbacks,
  ]) {
    if (seenIds.has(candidate.id)) continue
    seenIds.add(candidate.id)
    result.push(candidate)
  }
  return result
}

/**
 * Resolves the ordered fallback chain for a given category using user studio settings.
 * Returns { primary, chain, autoLock }
 */
export function resolveCategoryChain(
  category: Category,
  settings: SettingsState,
  primaryOverride?: string
): {
  primary: ResolvedModelInfo
  chain: ResolvedModelInfo[]
  autoLock: boolean
} {

  // Retrieve primary ID from settings
  let configuredPrimaryId: string | undefined
  switch (category) {
    case "video":
      configuredPrimaryId = settings.aiEngine.activeVideoModelId
      break
    case "image":
      configuredPrimaryId = settings.aiEngine.activeImageModelId
      break
    case "text":
      configuredPrimaryId = settings.aiEngine.activeTextModelId
      break
    case "audio":
      configuredPrimaryId = settings.aiEngine.activeAudioModelId
      break
    case "embedding":
      configuredPrimaryId = settings.aiEngine.activeEmbeddingModelId
      break
  }

  // Only models the registry still offers are used. Settings saved by an older version may name retired
  // models; those are skipped, and a current default fills in when nothing usable is left.
  // Only models a provider key can run: a fallback on a provider without a key could never succeed
  const listedNow = getListedModels()
  const usable = (id: string | undefined): id is string => Boolean(id) && listedNow.some((r) => r.id === id)
  const registryCategory = category === "embedding" ? undefined : category
  // No fixed model ids: the default is the best model the person has whose capability fits (an embedding model for embeddings)
  const registryDefault = registryCategory ? defaultModelFor(registryCategory, listedNow)?.id : listedNow.find((r) => capabilityOfExact(r).does.includes("embed"))?.id
  // No usable model at all: say so plainly instead of trying a stand-in that has no key
  if (registryCategory && !usable(primaryOverride) && !usable(configuredPrimaryId) && !registryDefault) {
    const what = registryCategory === "text" ? "chat" : registryCategory
    throw new Error(`No ${what} model is available. Add a provider key and switch on a ${what} model in Settings.`)
  }
  const primaryModelId = (usable(primaryOverride) && primaryOverride) || (usable(configuredPrimaryId) && configuredPrimaryId) || registryDefault || primaryOverride || configuredPrimaryId || ""
  if (!primaryModelId) throw new Error(`No ${category} model is available. Add a provider key in Settings.`)
  const primary = resolveModelInfo(primaryModelId, category)

  // Retrieve configured fallbacks for this category
  const configuredFallbacks = settings.aiEngine.fallbackModels?.[category] || []
  const usableFallbacks = configuredFallbacks.filter(usable)
  // Nothing set by the person: use LiteLLM router chain (same-model cross-host equivalents sorted by lowest price first,
  // then cross-provider category fallbacks, then intra-provider fallbacks when only 1 key is connected)
  const primaryRecord = getRecord(primaryModelId)
  const autoFallbacks = registryCategory
    ? (() => {
        if (primaryRecord) {
          return buildLiteLLMRouterChain(primaryRecord, listedNow)
            .slice(1, 5)
            .map((r) => r.id)
        }
        const byId = new Map(listedNow.map((r) => [r.id, r]))
        const seen = new Set<string>()
        return computeDefaultEnabled(listedNow)
          .map((id) => byId.get(id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.category === registryCategory)
          .filter((r) => (seen.has(r.provider) ? false : (seen.add(r.provider), true)))
          .slice(0, 3)
          .map((r) => r.id)
      })()
    : []
  const fallbackList = usableFallbacks.length > 0 ? usableFallbacks : configuredFallbacks.length > 0 ? [] : autoFallbacks

  // De-duplicate: Ensure primary model does not duplicate in the fallback sequence
  const uniqueFallbackIds = fallbackList.filter(
    (fid) =>
      fid.toLowerCase() !== primary.id.toLowerCase() &&
      !primary.id.toLowerCase().endsWith("/" + fid.toLowerCase()) &&
      !fid.toLowerCase().endsWith("/" + primary.id.toLowerCase())
  )

  const chain: ResolvedModelInfo[] = [
    primary,
    ...uniqueFallbackIds.map((fid) => resolveModelInfo(fid, category)),
  ]

  const autoLock = settings.aiEngine.autoLockModels ?? true

  return { primary, chain, autoLock }
}

/**
 * The core Runtime Fallback Router.
 * Autonomously executes through Primary -> Fallback #1 -> Fallback #2 ...
 * Handles transient errors, emits real-time step logs, performs wholesale ledger deduction,
 * and respects the auto-lock state.
 */
export async function executeWithFallback<T>(
  options: FallbackExecutionOptions<T>
): Promise<FallbackExecutionResult<T>> {
  const {
    category,
    settings,
    actionName,
    execute,
    onDiagnosticLog,
    costMultiplier = 1,
    cost,
    simulateFailuresOn = [],
    primaryModelId,
  } = options

  const logs: string[] = []
  const pushLog = (msg: string) => {
    logs.push(msg)
    onDiagnosticLog?.(msg)
  }

  const { primary, chain, autoLock } = resolveCategoryChain(category, settings, primaryModelId)

  const fallbackSummary =
    chain.length > 1
      ? chain
          .slice(1)
          .map((m, idx) => `#${idx + 1} ${m.name}`)
          .join(" → ")
      : "None configured"

  pushLog(
    `[Router] Category: ${category.toUpperCase()} | Primary: ${primary.name} (${primary.provider})`
  )
  pushLog(`[Router] Failover Sequence: Primary (${primary.name}) → ${fallbackSummary}`)

  let lastError: Error | null = null

  for (let attemptIndex = 0; attemptIndex < chain.length; attemptIndex++) {
    const currentModel = chain[attemptIndex]!
    const isPrimary = attemptIndex === 0
    const attemptLabel = isPrimary ? "Primary" : `Fallback #${attemptIndex}`

    pushLog(
      `[Router] Attempting execution on ${attemptLabel}: ${currentModel.name} (${currentModel.provider}) · Rate: ${currentModel.costDisplay}`
    )

    try {
      // Check if simulated chaos test is requested for this model
      const shouldSimulateFailure = simulateFailuresOn.some(
        (simId) =>
          currentModel.id.toLowerCase().includes(simId.toLowerCase()) ||
          currentModel.name.toLowerCase().includes(simId.toLowerCase())
      )

      if (shouldSimulateFailure) {
        throw new Error(
          `Simulated Provider Rate Limit (429 Too Many Requests / Quota Threshold Exceeded)`
        )
      }

      // Execute worker
      let actual: ActualCost | undefined
      const result = await execute(currentModel, attemptIndex, (c) => {
        actual = c
      })

      // On Success:
      const failoverOccurred = attemptIndex > 0
      pushLog(
        `✓ [Router Success] Completed via ${attemptLabel} [${currentModel.name}] (${currentModel.provider})`
      )

      // Deduct from Wholesale Usage Ledger
      // The price of this run with its own settings, for the model that actually ran; the default price only when they are unknown
      const ran = cost ? getRecord(currentModel.id) : undefined
      const estimate = ran ? estimateRun(ran, cost!.values, cost!.context ?? {}) : undefined
      const priced = estimate ? estimate.usd : null
      const guessed = priced !== null ? Math.round(priced * 10000) / 10000 : Math.round(currentModel.costNumeric * Math.max(0.001, costMultiplier) * 10000) / 10000
      // What the provider reported, when it does, is the cost; otherwise the estimate
      const reported = actual as ActualCost | undefined
      const costUsd = reported ? Math.round(reported.usd * 1_000_000) / 1_000_000 : guessed
      const credits = Math.round(costUsd * 25 * 100) / 100

      // Text is counted where its tokens are known (lib/ledger/text-usage.ts), never here, so it is not counted twice or at a flat price
      if (category !== "text") usageLedger.addRecord({
        modelName: currentModel.name,
        modelId: currentModel.id,
        category: category,
        provider: currentModel.provider,
        action: "Deducted",
        costUsd,
        credits,
        specs: currentModel.specs,
        feature: `${currentModel.name} (${actionName})`,
        basis: reported ? reported.basis : "estimated",
        endpoint: ran?.endpoint,
        factor: estimate?.calibration,
      })

      pushLog(
        `📊 Wholesale Ledger: Deducted $${costUsd.toFixed(4)} (${credits} credits) for ${currentModel.name}`
      )

      if (failoverOccurred) {
        if (autoLock) {
          pushLog(
            `🔒 Auto-Lock Active: Retaining Primary as '${primary.name}' for subsequent studio sessions.`
          )
        } else {
          pushLog(
            `ℹ Auto-Lock Disabled: Studio executed via fallback #${attemptIndex} (${currentModel.name}).`
          )
        }
      }

      return {
        result,
        executedModel: currentModel,
        chain,
        attemptIndex,
        failoverOccurred,
        logs,
        costUsd,
        credits,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      lastError = err instanceof Error ? err : new Error(errorMsg)

      pushLog(`⚠ ${attemptLabel} [${currentModel.name}] failed: ${errorMsg}`)

      // If next model exists in chain, inform of failover
      if (attemptIndex < chain.length - 1) {
        const nextModel = chain[attemptIndex + 1]!
        pushLog(
          `⚡ [Failover Triggered] Seamlessly failing over to Fallback #${attemptIndex + 1}: ${nextModel.name} (${nextModel.provider}) · Rate: ${nextModel.costDisplay}...`
        )
      }
    }
  }

  // All models in chain failed
  pushLog(
    `❌ [Router Exhaustion] All ${chain.length} models in the fallback chain for ${category} failed.`
  )

  throw new Error(
    `Fallback sequence exhausted for ${category}. Attempted ${chain.length} models (${chain
      .map((m) => m.name)
      .join(", ")}): ${lastError?.message || "Execution failed"}`
  )
}

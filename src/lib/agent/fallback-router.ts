import { SettingsState } from "@/types"
import { usageLedger, ModalityCategory, ProviderId } from "@/lib/ledger/usage-store"
import type { ActualCost } from "@/lib/ledger/actual-cost"
import catalogData from "@/lib/providers/model-pricing-catalog.json"
import { MODEL_CATALOG } from "@/lib/providers/catalog"
import { getListedModels, getRecord } from "@/lib/registry/store"
import { computeDefaultEnabled, defaultModelFor } from "@/lib/registry/enabled"
import { sameModelElsewhere, pickCheapestHostForModel } from "@/lib/registry/cross-host"
import { estimateRun } from "@/lib/registry/price"
import type { PriceContext } from "@/lib/registry/price"
import type { ModelRecord } from "@/lib/registry/types"

export interface ResolvedModelInfo {
  id: string
  name: string
  provider: ProviderId
  modality: ModalityCategory
  costNumeric: number
  costDisplay: string
  specs: string
  latency: string
  badge?: string
  description?: string
  isCustom?: boolean
}

export interface FallbackExecutionOptions<T> {
  modality: ModalityCategory
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

// Default fallback recommendations when none configured in settings
const DEFAULT_MODALITY_DEFAULTS: Record<
  ModalityCategory,
  { primaryId: string; fallbackIds: string[] }
> = {
  video: {
    primaryId: "fal/cinema-studio-4.0",
    fallbackIds: ["fal/kling-1.5-pro", "replicate/wan-2.1-t2v-14b"],
  },
  image: {
    primaryId: "fal/flux-1-schnell",
    fallbackIds: ["openai/dall-e-3", "replicate/flux-1-schnell"],
  },
  text: {
    primaryId: "gemini/gemini-2.5-pro",
    fallbackIds: ["openrouter/claude-3.7-sonnet", "openai/gpt-4o"],
  },
  audio: {
    primaryId: "fal/stable-audio",
    fallbackIds: ["openai/tts-1-hd"],
  },
  embedded: {
    primaryId: "gemini/gemini-embedding-004",
    fallbackIds: ["openai/text-embedding-3-large"],
  },
}

/**
 * Resolves any model identifier against the 42-model pricing catalog,
 * local custom models, and system catalogs with clean normalization.
 */
export function resolveModelInfo(
  modelId: string,
  targetModality: ModalityCategory = "video"
): ResolvedModelInfo {
  const cleanId = (modelId || "").toLowerCase().trim()

  // 0. Live registry record (fal / OpenRouter models fetched from the provider)
  const liveRecord = getRecord(modelId)
  if (liveRecord && liveRecord.endpoint !== liveRecord.id) {
    const prov: ProviderId = ["fal", "openai", "gemini", "replicate", "openrouter"].includes(liveRecord.provider)
      ? (liveRecord.provider as ProviderId)
      : "fal"
    const mod: ModalityCategory = liveRecord.modality
    return {
      id: liveRecord.id,
      name: liveRecord.name,
      provider: prov,
      modality: mod,
      costNumeric: estimateRun(liveRecord, {}).usd ?? 0.1,
      costDisplay: estimateRun(liveRecord, {}).display,
      specs: liveRecord.endpoint,
      latency: "—",
      description: liveRecord.description,
    }
  }

  // 1. Check custom models saved in localStorage if available
  let customModels: ResolvedModelInfo[] = []
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("gencraft_custom_models")
      if (saved) customModels = JSON.parse(saved)
    } catch {}
  }

  const customMatch = customModels.find(
    (m) =>
      m.id.toLowerCase() === cleanId ||
      m.name.toLowerCase() === cleanId
  )
  if (customMatch) {
    return {
      ...customMatch,
      isCustom: true,
    }
  }

  // 2. Check 42-model pricing catalog
  const catalogList = catalogData.models as unknown as Array<{
    id: string
    name: string
    provider: string
    modality: string
    costNumeric: number
    costDisplay: string
    specs: string
    latency: string
    badge?: string
    description?: string
  }>

  const catalogMatch = catalogList.find((m) => {
    const cid = m.id.toLowerCase()
    const cname = m.name.toLowerCase()
    return (
      cid === cleanId ||
      cid.endsWith("/" + cleanId) ||
      cleanId.endsWith("/" + cid) ||
      cid.replace(/[/_-]/g, "") === cleanId.replace(/[/_-]/g, "") ||
      cname === cleanId
    )
  })

  if (catalogMatch) {
    let prov: ProviderId = "fal"
    if (["fal", "openai", "gemini", "replicate", "openrouter"].includes(catalogMatch.provider)) {
      prov = catalogMatch.provider as ProviderId
    }

    let mod: ModalityCategory = targetModality
    if (["text", "image", "video", "audio", "embedded"].includes(catalogMatch.modality)) {
      mod = catalogMatch.modality as ModalityCategory
    }

    return {
      id: catalogMatch.id,
      name: catalogMatch.name,
      provider: prov,
      modality: mod,
      costNumeric: catalogMatch.costNumeric || 0.1,
      costDisplay: catalogMatch.costDisplay || "$0.10",
      specs: catalogMatch.specs || "1080p · Production GPU",
      latency: catalogMatch.latency || "15s",
      badge: catalogMatch.badge,
      description: catalogMatch.description,
    }
  }

  // 3. Check legacy MODEL_CATALOG
  const legacyMatch = MODEL_CATALOG.find((m) => {
    const lid = m.id.toLowerCase()
    return (
      lid === cleanId ||
      lid.endsWith("/" + cleanId) ||
      cleanId.endsWith("/" + lid) ||
      m.name.toLowerCase() === cleanId
    )
  })

  if (legacyMatch) {
    let prov: ProviderId = "fal"
    if (["fal", "openai", "gemini", "replicate", "openrouter"].includes(legacyMatch.provider)) {
      prov = legacyMatch.provider as ProviderId
    }

    return {
      id: legacyMatch.id,
      name: legacyMatch.name,
      provider: prov,
      modality: targetModality,
      costNumeric: legacyMatch.costNumeric || 0.1,
      costDisplay: legacyMatch.costPerRun || "$0.10",
      specs: `${legacyMatch.resolution} · ${legacyMatch.latency}`,
      latency: legacyMatch.latency || "18s",
      badge: legacyMatch.badge,
      description: legacyMatch.description,
    }
  }

  // 4. Fallback safe synthesizer for custom / unspecified model string
  const parts = cleanId.split("/")
  const derivedProvider = (parts[0] as ProviderId) || "fal"
  const rawName = parts.pop() || cleanId
  const formattedName = rawName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")

  return {
    id: modelId || `custom-${Date.now()}`,
    name: formattedName || "Custom Model",
    provider: ["fal", "openai", "gemini", "replicate", "openrouter"].includes(derivedProvider)
      ? derivedProvider
      : "fal",
    modality: targetModality,
    costNumeric: 0.1,
    costDisplay: "$0.10",
    specs: "BYOK Custom Direct",
    latency: "15s",
    badge: "Direct",
    description: "User-defined direct model endpoint.",
  }
}

/**
 * LiteLLM-Style Multi-Provider & Single-Provider Router Chain Builder:
 * - Single Key Mode (1 provider connected): builds intra-provider fallback chain across same-modality models.
 * - Multi-Key Mode (2–5 providers connected):
 *   1. If `strategy === "cost-based-routing"`, promotes the cheapest cross-host equivalent of the same model to primary.
 *   2. Places same-model cross-provider equivalents (`sameModelElsewhere`) sorted by lowest `estimateRun` cost first.
 *   3. Appends best cross-provider modality fallbacks, then intra-provider fallbacks.
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

  // 2. Best default-enabled models on other connected providers for the same modality
  const byId = new Map(usablePool.map((r) => [r.id, r]))
  const seenProviders = new Set<string>([
    effectivePrimary.provider,
    ...crossHostEquivalents.map((r) => r.provider),
  ])
  const crossProviderModality: ModelRecord[] = []
  for (const id of computeDefaultEnabled(usablePool)) {
    const rec = byId.get(id)
    if (!rec || rec.modality !== effectivePrimary.modality || seenProviders.has(rec.provider)) continue
    seenProviders.add(rec.provider)
    crossProviderModality.push(rec)
  }

  // 3. Intra-provider fallbacks (essential when user only connects 1 provider key)
  const intraProviderFallbacks = computeDefaultEnabled(usablePool)
    .map((id) => byId.get(id))
    .filter(
      (rec): rec is ModelRecord =>
        Boolean(rec) &&
        rec!.modality === effectivePrimary.modality &&
        rec!.provider === effectivePrimary.provider &&
        rec!.id !== effectivePrimary.id
    )
    .slice(0, 2)

  const seenIds = new Set<string>()
  const result: ModelRecord[] = []
  for (const candidate of [
    effectivePrimary,
    ...crossHostEquivalents,
    ...crossProviderModality,
    ...intraProviderFallbacks,
  ]) {
    if (seenIds.has(candidate.id)) continue
    seenIds.add(candidate.id)
    result.push(candidate)
  }
  return result
}

/**
 * Resolves the ordered fallback chain for a given modality using user studio settings.
 * Returns { primary, chain, autoLock }
 */
export function resolveModalityChain(
  modality: ModalityCategory,
  settings: SettingsState,
  primaryOverride?: string
): {
  primary: ResolvedModelInfo
  chain: ResolvedModelInfo[]
  autoLock: boolean
} {
  const defaults = DEFAULT_MODALITY_DEFAULTS[modality]

  // Retrieve primary ID from settings
  let configuredPrimaryId: string | undefined
  switch (modality) {
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
    case "embedded":
      configuredPrimaryId = settings.aiEngine.activeEmbeddingModelId
      break
  }

  // Only models the registry still offers are used. Settings saved by an older version may name retired
  // models; those are skipped, and a current default fills in when nothing usable is left.
  // Only models a provider key can run: a fallback on a provider without a key could never succeed
  const listedNow = getListedModels()
  const usable = (id: string | undefined): id is string => Boolean(id) && listedNow.some((r) => r.id === id)
  const registryModality = modality === "embedded" ? undefined : modality
  const registryDefault = registryModality ? defaultModelFor(registryModality, getListedModels())?.id : undefined
  // No usable model at all: say so plainly instead of trying a stand-in that has no key
  if (registryModality && !usable(primaryOverride) && !usable(configuredPrimaryId) && !registryDefault) {
    const what = registryModality === "text" ? "chat" : registryModality
    throw new Error(`No ${what} model is available. Add a provider key and switch on a ${what} model in Settings.`)
  }
  const primaryModelId = (usable(primaryOverride) && primaryOverride) || (usable(configuredPrimaryId) && configuredPrimaryId) || registryDefault || primaryOverride || configuredPrimaryId || defaults.primaryId
  const primary = resolveModelInfo(primaryModelId, modality)

  // Retrieve configured fallbacks for this modality
  const configuredFallbacks = settings.aiEngine.fallbackModels?.[modality] || []
  const usableFallbacks = configuredFallbacks.filter(usable)
  // Nothing set by the person: use LiteLLM router chain (same-model cross-host equivalents sorted by lowest price first,
  // then cross-provider modality fallbacks, then intra-provider fallbacks when only 1 key is connected)
  const primaryRecord = getRecord(primaryModelId)
  const autoFallbacks = registryModality
    ? (() => {
        if (primaryRecord && primaryRecord.endpoint !== primaryRecord.id) {
          return buildLiteLLMRouterChain(primaryRecord, listedNow)
            .slice(1, 5)
            .map((r) => r.id)
        }
        const primaryProvider = primaryRecord?.provider
        const byId = new Map(listedNow.map((r) => [r.id, r]))
        const seen = new Set<string>()
        return computeDefaultEnabled(listedNow)
          .map((id) => byId.get(id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.modality === registryModality && r!.provider !== primaryProvider)
          .filter((r) => (seen.has(r.provider) ? false : (seen.add(r.provider), true)))
          .slice(0, 3)
          .map((r) => r.id)
      })()
    : []
  const fallbackList = usableFallbacks.length > 0 ? usableFallbacks : configuredFallbacks.length > 0 ? [] : [...autoFallbacks, ...defaults.fallbackIds.filter(usable)]

  // De-duplicate: Ensure primary model does not duplicate in the fallback sequence
  const uniqueFallbackIds = fallbackList.filter(
    (fid) =>
      fid.toLowerCase() !== primary.id.toLowerCase() &&
      !primary.id.toLowerCase().endsWith("/" + fid.toLowerCase()) &&
      !fid.toLowerCase().endsWith("/" + primary.id.toLowerCase())
  )

  const chain: ResolvedModelInfo[] = [
    primary,
    ...uniqueFallbackIds.map((fid) => resolveModelInfo(fid, modality)),
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
    modality,
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

  const { primary, chain, autoLock } = resolveModalityChain(modality, settings, primaryModelId)

  const fallbackSummary =
    chain.length > 1
      ? chain
          .slice(1)
          .map((m, idx) => `#${idx + 1} ${m.name}`)
          .join(" → ")
      : "None configured"

  pushLog(
    `[Router] Modality: ${modality.toUpperCase()} | Primary: ${primary.name} (${primary.provider})`
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
      const estimate = ran && ran.endpoint !== ran.id ? estimateRun(ran, cost!.values, cost!.context ?? {}) : undefined
      const priced = estimate ? estimate.usd : null
      const guessed = priced !== null ? Math.round(priced * 10000) / 10000 : Math.round(currentModel.costNumeric * Math.max(0.001, costMultiplier) * 10000) / 10000
      // What the provider reported, when it does, is the cost; otherwise the estimate
      const reported = actual as ActualCost | undefined
      const costUsd = reported ? Math.round(reported.usd * 1_000_000) / 1_000_000 : guessed
      const credits = Math.round(costUsd * 25 * 100) / 100

      // Text is counted where its tokens are known (lib/ledger/text-usage.ts), never here, so it is not counted twice or at a flat price
      if (modality !== "text") usageLedger.addRecord({
        modelName: currentModel.name,
        modelId: currentModel.id,
        category: modality,
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
    `❌ [Router Exhaustion] All ${chain.length} models in the fallback chain for ${modality} failed.`
  )

  throw new Error(
    `Fallback sequence exhausted for ${modality}. Attempted ${chain.length} models (${chain
      .map((m) => m.name)
      .join(", ")}): ${lastError?.message || "Execution failed"}`
  )
}

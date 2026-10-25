import type { ModelRecord } from "@/lib/registry/types"
import { extractUsageFromRaw } from "@/lib/litellm/cost"

/**
 * What a run really cost, when the provider says so in its own answer.
 * - OpenRouter / LiteLLM / Runware: reports `usage.cost` or `cost` directly.
 * - Token-priced models (OpenAI, Gemini, OpenRouter, Fal Chat, Replicate LLMs): computes exact cost from `usage` token counts.
 * - Replicate hardware-billed models: `metrics.predict_time * computeSecond`.
 */

export interface ActualCost {
  usd: number
  /** exact: the provider says it. computed: the provider's own measure of the run (tokens or seconds) times its own rate. */
  basis: "exact" | "computed"
  /** Where the number came from, in plain words */
  note: string
}

export function actualCostOf(
  rec: Pick<ModelRecord, "provider"> & {
    endpoint?: string
    modality?: ModelRecord["modality"]
    price?: { unit?: string; amount?: number | null; outputAmount?: number; cachedAmount?: number; computeSecond?: number }
  },
  raw: unknown,
  _params?: Record<string, unknown>,
): ActualCost | null {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>
    const directCost = (r.usage as { cost?: unknown } | undefined)?.cost ?? r.cost ?? r.response_cost
    if (typeof directCost === "number" && Number.isFinite(directCost) && directCost >= 0) {
      return { usd: directCost, basis: "exact", note: `Cost reported by ${rec.provider}` }
    }
  }
  // Replicate bills a model that runs on its own hardware by the seconds the run took: Replicate's predict_time times the hardware's rate
  if (rec.provider === "replicate" && rec.price?.computeSecond) {
    const seconds = (raw as { metrics?: { predict_time?: unknown } } | undefined)?.metrics?.predict_time
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) return { usd: seconds * rec.price.computeSecond, basis: "computed", note: `${seconds.toFixed(1)} s on the model's hardware` }
  }
  // Token-billed runs (OpenAI, Gemini, OpenRouter, Fal Chat, Replicate LLMs)
  if (rec.price?.unit === "per_1m_tokens" && typeof rec.price.amount === "number") {
    const tokens = extractUsageFromRaw(raw)
    if (tokens) {
      const inRate = rec.price.amount
      const outRate = rec.price.outputAmount ?? inRate
      const cacheRate = rec.price.cachedAmount ?? inRate * 0.25
      const uncachedPrompt = Math.max(0, (tokens.promptTokens ?? 0) - (tokens.cachedTokens ?? 0))
      const totalOut = (tokens.completionTokens ?? 0) + (tokens.reasoningTokens ?? 0)
      const usd = (uncachedPrompt * inRate + (tokens.cachedTokens ?? 0) * cacheRate + totalOut * outRate) / 1_000_000
      return { usd, basis: "computed", note: `${tokens.promptTokens ?? 0} in / ${totalOut} out tokens` }
    }
  }
  // A price-list rate times the sent options is still an estimate, not what the provider billed, so it is left to the
  // caller to record as "estimated" (the basis the fal reconcile and the calibration look for).
  return null
}



import type { ActualCost } from "../ledger/actual-cost"
import { estimateRun, type PriceContext, type PriceEstimate } from "../registry/price"
import type { ModelRecord } from "../registry/types"

/**
 * LiteLLM-Style Cost Calculator (`completionCost`):
 * Computes both pre-run cost estimates (`estimateModelCost`) and post-run actual costs (`completionCost`)
 * from provider response usage payloads (OpenRouter, OpenAI, Gemini, Replicate, Fal.ai).
 */

export interface UsageTokens {
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
  cachedTokens?: number
}

export function extractUsageFromRaw(raw: unknown): UsageTokens | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  // 1. OpenAI / OpenRouter / Fal Chat `usage` object
  const usage = r.usage as Record<string, unknown> | undefined
  if (usage && typeof usage === "object") {
    const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0)
    const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0)
    const details = (usage.completion_tokens_details ?? usage.output_tokens_details) as Record<string, unknown> | undefined
    const promptDetails = (usage.prompt_tokens_details ?? usage.input_tokens_details) as Record<string, unknown> | undefined
    const reasoningTokens = Number(details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0)
    const cachedTokens = Number(promptDetails?.cached_tokens ?? usage.cache_read_input_tokens ?? 0)
    if (promptTokens > 0 || completionTokens > 0) {
      return { promptTokens, completionTokens, reasoningTokens, cachedTokens }
    }
  }

  // 2. Gemini `usageMetadata`
  const geminiUsage = r.usageMetadata as Record<string, unknown> | undefined
  if (geminiUsage && typeof geminiUsage === "object") {
    const promptTokens = Number(geminiUsage.promptTokenCount ?? 0)
    const completionTokens = Number(geminiUsage.candidatesTokenCount ?? 0)
    const reasoningTokens = Number(geminiUsage.thoughtsTokenCount ?? 0)
    const cachedTokens = Number(geminiUsage.cachedContentTokenCount ?? 0)
    if (promptTokens > 0 || completionTokens > 0) {
      return { promptTokens, completionTokens, reasoningTokens, cachedTokens }
    }
  }

  return null
}

/**
 * LiteLLM `completion_cost()` equivalent:
 * Calculates the exact USD cost of a completed request from its response payload and `ModelRecord`.
 */
export function completionCost(
  record: ModelRecord,
  rawResponse: unknown,
  sentParams: Record<string, unknown> = {},
  context: PriceContext = {},
): ActualCost | null {
  if (rawResponse && typeof rawResponse === "object") {
    const raw = rawResponse as Record<string, unknown>

    // 1. Direct provider-reported USD cost (OpenRouter `usage.cost`, Runware `cost`, or LiteLLM `response_cost`)
    const usageCost = (raw.usage as Record<string, unknown> | undefined)?.cost ?? raw.cost ?? raw.response_cost
    if (typeof usageCost === "number" && Number.isFinite(usageCost) && usageCost >= 0) {
      return { usd: usageCost, basis: "exact", note: `Exact cost reported by ${record.provider}` }
    }

    // 2. Token-based exact calculation (OpenAI, Gemini, OpenRouter, Fal Chat, Replicate LLMs)
    if (record.price.unit === "per_1m_tokens" && record.price.amount !== null) {
      const tokens = extractUsageFromRaw(rawResponse)
      if (tokens) {
        const inRate = record.price.amount
        const outRate = record.price.outputAmount ?? inRate
        const cacheRate = record.price.cachedAmount ?? inRate * 0.25
        const uncachedPrompt = Math.max(0, (tokens.promptTokens ?? 0) - (tokens.cachedTokens ?? 0))
        const totalOut = (tokens.completionTokens ?? 0) + (tokens.reasoningTokens ?? 0)
        const usd = (uncachedPrompt * inRate + (tokens.cachedTokens ?? 0) * cacheRate + totalOut * outRate) / 1_000_000
        return {
          usd,
          basis: "computed",
          note: `${tokens.promptTokens ?? 0} in / ${totalOut} out tokens`,
        }
      }
    }

    // 3. Replicate hardware-billed models (`metrics.predict_time * computeSecond`)
    if (record.provider === "replicate" && record.price.computeSecond) {
      const seconds = (raw.metrics as Record<string, unknown> | undefined)?.predict_time
      if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
        return {
          usd: seconds * record.price.computeSecond,
          basis: "computed",
          note: `${seconds.toFixed(1)} s on ${record.provider} hardware`,
        }
      }
    }
  }

  // 4. Deterministic media tier calculation (per_image, per_second, per_megapixel, per_1k_chars)
  if (record.price.amount !== null && !record.price.computeSecond && record.price.unit !== "per_1m_tokens") {
    const est = estimateRun(record, sentParams, context)
    if (est.usd !== null && !est.approximate) {
      return {
        usd: est.usd,
        basis: "computed",
        note: est.breakdown ?? `Computed from ${record.provider} rate`,
      }
    }
  }

  return null
}

/** Pre-run cost estimate wrapper for UI badges and Cost-Based Router comparisons. */
export function estimateModelCost(
  record: ModelRecord,
  params: Record<string, unknown> = {},
  context: PriceContext = {},
): PriceEstimate {
  return estimateRun(record, params, context)
}

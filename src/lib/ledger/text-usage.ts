import { wrapLanguageModel } from "ai"
import type { LanguageModel } from "ai"
import type { ProviderId } from "./usage-store"
import type { ModelRecord } from "@/lib/registry/types"
import { usageLedger } from "./usage-store"
import type { CostBasis } from "./usage-store"

/**
 * What text costs, from what the provider says it used. Every call to a chat model (chat, the agent, its research, its picture
 * check, app text steps) goes through here once, so every place is accountable in the usage history, and nothing is counted twice:
 *
 *  - The tokens are the provider's own (input, cached input read, cached input written, output; reasoning is inside output).
 *  - The price is the model's own per-million-token price, with its cheaper cached-input rate when it has one.
 *  - A call whose provider gave no tokens is estimated from the length of the words, and says so.
 */

export interface TokenRates {
  /** US dollars per million input tokens */
  in: number
  /** per million output tokens */
  out: number
  /** per million cached input tokens read, when the provider has a cheaper rate for them */
  cachedIn?: number
}

/** What a call used, in the shape the AI SDK's models report it */
export interface UsageBuckets {
  inputTokens?: { total?: number; noCache?: number; cacheRead?: number; cacheWrite?: number }
  outputTokens?: { total?: number; text?: number; reasoning?: number }
}

/** What the person has spent on text in one conversation turn, summed over every call in it */
export interface Meter {
  usd: number
  tokens: number
}

export function ratesOf(rec: { price?: { unit: string; amount: number | null; outputAmount?: number; cachedAmount?: number } } | undefined): TokenRates | null {
  const p = rec?.price
  if (!p || p.unit !== "per_1m_tokens" || p.amount === null) return null
  return { in: p.amount, out: p.outputAmount ?? p.amount, cachedIn: p.cachedAmount }
}

/** The cost of a call from its tokens. Cached tokens are not charged twice, and an unknown cached rate costs as normal input (never less than it is). */
export function costFromUsage(u: UsageBuckets, rates: TokenRates): { usd: number; inTokens: number; outTokens: number } {
  const input = u.inputTokens ?? {}
  const cacheRead = input.cacheRead ?? 0
  const cacheWrite = input.cacheWrite ?? 0
  const total = input.total ?? (input.noCache ?? 0) + cacheRead + cacheWrite
  const fresh = input.noCache ?? Math.max(0, total - cacheRead - cacheWrite)
  const out = u.outputTokens?.total ?? (u.outputTokens?.text ?? 0) + (u.outputTokens?.reasoning ?? 0)
  const usd = (fresh * rates.in + cacheRead * (rates.cachedIn ?? rates.in) + cacheWrite * rates.in + out * rates.out) / 1_000_000
  return { usd, inTokens: total, outTokens: out }
}

/** About four letters to a token: the guess for a call whose provider told us nothing */
export const tokensFromText = (s: string): number => Math.ceil(s.length / 4)

const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000

/** Writes one text call into the usage history, and adds it to the turn's meter */
export function recordText(rec: ModelRecord | undefined, usage: UsageBuckets, opts: { label: string; basis: CostBasis; meter?: Meter; /** The cost the provider itself reported for the call (OpenRouter does), used instead of tokens times price */ exactUsd?: number }): number {
  if (!rec) return 0
  const rates = ratesOf(rec)
  const counted = rates ? costFromUsage(usage, rates) : { usd: 0, inTokens: usage.inputTokens?.total ?? 0, outTokens: usage.outputTokens?.total ?? 0 }
  const { inTokens, outTokens } = counted
  const usd = opts.exactUsd ?? counted.usd
  if (inTokens + outTokens === 0) return 0
  const cost = round(usd)
  usageLedger.addRecord({
    modelName: rec.name,
    modelId: rec.id,
    category: "text",
    provider: rec.provider as ProviderId,
    costUsd: cost,
    specs: `${inTokens} in · ${outTokens} out tokens`,
    feature: `${rec.name} (${opts.label})`,
    basis: opts.exactUsd !== undefined ? "exact" : rates ? opts.basis : "unpriced",
    endpoint: rec.endpoint,
  })
  if (opts.meter) {
    opts.meter.usd += cost
    opts.meter.tokens += inTokens + outTokens
  }
  return cost
}

/** For a text call that came back as plain words with no token counts (the older connectors): the tokens are guessed from the length */
export function recordTextEstimate(rec: ModelRecord | undefined, prompt: string, reply: string, label: string, meter?: Meter): number {
  return recordText(rec, { inputTokens: { total: tokensFromText(prompt) }, outputTokens: { total: tokensFromText(reply) } }, { label, basis: "estimated", meter })
}

type V4 = Extract<LanguageModel, { specificationVersion: "v4" }>

/**
 * The model, counted: every call it makes is written to the usage history from the tokens the provider reports. A model that
 * reports none (a custom one) is estimated from its words, and marked as an estimate.
 */
export function withUsage(model: LanguageModel, rec: ModelRecord | undefined, opts: { label: string; meter?: Meter }): LanguageModel {
  if (!rec || typeof model === "string" || (model as V4).specificationVersion !== "v4") return model
  const note = (usage: UsageBuckets | undefined, providerMetadata: unknown, words: { prompt: string; reply: string }) => {
    const told = (usage?.inputTokens?.total ?? 0) + (usage?.outputTokens?.total ?? 0) > 0
    const guessed = (providerMetadata as { studio?: { estimated?: boolean } } | undefined)?.studio?.estimated === true
    // OpenRouter says what the call cost in its own answer: that is the cost
    const reported = (providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter?.usage?.cost
    const exactUsd = typeof reported === "number" && Number.isFinite(reported) && reported >= 0 ? reported : undefined
    if (told) recordText(rec, usage!, { label: opts.label, basis: guessed ? "estimated" : "computed", meter: opts.meter, exactUsd })
    else recordTextEstimate(rec, words.prompt, words.reply, opts.label, opts.meter)
  }
  return wrapLanguageModel({
    model: model as V4,
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        const result = await doGenerate()
        const reply = result.content.map((c) => (c.type === "text" ? c.text : "")).join("")
        note(result.usage as UsageBuckets, result.providerMetadata, { prompt: JSON.stringify(params.prompt), reply })
        return result
      },
      wrapStream: async ({ doStream, params }) => {
        const { stream, ...rest } = await doStream()
        let reply = ""
        const counted = new TransformStream({
          transform(chunk, controller) {
            const c = chunk as { type: string; delta?: string; usage?: UsageBuckets; providerMetadata?: unknown }
            if (c.type === "text-delta" && typeof c.delta === "string") reply += c.delta
            if (c.type === "finish") note(c.usage, c.providerMetadata, { prompt: JSON.stringify(params.prompt), reply })
            controller.enqueue(chunk)
          },
        })
        return { stream: stream.pipeThrough(counted), ...rest }
      },
    },
  })
}

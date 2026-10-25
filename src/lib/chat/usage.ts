import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai"

/** What a turn used, kept on the reply so the conversation can show it. */
export interface TurnUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface TurnMeta {
  usage?: TurnUsage
  /** What the person typed, when the model was sent more (a skill's method in front of it) */
  shown?: string
  /** What the reply cost, from the model's token prices; absent when they are unknown */
  costUsd?: number
  /** Why the model ended its turn: stop, tool-calls, length (it ran out of room), content-filter, error or other */
  finishReason?: string
  /** The first model failed, so this one answered */
  switched?: { from: string; to: string }
}

/** US dollars per million input and output tokens */
export interface TokenPrice {
  in: number
  out: number
}

/** For `toUIMessageStream({ messageMetadata })`: the reply carries its token use once it finishes. */
export function usageMetadata({ part }: { part: TextStreamPart<ToolSet> }): TurnMeta | undefined {
  if (part.type !== "finish") return undefined
  const u = part.totalUsage
  const total = u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0)
  return { usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: total }, finishReason: typeof part.finishReason === "string" ? part.finishReason : undefined }
}

/** Like usageMetadata, with the cost of the reply and a note when a fallback model answered. */
export function turnMetadata(options: { price?: TokenPrice | null; switched?: { from: string; to: string } }) {
  return ({ part }: { part: TextStreamPart<ToolSet> }): TurnMeta | undefined => {
    if (part.type === "start" && options.switched) return { switched: options.switched }
    const meta = usageMetadata({ part })
    const u = meta?.usage
    if (!meta || !u || !options.price) return meta
    return { ...meta, costUsd: ((u.inputTokens ?? 0) * options.price.in + (u.outputTokens ?? 0) * options.price.out) / 1_000_000 }
  }
}

/** All the tokens a conversation used, added up over its replies. */
export function totalTokens(messages: Array<{ role: string; metadata?: unknown }>): TurnUsage {
  const sum: TurnUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for (const m of messages) {
    const u = (m.metadata as TurnMeta | undefined)?.usage
    if (m.role !== "assistant" || !u) continue
    sum.inputTokens! += u.inputTokens ?? 0
    sum.outputTokens! += u.outputTokens ?? 0
    sum.totalTokens! += u.totalTokens ?? 0
  }
  return sum
}

export const tokenWords = (n: number): string => (n >= 10_000 ? `${Math.round(n / 1000)}K tokens` : n >= 1000 ? `${(n / 1000).toFixed(1)}K tokens` : `${n} tokens`)

/** The conversation's use in the shape AI Elements' Context shows: what the last turn filled of the window, and the totals. */
export function contextUsage(messages: Array<{ role: string; metadata?: unknown }>): { usedTokens: number; usage: LanguageModelUsage } {
  const sum = totalTokens(messages)
  const last = [...messages].reverse().find((m) => m.role === "assistant" && (m.metadata as TurnMeta | undefined)?.usage)
  const lastUsage = (last?.metadata as TurnMeta | undefined)?.usage
  return {
    // The last turn's input already holds everything said before it, so input plus output is what the window holds now
    usedTokens: (lastUsage?.inputTokens ?? 0) + (lastUsage?.outputTokens ?? 0),
    usage: {
      inputTokens: sum.inputTokens,
      outputTokens: sum.outputTokens,
      totalTokens: sum.totalTokens,
      inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    },
  }
}

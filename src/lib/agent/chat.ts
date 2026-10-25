import { DirectChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"
import type { ChatTransport, InferUITools, LanguageModel, UIMessage, UIMessageChunk } from "ai"
import { createStudioAgent } from "@pro/agent/studio-agent"
import type { StudioTools } from "@pro/agent/studio-agent"
import type { GenerateKind, MadeResult, StudioEnv } from "./types"
import { ledgerFromMessages } from "./policy"
import { usageMetadata } from "@/lib/chat/usage"
import { errorText } from "@/lib/chat/stream"
import type { Meter } from "@/lib/ledger/text-usage"

/**
 * The agent's conversation, as the AI SDK's chat state: messages made of parts (text, reasoning, tool calls with their
 * approval and result). The app runs the agent in-process, so the chat talks to it directly, with no server in between.
 */

export type StudioUIMessage = UIMessage<unknown, never, InferUITools<StudioTools>>

/** What the agent needs each time it is asked to continue: the model, and what to call to make things. */
export interface AgentRuntime {
  /** Adds up what the turn's text calls cost (the agent, its research, its picture check), so the reply carries it */
  meter?: Meter
  model: LanguageModel
  env: Omit<StudioEnv, "made" | "ledger">
}

type AnyPart = { type: string; state?: string; input?: unknown; output?: unknown }
type Loose = { parts?: AnyPart[] }

/** Everything made so far in this conversation, read from the saved tool results. */
export function madeFromMessages(messages: Loose[]): MadeResult[] {
  const out: MadeResult[] = []
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (!p.type.startsWith("tool-generate_") || p.state !== "output-available") continue
      const kind = p.type.replace("tool-generate_", "") as GenerateKind
      const ids = (p.output as { assetIds?: unknown } | undefined)?.assetIds
      const prompt = (p.input as { prompt?: unknown } | undefined)?.prompt
      for (const id of Array.isArray(ids) ? ids : []) out.push({ id: String(id), kind, prompt: typeof prompt === "string" ? prompt : "" })
    }
  }
  return out
}

/** Builds a fresh agent for each turn, from the latest model and settings, and the spend so far. */
export class StudioTransport implements ChatTransport<StudioUIMessage> {
  constructor(private readonly runtime: () => AgentRuntime) {}

  async sendMessages(options: Parameters<ChatTransport<StudioUIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const { model, env, meter } = this.runtime()
    const ledger = ledgerFromMessages(options.messages)
    const agent = createStudioAgent(model, { ...env, ledger, made: () => madeFromMessages(options.messages) })
    return new DirectChatTransport({
      agent,
      sendReasoning: true,
      // The reply carries its tokens and what the turn's text calls cost
      messageMetadata: ((o: { part: never }) => {
        const m = usageMetadata(o as never)
        return m ? { ...m, costUsd: meter ? Math.round(meter.usd * 1_000_000) / 1_000_000 : undefined } : undefined
      }) as never,
      onError: errorText,
    }).sendMessages(options as never) as Promise<ReadableStream<UIMessageChunk>>
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}

/**
 * After the person answers a question the agent asked, or approves or denies something, the run goes on by itself.
 * A question is waiting to be taken up when it is answered in the last step of the last message and nothing in that step
 * still waits for the person. The agent may have called other tools in the same step as the question (a model often does),
 * so the question does not have to be the very last thing in the message. Once the agent has taken the answer up, a new
 * step starts after it, and this is false again.
 */
export function continueWhenAnswered(options: { messages: StudioUIMessage[] }): boolean {
  if (lastAssistantMessageIsCompleteWithApprovalResponses(options as never)) return true
  const last = options.messages[options.messages.length - 1]
  if (last?.role !== "assistant") return false
  const parts = last.parts as unknown as AnyPart[]
  let from = parts.length - 1
  while (from >= 0 && parts[from]!.type !== "step-start") from--
  const step = parts.slice(from + 1)
  const waiting = step.some((p) => p.type.startsWith("tool-") && (p.state === "input-available" || p.state === "input-streaming" || p.state === "approval-requested"))
  return !waiting && step.some((p) => p.type === "tool-ask_user" && p.state === "output-available")
}

/**
 * The run ended and nothing was said after the last thing the agent did: its last visible part is a finished tool (the person's
 * answer, a result) or there is nothing at all. A model sometimes ends its turn empty after a tool result, and then the screen
 * would just sit there. A finished app is not a stop.
 */
export function stoppedEarly(messages: Array<{ role: string; parts: unknown[] }>): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant") return false
  const parts = (last.parts as AnyPart[]).filter((p) => p.type !== "step-start" && p.type !== "reasoning")
  const tail = parts[parts.length - 1]
  if (!tail) return true
  if (!tail.type.startsWith("tool-")) return false
  if (tail.type === "tool-finish_app" && (tail.output as { saved?: boolean } | undefined)?.saved === true) return false
  return tail.state === "output-available" || tail.state === "output-error"
}

/**
 * The run is going and nothing on screen is moving: the last thing is the person's message, nothing yet, or a tool that has
 * finished (the answer to a question, a result). The screen shows an animated "Thinking" line then, so it never looks stopped.
 */
export function waitingOnModel(messages: Array<{ role: string; parts: unknown[] }>): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role === "user") return true
  const tail = (last.parts as AnyPart[]).filter((p) => p.type !== "step-start").pop()
  if (!tail) return true
  if (tail.type === "reasoning") return tail.state === "done"
  return tail.type.startsWith("tool-") && (tail.state === "output-available" || tail.state === "output-error" || tail.state === "output-denied")
}

export const textOf = (m: Loose & { parts?: Array<AnyPart & { text?: string }> }): string =>
  (m.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => (p as { text?: string }).text ?? "")
    .join("")

export function agentTitle(messages: Array<Loose & { role: string }>): string {
  const first = messages.find((m) => m.role === "user")
  const t = first ? textOf(first as never).trim().replace(/\s+/g, " ") : ""
  return t.length > 60 ? `${t.slice(0, 57)}...` : t || "Untitled"
}

import { convertToModelMessages, isStepCount, pruneMessages, smoothStream, streamText } from "ai"
import type { ChatTransport, LanguageModel, ModelMessage, ToolSet, UIMessage, UIMessageChunk } from "ai"
import { turnMetadata } from "./usage"
import type { TokenPrice } from "./usage"

/**
 * Chat that streams and remembers. The reply is written as it arrives, and every turn is sent with the whole conversation
 * so far, so a follow-up knows what came before.
 *
 * Models are tried in the order the app's fallback list gives (`chain`). A model that fails before it says anything hands
 * over to the next; one that has started answering is not interrupted. A model the AI SDK has no provider for answers in
 * one piece, through the app's older connector (`plain`).
 */

export interface StreamDeps<M> {
  /** Runs `execute` for each candidate model in turn until one succeeds (the app's fallback router) */
  chain: <T>(execute: (model: M, attempt: number) => Promise<T>) => Promise<T>
  /** The AI SDK model for a candidate, or null when there is none for its provider */
  languageModel: (model: M) => LanguageModel | null
  /** Answers in one piece, for a candidate with no AI SDK provider */
  plain: (model: M, prompt: string) => Promise<string>
  /** Tools the provider runs itself for this candidate, such as searching the web */
  tools?: (model: M) => ToolSet | undefined
  /** Standing instructions sent with every turn: the date, the person's own notes, how to behave */
  system?: (model: M) => string | undefined
  /** The model's name, for the note when a fallback answers */
  label?: (model: M) => string
  /** What the model charges per million tokens, to show the cost of a reply */
  price?: (model: M) => TokenPrice | null
}

const transcript = (messages: ModelMessage[]): string =>
  messages
    .map((m) => {
      const text = typeof m.content === "string" ? m.content : m.content.map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("")
      return messages.length === 1 ? text : `${m.role === "user" ? "User" : "Assistant"}: ${text}`
    })
    .join("\n\n")

/** The stream of one answer written in one piece, in the shape the chat state reads */
function oneChunkStream(text: string): ReadableStream<UIMessageChunk> {
  const chunks: UIMessageChunk[] = [{ type: "start" }, { type: "start-step" }, { type: "text-start", id: "t1" }, { type: "text-delta", id: "t1", delta: text }, { type: "text-end", id: "t1" }, { type: "finish-step" }, { type: "finish" }]
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

const isContent = (c: UIMessageChunk) => c.type === "text-start" || c.type === "reasoning-start" || c.type === "text-delta" || c.type === "reasoning-delta"

/**
 * Reads ahead until the model has said something or failed. A failure before any content throws, so the next candidate can
 * take over; after that the rest of the stream is passed on as it comes.
 */
async function committed(source: ReadableStream<UIMessageChunk>): Promise<ReadableStream<UIMessageChunk>> {
  const reader = source.getReader()
  const held: UIMessageChunk[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value.type === "error") throw new Error(value.errorText)
    held.push(value)
    if (isContent(value)) break
  }
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const c of held) controller.enqueue(c)
    },
    async pull(controller) {
      const { value, done } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

export async function streamChat<M>(deps: StreamDeps<M>, messages: ModelMessage[], signal?: AbortSignal): Promise<ReadableStream<UIMessageChunk>> {
  const tried: string[] = []
  return deps.chain<ReadableStream<UIMessageChunk>>(async (model) => {
    const name = deps.label?.(model) ?? ""
    tried.push(name)
    const switched = tried.length > 1 && name ? { from: tried[0]!, to: name } : undefined
    const lm = deps.languageModel(model)
    const system = deps.system?.(model)
    if (!lm) return oneChunkStream(await deps.plain(model, system ? `${system}\n\n${transcript(messages)}` : transcript(messages)))
    // A long conversation sheds its old reasoning and old tool traffic, which the model no longer needs
    const trimmed = pruneMessages({ messages, reasoning: "before-last-message", toolCalls: "before-last-2-messages", emptyMessages: "remove" })
    const run = (tools: ToolSet | undefined) => {
      const result = streamText({ model: lm, system, messages: trimmed, tools, stopWhen: tools ? isStepCount(6) : undefined, abortSignal: signal, experimental_transform: smoothStream({ chunking: "word" }), onError: () => undefined })
      return committed(result.toUIMessageStream({ sendReasoning: true, sendSources: true, messageMetadata: turnMetadata({ price: deps.price?.(model), switched }), onError: (e) => (e instanceof Error ? e.message : String(e)) }))
    }
    const tools = deps.tools?.(model)
    try {
      return await run(tools)
    } catch (e) {
      // A model that does not take tools still answers: ask again without them, once, before moving to the next model
      if (tools && Object.keys(tools).length > 0 && /tool|function.?call/i.test(e instanceof Error ? e.message : String(e))) return run(undefined)
      throw e
    }
  })
}

/** Connects the chat state to `streamChat`. */
export class ChatStreamTransport<M> implements ChatTransport<UIMessage> {
  constructor(private readonly deps: () => StreamDeps<M>) {}

  async sendMessages(options: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const messages = await convertToModelMessages(options.messages as Array<Omit<UIMessage, "id">>)
    return streamChat(this.deps(), messages, options.abortSignal)
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}

/** A conversation saved before the chat streamed, as chat messages. Only plain text turns can be carried over. */
export function legacyToUi(messages: Array<{ id: string; role: string; content: string; scenes?: unknown; images?: unknown; audio?: unknown; steps?: unknown; assets?: unknown; job?: unknown }>): UIMessage[] | null {
  if (messages.some((m) => m.scenes || m.images || m.audio || m.steps || m.assets || m.job || (m.role !== "user" && m.role !== "assistant"))) return null
  return messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", parts: [{ type: "text" as const, text: m.content }] }))
}

/** The real reason a model call failed, for the screen. The AI SDK hides it behind "An error occurred." unless it is asked for it. */
export function errorText(error: unknown): string {
  if (error instanceof Error) {
    const body = (error as { responseBody?: unknown }).responseBody
    const detail = typeof body === "string" && body.trim() && !error.message.includes(body.slice(0, 40)) ? ` ${body.trim().slice(0, 300)}` : ""
    return `${error.message}${detail}`
  }
  return String(error)
}

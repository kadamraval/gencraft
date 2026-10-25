import { Chat, useChat } from "@ai-sdk/react"
import type { FileUIPart, UIMessage } from "ai"
import { Brain, Calculator, Check, Copy, Globe, RotateCcw, Search, Square, Trash2 } from "lucide-react"
import * as React from "react"
import { useSendQueue } from "@/components/agent/use-send-queue"
import { Attachment, AttachmentPreview, Attachments } from "@/components/ai-elements/attachments"
import { Conversation, ConversationContent, ConversationDownload, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Queue, QueueItem, QueueItemAction, QueueItemActions, QueueItemContent, QueueItemIndicator, QueueList, QueueSection, QueueSectionContent, QueueSectionLabel, QueueSectionTrigger } from "@/components/ai-elements/queue"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources"
import { Button } from "@/components/ui/button"
import { ErrorNotice } from "@/components/ui/error-notice"
import { Spinner } from "@/components/ui/spinner"
import { chatBridge } from "@/lib/agent/bridge"
import type { BridgeMessage } from "@/lib/agent/bridge"
import { explainError } from "@/lib/errors/explain"
import { ChatStreamTransport } from "@/lib/chat/stream"
import type { StreamDeps } from "@/lib/chat/stream"
import { tokenWords } from "@/lib/chat/usage"
import { useMoney } from "@/lib/currency/currency"
import type { TurnMeta } from "@/lib/chat/usage"
import type { ResolvedModelInfo } from "@/lib/agent/fallback-router"
import { TokenContext } from "./token-context"
import { FEED_BOTTOM_PAD } from "@/lib/ui/composer-dock"

/**
 * The chat: the reply streams in as it is written, reasoning folds away when done, pages the answer was built from are
 * listed, and every turn carries the whole conversation, so a follow-up knows what came before. Words written while a reply
 * is still coming wait their turn. Built on the AI SDK's chat state and AI Elements.
 */

interface Props {
  conversationId: string
  initialMessages: UIMessage[]
  /** The models to try, in order, and how to talk to each. Read each turn so a change in Settings applies at once. */
  deps: (modelId?: string) => StreamDeps<ResolvedModelInfo>
  /** For the error words: which provider and model were asked */
  context: () => { provider?: string; model?: string }
  onMessages: (messages: UIMessage[]) => void
  onBusy: (busy: boolean) => void
  onOpenSettings?: () => void
  /** The model's window, for the context meter */
  contextTokens?: number
  modelId?: string
}

type ToolPart = { type: string; state?: string; input?: Record<string, unknown>; output?: Record<string, unknown> }

/** One quiet line for a tool the model used: what it did and, once done, what it found */
function ToolNote({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "")
  const done = part.state === "output-available"
  const failed = part.state === "output-error" || (done && typeof part.output?.error === "string")
  const host = (u: unknown) => {
    try {
      return new URL(String(u)).hostname.replace(/^www./, "")
    } catch {
      return String(u ?? "")
    }
  }
  const view: Record<string, { icon: React.ElementType; text: string }> = {
    read_page: { icon: Globe, text: done && !failed ? `Read ${host(part.input?.url)}` : failed ? `Could not read ${host(part.input?.url)}` : `Reading ${host(part.input?.url)}` },
    web_search: { icon: Search, text: done && !failed ? `Searched the web for "${part.input?.query}"` : failed ? `Search failed for "${part.input?.query}"` : `Searching for "${part.input?.query}"` },
    calculate: { icon: Calculator, text: done && !failed ? `${part.input?.expression} = ${part.output?.result}` : failed ? "Could not calculate that" : "Calculating" },
    remember: { icon: Brain, text: done ? (part.output?.saved ? `Remembered: ${part.output.saved}` : "Did not save that") : "Remembering" },
    recall: { icon: Brain, text: "Checked what I remember" },
  }
  const v = view[name]
  if (!v) return null
  return (
    <div className={`flex items-center gap-2 text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>
      {done || failed ? <v.icon className="h-3.5 w-3.5 flex-shrink-0" /> : <Spinner />}
      <span className="min-w-0 truncate">{v.text}</span>
    </div>
  )
}

const textOf = (m: UIMessage) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")

/** What the person typed, when the model was sent more (a skill's method in front of it) */
const shownOf = (m: UIMessage) => ((m.metadata as TurnMeta | undefined)?.shown ?? textOf(m))

export function ChatWorkspace({ conversationId, initialMessages, deps, context, onMessages, onBusy, onOpenSettings, contextTokens, modelId }: Props) {
  const money = useMoney()
  const depsRef = React.useRef(deps)
  depsRef.current = deps
  const modelRef = React.useRef<string | undefined>(undefined)
  const chat = React.useMemo(
    () => new Chat<UIMessage>({ id: conversationId, messages: initialMessages, transport: new ChatStreamTransport<ResolvedModelInfo>(() => depsRef.current(modelRef.current)) }),
    [conversationId], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const { messages, status, error, sendMessage, regenerate, stop, clearError } = useChat<UIMessage>({ chat })
  const busy = status === "submitted" || status === "streaming"

  const deliver = React.useCallback(
    ({ text, shown, modelId: picked, files }: BridgeMessage) => {
      modelRef.current = picked
      clearError()
      const attached: FileUIPart[] = (files ?? []).map((f) => ({ type: "file", mediaType: f.mediaType, url: f.url, filename: f.filename }))
      void sendMessage({ text, files: attached.length > 0 ? attached : undefined, metadata: shown && shown !== text ? { shown } : undefined })
    },
    [sendMessage, clearError],
  )
  const { queue, push, remove } = useSendQueue<BridgeMessage>(busy, deliver)

  React.useEffect(() => {
    chatBridge.register(push)
    return () => chatBridge.unregister(push)
  }, [chat, push])

  // Saved when a turn ends, not on every streamed word
  React.useEffect(() => {
    if (status === "ready" || status === "error") onMessages(messages)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => onBusy(busy), [busy]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => () => onBusy(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const [copied, setCopied] = React.useState<string | null>(null)
  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(id)
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
  }

  const info = error ? explainError(error.message, context()) : undefined
  const lastId = messages[messages.length - 1]?.id

  return (
    <div className="ai-scope flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl select-text pt-12" style={FEED_BOTTOM_PAD}>
          {messages.map((m) => {
            if (m.role === "user") {
              const files = m.parts.filter((p): p is FileUIPart => p.type === "file")
              return (
                <Message key={m.id} from="user">
                  <MessageContent>
                    {files.length > 0 && (
                      <Attachments variant="grid">
                        {files.map((f, i) => (
                          <Attachment key={i} data={{ ...f, id: `${m.id}-${i}` }}>
                            <AttachmentPreview />
                          </Attachment>
                        ))}
                      </Attachments>
                    )}
                    <span className="whitespace-pre-wrap">{shownOf(m)}</span>
                  </MessageContent>
                </Message>
              )
            }
            const reply = textOf(m)
            const last = m.id === lastId
            const sources = m.parts.filter((p) => p.type === "source-url") as Array<{ type: "source-url"; sourceId: string; url: string; title?: string }>
            const meta = m.metadata as TurnMeta | undefined
            const tokens = meta?.usage?.totalTokens
            return (
              <Message key={m.id} from="assistant">
                <MessageContent className="gap-3">
                  {m.parts.map((p, i) => {
                    if (p.type === "reasoning") {
                      return (
                        <Reasoning key={i} isStreaming={p.state === "streaming" && last && busy}>
                          <ReasoningTrigger />
                          <ReasoningContent>{p.text}</ReasoningContent>
                        </Reasoning>
                      )
                    }
                    if (p.type.startsWith("tool-")) return <ToolNote key={i} part={p as unknown as ToolPart} />
                    return p.type === "text" ? <MessageResponse key={i}>{p.text}</MessageResponse> : null
                  })}
                  {meta?.switched && <p className="text-xs text-muted-foreground">{`Answered by ${meta.switched.to}, because ${meta.switched.from} could not.`}</p>}
                  {sources.length > 0 && (
                    <Sources>
                      <SourcesTrigger count={sources.length} />
                      <SourcesContent>
                        {sources.map((s) => (
                          <Source key={s.sourceId} href={s.url} title={s.title ?? s.url} />
                        ))}
                      </SourcesContent>
                    </Sources>
                  )}
                </MessageContent>
                {reply && !(last && busy) && (
                  <MessageActions>
                    <MessageAction tooltip={copied === m.id ? "Copied" : "Copy"} onClick={() => copy(m.id, reply)}>
                      {copied === m.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </MessageAction>
                    {last && (
                      <MessageAction tooltip="Answer again" onClick={() => void regenerate()}>
                        <RotateCcw className="size-3.5" />
                      </MessageAction>
                    )}
                    {tokens !== undefined && tokens > 0 && <span className="px-1 text-xs text-muted-foreground">{tokenWords(tokens)}{meta?.costUsd ? ` · ${money.token(meta.costUsd)}` : ""}</span>}
                  </MessageActions>
                )}
              </Message>
            )
          })}
          {busy && messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner /> Thinking...
            </div>
          )}
          {error && <ErrorNotice info={info} fallbackTitle="The reply failed" message={error.message} onOpenSettings={onOpenSettings} onRetry={() => void regenerate()} />}
          {queue.length > 0 && (
            <Queue>
              <QueueSection>
                <QueueSectionTrigger>
                  <QueueSectionLabel count={queue.length} label={queue.length === 1 ? "message waiting" : "messages waiting"} />
                </QueueSectionTrigger>
                <QueueSectionContent>
                  <QueueList>
                    {queue.map((q) => (
                      <QueueItem key={q.queueId}>
                        <div className="flex items-center gap-2">
                          <QueueItemIndicator />
                          <QueueItemContent>{q.shown ?? q.text}</QueueItemContent>
                          <QueueItemActions>
                            <QueueItemAction aria-label="Take it back" onClick={() => remove(q.queueId)}>
                              <Trash2 className="size-3" />
                            </QueueItemAction>
                          </QueueItemActions>
                        </div>
                      </QueueItem>
                    ))}
                  </QueueList>
                </QueueSectionContent>
              </QueueSection>
            </Queue>
          )}
        </ConversationContent>
        {messages.length > 0 && <ConversationDownload messages={messages} filename="chat.md" className="right-4 top-14" />}
        <ConversationScrollButton />
      </Conversation>
      <div className="pointer-events-none absolute right-4 top-3 z-10 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-background/90 px-1">
          <TokenContext messages={messages} maxTokens={contextTokens ?? 128_000} modelId={modelId} />
          {busy && (
            <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => void stop()}>
              <Square className="size-3" /> Stop
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

import { Chat } from "@ai-sdk/react"
import { simulateReadableStream } from "ai"
import type { LanguageModel, UIMessage } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { ChatStreamTransport, legacyToUi, streamChat } from "../src/lib/chat/stream"
import { tokenWords, totalTokens } from "../src/lib/chat/usage"
import type { StreamDeps } from "../src/lib/chat/stream"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } }
const speaks = (text: string, seen?: string[]) =>
  new MockLanguageModelV4({
    doStream: async (o) => {
      seen?.push(JSON.stringify(o.prompt))
      const chunks = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, ...text.split(" ").map((w, i, a) => ({ type: "text-delta", id: "t", delta: i < a.length - 1 ? `${w} ` : w })), { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }]
      return { stream: simulateReadableStream({ chunks: chunks as never }) } as never
    },
  })
const fails_ = (message: string) =>
  new MockLanguageModelV4({
    doStream: async () => {
      throw new Error(message)
    },
  })

type Candidate = { id: string; lm: LanguageModel | null; text?: string }

function deps(candidates: Candidate[], tried: string[] = []): StreamDeps<Candidate> {
  return {
    chain: async (execute) => {
      let last: unknown
      for (const [i, c] of candidates.entries()) {
        try {
          tried.push(c.id)
          return await execute(c, i)
        } catch (e) {
          last = e
        }
      }
      throw last
    },
    languageModel: (c) => c.lm,
    plain: async (c) => c.text ?? "",
  }
}

const read = async (stream: ReadableStream<{ type: string; delta?: string }>) => {
  let text = ""
  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return text
    if (value.type === "text-delta") text += value.delta
  }
}

// The reply streams in, in several pieces
{
  const stream = await streamChat(deps([{ id: "a", lm: speaks("The knight rides at dawn") }]), [{ role: "user", content: "Tell me" }])
  const pieces: string[] = []
  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value.type === "text-delta") pieces.push(value.delta)
  }
  check("stream: the reply arrives in pieces", pieces.length > 1 && pieces.join("") === "The knight rides at dawn")
}

// A model that fails before it speaks hands over to the next
{
  const tried: string[] = []
  const stream = await streamChat(deps([{ id: "busy", lm: fails_("The provider is busy") }, { id: "ok", lm: speaks("Second model here") }], tried), [{ role: "user", content: "Hi" }])
  check("fallback: the next model answers when the first fails", tried.join() === "busy,ok" && (await read(stream as never)) === "Second model here")
}

// Every model failing says why
{
  let message = ""
  try {
    await streamChat(deps([{ id: "a", lm: fails_("No credit left") }, { id: "b", lm: fails_("Key rejected") }]), [{ role: "user", content: "Hi" }])
  } catch (e) {
    message = e instanceof Error ? e.message : ""
  }
  check("fallback: when all fail, the last reason is raised", /Key rejected/.test(message), message)
}

// A model with no AI SDK provider answers in one piece, with the conversation in front of it
{
  let prompt = ""
  const d: StreamDeps<Candidate> = { ...deps([{ id: "rep", lm: null }]), plain: async (_c, p) => ((prompt = p), "Plain answer") }
  const stream = await streamChat(d, [{ role: "user", content: "First" }, { role: "assistant", content: "Reply one" }, { role: "user", content: "Second" }])
  check("plain: answered in one piece", (await read(stream as never)) === "Plain answer")
  check("plain: the whole conversation goes with it", prompt.includes("User: First") && prompt.includes("Assistant: Reply one") && prompt.includes("User: Second"), prompt)
}

// The chat state: memory across turns, streamed text, and a saved conversation that carries on
{
  const seen: string[] = []
  const transport = new ChatStreamTransport<Candidate>(() => deps([{ id: "a", lm: speaks("Noted", seen) }]))
  const chat = new Chat<UIMessage>({ id: "c1", transport })
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 20))
      if (chat.status === "ready" || chat.status === "error") return
    }
  }
  await chat.sendMessage({ text: "My name is Ada" })
  await settle()
  await chat.sendMessage({ text: "What is my name?" })
  await settle()
  check("chat: the second turn carries the first", seen.length === 2 && seen[1]!.includes("My name is Ada") && seen[1]!.includes("Noted"))
  check("chat: four messages, the replies are text", chat.messages.length === 4 && chat.messages[3]!.parts.some((p) => p.type === "text"))

  const saved = chat.messages
  const again = new Chat<UIMessage>({ id: "c1b", messages: saved, transport })
  await again.sendMessage({ text: "And now?" })
  for (let i = 0; i < 100 && again.status !== "ready"; i++) await new Promise((r) => setTimeout(r, 20))
  check("chat: a saved conversation continues with its past", seen[2]!.includes("My name is Ada") && again.messages.length === 6)
}

// Each reply carries what it used, and sources the provider found come through
{
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const chunks = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Found it." },
        { type: "text-end", id: "t" },
        { type: "source", sourceType: "url", id: "s1", url: "https://example.com/a", title: "Example A" },
        { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: { inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 30, text: 30, reasoning: undefined } } },
      ]
      return { stream: simulateReadableStream({ chunks: chunks as never }) } as never
    },
  })
  const chat = new Chat<UIMessage>({ id: "c3", transport: new ChatStreamTransport<Candidate>(() => deps([{ id: "a", lm: model }])) })
  await chat.sendMessage({ text: "Search please" })
  for (let i = 0; i < 100 && chat.status !== "ready"; i++) await new Promise((r) => setTimeout(r, 20))
  const reply = chat.messages[1]!
  const meta = reply.metadata as { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } | undefined
  check("usage: the reply carries its tokens", meta?.usage?.inputTokens === 120 && meta.usage.outputTokens === 30 && meta.usage.totalTokens === 150, JSON.stringify(meta))
  check("usage: a conversation adds its replies up", totalTokens(chat.messages).totalTokens === 150)
  check("sources: a found source is a part of the reply", reply.parts.some((p) => p.type === "source-url" && (p as { url: string }).url === "https://example.com/a"))
  check("usage: words for a count", tokenWords(950) === "950 tokens" && tokenWords(1500) === "1.5K tokens" && tokenWords(42000) === "42K tokens")
}

// A picture attached to a message reaches the model as an image, and stays on the message
{
  const seen: string[] = []
  const chat = new Chat<UIMessage>({ id: "c4", transport: new ChatStreamTransport<Candidate>(() => deps([{ id: "a", lm: speaks("A cat.", seen) }])) })
  await chat.sendMessage({ text: "What is this?", files: [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,iVBORw0KGgo=", filename: "cat.png" }] })
  for (let i = 0; i < 100 && chat.status !== "ready"; i++) await new Promise((r) => setTimeout(r, 20))
  check("attach: the model receives the picture and the question", seen.length === 1 && seen[0]!.includes("image/png") && seen[0]!.includes("What is this?"), seen[0]?.slice(0, 300))
  check("attach: the picture stays on the person's message", chat.messages[0]!.parts.some((p) => p.type === "file"))
}

// Old reasoning and tool traffic is trimmed from what a long conversation sends
{
  const seen: string[] = []
  const model = speaks("ok", seen)
  const long = [
    { role: "user", content: "one" },
    { role: "assistant", content: [{ type: "reasoning", text: "SECRET OLD THOUGHT" }, { type: "text", text: "reply one" }] },
    { role: "user", content: "two" },
  ] as never
  await streamChat(deps([{ id: "a", lm: model }]), long)
  check("prune: an old reasoning block is not sent again", seen.length === 1 && !seen[0]!.includes("SECRET OLD THOUGHT") && seen[0]!.includes("reply one"))
}

// A failure with nothing said reaches the chat as an error
{
  const chat = new Chat<UIMessage>({ id: "c2", transport: new ChatStreamTransport<Candidate>(() => deps([{ id: "x", lm: fails_("Key rejected") }])) })
  await chat.sendMessage({ text: "Hi" })
  for (let i = 0; i < 100 && chat.status !== "error"; i++) await new Promise((r) => setTimeout(r, 20))
  check("chat: a failure is shown as an error, not an empty reply", chat.status === "error" && /Key rejected/.test(chat.error?.message ?? ""))
}

// Older conversations
check("legacy: a plain text conversation carries over", JSON.stringify(legacyToUi([{ id: "1", role: "user", content: "Hi" }, { id: "2", role: "assistant", content: "Hello" }])?.map((m) => `${m.role}:${(m.parts[0] as { text: string }).text}`)) === JSON.stringify(["user:Hi", "assistant:Hello"]))
check("legacy: one with media or steps stays as it was", legacyToUi([{ id: "1", role: "assistant", content: "", steps: [] }]) === null && legacyToUi([{ id: "1", role: "assistant", content: "", job: {} }]) === null)

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
process.exit(fails ? 1 : 0)

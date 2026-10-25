import { Chat } from "@ai-sdk/react"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { continueWhenAnswered, stoppedEarly, StudioTransport, waitingOnModel } from "../src/lib/agent/chat"
import type { AgentRuntime, StudioUIMessage } from "../src/lib/agent/chat"
import type { Brief } from "../src/lib/apps/blocks"
import type { AppSpec } from "../src/lib/apps/types"
import type { ModelRecord } from "../src/lib/registry/types"

/**
 * The whole app-building conversation, end to end, with a model that follows a script: the agent talks, asks, the person answers
 * (by tapping an option or by writing), the agent writes the brief, picks blocks, shows the plan, the person accepts, it drafts
 * and saves. Every answer must carry the run on. This is the flow the person uses in Apps, Create new.
 */

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}

type Call = { name: string; input: unknown; id: string }
type Turn = { text?: string; calls?: Call[] }
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } }

function scripted(turns: Turn[], seen: string[] = []) {
  let i = 0
  return new MockLanguageModelV4({
    doStream: async (o) => {
      seen.push(JSON.stringify(o.prompt))
      const t = turns[Math.min(i++, turns.length - 1)]!
      const chunks: Array<Record<string, unknown>> = [{ type: "stream-start", warnings: [] }]
      if (t.text) chunks.push({ type: "text-start", id: `t${i}` }, { type: "text-delta", id: `t${i}`, delta: t.text }, { type: "text-end", id: `t${i}` })
      for (const c of t.calls ?? []) chunks.push({ type: "tool-call", toolCallId: c.id, toolName: c.name, input: JSON.stringify(c.input) })
      chunks.push({ type: "finish", finishReason: { unified: (t.calls?.length ?? 0) > 0 ? "tool-calls" : "stop", raw: undefined }, usage })
      return { stream: simulateReadableStream({ chunks: chunks as never }) } as never
    },
  })
}

const rec = (id: string, modality: "image" | "video" | "audio" | "text", inputs: Array<"text" | "image">, props: ModelRecord["params"]["properties"]): ModelRecord =>
  ({ id, endpoint: id, provider: "fal", name: id, family: "x", logoKey: "x", modality, inputs, params: { type: "object", properties: props }, price: { unit: "per_image", amount: 0.04, source: "api", fetchedAt: "" }, status: "active" }) as ModelRecord
const multi = rec("fal/multi", "image", ["text", "image"], { image_urls: { type: "array", slot: { role: "reference", kind: "image", list: true, max: 3 } } as never })
const pool = [multi]

const settle = async (chat: Chat<StudioUIMessage>) => {
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 20))
    if (chat.status === "ready" || chat.status === "error") return
  }
}
const quiet = async (chat: Chat<StudioUIMessage>) => {
  await new Promise((r) => setTimeout(r, 250))
  await settle(chat)
  await new Promise((r) => setTimeout(r, 250))
  await settle(chat)
}
const toolParts = (chat: Chat<StudioUIMessage>) => chat.messages.flatMap((m) => m.parts).filter((p) => p.type.startsWith("tool-")) as Array<{ type: string; state: string; toolCallId: string; approval?: { id: string }; output?: unknown }>
const part = (chat: Chat<StudioUIMessage>, type: string, id?: string) => toolParts(chat).find((p) => p.type === type && (!id || p.toolCallId === id))

const brief: Brief = { makes: [{ kind: "image" }], gives: [{ label: "Character", kind: "character" }, { label: "Reference", kind: "picture" }] }
const recipe = {
  name: "Character swap",
  icon: "user",
  color: "violet",
  description: "Turn your character into the one in the reference.",
  inputs: [
    { id: "character", label: "Character", type: "image", kind: "character", icon: "user", required: true },
    { id: "reference", label: "Reference", type: "image", icon: "image", required: true },
  ],
  steps: [{ id: "swap", title: "Making the picture", kind: "image", model: "fal/multi", references: ["character", "reference"], prompt: "Redraw {character} in the look of {reference}." }],
}

function build(turns: Turn[], seen: string[] = []) {
  let draft: AppSpec | undefined
  let currentBrief: Brief | undefined
  let saved: AppSpec | undefined
  const model = scripted(turns, seen)
  const runtime = (): AgentRuntime => ({
    model,
    env: {
      generate: async () => ({ assetIds: [], costUsd: 0 }),
      estimate: () => 0,
      skills: [],
      limits: { budgetUsd: 2, autoApproveUsd: 0.5, maxGenerations: 6 },
      requirePlanApproval: false,
      apps: {
        meta: { name: "Character swap", icon: "user", color: "violet" },
        registry: { get: (id: string) => pool.find((r) => r.id === id), listed: () => pool },
        models: () => pool,
        draft: () => draft,
        setDraft: (s) => void (draft = s),
        save: (s) => (saved = s),
        brief: () => currentBrief,
        setBrief: (b) => void (currentBrief = b),
      },
    },
  })
  const chat = new Chat<StudioUIMessage>({ id: `flow-${Math.random()}`, transport: new StudioTransport(runtime), sendAutomaticallyWhen: continueWhenAnswered })
  return { chat, saved: () => saved }
}

const ask = (id: string, question: string) => ({ name: "ask_user", id, input: { question, options: ["A", "B"] } })

// 1. the plain flow: two questions, each answered by tapping, then brief, blocks, plan, draft, save
{
  const { chat, saved } = build([
    { text: "You give me a character and a reference, and I make one picture.", calls: [ask("q1", "How many pictures will you give?")] },
    { calls: [ask("q2", "Fixed style or chosen each time?")] },
    { calls: [{ name: "find_models", id: "f1", input: { kind: "image" } }] },
    { calls: [{ name: "set_brief", id: "b1", input: brief }] },
    { calls: [{ name: "suggest_blocks", id: "s1", input: { model: "fal/multi" } }] },
    { calls: [{ name: "propose_plan", id: "p1", input: { summary: "A character and a reference in, one picture out.", steps: [{ title: "Make the picture", kind: "image" }] } }] },
    { calls: [{ name: "draft_app", id: "d1", input: { app: JSON.stringify(recipe) } }] },
    { calls: [{ name: "finish_app", id: "z1", input: {} }] },
    { text: "Your app is built." },
  ])
  await chat.sendMessage({ text: "I upload a character and a reference and want my character turned into the reference." })
  await settle(chat)
  check("flow: the first question is shown and waits", part(chat, "tool-ask_user", "q1")?.state === "input-available")
  await chat.addToolOutput({ tool: "ask_user", toolCallId: "q1", output: "Two" } as never)
  await quiet(chat)
  check("flow: after the first answer the agent asks the second question", part(chat, "tool-ask_user", "q2")?.state === "input-available", JSON.stringify(toolParts(chat).map((p) => `${p.type}:${p.state}`)))
  await chat.addToolOutput({ tool: "ask_user", toolCallId: "q2", output: "Chosen each time" } as never)
  await quiet(chat)
  const plan = part(chat, "tool-propose_plan")
  check("flow: after the second answer it goes on to the plan and waits for approval", plan?.state === "approval-requested", JSON.stringify(toolParts(chat).map((p) => `${p.type}:${p.state}`)))
  await chat.addToolApprovalResponse({ id: plan!.approval!.id, approved: true })
  await quiet(chat)
  check("flow: after approval it drafts, saves and says it is built", saved()?.name === "Character swap" && chat.messages[chat.messages.length - 1]!.parts.some((p) => p.type === "text" && (p as { text: string }).text === "Your app is built."), JSON.stringify(toolParts(chat).map((p) => `${p.type}:${p.state}`)))
}

// 2. the model asks and calls another tool in the same step: the answer must still carry the run on
{
  const { chat } = build([
    { text: "Let me look.", calls: [{ name: "find_models", id: "f1", input: { kind: "image" } }, ask("q1", "Picture or video?")] },
    { text: "Picture it is." },
  ])
  await chat.sendMessage({ text: "Make an app" })
  await settle(chat)
  await chat.addToolOutput({ tool: "ask_user", toolCallId: "q1", output: "Picture" } as never)
  await quiet(chat)
  check("same step: the answer carries the run on", chat.messages[chat.messages.length - 1]!.parts.some((p) => p.type === "text" && (p as { text: string }).text === "Picture it is."), JSON.stringify(chat.messages.map((m) => m.parts.map((p) => p.type))))
}

// 3. the agent sees what was answered
{
  const seen: string[] = []
  const { chat } = build([{ calls: [ask("q1", "How many pictures?")] }, { text: "Two, got it." }], seen)
  await chat.sendMessage({ text: "Make an app" })
  await settle(chat)
  await chat.addToolOutput({ tool: "ask_user", toolCallId: "q1", output: "Exactly two" } as never)
  await quiet(chat)
  check("answer: the next model call carries what the person answered", seen.length >= 2 && seen[seen.length - 1]!.includes("Exactly two"))
}

// 4. a refused draft goes back to the agent and it fixes it
{
  const { chat, saved } = build([
    { calls: [{ name: "set_brief", id: "b1", input: brief }] },
    { calls: [{ name: "draft_app", id: "d1", input: { app: JSON.stringify({ ...recipe, inputs: [recipe.inputs[0]!] }) } }] },
    { calls: [{ name: "draft_app", id: "d2", input: { app: JSON.stringify(recipe) } }] },
    { calls: [{ name: "finish_app", id: "z1", input: {} }] },
    { text: "Done." },
  ])
  await chat.sendMessage({ text: "Build it" })
  await quiet(chat)
  const d1 = part(chat, "tool-draft_app", "d1")?.output as { ok?: boolean; problems?: string[] } | undefined
  check("fix: a draft that leaves out a block is sent back with the reason", d1?.ok === false && Boolean(d1.problems?.some((p) => /Reference/.test(p))), JSON.stringify(d1))
  check("fix: the corrected draft is saved", saved()?.name === "Character swap")
}

// 5. a model that ends its turn empty after the answer: the screen can tell, and going on works
{
  const { chat } = build([{ calls: [ask("q1", "How many pictures?")] }, {}, { text: "Two pictures, understood." }])
  await chat.sendMessage({ text: "Make an app" })
  await settle(chat)
  check("empty: a question that waits is not a stop", stoppedEarly(chat.messages as never) === false)
  await chat.addToolOutput({ tool: "ask_user", toolCallId: "q1", output: "Two" } as never)
  await quiet(chat)
  check("empty: the run ended with nothing said after the answer, and the screen can tell", stoppedEarly(chat.messages as never) === true, JSON.stringify(chat.messages.map((m) => m.parts.map((p) => p.type + ":" + ((p as { state?: string }).state ?? "")))))
  await chat.sendMessage({ text: "Please continue where you stopped." })
  await quiet(chat)
  check("empty: after Continue the agent answers and it is no longer a stop", stoppedEarly(chat.messages as never) === false && chat.messages.some((m) => m.parts.some((p) => p.type === "text" && (p as { text: string }).text === "Two pictures, understood.")))
}
check("a finished app is not a stop", stoppedEarly([{ role: "assistant", parts: [{ type: "step-start" }, { type: "tool-finish_app", state: "output-available", output: { saved: true } }] }]) === false)
check("a result with nothing said after it is a stop", stoppedEarly([{ role: "assistant", parts: [{ type: "tool-generate_image", state: "output-available" }] }]) === true)
check("a reply that ends in words is not a stop", stoppedEarly([{ role: "assistant", parts: [{ type: "tool-find_models", state: "output-available" }, { type: "text", text: "Done." }] }]) === false)

// 6. right after the answer the screen has something moving to show
{
  const { chat } = build([{ calls: [ask("q1", "How many pictures?")] }, { text: "Two pictures, understood." }])
  await chat.sendMessage({ text: "Make an app" })
  await settle(chat)
  check("thinking: nothing is shown moving while a question waits", waitingOnModel(chat.messages as never) === false)
  void chat.addToolOutput({ tool: "ask_user", toolCallId: "q1", output: "Two" } as never)
  await new Promise((r) => setTimeout(r, 5))
  check("thinking: right after the answer the run is going and the screen shows the thinking line", (chat.status === "submitted" || chat.status === "streaming") && waitingOnModel(chat.messages as never) === true, chat.status)
  await quiet(chat)
  check("thinking: once the reply is words it is not shown", waitingOnModel(chat.messages as never) === false)
}
check("thinking: a finished tool with nothing after it shows the thinking line", waitingOnModel([{ role: "assistant", parts: [{ type: "step-start" }, { type: "tool-find_models", state: "output-available" }] }]) === true)
check("thinking: a tool that is still running shows its own progress instead", waitingOnModel([{ role: "assistant", parts: [{ type: "tool-find_models", state: "input-available" }] }]) === false)
check("thinking: the person's own message shows it", waitingOnModel([{ role: "user", parts: [] }]) === true)

console.log(fails === 0 ? "all passed" : `${fails} failed`)
process.exit(fails === 0 ? 0 : 1)

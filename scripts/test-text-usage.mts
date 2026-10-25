import { generateText, simulateReadableStream, streamText } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { ledgerFromMessages } from "../src/lib/agent/policy"
import { costFromUsage, ratesOf, recordText, recordTextEstimate, tokensFromText, withUsage } from "../src/lib/ledger/text-usage"
import type { Meter } from "../src/lib/ledger/text-usage"
import { usageLedger } from "../src/lib/ledger/usage-store"
import type { ModelRecord } from "../src/lib/registry/types"

/**
 * Text is counted where its tokens are known, once per call, at the model's own price. These checks use no provider: a scripted
 * model reports tokens the way the AI SDK's models do.
 */

let fails = 0
const check = (name: string, ok: boolean, extra: unknown = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : JSON.stringify(extra)}`)
  if (!ok) fails++
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

const rec = (id: string, price: ModelRecord["price"]): ModelRecord =>
  ({ id, endpoint: id, provider: "openai", name: id, family: "x", logoKey: "x", modality: "text", inputs: ["text"], params: { type: "object", properties: {} }, price, status: "active" }) as ModelRecord
const priced = rec("openai/gpt-x", { unit: "per_1m_tokens", amount: 2.5, outputAmount: 10, cachedAmount: 1.25, source: "scraped", fetchedAt: "" })
const noCachedRate = rec("openai/gpt-y", { unit: "per_1m_tokens", amount: 2.5, outputAmount: 10, source: "scraped", fetchedAt: "" })
const unpriced = rec("openai/gpt-z", { unit: "unknown", amount: null, source: "estimate", fetchedAt: "" })
const usage = (input: number, cacheRead: number, output: number, reasoning = 0) => ({
  inputTokens: { total: input, noCache: input - cacheRead, cacheRead, cacheWrite: 0 },
  outputTokens: { total: output, text: output - reasoning, reasoning },
})
let mark = 0
/** The entries written since the last clear (newest first) */
const items = () => usageLedger.getAllItems().slice(0, usageLedger.getAllItems().length - mark)
const clear = () => void (mark = usageLedger.getAllItems().length)

// the sum
check("the price of a call is each kind of token at its own rate", near(costFromUsage(usage(1000, 600, 500), ratesOf(priced)!).usd, (400 * 2.5 + 600 * 1.25 + 500 * 10) / 1e6))
check("cached tokens cost the normal input rate when the model has no cheaper one (never counted as less than they are)", near(costFromUsage(usage(1000, 600, 500), ratesOf(noCachedRate)!).usd, (1000 * 2.5 + 500 * 10) / 1e6))
check("reasoning tokens are part of the output and are counted once", near(costFromUsage(usage(100, 0, 500, 300), ratesOf(priced)!).usd, (100 * 2.5 + 500 * 10) / 1e6))
check("only a per-million-token price is a token price", ratesOf(unpriced) === null && ratesOf({ price: { unit: "per_image", amount: 0.04 } }) === null)
check("about four letters make a token", tokensFromText("abcdefgh") === 2 && tokensFromText("abcdefghi") === 3)

// a counted model: generate
{
  clear()
  const meter: Meter = { usd: 0, tokens: 0 }
  const inner = new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: "Hello there." }], finishReason: { unified: "stop", raw: undefined }, usage: usage(1000, 600, 500), warnings: [] }) as never,
  })
  await generateText({ model: withUsage(inner, priced, { label: "Agent", meter }), prompt: "Say hello" })
  const all = items()
  check("one call writes exactly one entry", all.length === 1, all.length)
  check("the entry has the model, the label, the real tokens and the computed cost", all[0]?.modelName === "openai/gpt-x" && all[0]?.category === "text" && all[0]?.feature === "openai/gpt-x (Agent)" && all[0]?.specs === "1000 in · 500 out tokens" && near(all[0]!.costUsd, 0.00675) && all[0]?.basis === "computed", all[0])
  check("the turn's meter holds the same cost and tokens", near(meter.usd, 0.00675) && meter.tokens === 1500, meter)
}

// a counted model: stream (the chat and the agent)
{
  clear()
  const chunks = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Hi" }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: usage(2000, 0, 100) }]
  const inner = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: chunks as never }) }) as never })
  const result = streamText({ model: withUsage(inner, priced, { label: "Chat" }), prompt: "Hi" })
  await result.text
  check("a streamed reply is counted once, when it finishes", items().length === 1 && near(items()[0]!.costUsd, (2000 * 2.5 + 100 * 10) / 1e6) && items()[0]?.feature === "openai/gpt-x (Chat)", items())
}

// the agent's several calls in one turn add up in one meter
{
  clear()
  const meter: Meter = { usd: 0, tokens: 0 }
  const inner = new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: "text", text: "ok" }], finishReason: { unified: "stop", raw: undefined }, usage: usage(1000, 0, 100), warnings: [] }) as never })
  const model = withUsage(inner, priced, { label: "Agent", meter })
  await generateText({ model, prompt: "one" })
  await generateText({ model, prompt: "two" })
  check("two calls make two entries and one total", items().length === 2 && near(meter.usd, 2 * (1000 * 2.5 + 100 * 10) / 1e6) && meter.tokens === 2200, { n: items().length, meter })
}

// a model that reports no tokens is estimated from its words, and says so
{
  clear()
  const inner = new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: "text", text: "abcdefgh".repeat(50) }], finishReason: { unified: "stop", raw: undefined }, usage: { inputTokens: { total: undefined }, outputTokens: { total: undefined } }, warnings: [] }) as never })
  await generateText({ model: withUsage(inner, priced, { label: "Agent" }), prompt: "x".repeat(400) })
  check("with no tokens reported, the call is estimated from the words and marked estimated", items().length === 1 && items()[0]?.basis === "estimated" && items()[0]!.costUsd > 0, items()[0])
}

// a model with no price still shows its tokens
{
  clear()
  recordText(unpriced, usage(100, 0, 50), { label: "Chat", basis: "computed" })
  check("a model with no price is listed with its tokens, at no cost, and marked unpriced", items().length === 1 && items()[0]?.costUsd === 0 && items()[0]?.basis === "unpriced" && items()[0]?.specs === "100 in · 50 out tokens", items()[0])
  clear()
  recordTextEstimate(priced, "a".repeat(40), "b".repeat(80), "Story script")
  check("plain words with no token counts are estimated", items()[0]?.basis === "estimated" && items()[0]?.specs === "10 in · 20 out tokens" && near(items()[0]!.costUsd, (10 * 2.5 + 20 * 10) / 1e6), items()[0])
  clear()
  check("an empty call writes nothing", recordText(priced, usage(0, 0, 0), { label: "Chat", basis: "computed" }) === 0 && items().length === 0)
}

// the agent's budget includes its text
check("the agent's spend is the results it made and the text it used", near(ledgerFromMessages([{ role: "assistant", metadata: { costUsd: 0.01 }, parts: [{ type: "tool-generate_image", state: "output-available", output: { costUsd: 0.04 } }] }, { role: "assistant", metadata: { costUsd: 0.005 }, parts: [] }] as never).spentUsd, 0.055))
check("a conversation with no text cost saved still counts its results", near(ledgerFromMessages([{ parts: [{ type: "tool-generate_image", state: "output-available", output: { costUsd: 0.04 } }] }]).spentUsd, 0.04))

console.log(fails === 0 ? "all passed" : `${fails} failed`)
process.exit(fails === 0 ? 0 : 1)

import { generateText, isStepCount, tool } from "ai"
import { z } from "zod"
import { flattenPrompt, parseReply, textToolsModel, toolsPreamble } from "../src/lib/agent/text-tools"
import { needsTextTools } from "../src/lib/agent/model"
import { parseResults } from "../src/lib/brain/search"

let failed = 0
let passed = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++
  else {
    failed++
    console.error(`FAIL ${name}`, detail ?? "")
  }
}
void parseResults

// which models get tools in plain words
check("replicate always uses plain-words tools", needsTextTools({ provider: "replicate" }))
check("openai uses native tools", !needsTextTools({ provider: "openai" }))
check("gemini uses native tools", !needsTextTools({ provider: "gemini" }))
check("fal with a tools flag is native", !needsTextTools({ provider: "fal", tools: true }))
check("fal without tools falls back", needsTextTools({ provider: "fal", tools: false }))
check("openrouter without tools falls back", needsTextTools({ provider: "openrouter", tools: false }))
check("openrouter unknown stays native", !needsTextTools({ provider: "openrouter" }))

// reading a reply
const names = ["calculate", "read_page"]
const one = parseReply('{"calls":[{"tool":"calculate","input":{"expression":"2+3"}}]}', names)
check("parses a calls list", one.kind === "calls" && one.calls[0]!.tool === "calculate" && one.calls[0]!.input.expression === "2+3", one)
const fenced = parseReply('Let me check.\n```json\n{"tool":"read_page","input":{"url":"https://a.com"}}\n```', names)
check("parses a fenced single call and keeps the lead-in", fenced.kind === "calls" && fenced.calls[0]!.tool === "read_page" && fenced.before === "Let me check.", fenced)
const two = parseReply('{"calls":[{"tool":"calculate","input":{"expression":"1"}},{"tool":"read_page","input":{"url":"x"}}]}', names)
check("parses several calls", two.kind === "calls" && two.calls.length === 2, two)
check("plain text is an answer", parseReply("The answer is 5.", names).kind === "text")
check("a json answer that is not a tool call is text", parseReply('Here is data: {"price": 5}', names).kind === "text")
check("unknown tool is broken", parseReply('{"calls":[{"tool":"launch_missiles","input":{}}]}', names).kind === "broken")
check("invalid json that tried to call is broken", parseReply('{"calls":[{"tool":"calculate","input":{"expression":}}]}', names).kind === "broken")
check("braces inside strings are handled", parseReply('{"calls":[{"tool":"calculate","input":{"expression":"{1}+2"}}]}', names).kind === "calls")

// writing a conversation as text
const flat = flattenPrompt([
  { role: "system", content: "Be brief." },
  { role: "user", content: [{ type: "text", text: "What is 2+3?" }] },
  { role: "assistant", content: [{ type: "tool-call", toolCallId: "1", toolName: "calculate", input: { expression: "2+3" } }] },
  { role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "calculate", output: { type: "json", value: { result: 5 } } }] },
])
check("system text kept apart", flat.system === "Be brief.")
check("transcript has the user, the call and the result", flat.transcript.includes("User: What is 2+3?") && flat.transcript.includes('{"calls":[{"tool":"calculate","input":{"expression":"2+3"}}]}') && flat.transcript.includes('[Tool result for calculate]: {"result":5}'), flat.transcript)
check("earlier calls are written as JSON, not as prose to copy", !flat.transcript.includes("You called the tool"), flat.transcript)
check("a lone user message is sent as it is", flattenPrompt([{ role: "user", content: [{ type: "text", text: "hi" }] }]).transcript === "hi")
check("preamble lists the tools", toolsPreamble([{ type: "function", name: "calculate", description: "Do sums", inputSchema: { type: "object", properties: { expression: { type: "string" } } } }]).includes("- calculate: Do sums"))

// a stand-in model that only reads a prompt and answers in text
const scripted = (replies: string[], seen: string[] = []) => {
  let i = 0
  const answer = async (options: { prompt: unknown }) => {
    seen.push(JSON.stringify(options.prompt))
    const text = replies[Math.min(i++, replies.length - 1)]!
    return { content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] }
  }
  return { specificationVersion: "v4", provider: "stub", modelId: "stub", supportedUrls: {}, doGenerate: answer, doStream: async () => { throw new Error("not used") } } as never
}

// the real AI SDK loop, with the tool called through plain text
const seen: string[] = []
const wrapped = textToolsModel(scripted(['{"calls":[{"tool":"add","input":{"a":2,"b":3}}]}', "The answer is 5."], seen))
let ran = 0
const add = tool({ description: "Add two numbers", inputSchema: z.object({ a: z.number(), b: z.number() }), execute: async ({ a, b }) => (ran++, { sum: a + b }) })
const loop = await generateText({ model: wrapped, tools: { add }, stopWhen: isStepCount(5), prompt: "What is 2 plus 3?" })
check("the agent loop ran the tool once", ran === 1, ran)
check("the final answer came back", loop.text === "The answer is 5.", loop.text)
check("two model calls were made", loop.steps.length === 2, loop.steps.length)
check("the second call carried the tool result as text", seen[1]!.includes("Tool result for add") && seen[1]!.includes('{\\"sum\\":5}') || seen[1]!.includes("sum"), seen[1])
check("the first call told the model about the tool", seen[0]!.includes("- add: Add two numbers"), seen[0])

// a broken first attempt is asked for again once
const retrySeen: string[] = []
const retried = textToolsModel(scripted(['{"calls":[{"tool":"add","input":{"a":2,"b":}}]}', '{"calls":[{"tool":"add","input":{"a":1,"b":1}}]}', "Two."], retrySeen))
ran = 0
const r2 = await generateText({ model: retried, tools: { add }, stopWhen: isStepCount(5), prompt: "1 plus 1?" })
check("a broken reply is repaired with one more ask", ran === 1 && r2.text === "Two.", { ran, text: r2.text })
check("the repair ask says what was wrong", retrySeen[1]!.includes("not valid JSON"), retrySeen[1])

// no tools offered: passes straight through as a normal chat
const plain = textToolsModel(scripted(["Hello there."]))
const hello = await generateText({ model: plain, prompt: "hi" })
check("without tools it is a plain chat", hello.text === "Hello there.", hello.text)

// streaming: the stream of a tool call and of a text answer
const streamed = textToolsModel(scripted(['{"calls":[{"tool":"add","input":{"a":4,"b":4}}]}', "Eight."]))
ran = 0
const { streamText } = await import("ai")
const s = streamText({ model: streamed, tools: { add }, stopWhen: isStepCount(5), prompt: "4 plus 4?" })
let streamedText = ""
for await (const part of s.textStream) streamedText += part
check("streaming runs the tool and streams the answer", ran === 1 && streamedText === "Eight.", { ran, streamedText })

// error wording: the service that answered, not the model's name
const { explainError } = await import("../src/lib/errors/explain")
const lowCredit = explainError('Fallback sequence exhausted for text. Attempted 1 models (Gemini 3.5 Flash): Replicate could not start the run (HTTP 429): {"detail":"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests while you have less than $5.0 in credit.","status":429,"retry_after":7} Request sent to google/gemini-3.5-flash: prompt="x"', { provider: "gemini", model: "Gemini 3.5 Flash" })
check("a Replicate throttle is blamed on Replicate, not Gemini", lowCredit.title.startsWith("Replicate") && !lowCredit.title.includes("Gemini"), lowCredit.title)
check("the low-credit limit says how to fix it", lowCredit.hint?.includes("$5") === true, lowCredit.hint)
check("a real Gemini error still names Gemini", explainError("Gemini API Error (HTTP 429): quota exceeded", { provider: "gemini" }).title.includes("Gemini"))

// Replicate: a throttled start waits for retry_after and asks again
const { runReplicate } = await import("../src/lib/registry/adapters/replicate")
let starts = 0
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } })
const call = async (path: string) => {
  if (path.includes("/predictions") && !path.includes("/v1/predictions/")) {
    starts++
    return starts === 1 ? json({ detail: "throttled", status: 429, retry_after: 0 }, 429) : json({ id: "p1", status: "succeeded", output: ["Hel", "lo"] })
  }
  return json({})
}
const started = Date.now()
const out = await runReplicate({ call: call as never, token: "r8_x", model: "meta/x", input: { prompt: "hi" } })
check("Replicate throttle is retried and then succeeds", starts === 2 && out.text === "Hello", { starts, text: out.text })
check("the retry waited a moment", Date.now() - started >= 900, Date.now() - started)
let alwaysStarts = 0
const always = async () => (alwaysStarts++, json({ detail: "throttled", retry_after: 0 }, 429))
let gaveUp = ""
try {
  await runReplicate({ call: always as never, token: "r8_x", model: "meta/x", input: {} })
} catch (e) {
  gaveUp = (e as Error).message
}
check("it gives up after three retries with the real error", alwaysStarts === 4 && gaveUp.includes("429"), { alwaysStarts, gaveUp })

// leaked history: the exact text from the screenshot is cleaned out of an answer
const { stripEchoes } = await import("../src/lib/agent/text-tools")
const leaked = [
  '(You called the tool check_result with {"result_id":"agent-image-1","brief":"A blue peach."}) (You called the tool check_result with {"result_id":"agent-image-2","brief":"A single blue peach."})',
  "",
  '[Tool result for check_result]: {"match":true,"notes":"The image matches."}',
  "",
  '[Tool result for check_result]: {"match":true,"notes":"Also matches."}',
  "",
  "I have created both images. The close-up is better for details.",
].join("\n")
const cleaned = stripEchoes(leaked)
check("leaked calls and results are removed", cleaned === "I have created both images. The close-up is better for details.", cleaned)
check("a normal answer is left alone", stripEchoes("The result is 4,598.46.") === "The result is 4,598.46.")
check("a sentence that mentions brackets in normal use is kept", stripEchoes("Use [square brackets] for notes.") === "Use [square brackets] for notes.")
// and through the model wrapper: a reply that leaks is cleaned on the way out
const leaky = textToolsModel(scripted([leaked]))
const cleanedReply = await generateText({ model: leaky, prompt: "hi" })
check("the wrapper cleans a leaky reply", cleanedReply.text === "I have created both images. The close-up is better for details.", cleanedReply.text)

console.log(failed === 0 ? `all ${passed} checks passed` : `${failed} failed, ${passed} passed`)
process.exit(failed === 0 ? 0 : 1)

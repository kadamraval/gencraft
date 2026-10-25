import type { LanguageModel } from "ai"

/**
 * Tool use for any chat model, including ones whose API has no `tools` parameter (Replicate's language models, or a model
 * that does not list tool support).
 *
 * The model is told in plain words which tools exist and to answer with a small JSON object when it wants one. This
 * wrapper turns that JSON back into the tool calls the agent loop expects, and turns tool results and earlier turns into
 * text the model can read. A reply that is not a tool call is passed on as the answer. A reply that tried to be a tool call
 * but is not valid JSON is asked for again once.
 *
 * Models that do accept `tools` natively never go through this: it is the fallback, not the default.
 */

type V4 = Extract<LanguageModel, { specificationVersion: "v4" }>
type CallOptions = Parameters<V4["doGenerate"]>[0]
type Prompt = CallOptions["prompt"]
type GenerateResult = Awaited<ReturnType<V4["doGenerate"]>>
type StreamResult = Awaited<ReturnType<V4["doStream"]>>
type Tool = { type: string; name?: string; description?: string; inputSchema?: unknown }

export interface ParsedCall {
  tool: string
  input: Record<string, unknown>
}

const compactSchema = (schema: unknown): string => {
  if (!schema || typeof schema !== "object") return "{}"
  const { $schema: _s, additionalProperties: _a, ...rest } = schema as Record<string, unknown>
  return JSON.stringify(rest)
}

/** The instructions that stand in for a `tools` parameter */
export function toolsPreamble(tools: Tool[]): string {
  const list = tools
    .filter((t) => t.type === "function" && t.name)
    .map((t) => `- ${t.name}: ${t.description ?? ""} Input: ${compactSchema(t.inputSchema)}`)
    .join("\n")
  return [
    "You can use tools. To use one, reply with ONLY a JSON object and no other text, in exactly this shape:",
    '{"calls":[{"tool":"<tool name>","input":{<the tool input>}}]}',
    "Put several calls in one reply when they do not depend on each other. Use only the tool names listed below, with the input they describe.",
    'After a tool runs you are shown its result as "[Tool result ...]". Those lines come from the system: never write one yourself, never invent a result, and never repeat tool calls or results in your answer.',
    "When you have what you need, or no tool is needed, reply normally in plain text, in your own words.",
    "Tools:",
    list,
  ].join("\n")
}

const safeParse = (t: string): unknown => {
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

/**
 * Lines a model sometimes copies out of the history into its answer: its own earlier tool calls, and tool results it was
 * shown (or made up). They belong to the system, never to the answer, so they are taken out.
 */
export function stripEchoes(text: string): string {
  let out = text
  // "[Tool result for x]: {...}" runs to the end of its line
  out = out.replace(/^[ \t]*\[Tool result[^\]\n]*\][^\n]*(\n|$)/gim, "")
  out = out.replace(/\[Tool result[^\]\n]*\]:[^\n]*/g, "")
  // "(You called the tool x with {...})" in prose
  out = out.replace(/\(You called the tool [^\n]*?\}\)[ \t]*/g, "")
  // a leftover calls object that was not understood as a call
  out = out.replace(/^[ \t]*\{"calls":\[[^\n]*\]\}[ \t]*$/gim, "")
  return out.replace(/\n{3,}/g, "\n\n").trim()
}

const resultText = (output: unknown): string => {
  if (!output || typeof output !== "object") return String(output ?? "")
  const o = output as { type?: string; value?: unknown }
  if (o.type === "text" || o.type === "error-text") return String(o.value ?? "")
  try {
    return JSON.stringify(o.value ?? output)
  } catch {
    return String(o.value ?? "")
  }
}

/** A conversation as one piece of text, for a model that only takes a prompt. Tool calls and results are written out. */
export function flattenPrompt(prompt: Prompt): { system: string; transcript: string } {
  const system: string[] = []
  const lines: string[] = []
  for (const m of prompt) {
    if (m.role === "system") {
      system.push(m.content)
    } else if (m.role === "user") {
      const text = m.content.map((p) => (p.type === "text" ? p.text : "[a file was attached]")).join("\n")
      lines.push(`User: ${text}`)
    } else if (m.role === "assistant") {
      const parts: string[] = []
      const calls: Array<{ tool: string; input: unknown }> = []
      for (const p of m.content) {
        if (p.type === "text") parts.push(p.text)
        else if (p.type === "tool-call") calls.push({ tool: p.toolName, input: typeof p.input === "string" ? safeParse(p.input) : p.input })
      }
      if (calls.length > 0) parts.push(JSON.stringify({ calls }))
      if (parts.length > 0) lines.push(`Assistant: ${parts.join("\n")}`)
    } else {
      for (const p of m.content) {
        if (p.type === "tool-result") lines.push(`[Tool result for ${p.toolName}]: ${resultText(p.output)}`)
      }
    }
  }
  const only = prompt.filter((m) => m.role !== "system")
  const single = only.length === 1 && only[0]!.role === "user"
  return { system: system.join("\n\n"), transcript: single ? lines[0]!.replace(/^User: /, "") : `${lines.join("\n\n")}\n\nAssistant:` }
}

/** The first balanced JSON object in a text, ignoring braces inside strings */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]!
    if (inString) {
      if (c === "\\") i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === "{") depth++
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

export type Parsed = { kind: "calls"; calls: ParsedCall[]; before: string } | { kind: "text"; text: string } | { kind: "broken" }

/** Reads a model's reply: tool calls, a plain answer, or a broken attempt at a tool call */
export function parseReply(text: string, toolNames: string[]): Parsed {
  const json = firstJsonObject(text)
  const mentionsTool = /"(tool|calls)"\s*:/.test(text)
  if (!json) return mentionsTool ? { kind: "broken" } : { kind: "text", text }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return mentionsTool ? { kind: "broken" } : { kind: "text", text }
  }
  const raw = value as { calls?: unknown; tool?: unknown; input?: unknown }
  const candidates = Array.isArray(raw.calls) ? raw.calls : typeof raw.tool === "string" ? [raw] : []
  const calls: ParsedCall[] = []
  for (const c of candidates) {
    const o = c as { tool?: unknown; name?: unknown; input?: unknown; arguments?: unknown }
    const tool = typeof o.tool === "string" ? o.tool : typeof o.name === "string" ? o.name : ""
    const input = o.input ?? o.arguments ?? {}
    if (toolNames.includes(tool) && input && typeof input === "object") calls.push({ tool, input: input as Record<string, unknown> })
  }
  if (calls.length === 0) return mentionsTool ? { kind: "broken" } : { kind: "text", text }
  return { kind: "calls", calls, before: text.slice(0, text.indexOf(json)).replace(/```(?:json)?\s*$/i, "").trim() }
}

const textOf = (r: GenerateResult): string => r.content.map((c) => (c.type === "text" ? c.text : "")).join("")

let counter = 0

/** Makes a model that takes only a prompt, and writes text, behave like one that takes tools. */
export function textToolsModel(base: V4): V4 {
  async function generate(options: CallOptions): Promise<GenerateResult> {
    const tools = (options.tools ?? []).filter((t) => t.type === "function") as Tool[]
    const names = tools.map((t) => t.name ?? "").filter(Boolean)
    const { system, transcript } = flattenPrompt(options.prompt)
    const instructions = [system, names.length > 0 ? toolsPreamble(tools) : ""].filter(Boolean).join("\n\n")
    const build = (extra?: string): Prompt => [
      ...(instructions ? [{ role: "system" as const, content: instructions }] : []),
      { role: "user" as const, content: [{ type: "text" as const, text: extra ? `${transcript}\n\n${extra}` : transcript }] },
    ]
    const ask = (prompt: Prompt) => base.doGenerate({ ...options, prompt, tools: undefined, toolChoice: undefined })

    let result = await ask(build())
    if (names.length === 0) return { ...result, content: result.content.map((c) => (c.type === "text" ? { ...c, text: stripEchoes(c.text) } : c)) }
    let parsed = parseReply(textOf(result), names)
    if (parsed.kind === "broken") {
      // One more try, telling it what went wrong
      result = await ask(build("Your last reply was meant to be a tool call but it was not valid JSON in the required shape. Reply again with ONLY the JSON object, or with a plain answer."))
      parsed = parseReply(textOf(result), names)
    }
    if (parsed.kind === "calls") {
      return {
        ...result,
        content: [
          ...(parsed.before ? [{ type: "text" as const, text: parsed.before }] : []),
          ...parsed.calls.map((c) => ({ type: "tool-call" as const, toolCallId: `tc-${Date.now()}-${++counter}`, toolName: c.tool, input: JSON.stringify(c.input) })),
        ],
        finishReason: { unified: "tool-calls", raw: "text-tools" },
      }
    }
    const answer = stripEchoes(parsed.kind === "text" ? parsed.text : textOf(result))
    return { ...result, content: [{ type: "text", text: answer }] }
  }

  async function stream(options: CallOptions): Promise<StreamResult> {
    const result = await generate(options)
    const id = "t1"
    const parts: Array<Awaited<ReturnType<V4["doStream"]>>["stream"] extends ReadableStream<infer P> ? P : never> = [{ type: "stream-start", warnings: result.warnings }]
    for (const c of result.content) {
      if (c.type === "text" && c.text) parts.push({ type: "text-start", id }, { type: "text-delta", id, delta: c.text }, { type: "text-end", id })
      else if (c.type === "tool-call") parts.push(c)
    }
    parts.push({ type: "finish", usage: result.usage, finishReason: result.finishReason })
    return {
      stream: new ReadableStream({
        start(controller) {
          for (const p of parts) controller.enqueue(p)
          controller.close()
        },
      }),
    }
  }

  return {
    specificationVersion: "v4",
    provider: base.provider,
    modelId: base.modelId,
    supportedUrls: {},
    doGenerate: generate,
    doStream: stream,
  } as V4
}

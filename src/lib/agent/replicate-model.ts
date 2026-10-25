import type { LanguageModel } from "ai"
import { runDirect } from "@/lib/registry/connectors"
import type { ModelRecord } from "@/lib/registry/types"
import { flattenPrompt } from "./text-tools"

/**
 * A Replicate language model as an AI SDK model. Replicate answers a prediction with text (its own API, not the OpenAI
 * format), so this reads the conversation as one prompt, runs it the way the chat already does, and returns the text.
 * Tool use on top of it comes from `textToolsModel`.
 */

type V4 = Extract<LanguageModel, { specificationVersion: "v4" }>
type CallOptions = Parameters<V4["doGenerate"]>[0]

/** What a Replicate language model reports: its own token counts when the prediction has them, otherwise nothing (the counter then estimates from the words) */
function usageOf(raw: unknown) {
  const m = (raw as { metrics?: { input_token_count?: number; output_token_count?: number } } | undefined)?.metrics
  const inT = typeof m?.input_token_count === "number" ? m.input_token_count : undefined
  const outT = typeof m?.output_token_count === "number" ? m.output_token_count : undefined
  return { inputTokens: { total: inT, noCache: inT, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: outT, text: outT, reasoning: undefined } }
}

export function replicateModel(record: ModelRecord, apiKey: string): V4 {
  async function generate(options: CallOptions) {
    const { system, transcript } = flattenPrompt(options.prompt)
    const prompt = system ? `${system}\n\n${transcript}` : transcript
    const out = await runDirect({ record, apiKey, prompt, params: {}, signal: options.abortSignal })
    return {
      content: [{ type: "text" as const, text: out.text ?? "" }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: usageOf(out.raw),
      warnings: [],
    }
  }
  return {
    specificationVersion: "v4",
    provider: "replicate",
    modelId: record.endpoint,
    supportedUrls: {},
    doGenerate: generate,
    doStream: async (options: CallOptions) => {
      const r = await generate(options)
      const text = r.content[0]!.text
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] })
            if (text) {
              controller.enqueue({ type: "text-start", id: "t1" })
              controller.enqueue({ type: "text-delta", id: "t1", delta: text })
              controller.enqueue({ type: "text-end", id: "t1" })
            }
            controller.enqueue({ type: "finish", usage: r.usage, finishReason: r.finishReason })
            controller.close()
          },
        }),
      }
    },
  } as V4
}

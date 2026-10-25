import type { LanguageModel } from "ai"

/**
 * A model made of several: it asks the first, and when that one refuses before it has said anything (a rejected key, a
 * blocked project, a quota, a provider outage) it asks the next, and so on. The Agent thinks through this, so one provider
 * failing in the middle of a run no longer ends it. Only the thinking model switches: a picture or video that was already
 * paid for is never made twice, because those are tools, not this model.
 */

type V4 = Extract<LanguageModel, { specificationVersion: "v4" }>
type CallOptions = Parameters<V4["doStream"]>[0]

export interface Candidate {
  label: string
  model: LanguageModel
}

export interface FailoverOptions {
  /** Told when one candidate failed and the next takes over */
  onSwitch?: (from: string, to: string, reason: string) => void
}

const isModel = (m: LanguageModel): m is V4 => typeof m === "object" && (m as { specificationVersion?: string }).specificationVersion === "v4"

export function failoverModel(candidates: Candidate[], options: FailoverOptions = {}): LanguageModel {
  const usable = candidates.filter((c): c is { label: string; model: V4 } => isModel(c.model))
  if (usable.length === 0) throw new Error("No chat model is available to run this.")
  if (usable.length === 1) return usable[0]!.model
  const first = usable[0]!.model

  async function run<T>(call: (m: V4) => PromiseLike<T>): Promise<T> {
    let lastError: unknown
    for (const [i, c] of usable.entries()) {
      try {
        return await call(c.model)
      } catch (e) {
        lastError = e
        const next = usable[i + 1]
        if (next) options.onSwitch?.(c.label, next.label, e instanceof Error ? e.message : String(e))
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  return {
    specificationVersion: "v4",
    provider: first.provider,
    modelId: first.modelId,
    supportedUrls: first.supportedUrls,
    doGenerate: (opts: CallOptions) => run((m) => m.doGenerate(opts)),
    doStream: (opts: CallOptions) => run((m) => m.doStream(opts)),
  } as V4
}

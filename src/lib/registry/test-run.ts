import { clampToSchema, defaultsFor } from "@/components/composer/schema-form"
import { dispatchLiveProviderRequest } from "@/lib/providers/live-connectors"
import { estimateRun } from "./price"
import { getRecord } from "./store"
import type { ResolvedModelInfo } from "@/lib/agent/fallback-router"
import type { ProviderId } from "./providers"
import type { ModelRecord } from "./types"
import type { SettingsState } from "@/types"

/**
 * One small run of a model with the person's own key, to see that it works before relying on it. The settings
 * are the cheapest the model allows (one result, the shortest length), and the estimated cost is shown first.
 */

const PROMPT: Record<ModelRecord["modality"], string> = {
  image: "A small red apple on a white table, soft daylight",
  video: "A calm sea at sunrise, slow camera move",
  audio: "Hello, this is a short test.",
  text: "Say hello in five words.",
}

/** The cheapest settings: the model's defaults, one result, and the shortest length it offers. */
export function testValues(record: ModelRecord): Record<string, unknown> {
  const values = defaultsFor(record.params)
  for (const key of ["num_images", "n", "num_outputs"]) if (record.params.properties[key]) values[key] = 1
  const duration = record.params.properties.duration
  if (duration) {
    const options = duration.enum?.map(Number).filter(Number.isFinite)
    if (options?.length) values.duration = Math.min(...options)
    else if (typeof duration.minimum === "number") values.duration = duration.minimum
  }
  return clampToSchema(record.params, values)
}

export function testCost(record: ModelRecord): number | null {
  return estimateRun(record, testValues(record)).usd
}

export interface TestResult {
  kind: ModelRecord["modality"]
  url?: string
  text?: string
  seconds: number
}

export async function runModelTest(id: string, settings: SettingsState): Promise<TestResult> {
  const record = getRecord(id)
  if (!record) throw new Error("This model is not available.")
  const model: ResolvedModelInfo = { id: record.id, name: record.name, provider: record.provider as ProviderId, modality: record.modality, costNumeric: 0, costDisplay: "", specs: "", latency: "" }
  const started = performance.now()
  const live = await dispatchLiveProviderRequest({
    model,
    modality: record.modality,
    prompt: PROMPT[record.modality],
    settings,
    params: testValues(record),
    imageParams: { batchCount: 1, aspectRatio: "1:1" },
    videoParams: { duration: 2, aspectRatio: "16:9" },
    audioParams: { duration: 3 },
  })
  const seconds = Math.round((performance.now() - started) / 100) / 10
  if (record.modality === "text") {
    if (!live.textResponse) throw new Error("The model returned no text.")
    return { kind: "text", text: live.textResponse, seconds }
  }
  const url = record.modality === "image" ? live.imageUrls?.[0] : record.modality === "video" ? live.videoUrl : live.audioUrl
  if (!url) throw new Error(`The provider finished but returned no ${record.modality} file.`)
  return { kind: record.modality, url, seconds }
}

import { executeWithFallback } from "@/lib/agent/fallback-router"
import { readPdfText } from "@/lib/chat/documents"
import { readPage } from "@/lib/chat/links"
import { describeKit } from "@/lib/brand/brand-ops"
import { pickLogo } from "@/lib/brand/logos"
import { recordTextEstimate } from "@/lib/ledger/text-usage"
import { composePrompt } from "@/lib/elements/compose"
import type { ElementItem } from "@/lib/elements/types"
import { profileFor } from "@/lib/models/profile"
import { loadBrands } from "@/lib/brand/brand-storage"
import { dispatchLiveProviderRequest } from "@/lib/providers/live-connectors"
import { computeDefaultEnabled } from "@/lib/registry/enabled"
import { fits, needOf, pictureLimit, versionFor } from "./capabilities"
import type { Need } from "./capabilities"
import { clampToSchema, defaultsFor } from "@/lib/registry/param-logic"
import { estimateRun } from "@/lib/registry/price"
import { getListedModels, getRecord } from "@/lib/registry/store"
import type { ModelRecord } from "@/lib/registry/types"
import type { MediaAsset, ProviderType, SettingsState } from "@/types"
import type { RegistryView } from "./validate"
import type { AppInput, AppReference, AppSpec, AppStep, GenerateRequest, RunDeps, StepEvent } from "./types"

/**
 * The real providers behind the engine: reading, writing and making things with the person's own models, through the same
 * fallback and cost recording as the rest of the studio.
 */

export const liveRegistry: RegistryView = { get: (id) => getRecord(id), listed: () => getListedModels() }

/**
 * The prompt written for the model the way Create writes it: @Character becomes the model's own tag for that picture ("Character (image 1)",
 * or whatever tag its maker uses), the pictures are put in order within what the model takes, and each character, place or product is told
 * to the model as what it shows. The very same code the composer uses.
 */
export function composeFor(rec: ModelRecord, prompt: string, references: AppReference[], pool: ModelRecord[]) {
  const asElements: ElementItem[] = references.filter((r) => r.category).map((r) => ({ id: r.name, category: r.category!, name: r.name, imageUrls: [r.url], text: "", origin: "written", createdAt: 0 }))
  const attached = references.filter((r) => !r.category).map((r) => ({ id: r.name, name: r.name, url: r.url }))
  return composePrompt({ prompt, elements: asElements, references: attached, referenceLimit: pictureLimit(rec, pool), imageTag: profileFor(rec)?.imageTag })
}

/**
 * The model a make step uses: the one it names (or the version of the same model that takes what the step hands it, as the composer
 * does), or the best switched-on one of that kind that takes everything the step hands over.
 */
export function modelFor(kind: GenerateRequest["kind"], modelId: string, handed: Need | number | boolean): ModelRecord | undefined {
  const need: Need = typeof handed === "object" ? handed : { pictures: typeof handed === "number" ? handed : handed ? 1 : 0 }
  const listed = getListedModels()
  const named = modelId && modelId !== "auto" ? getRecord(modelId) : undefined
  if (named) return versionFor(named, listed, need) ?? named
  const byId = new Map(listed.map((r) => [r.id, r]))
  const ranked = computeDefaultEnabled(listed)
    .map((id) => byId.get(id))
    .filter((r): r is ModelRecord => Boolean(r) && r!.modality === kind)
  const wants = need.pictures > 0 || need.start || need.end || need.video || need.audio
  if (!wants) return ranked.find((r) => fits(r, need)) ?? ranked[0]
  // The best model that takes everything the step hands over, then any that takes pictures at all
  return ranked.find((r) => fits(r, need)) ?? ranked.map((r) => versionFor(r, listed, need)).find(Boolean) ?? ranked[0]
}

/** The settings a model will really be sent: its defaults, then the app's, keeping only ones the model has, read as the types it wants */
export function settingsFor(rec: ModelRecord, wanted: Record<string, unknown>): Record<string, unknown> {
  const mine: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(wanted)) {
    const prop = rec.params.properties[k]
    if (!prop) continue
    mine[k] = (prop.type === "number" || prop.type === "integer") && typeof v === "string" ? Number(v) : v
  }
  return clampToSchema(rec.params, { ...defaultsFor(rec.params), ...mine })
}

/** What one make step costs, or null when the model's price is unknown */
export function priceOfStep(step: AppStep, params: Record<string, unknown>, inputs: AppInput[] = []): number | null {
  const kind = step.kind as GenerateRequest["kind"]
  const rec = modelFor(kind, step.model ?? "auto", needOf(step, inputs))
  if (!rec) return null
  const usd = estimateRun(rec, settingsFor(rec, params)).usd
  return usd === null ? null : usd * (kind === "image" ? (step.count ?? 1) : 1)
}

export interface RuntimeOptions {
  settings: SettingsState
  projectId?: string
  runId: string
  onStep?: (event: StepEvent) => void
  signal?: AbortSignal
}

/** One question to the person's chat model, with its fallbacks and cost recording */
export async function askText(settings: SettingsState, actionName: string, prompt: string, system?: string): Promise<string> {
  const run = await executeWithFallback({
    modality: "text",
    settings,
    actionName,
    onDiagnosticLog: () => undefined,
    execute: async (model) => {
      const live = await dispatchLiveProviderRequest({ model, modality: "text", prompt: system ? `${system}

${prompt}` : prompt, settings, onLog: () => undefined })
      if (!live.textResponse) throw new Error("The model returned no text")
      // The older connector gives words and no token counts: counted from their length, and marked as an estimate
      recordTextEstimate(getRecord(model.id), system ? `${system}\n\n${prompt}` : prompt, live.textResponse, "App text")
      return live.textResponse
    },
  })
  return run.result
}

export function makeRunDeps(spec: AppSpec, options: RuntimeOptions): RunDeps {
  const { settings } = options
  const log = () => undefined

  return {
    onStep: options.onStep,
    signal: options.signal,
    readPdf: async (file) => {
      const { text } = await readPdfText(file)
      return text.slice(0, 30_000)
    },
    readPage: (url) => readPage(url),
    brand: (id) => {
      const kit = loadBrands().find((k) => k.id === id)
      return kit ? { text: describeKit(kit), logoUrl: pickLogo(kit, false)?.url } : undefined
    },
    text: (prompt, system) => askText(settings, `App: ${spec.name}`, prompt, system),
    generate: async (req) => {
      const rec = modelFor(req.kind, req.modelId, { pictures: req.references.length, start: Boolean(req.start), end: Boolean(req.end), video: Boolean(req.sourceVideo), audio: Boolean(req.sourceAudio) })
      if (!rec) throw new Error(`No ${req.kind} model is available. Add a provider key and switch one on in Settings.`)
      const values = settingsFor(rec, req.params)
      const composed = composeFor(rec, req.prompt, req.references, getListedModels())
      const ratio = typeof values.aspect_ratio === "string" ? values.aspect_ratio : undefined
      const duration = typeof values.duration === "number" ? values.duration : undefined
      const run = await executeWithFallback({
        modality: req.kind,
        settings,
        primaryModelId: rec.id,
        actionName: `App: ${spec.name}`,
        costMultiplier: 1,
        onDiagnosticLog: log,
        cost: { values },
        execute: async (model, _attempt, report) => {
          const live = await dispatchLiveProviderRequest({
            onActualCost: report,
            model,
            modality: req.kind,
            prompt: composed.prompt,
            settings,
            params: values,
            references: { images: composed.imageUrls, groups: composed.groups, sourceVideoUrl: req.sourceVideo, sourceAudioUrl: req.sourceAudio },
            imageParams: { batchCount: req.count, aspectRatio: ratio },
            videoParams: { duration, aspectRatio: ratio, startFrameUrl: req.start, endFrameUrl: req.end },
            audioParams: { duration },
            onLog: log,
          })
          const urls = req.kind === "image" ? (live.imageUrls ?? []) : req.kind === "video" ? (live.videoUrl ? [live.videoUrl] : []) : live.audioUrl ? [live.audioUrl] : []
          if (urls.length === 0) throw new Error(`The provider finished but returned no ${req.kind} file`)
          const when = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          return urls.map<MediaAsset>((url, i) => ({
            id: `app-${req.kind}-${Date.now()}-${i}`,
            type: req.kind,
            title: spec.name,
            prompt: req.prompt,
            url,
            thumbnailUrl: req.kind === "image" ? url : "",
            aspectRatio: ratio ?? "16:9",
            model: model.name,
            provider: model.provider as ProviderType,
            createdAt: when,
            batchId: options.runId,
            projectId: options.projectId,
            cost: "",
            status: "completed",
            source: "generated",
          }))
        },
      })
      const usd = estimateRun(rec, values).usd ?? 0
      return { assets: run.result, costUsd: usd * (req.kind === "image" ? req.count : 1) }
    },
  }
}

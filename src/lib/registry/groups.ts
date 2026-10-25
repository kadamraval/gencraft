import { makerRank } from "./logo-rules"
import { computeDefaultEnabled } from "./enabled"
import { shortlistRank } from "./shortlist"
import { estimateRun } from "./price"
import { resRank } from "./summary"
import type { GroupModality, ModelGroup, SettingsState } from "@/types"
import type { ModelRecord } from "./types"
import { hasRole, pickByTier } from "./roles"
import type { Tier } from "./roles"

export type ExtraRole = "image-edit" | "video-edit" | "speech" | "music" | "stt"

/**
 * Default Low, Medium and High groups.
 *
 * A group names one model per kind of output (agent, image, video, audio) plus default options, so choosing
 * "Low" in agent mode means cheap models and small outputs everywhere, and "High" means the best of each.
 * The defaults are computed from the current registry, so they never point at a model that was retired.
 * Users edit or replace them in Settings.
 */

export const GROUP_MODALITIES: GroupModality[] = ["text", "image", "video", "audio"]

export const GROUP_LABEL: Record<GroupModality, string> = {
  text: "Agent",
  image: "Image",
  video: "Video",
  audio: "Audio",
}

const promptFirst = (r: ModelRecord) => !r.task || r.task.startsWith("text-to")

/** Tools that transform an existing file rather than create something from a prompt. */
const UTILITY = /upscal|seedvr|deblur|enhance|restor|remov|background|relight|swap|extend|lipsync|segment|matting|interpolat|denois|colori[sz]e|inpaint|outpaint|reference to|retouch/i

function versionScore(r: ModelRecord): number {
  return (r.version?.[0] ?? 0) * 1000 + (r.version?.[1] ?? 0)
}

/** Picks the smallest or largest value of an enum parameter, ranking resolution names properly. */
function extremeOption(rec: ModelRecord, key: string, which: "min" | "max"): string | number | undefined {
  const values = rec.params.properties[key]?.enum
  if (!values?.length) return undefined
  const rank = (v: string | number) => (key === "resolution" || key === "quality" ? resRank(String(v)) : parseFloat(String(v)))
  const sorted = [...values].sort((a, b) => rank(a) - rank(b))
  return which === "min" ? sorted[0] : sorted[sorted.length - 1]
}

function pick(listed: ModelRecord[], modality: GroupModality, tier: "low" | "medium" | "high"): ModelRecord | undefined {
  // Only the curated default set, only models that create from a prompt, never editing utilities
  const curated = new Set(computeDefaultEnabled(listed))
  const pool = listed.filter((r) => r.modality === modality && curated.has(r.id) && promptFirst(r) && !UTILITY.test(`${r.name} ${r.endpoint}`))
  const known = pool.filter((r) => makerRank({ name: r.name, endpoint: r.endpoint, family: r.family }, modality) < 6)
  const base = known.length >= 3 ? known : pool

  // Compare what one default run costs, so dollars per second, per image and per token line up
  const priced = base
    .map((r) => ({ r, usd: estimateRun(r, {}).usd }))
    .filter((x): x is { r: ModelRecord; usd: number } => x.usd !== null && x.usd > 0)
    .sort((a, b) => a.usd - b.usd)
    .map((x) => x.r)

  if (tier === "high") {
    return [...base].sort(
      (a, b) =>
        (shortlistRank(a) ?? 1000) - (shortlistRank(b) ?? 1000) ||
        makerRank({ name: a.name, endpoint: a.endpoint, family: a.family }, modality) - makerRank({ name: b.name, endpoint: b.endpoint, family: b.family }, modality) ||
        versionScore(b) - versionScore(a),
    )[0]
  }
  if (priced.length === 0) return base[0]
  if (tier === "low") return priced[0]
  return priced[Math.floor(priced.length / 2)]
}

export function seedGroups(listed: ModelRecord[]): ModelGroup[] {
  const tiers: Array<{ id: string; name: string; tier: "low" | "medium" | "high" }> = [
    { id: "low", name: "Low", tier: "low" },
    { id: "medium", name: "Medium", tier: "medium" },
    { id: "high", name: "High", tier: "high" },
  ]
  return tiers.map(({ id, name, tier }) => {
    const models: ModelGroup["models"] = {}
    for (const modality of GROUP_MODALITIES) {
      const rec = pick(listed, modality, tier)
      if (!rec) continue
      const params: Record<string, unknown> = {}
      if (modality === "video" || modality === "image") {
        const res = extremeOption(rec, "resolution", tier === "low" ? "min" : tier === "high" ? "max" : "min")
        if (res !== undefined && tier !== "medium") params.resolution = res
      }
      if (modality === "video" && tier === "low") {
        const d = extremeOption(rec, "duration", "min")
        if (d !== undefined) params.duration = d
      }
      models[modality] = { modelId: rec.id, params: Object.keys(params).length ? params : undefined }
    }
    return { id, name, models }
  })
}

/** The level a group stands for: the three defaults by id, any group of the person's own counts as Medium */
export function tierOfGroup(group: Pick<ModelGroup, "id">): Tier {
  return group.id === "low" ? "low" : group.id === "high" ? "high" : "medium"
}

/**
 * The groups in force: the person's own choices on top of the automatic ones. A role the person did not set follows the level by itself,
 * so a model that arrives later is used without anyone assigning it.
 */
export function resolveGroups(saved: ModelGroup[] | undefined, listed: ModelRecord[]): ModelGroup[] {
  const auto = seedGroups(listed)
  if (!saved || saved.length === 0) return auto
  return saved.map((g) => {
    const base = auto.find((a) => a.id === g.id)
    return base ? { ...g, models: { ...base.models, ...g.models } } : g
  })
}

/** The model a group uses for one of the roles beyond the four: the person's choice, or the pick for the level */
export function groupModelFor(group: ModelGroup | undefined, role: ExtraRole, listed: ModelRecord[], marked: ReadonlySet<string> = new Set()): ModelRecord | undefined {
  const chosen = group?.extra?.[role]
  const pinned = chosen ? listed.find((r) => r.id === chosen) : undefined
  if (pinned) return pinned
  return pickByTier(listed.filter((r) => hasRole(r, role)), group ? tierOfGroup(group) : "medium", marked)
}

/** The model a group uses for one AI tool, from the models that can do it */
export function groupModelForTool(group: ModelGroup | undefined, toolId: string, candidates: ModelRecord[], marked: ReadonlySet<string> = new Set()): ModelRecord | undefined {
  const chosen = group?.tools?.[toolId]
  const pinned = chosen ? candidates.find((r) => r.id === chosen) : undefined
  return pinned ?? pickByTier(candidates, group ? tierOfGroup(group) : "medium", marked)
}

/** The group the user picked in agent mode, or the middle one by default. */
export function activeGroup(settings: SettingsState, listed: ModelRecord[]): ModelGroup | undefined {
  const groups = resolveGroups(settings.aiEngine.groups, listed)
  return groups.find((g) => g.id === settings.aiEngine.activeGroupId) ?? groups[Math.min(1, groups.length - 1)]
}

type ModelKey = "activeTextModelId" | "activeImageModelId" | "activeVideoModelId" | "activeAudioModelId"
const MODEL_KEY: Record<GroupModality, ModelKey> = {
  text: "activeTextModelId",
  image: "activeImageModelId",
  video: "activeVideoModelId",
  audio: "activeAudioModelId",
}

/**
 * Settings as the agent should see them for one run: the group's model leads each chain, and the model it
 * replaced becomes a fallback. Also returns the group's default options per kind of output.
 */
export function applyGroup(settings: SettingsState, group: ModelGroup | undefined): { settings: SettingsState; params: Partial<Record<GroupModality, Record<string, unknown>>> } {
  if (!group) return { settings, params: {} }
  const aiEngine = { ...settings.aiEngine }
  const fallbackModels = { ...(aiEngine.fallbackModels ?? {}) }
  const params: Partial<Record<GroupModality, Record<string, unknown>>> = {}
  for (const modality of GROUP_MODALITIES) {
    const entry = group.models[modality]
    if (!entry) continue
    const key = MODEL_KEY[modality]
    const previous = aiEngine[key]
    aiEngine[key] = entry.modelId
    fallbackModels[modality] = [...new Set([...(previous && previous !== entry.modelId ? [previous] : []), ...(fallbackModels[modality] ?? [])])].filter((id) => id !== entry.modelId)
    if (entry.params) params[modality] = entry.params
  }
  return { settings: { ...settings, aiEngine: { ...aiEngine, fallbackModels } }, params }
}

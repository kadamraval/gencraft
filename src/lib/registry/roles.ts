import { estimateRun } from "./price"
import { shortlistRank } from "./shortlist"
import { taskOf } from "./tasks"
import type { ModelRecord } from "./types"

/**
 * What each model is for, read from the model's own data and never from its brand: the provider's task, what comes out, and which files
 * the model's settings say it takes in. A model can have more than one role (a picture model that also edits). Every picker asks for one
 * role and gets only the models that have it.
 */

export type Role = "text" | "image" | "image-edit" | "video" | "video-edit" | "speech" | "music" | "stt"

export const ROLES: Role[] = ["text", "image", "image-edit", "video", "video-edit", "speech", "music", "stt"]

export const ROLE_LABEL: Record<Role, string> = {
  text: "Chat & Agent",
  image: "Image",
  "image-edit": "Image edit",
  video: "Video",
  "video-edit": "Video edit",
  speech: "Speech",
  music: "Music & sound",
  stt: "Speech to text",
}

/** The kinds of file the model's settings say it takes */
export function filesTaken(r: ModelRecord): Set<"image" | "video" | "audio"> {
  const out = new Set<"image" | "video" | "audio">()
  for (const p of Object.values(r.params.properties)) if (p.format === "image" || p.format === "video" || p.format === "audio") out.add(p.format)
  for (const k of r.inputs) if (k === "image" || k === "video" || k === "audio") out.add(k)
  return out
}

export function rolesOf(r: ModelRecord): Role[] {
  if (r.status === "deprecated" || r.utility) return []
  const files = filesTaken(r)
  const roles: Role[] = []
  if (r.modality === "text") {
    roles.push("text")
    if (files.has("audio")) roles.push("stt")
    return roles
  }
  const task = taskOf(r)
  if (r.modality === "image") {
    if (task === "text-to-image") roles.push("image")
    if (task === "image-edit" || (task === "text-to-image" && files.has("image"))) roles.push("image-edit")
  } else if (r.modality === "video") {
    if (task === "text-to-video" || task === "image-to-video" || task === "reference-to-video") roles.push("video")
    if (task === "video-edit" || files.has("video")) roles.push("video-edit")
  } else {
    if (task === "speech") roles.push("speech")
    if (task === "transcription") roles.push("stt")
    if (task === "audio-generation") roles.push("music")
  }
  return roles
}

export const hasRole = (r: ModelRecord, role: Role): boolean => rolesOf(r).includes(role)

export type Tier = "low" | "medium" | "high"

const priceOf = (r: ModelRecord): number | null => (r.modality === "text" ? r.price.amount : estimateRun(r, {}).usd)

const versionScore = (r: ModelRecord) => (r.version?.[0] ?? 0) * 1000 + (r.version?.[1] ?? 0)

/**
 * Where the standard database ranks a model of its own list (the makers and models we chose), 1 being the first choice for a job on its
 * provider. Undefined for a model the database holds only as a backup, or does not hold at all.
 */
export function packRankOf(r: Pick<ModelRecord, "jobs">): number | undefined {
  const own = (r.jobs ?? []).filter((j) => j.role === "model")
  return own.length > 0 ? Math.min(...own.map((j) => j.rank)) : undefined
}

/** Best first: the standard database's own list, provider-featured, the leaderboard rank, the newest version, the newest update */
export function bestFirst(a: ModelRecord, b: ModelRecord): number {
  return (packRankOf(a) ?? 1000) - (packRankOf(b) ?? 1000) || Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (shortlistRank(a) ?? 1000) - (shortlistRank(b) ?? 1000) || versionScore(b) - versionScore(a) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
}

/**
 * The model to use at a level: Low is the cheapest that fits, High the best, Medium the middle one by price. A bookmarked model wins
 * when two are equal in price. Models with no known price are used only when none has one.
 */
export function pickByTier(candidates: ModelRecord[], tier: Tier, marked: ReadonlySet<string> = new Set()): ModelRecord | undefined {
  if (candidates.length === 0) return undefined
  const mark = (r: ModelRecord) => Number(marked.has(r.id))
  if (tier === "high") return [...candidates].sort((a, b) => mark(b) - mark(a) || bestFirst(a, b))[0]
  const priced = candidates.map((r) => ({ r, usd: priceOf(r) })).filter((x): x is { r: ModelRecord; usd: number } => x.usd !== null && x.usd > 0)
  if (priced.length === 0) return [...candidates].sort((a, b) => mark(b) - mark(a) || bestFirst(a, b))[0]
  priced.sort((a, b) => a.usd - b.usd || mark(b.r) - mark(a.r) || bestFirst(a.r, b.r))
  return (tier === "low" ? priced[0] : priced[Math.floor((priced.length - 1) / 2)])!.r
}

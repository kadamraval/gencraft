import { familyOf } from "@/lib/registry/families"
import { referenceImageLimit, refCapability } from "@/lib/registry/slots"
import type { ModelRecord } from "@/lib/registry/types"
import type { AppInput, AppStep } from "./types"

/**
 * What a model takes besides words, read the way the composer reads it: from the slots the maker's own schema has (reference
 * pictures, a start and an end frame, a video or a sound to work on). A model and its other versions at the same provider are
 * one model (the text, image and reference versions), and the composer switches to the version that takes what you attached,
 * so an app does the same. The agent, the checker and the runner all ask here, so they never disagree with the composer.
 */

/** What one make step hands the model, counted */
export interface Need {
  pictures: number
  start?: boolean
  end?: boolean
  video?: boolean
  audio?: boolean
}

export interface Slots {
  /** How many reference pictures it takes (0: none). A model that takes pictures but states no limit uses one. */
  pictures: number
  /** The maker does not state how many pictures it takes, so one is used */
  unstated: boolean
  start: boolean
  end: boolean
  /** A video it works on: to edit, extend or copy the motion of */
  video: boolean
  /** A sound it works on: a voice to lip-sync */
  audio: boolean
  /** What it cannot run without */
  needs: Array<"start" | "reference" | "video" | "audio">
}

/** What this one endpoint takes */
export function slotsOfExact(rec: ModelRecord): Slots {
  const cap = refCapability(rec)
  const fromSlots = referenceImageLimit(cap)
  const pictures = fromSlots > 0 ? fromSlots : rec.inputs.includes("image") && !cap.start && !cap.sourceVideo ? 1 : 0
  return {
    pictures,
    unstated: pictures > 0 && !(cap.images?.stated ?? cap.elements?.stated ?? false),
    start: Boolean(cap.start),
    end: Boolean(cap.end),
    video: Boolean(cap.sourceVideo || cap.videos),
    audio: Boolean(cap.sourceAudio || cap.audios),
    needs: cap.needs,
  }
}

/** Whether this endpoint can take everything the step hands it */
export function fits(rec: ModelRecord, need: Need): boolean {
  const s = slotsOfExact(rec)
  if (need.pictures > s.pictures) return false
  if (need.start && !s.start) return false
  if (need.end && !s.end) return false
  if (need.video && !s.video) return false
  if (need.audio && !s.audio) return false
  // It also cannot run without what it requires
  if (s.needs.includes("start") && !need.start) return false
  if (s.needs.includes("reference") && need.pictures === 0) return false
  if (s.needs.includes("video") && !need.video) return false
  if (s.needs.includes("audio") && !need.audio) return false
  return true
}

/** The model's versions at its provider (one of them is the model itself) */
const versions = (rec: ModelRecord, pool: ModelRecord[]): ModelRecord[] => familyOf(rec, pool.length > 0 ? pool : [rec])

/** The version that runs the step: the model itself when it fits, otherwise the version of the same model that does (as the composer does) */
export function versionFor(rec: ModelRecord, pool: ModelRecord[], need: Need): ModelRecord | undefined {
  if (fits(rec, need)) return rec
  return versions(rec, pool).find((r) => fits(r, need))
}

/** What the whole model can do, all of its versions together: the most it takes, and everything any version takes */
export function slotsOf(rec: ModelRecord, pool: ModelRecord[]): Slots {
  const all = versions(rec, pool).map(slotsOfExact)
  const most = Math.max(...all.map((s) => s.pictures))
  return {
    pictures: most,
    unstated: all.filter((s) => s.pictures === most).every((s) => s.unstated),
    start: all.some((s) => s.start),
    end: all.some((s) => s.end),
    video: all.some((s) => s.video),
    audio: all.some((s) => s.audio),
    needs: [],
  }
}

/** How many reference pictures the model takes, all its versions together */
export const pictureLimit = (rec: ModelRecord, pool: ModelRecord[]): number => slotsOf(rec, pool).pictures

/** One short phrase for the agent: everything the model does with files */
export function describePictures(rec: ModelRecord, pool: ModelRecord[]): string {
  const s = slotsOf(rec, pool)
  const parts: string[] = []
  if (s.pictures === 0) parts.push("no reference pictures")
  else if (s.pictures === 1) parts.push(s.unstated ? "1 reference picture (the maker states no limit)" : "1 reference picture")
  else parts.push(`up to ${s.pictures} reference pictures`)
  if (rec.modality === "video") {
    if (s.start) parts.push("start frame")
    if (s.end) parts.push("end frame")
    if (s.video) parts.push("a video to work on (edit, extend or copy its motion)")
    if (s.audio) parts.push("a sound to work on (voice to lip-sync)")
  }
  const own = slotsOfExact(rec).needs
  if (own.length > 0) parts.push(`REQUIRES ${own.map((n) => (n === "reference" ? "a reference picture" : n === "start" ? "a start frame" : `a ${n}`)).join(" and ")}`)
  return parts.join(", ")
}

/** What a make step hands its model, counted from its inputs: each picture block is one picture, a strip counts as several, a brand logo as one, an earlier step's picture as one */
export function needOf(step: AppStep, inputs: AppInput[]): Need {
  const byId = new Map(inputs.map((i) => [i.id, i]))
  let pictures = 0
  for (const ref of step.references ?? []) {
    const input = byId.get(ref)
    pictures += input?.type === "images" ? 2 : 1
  }
  // A start or end frame is its own slot, not a reference picture
  return { pictures, start: Boolean(step.start), end: Boolean(step.end), video: Boolean(step.sourceVideo), audio: Boolean(step.sourceAudio) }
}

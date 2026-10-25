import "../models/profiles"
import { profileFor } from "../models/profile"
import { featureOfEndpoint } from "./features"
import { makerRank } from "./logo-rules"
import { refCapability } from "./slots"
import type { ModelRecord } from "./types"

/**
 * What a person can do with a finished video they have open: the actions a switched-on model really has for it. Nothing
 * is listed without a model behind it. An action is either a separate endpoint of a model (Kling's motion control, an
 * edit or lip-sync endpoint) or a task inside a model whose profile documents it (Seedance 2.5 edit and extend).
 */

export type EditKind = "edit" | "extend" | "lip-sync" | "motion-transfer"

export interface EditAction {
  /** Stable for one action on one model */
  id: string
  kind: EditKind
  label: string
  /** One line a person can read: what it does */
  hint: string
  /** The model that does it */
  record: ModelRecord
  /** Set when the action is a task inside the model rather than an endpoint of its own */
  task?: "edit" | "extend"
  /** What else the action needs besides the opened video */
  alsoNeeds?: "image" | "audio"
}

const KINDS: Record<EditKind, { label: string; hint: string; alsoNeeds?: EditAction["alsoNeeds"] }> = {
  edit: { label: "Edit video", hint: "Say what to add, remove or replace. The shape and length of the video stay." },
  extend: { label: "Extend", hint: "Say how the story goes on, and the video continues." },
  "lip-sync": { label: "Lip-sync", hint: "Give a voice and a face speaks it.", alsoNeeds: "audio" },
  "motion-transfer": { label: "Motion transfer", hint: "Give a picture and it moves the way this video does.", alsoNeeds: "image" },
}

const ORDER: EditKind[] = ["edit", "extend", "lip-sync", "motion-transfer"]

const takesVideo = (r: ModelRecord): boolean => {
  const cap = refCapability(r)
  return Boolean(cap.sourceVideo || cap.videos)
}

/** The actions available for an opened video: one per kind, from the best switched-on model that does it. */
export function editActionsFor(pool: ModelRecord[], enabled: Set<string>): EditAction[] {
  const best = new Map<EditKind, { action: EditAction; rank: number; updated: string }>()
  for (const r of pool) {
    if (r.modality !== "video" || r.status === "deprecated" || !enabled.has(r.id) || !takesVideo(r)) continue
    const offers: Array<{ kind: EditKind; task?: "edit" | "extend" }> = []
    const feature = featureOfEndpoint(r.endpoint)
    if (feature && (ORDER as string[]).includes(feature.id)) offers.push({ kind: feature.id as EditKind })
    // A task inside the model counts only where the model takes a video, and is never a second copy of its own endpoint feature
    for (const t of profileFor(r)?.tasks ?? []) if (!offers.some((o) => o.kind === t.id)) offers.push({ kind: t.id, task: t.id })
    for (const o of offers) {
      const kind = KINDS[o.kind]
      const action: EditAction = {
        id: `${o.kind}:${r.id}`,
        kind: o.kind,
        label: kind.label,
        hint: kind.hint,
        record: r,
        task: o.task,
        alsoNeeds: kind.alsoNeeds,
      }
      const rank = makerRank({ name: r.name, endpoint: r.endpoint, family: r.family }, "video")
      const updated = r.updatedAt ?? ""
      const held = best.get(o.kind)
      // A model's own endpoint beats a task inside another model; then the better-known maker; then the newer; then the plainer name
      const score = (a: { action: EditAction; rank: number; updated: string }) => [a.action.task ? 1 : 0, a.rank, a.action.record.endpoint.length] as const
      const better =
        !held ||
        (() => {
          const a = score({ action, rank, updated })
          const b = score(held)
          for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!
          return updated.localeCompare(held.updated) > 0
        })()
      if (better) best.set(o.kind, { action, rank, updated })
    }
  }
  return ORDER.map((k) => best.get(k)?.action).filter((a): a is EditAction => Boolean(a))
}

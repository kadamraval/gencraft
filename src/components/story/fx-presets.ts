import * as React from "react"
import { usePackItems } from "@/lib/packs/store"
import type { PackItem } from "@/lib/packs/types"
import { setFx, type CaptionStyle, type ClipFx, type EditProject } from "./edit-model"

/** Looks to put on a clip with one click. Each is a set of the same fields the Effect controls edit. */
export interface FxPreset {
  id: string
  label: string
  patch: Partial<ClipFx>
}

/** Effect packs as cards: the id is the pack item's id, the patch is what it sets */
export function presetsFrom(items: PackItem[]): FxPreset[] {
  return items.map((i) => ({ id: i.id, label: i.name, patch: (i.data.patch ?? {}) as Partial<ClipFx> }))
}
export const useFxPresets = (): FxPreset[] => {
  const items = usePackItems("effect")
  return React.useMemo(() => presetsFrom(items), [items])
}

/** Ways in and out of a clip. Each is a fade of the clip, in seconds, so it works the same in the preview and the export. */
export type TransitionKind = "fade-in" | "fade-out" | "fade-both" | "dip" | "none"

export interface TransitionCard {
  id: TransitionKind
  label: string
  hint: string
}
/** Transition packs as cards: the id is the kind of transition the item uses */
export function transitionsFrom(items: PackItem[]): TransitionCard[] {
  // Shader transitions (which overlap two clips) have their own cards; these are the fades on one clip
  return items.filter((i) => i.data.kind !== "shader").map((i) => ({ id: i.data.kind as TransitionKind, label: i.name, hint: i.description ?? "" }))
}
export const useTransitions = (): TransitionCard[] => {
  const items = usePackItems("transition")
  return React.useMemo(() => transitionsFrom(items), [items])
}

/** A caption style from a pack: the fields it sets on a caption */
export interface CaptionStyleCard {
  id: string
  label: string
  hint: string
  style: CaptionStyle
}
export function captionStylesFrom(items: PackItem[]): CaptionStyleCard[] {
  return items.map((i) => ({ id: i.id, label: i.name, hint: i.description ?? "", style: (i.data.style ?? {}) as CaptionStyle }))
}
export const useCaptionStyles = (): CaptionStyleCard[] => {
  const items = usePackItems("caption-style")
  return React.useMemo(() => captionStylesFrom(items), [items])
}

/**
 * A transition on one clip or overlay, `seconds` long. A dip to black also fades the next clip in, so it needs a clip after it on
 * the main track. Null when it does not fit.
 */
export function transitionOn(p: EditProject, target: { kind: "clip" | "overlay"; id: string }, kind: TransitionKind, seconds: number): EditProject | null {
  const len = Math.max(0.1, seconds)
  if (kind === "fade-in") return setFx(p, target.kind, target.id, { fadeIn: len })
  if (kind === "fade-out") return setFx(p, target.kind, target.id, { fadeOut: len })
  if (kind === "fade-both") return setFx(p, target.kind, target.id, { fadeIn: len, fadeOut: len })
  if (kind === "none") return setFx(p, target.kind, target.id, { fadeIn: undefined, fadeOut: undefined })
  const i = target.kind === "clip" ? p.clips.findIndex((c) => c.id === target.id) : -1
  const next = i >= 0 ? p.clips[i + 1] : undefined
  return next ? setFx(setFx(p, "clip", target.id, { fadeOut: len }), "clip", next.id, { fadeIn: len }) : null
}

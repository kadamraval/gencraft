/**
 * The shared shapes of the model layer: what a person has chosen (a Selection), the rules a maker sets between settings,
 * how a model is prompted (a PromptRecipe), where a fact came from (a Source), and a model's Profile.
 *
 * A Profile holds only what hosts cannot tell us and the maker has published: the features, the rules between settings,
 * the file limits, how to prompt it. Settings, prices and file fields still come from the host's own schema.
 */

export type ModelKind = "image" | "video" | "audio"

/** Where a fact came from. Nothing enters a profile without one. */
export interface Source {
  url: string
  /** The day it was read, ISO date */
  read: string
  tier: "official" | "host" | "third-party"
  note?: string
}

/** What the person has attached and chosen: the input to the rules and the recipe. */
export interface Selection {
  /** The settings by their standard names (resolution, duration, aspect_ratio, generate_audio, ...) */
  values: Record<string, unknown>
  inputs: {
    start: boolean
    end: boolean
    images: number
    videos: number
    audios: number
    /** A video to edit or extend is attached */
    sourceVideo: boolean
    sourceAudio: boolean
  }
  /** The feature in use, when the model has several ("reference", "edit", "extend", "first-last") */
  feature?: string
  /** The seconds of an attached source video, when known */
  sourceSeconds?: number
  /** The seconds of each shot the person wrote, when the model takes shots */
  shots?: number[]
}

/**
 * A rule between settings, as the maker states it. Applied live, so the composer can lock a setting and say why in
 * the person's own words ("Length is set by the video you are editing").
 */
export interface Rule {
  id: string
  when: (s: Selection) => boolean
  /** Settings this fixes: the value is not a choice while the rule holds. A function when the value depends on the selection. */
  lock?: Record<string, unknown> | ((s: Selection) => Record<string, unknown>)
  /** Settings narrowed to these values */
  only?: Record<string, unknown[]>
  /** Settings that do not apply while the rule holds */
  hide?: string[]
  /** A caution that does not block */
  warn?: string
  /** Why, in a creator's words */
  reason: string
}

export interface RuleResult {
  /** The settings after the rules: locks applied, values outside a narrowed list moved to its first choice */
  values: Record<string, unknown>
  locked: Record<string, { value: unknown; reason: string }>
  narrowed: Record<string, { allowed: unknown[]; reason: string }>
  hidden: Record<string, string>
  warnings: string[]
}

/** Everything the recipe may need to write the request's prompt. */
export interface RecipeContext {
  prompt: string
  selection: Selection
  /** One entry per shot the person wrote, with its seconds, when the model takes shots */
  shots?: Array<{ text: string; seconds: number }>
  /** The length of the clip in seconds when known */
  totalSeconds?: number
}

/** How to get a good result from a model, as deterministic code. */
export interface PromptRecipe {
  /** The prompt as the model wants it written (shots in its syntax, camera commands, audio quoting) */
  shape?: (ctx: RecipeContext) => string
  /** Settings the recipe starts from when the person has not chosen */
  defaults?: Record<string, unknown>
  /** A few short lines shown under the prompt box */
  tips?: string[]
  /** Warnings about a prompt that will probably go wrong; never blocks */
  lint?: (ctx: RecipeContext) => string[]
}

export interface FileLimits {
  images?: { max: number; note?: string }
  videos?: { max: number; maxSeconds?: number; note?: string }
  audios?: { max: number; maxSeconds?: number; note?: string }
  /** Files together (Seedance 2.5: 50) */
  total?: number
}

/** The ways a model takes files that exclude each other (Seedance: first frame, first and last frame, references). */
export interface InputMode {
  id: string
  label: string
  /** What it needs */
  needs: Array<"start" | "end" | "images" | "videos" | "audios" | "sourceVideo">
  /** Modes it cannot be used with */
  excludes?: string[]
}

export interface ModelTask {
  id: "edit" | "extend"
  label: string
  /** The word under a tile */
  short: string
  /** One line a person can read: what choosing it does */
  hint: string
}

export interface Profile {
  id: string
  /** The maker's names for the model, matched to a host's record by words and version numbers */
  names: string[]
  maker: string
  kind: ModelKind
  /** Standard, Fast, Pro, Lite */
  variant?: string
  /** Words that must be in the host's endpoint, to tell a variant from its sibling ("fast", "lite") */
  variantWords?: string[]
  /** Words that must NOT be, so "Seedance 2.0" does not take "Seedance 2.0 Fast" */
  notWords?: string[]
  inputs?: FileLimits
  /** The maker takes shots written in the prompt, not as a field: the composer offers Multi-shot where a host has no switch of its own */
  shotsInPrompt?: boolean
  /** How the maker names the nth attached picture in a prompt (1 is the first attached); "Image 1" when the maker has no tag of its own */
  imageTag?: (n: number) => string
  modes?: InputMode[]
  /** Things this model does with a video you give it, chosen by the person (the model has no endpoint of its own for them) */
  tasks?: ModelTask[]
  rules: Rule[]
  recipe: PromptRecipe
  sources: Source[]
}

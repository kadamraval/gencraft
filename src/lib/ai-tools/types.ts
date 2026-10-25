import type { EditKind } from "@/lib/registry/edit-actions"

/**
 * An AI tool is one named job a person does by hand on a clip, a sound or a picture: Remove background, Upscale, Voice isolation. The
 * catalog describes each tool once, in the words the industry uses, and every place that offers tools (Story/Edit, Create, the Library, the
 * agents, Apps) reads the same catalog. Nothing here is specific to one screen.
 */

export type MediaKind = "audio" | "video" | "image"

/** Where a tool is being offered. Story/Edit does not offer picture tools. */
export type Surface = "edit" | "create" | "library" | "agent" | "apps"

export type ToolKind =
  /** Runs through a model the person has a key for */
  | "model"
  /** Acts on the whole cut in Story/Edit (assemble, cut silences, match colour). Nothing to buy. */
  | "cut"
  /** Runs on the device with no model (extract a frame, make a GIF) */
  | "local"

export interface ToolChoice {
  value: string | number
  label: string
}

/**
 * A setting of a tool, in plain words. `keys` are the names the providers use for it; the runner sends it under whichever one the chosen
 * model really has, and leaves it out when the model has none.
 */
export interface ToolOption {
  id: string
  label: string
  type: "choice" | "number" | "toggle" | "text"
  keys: string[]
  choices?: ToolChoice[]
  /** The choices are whatever the chosen model lists for this setting (languages differ from model to model) */
  fromSchema?: boolean
  min?: number
  max?: number
  step?: number
  default?: string | number | boolean
  hint?: string
}

/** Another file besides the main one: a voice to sync to, a mask */
export interface ToolNeed {
  kind: MediaKind
  label: string
  required: boolean
}

export interface ToolSpec {
  id: string
  /** The name the industry uses */
  name: string
  /** Other names people search for */
  also?: string[]
  /** The kind of media it works on */
  group: MediaKind
  kind: ToolKind
  /** One short line: what it does */
  hint: string
  /** What the result is */
  output: MediaKind
  needs?: ToolNeed[]
  /** The tool needs words from the person (what to remove, how to restyle) */
  prompt?: { label: string; placeholder: string; required: boolean }
  options?: ToolOption[]
  /**
   * What to tell a picture model that has no tool of its own for this job but follows instructions (the database lists such a model as an
   * "alternative"). `{prompt}` is what the person typed. Without it the person's words follow the sentence.
   */
  instruction?: string
  /** Done by an endpoint of the person's own video model (Extend, Lip-sync, Motion transfer, Edit): the registry already finds those */
  viaEditAction?: EditKind
  /** Done by a model of the audio kind the registry lists: speech, music, or sound effects */
  viaAudioTask?: "speech" | "music" | "sfx"
  /** Cut tools: the job written out for the edit agent */
  automation?: string
  /** Tools in Story/Edit's task row, in this order */
  featured?: number
  /** True where a runnable model is not needed to offer the tool at all */
  free?: boolean
}

/** Why a tool can or cannot be run right now */
export type ToolStatus =
  | { state: "ready" }
  /** No model of the right kind is switched on or keyed */
  | { state: "needs-model"; reason: string; /** key: no provider is keyed; model: keyed, but none of the models does this */ missing: "key" | "model" }
  | { state: "needs-file"; reason: string }

import type { MediaAsset } from "@/types"

/**
 * An app is a saved recipe: what the person fills in, and the steps that turn it into a result. It is data, not code, so the
 * Agent can write one for any request and the app screen can run any of them.
 */

/** video and audio are uploads of a clip or a sound (to edit, extend, copy the motion of, lip-sync). brand is a choice among the person's Brand Studio kits: its words go where {id} is written, and its logo goes where it is listed in references. */
export type InputType = "text" | "longtext" | "image" | "images" | "pdf" | "video" | "audio" | "brand" | "select" | "slider" | "number" | "toggle"

/** What a thing the person hands the app IS, its role. It decides the block, the icon, and how the model is told about the picture. */
export const INPUT_KINDS = ["character", "place", "product", "clothing", "drawing", "style", "picture", "video", "sound", "document", "link", "text", "choice", "brand"] as const
export type InputKind = (typeof INPUT_KINDS)[number]

export interface AppInput {
  id: string
  label: string
  type: InputType
  /** The role of this input. A picture's role also says which kind of reference the model is told it is (a character, a place, a product, a prop). */
  kind?: InputKind
  /** An upload is drawn as a block with this icon, a name from ICONS (for example user, map-pin, package). Required for uploads. */
  icon?: string
  required?: boolean
  /** One line under the field, or under the title of an upload block */
  hint?: string
  /** An upload drawn as a small slot (start image, end image, a motion clip) instead of a card. Slots go three to a row, cards two. */
  compact?: boolean
  placeholder?: string
  /** For a choice */
  options?: string[]
  /** For a slider or a number */
  min?: number
  max?: number
  step?: number
  default?: string | number | boolean
}

export type StepKind = "read_pdf" | "read_page" | "text" | "image" | "video" | "audio"

export const GENERATE_KINDS = ["image", "video", "audio"] as const
export type GenerateStepKind = (typeof GENERATE_KINDS)[number]

export interface AppStep {
  id: string
  /** Shown while it runs, for example "Reading the PDF" */
  title: string
  kind: StepKind
  /** For text and generation steps: the instruction. {inputId} is replaced by what the person gave, {stepId} by an earlier step's text. */
  prompt?: string
  /** For text steps: how the model should behave */
  system?: string
  /** For read_pdf: the id of a pdf input. For read_page: the id of a text input holding the address. */
  source?: string
  /** For generation steps: a model id from the person's models, or "auto" for the best switched-on one of that kind */
  model?: string
  /** Fixed settings for the model, by the model's own setting names */
  params?: Record<string, unknown>
  /** Settings the person controls: the model's setting name → the id of the input that sets it */
  paramInputs?: Record<string, string>
  /** Which of the model's own settings the person may change in the app (the others stay as set). Empty or absent: the common ones (aspect ratio, count, length, quality). */
  userSettings?: string[]
  /** Where the reference pictures come from: an image input, a brand input (its logo), or the id of an earlier image step (its results). They go to the model in this order. */
  references?: string[]
  /** The first frame of a video: an image input or an earlier image step. Only for a model that has a start frame. */
  start?: string
  /** The last frame of a video: an image input or an earlier image step. Only for a model that has an end frame. */
  end?: string
  /** A video the model works on (edit, extend, copy the motion): a video input or an earlier video step. Only for a model that takes one. */
  sourceVideo?: string
  /** A sound the model works on (a voice to lip-sync): an audio input or an earlier audio step. Only for a model that takes one. */
  sourceAudio?: string
  /** How many results this step makes (pictures only) */
  count?: number
}

export interface AppSpec {
  id: string
  name: string
  /** A name from ICONS */
  icon: string
  /** The tint behind the icon, a name from COLORS */
  color: string
  description: string
  inputs: AppInput[]
  steps: AppStep[]
  /** Ids of the steps whose results are shown. Empty means every generation step and the last text step. */
  output?: string[]
  /** Made by us for everyone, or by the person for themselves */
  system?: boolean
  createdAt?: number
}

/** The icons an app can have. A fixed list, so the Agent cannot name one that does not exist. */
export const ICONS = [
  "sparkles", "image", "images", "film", "music", "file-text", "wand", "palette", "building", "home", "shirt", "shopping-bag", "camera",
  "megaphone", "mail", "message-square", "book-open", "pen-tool", "layout", "box", "package", "scissors", "heart", "star", "coffee", "utensils", "car", "plane", "map", "globe",
  "user", "map-pin", "video", "link", "type", "sliders",
] as const

/** The tints an app's icon can sit on. Names only, drawn by the app screens from the design tokens. */
export const COLORS = ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] as const

export type InputValue = string | number | boolean | string[] | File | undefined

/** A picture handed to a model. The name is how the prompt points at it: the prompt says @Character and the composer writes the model's own tag for it. */
export interface AppReference {
  name: string
  url: string
  /** A character, place, product or prop reference is told to the model as what it shows; any other picture is just an attached picture */
  category?: "character" | "location" | "product" | "prop"
}

export interface GenerateRequest {
  kind: GenerateStepKind
  modelId: string
  prompt: string
  params: Record<string, unknown>
  /** The pictures the model is given, each with the name the prompt uses for it (@Character) and the kind of reference it is */
  references: AppReference[]
  start?: string
  end?: string
  sourceVideo?: string
  sourceAudio?: string
  count: number
}

export interface StepEvent {
  stepId: string
  title: string
  state: "running" | "done" | "error"
  text?: string
  error?: string
}

/** What the engine needs from the outside, so it can be tested without any provider */
export interface RunDeps {
  readPdf: (file: File) => Promise<string>
  readPage: (url: string) => Promise<string>
  text: (prompt: string, system?: string) => Promise<string>
  generate: (req: GenerateRequest) => Promise<{ assets: MediaAsset[]; costUsd: number }>
  /** The person's brand kit by id: its words, and its logo when it has one */
  brand?: (id: string) => { text: string; logoUrl?: string } | undefined
  onStep?: (event: StepEvent) => void
  signal?: AbortSignal
}

export interface RunResult {
  /** Text of every step that produced text, by step id */
  texts: Record<string, string>
  assets: MediaAsset[]
  costUsd: number
  /** What to show: the texts and the assets the app's output asks for */
  shown: { texts: Array<{ stepId: string; title: string; text: string }>; assets: MediaAsset[] }
}

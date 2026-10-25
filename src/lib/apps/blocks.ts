import { slotsOf } from "./capabilities"
import { describeArrangement } from "./layout"
import { INPUT_KINDS } from "./types"
import type { AppInput, AppSpec, AppStep, InputKind } from "./types"
import type { ModelRecord } from "@/lib/registry/types"

/**
 * From what the person asked for to the blocks of the app, in code. The agent does not guess the blocks: it writes down a brief
 * (what the app makes, everything the person gives it), and the blocks follow from the brief and from what the chosen model really
 * takes. The agent chooses the words (labels, hints, defaults); the structure is decided here, and the finished draft is checked
 * against the brief, so an app can never leave out something the person said they would give.
 */

export const GIVES_KINDS = INPUT_KINDS
export type GivesKind = InputKind

export interface Brief {
  /** What comes out */
  makes: Array<{ kind: "image" | "video" | "audio" | "text"; note?: string }>
  /** Everything the person hands the app, one item each */
  gives: Array<{ label: string; kind: GivesKind; required?: boolean; options?: string[]; hint?: string }>
  /** What the agent decided on its own, in plain words */
  assumptions?: string[]
}

/** The block each kind of thing becomes. Subjects are cards; a style is a small slot. */
const BLOCK: Record<GivesKind, { type: AppInput["type"]; icon?: string; compact?: boolean; required: boolean }> = {
  character: { type: "image", icon: "user", required: true },
  place: { type: "image", icon: "map-pin", required: true },
  product: { type: "image", icon: "package", required: true },
  clothing: { type: "image", icon: "shirt", required: true },
  drawing: { type: "image", icon: "pen-tool", required: true },
  style: { type: "image", icon: "palette", compact: true, required: false },
  picture: { type: "image", icon: "image", required: true },
  video: { type: "video", icon: "video", required: true },
  sound: { type: "audio", icon: "music", required: true },
  document: { type: "pdf", icon: "file-text", required: true },
  link: { type: "text", required: true },
  text: { type: "longtext", required: false },
  choice: { type: "select", required: false },
  brand: { type: "brand", required: false },
}

const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "") || "input"

/** The type of input a kind of thing needs. A link and a note are both typed text. */
export const inputTypesFor = (kind: GivesKind): AppInput["type"][] => (kind === "text" || kind === "link" ? ["text", "longtext"] : [BLOCK[kind].type])

export interface Suggested {
  inputs: AppInput[]
  /** Where each block goes in a make step, by the model's own slots */
  step: Pick<AppStep, "references" | "start" | "end" | "sourceVideo" | "sourceAudio">
  notes: string[]
  /** How each picture is pointed at in a prompt: the placeholder and the @name, which the composer turns into the model's own tag for it */
  mentions: string[]
  /** How the screen will arrange these blocks, in words */
  arrangement: string
}

/** The blocks for a brief and the model that will make the result */
export function blocksFor(brief: Brief, model: ModelRecord | undefined, pool: ModelRecord[]): Suggested {
  const used = new Set<string>()
  const unique = (label: string) => {
    let id = snake(label)
    for (let n = 2; used.has(id); n++) id = `${snake(label)}_${n}`
    used.add(id)
    return id
  }
  const inputs: AppInput[] = brief.gives.map((g) => {
    const b = BLOCK[g.kind]
    const input: AppInput = { id: unique(g.label), label: g.label, type: b.type, kind: g.kind, required: g.required ?? b.required }
    if (b.icon) input.icon = b.icon
    if (b.compact) input.compact = true
    if (g.hint) input.hint = g.hint
    if (g.kind === "choice") input.options = g.options && g.options.length >= 2 ? g.options : ["Option 1", "Option 2"]
    if (g.kind === "link") input.placeholder = "Paste a link"
    return input
  })

  const notes: string[] = []
  const pictures = inputs.filter((i) => i.type === "image")
  const brands = inputs.filter((i) => i.type === "brand")
  const step: Suggested["step"] = {}
  const slots = model ? slotsOf(model, pool) : undefined
  const makesVideo = model?.modality === "video"

  if (slots && makesVideo && slots.start && pictures.length > 0) {
    // A video with a start frame: the first picture is where it starts, the second where it ends
    step.start = pictures[0]!.id
    if (slots.end && pictures[1]) step.end = pictures[1]!.id
    const rest = pictures.slice(step.end ? 2 : 1)
    if (rest.length > 0 && slots.pictures > 0) step.references = rest.map((i) => i.id)
    else if (rest.length > 0) notes.push(`${rest.map((i) => i.label).join(", ")} cannot be used: ${model!.name} takes only a start${slots.end ? " and an end" : ""} frame`)
  } else if (pictures.length > 0) {
    step.references = pictures.map((i) => i.id)
    if (slots && slots.pictures === 0) notes.push(`${model!.name} takes no pictures: pick a model whose line lists reference pictures`)
    else if (slots && pictures.length > slots.pictures) notes.push(`${model!.name} takes at most ${slots.pictures} reference picture${slots.pictures === 1 ? "" : "s"} but the person gives ${pictures.length}: pick a model that takes ${pictures.length}`)
  }
  if (brands.length > 0 && slots && slots.pictures > 0) step.references = [...(step.references ?? []), ...brands.map((i) => i.id)]
  const clip = inputs.find((i) => i.type === "video")
  const voice = inputs.find((i) => i.type === "audio")
  if (clip) {
    step.sourceVideo = clip.id
    if (slots && !slots.video) notes.push(`${model!.name} cannot work on a video: pick a model whose line says "a video to work on"`)
  }
  if (voice) {
    step.sourceAudio = voice.id
    if (slots && !slots.audio) notes.push(`${model!.name} cannot work on a sound: pick a model whose line says "a sound to work on"`)
  }
  if (inputs.some((i) => i.type === "pdf")) notes.push("A document is read by a read_pdf step first; use its text in the prompt as {step_id}")
  if (inputs.some((i) => i.id && i.placeholder === "Paste a link")) notes.push("A link is read by a read_page step first; use its text in the prompt as {step_id}")
  const mentions = inputs.filter((i) => i.type === "image" || i.type === "images").map((i) => `{${i.id}} or @${i.label}`)
  return { inputs, step, notes, mentions, arrangement: describeArrangement(inputs) }
}

/** What the draft leaves out of the brief: each thing the person gives must have a block of its kind */
export function coverage(brief: Brief, spec: AppSpec): string[] {
  const problems: string[] = []
  const taken = new Set<string>()
  for (const g of brief.gives) {
    const types = inputTypesFor(g.kind)
    const found = spec.inputs.find((i) => !taken.has(i.id) && types.includes(i.type))
    if (!found) problems.push(`the person gives "${g.label}" (a ${g.kind}), but the app has no ${types[0]} input for it. Add one.`)
    else taken.add(found.id)
  }
  for (const m of brief.makes) {
    const kinds = m.kind === "text" ? ["text", "read_pdf", "read_page"] : [m.kind]
    if (!spec.steps.some((s) => kinds.includes(s.kind))) problems.push(`the app should make ${m.kind === "audio" ? "a sound" : "a " + m.kind}, but no step makes one. Add a ${m.kind} step.`)
  }
  return problems
}

/** Finished apps built from our own blocks, shown to the agent as examples of what good looks like. Models are "auto": the real ones come from the list. */
export const EXAMPLES: Array<Omit<AppSpec, "id">> = [
  {
    name: "Character clone",
    icon: "user",
    color: "violet",
    description: "Turn your character into the character in a reference picture: your face, their outfit, pose and look.",
    inputs: [
      { id: "character", label: "My character", type: "image", kind: "character", icon: "user", required: true, hint: "Your own character. Its face and identity are kept." },
      { id: "reference", label: "Reference character", type: "image", kind: "character", icon: "user", required: true, hint: "The character whose outfit, pose and look to copy" },
      { id: "notes", label: "Notes", type: "text", placeholder: "Anything to keep or change" },
    ],
    steps: [{ id: "clone", title: "Making the picture", kind: "image", model: "auto", references: ["character", "reference"], prompt: "Transform {character} into {reference}. Keep the face, identity and skin tone of {character} exactly the same. Give them the clothing, hairstyle, pose and overall appearance of {reference}. {notes}" }],
  },
  {
    name: "Poster that moves",
    icon: "film",
    color: "orange",
    description: "Describe a poster and get it as a picture and as a short video.",
    inputs: [{ id: "idea", label: "Idea", type: "longtext", required: true, placeholder: "What is the poster about?" }],
    steps: [
      { id: "poster", title: "Making the poster", kind: "image", model: "auto", prompt: "A striking poster: {idea}" },
      { id: "clip", title: "Animating it", kind: "video", model: "auto", start: "poster", prompt: "A slow, smooth camera move over the poster" },
    ],
  },
  {
    name: "Brand post",
    icon: "megaphone",
    color: "pink",
    description: "A social post in your brand's colors, with its logo.",
    inputs: [
      { id: "brand", label: "Brand", type: "brand" },
      { id: "product", label: "Product", type: "image", kind: "product", icon: "package", required: true, hint: "The product to show" },
      { id: "message", label: "Message", type: "text", placeholder: "What should the post say?" },
    ],
    steps: [{ id: "post", title: "Making the post", kind: "image", model: "auto", references: ["product", "brand"], prompt: "A social media post showing {product}, with the brand's logo. Message: {message}. Brand facts: {brand}" }],
  },
]

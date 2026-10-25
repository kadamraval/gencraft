import { GENERATE_KINDS } from "./types"
import type { AppInput, AppReference, AppSpec, AppStep, GenerateStepKind, InputValue, RunDeps, RunResult } from "./types"
import type { MediaAsset } from "@/types"

/**
 * Runs an app: its steps in order, each one reading what the person gave and what the steps before it made. The engine
 * knows nothing about providers: reading, writing text and making media come in through `deps`.
 */

export type Values = Record<string, InputValue>

const isFile = (v: unknown): v is File => typeof File !== "undefined" && v instanceof File

/** The text a value stands for inside a prompt. Pictures and files stand for nothing: they travel as references. */
function textOfValue(input: AppInput | undefined, v: InputValue): string {
  if (v === undefined || v === null) return ""
  if (!input) return String(v)
  if (input.type === "image" || input.type === "images" || input.type === "pdf" || input.type === "video" || input.type === "audio" || input.type === "brand") return ""
  if (input.type === "toggle") return v ? "yes" : "no"
  return String(v)
}

/** The kind of reference a picture input is told to the model as: the roles Create's Elements have. Any other picture is attached plain. */
export function categoryOf(input: AppInput): AppReference["category"] {
  const byKind = { character: "character", place: "location", product: "product", clothing: "prop" } as const
  if (input.kind && input.kind in byKind) return byKind[input.kind as keyof typeof byKind]
  if (input.kind) return undefined
  // An app written before roles were kept on inputs: the icon says what the block is for
  const byIcon: Record<string, AppReference["category"]> = { user: "character", "map-pin": "location", package: "product", shirt: "prop" }
  return input.icon ? byIcon[input.icon] : undefined
}

const urlsIn = (v: InputValue): string[] => (typeof v === "string" && v ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [])

/** The names a picture input is known by in the prompt: its label, or the label and a number for each picture of a strip */
export function pictureNames(input: AppInput, v: InputValue): string[] {
  const urls = urlsIn(v)
  return input.type === "images" ? urls.map((_, i) => `${input.label} ${i + 1}`) : urls.length > 0 ? [input.label] : []
}

/** Fills {name} with the person's answer or an earlier step's text. A picture is written as @Label, the name the model is told it by. A name that is not known is left as it is. */
export function fill(template: string, inputs: Map<string, AppInput>, values: Values, texts: Record<string, string>): string {
  const filled = template.replace(/\{([a-z][a-z0-9_]*)\}/g, (whole, name: string) => {
    if (name in texts) return texts[name]!
    const input = inputs.get(name)
    if (!input) return whole
    if (input.type === "image" || input.type === "images") return pictureNames(input, values[name]).map((n) => `@${n}`).join(", ")
    return textOfValue(input, values[name])
  })
  // A picture that was not given (it was optional) cannot be pointed at: its @mention is taken out
  let out = filled
  for (const input of inputs.values()) {
    if ((input.type !== "image" && input.type !== "images") || pictureNames(input, values[input.id]).length > 0) continue
    out = out.replace(new RegExp("\\s*@" + input.label.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&") + "(?:\\s\\d+)?", "gi"), "")
  }
  return out === filled ? out : out.replace(/[ \t]{2,}/g, " ")
}

/** The inputs that are required and still empty, by label */
export function missingInputs(spec: AppSpec, values: Values): string[] {
  return spec.inputs
    .filter((i) => i.required)
    .filter((i) => {
      const v = values[i.id]
      if (v === undefined || v === null || v === "") return true
      if (Array.isArray(v)) return v.length === 0
      return false
    })
    .map((i) => i.label)
}

/** The default answers of an app's inputs */
export function defaultValues(spec: AppSpec): Values {
  const out: Values = {}
  for (const i of spec.inputs) {
    if (i.default !== undefined) out[i.id] = i.default
    else if (i.type === "select" && i.options?.length) out[i.id] = i.options[0]!
    else if (i.type === "slider" || i.type === "number") out[i.id] = i.min ?? 0
    else if (i.type === "toggle") out[i.id] = false
  }
  return out
}

/** The settings of a make step: its fixed ones, then the ones the person set (numbers read as numbers, toggles as true or false) */
export function paramsFor(step: AppStep, inputs: Map<string, AppInput>, values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(step.params ?? {}) }
  for (const [name, inputId] of Object.entries(step.paramInputs ?? {})) {
    const input = inputs.get(inputId)
    const v = values[inputId]
    if (v === undefined || v === "") continue
    out[name] = input?.type === "slider" || input?.type === "number" ? Number(v) : input?.type === "toggle" ? Boolean(v) : v
  }
  return out
}

export function referencesFor(step: AppStep, values: Values): string[] {
  const out: string[] = []
  for (const id of step.references ?? []) {
    const v = values[id]
    if (typeof v === "string" && v) out.push(v)
    else if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === "string"))
  }
  return out
}

export async function runApp(spec: AppSpec, values: Values, deps: RunDeps): Promise<RunResult> {
  const missing = missingInputs(spec, values)
  if (missing.length > 0) throw new Error(`Fill in: ${missing.join(", ")}.`)
  const inputs = new Map(spec.inputs.map((i) => [i.id, i]))
  const texts: Record<string, string> = {}
  const madeBy: Record<string, MediaAsset[]> = {}
  let costUsd = 0

  // A brand input: its kit's words stand where {id} is written, its logo goes where it is listed in references
  const brandLogo: Record<string, string> = {}
  for (const input of spec.inputs) {
    if (input.type !== "brand") continue
    const id = typeof values[input.id] === "string" ? String(values[input.id]) : ""
    const kit = id && deps.brand ? deps.brand(id) : undefined
    texts[input.id] = kit?.text ?? ""
    if (kit?.logoUrl) brandLogo[input.id] = kit.logoUrl
  }
  /** The addresses a name stands for: what the person gave, a brand's logo, or what an earlier step made */
  const urlsOf = (id: string | undefined): string[] => {
    if (!id) return []
    if (madeBy[id]) return madeBy[id]!.map((a) => a.url).filter(Boolean)
    if (brandLogo[id]) return [brandLogo[id]!]
    const v = values[id]
    if (typeof v === "string" && v && inputs.get(id)?.type !== "brand") return [v]
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string")
    return []
  }

  /** What a name in a step's references hands the model: pictures with the name the prompt uses for each */
  const referencesOf = (id: string): AppReference[] => {
    const input = inputs.get(id)
    if (madeBy[id]) return madeBy[id]!.filter((a) => a.url).map((a, i, all) => ({ name: all.length > 1 ? `Earlier result ${i + 1}` : "Earlier result", url: a.url }))
    if (input?.type === "brand") return brandLogo[id] ? [{ name: `${input.label} logo`, url: brandLogo[id]! }] : []
    if (input && (input.type === "image" || input.type === "images")) {
      const urls = urlsIn(values[id])
      const names = pictureNames(input, values[id])
      return urls.map((url, i) => ({ name: names[i]!, url, category: input.type === "image" ? categoryOf(input) : undefined }))
    }
    return urlsOf(id).map((url) => ({ name: "Picture", url }))
  }

  for (const step of spec.steps) {
    if (deps.signal?.aborted) throw new Error("Stopped.")
    deps.onStep?.({ stepId: step.id, title: step.title, state: "running" })
    try {
      if (step.kind === "read_pdf") {
        const file = values[step.source ?? ""]
        if (!isFile(file)) throw new Error("No PDF was given.")
        texts[step.id] = await deps.readPdf(file)
      } else if (step.kind === "read_page") {
        const raw = String(values[step.source ?? ""] ?? "").trim()
        if (!raw) throw new Error("No web address was given.")
        texts[step.id] = await deps.readPage(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      } else if (step.kind === "text") {
        texts[step.id] = (await deps.text(fill(step.prompt ?? "", inputs, values, texts), step.system ? fill(step.system, inputs, values, texts) : undefined)).trim()
      } else if ((GENERATE_KINDS as readonly string[]).includes(step.kind)) {
        const made = await deps.generate({
          kind: step.kind as GenerateStepKind,
          modelId: step.model ?? "auto",
          prompt: fill(step.prompt ?? "", inputs, values, texts),
          params: paramsFor(step, inputs, values),
          references: (step.references ?? []).flatMap(referencesOf),
          start: urlsOf(step.start)[0],
          end: urlsOf(step.end)[0],
          sourceVideo: urlsOf(step.sourceVideo)[0],
          sourceAudio: urlsOf(step.sourceAudio)[0],
          count: step.count ?? 1,
        })
        madeBy[step.id] = made.assets
        costUsd += made.costUsd
      }
      deps.onStep?.({ stepId: step.id, title: step.title, state: "done", text: texts[step.id] })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      deps.onStep?.({ stepId: step.id, title: step.title, state: "error", error })
      throw new Error(`${step.title}: ${error}`)
    }
  }

  const assets = Object.values(madeBy).flat()
  const wanted = spec.output && spec.output.length > 0 ? new Set(spec.output) : null
  const lastTextId = [...spec.steps].reverse().find((s) => s.kind === "text")?.id
  const shownTexts = spec.steps
    .filter((s) => s.kind === "text" && (wanted ? wanted.has(s.id) : s.id === lastTextId))
    .map((s) => ({ stepId: s.id, title: s.title, text: texts[s.id] ?? "" }))
    .filter((t) => t.text)
  const shownAssets = spec.steps.filter((s) => (wanted ? wanted.has(s.id) : (GENERATE_KINDS as readonly string[]).includes(s.kind))).flatMap((s) => madeBy[s.id] ?? [])
  return { texts, assets, costUsd, shown: { texts: shownTexts, assets: shownAssets } }
}

/** What a run would cost: the sum of its make steps, or null when any price is unknown */
export function estimateApp(spec: AppSpec, values: Values, priceOf: (step: AppStep, params: Record<string, unknown>, inputs: AppInput[]) => number | null): number | null {
  const inputs = new Map(spec.inputs.map((i) => [i.id, i]))
  let total = 0
  for (const step of spec.steps) {
    if (!(GENERATE_KINDS as readonly string[]).includes(step.kind)) continue
    const p = priceOf(step, paramsFor(step, inputs, values), spec.inputs)
    if (p === null) return null
    total += p
  }
  return total
}

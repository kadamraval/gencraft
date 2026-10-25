import type { ModelRecord, ParamProperty } from "@/lib/registry/types"
import { needOf, slotsOf, versionFor } from "./capabilities"
import { COLORS, GENERATE_KINDS, ICONS } from "./types"
import type { AppInput, AppSpec, AppStep } from "./types"

/**
 * Checks a recipe against the person's real models before it is saved. The Agent writes recipes, and it can only name
 * settings the models really have: anything else is sent back with the reason, so it cannot invent one.
 */

export interface RegistryView {
  get: (id: string) => ModelRecord | undefined
  /** The models the person can run now: keyed, and switched on */
  listed: () => ModelRecord[]
}

const INPUT_TYPES = ["text", "longtext", "image", "images", "pdf", "video", "audio", "brand", "select", "slider", "number", "toggle"]
const UPLOADS = ["image", "images", "pdf", "video", "audio"]
const STEP_KINDS = ["read_pdf", "read_page", "text", "image", "video", "audio"]
const ID = /^[a-z][a-z0-9_]{0,30}$/

export const placeholdersOf = (template: string | undefined): string[] => [...(template ?? "").matchAll(/\{([a-z][a-z0-9_]*)\}/g)].map((m) => m[1]!)

/** Whether a value is something this setting of the model accepts */
export function acceptsValue(prop: ParamProperty, value: unknown): string | null {
  if (prop.enum && prop.enum.length > 0) return prop.enum.map(String).includes(String(value)) ? null : `must be one of ${prop.enum.join(", ")}`
  if (prop.type === "boolean") return typeof value === "boolean" ? null : "must be true or false"
  if (prop.type === "number" || prop.type === "integer") {
    if (typeof value !== "number" || Number.isNaN(value)) return "must be a number"
    if (prop.minimum !== undefined && value < prop.minimum) return `must be at least ${prop.minimum}`
    if (prop.maximum !== undefined && value > prop.maximum) return `must be at most ${prop.maximum}`
  }
  return null
}

/** Which input types can set a model setting */
function inputFits(input: AppInput, prop: ParamProperty): string | null {
  if (prop.enum && prop.enum.length > 0) {
    if (input.type !== "select") return `needs a choice input, because the model only allows ${prop.enum.join(", ")}`
    const bad = (input.options ?? []).filter((o) => !prop.enum!.map(String).includes(o))
    return bad.length > 0 ? `its options ${bad.join(", ")} are not allowed by the model (allowed: ${prop.enum.join(", ")})` : null
  }
  if (prop.type === "boolean") return input.type === "toggle" ? null : "needs a toggle input"
  if (prop.type === "number" || prop.type === "integer") {
    if (input.type !== "slider" && input.type !== "number") return "needs a slider or number input"
    if (prop.minimum !== undefined && input.min !== undefined && input.min < prop.minimum) return `its minimum ${input.min} is below the model's ${prop.minimum}`
    if (prop.maximum !== undefined && input.max !== undefined && input.max > prop.maximum) return `its maximum ${input.max} is above the model's ${prop.maximum}`
    return null
  }
  return input.type === "text" || input.type === "longtext" || input.type === "select" ? null : "needs a text or choice input"
}

export function validateSpec(spec: AppSpec, registry: RegistryView): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const err = (m: string) => errors.push(m)

  if (!spec.name || spec.name.trim().length < 2 || spec.name.length > 40) err("name must be 2 to 40 characters")
  if (!(ICONS as readonly string[]).includes(spec.icon)) err(`icon "${spec.icon}" is not one of: ${ICONS.join(", ")}`)
  if (!(COLORS as readonly string[]).includes(spec.color)) err(`color "${spec.color}" is not one of: ${COLORS.join(", ")}`)
  if (!spec.description || spec.description.length > 200) err("description must be one short sentence (up to 200 characters)")
  if (!Array.isArray(spec.inputs)) err("inputs must be a list")
  if (!Array.isArray(spec.steps) || spec.steps.length === 0) err("steps must have at least one step")
  if (errors.length > 0 && (!Array.isArray(spec.inputs) || !Array.isArray(spec.steps))) return { ok: false, errors }
  if (spec.inputs.length > 10) err("an app can have at most 10 inputs")
  if (spec.inputs.filter((i) => i.type === "image" || i.type === "pdf" || i.type === "video" || i.type === "audio").length > 6) err("an app can have at most 6 upload blocks (use a multiple-pictures input to take several of one kind)")
  if (spec.steps.length > 8) err("an app can have at most 8 steps")

  const inputs = new Map<string, AppInput>()
  for (const i of spec.inputs) {
    if (!ID.test(i.id ?? "")) err(`input id "${i.id}" must be lowercase letters, digits and underscores, starting with a letter`)
    else if (inputs.has(i.id)) err(`input id "${i.id}" is used twice`)
    inputs.set(i.id, i)
    if (!INPUT_TYPES.includes(i.type)) err(`input "${i.id}" has an unknown type "${i.type}" (use: ${INPUT_TYPES.join(", ")})`)
    if (!i.label || i.label.length > 40) err(`input "${i.id}" needs a label of up to 40 characters`)
    if (UPLOADS.includes(i.type) && !(ICONS as readonly string[]).includes(i.icon ?? "")) err(`input "${i.id}" is an upload, so it needs an icon from: ${ICONS.join(", ")}`)
    if (i.icon !== undefined && !(ICONS as readonly string[]).includes(i.icon)) err(`input "${i.id}" icon "${i.icon}" is not one of: ${ICONS.join(", ")}`)
    if (i.type === "select" && (!Array.isArray(i.options) || i.options.length < 2 || i.options.length > 12)) err(`input "${i.id}" is a choice and needs 2 to 12 options`)
    if (i.type === "select" && i.default !== undefined && !(i.options ?? []).includes(String(i.default))) err(`input "${i.id}" default must be one of its options`)
    if ((i.type === "slider" || i.type === "number") && (typeof i.min !== "number" || typeof i.max !== "number" || i.min >= i.max)) err(`input "${i.id}" needs min and max, with min below max`)
  }

  const stepIds = new Set<string>()
  const earlierText = new Set<string>()
  for (const s of spec.steps as AppStep[]) {
    if (!ID.test(s.id ?? "")) err(`step id "${s.id}" must be lowercase letters, digits and underscores, starting with a letter`)
    else if (stepIds.has(s.id) || inputs.has(s.id)) err(`step id "${s.id}" is already used`)
    if (!STEP_KINDS.includes(s.kind)) {
      err(`step "${s.id}" has an unknown kind "${s.kind}" (use: ${STEP_KINDS.join(", ")})`)
      continue
    }
    if (!s.title) err(`step "${s.id}" needs a title`)

    for (const ph of placeholdersOf(s.prompt).concat(placeholdersOf(s.system))) {
      if (!inputs.has(ph) && !earlierText.has(ph)) err(`step "${s.id}" uses {${ph}}, which is neither an input nor the text of an earlier step`)
    }

    if (s.kind === "read_pdf") {
      if (inputs.get(s.source ?? "")?.type !== "pdf") err(`step "${s.id}" reads a PDF, so source must be the id of a pdf input`)
    } else if (s.kind === "read_page") {
      const src = inputs.get(s.source ?? "")
      if (!src || (src.type !== "text" && src.type !== "longtext")) err(`step "${s.id}" reads a web page, so source must be the id of a text input holding the address`)
    } else if (s.kind === "text") {
      if (!s.prompt || s.prompt.trim().length < 5) err(`step "${s.id}" needs a prompt`)
    } else if ((GENERATE_KINDS as readonly string[]).includes(s.kind)) {
      if (!s.prompt || s.prompt.trim().length < 5) err(`step "${s.id}" needs a prompt`)
      if (s.count !== undefined && (!Number.isInteger(s.count) || s.count < 1 || s.count > 4)) err(`step "${s.id}" count must be 1 to 4`)
      const rec = s.model && s.model !== "auto" ? registry.get(s.model) : undefined
      if (s.model && s.model !== "auto") {
        if (!rec) err(`step "${s.id}" names the model "${s.model}", which does not exist`)
        else if (rec.modality !== s.kind) err(`step "${s.id}" makes ${s.kind}s but "${s.model}" makes ${rec.modality}`)
        else if (!registry.listed().some((m) => m.id === rec.id)) err(`step "${s.id}": the model "${s.model}" is not switched on or has no key`)
      } else if (!registry.listed().some((m) => m.modality === s.kind)) {
        err(`step "${s.id}" needs a ${s.kind} model, and none is available. Add a provider key and switch one on.`)
      }
      // What each name stands for: an input of the right kind, or the result of an earlier step of the right kind
      const kindOfStep = (id: string) => (spec.steps as AppStep[]).find((x) => x.id === id && stepIds.has(id))?.kind
      const source = (field: string, id: string | undefined, inputTypes: string[], stepKind: string) => {
        if (id === undefined) return
        const input = inputs.get(id)
        if (input ? !inputTypes.includes(input.type) : kindOfStep(id) !== stepKind) err(`step "${s.id}" ${field} "${id}" must be the id of ${inputTypes.length > 1 ? "a picture or brand" : "a " + inputTypes[0]} input, or of an earlier ${stepKind} step`)
      }
      for (const ref of s.references ?? []) source("reference", ref, ["image", "images", "brand"], "image")
      // Pictures are pointed at by name (@Character), never by position: the composer turns the name into the model's own tag for that picture
      const words = s.prompt ?? ""
      if (/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+(picture|image|photo|reference|one)\b/i.test(words) || /\b(picture|image|photo)\s*#?\d\b/i.test(words)) {
        const example = (s.references ?? []).map((r) => inputs.get(r)).find((i) => i && (i.type === "image" || i.type === "images"))
        err("step \"" + s.id + "\" points at pictures by their position (\"first picture\", \"image 2\"). Name them instead, with their placeholder or @name" + (example ? ", for example {" + example.id + "} or @" + example.label : "") + ". The model is then told which picture is which.")
      }
      for (const ref of s.references ?? []) {
        const input = inputs.get(ref)
        if (!input || (input.type !== "image" && input.type !== "images")) continue
        const named = new RegExp("\\{" + ref + "\\}").test(words) || new RegExp("@" + input.label.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&"), "i").test(words)
        if (!named) err("step \"" + s.id + "\" sends \"" + input.label + "\" to the model, but its prompt never names it. Write {" + ref + "} or @" + input.label + " where it belongs, for example: \"Redraw {" + ref + "} in the style of ...\".")
      }
      source("start frame", s.start, ["image"], "image")
      source("end frame", s.end, ["image"], "image")
      source("source video", s.sourceVideo, ["video"], "video")
      source("source audio", s.sourceAudio, ["audio"], "audio")

      // What the model really takes, read as the composer reads it (the model with its other versions at the same provider)
      const need = needOf(s, spec.inputs)
      const pool = registry.listed()
      const wants = need.pictures > 0 || need.start || need.end || need.video || need.audio
      if (rec) {
        const slots = slotsOf(rec, pool)
        const name = `"${rec.name}"`
        let said = false
        const say = (m: string) => {
          said = true
          err(`step "${s.id}" ${m}`)
        }
        if (need.pictures > 0 && slots.pictures === 0) say(`sends reference pictures, but ${name} does not take them. Pick a model whose line says it takes pictures.`)
        else if (need.pictures > slots.pictures) say(`sends ${need.pictures} pictures, but ${name} takes at most ${slots.pictures}. Pick a model that takes at least ${need.pictures}, or use fewer picture inputs.`)
        if (need.start && !slots.start) say(`gives a start frame, but ${name} has no start frame. Pick a model whose line says start frame.`)
        if (need.end && !slots.end) say(`gives an end frame, but ${name} has no end frame. Pick a model whose line says end frame.`)
        if (need.video && !slots.video) say(`gives a video to work on, but ${name} does not take one. Pick a model whose line says a video to work on.`)
        if (need.audio && !slots.audio) say(`gives a sound to work on, but ${name} does not take one. Pick a model whose line says a sound to work on.`)
        if (!said && !versionFor(rec, pool, need)) say(`is missing something ${name} cannot run without (see REQUIRES in its line): a start frame, a reference picture, a video or a sound. Give it one, or pick another model.`)
      } else if ((!s.model || s.model === "auto") && wants && !pool.some((m) => m.modality === s.kind && versionFor(m, pool, need))) {
        err(`step "${s.id}" hands over ${need.pictures > 0 ? `${need.pictures} picture${need.pictures === 1 ? "" : "s"}` : "files"}${need.start ? ", a start frame" : ""}${need.end ? ", an end frame" : ""}${need.video ? ", a video" : ""}${need.audio ? ", a sound" : ""}, but no ${s.kind} model you have takes that. Use fewer or name a model that does.`)
      }
      if (rec) {
        for (const name of s.userSettings ?? []) if (!rec.params.properties[name]) err(`step "${s.id}": userSettings lists "${name}", but "${rec.name}" has no such setting`)
      }
      // Settings are checked against the exact model when one is named. With "auto" the model is chosen at run time and settings it lacks are skipped.
      if (rec) {
        for (const [name, value] of Object.entries(s.params ?? {})) {
          const prop = rec.params.properties[name]
          if (!prop) err(`step "${s.id}": "${rec.name}" has no setting called "${name}"`)
          else {
            const bad = acceptsValue(prop, value)
            if (bad) err(`step "${s.id}": setting "${name}" ${bad}`)
          }
        }
        for (const [name, inputId] of Object.entries(s.paramInputs ?? {})) {
          const prop = rec.params.properties[name]
          const input = inputs.get(inputId)
          if (!prop) err(`step "${s.id}": "${rec.name}" has no setting called "${name}"`)
          else if (!input) err(`step "${s.id}": setting "${name}" is controlled by input "${inputId}", which does not exist`)
          else {
            const bad = inputFits(input, prop)
            if (bad) err(`step "${s.id}": input "${inputId}" cannot control "${name}": ${bad}`)
          }
        }
      } else {
        for (const inputId of Object.values(s.paramInputs ?? {})) if (!inputs.has(inputId)) err(`step "${s.id}": a setting is controlled by input "${inputId}", which does not exist`)
      }
    }
    stepIds.add(s.id)
    if (s.kind === "read_pdf" || s.kind === "read_page" || s.kind === "text") earlierText.add(s.id)
  }

  // Every input must do something: be written into a prompt, sent to a model, read by a step, or set one of its settings
  const used = new Set<string>()
  for (const st of spec.steps as AppStep[]) {
    for (const ph of placeholdersOf(st.prompt).concat(placeholdersOf(st.system))) used.add(ph)
    for (const r of [...(st.references ?? []), st.start, st.end, st.sourceVideo, st.sourceAudio, st.source]) if (r) used.add(r)
    for (const inputId of Object.values(st.paramInputs ?? {})) used.add(inputId)
  }
  for (const i of spec.inputs) if (!used.has(i.id)) err("input \"" + i.id + "\" is never used by any step. Use it in a prompt, send it to a model, or remove it.")

  for (const id of spec.output ?? []) if (!stepIds.has(id)) err(`output lists "${id}", which is not a step`)
  const produces = (spec.steps as AppStep[]).some((s) => s.kind === "text" || (GENERATE_KINDS as readonly string[]).includes(s.kind))
  if (!produces) err("the app must have at least one text or generation step, so there is something to show")
  return { ok: errors.length === 0, errors }
}

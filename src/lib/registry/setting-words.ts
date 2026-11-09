import { plainName } from "./plain-names"
import data from "./setting-words.json"
import type { ParamProperty } from "./types"

/**
 * What a setting is called, and what it does, in words anyone understands. Providers name their fields for programmers (enhance_model,
 * face_enhancement_creativity); a panel shows the plain name and an info line instead. The words live in `setting-words.json`, one table
 * for every model: a setting of the same name means the same thing on every provider. A setting not listed keeps the provider's own title,
 * and its own description as the info line, so nothing is left blank. This file holds no words of its own, only the rules for using them.
 */

interface Words {
  label: string
  info: string
}

const WORDS = data.words as Record<string, Words>
const CHOICES = data.choices as Record<string, Record<string, Words>>
const FILE_CHOICES = data.fileChoices.map((c) => ({ re: new RegExp(c.match, c.flags), label: c.label, info: c.info }))
const EDITOR = data.editor as Record<string, string>
const SMALL = new Set(data.titleCase.small)
const ACRONYM = data.titleCase.acronyms as Record<string, string>

/** Every word starts with a capital (Face Strength), small joining words stay small, and acronyms keep their capitals (SD Model) */
export function titleCase(text: string): string {
  return text
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w) || w === "") return w
      const bare = w.toLowerCase().replace(/[^a-z]/g, "")
      if (ACRONYM[bare]) return w.replace(new RegExp(bare, "i"), ACRONYM[bare]!)
      if (i > 0 && SMALL.has(bare)) return w.toLowerCase()
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join("")
}

const first = (text: string | undefined): string | undefined => {
  if (!text) return undefined
  const one = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0]!
  return one.length > 160 ? `${one.slice(0, 157)}…` : one
}

const readable = (key: string) => key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())

/** The plain name and the info line for a model's setting */
export function settingWords(key: string, prop: Pick<ParamProperty, "title" | "description">): { label: string; info?: string } {
  const known = WORDS[key.toLowerCase()]
  if (known) return { label: titleCase(known.label), info: known.info }
  return { label: titleCase(plainName(key) ?? (prop.title && prop.title !== key ? prop.title : readable(key))), info: first(prop.description) }
}

/** A choice a provider names for programmers, in plain words: "blue hour light" and "low-angle" read as they are; "None" stays */
export const plainChoice = (value: string | number): string => titleCase(String(value).replace(/[_]+/g, " "))

/** A choice in plain words, with its line when the table has one */
export function choiceWords(key: string, value: string | number): { label: string; info?: string } {
  const known = CHOICES[key.toLowerCase()]?.[String(value).toLowerCase()]
  if (known) return { label: titleCase(known.label), info: known.info }
  // A model file (name, .safetensors, hash) reads as what it is for, or as its bare name
  if (/\.(safetensors|ckpt|pt)\b|\[[0-9a-f]{6,}\]/i.test(String(value))) {
    const hit = FILE_CHOICES.find((c) => c.re.test(String(value)))
    return hit ? { label: hit.label, info: hit.info } : { label: titleCase(String(value).replace(/\.(safetensors|ckpt|pt)\b/i, "").replace(/\s*\[[0-9a-f]+\]/i, "").replace(/[_-]+/g, " ").trim()) }
  }
  return { label: plainChoice(value) }
}

/** Info lines for the editor's own controls (the free adjust sliders, camera, light, skin), by their name */
export const editorInfo = (label: string): string | undefined => EDITOR[label]

import { CATEGORY_LABEL, REFERENCE_PRIORITY, STYLE_CATEGORIES, isReferenceCategory } from "./types"
import type { ElementItem, StyleCategory } from "./types"

/**
 * Builds what is really sent: the prompt, and the ordered reference images.
 *
 * Rules, in order:
 *  1. The user's own words come first and are never rewritten, except that @Name becomes the name.
 *  2. Reference elements and attached images fill the model's reference slots. A model that cannot take
 *     reference images gets none. An element with words of its own is then written into the prompt in those words
 *     instead; one without is left out, and the notes say so.
 *  3. When there are more images than slots, every element keeps one image before any keeps a second, and
 *     characters keep theirs before products, props and locations.
 *  4. Style elements add one short phrase each, and only one per category (two lights would contradict).
 *  5. The added text is capped so it never drowns the request.
 */

export interface PlainReference {
  id: string
  name: string
  url: string
}

export interface ComposeInput {
  prompt: string
  elements: ElementItem[]
  /** Images the user attached directly, in the order they were added */
  references: PlainReference[]
  /** How many reference images the model takes. Zero means none. */
  referenceLimit: number
  /** Phrases from chosen skills, added after the style elements */
  skillPhrases?: string[]
  /** One shot per line: the person's lines stay as lines, and what is added follows after a blank line */
  multiShot?: boolean
  /** How the model's maker names the nth attached picture ("Image 1", "<ref_image_0>"); "image 1" when it has no tag */
  imageTag?: (n: number) => string
}

export interface ComposeResult {
  prompt: string
  /** Reference images to send, in order */
  imageUrls: string[]
  /** The same images, grouped by what they show (one group per element or attachment) */
  groups: string[][]
  /** Short messages for the user: what was left out and why */
  notes: string[]
  /** Style elements that were actually added */
  appliedStyles: ElementItem[]
  /** How this model reads each chosen element, by element id: as which image, in words, or not at all */
  reads: Record<string, string>
}

const MAX_STYLE_CHARS = 480

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

export function composePrompt(input: ComposeInput): ComposeResult {
  const notes: string[] = []
  const limit = Math.max(0, input.referenceLimit)

  // Reference candidates: elements by priority, then the user's own attachments
  const referenceElements = input.elements
    .filter((e) => isReferenceCategory(e.category) && e.imageUrls.length > 0)
    .map((e, index) => ({ e, index }))
    .sort((a, b) => REFERENCE_PRIORITY.indexOf(a.e.category as never) - REFERENCE_PRIORITY.indexOf(b.e.category as never) || a.index - b.index)
    .map((x) => x.e)

  type Owner = { label: string; category?: string; all: string[]; urls: string[] }
  const owners: Owner[] = [
    ...referenceElements.map((e) => ({ label: e.name, category: CATEGORY_LABEL[e.category].toLowerCase(), urls: [], all: e.imageUrls })),
    ...input.references.map((r) => ({ label: r.name, urls: [], all: [r.url] })),
  ]

  // Round robin: every owner gets a first image before any gets a second
  let used = 0
  for (let round = 0; used < limit; round++) {
    let any = false
    for (const o of owners) {
      const next = o.all[round]
      if (next === undefined) continue
      any = true
      if (used >= limit) break
      o.urls.push(next)
      used++
    }
    if (!any) break
  }

  // Lay out in order, grouped per owner, and number them
  const imageUrls: string[] = []
  const numbered: Array<{ label: string; category?: string; numbers: number[] }> = []
  for (const o of owners) {
    if (o.urls.length === 0) continue
    const numbers = o.urls.map((u) => {
      imageUrls.push(u)
      return imageUrls.length
    })
    numbered.push({ label: o.label, category: o.category, numbers })
  }

  // A reference element that got no picture slot is told in its own words when it has them, otherwise it is left out
  const inWords: ElementItem[] = []
  const reads: Record<string, string> = {}
  for (const e of referenceElements) {
    const hit = numbered.find((n) => n.label === e.name && n.category === CATEGORY_LABEL[e.category].toLowerCase())
    if (hit) continue
    const why = limit === 0 ? "this model cannot take reference images" : `the model takes ${limit} reference image${limit === 1 ? "" : "s"}`
    if (e.text.trim()) {
      inWords.push(e)
      notes.push(`${e.name} is written in words: ${why}.`)
    } else {
      reads[e.id] = `Left out: ${why}. Add words to it to use it here.`
      notes.push(`${e.name} was left out: ${why}.`)
    }
  }
  if (limit === 0 && input.references.length > 0) notes.push("Attached images were left out: this model cannot take reference images.")
  else {
    const dropped = input.references.filter((r) => !numbered.some((n) => n.label === r.name))
    if (dropped.length > 0) notes.push(`${dropped.length} attached image${dropped.length === 1 ? "" : "s"} left out: the model takes ${limit}.`)
  }

  const tag = input.imageTag
  const where = (n: number[]) => (tag ? n.map(tag).join(", ") : n.length === 1 ? `image ${n[0]}` : `images ${n[0]}-${n[n.length - 1]}`)

  // 1. The user's words: @Name becomes the name, with the image number once images are really attached
  let text = input.multiShot ? input.prompt.trim().replace(/\n\s*\n+/g, "\n") : input.prompt.trim()
  const names = [...new Set([...input.elements.map((e) => e.name), ...input.references.map((r) => r.name)])].sort((a, b) => b.length - a.length)
  for (const name of names) {
    const hit = numbered.find((n) => n.label === name)
    text = text.replace(new RegExp(`@${escapeRe(name)}`, "gi"), hit ? `${name} (${where(hit.numbers)})` : name)
  }
  text = text.replace(/@(\w[\w-]*)/g, "$1")

  const parts = [text]

  // Elements told in words, since they have no picture slot
  const wordsFor = inWords.map((e) => `${e.name} (${CATEGORY_LABEL[e.category].toLowerCase()}): ${e.text.trim().replace(/[.s]+$/, "")}`)
  for (const e of inWords) reads[e.id] = "Written into the prompt in words, no picture slot."

  // 2. Which image shows what, only for elements and only when images are sent
  const labelled = numbered.filter((n) => n.category)
  if (labelled.length > 0 && imageUrls.length > 0) {
    parts.push(`Reference images: ${labelled.map((n) => `${where(n.numbers)} ${n.numbers.length === 1 ? "shows" : "show"} ${n.label} (${n.category})`).join("; ")}.`)
  }

  if (wordsFor.length > 0) parts.push(`${wordsFor.join("; ")}.`)
  for (const n of numbered) {
    const e = referenceElements.find((x) => x.name === n.label && CATEGORY_LABEL[x.category].toLowerCase() === n.category)
    if (e) reads[e.id] = `Sent as ${where(n.numbers)}${n.numbers.length < e.imageUrls.length ? ` (${n.numbers.length} of its ${e.imageUrls.length} pictures fit)` : ""}.`
  }

  // 3. Style elements, one per category, capped
  const appliedStyles: ElementItem[] = []
  for (const category of STYLE_CATEGORIES) {
    const chosen = input.elements.filter((e) => e.category === category && e.text.trim()).pop()
    if (chosen) appliedStyles.push(chosen)
  }
  let budget = MAX_STYLE_CHARS
  const phrases: string[] = []
  for (const e of appliedStyles) {
    const phrase = e.text.trim().replace(/[.\s]+$/, "")
    if (phrase.length > budget) {
      notes.push(`${e.name} was left out: the added style text would be too long.`)
      reads[e.id] = "Left out: the added text would be too long."
      continue
    }
    budget -= phrase.length + 2
    reads[e.id] = `Added to the prompt as "${phrase}".`
    phrases.push(`${CATEGORY_LABEL[e.category as StyleCategory].toLowerCase()}: ${phrase}`)
  }
  // Two of one kind (two lights) would contradict: only the last chosen is used
  for (const e of input.elements) {
    if (!isReferenceCategory(e.category) && e.text.trim() && !appliedStyles.includes(e)) reads[e.id] = `Not used: another ${CATEGORY_LABEL[e.category].toLowerCase()} is chosen after it.`
  }
  if (phrases.length > 0) parts.push(`${phrases.join("; ")}.`)

  // Skills add their phrase last, within what is left of the budget
  let skillBudget = 700
  const skillText: string[] = []
  for (const phrase of input.skillPhrases ?? []) {
    const clean = phrase.trim().replace(/[.\s]+$/, "")
    if (!clean) continue
    if (clean.length > skillBudget) {
      notes.push("A skill was left out: the added text would be too long.")
      continue
    }
    skillBudget -= clean.length + 2
    skillText.push(clean)
  }
  if (skillText.length > 0) parts.push(`${skillText.join(", ")}.`)

  const joined = input.multiShot
    ? [parts[0], parts.slice(1).filter(Boolean).join(" ")].filter(Boolean).join("\n\n")
    : parts
        .filter(Boolean)
        .map((p, i) => (i === 0 ? sentence(p) : p))
        .join(" ")
  return {
    prompt: joined.trim(),
    imageUrls,
    groups: owners.filter((o) => o.urls.length > 0).map((o) => o.urls),
    notes,
    appliedStyles,
    reads,
  }
}

import "@/lib/models/profiles"
import { profileFor } from "@/lib/models/profile"
import { familyKey, isEditTask } from "@/lib/registry/families"
import { taskOf } from "@/lib/registry/tasks"
import type { ModelRecord } from "@/lib/registry/types"
import corrections from "./corrections.json"

/**
 * What a model can do, in one shape every screen reads: what it gives, what it takes (each file with its role), what it does, and its
 * abilities. The maker decides it, so it is the same on every provider: a model's capability is everything any of its versions shows,
 * on any provider. It is worked out from the model's own data (its file fields, its task, the jobs the standard database lists for it,
 * the verb in its endpoint path, the LiteLLM badges), never from its name. People see only the short standard set (`standardChips`).
 */

import { isMaskKey } from "../registry/slots"

export type Gives = ModelRecord["category"]
export type FileKind = "image" | "video" | "audio"
/** Why a file is given: a start or end frame, a picture or clip to copy from, a saved element, or the file the result is made from */
export type FileRole = "start" | "end" | "reference" | "element" | "source" | "mask"

export type Does =
  | "make"
  | "edit"
  | "extend"
  | "upscale"
  | "interpolate"
  | "restore"
  | "colorize"
  | "relight"
  | "restyle"
  | "expand"
  | "remove-background"
  | "remove-object"
  | "lip-sync"
  | "motion-transfer"
  | "dub"
  | "sound-for-video"
  | "music-for-video"
  | "speech"
  | "music"
  | "sfx"
  | "transcribe"
  | "separate"
  | "isolate-voice"
  | "denoise-audio"
  | "voice-change"
  | "embed"
  | "chat"

export type Ability = "vision" | "audio-in" | "video-in" | "actions" | "web-search" | "reasoning" | "long-context"

export interface Takes {
  kind: FileKind
  role: FileRole
  /** How many it takes (1 for a single field) */
  max: number
  /** It cannot run without it */
  required?: boolean
}

export interface Capability {
  gives: Gives
  takes: Takes[]
  /** It takes words (a prompt) */
  words: boolean
  does: Does[]
  /** Jobs it was made for (a background remover), as opposed to jobs it does because it follows instructions (an editor) */
  dedicated: Does[]
  abilities: Ability[]
}

/** The job the standard database files a line under, as a verb. Our own job ids, never model names. */
const JOB_VERB: Record<string, Does> = {
  "text-to-image": "make",
  "image-to-image": "edit",
  "image-edit": "edit",
  "text-to-video": "make",
  "image-to-video": "make",
  "reference-to-video": "make",
  "video-edit": "edit",
  "video-extend": "extend",
  "video-lip-sync": "lip-sync",
  "video-motion-transfer": "motion-transfer",
  "video-dub": "dub",
  "video-upscale": "upscale",
  "image-upscale": "upscale",
  "video-slow-motion": "interpolate",
  "video-denoise": "restore",
  "image-restore": "restore",
  "video-colorize": "colorize",
  "image-colorize": "colorize",
  "video-relight": "relight",
  "image-relight": "relight",
  "video-restyle": "restyle",
  "image-restyle": "restyle",
  "video-reframe": "expand",
  "image-outpaint": "expand",
  "video-remove-background": "remove-background",
  "image-remove-background": "remove-background",
  "video-remove-object": "remove-object",
  "image-remove-object": "remove-object",
  "video-sound-effects": "sound-for-video",
  "video-music": "music-for-video",
  "audio-text-to-speech": "speech",
  "audio-text-to-music": "music",
  "audio-text-to-sfx": "sfx",
  "audio-transcribe": "transcribe",
  "audio-stems": "separate",
  "audio-voice-isolation": "isolate-voice",
  "audio-noise-reduction": "denoise-audio",
  "audio-voice-changer": "voice-change",
  "text-embedding": "embed",
  chat: "chat",
}

/** What one of our job ids (a database task or tool, an app's job) means as a verb */
export const verbOfJob = (id: string): Does | undefined => JOB_VERB[id]

/** Verbs the providers put in an endpoint path (".../edit", ".../upscale"). Job words only. */
const PATH_VERBS: Array<[RegExp, Does]> = [
  [/(^|[/_-])(upscal\w*|super-?resolution|sr)($|[/_-])/, "upscale"],
  [/(^|[/_-])(interpolat\w*|slow-?motion|frame-interpolation)($|[/_-])/, "interpolate"],
  [/(^|[/_-])(remove-?background|background-?removal|rembg|matting|remove-bg)($|[/_-])/, "remove-background"],
  [/(^|[/_-])(object-?removal|remove-?object|erase\w*|eraser)($|[/_-])/, "remove-object"],
  [/(^|[/_-])(extend|extension)($|[/_-])/, "extend"],
  [/(^|[/_-])(lip-?sync|lipsync)($|[/_-])/, "lip-sync"],
  [/(^|[/_-])(motion-?control|motion-?transfer)($|[/_-])/, "motion-transfer"],
  [/(^|[/_-])(dub|dubbing)($|[/_-])/, "dub"],
  [/(^|[/_-])(colori[sz]\w*)($|[/_-])/, "colorize"],
  [/(^|[/_-])(relight\w*)($|[/_-])/, "relight"],
  [/(^|[/_-])(restyle|style-?transfer)($|[/_-])/, "restyle"],
  [/(^|[/_-])(reframe|outpaint\w*|expand)($|[/_-])/, "expand"],
  [/(^|[/_-])(restor\w*|deblur|denois\w*)($|[/_-])/, "restore"],
  [/(^|[/_-])(video-to-audio|foley|sound-?effects?)($|[/_-])/, "sound-for-video"],
  [/(^|[/_-])(video-to-music)($|[/_-])/, "music-for-video"],
  [/(^|[/_-])(voice-?chang\w*|voice-?conver\w*)($|[/_-])/, "voice-change"],
  [/(^|[/_-])(stems?|source-?separation|separat\w*)($|[/_-])/, "separate"],
  [/(^|[/_-])(isolat\w*|vocal-?remov\w*)($|[/_-])/, "isolate-voice"],
]

/** A setting that is the model's prompt */
const PROMPT = /^(prompt|text|instruction|instructions|edit_prompt|input_text)$/

interface Correction {
  add?: Does[]
  remove?: Does[]
}
/** Data-only fixes for the few models the reader cannot tell, keyed by an endpoint or a versionId. Reviewed by a person. */
const CORRECTIONS = (corrections as { does?: Record<string, Correction> }).does ?? {}

const add = <T>(list: T[], v: T) => {
  if (!list.includes(v)) list.push(v)
}

const exactCache = new WeakMap<ModelRecord, Capability>()

/** What this one endpoint shows, before its other versions are added */
export function capabilityOfExact(r: ModelRecord): Capability {
  const hit = exactCache.get(r)
  if (hit) return hit
  const out = readExact(r)
  exactCache.set(r, out)
  return out
}

function readExact(r: ModelRecord): Capability {
  const takes: Takes[] = []
  const required = new Set(r.params?.required ?? [])
  const props = r.params?.properties ?? {}
  for (const [key, p] of Object.entries(props)) {
    const s = p.slot
    if (!s) {
      if (isMaskKey(key) && (p.type === undefined || p.type === "string")) takes.push({ kind: "image", role: "mask", max: 1, required: required.has(key) || undefined })
      continue
    }
    takes.push({ kind: s.kind, role: s.role, max: s.list ? (s.max ?? 1) : 1, required: required.has(key) || undefined })
  }
  // A file setting the reader gave no role keeps its kind
  for (const [key, p] of Object.entries(props)) if (!p.slot && !isMaskKey(key) && (p.format === "image" || p.format === "video" || p.format === "audio") && !takes.some((t) => t.kind === p.format && t.role !== "mask")) takes.push({ kind: p.format, role: "reference", max: 1 })
  // A model that lists a kind of file in its inputs but names no field for it takes one, as a reference
  for (const k of r.inputs ?? []) if (k !== "text" && r.category !== "text" && !takes.some((t) => t.kind === k)) takes.push({ kind: k, role: "reference", max: 1 })
  // Words: the provider lists text as an input (the prompt itself is kept out of the settings), or a prompt setting is there. A model
  // from a provider's tool shelf counts as taking words only when it has a prompt setting of its own.
  const promptSetting = Object.keys(props).some((k) => PROMPT.test(k))
  // A model the database lists as doing a job "by being told to" takes words by definition
  const toldTo = (r.serves ?? []).some((x) => x.role === "alternative")
  const words = r.category === "text" || toldTo || promptSetting || ((r.inputs ?? []).includes("text") && !r.utility) || /^text-to-/.test(r.task ?? "")

  // A picture model takes no clips or sounds: such a field is a misread one (listed by the report), not something the maker offers
  if (r.category === "image") for (let i = takes.length - 1; i >= 0; i--) if (takes[i]!.kind !== "image") takes.splice(i, 1)
  // In a picture model, the pictures given with words are the ones it changes: that is what editing a picture is
  if (r.category === "image" && words) for (const t of takes) if (t.kind === "image" && t.role === "reference") t.role = "source"

  const does: Does[] = []
  const dedicated: Does[] = []
  const task = taskOf(r)
  const has = (kind: FileKind, role?: FileRole) => takes.some((t) => t.kind === kind && (!role || t.role === role))

  if (r.category === "text") add(does, "chat")
  else if (task === "transcription") add(does, "transcribe")
  else if (task === "speech") add(does, "speech")
  else if (r.utility !== true && (task === "text-to-image" || task === "text-to-video" || task === "image-to-video" || task === "reference-to-video" || task === "audio-generation")) add(does, "make")
  // The provider files it as an edit. A tool from a provider's tool shelf that takes no words does one fixed job instead.
  if ((task === "image-edit" || task === "video-edit" || task === "audio-edit") && words) add(does, "edit")
  if (task === "audio-from-video") add(does, "sound-for-video")
  if (task === "video-from-audio") add(does, "lip-sync")

  // The shape of what it takes
  if (r.category === "image" && has("image", "source") && words) add(does, "edit")
  if (r.category === "video" && has("video", "source") && has("audio")) add(does, "lip-sync")
  if (r.category === "video" && has("video", "source") && has("image") && !words) add(does, "motion-transfer")

  // A sound model that hears a sound and takes words answers with a changed sound: it edits sound by words (GPT Audio)
  if (r.category === "audio" && has("audio", "source") && words) add(does, "edit")
  // A sound maker its provider describes as making sounds too, not only music, makes sound effects
  if (r.category === "audio" && does.includes("make") && /\bsound effects?\b|\bsfx\b|\bfoley\b|\bmusic and sounds?\b|\bsounds? and music/i.test(`${r.description ?? ""} ${r.endpoint}`)) add(does, "sfx")
  // A clip model that takes the clip it works on plus words changes that clip
  if (r.category === "video" && has("video", "source") && words && !has("audio")) add(does, "edit")
  // Tasks the maker documents inside the model (Seedance edit and extend), from its profile
  // (only on an endpoint that takes the clip)
  if (has("video")) for (const t of profileFor(r)?.tasks ?? []) add(does, t.id === "extend" ? "extend" : "edit")

  // What the standard database lists it for. An "alternative" does the job by following instructions, so it counts as an edit, not as a
  // dedicated model for that job.
  for (const s of r.serves ?? []) {
    const verb = JOB_VERB[s.id]
    if (!verb) continue
    if (s.role === "alternative") {
      if (words) add(does, "edit")
    }
    else {
      add(does, verb)
      if (verb !== "make" && verb !== "edit" && verb !== "chat") add(dedicated, verb)
    }
  }
  // The verb in the endpoint path
  const path = r.endpoint.toLowerCase()
  for (const [re, verb] of PATH_VERBS) {
    if (re.test(path)) {
      add(does, verb)
      add(dedicated, verb)
    }
  }
  if (/(^|[/_-])edit($|[/_-])/.test(path) && words) add(does, "edit")
  // A model whose only job is fixed (an upscaler) is not a maker of new things
  if (dedicated.length > 0 && !words) {
    const i = does.indexOf("make")
    if (i >= 0) does.splice(i, 1)
  }

  // A model made for one job (a remover, a restyler) changes files for that job only: it is not a general editor, unless the database
  // lists it as one
  const listedEditor = (r.serves ?? []).some((x) => x.role !== "alternative" && JOB_VERB[x.id] === "edit")
  if (dedicated.length > 0 && !listedEditor) {
    const i = does.indexOf("edit")
    if (i >= 0) does.splice(i, 1)
  }
  // The file a fixed job works on (a picture to upscale, a clip to matte, a sound to split) is the one it changes
  const own: FileKind | undefined = r.category === "text" ? undefined : r.category
  if (own && dedicated.length > 0 && !has(own, "source")) for (const t of takes) if (t.kind === own && t.role === "reference") t.role = "source"
  // A video model that edits but names its clip field a reference changes that clip: it is the source
  if (r.category === "video" && does.includes("edit") && !has("video", "source")) for (const t of takes) if (t.kind === "video" && t.role === "reference") t.role = "source"

  const fix = CORRECTIONS[r.endpoint] ?? (r.versionId ? CORRECTIONS[r.versionId] : undefined)
  for (const v of fix?.add ?? []) add(does, v)
  for (const v of fix?.remove ?? []) {
    const i = does.indexOf(v)
    if (i >= 0) does.splice(i, 1)
  }

  const abilities: Ability[] = []
  const s = r.summary
  if (r.category === "text") {
    if (s?.vision || r.inputs?.includes("image")) abilities.push("vision")
    if (s?.audioInput || r.inputs?.includes("audio")) abilities.push("audio-in")
    if (s?.videoInput || r.inputs?.includes("video")) abilities.push("video-in")
    if (r.tools) abilities.push("actions")
    if (s?.webSearch) abilities.push("web-search")
    if (s?.reasoning) abilities.push("reasoning")
    if ((s?.contextTokens ?? 0) >= 200_000) abilities.push("long-context")
  }
  return { gives: r.category, takes, words, does, dedicated, abilities }
}

const cache = new WeakMap<ModelRecord, { pool: ModelRecord[]; cap: Capability }>()

/**
 * What the model can do: this endpoint plus its other versions (the maker's model is one model, whichever endpoint or provider runs it).
 * Pass the pool the record came from so its versions are found.
 */
export function capabilityOf(r: ModelRecord, pool: ModelRecord[] = []): Capability {
  if (pool.length === 0) return capabilityOfExact(r)
  const hit = cache.get(r)
  if (hit && hit.pool === pool) return hit.cap
  const own = capabilityOfExact(r)
  const others = pool.length > 0 ? sameModel(r, pool).filter((x) => x !== r) : []
  const out: Capability = { ...own, takes: [...own.takes], does: [...own.does], dedicated: [...own.dedicated], abilities: [...own.abilities] }
  for (const o of others) {
    const c = capabilityOfExact(o)
    // A capability any provider shows belongs to the model. Files are this endpoint's own, so a run sends only what it has.
    for (const v of c.does) if (v !== "make" || !own.dedicated.length) add(out.does, v)
    for (const a of c.abilities) add(out.abilities, a)
  }
  cache.set(r, { pool, cap: out })
  return out
}

/** The same model: its versions at this provider and the same model at other providers */
export function sameModel(r: ModelRecord, pool: ModelRecord[]): ModelRecord[] {
  const { byFamily, byVersion } = indexOf(pool)
  // Its versions at this provider (an edit endpoint stands alone), as familyOf groups them
  const fam = isEditTask(r) ? [r] : [r, ...(byFamily.get(familyKey(r)) ?? []).filter((x) => x !== r && !isEditTask(x))]
  if (!r.versionId) return fam
  const out = [...fam]
  for (const x of byVersion.get(`${r.category}|${r.versionId}`) ?? []) if (!out.includes(x)) out.push(x)
  return out
}

/** The pool grouped once by family and by database model, so finding a model's versions does not scan the whole list each time */
const indexes = new WeakMap<ModelRecord[], { byFamily: Map<string, ModelRecord[]>; byVersion: Map<string, ModelRecord[]> }>()
function indexOf(pool: ModelRecord[]) {
  const hit = indexes.get(pool)
  if (hit) return hit
  const byFamily = new Map<string, ModelRecord[]>()
  const byVersion = new Map<string, ModelRecord[]>()
  for (const x of pool) {
    const f = familyKey(x)
    byFamily.set(f, [...(byFamily.get(f) ?? []), x])
    if (x.versionId) {
      const v = `${x.category}|${x.versionId}`
      byVersion.set(v, [...(byVersion.get(v) ?? []), x])
    }
  }
  const out = { byFamily, byVersion }
  indexes.set(pool, out)
  return out
}

/** The short standard set people see. Everything else stays behind the scenes. */
export type StandardChip = "Create" | "Edit" | "Start frame" | "End frame" | "References" | "Video in" | "Audio in" | "With audio" | "Vision" | "Web search" | "Reasoning" | "Works with Agent"

export function standardChips(c: Capability, withAudio = false): StandardChip[] {
  const out: StandardChip[] = []
  if (c.gives === "text") {
    if (c.abilities.includes("vision")) out.push("Vision")
    if (c.abilities.includes("audio-in")) out.push("Audio in")
    if (c.abilities.includes("video-in")) out.push("Video in")
    if (c.abilities.includes("web-search")) out.push("Web search")
    if (c.abilities.includes("reasoning")) out.push("Reasoning")
    if (c.abilities.includes("actions")) out.push("Works with Agent")
    return out
  }
  if (c.does.includes("make")) out.push("Create")
  if (c.does.some((d) => d !== "make")) out.push("Edit")
  if (c.takes.some((t) => t.role === "start")) out.push("Start frame")
  if (c.takes.some((t) => t.role === "end")) out.push("End frame")
  if (c.takes.some((t) => t.kind === "image" && (t.role === "reference" || t.role === "element"))) out.push("References")
  if (c.takes.some((t) => t.kind === "video")) out.push("Video in")
  if (c.takes.some((t) => t.kind === "audio")) out.push("Audio in")
  if (withAudio) out.push("With audio")
  return out
}

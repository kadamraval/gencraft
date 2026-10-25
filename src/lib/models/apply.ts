import { storyboardPrompt } from "../registry/storyboard"
import type { ModelRecord } from "../registry/types"
import "./profiles"
import { toHost, toStandard, hostFields } from "./names"
import { enhancePrompt } from "./enhance"
import type { Aspect } from "./enhance"
import { freshSeed } from "./seed"
import { attributeOfField } from "../registry/attributes"
import { profileFor } from "./profile"
import { applyRules } from "./rules"
import { plannedShots, totalOf, wanStoryboard } from "./recipes/shots"
import type { InputMode, Selection } from "./types"

/**
 * The one place a model's profile is applied to a run: the maker's rules between settings, its defaults, and its way of
 * writing the prompt. The composer, a fallback attempt and the Agent all come here before the request is built, so a
 * run is shaped the same wherever it starts. A model with no profile passes through unchanged.
 */

export interface RunFiles {
  start?: boolean
  end?: boolean
  images?: number
  videos?: number
  audios?: number
  sourceVideo?: boolean
  sourceAudio?: boolean
  sourceSeconds?: number
}

export interface ShapedRun {
  prompt: string
  params: Record<string, unknown>
  /** Settings the rules fixed, each with the reason in a creator's words */
  locked: Record<string, string>
  warnings: string[]
  /** Settings narrowed to a few values, by the host's field name, with the reason */
  narrowed: Record<string, { allowed: unknown[]; reason: string }>
  /** The ways of giving files that exclude each other, when the maker has them */
  modes: InputMode[]
  /** A few short lines on getting a good result from this model */
  tips: string[]
  /** True when the maker's profile shaped this run */
  profiled: boolean
  /** What the quiet improvement added to a short prompt (empty when it added nothing) */
  improved: Aspect[]
}

type Target = Pick<ModelRecord, "name" | "endpoint" | "modality" | "params">

/** One shot per line when Multi-shot is on and the person has not timed the lines themselves. */
function shotLines(record: Target, prompt: string, params: Record<string, unknown>): { lines: string[]; extras: string } | undefined {
  if (params.multi_shot !== true || record.params.properties.multi_shot?.virtual !== true) return undefined
  // The composer puts what it adds (style, reference notes) after a blank line, so it is not read as a shot
  const [head = "", ...rest] = prompt.split(/\n\s*\n/)
  const lines = head.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.length >= 2 && storyboardPrompt(head, lines.length) !== head ? { lines, extras: rest.join("\n\n").trim() } : undefined
}

/** The task the person chose (edit, extend) travels with the settings under this name and is never sent to a host. */
export const TASK_KEY = "__task"

/** "Send as typed": the person chose to skip the maker's prompt shaping for this run. Never sent to a host either. */
export const PLAIN_KEY = "__plain"

/** The person turned automatic improvement off (Settings): the prompt goes as written. Never sent to a host either. */
export const NO_ENHANCE_KEY = "__noenhance"

/**
 * `live` is true for a run that is really sent. Only then does the quiet logic act (a fresh seed where a model ships a fixed
 * one, missing light and camera added to a short prompt). The composer's preview calls this without it, so what it shows
 * does not change on every render.
 */
export function shapeRun(record: Target, prompt: string, withTask: Record<string, unknown>, files: RunFiles = {}, chosenFeature?: string, live = false): ShapedRun {
  const { [TASK_KEY]: task, [PLAIN_KEY]: asTyped, [NO_ENHANCE_KEY]: noEnhance, ...params } = withTask
  const feature = chosenFeature ?? (typeof task === "string" ? task : undefined)
  const profile = profileFor(record)
  const standard = toStandard(record, params)
  const chosen = Number(standard.duration) > 0 ? Number(standard.duration) : undefined
  const split = shotLines(record, prompt, params)
  const planned = split ? plannedShots(split.lines, chosen ?? split.lines.length * 5) : undefined
  const rows = planned?.shots
  // When every shot has a length of its own, the clip is as long as they add up to
  const seconds = planned?.userSet && rows ? totalOf(rows) : chosen
  const extras = split?.extras ?? ""
  const withExtras = (body: string) => (extras ? `${body}\n\n${extras}` : body)

  // Quiet improvement of a short prompt: only for a real run, never for shots, never when sent as typed
  let text = prompt
  let improved: Aspect[] = []
  if (live && !rows && asTyped !== true) {
    const props = record.params.properties
    const nativeKey = Object.keys(props).find((k) => attributeOfField(k) === "prompt_enhance")
    const nativeValue = nativeKey ? (params[nativeKey] ?? props[nativeKey]!.default) : undefined
    const result = enhancePrompt(prompt, {
      modality: record.modality,
      hasFiles: Boolean(files.start || files.end || files.images || files.videos || files.audios || files.sourceVideo || files.sourceAudio),
      hasTask: Boolean(feature),
      nativeOn: nativeValue === true,
      off: noEnhance === true,
    })
    text = result.prompt
    improved = result.added
  }
  // A fresh seed where a model ships a fixed one, so a retry is a new take
  const reseed = (o: Record<string, unknown>) => {
    if (!live) return
    const seedKey = Object.keys(o).find((k) => k.toLowerCase() === "seed")
    const s = freshSeed(record, seedKey ? o[seedKey] : undefined)
    if (s) o[s.key] = s.value
  }

  const selection: Selection = {
    values: standard,
    inputs: {
      start: !!files.start,
      end: !!files.end,
      images: files.images ?? 0,
      videos: files.videos ?? 0,
      audios: files.audios ?? 0,
      sourceVideo: !!files.sourceVideo,
      sourceAudio: !!files.sourceAudio,
    },
    feature,
    sourceSeconds: files.sourceSeconds,
    // Shots split from the clip's own length always add up to it, so the length rules only read lengths the person set
    shots: planned?.userSet ? rows?.map((r) => r.seconds) : undefined,
  }

  // Without a profile the only shaping is the older one: shots on their own lines become a timestamped storyboard
  if (!profile) {
    const body = rows ? withExtras(wanStoryboard(rows)) : text
    const sent = { ...params }
    reseed(sent)
    return { prompt: body, params: sent, locked: {}, warnings: [], narrowed: {}, modes: [], tips: [], profiled: false, improved }
  }

  const result = applyRules(profile.rules, selection)
  const out: Record<string, unknown> = { ...params }
  const fields = hostFields(record)
  const locked: Record<string, string> = {}
  for (const [name, value] of Object.entries(result.values)) {
    if (!(name in fields) || String(value) === String(standard[name])) continue
    const host = toHost(record, name as keyof typeof fields, value)
    if (host) out[host.key] = host.value
  }
  for (const [name, lock] of Object.entries(result.locked)) {
    const key = fields[name as keyof typeof fields]
    if (key) locked[key] = lock.reason
  }
  const narrowed: ShapedRun["narrowed"] = {}
  for (const [name, n] of Object.entries(result.narrowed)) {
    const key = fields[name as keyof typeof fields]
    if (!key) continue
    const allowed = n.allowed.map((v) => toHost(record, name as keyof typeof fields, v)?.value).filter((v) => v !== undefined)
    if (allowed.length > 0) narrowed[key] = { allowed, reason: n.reason }
  }
  // Sent as typed: the maker's rules still hold (they are hard limits), but its starting values and prompt shape are skipped.
  // Shots are the exception, they only exist in the maker's syntax.
  const plain = asTyped === true && !rows
  // The recipe's starting values fill only what the person has not chosen and the model has a field for
  if (!plain) {
    for (const [key, value] of Object.entries(profile.recipe.defaults ?? {})) {
      if (!(key in out) && key in record.params.properties) out[key] = value
    }
  }

  // The shots are the prompt when they came from its lines, so the recipe writes them alone
  const base = rows ? "" : text
  const written = plain ? prompt : (profile.recipe.shape?.({ prompt: base, selection, shots: rows, totalSeconds: seconds }) ?? (rows ? wanStoryboard(rows) : text))
  const shaped = rows ? withExtras(written) : written
  const warnings = [...result.warnings, ...(profile.recipe.lint?.({ prompt: base, selection, shots: rows, totalSeconds: seconds }) ?? [])]
  reseed(out)
  return { prompt: shaped, params: out, locked, warnings, narrowed, modes: profile.modes ?? [], tips: profile.recipe.tips ?? [], profiled: true, improved }
}

/** What a run attaches, counted from the references the connectors already carry. */
export function filesFrom(r?: {
  startFrameUrl?: string
  endFrameUrl?: string
  images?: string[]
  groups?: string[][]
  sourceVideoUrl?: string
  sourceAudioUrl?: string
}): RunFiles {
  if (!r) return {}
  const grouped = (r.groups ?? []).reduce((n, g) => n + g.length, 0)
  return {
    start: !!r.startFrameUrl,
    end: !!r.endFrameUrl,
    images: Math.max(r.images?.length ?? 0, grouped),
    videos: r.sourceVideoUrl ? 1 : 0,
    audios: r.sourceAudioUrl ? 1 : 0,
    sourceVideo: !!r.sourceVideoUrl,
    sourceAudio: !!r.sourceAudioUrl,
  }
}

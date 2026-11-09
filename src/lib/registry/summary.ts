import { expectedRun } from "@/lib/ledger/run-times"
import { audioSwitchKey } from "./canonical"
import { familyHasMultiShot, familyHasSeed, mergeRefs } from "./families"
import { refSummary } from "./slots"
import type { ModelRecord, ModelSummary, ParamSchema, AppCategory } from "./types"

const RES_ORDER = ["480p", "540p", "720p", "1080p", "1440p", "2k", "4k", "8k"]

export function resRank(label: string): number {
  const l = label.toLowerCase()
  const named = RES_ORDER.indexOf(l)
  if (named >= 0) return named
  const dims = l.match(/(\d{3,4})\s*x\s*(\d{3,4})/)
  if (dims) {
    const longest = Math.max(Number(dims[1]), Number(dims[2]))
    return longest >= 3800 ? 6 : longest >= 2000 ? 5 : longest >= 1900 ? 3 : longest >= 1200 ? 3 : 2
  }
  const p = l.match(/^(\d{3,4})p$/)
  return p ? RES_ORDER.findIndex((r) => r === `${p[1]}p`) : -1
}

function maxResolution(values: Array<string | number>): string | undefined {
  let best: string | undefined
  let bestRank = -1
  for (const v of values) {
    const label = String(v)
    const rank = resRank(label)
    if (rank > bestRank) {
      bestRank = rank
      best = label
    }
  }
  return best ? best.replace(/^(\d+)p$/i, "$1p").replace(/k$/i, "K") : undefined
}

const AUDIO_WORDS = /native audio|(?:with|and|plus|generates?|generating|includes?|built-?in|background|synchroni[sz]ed|synced?)\s+(?:\w+\s+)?(?:audio|sound|speech|voice|music|dialogue)|sound effects?|audio-video|dialogue|lip-?sync/i
const NO_AUDIO_WORDS = /\b(?:no|without|silent|mute)\s+(?:audio|sound)|\bsilent\b/i

/** Facts for the picker row, taken from the parameter schema and the provider's own description. */
export function summarize(category: AppCategory, params: ParamSchema, description = "", opts: { audioKnown?: boolean } = {}): ModelSummary {
  const props = params.properties
  const summary: ModelSummary = {}

  const resolution = props.resolution?.enum ?? props.quality?.enum ?? props.size?.enum ?? props.image_size?.enum
  if (resolution?.length) summary.maxResolution = maxResolution(resolution)

  const duration = props.duration ?? props.seconds ?? props.duration_seconds
  if (duration?.enum?.length) summary.maxSeconds = Math.max(...duration.enum.map((d) => parseFloat(String(d))).filter(Number.isFinite))
  else if (duration?.maximum !== undefined) summary.maxSeconds = duration.maximum

  const count = props.num_images ?? props.n
  if (count?.maximum !== undefined) summary.maxImages = count.maximum
  else if (count?.enum?.length) summary.maxImages = Math.max(...count.enum.map(Number))

  const aspects = (props.aspect_ratio ?? props.aspectRatio)?.enum
  if (aspects?.length) summary.aspects = aspects.map(String)

  if (category === "video") {
    const sayso = Boolean(audioSwitchKey(props)) || (AUDIO_WORDS.test(description) && !NO_AUDIO_WORDS.test(description))
    // When the provider's data is thin (Replicate), silence is not proof: say nothing instead of "no audio"
    if (sayso || opts.audioKnown !== false) summary.audio = sayso
  }
  const refs = refSummary({ params })
  if (refs) summary.refs = refs
  return summary
}

/** What a model takes as input, e.g. "start+end · 3 refs". A limit the provider does not state shows as plain "refs". */
function refsText(refs: ModelSummary["refs"]): string[] {
  if (!refs) return []
  const out: string[] = []
  if (refs.start && refs.end) out.push("start+end")
  else if (refs.start) out.push("start")
  if (refs.images > 0) out.push(refs.stated ? `${refs.images} ${refs.images === 1 ? "ref" : "refs"}` : "refs")
  if (refs.videos > 0) out.push("video ref")
  if (refs.audios > 0) out.push("audio ref")
  return out
}

/** One short line, e.g. "1080p · 10s · audio" or "up to 4K · 4 images". Empty when nothing is known. */
export function formatSummary(category: AppCategory, s: ModelSummary | undefined): string {
  if (!s) return ""
  const parts: string[] = []
  if (category === "video") {
    if (s.maxResolution) parts.push(s.maxResolution)
    if (s.maxSeconds) parts.push(`${s.maxSeconds}s`)
    if (s.audio !== undefined) parts.push(s.audio ? "audio" : "no audio")
    parts.push(...refsText(s.refs))
  } else if (category === "image") {
    if (s.maxResolution) parts.push(`up to ${s.maxResolution}`)
    if (s.maxImages && s.maxImages > 1) parts.push(`${s.maxImages} images`)
    parts.push(...refsText(s.refs))
  } else if (category === "audio") {
    if (s.maxSeconds) parts.push(`${s.maxSeconds}s`)
  } else if (s.contextTokens) {
    parts.push(s.contextTokens >= 1_000_000 ? `${Math.round(s.contextTokens / 100_000) / 10}M context` : `${Math.round(s.contextTokens / 1000)}K context`)
  }
  return parts.join(" · ")
}

const TASK_LABEL: Record<string, string> = {
  "text-to-video": "Text to video",
  "image-to-video": "From an image",
  "video-to-video": "Video to video",
  "text-to-image": "Text to image",
  "image-to-image": "Edit an image",
  "text-to-speech": "Speech",
  "text-to-audio": "Music and sound",
  "audio-to-audio": "Audio to audio",
}

/**
 * The line under a model name: what it takes in, then what it can do. Providers often reuse one display name
 * for several endpoints ("Wan", "Kling Image"), so the task tells them apart when the name does not.
 */
export function rowInfo(m: ModelRecord): string {
  const label = m.task ? TASK_LABEL[m.task] : undefined
  const nameSaysIt = /\b(to|from)\b.*\b(video|image|speech|audio)\b|text to|image to|video to|edit/i.test(m.name)
  return [label && !nameSaysIt ? label : "", formatSummary(m.category, m.summary)].filter(Boolean).join(" · ")
}

const seconds = (n: number) => (n < 60 ? `${Math.round(n)}s` : `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`)
const sizeLabel = (v: string) => v.replace(/k$/i, "K")

/** "2K-4K" when the model offers several named sizes, otherwise its highest one. */
function resolutionChip(m: ModelRecord): string | undefined {
  const props = m.params.properties
  const values = props.resolution?.enum ?? props.quality?.enum ?? props.size?.enum ?? props.image_size?.enum ?? []
  const named = [...new Set(values.map((v) => String(v).toLowerCase()).filter((v) => RES_ORDER.includes(v)))].sort((a, b) => resRank(a) - resRank(b))
  if (named.length >= 2) return `${sizeLabel(named[0]!)}-${sizeLabel(named[named.length - 1]!)}`
  return m.summary?.maxResolution ? sizeLabel(m.summary.maxResolution) : undefined
}

/** "5-10s" for a range, "8s" for one length, "Up to 15s" when only the top is known. */
function durationChip(m: ModelRecord): string | undefined {
  const props = m.params.properties
  const d = props.duration ?? props.seconds ?? props.duration_seconds
  const options = d?.enum?.map((v) => parseFloat(String(v))).filter(Number.isFinite)
  const lo = options?.length ? Math.min(...options) : d?.minimum
  const hi = options?.length ? Math.max(...options) : d?.maximum
  if (typeof lo === "number" && typeof hi === "number" && lo > 0) return lo === hi ? `${hi}s` : `${lo}-${hi}s`
  const max = m.summary?.maxSeconds ?? hi
  return max ? `Up to ${max}s` : undefined
}

/**
 * The badges under a model's name, most important first: what it takes in, then size, length and sound, then
 * the rarer inputs, and last how long a run usually takes here (only once the model has been used, because
 * providers publish no estimate). Nothing is shown for what is not known.
 */
export function rowChips(m: ModelRecord, family: ModelRecord[] = [m]): string[] {
  const s = m.summary
  // What the model can take is what all its versions can take together (see families.ts)
  const r = family.length > 1 ? mergeRefs(family) : s?.refs
  const chips: string[] = []
  // Capabilities in the standard words people see everywhere (see capability/standardChips)
  if (r?.start) chips.push("Start frame")
  if (r?.end) chips.push("End frame")
  if (r && r.images > 0) chips.push("References")
  const res = resolutionChip(m)
  if (res) chips.push(res)
  if (m.category === "video" || m.category === "audio") {
    const length = durationChip(m)
    if (length) chips.push(length)
  }
  if (m.category === "image" && s?.maxImages && s.maxImages > 1) chips.push(`${s.maxImages} images`)
  if (m.category === "video" && s?.audio) chips.push("With audio")
  if (r && r.videos > 0) chips.push("Video in")
  if (r && r.audios > 0) chips.push("Audio in")
  if (m.category === "video" && familyHasMultiShot(family)) chips.push("Multi-shot")
  if (m.category !== "text" && familyHasSeed(family)) chips.push("Seed")
  if (m.category === "text") {
    if (s?.contextTokens) chips.push(s.contextTokens >= 1_000_000 ? `${Math.round(s.contextTokens / 100_000) / 10}M context` : `${Math.round(s.contextTokens / 1000)}K context`)
    if (s?.vision || m.inputs.includes("image")) chips.push("Vision")
    if (s?.reasoning) chips.push("Reasoning")
    if (m.tools) chips.push("Works with Agent")
    if (s?.webSearch) chips.push("Web search")
    if (s?.videoInput || m.inputs.includes("video")) chips.push("Video in")
    if (s?.audioInput || m.inputs.includes("audio")) chips.push("Audio in")
  }
  for (const c of paramChips(m, family)) if (!chips.some((x) => sameChip(x, c))) chips.push(c)
  const run = expectedRun(m.id)
  if (run) chips.push(`~${seconds(run.seconds)}`)
  return chips
}

/** The settings most models of a kind have, in plain words, in the order a person looks for them */
const COMMON_PARAMS: Array<[label: string, key: RegExp]> = [
  ["Resolution", /^(resolution|image_size|size|megapixels)$/],
  ["Aspect", /aspect_ratio/],
  ["Length", /^(duration|duration_seconds|seconds|length|music_length_ms|num_frames)$/],
  ["Quality", /^quality$/],
  ["Images", /^(num_images|n|number_of_images|num_outputs|max_images)$/],
  ["Voice", /^voice(_id|_name)?$/],
  ["Language", /language/],
  ["Instrumental", /instrumental/],
  ["Audio", /^(generate_audio|with_audio|audio)$/],
  ["Negative prompt", /negative_prompt/],
  ["Seed", /^seed$/],
  ["Temperature", /^temperature$/],
  ["Max tokens", /^max_(completion_)?tokens$/],
  ["Reasoning", /reasoning|thinking/],
]
/** Plumbing every provider adds: listed only behind "+N" */
const PLUMBING = /^(output_format|output_compression|enable_safety_checker|safety_tolerance|sync_mode|webhook|image_passthrough|top_p|top_k|frequency_penalty|presence_penalty|stop|stream|logprobs|response_format)$/
/** A file, the prompt itself, or an internal switch: not a setting a badge should name */
const NOT_A_SETTING = /^(prompt|text|input|messages|system_prompt)$|_urls?$|_images?$|^image$|^video$|^audio$|frame$|mask/

const sameChip = (a: string, b: string) => a.toLowerCase() === b.toLowerCase() || (b === "Resolution" && /\d(p|K)$/i.test(a)) || (b === "Length" && /\ds$/.test(a)) || (a === "With audio" && b === "Audio")
const humanize = (key: string) => {
  const words = key.replace(/_/g, " ").replace(/\s+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * What a model's settings are, as badges: the common ones first (resolution, aspect, length, seed), then the ones this model has that most
 * do not, then the plumbing. A row shows what fits; the rest wait behind "+N". Every category gets them, chat models included.
 */
export function paramChips(m: ModelRecord, family: ModelRecord[] = [m]): string[] {
  const keys = new Set<string>()
  for (const r of family) for (const [k, p] of Object.entries(r.params?.properties ?? {})) if (!p.format && !NOT_A_SETTING.test(k)) keys.add(k)
  const common: string[] = []
  const unique: string[] = []
  const plumbing: string[] = []
  const used = new Set<string>()
  for (const [label, re] of COMMON_PARAMS) {
    const hit = [...keys].filter((k) => re.test(k))
    if (hit.length === 0) continue
    common.push(label)
    for (const k of hit) used.add(k)
  }
  for (const k of keys) {
    if (used.has(k)) continue
    ;(PLUMBING.test(k) ? plumbing : unique).push(humanize(k))
  }
  return [...common, ...unique.sort(), ...plumbing]
}

/** The first few badges stay on the row; the rest wait behind a "+N" the person can hover. */
export function splitChips(chips: string[], max = 5): { shown: string[]; more: string[] } {
  if (chips.length <= max) return { shown: chips, more: [] }
  return { shown: chips.slice(0, max), more: chips.slice(max) }
}

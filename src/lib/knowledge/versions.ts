import type { ModelRecord } from "../registry/types"
import type { MakerFamily, MakerList } from "../sheet/types"
import { makerOf, type MakerIndex } from "./identity"

/**
 * Which family and version an endpoint is, read the way people name models: "Kling 3.0 Turbo", "Seedance 2.0 Fast", "Wan 3.0 Prime".
 * The family comes from the maker list (each maker's `families`), the version and its variant from the endpoint words right after the
 * family word. What the endpoint is for (text-to-video, edit ...), its region and its quality tier (standard, pro, 4k) are not part of the
 * model: one version is one model on every provider.
 */

export interface ModelVersion {
  makerId: string
  family: string
  /** "3.0", "O3", "H3", "2.5"; empty for a family with no version (an embedding model named only by its size) */
  version: string
  /** For ordering: 3.0 is [3, 0] */
  num: number[]
  /** The maker's own variant words: "Turbo", "Omni", "Fast", "Prime" */
  variant: string[]
  /** A quality tier of the same model (standard, pro, 4k): a setting, not a model */
  tier?: string
}

/** Segments that say what an endpoint is for or where it runs, never which model it is */
const NOT_MODEL = /^(text|image|video|audio|reference|keyframes|first-last-frame|speech|start-end)-to-(image|video|audio|speech|text|embedding)$|^(edit|edit-image|edit-video|image-edit|video-edit|reference|us|eu|draft|complete|api|video|image|audio|tts|preview|generate|t2v|i2v|r2v|v2v|ti2v|s2v)$/
/** Quality tiers of one model: a setting */
const TIER = /^(standard|std|4k|1080p|720p|480p|master|hq)$/
/** Endpoints that are add-ons of a model, not the model: LoRAs, style presets, galleries, control features */
const ADD_ON = /lora|styles?\/|gallery|camera-controls|recast|insert-video|3d-to-video|realtime|distilled|\/base(\/|$)|transition|kontext-apps|-apps(\/|$)|:|-latest$|\/latest$/
/** Endpoints that are tools of a model (they change a file you have), not the model: they are in the tools, not the families */
const TOOL_ENDPOINT = /motion-control|lip-?sync|videoedit|video-edit|extend|reframe|relight|upscale|avatar|effects|recast|swap/
/** A version token: 3, 3.0, 2-5, v3, o3, q3, k3.1, m3, h3; a size such as 22b is not one, and a four-digit number is a date (2512, 0528) */
const VERSION = /^([oqkmh])?v?(\d{1,3})(?:[.-](\d{1,2}))?$/

interface FamilyEntry extends MakerFamily {
  makerId: string
}

export interface FamilyIndex {
  byMaker: Map<string, FamilyEntry[]>
}

export function familyIndex(list: MakerList): FamilyIndex {
  const byMaker = new Map<string, FamilyEntry[]>()
  for (const mk of list.makers) {
    // The longest word first: "kling-video" before "kling", "gemini-omni-flash" before "gemini"
    const fams = (mk.families ?? []).map((f) => ({ ...f, makerId: mk.id, words: [...f.words].sort((a, b) => b.length - a.length) }))
    byMaker.set(mk.id, fams)
  }
  return { byMaker }
}

const title = (w: string) => (/^\d+b$/i.test(w) ? w.toUpperCase() : /^[a-z]{1,3}$/.test(w) && /^(hd|xl|sd)$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))

/** The family, version, variant and tier an endpoint stands for, or undefined when it is not one of the maker list's families */
export function versionOf(rec: Pick<ModelRecord, "provider" | "endpoint" | "name" | "category">, makers: MakerIndex, families: FamilyIndex, category: string = rec.category): ModelVersion | undefined {
  const endpoint = rec.endpoint.toLowerCase()
  if (ADD_ON.test(endpoint) || TOOL_ENDPOINT.test(endpoint)) return undefined
  const maker = makerOf(rec, makers)
  if (!maker.known) return undefined
  const fams = (families.byMaker.get(maker.id) ?? []).filter((f) => f.category === category)
  // Words in endpoint order, split at "/" and "-"; the family word is a run of them
  const segments = endpoint.split("/").filter(Boolean)
  for (const fam of fams) {
    for (const word of fam.words) {
      // The model's own part first: on Replicate and OpenRouter the first segment is an account ("wan-video"), not the model
      const hit = find(segments, word, 1) ?? find(segments, word, 0)
      if (!hit) continue
      const parsed = readAfter(segments, hit, word)
      if (!parsed) continue
      // A variant word that is already in the family's name says nothing more ("Gemini Omni Flash 1.1 Flash")
      const inName = new Set(fam.name.toLowerCase().split(/\s+/))
      return { makerId: maker.id, family: fam.name, ...parsed, variant: parsed.variant.filter((w) => !inName.has(w.toLowerCase())) }
    }
  }
  return undefined
}

/** Where a family word sits: segment index and the word index inside it where the family ends */
function find(segments: string[], word: string, from: number): { seg: number; end: number; glued?: string } | undefined {
  const wanted = word.split("-")
  for (let s = from; s < (from === 0 ? 1 : segments.length); s++) {
    const words = segments[s]!.split("-")
    for (let i = 0; i + wanted.length <= words.length; i++) {
      const run = words.slice(i, i + wanted.length)
      // The last word may carry the version glued on ("wan2.6", "qwen3.8", "h3"): it starts with the family word
      const last = run[run.length - 1]!
      const exactBefore = run.slice(0, -1).every((w, k) => w === wanted[k])
      if (!exactBefore) continue
      const want = wanted[wanted.length - 1]!
      if (last === want) return { seg: s, end: i + wanted.length }
      if (last.startsWith(want) && /^(\d|v\d)/.test(last.slice(want.length)) && want.length > 1) return { seg: s, end: i + wanted.length, glued: last.slice(want.length) }
      if (want.length === 1 && new RegExp(`^${want}\\d`).test(last)) return { seg: s, end: i + wanted.length, glued: last }
    }
  }
  return undefined
}

function readAfter(segments: string[], hit: { seg: number; end: number; glued?: string }, word: string): Omit<ModelVersion, "makerId" | "family"> | undefined {
  // The words after the family word: the rest of its segment, then the following segments
  const rest = segments[hit.seg]!.split("-").slice(hit.end)
  const glued = hit.glued !== undefined ? [hit.glued] : []
  const sameSeg = [...glued, ...rest]
  const later = segments.slice(hit.seg + 1)
  let version = ""
  let num: number[] = []
  const variant: string[] = []
  let tier: string | undefined
  const take = (tok: string) => {
    const v = VERSION.exec(tok)
    if (!v || /^\d+b$/.test(tok)) return false
    const letter = v[1] ?? (word.length === 1 ? word : "")
    num = [Number(v[2]), ...(v[3] !== undefined ? [Number(v[3])] : [])]
    version = `${letter.toUpperCase()}${v[2]}${v[3] !== undefined ? `.${v[3]}` : ""}`
    return true
  }
  // The version is the first version token after the family word (in its segment, or the next segment: "kling-video/v3")
  let i = 0
  for (; i < sameSeg.length; i++) if (take(sameSeg[i]!)) break
  // A minor version written after a dash ("seedance-1-5-pro" is 1.5)
  if (i < sameSeg.length && num.length === 1 && /^\d{1,2}$/.test(sameSeg[i + 1] ?? "") && !/^\d+b$/.test(sameSeg[i + 1]!)) {
    num.push(Number(sameSeg[i + 1]))
    version = `${version}.${sameSeg[i + 1]}`
    i++
  }
  const gluedAfter = i < sameSeg.length ? sameSeg.slice(i + 1) : sameSeg
  let laterFrom = 0
  if (!version) {
    for (; laterFrom < later.length; laterFrom++) {
      const parts = later[laterFrom]!.split("-")
      if (take(parts[0]!)) {
        gluedAfter.push(...parts.slice(1))
        laterFrom++
        break
      }
      if (!NOT_MODEL.test(later[laterFrom]!)) break
    }
  }
  // Words glued to the version are the maker's variant ("seedance-2.0-fast", "veo-3.1-lite"); "std" glued is a tier
  for (const w of gluedAfter) {
    if (NOT_MODEL.test(w) || /^\d+(\.\d+)?$/.test(w)) continue
    if (TIER.test(w)) tier = w
    else variant.push(w)
  }
  // Separate segments after it: a tier (pro and standard of one model), a variant ("turbo", "omni"), or what it is for
  for (const seg of later.slice(laterFrom)) {
    for (const w of seg.split("-")) {
      if (NOT_MODEL.test(seg) || NOT_MODEL.test(w)) continue
      // "pro" on its own is a variant for now; the build makes it a tier when a standard of the same version exists (Kling, Hailuo)
      if (TIER.test(w)) tier = tier ?? w
      else if (w === "pro") variant.push(w)
      else if (/^[a-z]+$/.test(w) && w.length > 2) variant.push(w)
    }
  }
  if (!version && variant.length === 0) return undefined
  return { version, num, variant: [...new Set(variant)].slice(0, 2).map(title), ...(tier ? { tier } : {}) }
}

/** "Kling 3.0 Turbo": the family, the version as the maker writes it, then the variant */
export function versionName(v: Pick<ModelVersion, "family" | "version" | "variant">): string {
  return [v.family, v.version, ...v.variant].filter(Boolean).join(" ")
}

/** The model id of a version: maker/family-version-variant ("kuaishou/kling-3.0-turbo") */
export function versionId(v: ModelVersion): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "")
  return `${v.makerId}/${slug([v.family, v.version, ...v.variant].filter(Boolean).join(" "))}`
}

/**
 * The key that makes two endpoints the same version on any provider: family, version number without trailing zeros (3 is 3.0) and
 * variant. A version letter is kept where it names another line (Kling O3 is not Kling 3) but not where it is only how the maker writes
 * the number (Hailuo H3 is Hailuo 3). A family that counts in single digits writes 2.5 as "25" somewhere: that is 2.5.
 */
export function versionKey(v: ModelVersion): string {
  let num = [...v.num]
  if (num.length === 1 && num[0]! >= 10 && num[0]! < 100 && !/^0/.test(v.version)) num = [Math.floor(num[0]! / 10), num[0]! % 10]
  while (num.length > 1 && num[num.length - 1] === 0) num.pop()
  const letter = /^[OQKM]/.test(v.version) ? v.version[0] : ""
  return `${v.makerId}|${v.family}|${letter}${num.join(".")}|${v.variant.join(" ").toLowerCase()}`
}

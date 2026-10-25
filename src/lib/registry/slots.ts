import type { ModelRecord, ParamProperty, RefSlot, RefSlotRole, RefSummary } from "./types"

/**
 * Reference inputs, read from what each provider publishes.
 *
 * A model's input schema names its file fields. This module turns those names, their list limits and the
 * limits stated in their descriptions into one small description of what the model can take: a start frame,
 * an end frame, a list of reference images, saved elements, reference video and audio. Nothing is guessed:
 * a limit the provider does not state is reported as not stated, and one image is used.
 */

interface RawField {
  type?: string
  /** For arrays: what one item is */
  items?: { type?: string; isObject?: boolean }
  maxItems?: number
  description?: string
}

const END = /(^|_)(end|last|tail)(_|$)/
const START = /^(image|image_url|input_image|input_image_url|start_image|start_image_url|first_frame|first_frame_url|first_frame_image|first_image_url|init_image|start_frame)$/
const REFERENCE_ONE = /^(reference_image|reference_image_url|ref_image_url|style_image_url|subject_reference|subject_image_url)$/
const IMAGE_LIST = /^(image_urls|reference_images|reference_image_urls|ref_image_urls|input_image_urls|image_input|input_images|image_style_references|images_input|subject_image_urls)$/
const VIDEO_LIST = /^(video_urls|reference_video_urls|reference_videos)$/
const AUDIO_LIST = /^(audio_urls|reference_audio_urls|reference_audios)$/

/** "up to 5", "1-9 images", "maximum 7 total", "Max 4" in the provider's own description of the field. */
export function limitFromText(text: string | undefined): { max: number; shared: boolean } | null {
  if (!text) return null
  const t = text.replace(/\s+/g, " ")
  // A count is followed by what is counted, never by a size or a time ("Max 30 MB", "up to 15 seconds")
  const notUnit = "(?!\\s*(?:mb|gb|kb|px|pixels?|s\\b|sec|seconds?|min|fps|mp|%|x\\d))"
  const patterns: RegExp[] = [
    new RegExp(`\\b(?:up to|at most|no more than|maximum of|maximum|max\\.?|limited to)\\s+(\\d+)\\b${notUnit}`, "gi"),
    /\(\s*\d+\s*[-–]\s*(\d+)\s*(?:images?|files?|urls?|videos?|clips?)?\s*\)/gi,
    /\b\d+\s*[-–]\s*(\d+)\s*(?:images?|files?|videos?|clips?)\b/gi,
    /\b(\d+)\s+(?:reference\s+)?(?:images?|videos?)\s+(?:max|maximum)\b/gi,
  ]
  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const max = Number(m[1])
      if (Number.isFinite(max) && max > 0 && max < 100) return { max, shared: /\btotal\b/i.test(t) }
    }
  }
  return null
}

/** Decides what a file field is for. Returns null for fields that are not reference inputs. */
export function detectSlot(key: string, field: RawField, modality: ModelRecord["modality"]): RefSlot | null {
  const k = key.toLowerCase()
  const list = field.type === "array"
  const stated = field.maxItems ? { max: field.maxItems, shared: false } : limitFromText(field.description)
  const make = (kind: RefSlot["kind"], role: RefSlotRole): RefSlot => ({
    kind,
    role,
    list,
    max: list ? (stated?.max ?? null) : 1,
    shared: stated?.shared || undefined,
    objectItems: field.items?.isObject || undefined,
  })

  if (list) {
    if (k === "elements" && field.items?.isObject) return make("image", "element")
    if (field.items?.isObject) return null
    if (IMAGE_LIST.test(k)) return make("image", "reference")
    if (VIDEO_LIST.test(k)) return make("video", "reference")
    if (AUDIO_LIST.test(k)) return make("audio", "reference")
    return null
  }

  if (/(^|_)(video)(_url)?$/.test(k) && !/mask|reference/.test(k)) return make("video", "source")
  if (/(^|_)audio(_url|_file)?$/.test(k)) return make("audio", "source")
  if (/image|frame/.test(k)) {
    if (END.test(k)) return make("image", "end")
    if (modality === "video" && START.test(k)) return make("image", "start")
    if (START.test(k) || REFERENCE_ONE.test(k)) return make("image", "reference")
  }
  return null
}

export interface RefCapability {
  /** Single start and end frame fields, when the model has them */
  start?: { key: string }
  end?: { key: string }
  /** The list or field that takes reference images. `max` is how many it takes. */
  images?: { key: string; list: boolean; max: number; stated: boolean }
  /** Kling-style saved elements: each takes a main image and a few more angles */
  elements?: { key: string; max: number; stated: boolean }
  videos?: { key: string; list: boolean; max: number; stated: boolean }
  audios?: { key: string; list: boolean; max: number; stated: boolean }
  /** A single video or audio the model works on (motion source, lip-sync voice) */
  sourceVideo?: { key: string }
  sourceAudio?: { key: string }
  /** What must be given before the model can run */
  needs: Array<"start" | "reference" | "video" | "audio">
}

const entry = (key: string, s: RefSlot) => ({ key, list: s.list, max: s.max ?? 1, stated: s.max !== null })

/** Reads a record's slots into the shape the composer and the runner use. */
export function refCapability(record: Pick<ModelRecord, "params">): RefCapability {
  const cap: RefCapability = { needs: [] }
  const required = new Set(record.params.required ?? [])
  for (const [key, p] of Object.entries(record.params.properties)) {
    const s = p.slot
    if (!s) continue
    if (s.role === "start") {
      cap.start = { key }
      if (required.has(key)) cap.needs.push("start")
    } else if (s.role === "end") cap.end = { key }
    else if (s.role === "element") cap.elements = { key, max: s.max ?? 1, stated: s.max !== null }
    else if (s.role === "reference" && s.kind === "image") {
      // Prefer the list over a single field when a model has both
      if (!cap.images || (s.list && !cap.images.list)) cap.images = entry(key, s)
      if (required.has(key)) cap.needs.push("reference")
    } else if (s.role === "reference" && s.kind === "video") cap.videos = entry(key, s)
    else if (s.role === "reference" && s.kind === "audio") cap.audios = entry(key, s)
    else if (s.role === "source" && s.kind === "video") {
      cap.sourceVideo = { key }
      if (required.has(key)) cap.needs.push("video")
    } else if (s.role === "source" && s.kind === "audio") {
      cap.sourceAudio = { key }
      if (required.has(key)) cap.needs.push("audio")
    }
  }
  return cap
}

/** How many reference images Elements and attachments can use on this model. */
export function referenceImageLimit(cap: RefCapability): number {
  if (cap.images) return cap.images.max
  if (cap.elements) return cap.elements.max
  return 0
}

export function refSummary(record: Pick<ModelRecord, "params">): RefSummary | undefined {
  const cap = refCapability(record)
  const images = referenceImageLimit(cap)
  if (!images && !cap.start && !cap.end && !cap.videos && !cap.audios) return undefined
  return {
    images,
    start: Boolean(cap.start),
    end: Boolean(cap.end),
    videos: cap.videos?.max ?? 0,
    audios: cap.audios?.max ?? 0,
    elements: Boolean(cap.elements),
    stated: cap.images ? cap.images.stated : cap.elements ? cap.elements.stated : true,
  }
}

export interface RefAssignment {
  /** Fields to merge into the request input */
  input: Record<string, unknown>
  /** Reference images that did not fit */
  leftOver: string[]
}

export interface AssignInput {
  start?: string
  end?: string
  /** Reference images in the order they should be sent */
  images: string[]
  /** The same images grouped by what they show, so an element keeps its own angles together */
  groups?: string[][]
  videos?: string[]
  audios?: string[]
  sourceVideo?: string
  sourceAudio?: string
}

/** Puts each file into the field the model really has. Used by every provider runner. */
export function assignRefs(cap: RefCapability, given: AssignInput): RefAssignment {
  const input: Record<string, unknown> = {}
  if (given.start && cap.start) input[cap.start.key] = given.start
  if (given.end && cap.end) input[cap.end.key] = given.end
  if (given.sourceVideo && cap.sourceVideo) input[cap.sourceVideo.key] = given.sourceVideo
  if (given.sourceAudio && cap.sourceAudio) input[cap.sourceAudio.key] = given.sourceAudio

  let leftOver: string[] = []
  if (given.images.length > 0) {
    if (cap.images) {
      const fit = given.images.slice(0, cap.images.max)
      leftOver = given.images.slice(cap.images.max)
      input[cap.images.key] = cap.images.list ? fit : fit[0]
    } else if (cap.elements) {
      // Each element is a main image plus up to three more angles of the same thing
      const groups = (given.groups?.length ? given.groups : given.images.map((u) => [u])).slice(0, cap.elements.max)
      const used = groups.flat()
      leftOver = given.images.filter((u) => !used.includes(u))
      input[cap.elements.key] = groups.map((g) => ({ frontal_image_url: g[0], ...(g.length > 1 ? { reference_image_urls: g.slice(1, 4) } : {}) }))
    } else leftOver = given.images
  }
  if (given.videos?.length && cap.videos) input[cap.videos.key] = cap.videos.list ? given.videos.slice(0, cap.videos.max) : given.videos[0]
  if (given.audios?.length && cap.audios) input[cap.audios.key] = cap.audios.list ? given.audios.slice(0, cap.audios.max) : given.audios[0]
  return { input, leftOver }
}

export const hasReferenceInputs = (p: Record<string, ParamProperty>): boolean => Object.values(p).some((x) => x.slot)

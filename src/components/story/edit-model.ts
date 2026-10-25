import type { StoryItem } from "./types"

/**
 * The cut of a story. The main video track (V1) is a row of clips that follow the shots: a clip points at a shot
 * and which of its takes to show, so when a take is made or changed the clip shows it, and the clips close up when
 * one is removed. Higher video layers (V2 and up) hold overlays that sit at a time you choose, and cover the layers
 * below them. Audio lanes (A1 and up) and captions sit at a time in seconds. Every change is a plain function here,
 * so the buttons and the agent edit the cut the same way.
 */

/** What a clip looks like and sounds like. Every field is optional; a missing one means its default. */
export interface ClipFx {
  /** 0 to 100, default 100 */
  opacity?: number
  blend?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  /** Percent, default 100 */
  scale?: number
  /** Percent of the screen width and height, default 0 */
  x?: number
  y?: number
  /** Degrees, default 0 */
  rotation?: number
  flipH?: boolean
  flipV?: boolean
  /** Percent cut away from each side, default 0 */
  cropL?: number
  cropT?: number
  cropR?: number
  cropB?: number
  /** Percent of normal speed, default 100 */
  speed?: number
  /** Percent, default 100 */
  brightness?: number
  contrast?: number
  saturation?: number
  /** Blur in pixels at 1280 wide, default 0 */
  blur?: number
  /** Colour grade, all default 0. Temperature: cool to warm. Tint: green to magenta. Highlights, shadows and vibrance: -100 to 100. Fade lifts the blacks, 0 to 100. */
  temperature?: number
  tint?: number
  highlights?: number
  shadows?: number
  vibrance?: number
  fade?: number
  /** Split toning: a colour (hue in degrees) and how much of it in the shadows, and in the highlights, 0 to 100 */
  shadowHue?: number
  shadowTone?: number
  highlightHue?: number
  highlightTone?: number
  /** Film and lens, all default 0 and 0 to 100: grain, darkened corners, glow from bright parts, red halo round bright parts, colour fringes, sharpening, digital glitch, scan lines, and a light leak with its colour (hue in degrees, default 25 a warm orange) */
  grain?: number
  vignette?: number
  bloom?: number
  halation?: number
  chroma?: number
  sharpen?: number
  glitch?: number
  scanlines?: number
  leak?: number
  leakHue?: number
  /** Seconds to fade in from, and out to, nothing */
  fadeIn?: number
  fadeOut?: number
  /** Sound of the clip itself, 0 to 1, default 1 */
  volume?: number
  /** Animated fields: values at seconds into the clip, joined by straight lines. They replace the plain field. */
  keys?: Partial<Record<KeyParam, KeyFrame[]>>
}

export type KeyParam = "opacity" | "scale" | "x" | "y" | "rotation"
export interface KeyFrame {
  t: number
  v: number
}
export const KEY_PARAMS: KeyParam[] = ["opacity", "scale", "x", "y", "rotation"]

/** The fields with every animated one worked out for a moment `into` seconds from the clip's start */
export function resolveKeys(fx: ClipFx | undefined, into: number): ClipFx | undefined {
  if (!fx?.keys) return fx
  const out: ClipFx = { ...fx }
  for (const param of KEY_PARAMS) {
    const keys = fx.keys[param]
    if (!keys || keys.length === 0) continue
    const sorted = [...keys].sort((a, b) => a.t - b.t)
    let v = sorted[sorted.length - 1]!.v
    if (into <= sorted[0]!.t) v = sorted[0]!.v
    else
      for (let i = 1; i < sorted.length; i++) {
        if (into <= sorted[i]!.t) {
          const a = sorted[i - 1]!
          const b = sorted[i]!
          v = a.v + ((b.v - a.v) * (into - a.t)) / Math.max(0.0001, b.t - a.t)
          break
        }
      }
    out[param] = v
  }
  return out
}

/** A file picked from the Library instead of a take of a beat */
export interface ClipSrc {
  url: string
  type: "video" | "image"
  name: string
}

export interface EditClip {
  id: string
  /** The beat this clip shows. Empty when `src` is set. */
  shotId: string
  /** Which take of the shot to show (0 is the first) */
  take: number
  /** Seconds on the timeline */
  duration: number
  /** Seconds into a video take where this clip starts */
  trimIn: number
  src?: ClipSrc
  fx?: ClipFx
  /**
   * A transition from the clip before into this one, taken from the transition library by id. The two clips overlap by its length:
   * this clip starts that much earlier, so the cut is that much shorter and both have real pictures all through the change.
   */
  transitionIn?: { id: string; duration: number }
}

/** A video clip on a layer above V1, at a time the user chose */
export interface EditOverlay {
  id: string
  shotId: string
  take: number
  /** Seconds from the start of the cut */
  start: number
  duration: number
  trimIn: number
  /** The video layer: 2 and up (1 is the main track) */
  layer: number
  src?: ClipSrc
  fx?: ClipFx
}

export const speedOf = (fx?: ClipFx) => Math.max(0.1, (fx?.speed ?? 100) / 100)

/** How a caption or title looks. Every field is optional; a missing one means its default. */
export interface CaptionStyle {
  size?: "s" | "m" | "l" | "xl"
  position?: "top" | "middle" | "bottom"
  animation?: "none" | "fade" | "rise" | "pop" | "typewriter" | "slide" | "bounce" | "zoom"
  font?: "sans" | "serif" | "mono" | "display" | "condensed" | "rounded" | "script"
  color?: "white" | "yellow" | "black" | "red" | "cyan" | "orange" | "green" | "pink" | "blue" | "lime"
  /** How the letters are kept readable. Missing means an outline. Box, light box and colour box put them on a plate; glow and neon light them; stroke is a thick edge. */
  look?: "outline" | "shadow" | "box" | "none" | "glow" | "neon" | "boxlight" | "boxcolor" | "stroke"
  /** Capital letters, and the room between letters */
  case?: "none" | "upper"
  spacing?: "tight" | "normal" | "wide"
  italic?: boolean
}

/** Ways a text layer comes in and goes out */
export type TextAnim = "none" | "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "pop" | "bounce" | "zoom" | "blur" | "wipe" | "typewriter" | "letters"

/**
 * A text layer: a caption item with all of the look a title needs. Sizes are on a picture 720 pixels on its short side and grow with the
 * export, like everything else. Colours are "#rrggbb". The preview and the export draw it with the same code (text-render.ts).
 */
export interface RichText {
  /** A Google Fonts family, or empty for the system sans-serif */
  family: string
  /** 100 to 900 */
  weight: number
  italic?: boolean
  size: number
  color: string
  /** A second colour and the angle to blend to it, in degrees */
  gradient?: { color: string; angle: number }
  stroke?: { width: number; color: string }
  shadow?: { blur: number; x: number; y: number; color: string }
  glow?: { blur: number; color: string }
  /** A plate behind the text: colour, opacity 0 to 100, padding and corner radius */
  bg?: { color: string; opacity: number; padX: number; padY: number; radius: number }
  align: "left" | "center" | "right"
  /** The middle of the text as a share of the picture, 50 and 50 being the centre */
  x: number
  y: number
  /** How wide the text may run before it wraps, as a share of the picture width */
  width: number
  lineHeight: number
  /** Letter spacing in hundredths of the size */
  spacing: number
  case: "none" | "upper" | "lower"
  rotation: number
  /** 0 to 100 */
  opacity: number
  animIn?: { kind: TextAnim; duration: number }
  animOut?: { kind: TextAnim; duration: number }
}

export const DEFAULT_RICH: RichText = { family: "", weight: 700, size: 64, color: "#ffffff", align: "center", x: 50, y: 50, width: 80, lineHeight: 1.15, spacing: 0, case: "none", rotation: 0, opacity: 100 } // allow-color

export interface EditCaption {
  id: string
  text: string
  start: number
  duration: number
  style?: CaptionStyle
  /** When set, this item is a text layer and is drawn with these settings instead of `style` */
  rich?: RichText
}

/** A named point on the timeline, to jump to and to snap to */
export interface Marker {
  id: string
  time: number
  label: string
}

/** The shape of the picture: the preview and the export both use it */
export type Aspect = "16:9" | "9:16" | "1:1" | "4:5"
export const ASPECTS: Array<{ id: Aspect; label: string; w: number; h: number }> = [
  { id: "16:9", label: "16:9 wide", w: 16, h: 9 },
  { id: "9:16", label: "9:16 tall", w: 9, h: 16 },
  { id: "1:1", label: "1:1 square", w: 1, h: 1 },
  { id: "4:5", label: "4:5 portrait", w: 4, h: 5 },
]
export const aspectOf = (p: EditProject) => ASPECTS.find((a) => a.id === p.aspect) ?? ASPECTS[0]!

/** What a layer does: hidden or silent, and locked against changes */
export interface TrackState {
  mute?: boolean
  /** Solo: only soloed layers of the same kind (picture layers or audio lanes) are heard or seen */
  solo?: boolean
  lock?: boolean
  /** For an audio lane: its level in the mix, 0 to 1. Missing means 1. */
  gain?: number
}

export interface EditAudio {
  id: string
  /** The uploaded file, kept in the Library */
  uploadId: string
  name: string
  start: number
  duration: number
  /** 0 to 1 */
  volume: number
  /** The audio lane: 1 and up. Missing means the first lane. */
  lane?: number
  /** Seconds to fade the sound in from, and out to, silence */
  fadeIn?: number
  fadeOut?: number
  /** Stretches of the timeline where this sound is turned down (under speech, for example), with the level kept in them (0 to 1) */
  dips?: Array<{ from: number; to: number; level: number }>
}

export interface EditProject {
  clips: EditClip[]
  overlays?: EditOverlay[]
  captions: EditCaption[]
  audio: EditAudio[]
  /** How many video layers there are, V1 included. Missing means one. */
  videoLayers?: number
  /** How many audio lanes there are. Missing means one. */
  audioLanes?: number
  /** The height of each layer on the timeline, by its id (v1, v2, a1, captions) */
  heights?: Record<string, number>
  markers?: Marker[]
  /** Mute and lock, by layer id (v1, v2, a1, captions) */
  tracks?: Record<string, TrackState>
  /** The shape of the picture. Missing means 16:9. */
  aspect?: Aspect
}

/** The size of the exported picture. `res` is the short side in pixels: 720 gives 1280x720 wide or 720x1280 tall. */
export function exportSize(p: EditProject, res = 720): { W: number; H: number } {
  const a = aspectOf(p)
  const short = Math.min(a.w, a.h)
  const even = (n: number) => Math.round(n / 2) * 2
  return { W: even((res * a.w) / short), H: even((res * a.h) / short) }
}

export const trackOf =(p: EditProject, id: string): TrackState => p.tracks?.[id] ?? {}

/** True when the layer is off: muted itself, or another layer of its kind is soloed and this one is not */
export function isOff(p: EditProject, id: string): boolean {
  const own = trackOf(p, id)
  if (own.mute) return true
  const kind = id.charAt(0)
  if (kind !== "v" && kind !== "a") return false
  const soloed = Object.entries(p.tracks ?? {}).some(([k, t]) => k.charAt(0) === kind && /^\w\d+$/.test(k) && t.solo)
  return soloed && !own.solo
}

const DIP_RAMP = 0.25

/** The volume of a sound at a time inside it, with its fades and the stretches where it is turned down */
export function audioGain(a: EditAudio, into: number): number {
  const up = a.fadeIn && a.fadeIn > 0 ? Math.min(1, into / a.fadeIn) : 1
  const down = a.fadeOut && a.fadeOut > 0 ? Math.min(1, (a.duration - into) / a.fadeOut) : 1
  const t = a.start + into
  let dip = 1
  for (const d of a.dips ?? []) {
    // The level eases down just before the stretch and back up just after it
    const k = t < d.from ? Math.max(0, 1 - (d.from - t) / DIP_RAMP) : t > d.to ? Math.max(0, 1 - (t - d.to) / DIP_RAMP) : 1
    dip = Math.min(dip, 1 - k * (1 - d.level))
  }
  return Math.max(0, Math.min(1, a.volume * up * down * dip))
}

/** What is heard of a sound at a time inside it: its own volume, fades and dips, and the level of its lane */
export const soundGain = (p: EditProject, a: EditAudio, into: number): number => audioGain(a, into) * Math.max(0, Math.min(1, trackOf(p, `a${a.lane ?? 1}`).gain ?? 1))

export const EMPTY_PROJECT: EditProject = { clips: [], captions: [], audio: [] }

let n = 0
export const editId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(n++).toString(36)}`

const round = (x: number) => Math.round(x * 100) / 100
const MIN = 0.2

export const DEFAULT_HEIGHT = { video: 88, audio: 40, captions: 36 }
export const HEIGHT_RANGE = { min: 28, max: 220 }

export const videoLayerCount = (p: EditProject) => Math.max(1, p.videoLayers ?? 1)
export const audioLaneCount = (p: EditProject) => Math.max(1, p.audioLanes ?? 1)
export const overlaysOf = (p: EditProject): EditOverlay[] => p.overlays ?? []

export const secondsOf = (duration: string): number => {
  const v = parseFloat(duration)
  return Number.isFinite(v) && v > 0 ? v : 5
}

export interface ShotRef {
  sceneNumber: number
  sceneTitle: string
  shotNumber: number
  shotId: string
  mode: "video" | "image"
  seconds: number
  takes: Array<string | undefined>
}

/** Every shot of the story in order, with what is needed to cut it */
export function shotsOf(story: StoryItem): ShotRef[] {
  return story.scenes.flatMap((sc) =>
    sc.shots.map((sh) => ({
      sceneNumber: sc.sceneNumber,
      sceneTitle: sc.title,
      shotNumber: sh.shotNumber,
      shotId: sh.id,
      mode: sh.mode,
      seconds: secondsOf(sh.duration),
      takes: sh.generatedSlots.map((s) => s.url),
    })),
  )
}

/** The first take that exists, so a new clip starts on something real */
const firstTake = (takes: Array<string | undefined>) => Math.max(0, takes.findIndex((t) => Boolean(t)))

/** Puts one beat of the story on the end of the main track, on its first take. A beat already there can be added again. */
export function addShotClip(p: EditProject, shot: ShotRef): EditProject {
  return { ...p, clips: [...p.clips, { id: editId("c"), shotId: shot.shotId, take: firstTake(shot.takes), duration: shot.seconds, trimIn: 0 }] }
}

/**
 * Brings the cut in line with the shots: clips for shots that are gone are removed, shots without a clip get one
 * at the end of their scene's place, and what you already cut (lengths, splits, order) is kept.
 */
export function syncWithShots(project: EditProject, story: StoryItem): EditProject {
  const shots = shotsOf(story)
  const known = new Set(shots.map((s) => s.shotId))
  const kept = project.clips.filter((c) => c.src || known.has(c.shotId))
  const have = new Set(kept.map((c) => c.shotId))
  const added: EditClip[] = shots
    .filter((s) => !have.has(s.shotId))
    .map((s) => ({ id: editId("c"), shotId: s.shotId, take: firstTake(s.takes), duration: s.seconds, trimIn: 0 }))
  // New clips go where their shots belong: after the clip of the shot before them
  let clips = kept
  for (const clip of added) {
    const at = shots.findIndex((s) => s.shotId === clip.shotId)
    let insertAt = clips.length
    for (let k = at - 1; k >= 0; k--) {
      const last = clips.map((c) => c.shotId).lastIndexOf(shots[k]!.shotId)
      if (last >= 0) {
        insertAt = last + 1
        break
      }
      if (k === 0) insertAt = 0
    }
    clips = [...clips.slice(0, insertAt), clip, ...clips.slice(insertAt)]
  }
  return { ...project, clips }
}

/** How many seconds clip `i` overlaps the clip before it: the length of its transition, never more than either clip can give */
export function overlapOf(clips: EditClip[], i: number): number {
  const c = clips[i]
  const before = clips[i - 1]
  if (!c?.transitionIn || !before) return 0
  return Math.max(0, round(Math.min(c.transitionIn.duration, before.duration - MIN, c.duration - MIN)))
}

export const clipStarts = (clips: EditClip[]): number[] => {
  const out: number[] = []
  let end = 0
  clips.forEach((c, i) => {
    out[i] = round(Math.max(0, end - overlapOf(clips, i)))
    end = out[i]! + c.duration
  })
  return out
}

/** Where the main track ends */
export const mainEnd = (clips: EditClip[]): number => {
  const starts = clipStarts(clips)
  return clips.reduce((end, c, i) => Math.max(end, starts[i]! + c.duration), 0)
}

export function totalLength(p: EditProject): number {
  const v = mainEnd(p.clips)
  const o = overlaysOf(p).reduce((t, x) => Math.max(t, x.start + x.duration), 0)
  const c = p.captions.reduce((t, x) => Math.max(t, x.start + x.duration), 0)
  const a = p.audio.reduce((t, x) => Math.max(t, x.start + x.duration), 0)
  return round(Math.max(v, o, c, a))
}

/** The clip showing at a time on the main track, and how far into it */
export function clipAt(p: EditProject, time: number): { index: number; into: number } | null {
  const starts = clipStarts(p.clips)
  // While a transition runs two clips show; the later one is on top
  for (let i = p.clips.length - 1; i >= 0; i--) {
    if (time >= starts[i]! && time < starts[i]! + p.clips[i]!.duration) return { index: i, into: time - starts[i]! }
  }
  return null
}

/** Every main-track clip showing at a time, the earlier one first. Two while a transition runs, and then `progress` is how far it has gone (0 to 1). */
export function clipsAt(p: EditProject, time: number): { clips: Array<{ index: number; into: number }>; progress: number | null } {
  const starts = clipStarts(p.clips)
  const here: Array<{ index: number; into: number }> = []
  for (let i = 0; i < p.clips.length; i++) {
    if (time >= starts[i]! && time < starts[i]! + p.clips[i]!.duration) here.push({ index: i, into: time - starts[i]! })
  }
  if (here.length >= 2) {
    const next = here[here.length - 1]!
    const over = overlapOf(p.clips, next.index)
    return { clips: here.slice(-2), progress: over > 0 ? Math.max(0, Math.min(1, next.into / over)) : null }
  }
  return { clips: here, progress: null }
}

/** The overlay showing at a time: the one on the highest layer that covers it. Overlays cover the main track. */
export function overlayAt(p: EditProject, time: number): EditOverlay | null {
  let best: EditOverlay | null = null
  for (const o of overlaysOf(p)) {
    if (time >= o.start && time < o.start + o.duration && (!best || o.layer > best.layer)) best = o
  }
  return best
}

export function splitClip(p: EditProject, clipId: string, at: number): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  if (i < 0) return p
  const c = p.clips[i]!
  const starts = clipStarts(p.clips)
  const into = round(at - starts[i]!)
  if (into < MIN || c.duration - into < MIN) return p
  // The fade in stays with the first half and the fade out with the second
  const first: EditClip = { ...c, duration: into, fx: c.fx && { ...c.fx, fadeOut: undefined } }
  const second: EditClip = { ...c, id: editId("c"), duration: round(c.duration - into), trimIn: round(c.trimIn + into * speedOf(c.fx)), fx: c.fx && { ...c.fx, fadeIn: undefined }, transitionIn: undefined }
  return { ...p, clips: [...p.clips.slice(0, i), first, second, ...p.clips.slice(i + 1)] }
}

export function setClipDuration(p: EditProject, clipId: string, duration: number): EditProject {
  const d = round(Math.max(MIN, duration))
  return { ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, duration: d } : c)) }
}

/**
 * Drags the left edge of a clip by `delta` seconds (later is positive). The clip starts later in its source, so
 * what plays is the same footage, and everything after it moves up. A still picture has no source to run out of,
 * so it can be pulled longer to the left without limit.
 */
export function trimClipStart(p: EditProject, clipId: string, delta: number, still: boolean): EditProject {
  return {
    ...p,
    clips: p.clips.map((c) => {
      if (c.id !== clipId) return c
      const speed = speedOf(c.fx)
      const lowest = still ? -Infinity : -c.trimIn / speed
      const d = Math.max(lowest, Math.min(delta, c.duration - MIN))
      return { ...c, trimIn: still ? 0 : round(c.trimIn + d * speed), duration: round(c.duration - d) }
    }),
  }
}

/** Puts a clip where a time on the timeline points: before the first clip whose middle is later than that time. */
export function moveClipToTime(p: EditProject, clipId: string, time: number): EditProject {
  const clip = p.clips.find((c) => c.id === clipId)
  if (!clip) return p
  const rest = p.clips.filter((c) => c.id !== clipId)
  const starts = clipStarts(rest)
  let at = rest.length
  for (let i = 0; i < rest.length; i++) {
    if (time < starts[i]! + rest[i]!.duration / 2) {
      at = i
      break
    }
  }
  const next = [...rest.slice(0, at), clip, ...rest.slice(at)]
  return next.every((c, i) => c.id === p.clips[i]?.id) ? p : { ...p, clips: clearAround(p.clips, next) }
}

export function deleteClip(p: EditProject, clipId: string): EditProject {
  return { ...p, clips: clearAround(p.clips, p.clips.filter((c) => c.id !== clipId)) }
}

/**
 * Replaces a clip by the stretches of its footage to keep, in order (seconds in the footage). Each piece is a clip of its own with the same
 * look, the first keeping the fade in and the last the fade out. Everything after closes up, as on the main track it always does.
 */
export function keepRanges(p: EditProject, clipId: string, ranges: Array<[number, number]>): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  const c = p.clips[i]
  if (!c || ranges.length === 0) return p
  const speed = speedOf(c.fx)
  const pieces: EditClip[] = ranges.map(([from, to], k) => ({
    ...c,
    id: k === 0 ? c.id : editId("c"),
    transitionIn: k === 0 ? c.transitionIn : undefined,
    trimIn: round(from),
    duration: round(Math.max(MIN, (to - from) / speed)),
    fx: c.fx && { ...c.fx, fadeIn: k === 0 ? c.fx.fadeIn : undefined, fadeOut: k === ranges.length - 1 ? c.fx.fadeOut : undefined },
  }))
  return { ...p, clips: [...p.clips.slice(0, i), ...pieces, ...p.clips.slice(i + 1)] }
}

/** Removes a clip and moves everything that starts after it (overlays, captions, sounds) earlier by its length, so nothing is left out of step */
export function rippleDeleteClip(p: EditProject, clipId: string): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  if (i < 0) return p
  const before = clipStarts(p.clips)
  const end = before[i]! + p.clips[i]!.duration
  const clips = clearAround(p.clips, p.clips.filter((c) => c.id !== clipId))
  // How far the clip after it moves earlier: that is how far everything after it must move
  const after = clipStarts(clips)
  const len = i < clips.length ? before[i + 1]! - after[i]! : p.clips[i]!.duration
  const shift = <T extends { start: number }>(item: T): T => (item.start >= end - 0.001 ? { ...item, start: round(Math.max(0, item.start - len)) } : item)
  return {
    ...p,
    clips,
    overlays: overlaysOf(p).map(shift),
    captions: p.captions.map(shift),
    audio: p.audio.map(shift),
  }
}

/** Sets or removes the transition into a clip (from the one before it). The first clip has nothing before it, so nothing is set. */
export function setTransitionIn(p: EditProject, clipId: string, transition: { id: string; duration: number } | null): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  if (i <= 0) return p
  const next = transition ? { id: transition.id, duration: round(Math.max(0.1, Math.min(5, transition.duration))) } : undefined
  return { ...p, clips: p.clips.map((c, k) => (k === i ? { ...c, transitionIn: next } : c)) }
}

/** After clips change places, a transition between clips that are no longer neighbours is dropped */
const clearAround = (before: EditClip[], after: EditClip[]): EditClip[] => {
  const was = new Set(before.slice(1).map((c, i) => `${before[i]!.id}>${c.id}`))
  return after.map((c, i) => (c.transitionIn && (i === 0 || !was.has(`${after[i - 1]!.id}>${c.id}`)) ? { ...c, transitionIn: undefined } : c))
}

export function duplicateClip(p: EditProject, clipId: string): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  if (i < 0) return p
  return { ...p, clips: [...p.clips.slice(0, i + 1), { ...p.clips[i]!, id: editId("c"), transitionIn: undefined }, ...p.clips.slice(i + 1)] }
}

export function moveClip(p: EditProject, clipId: string, to: number): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  if (i < 0) return p
  const target = Math.min(p.clips.length - 1, Math.max(0, to))
  if (target === i) return p
  const rest = p.clips.filter((c) => c.id !== clipId)
  return { ...p, clips: clearAround(p.clips, [...rest.slice(0, target), p.clips[i]!, ...rest.slice(target)]) }
}

export function setClipTake(p: EditProject, clipId: string, take: number): EditProject {
  return { ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, take: Math.max(0, take) } : c)) }
}

// ---- layers

export function addVideoLayer(p: EditProject): EditProject {
  return { ...p, videoLayers: videoLayerCount(p) + 1 }
}

export function addAudioLane(p: EditProject): EditProject {
  return { ...p, audioLanes: audioLaneCount(p) + 1 }
}

export function setTrack(p: EditProject, id: string, patch: Partial<TrackState>): EditProject {
  const next = { ...trackOf(p, id), ...patch }
  if (next.gain !== undefined && next.gain >= 1) delete next.gain
  const tracks = { ...(p.tracks ?? {}) }
  if (!next.mute && !next.solo && !next.lock && next.gain === undefined) delete tracks[id]
  else tracks[id] = next
  return { ...p, tracks: Object.keys(tracks).length ? tracks : undefined }
}

export const setAspect = (p: EditProject, aspect: Aspect): EditProject => ({ ...p, aspect: aspect === "16:9" ? undefined : aspect })

export function addMarker(p: EditProject, time: number, label = ""): EditProject {
  const m: Marker = { id: editId("m"), time: round(Math.max(0, time)), label }
  return { ...p, markers: [...(p.markers ?? []), m].sort((a, b) => a.time - b.time) }
}
export const deleteMarker = (p: EditProject, id: string): EditProject => ({ ...p, markers: (p.markers ?? []).filter((m) => m.id !== id) })

/**
 * Roll edit: moves the cut between a clip and the one after it. The clip gets longer by `delta` seconds (or shorter when it is
 * negative), the next one loses the same time from its start, so everything after stays where it is.
 */
export function rollEdit(p: EditProject, clipId: string, delta: number): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  const a = p.clips[i]
  const b = p.clips[i + 1]
  if (!a || !b) return p
  const d = Math.max(MIN - a.duration, Math.min(delta, b.duration - MIN))
  const next = [...p.clips]
  next[i] = { ...a, duration: round(a.duration + d) }
  next[i + 1] = { ...b, duration: round(b.duration - d), trimIn: b.src?.type === "image" ? b.trimIn : round(Math.max(0, b.trimIn + d * speedOf(b.fx))) }
  return { ...p, clips: next }
}

export function setLayerHeight(p: EditProject, id: string, height: number): EditProject {
  const h = Math.round(Math.max(HEIGHT_RANGE.min, Math.min(HEIGHT_RANGE.max, height)))
  return { ...p, heights: { ...(p.heights ?? {}), [id]: h } }
}

/**
 * Swaps two layers of the same kind: two picture layers above V1 (their overlays), or two audio lanes (their sounds). Their
 * mute, solo, lock and height go with them. V1 holds the main cut and stays where it is.
 */
export function swapLayers(p: EditProject, kind: "video" | "audio", a: number, b: number): EditProject {
  if (a === b || a < 1 || b < 1 || (kind === "video" && (a < 2 || b < 2))) return p
  const letter = kind === "video" ? "v" : "a"
  const swapKeys = <T,>(rec: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!rec) return rec
    const out = { ...rec }
    const ka = `${letter}${a}`
    const kb = `${letter}${b}`
    delete out[ka]
    delete out[kb]
    if (rec[kb] !== undefined) out[ka] = rec[kb]!
    if (rec[ka] !== undefined) out[kb] = rec[ka]!
    return out
  }
  const flip = (n: number) => (n === a ? b : n === b ? a : n)
  return {
    ...p,
    overlays: kind === "video" ? overlaysOf(p).map((o) => ({ ...o, layer: flip(o.layer) })) : p.overlays,
    audio: kind === "audio" ? p.audio.map((x) => ({ ...x, lane: flip(x.lane ?? 1) })) : p.audio,
    tracks: swapKeys(p.tracks),
    heights: swapKeys(p.heights),
  }
}

/** Puts a shot's take on a video layer above V1, starting at a time on the timeline */
export function addOverlay(p: EditProject, shotId: string, take: number, layer: number, start: number, duration: number, trimIn = 0, extra: { src?: ClipSrc; fx?: ClipFx } = {}): EditProject {
  const o: EditOverlay = { id: editId("o"), shotId, take, layer: Math.max(2, layer), start: round(Math.max(0, start)), duration: round(Math.max(MIN, duration)), trimIn, ...extra }
  return { ...p, overlays: [...overlaysOf(p), o] }
}

/** Gives a clip or an overlay a whole look at once, for pasting a copied one (animation included) */
export function setFxAll(p: EditProject, kind: "clip" | "overlay", id: string, fx: ClipFx | undefined): EditProject {
  const apply = <T extends { id: string; fx?: ClipFx }>(item: T): T => (item.id === id ? { ...item, fx: fx ? { ...fx } : undefined } : item)
  return kind === "clip" ? { ...p, clips: p.clips.map(apply) } : { ...p, overlays: overlaysOf(p).map(apply) }
}

/** Puts a file from the Library at the end of the main track */
export function addClipFromSrc(p: EditProject, src: ClipSrc, duration: number): EditProject {
  const c: EditClip = { id: editId("c"), shotId: "", take: 0, duration: round(Math.max(MIN, duration)), trimIn: 0, src }
  return { ...p, clips: [...p.clips, c] }
}

/** Changes how a clip or an overlay looks and sounds. A field set to undefined goes back to its default. */
export function setFx(p: EditProject, kind: "clip" | "overlay", id: string, patch: Partial<ClipFx> | null): EditProject {
  const apply = <T extends { id: string; fx?: ClipFx }>(item: T): T => {
    if (item.id !== id) return item
    if (patch === null) return { ...item, fx: undefined }
    const merged: ClipFx = { ...(item.fx ?? {}), ...patch }
    for (const key of Object.keys(merged) as Array<keyof ClipFx>) if (merged[key] === undefined) delete merged[key]
    return { ...item, fx: Object.keys(merged).length ? merged : undefined }
  }
  return kind === "clip" ? { ...p, clips: p.clips.map(apply) } : { ...p, overlays: overlaysOf(p).map(apply) }
}

export function updateOverlay(p: EditProject, id: string, patch: Partial<Omit<EditOverlay, "id">>): EditProject {
  return {
    ...p,
    overlays: overlaysOf(p).map((o) => {
      if (o.id !== id) return o
      const next = { ...o, ...patch }
      return { ...next, start: round(Math.max(0, next.start)), duration: round(Math.max(MIN, next.duration)), layer: Math.max(2, next.layer) }
    }),
  }
}

export const deleteOverlay = (p: EditProject, id: string): EditProject => ({ ...p, overlays: overlaysOf(p).filter((o) => o.id !== id) })

/** Moves a clip of the main track onto a layer above it, keeping its place on the timeline */
export function clipToLayer(p: EditProject, clipId: string, layer: number): EditProject {
  const i = p.clips.findIndex((c) => c.id === clipId)
  if (i < 0) return p
  const c = p.clips[i]!
  const start = clipStarts(p.clips)[i]!
  const rest = { ...p, clips: p.clips.filter((x) => x.id !== clipId) }
  return addOverlay({ ...rest, overlays: overlaysOf(p) }, c.shotId, c.take, layer, start, c.duration, c.trimIn, { src: c.src, fx: c.fx })
}

/** Moves an overlay back onto the main track, where its time puts it */
export function overlayToMain(p: EditProject, overlayId: string): EditProject {
  const o = overlaysOf(p).find((x) => x.id === overlayId)
  if (!o) return p
  const clip: EditClip = { id: editId("c"), shotId: o.shotId, take: o.take, duration: o.duration, trimIn: o.trimIn, src: o.src, fx: o.fx }
  const withClip = { ...deleteOverlay(p, overlayId), clips: [...p.clips, clip] }
  return moveClipToTime(withClip, clip.id, o.start)
}

export function setAudioLane(p: EditProject, id: string, lane: number): EditProject {
  return { ...p, audio: p.audio.map((a) => (a.id === id ? { ...a, lane: Math.max(1, Math.min(audioLaneCount(p), lane)) } : a)) }
}

export function addCaption(p: EditProject, text: string, start: number, duration = 2): EditProject {
  const cap: EditCaption = { id: editId("t"), text, start: round(Math.max(0, start)), duration: round(Math.max(MIN, duration)) }
  return { ...p, captions: [...p.captions, cap].sort((a, b) => a.start - b.start) }
}

/** Adds a text layer at a time. Returns the cut and the new item's id. */
export function addText(p: EditProject, text: string, start: number, duration: number, rich: Partial<RichText> = {}): { project: EditProject; id: string } {
  const cap: EditCaption = { id: editId("t"), text, start: round(Math.max(0, start)), duration: round(Math.max(MIN, duration)), rich: { ...DEFAULT_RICH, ...rich } }
  return { project: { ...p, captions: [...p.captions, cap].sort((a, b) => a.start - b.start) }, id: cap.id }
}

export function updateCaption(p: EditProject, id: string, patch: Partial<Omit<EditCaption, "id">>): EditProject {
  return {
    ...p,
    captions: p.captions
      .map((c) => (c.id === id ? { ...c, ...patch, start: round(Math.max(0, patch.start ?? c.start)), duration: round(Math.max(MIN, patch.duration ?? c.duration)) } : c))
      .sort((a, b) => a.start - b.start),
  }
}

export const deleteCaption = (p: EditProject, id: string): EditProject => ({ ...p, captions: p.captions.filter((c) => c.id !== id) })

export function addAudio(p: EditProject, a: Omit<EditAudio, "id">): EditProject {
  return { ...p, audio: [...p.audio, { ...a, id: editId("a") }] }
}

export function updateAudio(p: EditProject, id: string, patch: Partial<Omit<EditAudio, "id">>): EditProject {
  return { ...p, audio: p.audio.map((a) => (a.id === id ? { ...a, ...patch, start: round(Math.max(0, patch.start ?? a.start)) } : a)) }
}

export const deleteAudio = (p: EditProject, id: string): EditProject => ({ ...p, audio: p.audio.filter((a) => a.id !== id) })

// What the agent may ask for. Clips are counted from 1, as they are named on the timeline.

export type EditOp =
  | { op: "caption"; text: string; start: number; duration?: number }
  | { op: "trim"; clip: number; duration: number }
  | { op: "split"; clip: number; at: number }
  | { op: "delete"; clip: number }
  | { op: "duplicate"; clip: number }
  | { op: "move"; clip: number; to: number }
  | { op: "clearCaptions" }

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null)

/** Finds the list of changes in what the model replied, ignoring any words around it. */
export function parseOps(reply: string): EditOp[] {
  const start = reply.indexOf("[")
  const end = reply.lastIndexOf("]")
  if (start < 0 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const ops: EditOp[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const o = item as Record<string, unknown>
    const clip = num(o.clip)
    switch (o.op) {
      case "caption": {
        const s = num(o.start)
        if (typeof o.text === "string" && o.text.trim() && s !== null) ops.push({ op: "caption", text: o.text.trim(), start: s, duration: num(o.duration) ?? undefined })
        break
      }
      case "trim": {
        const d = num(o.duration)
        if (clip !== null && d !== null) ops.push({ op: "trim", clip, duration: d })
        break
      }
      case "split": {
        const at = num(o.at)
        if (clip !== null && at !== null) ops.push({ op: "split", clip, at })
        break
      }
      case "delete":
      case "duplicate":
        if (clip !== null) ops.push({ op: o.op, clip })
        break
      case "move": {
        const to = num(o.to)
        if (clip !== null && to !== null) ops.push({ op: "move", clip, to })
        break
      }
      case "clearCaptions":
        ops.push({ op: "clearCaptions" })
        break
    }
  }
  return ops
}

/** Applies the changes in order. A change that does not fit (a clip that is not there) is skipped and counted. */
export function applyOps(project: EditProject, ops: EditOp[]): { project: EditProject; applied: number; skipped: number } {
  let p = project
  let applied = 0
  let skipped = 0
  for (const op of ops) {
    const before = p
    if (op.op === "caption") p = addCaption(p, op.text, op.start, op.duration ?? 2)
    else if (op.op === "clearCaptions") p = { ...p, captions: [] }
    else {
      const clip = p.clips[Math.round(op.clip) - 1]
      if (!clip) {
        skipped++
        continue
      }
      if (op.op === "trim") p = setClipDuration(p, clip.id, op.duration)
      else if (op.op === "split") p = splitClip(p, clip.id, op.at)
      else if (op.op === "delete") p = deleteClip(p, clip.id)
      else if (op.op === "duplicate") p = duplicateClip(p, clip.id)
      else if (op.op === "move") p = moveClip(p, clip.id, Math.round(op.to) - 1)
    }
    if (p === before && op.op !== "clearCaptions") skipped++
    else applied++
  }
  return { project: p, applied, skipped }
}

/** The cut written for the model: numbered clips with the start and length of each. */
export function describeCut(p: EditProject, story: StoryItem): string {
  const shots = new Map(shotsOf(story).map((s) => [s.shotId, s]))
  const starts = clipStarts(p.clips)
  const clips = p.clips.map((c, i) => {
    const s = shots.get(c.shotId)
    return `${i + 1}. scene ${s?.sceneNumber ?? "?"} shot ${s?.shotNumber ?? "?"}, starts ${round(starts[i]!)}s, lasts ${c.duration}s${c.transitionIn ? `, transition in "${c.transitionIn.id}" ${c.transitionIn.duration}s` : ""}`
  })
  const caps = p.captions.map((c) => `"${c.text}" at ${c.start}s for ${c.duration}s${c.rich ? `, text layer in ${c.rich.family || "the system font"} ${c.rich.size}px` : ""}`)
  return [`Clips:\n${clips.join("\n") || "none"}`, `Captions:\n${caps.join("\n") || "none"}`, `Total length: ${totalLength(p)}s`].join("\n\n")
}

import type { AgentToolEnv } from "@/lib/ai-tools/agent-env"
import { toolById } from "@/lib/ai-tools/catalog"
import { statusOf } from "@/lib/ai-tools/match"
import { paramsFor, priceOf } from "@/lib/ai-tools/run"
import * as React from "react"
import { Images, Shapes, GripVertical, Type, Hand, Wrench, Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Redo2, Undo2, ArrowLeft, ArrowRight, ArrowRightLeft, Captions, Clapperboard, Download, FastForward, Film, ImageIcon, Layers, Loader2, Magnet, Maximize, Minimize, MousePointer2, Music, Pause, Play, Plus, RefreshCw, Search, ChevronLeft, ChevronRight, SkipBack, SkipForward, Sparkles, Trash2, Upload, Wand2, ZoomIn, ZoomOut } from "lucide-react"
import { MediaReferenceModal, type ReferenceMediaItem } from "@/components/chat/media-reference-modal"
import { AiToolPanel } from "@/components/ai-tools/ai-tool-panel"
import type { ToolMedia } from "@/lib/ai-tools/run"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { MediaAsset, Project, SettingsState } from "@/types"
import type { AgentRuntime } from "@/lib/agent/chat"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { addUpload, useUploads } from "@/lib/library/library-store"
import { downloadMedia } from "@/lib/library/download"
import { showNotice } from "@/lib/notice"
import { cn } from "@/lib/utils"
import {
  ASPECTS,
  DEFAULT_HEIGHT,
  EMPTY_PROJECT,
  editId,
  addAudio,
  addAudioLane,
  addCaption,
  addClipFromSrc,
  addMarker,
  addOverlay,
  addShotClip,
  addText,
  addVideoLayer,
  applyOps,
  aspectOf,
  soundGain,
  audioLaneCount,
  deleteMarker,
  rollEdit,
  setAspect,
  setTrack,
  isOff, trackOf,
  type Aspect,
  type CaptionStyle,
  type EditAudio,
  type EditCaption,
  type EditClip,
  type EditOverlay,
  clipAt,
  clipsAt,
  overlapOf,
  setTransitionIn,
  resolveKeys,
  clipStarts,
  clipToLayer,
  deleteAudio,
  deleteCaption,
  deleteClip,
  deleteOverlay,
  describeCut,
  duplicateClip,
  moveClip,
  moveClipToTime,
  overlayToMain,
  overlaysOf,
  parseOps,
  rippleDeleteClip,
  setAudioLane,
  setClipDuration,
  setClipTake,
  setFx,
  setFxAll,
  setLayerHeight,
  swapLayers,
  shotsOf,
  speedOf,
  splitClip,
  syncWithShots,
  totalLength,
  trimClipStart,
  updateAudio,
  updateCaption,
  updateOverlay,
  videoLayerCount,
  type ClipFx,
  type ClipSrc,
  type EditProject,
  type ShotRef,
} from "./edit-model"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { storyBrandContext } from "@/lib/brand/story-brand"
import { AUDIO_TINT, CAPTION_TINT, TEXT_TINT, videoTint } from "./clip-colors"
import { ElementsPanel, LayerPanel, MediaPanel, ScenePanel, TextPanel } from "./edit-panels"
import { Compositor, type LayerInput } from "./compositor/compositor"
import { overlapGain } from "./compositor/frame"
import { fontsOf, loadProjectFonts } from "./project-fonts"
import { drawTexts, richBounds } from "./text-render"
import { TextInspector } from "./text-inspector"
import { onFontLoaded } from "@/lib/brand/fonts"
import { ShaderTransitionCard } from "./transition-preview"
import { getItems, usePackItems } from "@/lib/packs/store"
import { MarkerIcon, RazorIcon, RollingEditIcon, TrackSelectIcon } from "./tool-icons"
import { captionCss, captionLook, fxAlpha, fxStyle } from "./clip-fx"
import { useWaveform } from "./waveform"
import { MEDIA_MIME } from "./edit-panels"
import { CaptionStyleCardView, EffectCard, FX_MIME, TransitionCard, type FxDrag } from "./fx-cards"
import { runEditor } from "@pro/story/editor-agent"
import { hasFeature } from "@/lib/license"
import type { ApprovalRequest } from "./editor-types"
import { transitionOn as pureTransitionOn, useCaptionStyles, useFxPresets, useTransitions, type TransitionKind } from "./fx-presets"
import { renderCut } from "./export-cut"
import { fetchBytes, localize } from "./media-local"
import { frameStats, sceneChanges } from "./frame-stats"
import { extractSound } from "./detach-audio"
import { sttModel, transcribe } from "@/lib/voice/speech"
import { FAST_UNSUPPORTED, fastExportAvailable, renderCutFast } from "./export-fast"
import { characterNames, parseFountain } from "./fountain"
import { LayerInspector } from "./layer-inspector"
import { frameAt, useStrip } from "./timeline-strip"
import type { StoryItem } from "./types"

interface Props {
  story: StoryItem
  onChange: (project: EditProject) => void
  /** Asks the chat model for text, for the editing agent. Missing when none is ready. */
  onGenerateText?: (prompt: string) => Promise<string>
  /** What the Library holds, for adding media to the cut */
  library?: { assets: MediaAsset[]; projects: Project[]; activeProjectId?: string }
  settings?: SettingsState
  onOpenSettings?: (tab?: string) => void
  /** What the editing agent runs on: its chat model (throws when none can run it) and how to make media. Without it the agent only does the simple edits. */
  getAgentRuntime?: () => AgentRuntime
}

/** One export waiting in the queue */
interface ExportJob {
  id: string
  label: string
  shape: Aspect
  res: number
  fps: number
  from?: number
  to?: number
  engine: "fast" | "live"
}

/** Where a file chosen in the Library goes: the end of the main track, or a layer above it at the playhead */
type PickTarget = "main" | "layer"

export interface VideoEditorHandle {
  /** The agent edits the cut from a request. Returns what it did, or throws why it could not. */
  ask: (request: string) => Promise<string>
}

type Selection = { kind: "clip" | "overlay" | "caption" | "audio"; id: string } | null

type Drag =
  | { kind: "scrub" }
  | { kind: "clip-end"; id: string; x: number; base: EditProject; limit: number }
  | { kind: "clip-start"; id: string; x: number; base: EditProject; still: boolean }
  | { kind: "clip-move"; id: string; x: number; base: EditProject; moved: boolean }
  | { kind: "overlay-move" | "overlay-end"; id: string; x: number; base: EditProject }
  | { kind: "row-resize"; id: string; x: number; y: number; base: EditProject; startHeight: number }
  | { kind: "caption-move" | "caption-start" | "caption-end"; id: string; x: number; base: EditProject }
  | { kind: "audio-move" | "audio-start" | "audio-end"; id: string; x: number; base: EditProject }

/** The tools on the left of the Edit page (icons only), and the panel each one opens. More holds Export. */
type Tool = "scene" | "ai" | "layer" | "upload" | "text" | "caption" | "transition" | "effects" | "media" | "elements"
const TOOLS: Array<{ id: Tool; label: string; Icon: React.ElementType }> = [
  { id: "scene", label: "Scene", Icon: Clapperboard },
  { id: "ai", label: "AI", Icon: Wand2 },
  { id: "layer", label: "Layer", Icon: Layers },
  { id: "upload", label: "Upload", Icon: Upload },
  { id: "text", label: "Text", Icon: Type },
  { id: "caption", label: "Caption", Icon: Captions },
  { id: "transition", label: "Transition", Icon: ArrowRightLeft },
  { id: "effects", label: "Effects", Icon: Sparkles },
  { id: "media", label: "Media", Icon: Images },
  { id: "elements", label: "Elements", Icon: Shapes },
]

/** The left panels that have a search box */
const SEARCHABLE: Array<Tool | null> = ["effects", "transition", "caption", "ai"]

const LABEL_WIDTH = 176
const SNAP_PIXELS = 8
const IMAGE_URL = /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i
const round = (x: number) => Math.round(x * 100) / 100

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`
const mark = (s: number, fine: boolean) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}${fine ? `.${Math.round((s % 1) * 10)}` : ""}`

interface Resolved {
  ref: ShotRef | undefined
  url: string | undefined
  kind: "video" | "image" | "empty"
}

/** The pictures inside a clip: frames of the video for a video, the picture again and again for a still */
function Filmstrip({ url, video, trimIn, duration, width, height }: { url: string | undefined; video: boolean; trimIn: number; duration: number; width: number; height: number }) {
  const strip = useStrip(url, video)
  const tile = Math.max(40, Math.round((height - 8) * (16 / 9)))
  const count = Math.max(1, Math.ceil(width / tile))
  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const source = video ? (strip ? frameAt(strip, trimIn + ((i + 0.5) / count) * duration) : undefined) : url
        return (
          <div key={i} className="h-full flex-shrink-0 border-r border-border/60 bg-secondary/30" style={{ width: `${tile}px` }}>
            {source && <img src={source} alt="" draggable={false} className="h-full w-full object-cover" />}
          </div>
        )
      })}
    </div>
  )
}

/** The shape of a sound inside its block on the timeline */
function Waveform({ url, height }: { url: string | undefined; height: number }) {
  const peaks = useWaveform(url, 160)
  if (!peaks) return null
  const bars = Array.from(peaks, (v, i) => `M${i} ${50 - Math.max(1, v * 48)}V${50 + Math.max(1, v * 48)}`).join("")
  return (
    <svg className="pointer-events-none absolute inset-x-0 top-0 w-full text-foreground/40" style={{ height: `${height}px` }} viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" aria-hidden="true">
      <path d={bars} stroke="currentColor" strokeWidth={0.7} fill="none" />
    </svg>
  )
}

/**
 * The cut. The main video track (V1) holds the clips in order; more video layers (V2 and up) hold overlays at the
 * times you choose, and they cover the layers below. Audio lanes and captions sit under them. Every layer can be
 * made taller or shorter by dragging its bottom edge. The screen shows the top layer under the playhead, it plays,
 * and it exports the main track. The agent edits through the same commands.
 */
export const VideoEditor = React.forwardRef<VideoEditorHandle, Props>(function VideoEditor({ story, onChange, onGenerateText, library, settings, onOpenSettings, getAgentRuntime }, handle) {
  const stored = story.edit
  const project = React.useMemo(() => stored ?? syncWithShots(EMPTY_PROJECT, story), [stored, story])
  const projectRef = React.useRef(project)
  projectRef.current = project
  const uploads = useUploads()
  const shots = React.useMemo(() => new Map(shotsOf(story).map((s) => [s.shotId, s])), [story])

  const [time, setTime] = React.useState(0)
  const timeRef = React.useRef(0)
  const [playing, setPlaying] = React.useState(false)
  const [selected, setSelected] = React.useState<Selection>(null)
  const [pps, setPps] = React.useState(56)
  const [drag, setDragRaw] = React.useState<Drag | null>(null)
  /** A drag does not start on a layer that is locked */
  const setDrag = (d: Drag | null) => {
    if (d && d.kind !== "scrub" && d.kind !== "row-resize") {
      const p = projectRef.current
      const track = d.kind.startsWith("clip") ? "v1" : d.kind.startsWith("overlay") ? `v${overlaysOf(p).find((o) => o.id === d.id)?.layer ?? 2}` : d.kind.startsWith("caption") ? "captions" : `a${p.audio.find((a) => a.id === d.id)?.lane ?? 1}`
      if (trackOf(p, track).lock) {
        showNotice("That layer is locked. Unlock it to change it.")
        return
      }
    }
    setDragRaw(d)
  }
  // The sizes of the panels, dragged with the lines between them and kept for next time
  const [layout, setLayout] = React.useState(() => {
    const fallback: { left: number; right: number; bottom: number | null } = { left: 240, right: 256, bottom: null }
    try {
      const saved = JSON.parse(localStorage.getItem("gencraft_edit_layout") ?? "null") as Partial<typeof fallback> | null
      return { ...fallback, ...(saved ?? {}) }
    } catch {
      return fallback
    }
  })
  React.useEffect(() => {
    try {
      localStorage.setItem("gencraft_edit_layout", JSON.stringify(layout))
    } catch {
      /* the sizes are only a convenience */
    }
  }, [layout])
  const startResize = (which: "left" | "right" | "bottom") => (e: React.MouseEvent) => {
    e.preventDefault()
    const x0 = e.clientX
    const y0 = e.clientY
    const base = { ...layout, bottom: layout.bottom ?? timelineBox.current?.offsetHeight ?? 300 }
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
    const move = (ev: MouseEvent) => {
      setLayout({
        ...base,
        ...(which === "left" ? { left: clamp(base.left + ev.clientX - x0, 160, 480) } : {}),
        ...(which === "right" ? { right: clamp(base.right - (ev.clientX - x0), 200, 520) } : {}),
        ...(which === "bottom" ? { bottom: clamp(base.bottom - (ev.clientY - y0), 150, Math.round(window.innerHeight * 0.75)) } : {}),
      })
    }
    const up = () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }
  const resetSize = (which: "left" | "right" | "bottom") => setLayout((l) => ({ ...l, [which]: { left: 240, right: 256, bottom: null }[which] }))
  const timelineBox = React.useRef<HTMLDivElement>(null)
  // How wide the timeline's window is, so the ruler and the layers always reach the right edge
  const [viewW, setViewW] = React.useState(0)
  // Effects, transitions and caption styles come from the content packs, so they can be updated without a new app
  const fxPresets = useFxPresets()
  const transitions = useTransitions()
  const shaderTransitions = usePackItems("transition").filter((i) => i.data.kind === "shader")
  const captionStyles = useCaptionStyles()
  const [exportOpen, setExportOpen] = React.useState(false)
  const [blade, setBlade] = React.useState(false)
  // The tool column: select, rolling edit, hand and zoom (the blade is its own switch)
  const [mode, setMode] = React.useState<"select" | "track" | "roll" | "hand" | "text">("select")
  const rollModeRef = React.useRef(false)
  rollModeRef.current = mode === "roll"
  const [magnet, setMagnet] = React.useState(true)
  const [hover, setHover] = React.useState<number | null>(null)
  const [snapLine, setSnapLine] = React.useState<number | null>(null)
  const [pointerX, setPointerX] = React.useState(0)
  const [exporting, setExporting] = React.useState<number | null>(null)
  // The tool panel on the left: the open tab, or none when it is closed
  const [tool, setTool] = React.useState<Tool | null>("scene")
  const [panelQuery, setPanelQuery] = React.useState("")
  const [searchOpen, setSearchOpen] = React.useState(false)
  const tabsRow = React.useRef<HTMLDivElement>(null)
  const hit = (name: string) => panelQuery.trim() === "" || name.toLowerCase().includes(panelQuery.trim().toLowerCase())
  const [fullscreen, setFullscreen] = React.useState(false)
  const [pickTarget, setPickTarget] = React.useState<PickTarget | null>(null)
  const [previewWidth, setPreviewWidth] = React.useState(0)
  const [previewHeight, setPreviewHeight] = React.useState(0)
  // What to export: the short side, the frames a second, and a stretch of the cut (blank means all of it)
  const [exportRes, setExportRes] = React.useState(720)
  const [exportFps, setExportFps] = React.useState(30)
  const [rangeFrom, setRangeFrom] = React.useState("")
  const [rangeTo, setRangeTo] = React.useState("")
  const exportAbort = React.useRef<AbortController | null>(null)
  const [exportQueue, setExportQueue] = React.useState<ExportJob[]>([])
  const [queueRunning, setQueueRunning] = React.useState(false)
  const [queueNow, setQueueNow] = React.useState<string | null>(null)
  // Fast renders each frame on its own, in less time than the cut plays; real time records the cut as it plays
  const [exportEngine, setExportEngine] = React.useState<"fast" | "live">("fast")
  // The look of the last clip copied, to paste on others
  const [copiedLook, setCopiedLook] = React.useState<{ fx: ClipFx | undefined } | null>(null)
  const [transitionLength, setTransitionLength] = React.useState(1)
  // A paid step the agent is waiting on the person for
  const [approval, setApproval] = React.useState<ApprovalRequest | null>(null)
  const approvalDone = React.useRef<((ok: boolean) => void) | null>(null)
  const answerApproval = (ok: boolean) => {
    approvalDone.current?.(ok)
    approvalDone.current = null
    setApproval(null)
  }
  // Leaving the page while a card is open counts as a no
  React.useEffect(() => () => approvalDone.current?.(false), [])
  const [multi, setMulti] = React.useState<string[]>([])

  // One video element per picture on screen, by the id of its clip or overlay
  const videoEls = React.useRef(new Map<string, HTMLVideoElement>())
  const audioEls = React.useRef(new Map<string, HTMLAudioElement>())
  const scroller = React.useRef<HTMLDivElement>(null)
  const audioInput = React.useRef<HTMLInputElement>(null)
  const previewRef = React.useRef<HTMLDivElement>(null)

  const total = totalLength(project)
  const starts = clipStarts(project.clips)
  const missing = shotsOf(story).filter((s) => !project.clips.some((c) => c.shotId === s.shotId)).length
  const videoCount = videoLayerCount(project)
  const laneCount = audioLaneCount(project)
  const heightOf = (id: string, kind: "video" | "audio" | "captions") => project.heights?.[id] ?? DEFAULT_HEIGHT[kind]

  /** What a clip or an overlay shows: a take of a beat, or a file from the Library */
  const resolveShot = React.useCallback(
    (shotId: string, take: number, src?: ClipSrc): Resolved => {
      if (src) return { ref: undefined, url: src.url, kind: src.type }
      const ref = shots.get(shotId)
      const url = ref?.takes[take]
      if (!url) return { ref, url: undefined, kind: "empty" }
      return { ref, url, kind: ref?.mode === "video" && !IMAGE_URL.test(url) ? "video" : "image" }
    },
    [shots],
  )
  /** The name on a clip's label: its scene and beat, or the file's name */
  const nameOf = (item: { shotId: string; src?: ClipSrc }, r: Resolved) => (item.src ? item.src.name : `S${r.ref?.sceneNumber ?? "-"}.${r.ref?.shotNumber ?? "-"}`)

  // Undo and redo. Changes that follow each other closely (a drag, a slider) count as one step.
  const undoStack = React.useRef<EditProject[]>([])
  const redoStack = React.useRef<EditProject[]>([])
  const lastCommit = React.useRef(0)
  const [, setHistoryTick] = React.useState(0)
  const commit = React.useCallback(
    (next: EditProject) => {
      if (next === projectRef.current) return
      const now = Date.now()
      if (now - lastCommit.current > 500) {
        undoStack.current = [...undoStack.current.slice(-99), projectRef.current]
        redoStack.current = []
        setHistoryTick((n) => n + 1)
      }
      lastCommit.current = now
      projectRef.current = next
      onChange(next)
    },
    [onChange],
  )
  const undo = () => {
    const back = undoStack.current.pop()
    if (!back) return
    redoStack.current.push(projectRef.current)
    projectRef.current = back
    lastCommit.current = 0
    onChange(back)
    setSelected(null)
    setHistoryTick((n) => n + 1)
  }
  const redo = () => {
    const forward = redoStack.current.pop()
    if (!forward) return
    undoStack.current.push(projectRef.current)
    projectRef.current = forward
    lastCommit.current = 0
    onChange(forward)
    setSelected(null)
    setHistoryTick((n) => n + 1)
  }

  const seek = React.useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(totalLength(projectRef.current) + 0.0001, t))
    timeRef.current = clamped
    setTime(clamped)
  }, [])

  const timeFromClientX = React.useCallback(
    (x: number) => {
      const box = scroller.current
      if (!box) return 0
      return Math.max(0, (x - box.getBoundingClientRect().left - LABEL_WIDTH + box.scrollLeft) / pps)
    },
    [pps],
  )

  /** Pulls a time to the playhead or to the edge of any clip, overlay, caption or sound near it, when snapping is on */
  const snap = React.useCallback(
    (t: number, skip: { clip?: string; overlay?: string; caption?: string; audio?: string } = {}): { t: number; hit: number | null } => {
      if (!magnet) return { t, hit: null }
      const p = projectRef.current
      const s = clipStarts(p.clips)
      const points = [0, timeRef.current, ...(p.markers ?? []).map((m) => m.time)]
      p.clips.forEach((c, i) => {
        if (c.id === skip.clip) return
        points.push(s[i]!, s[i]! + c.duration)
      })
      overlaysOf(p).forEach((o) => o.id !== skip.overlay && points.push(o.start, o.start + o.duration))
      p.captions.forEach((c) => c.id !== skip.caption && points.push(c.start, c.start + c.duration))
      p.audio.forEach((a) => a.id !== skip.audio && points.push(a.start, a.start + a.duration))
      let best: number | null = null
      for (const point of points) if (Math.abs(point - t) * pps <= SNAP_PIXELS && (best === null || Math.abs(point - t) < Math.abs(best - t))) best = point
      return best === null ? { t, hit: null } : { t: best, hit: best }
    },
    [magnet, pps],
  )

  // The clock. It runs while playing and stops at the end.
  React.useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const end = totalLength(projectRef.current)
      const next = timeRef.current + (now - last) / 1000
      last = now
      if (next >= end) {
        timeRef.current = end
        setTime(end)
        setPlaying(false)
        return
      }
      timeRef.current = next
      setTime(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  // While playing the timeline follows the playhead
  React.useEffect(() => {
    const box = scroller.current
    if (!playing || !box) return
    const x = LABEL_WIDTH + time * pps
    if (x > box.scrollLeft + box.clientWidth - 80) box.scrollLeft = x - box.clientWidth * 0.25
  }, [playing, time, pps])

  // What the preview shows: the top layer under the playhead, or the frame under the cursor while it moves over the timeline
  const shownTime = !playing && hover !== null && !drag ? hover : time
  const at = clipAt(project, shownTime)
  const currentClip = at ? project.clips[at.index] : undefined
  // Everything on screen at this time, the bottom first: the main clip (two while a transition runs), then each overlay by its layer
  const mainNow = clipsAt(project, shownTime)
  const stack = [
    ...(isOff(project, "v1") ? [] : mainNow.clips.map((m) => ({ key: project.clips[m.index]!.id, item: project.clips[m.index]!, into: m.into, main: true }))),
    ...overlaysOf(project)
      .filter((o) => shownTime >= o.start && shownTime < o.start + o.duration && !isOff(project, `v${o.layer}`))
      .sort((a, b) => a.layer - b.layer)
      .map((o) => ({ key: o.id, item: o, into: shownTime - o.start, main: false })),
  ].map((s) => ({ ...s, res: resolveShot(s.item.shotId, s.item.take, s.item.src) }))
  // Clips that start within a second and a half are loaded now, hidden, so a cut or a transition begins on a real picture
  const warm = (() => {
    const starts = clipStarts(project.clips)
    const out: Array<{ key: string; item: EditClip; into: number; main: boolean; res: Resolved }> = []
    project.clips.forEach((c, i) => {
      if (isOff(project, "v1") || stack.some((x) => x.key === c.id)) return
      if (starts[i]! > shownTime && starts[i]! - shownTime < 1.5) out.push({ key: c.id, item: c, into: 0, main: true, res: resolveShot(c.shotId, c.take, c.src) })
    })
    return out
  })()
  const mounted = [...stack.map((x) => ({ ...x, visible: true })), ...warm.map((x) => ({ ...x, visible: false }))]
  const stackSig = stack.map((s) => `${s.key}:${s.res.url}:${s.item.fx?.speed ?? ""}:${s.item.fx?.volume ?? ""}`).join("|")

  React.useEffect(() => {
    for (const s of stack) {
      const v = videoEls.current.get(s.key)
      if (!v || s.res.kind !== "video") continue
      const speed = speedOf(s.item.fx)
      const want = s.item.trimIn + s.into * speed
      v.playbackRate = speed
      // Through a transition the clip going out fades down as the clip coming in fades up
      const through = s.main ? overlapGain(stack.filter((x) => x.main).map((x) => ({ id: x.key, layer: 1, start: shownTime - x.into, duration: x.item.duration })), { id: s.key, layer: 1, start: shownTime - s.into, duration: s.item.duration }, shownTime) : 1
      v.volume = Math.max(0, Math.min(1, (s.item.fx?.volume ?? 1) * through))
      if (!playing || Math.abs(v.currentTime - want) > 0.4) v.currentTime = want
      if (playing) void v.play().catch(() => undefined)
      else v.pause()
    }
    for (const w of warm) {
      const v = videoEls.current.get(w.key)
      if (v && w.res.kind === "video" && v.paused && Math.abs(v.currentTime - w.item.trimIn) > 0.05) v.currentTime = w.item.trimIn
    }
  }, [playing, stackSig, playing ? 0 : shownTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // The picture is drawn on the graphics card when the window has it: one frame at a time, the same way the export draws it
  const [gpuBroken, setGpuBroken] = React.useState(false)
  const gpu = React.useMemo(() => Compositor.supported(), []) && !gpuBroken
  const glCanvas = React.useRef<HTMLCanvasElement>(null)
  const compositor = React.useRef<Compositor | null>(null)
  const imgEls = React.useRef(new Map<string, HTMLImageElement>())
  const [frameTick, setFrameTick] = React.useState(0)
  const hasPicture = stack.some((x) => x.res.kind !== "empty" && x.res.url)
  React.useEffect(() => {
    const cv = glCanvas.current
    if (!gpu || !cv || previewWidth < 2 || previewHeight < 2) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    try {
      if (!compositor.current) compositor.current = new Compositor(previewWidth * dpr, previewHeight * dpr, cv)
      else compositor.current.resize(previewWidth * dpr, previewHeight * dpr)
    } catch {
      setGpuBroken(true)
    }
  }, [gpu, previewWidth, previewHeight])
  React.useEffect(
    () => () => {
      compositor.current?.dispose()
      compositor.current = null
    },
    [],
  )
  React.useEffect(() => {
    const c = compositor.current
    if (!gpu || !c || !hasPicture) return
    const layerOf = (x: (typeof stack)[number]): LayerInput | null => {
      const v = videoEls.current.get(x.key)
      const im = imgEls.current.get(x.key)
      const fx = resolveKeys(x.item.fx, x.into)
      if (x.res.kind === "video" && v && v.readyState >= 2 && v.videoWidth > 0) return { source: v, sw: v.videoWidth, sh: v.videoHeight, fx, alpha: fxAlpha(fx, x.into, x.item.duration), time: x.into }
      if (x.res.kind === "image" && im && im.naturalWidth > 0) return { source: im, sw: im.naturalWidth, sh: im.naturalHeight, fx, alpha: fxAlpha(fx, x.into, x.item.duration), time: x.into }
      return null
    }
    const base = stack.filter((x) => x.main).map(layerOf)
    const overlays = stack.filter((x) => !x.main).map(layerOf).filter((l): l is LayerInput => l !== null)
    const incoming = mainNow.progress !== null ? project.clips[mainNow.clips[mainNow.clips.length - 1]!.index] : undefined
    const entry = incoming?.transitionIn ? getItems("transition").find((i) => i.id === incoming.transitionIn!.id) : undefined
    const shader = entry?.data.kind === "shader" ? entry : undefined
    try {
      const ready = base.filter((l): l is LayerInput => l !== null)
      c.render({
        base: ready,
        transition: shader && ready.length >= 2 ? { glsl: String(shader.data.glsl), params: shader.data.params as Record<string, number | number[] | boolean> | undefined, progress: mainNow.progress ?? 0 } : undefined,
        overlays,
      })
    } catch {
      setGpuBroken(true)
    }
  })

  // The width of the screen, so blur in the preview matches the export
  const frameRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      setPreviewWidth(el.clientWidth)
      setPreviewHeight(el.clientHeight)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // The audio lanes play what falls under the playhead
  React.useEffect(() => {
    for (const a of project.audio) {
      const el = audioEls.current.get(a.id)
      if (!el) continue
      const inside = time >= a.start && time < a.start + a.duration
      el.volume = isOff(project, `a${a.lane ?? 1}`) ? 0 : inside ? soundGain(project, a, time - a.start) : a.volume
      if (playing && inside) {
        if (Math.abs(el.currentTime - (time - a.start)) > 0.4) el.currentTime = time - a.start
        if (el.paused) void el.play().catch(() => undefined)
      } else if (!el.paused) el.pause()
    }
  }, [playing, time, project.audio, project.tracks])

  const uploadUrl = (id: string) => uploads.find((u) => u.id === id)?.url

  // Ctrl and the wheel zoom the timeline around the cursor
  React.useEffect(() => {
    const box = scroller.current
    if (!box) return
    // The wheel moves the timeline sideways. Shift (or Ctrl and Cmd, which is also how a trackpad pinch arrives) zooms around the
    // cursor, and Alt moves it up and down. A Mac sends Shift and the wheel as sideways movement, so either direction counts.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const amount = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const anchor = timeFromClientX(e.clientX)
        const next = Math.max(8, Math.min(240, pps * (amount < 0 ? 1.15 : 0.87)))
        setPps(next)
        window.requestAnimationFrame(() => {
          box.scrollLeft = anchor * next + LABEL_WIDTH - (e.clientX - box.getBoundingClientRect().left)
        })
      } else if (e.altKey) box.scrollTop += amount
      else box.scrollLeft += amount
    }
    box.addEventListener("wheel", onWheel, { passive: false })
    const watch = new ResizeObserver(() => setViewW(box.clientWidth))
    watch.observe(box)
    setViewW(box.clientWidth)
    return () => {
      box.removeEventListener("wheel", onWheel)
      watch.disconnect()
    }
  }, [pps, timeFromClientX])

  // Dragging: the playhead, a clip or its edges, an overlay, a caption, a sound, and the height of a layer
  React.useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      setPointerX(e.clientX)
      if (drag.kind === "scrub") {
        const s = snap(timeFromClientX(e.clientX))
        setSnapLine(s.hit)
        seek(s.t)
        return
      }
      if (drag.kind === "row-resize") {
        commit(setLayerHeight(drag.base, drag.id, drag.startHeight + (e.clientY - drag.y)))
        return
      }
      const dx = (e.clientX - drag.x) / pps
      const base = drag.base
      if (drag.kind === "clip-end") {
        const i = base.clips.findIndex((c) => c.id === drag.id)
        const c = base.clips[i]
        if (!c) return
        const begin = clipStarts(base.clips)[i]!
        const s = snap(begin + c.duration + dx, { clip: drag.id })
        setSnapLine(s.hit)
        // Shift moves the cut between this clip and the next one instead: the next one gives up or takes the time
        if (e.shiftKey || rollModeRef.current) commit(rollEdit(base, drag.id, s.t - begin - c.duration))
        else commit(setClipDuration(base, drag.id, Math.min(drag.limit, s.t - begin)))
      } else if (drag.kind === "clip-start") {
        setSnapLine(null)
        commit(trimClipStart(base, drag.id, dx, drag.still))
      } else if (drag.kind === "clip-move") {
        if (!drag.moved && Math.abs(e.clientX - drag.x) > 4) setDrag({ ...drag, moved: true })
      } else if (drag.kind === "overlay-move") {
        const o = overlaysOf(base).find((x) => x.id === drag.id)
        if (!o) return
        const s = snap(o.start + dx, { overlay: o.id })
        setSnapLine(s.hit)
        commit(updateOverlay(base, o.id, { start: s.t }))
      } else if (drag.kind === "overlay-end") {
        const o = overlaysOf(base).find((x) => x.id === drag.id)
        if (!o) return
        const s = snap(o.start + o.duration + dx, { overlay: o.id })
        setSnapLine(s.hit)
        commit(updateOverlay(base, o.id, { duration: s.t - o.start }))
      } else if (drag.kind.startsWith("caption")) {
        const c = base.captions.find((x) => x.id === drag.id)
        if (!c) return
        if (drag.kind === "caption-move") {
          const a = snap(c.start + dx, { caption: c.id })
          const b = snap(c.start + c.duration + dx, { caption: c.id })
          const start = a.hit !== null ? a.t : b.hit !== null ? b.t - c.duration : a.t
          setSnapLine(a.hit ?? b.hit)
          commit(updateCaption(base, c.id, { start }))
        } else if (drag.kind === "caption-end") {
          const s = snap(c.start + c.duration + dx, { caption: c.id })
          setSnapLine(s.hit)
          commit(updateCaption(base, c.id, { duration: s.t - c.start }))
        } else {
          const end = c.start + c.duration
          const s = snap(Math.min(end - 0.2, c.start + dx), { caption: c.id })
          setSnapLine(s.hit)
          commit(updateCaption(base, c.id, { start: s.t, duration: end - s.t }))
        }
      } else {
        const a = base.audio.find((x) => x.id === drag.id)
        if (!a) return
        if (drag.kind === "audio-move") {
          const s = snap(a.start + dx, { audio: a.id })
          setSnapLine(s.hit)
          commit(updateAudio(base, a.id, { start: s.t }))
        } else if (drag.kind === "audio-end") {
          const s = snap(a.start + a.duration + dx, { audio: a.id })
          setSnapLine(s.hit)
          commit(updateAudio(base, a.id, { duration: Math.max(0.2, s.t - a.start) }))
        } else {
          const end = a.start + a.duration
          const s = snap(Math.min(end - 0.2, a.start + dx), { audio: a.id })
          setSnapLine(s.hit)
          commit(updateAudio(base, a.id, { start: s.t, duration: end - s.t }))
        }
      }
    }
    const onUp = (e: MouseEvent) => {
      if (drag.kind === "clip-move" && drag.moved) commit(moveClipToTime(drag.base, drag.id, timeFromClientX(e.clientX)))
      setSnapLine(null)
      setDrag(null)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [drag, pps, commit, seek, snap, timeFromClientX])

  const selectedClip = selected?.kind === "clip" ? project.clips.find((c) => c.id === selected.id) : undefined
  // Clips chosen together with Shift or Ctrl and a click. The last one clicked is the one the options on the right show.
  const chosenIds = selectedClip && multi.length > 1 && multi.includes(selectedClip.id) ? multi.filter((id) => project.clips.some((c) => c.id === id)) : selectedClip ? [selectedClip.id] : []
  React.useEffect(() => {
    if (multi.length > 0 && !(selected?.kind === "clip" && multi.includes(selected.id))) setMulti([])
  }, [selected, multi])
  const selectedOverlay = selected?.kind === "overlay" ? overlaysOf(project).find((o) => o.id === selected.id) : undefined
  const selectedCaption = selected?.kind === "caption" ? project.captions.find((c) => c.id === selected.id) : undefined
  const selectedAudio = selected?.kind === "audio" ? project.audio.find((a) => a.id === selected.id) : undefined
  /** The clip, layer or sound the AI tools work on */
  const toolMedia: ToolMedia | null = (() => {
    // With nothing selected the tools work on the clip under the playhead
    const atPlayhead = !selectedClip && !selectedOverlay && !selectedAudio ? project.clips.find((c, i) => time >= (starts[i] ?? 0) && time < (starts[i] ?? 0) + c.duration) : undefined
    const item = selectedClip ?? selectedOverlay ?? atPlayhead
    if (item) {
      const r = resolveShot(item.shotId, item.take, item.src)
      if (r.url && (r.kind === "video" || r.kind === "image")) return { url: r.url, kind: r.kind, name: nameOf(item, r), seconds: item.duration }
    }
    if (selectedAudio) {
      const up = uploads.find((u) => u.id === selectedAudio.uploadId)
      if (up) return { url: up.url, kind: "audio", name: selectedAudio.name, seconds: selectedAudio.duration }
    }
    return null
  })()

  // Effects and transitions go on the selected clip or overlay
  const fxTarget = selectedClip ? ({ kind: "clip", id: selectedClip.id } as const) : selectedOverlay ? ({ kind: "overlay", id: selectedOverlay.id } as const) : null
  /** Puts a change of look on everything selected: all the chosen clips, or the one clip or overlay */
  const fxAll = (patch: Partial<ClipFx> | null) => {
    if (!fxTarget) return
    let next = project
    if (chosenIds.length > 1) for (const id of chosenIds) next = setFx(next, "clip", id, patch)
    else next = setFx(next, fxTarget.kind, fxTarget.id, patch)
    commit(next)
  }
  const applyPreset = (patch: Partial<ClipFx>) => {
    if (!fxTarget) showNotice("Select a clip first, or drag the card onto a clip on the timeline.")
    else fxAll(patch)
  }
  /** A transition on one clip or overlay. A dip to black also fades the next clip in, so it needs a clip after it. Null when it does not fit. */
  const transitionOn = (p: EditProject, target: { kind: "clip" | "overlay"; id: string }, kind: TransitionKind): EditProject | null => pureTransitionOn(p, target, kind, transitionLength)
  /** A transition from the library between a clip and the one before it: the two overlap by its length */
  const applyOverlap = (itemId: string, clipId?: string) => {
    const id = clipId ?? (selected?.kind === "clip" ? selected.id : undefined)
    const i = project.clips.findIndex((c) => c.id === id)
    if (i < 0) return showNotice("Select a clip first, or drag the card onto a clip.")
    if (i === 0) return showNotice("The first clip has no clip before it. Choose the second clip or a later one.")
    if (trackOf(project, "v1").lock) return showNotice("That layer is locked. Unlock it to change it.")
    commit(setTransitionIn(project, project.clips[i]!.id, { id: itemId, duration: transitionLength }))
  }
  const applyTransition = (kind: TransitionKind) => {
    if (!fxTarget) return showNotice("Select a clip first, or drag the card onto a clip on the timeline.")
    let next = project
    for (const t of chosenIds.length > 1 ? chosenIds.map((id) => ({ kind: "clip" as const, id })) : [fxTarget]) {
      const done = transitionOn(next, t, kind)
      if (!done) return showNotice("A dip to black needs a clip after the selected one on the main track.")
      next = done
    }
    commit(next)
  }

  // Cards dragged from the Effects and Transition panels onto a clip of the timeline
  const [dropOver, setDropOver] = React.useState<string | null>(null)
  const dropFx = (e: React.DragEvent, target: { kind: "clip" | "overlay"; id: string }) => {
    const raw = e.dataTransfer.getData(FX_MIME)
    setDropOver(null)
    if (!raw) return
    e.preventDefault()
    e.stopPropagation()
    const card = JSON.parse(raw) as FxDrag
    if (card.type === "effect") {
      const preset = fxPresets.find((p) => p.id === card.id)
      if (preset) commit(setFx(project, target.kind, target.id, preset.patch))
    } else if (card.type === "overlap") {
      if (target.kind === "clip") applyOverlap(card.id, target.id)
      else showNotice("A transition between clips goes on the main track.")
    } else {
      const done = transitionOn(project, target, card.id)
      if (done) commit(done)
      else showNotice("A dip to black needs a clip after this one on the main track.")
    }
    setSelected(target)
  }
  const dropProps = (target: { kind: "clip" | "overlay"; id: string }) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(FX_MIME)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      if (dropOver !== target.id) setDropOver(target.id)
    },
    onDragLeave: () => setDropOver((d) => (d === target.id ? null : d)),
    onDrop: (e: React.DragEvent) => dropFx(e, target),
  })
  // A frame of the cut to show the cards on: the first two clips that have something to show
  const samples = project.clips
    .map((c) => resolveShot(c.shotId, c.take, c.src))
    .filter((r): r is Resolved & { url: string; kind: "video" | "image" } => Boolean(r.url) && r.kind !== "empty")
    .map((r) => ({ url: r.url, kind: r.kind }))
  /** Seconds from a clip's start to the playhead, or null when the playhead is not inside it */
  const intoOf = (start: number, duration: number) => (time >= start - 0.001 && time <= start + duration + 0.001 ? Math.max(0, time - start) : null)

  const doSplit = () => {
    const target = selectedClip ?? currentClip
    if (!target) return
    const next = splitClip(project, target.id, timeRef.current)
    if (next === project) showNotice("Move the playhead into the clip, away from its edges, then split.")
    else commit(next)
  }
  const duplicateAll = () => {
    let next = projectRef.current
    for (const id of chosenIds.length > 0 ? chosenIds : selectedClip ? [selectedClip.id] : []) next = duplicateClip(next, id)
    return next
  }
  const doDelete = (ripple = false, target: Selection = selected) => {
    if (!target) return
    const overlay = target.kind === "overlay" ? overlaysOf(project).find((o) => o.id === target.id) : undefined
    const sound = target.kind === "audio" ? project.audio.find((x) => x.id === target.id) : undefined
    const track = target.kind === "clip" ? "v1" : target.kind === "overlay" ? `v${overlay?.layer ?? 2}` : target.kind === "caption" ? "captions" : `a${sound?.lane ?? 1}`
    if (trackOf(project, track).lock) return showNotice("That layer is locked. Unlock it to change it.")
    if (target.kind === "clip") {
      let next = project
      for (const id of target === selected && chosenIds.length > 0 ? chosenIds : [target.id]) next = ripple ? rippleDeleteClip(next, id) : deleteClip(next, id)
      commit(next)
    } else if (target.kind === "overlay") commit(deleteOverlay(project, target.id))
    else if (target.kind === "caption") commit(deleteCaption(project, target.id))
    else commit(deleteAudio(project, target.id))
    setSelected(null)
  }

  // Copy, cut and paste: what was copied is kept here, and paste puts a new one at the playhead (or where you right-clicked)
  const [clipboard, setClipboard] = React.useState<
    | { kind: "clip"; item: EditClip }
    | { kind: "overlay"; item: EditOverlay }
    | { kind: "caption"; item: EditCaption }
    | { kind: "audio"; item: EditAudio }
    | null
  >(null)
  const snapshotOf = (target: NonNullable<Selection>): NonNullable<typeof clipboard> | null => {
    if (target.kind === "clip") {
      const item = project.clips.find((c) => c.id === target.id)
      return item ? { kind: "clip", item } : null
    }
    if (target.kind === "overlay") {
      const item = overlaysOf(project).find((o) => o.id === target.id)
      return item ? { kind: "overlay", item } : null
    }
    if (target.kind === "caption") {
      const item = project.captions.find((c) => c.id === target.id)
      return item ? { kind: "caption", item } : null
    }
    const item = project.audio.find((x) => x.id === target.id)
    return item ? { kind: "audio", item } : null
  }
  const copyItem = (target: NonNullable<Selection>) => {
    const snap = snapshotOf(target)
    if (snap) setClipboard(snap)
  }
  /** The cut with a copy of something placed at a time; `track` is the layer id it was dropped on, when it was */
  const place = (snap: NonNullable<typeof clipboard>, time: number, track?: string): EditProject => {
    const base = projectRef.current
    const at = round(Math.max(0, time))
    if (snap.kind === "clip") {
      const copy = { ...snap.item, id: editId("c") }
      return moveClipToTime({ ...base, clips: [...base.clips, copy] }, copy.id, at)
    }
    if (snap.kind === "overlay") {
      const layer = track && /^v\d+$/.test(track) && Number(track.slice(1)) >= 2 ? Number(track.slice(1)) : snap.item.layer
      const { id: _id, ...rest } = snap.item
      return addOverlay(layerCountFor(base, layer), rest.shotId, rest.take, layer, at, rest.duration, rest.trimIn, { src: rest.src, fx: rest.fx })
    }
    if (snap.kind === "caption") {
      return { ...base, captions: [...base.captions, { ...snap.item, id: editId("t"), start: at }].sort((x, y) => x.start - y.start) }
    }
    const { id: _id, ...rest } = snap.item
    const lane = track && /^a\d+$/.test(track) ? Number(track.slice(1)) : rest.lane
    return addAudio(base, { ...rest, start: at, lane })
  }
  /** Makes sure the layer a paste lands on exists */
  const layerCountFor = (p: EditProject, layer: number): EditProject => (videoLayerCount(p) >= layer ? p : { ...p, videoLayers: layer })
  const pasteAt = (time: number, track?: string) => {
    if (!clipboard) return showNotice("Nothing is copied yet.")
    const trackId = track ?? (clipboard.kind === "clip" ? "v1" : clipboard.kind === "overlay" ? `v${clipboard.item.layer}` : clipboard.kind === "caption" ? "captions" : `a${clipboard.item.lane ?? 1}`)
    if (trackOf(project, trackId).lock) return showNotice("That layer is locked. Unlock it to change it.")
    commit(place(clipboard, time, track))
  }
  const duplicateItem = (target: NonNullable<Selection>) => {
    const snap = snapshotOf(target)
    if (!snap) return
    if (snap.kind === "clip") return commit(duplicateClip(project, snap.item.id))
    const start = snap.kind === "overlay" || snap.kind === "audio" || snap.kind === "caption" ? snap.item.start + snap.item.duration : 0
    commit(place(snap, start))
  }

  // The right-click menu: opens where the pointer is, for a clip, a layer's item or an empty stretch of a layer
  type MenuTarget = { kind: "item"; target: NonNullable<Selection> } | { kind: "track"; track: string; time: number }
  const [menu, setMenu] = React.useState<{ x: number; y: number; for: MenuTarget } | null>(null)
  const openMenu = (e: React.MouseEvent, target: MenuTarget) => {
    e.preventDefault()
    e.stopPropagation()
    if (target.kind === "item") setSelected(target.target)
    setMenu({ x: e.clientX, y: e.clientY, for: target })
  }
  const trackMenu = (track: string) => (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    openMenu(e, { kind: "track", track, time: timeFromClientX(e.clientX) })
  }

  /** A style from the Caption tab: on the chosen caption, or with `null` back to plain on every caption. A style replaces the old one whole. */
  const applyCaptionStyle = (style: CaptionStyle | null) => {
    if (trackOf(project, "captions").lock) return showNotice("That layer is locked. Unlock it to change it.")
    let next = project
    if (style === null) for (const cap of project.captions) next = updateCaption(next, cap.id, { style: undefined })
    else if (selected?.kind === "caption") next = updateCaption(next, selected.id, { style: { ...style } })
    else return showNotice("Select a caption first.")
    commit(next)
  }
  const doCaption = () => {
    const start = round(timeRef.current)
    const next = addCaption(project, "Caption", start, 2)
    commit(next)
    const made = next.captions.find((c) => c.start === start && c.text === "Caption")
    if (made) setSelected({ kind: "caption", id: made.id })
  }

  /** How long a sound or a video is, read from the file; the fallback when it cannot be read */
  const probeLength = (url: string, kind: "audio" | "video", fallback: number) =>
    new Promise<number>((resolveLength) => {
      const probe = kind === "audio" ? new Audio() : document.createElement("video")
      probe.preload = "metadata"
      // A file the window cannot read never answers: after a few seconds the fallback length is used so the add does not hang
      const timer = window.setTimeout(() => resolveLength(fallback), 4000)
      probe.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timer)
        resolveLength(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : fallback)
      })
      probe.addEventListener("error", () => {
        window.clearTimeout(timer)
        resolveLength(fallback)
      })
      probe.src = url
    })

  const placeAudio = async (item: { id: string; title: string; url: string }, length?: number, at?: number) => {
    const seconds = length ?? (await probeLength(item.url, "audio", 10))
    commit(addAudio(projectRef.current, { uploadId: item.id, name: item.title, start: round(at ?? timeRef.current), duration: round(seconds), volume: 1, lane: 1 }))
  }

  /** Takes the sound of a video clip onto an audio lane of its own, at the clip's place, and silences the clip itself */
  const detachSound = async (clipId: string) => {
    const p = projectRef.current
    const i = p.clips.findIndex((c) => c.id === clipId)
    const c = p.clips[i]
    const r = c ? resolveShot(c.shotId, c.take, c.src) : undefined
    if (!c || !r?.url || r.kind !== "video") return showNotice("Only a video clip has sound to detach.")
    const wavBlob = await extractSound(r.url, c.trimIn, c.duration * speedOf(c.fx))
    if (!wavBlob) return showNotice("That video has no sound that can be read here.")
    const label = c.src?.name ?? `Clip ${i + 1}`
    const item = await addUpload(new File([wavBlob], `${label} sound.wav`, { type: "audio/wav" }), story.id)
    const start = clipStarts(p.clips)[i] ?? 0
    const lane = Math.max(1, audioLaneCount(p))
    commit(setFx(addAudio(projectRef.current, { uploadId: item.id, name: item.title, start: round(start), duration: round(c.duration), volume: c.fx?.volume ?? 1, lane }), "clip", c.id, { volume: 0 }))
    showNotice("The sound is on its own audio lane now. The clip itself is silent.")
  }

  /** Files from the computer go to the Upload panel; from there a click or a drag puts them in the cut */
  const addFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      try {
        showNotice(`Adding ${file.name}...`)
        await addUpload(file, story.id)
        showNotice(`${file.name} is in Upload. Drag it onto the timeline, or click it.`)
      } catch (e) {
        showNotice(`${file.name} could not be added${e instanceof Error ? `: ${e.message}` : "."}`)
      }
    }
    if (audioInput.current) audioInput.current.value = ""
  }

  /** A file chosen in the Library: a picture or video goes on the main track or a layer, a sound onto its lane */
  const pickMedia = async (item: ReferenceMediaItem, forced?: "main" | "layer") => {
    const target = forced ?? pickTarget
    setPickTarget(null)
    if (item.type === "audio") {
      try {
        const have = uploads.find((u) => u.id === item.id)
        if (have) await placeAudio(have, item.duration)
        else {
          const blob = await (await fetch(item.url)).blob()
          await placeAudio(await addUpload(new File([blob], item.title || "sound", { type: blob.type }), story.id), item.duration)
        }
      } catch {
        showNotice("That sound could not be read. Save it to the Library first, then add it.")
      }
      return
    }
    const src: ClipSrc = { url: item.url, type: item.type, name: item.title }
    const length = item.type === "video" ? (item.duration ?? (await probeLength(item.url, "video", 5))) : 5
    const p = projectRef.current
    if (target === "layer") {
      const withLayer = videoLayerCount(p) > 1 ? p : addVideoLayer(p)
      commit(addOverlay(withLayer, "", 0, videoLayerCount(withLayer), round(timeRef.current), length, 0, { src }))
    } else commit(addClipFromSrc(p, src, length))
  }

  const fit = () => {
    const box = scroller.current
    if (box && total > 0) setPps(Math.max(8, Math.min(240, (box.clientWidth - LABEL_WIDTH - 40) / total)))
  }

  /** Press on a text layer in the picture and drag it: its middle follows the pointer */
  const startTextDrag = (e: React.MouseEvent) => {
    if (e.button !== 0 || playing) return
    const frame = frameRef.current
    const cv = textCanvas.current
    const g = cv?.getContext("2d")
    if (!frame || !cv || !g) return
    const rect = frame.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * cv.width
    const py = ((e.clientY - rect.top) / rect.height) * cv.height
    const hit = [...project.captions].reverse().find((c) => {
      if (!c.rich || shownTime < c.start || shownTime >= c.start + c.duration) return false
      const b = richBounds(g, c, cv.width, cv.height)
      return b !== null && Math.abs(px - b.cx) <= b.w / 2 + 12 && Math.abs(py - b.cy) <= b.h / 2 + 10
    })
    if (!hit?.rich) return
    if (trackOf(project, "captions").lock) return showNotice("That layer is locked. Unlock it to change it.")
    e.preventDefault()
    setSelected({ kind: "caption", id: hit.id })
    const base = projectRef.current
    const rich = hit.rich
    const move = (ev: MouseEvent) => {
      const dx = ((ev.clientX - e.clientX) / rect.width) * 100
      const dy = ((ev.clientY - e.clientY) / rect.height) * 100
      commit(updateCaption(base, hit.id, { rich: { ...rich, x: round(rich.x + dx), y: round(rich.y + dy) } }))
    }
    const up = () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }

  const togglePlay = () => {
    if (!playing && timeRef.current >= total) seek(0)
    setPlaying((p) => !p)
  }
  // Next clip: the start of the first clip after the playhead, or the end of the cut
  const nextClip = () => {
    const next = clipStarts(projectRef.current.clips).find((t) => t > timeRef.current + 0.05)
    seek(next ?? totalLength(projectRef.current))
  }
  const forward = () => seek(timeRef.current + 5)
  const toggleFullscreen = () => {
    // The macOS window (WebKit) names these with a prefix
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }
    const el = previewRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null
    const open = doc.fullscreenElement ?? doc.webkitFullscreenElement
    try {
      if (open) void Promise.resolve(doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()).catch(() => undefined)
      else if (el?.requestFullscreen) void el.requestFullscreen().catch(() => showNotice("Full screen is not available here."))
      else if (el?.webkitRequestFullscreen) void Promise.resolve(el.webkitRequestFullscreen()).catch(() => showNotice("Full screen is not available here."))
      else showNotice("Full screen is not available here.")
    } catch {
      showNotice("Full screen is not available here.")
    }
  }
  React.useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null }
    const sync = () => setFullscreen((doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null)
    document.addEventListener("fullscreenchange", sync)
    document.addEventListener("webkitfullscreenchange", sync)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      document.removeEventListener("webkitfullscreenchange", sync)
    }
  }, [])

  // Keys: space plays, S splits at the playhead, C is the blade, arrows step, Delete removes. Not while typing.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      if (pickTarget) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault()
        redo()
      } else if (e.key === " ") {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if ((e.ctrlKey || e.metaKey) && key === "c" && selected) {
        e.preventDefault()
        copyItem(selected)
      } else if ((e.ctrlKey || e.metaKey) && key === "x" && selected) {
        e.preventDefault()
        copyItem(selected)
        doDelete(false)
      } else if ((e.ctrlKey || e.metaKey) && key === "v") {
        e.preventDefault()
        pasteAt(timeRef.current)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        nextClip()
      }
      else if (key === "f" && !e.ctrlKey && !e.metaKey) forward()
      else if (key === "s" && !e.ctrlKey && !e.metaKey) doSplit()
      else if (key === "c" && !e.ctrlKey && !e.metaKey) setBlade((b) => !b)
      else if (key === "v") { setBlade(false); setMode("select") }
      else if (key === "n" && !e.ctrlKey && !e.metaKey) { setBlade(false); setMode("roll") }
      else if (key === "h" && !e.ctrlKey && !e.metaKey) { setBlade(false); setMode("hand") }
      else if (key === "a" && !e.ctrlKey && !e.metaKey) { setBlade(false); setMode("track") }
      else if (key === "t" && !e.ctrlKey && !e.metaKey) { setBlade(false); setMode("text") }
      else if (key === "m" && !e.ctrlKey && !e.metaKey) commit(addMarker(projectRef.current, timeRef.current))
      else if (key === "d" && !e.ctrlKey && !e.metaKey && selectedClip) commit(duplicateAll())
      else if (e.key === "ArrowLeft") {
        e.preventDefault()
        seek(timeRef.current - (e.shiftKey ? 1 : 0.1))
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        seek(timeRef.current + (e.shiftKey ? 1 : 0.1))
      } else if (e.key === "Home") seek(0)
      else if (e.key === "End") seek(totalLength(projectRef.current))
      else if (e.key === "Delete" || e.key === "Backspace") doDelete(e.shiftKey)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /** The AI tools for the agent, with clip, layer and sound ids of this cut as the media they work on (any other id is a Library result) */
  const timelineTools = (base: AgentToolEnv): AgentToolEnv => {
    const media = (id: string): ToolMedia => {
      const p = projectRef.current
      const item = p.clips.find((c) => c.id === id) ?? overlaysOf(p).find((o) => o.id === id)
      if (item) {
        const r = resolveShot(item.shotId, item.take, item.src)
        if (r.url && (r.kind === "video" || r.kind === "image")) return { url: r.url, kind: r.kind, name: nameOf(item, r), seconds: item.duration }
        throw new Error("That clip has no picture or video yet.")
      }
      const sound = p.audio.find((a) => a.id === id)
      if (sound) {
        const up = uploads.find((u) => u.id === sound.uploadId)
        if (up) return { url: up.url, kind: "audio", name: sound.name, seconds: sound.duration }
      }
      return base.media(id)
    }
    return {
      ...base,
      surface: "edit",
      media,
      estimate: (toolId, mediaId, options) => {
        const spec = toolById(toolId)
        const rec = spec ? statusOf(spec, base.context()).candidates[0] : undefined
        if (!spec || !rec) return null
        try {
          return priceOf(rec, paramsFor(spec, rec, options).params, media(mediaId))
        } catch {
          return null
        }
      },
    }
  }

  const ask = async (request: string): Promise<string> => {
    const brandWords = storyBrandContext(story.brandId)
    const text = brandWords ? `${request.trim()}

${brandWords}` : request.trim()
    if (!hasFeature("agent")) return "The editing agent is part of the paid plan. Add a licence key in Settings, General to use it. The buttons and tools work on the Free plan."
    // With a model that can use tools, the agent cuts through the same functions as the buttons, and the whole run is one step to undo
    if (getAgentRuntime) {
      const runtime = getAgentRuntime()
      const run = await runEditor(runtime.model, story, projectRef.current, text, {
        generate: runtime.env.generate,
        estimate: runtime.env.estimate,
        limits: runtime.env.limits,
        approve: (request) =>
          new Promise<boolean>((done) => {
            approvalDone.current = done
            setApproval(request)
          }),
        placeSound: async (asset) => {
          const blob = await (await fetch(asset.url)).blob()
          const item = await addUpload(new File([blob], asset.title || "sound", { type: blob.type }), story.id)
          return { uploadId: item.id, name: item.title, seconds: round(await probeLength(item.url, "audio", 10)) }
        },
        videoSeconds: (url) => probeLength(url, "video", 5),
        tools: runtime.env.aiTools ? timelineTools(runtime.env.aiTools) : undefined,
      }, {
        approvePlan: (plan) =>
          new Promise<boolean>((done) => {
            approvalDone.current = done
            setApproval({ kind: "plan", prompt: plan.summary, steps: plan.steps, usd: null, remainingUsd: 0 })
          }),
        soundUrl: uploadUrl,
        frameStats,
        sceneChanges,
        transcribe: settings && sttModel(settings)
          ? async (uploadId) => {
              const url = uploadUrl(uploadId)
              if (!url) throw new Error("That sound is no longer in the Library.")
              return transcribe(new Blob([await fetchBytes(url)], { type: uploads.find((u) => u.id === uploadId)?.type === "audio" ? "audio/mpeg" : "" }), settings)
            }
          : undefined,
      })
      if (run.changes.length > 0) {
        lastCommit.current = 0
        commit(run.project)
      }
      const made = run.changes.length > 0 ? `${run.changes.length} ${run.changes.length === 1 ? "change" : "changes"} made. Ctrl+Z undoes them all.` : "No changes made."
      return run.text ? `${run.text}\n\n${made}` : made
    }
    if (!onGenerateText) throw new Error("Add a key and switch on a chat model in Settings, Providers, so the agent can edit.")
    const blocks = parseFountain(story.screenplay)
    const dialogue = blocks
      .filter((b) => b.type === "dialogue" || b.type === "character")
      .map((b) => (b.type === "character" ? `${b.text}:` : b.text))
      .join(" ")
      .slice(0, 3000)
    const prompt = [
      "You are a film editor working on a timeline. Reply with a JSON list of edits and nothing else.",
      'Each edit is one of: {"op":"caption","text":"...","start":seconds,"duration":seconds}, {"op":"trim","clip":number,"duration":seconds}, {"op":"split","clip":number,"at":seconds on the timeline}, {"op":"delete","clip":number}, {"op":"duplicate","clip":number}, {"op":"move","clip":number,"to":position}, {"op":"clearCaptions"}. Clips are numbered from 1 as listed. Times are in seconds from the start of the timeline. Keep captions short and under 2 lines.',
      `The cut now:\n${describeCut(projectRef.current, story)}`,
      dialogue ? `Dialogue in the script, for subtitles (people: ${characterNames(blocks).join(", ") || "none"}): ${dialogue}` : "",
      `What to do: ${text}`,
    ]
      .filter(Boolean)
      .join("\n\n")
    const reply = await onGenerateText(prompt)
    const ops = parseOps(reply)
    if (ops.length === 0) throw new Error("The agent did not return any edits. Try asking in other words.")
    const done = applyOps(projectRef.current, ops)
    commit(done.project)
    return `${done.applied} ${done.applied === 1 ? "edit" : "edits"} made${done.skipped ? `, ${done.skipped} skipped because they did not fit` : ""}.`
  }
  React.useImperativeHandle(handle, () => ({ ask }))

  /** What the export panel says now, as one job: the same cut can be queued in several shapes and sizes */
  const currentJob = (): ExportJob => {
    const from = rangeFrom.trim() === "" ? undefined : Number(rangeFrom)
    const to = rangeTo.trim() === "" ? undefined : Number(rangeTo)
    if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to))) throw new Error("The range needs numbers in seconds, or leave it blank for the whole cut.")
    const shape = aspectOf(projectRef.current).id
    return { id: editId("x"), label: `${shape.replace(":", "x")} ${exportRes}p ${exportFps}fps${from !== undefined || to !== undefined ? ` ${from ?? 0}-${to ?? "end"}s` : ""}`, shape, res: exportRes, fps: exportFps, from, to, engine: exportEngine }
  }

  /** Renders and saves one job. Returns whether it finished. */
  const exportCut = async (job?: ExportJob): Promise<boolean> => {
    setPlaying(false)
    setExporting(0)
    const abort = new AbortController()
    exportAbort.current = abort
    try {
      const j = job ?? currentJob()
      const { from, to } = j
      // Files at web addresses are fetched once, the way the app fetches, so the window may read them back (draw, decode)
      const current = { ...projectRef.current, aspect: j.shape === "16:9" ? undefined : j.shape }
      const raw = (item: { shotId: string; take: number; src?: ClipSrc }) => resolveShot(item.shotId, item.take, item.src)
      const local = await localize([...current.clips.map((c) => raw(c).url), ...overlaysOf(current).map((o) => raw(o).url)], abort.signal)
      const input = {
        project: current,
        resolve: (item: { shotId: string; take: number; src?: ClipSrc }) => {
          const r = raw(item)
          return { url: local.use(r.url), kind: r.kind }
        },
        audioUrl: uploadUrl,
        onProgress: setExporting,
        options: { res: j.res, fps: j.fps, from, to },
        signal: abort.signal,
      }
      let out: { blob: Blob; ext: "mp4" | "webm"; seconds: number }
      try {
        if (j.engine === "fast" && fastExportAvailable()) {
          try {
            out = await renderCutFast(input)
          } catch (e) {
            const why = e instanceof Error ? e.message : String(e)
            if (abort.signal.aborted || why.startsWith("The export was stopped") || why.startsWith("There is nothing")) throw e
            showNotice(why === FAST_UNSUPPORTED ? "Fast export is not available in this window, so the cut is recorded in real time." : "Fast export did not work (" + why + "), so the cut is recorded in real time.")
            setExporting(0)
            out = await renderCut(input)
          }
        } else out = await renderCut(input)
      } finally {
        local.release()
      }
      // Saved like every other download: into the save folder in the desktop app, the browser Downloads folder in a browser
      const file = URL.createObjectURL(out.blob)
      const saved = await downloadMedia({ url: file, title: job ? `${story.title || "cut"} ${j.label}` : story.title || "cut", type: "video" })
      window.setTimeout(() => URL.revokeObjectURL(file), 10_000)
      showNotice(`Exported ${clock(out.seconds)} as ${out.ext.toUpperCase()}. ${saved.message}`)
      return true
    } catch (e) {
      showNotice(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      exportAbort.current = null
      setExporting(null)
    }
  }

  /** Runs the queued jobs one after another; Stop ends the one running and the rest wait */
  const runQueue = async () => {
    setQueueRunning(true)
    try {
      for (const job of exportQueue) {
        setQueueNow(job.id)
        const ok = await exportCut(job)
        if (!ok) break
        setExportQueue((q) => q.filter((x) => x.id !== job.id))
      }
    } finally {
      setQueueNow(null)
      setQueueRunning(false)
    }
  }

  const activeCaptions = project.captions.filter((c) => !c.rich && shownTime >= c.start && shownTime < c.start + c.duration)
  // Text layers are drawn on a canvas over the picture with the same code the export uses
  const textCanvas = React.useRef<HTMLCanvasElement>(null)
  const fontSig = fontsOf(project).join(",")
  React.useEffect(() => {
    void loadProjectFonts(project)
    return onFontLoaded(() => setFrameTick((t) => t + 1))
  }, [fontSig]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const cv = textCanvas.current
    if (!cv || previewWidth < 2 || previewHeight < 2) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.round(previewWidth * dpr)
    const h = Math.round(previewHeight * dpr)
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
    }
    const g = cv.getContext("2d")
    if (!g) return
    g.clearRect(0, 0, w, h)
    drawTexts(g, project, shownTime, w, h)
    // The chosen text layer gets a frame round it, in the preview only
    const chosen = selected?.kind === "caption" ? project.captions.find((c) => c.id === selected.id) : undefined
    if (chosen?.rich && shownTime >= chosen.start && shownTime < chosen.start + chosen.duration) {
      const b = richBounds(g, chosen, w, h)
      if (b) {
        g.save()
        g.setLineDash([6, 4])
        g.lineWidth = 1.5 * dpr
        g.strokeStyle = "rgba(255,255,255,0.9)" // allow-color
        g.strokeRect(b.cx - b.w / 2 - 6 * dpr, b.cy - b.h / 2 - 4 * dpr, b.w + 12 * dpr, b.h + 8 * dpr)
        g.restore()
      }
    }
  })
  const timelineWidth = Math.max(Math.max(total + 12, 24) * pps, viewW - LABEL_WIDTH)
  const major = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pps >= 80) ?? 120
  const minor = major / 5
  const minorCount = Math.ceil(timelineWidth / pps / minor)

  // Where a dragged clip would land: the start of the clip it would go in front of
  const dropTime = (() => {
    if (!drag || drag.kind !== "clip-move" || !drag.moved) return null
    const rest = drag.base.clips.filter((c) => c.id !== drag.id)
    const restStarts = clipStarts(rest)
    const t = timeFromClientX(pointerX)
    for (let i = 0; i < rest.length; i++) if (t < restStarts[i]! + rest[i]!.duration / 2) return restStarts[i]!
    return rest.reduce((sum, c) => sum + c.duration, 0)
  })()
  const draggedClip = drag && drag.kind === "clip-move" && drag.moved ? drag.base.clips.find((c) => c.id === drag.id) : undefined

  const iconButton = (label: string, Icon: React.ElementType, onClick: () => void, extra?: { disabled?: boolean; active?: boolean; small?: boolean }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} aria-pressed={extra?.active} onClick={onClick} disabled={extra?.disabled} className={cn(extra?.small ? "h-6 w-6" : "h-8 w-8", "text-muted-foreground hover:text-foreground", extra?.active && "bg-secondary text-foreground")}>
          <Icon className={extra?.small ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  const trackHover = {
    onMouseMove: (e: React.MouseEvent) => !drag && setHover(timeFromClientX(e.clientX)),
    onMouseLeave: () => setHover(null),
  }

  // The name cell at the left of each layer. Its bottom edge is dragged to make the layer taller or shorter.
  const rowHeader = (id: string, label: string, _icon: React.ElementType, kind: "video" | "audio" | "captions") => {
    const state = trackOf(project, id)
    const MuteIcon = kind === "audio" ? (state.mute ? VolumeX : Volume2) : state.mute ? EyeOff : Eye
    const muteLabel = kind === "audio" ? (state.mute ? `Unmute ${label}` : `Mute ${label}`) : state.mute ? `Show ${label}` : `Hide ${label}`
    // Picture layers above V1 and all audio lanes can be dragged by the grip onto another layer of their kind to swap places
    const movable = kind === "audio" || (kind === "video" && id !== "v1")
    return (
    <div
      data-track-header
      onDragOver={(e) => {
        if (movable && e.dataTransfer.types.includes("text/layer")) e.preventDefault()
      }}
      onDrop={(e) => {
        const from = e.dataTransfer.getData("text/layer")
        if (!movable || from === id || from.charAt(0) !== id.charAt(0)) return
        e.preventDefault()
        commit(swapLayers(project, kind === "audio" ? "audio" : "video", Number(from.slice(1)), Number(id.slice(1))))
      }}
      className="sticky left-0 z-30 flex flex-shrink-0 items-center gap-1 border-r border-border/60 bg-background px-1.5 text-xs text-muted-foreground" style={{ width: `${LABEL_WIDTH}px` }}>
      {movable && (
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/layer", id)
            e.dataTransfer.effectAllowed = "move"
          }}
          title="Drag onto another layer to move this one up or down"
          aria-label={`Move ${label} up or down`}
          className="flex-shrink-0 cursor-grab text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold" title={label}>{id === "captions" ? "CC" : id.toUpperCase()}</span>
      <Button type="button" variant="ghost" size="icon" aria-label={muteLabel} aria-pressed={state.mute === true} onClick={() => commit(setTrack(project, id, { mute: !state.mute }))} className={cn("h-5 w-5 flex-shrink-0", state.mute ? "text-foreground" : "text-muted-foreground")}>
        <MuteIcon className="h-3 w-3" />
      </Button>
      {kind !== "captions" && (
        <Button type="button" variant="ghost" size="icon" aria-label={state.solo ? `Stop soloing ${label}` : `Solo ${label}`} aria-pressed={state.solo === true} onClick={() => commit(setTrack(project, id, { solo: !state.solo }))} className={cn("h-5 w-5 flex-shrink-0 text-xs font-semibold", state.solo ? "bg-secondary text-foreground" : "text-muted-foreground")}>
          S
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon" aria-label={state.lock ? `Unlock ${label}` : `Lock ${label}`} aria-pressed={state.lock === true} onClick={() => commit(setTrack(project, id, { lock: !state.lock }))} className={cn("h-5 w-5 flex-shrink-0", state.lock ? "text-foreground" : "text-muted-foreground")}>
        {state.lock ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      </Button>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Make ${label} taller or shorter`}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDrag({ kind: "row-resize", id, x: e.clientX, y: e.clientY, base: projectRef.current, startHeight: heightOf(id, kind) })
        }}
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-row-resize hover:bg-foreground/30"
      />
    </div>
    )
  }

  const overlayRows = (layer: number) => overlaysOf(project).filter((o) => o.layer === layer)
  const layerOptions = Array.from({ length: videoCount }, (_, j) => j + 1)
  const laneOptions = Array.from({ length: laneCount }, (_, j) => j + 1)

  return (
    <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden bg-secondary/60 p-0.5 animate-fade-in">
      <Input ref={audioInput} type="file" accept="video/*,image/*,audio/*" multiple className="hidden" aria-label="Upload files" onChange={(e) => void addFiles(e.target.files)} />
      <MediaReferenceModal
        isOpen={pickTarget !== null}
        onClose={() => setPickTarget(null)}
        onSelectReference={(item) => void pickMedia(item)}
        assets={library?.assets}
        projects={library?.projects}
        activeProjectId={library?.activeProjectId}
        settings={settings}
        onOpenSettings={onOpenSettings}
        elementsLocked
        singlePick
        placement="center"
        referenceNote={pickTarget === "layer" ? "Choose a picture, video or sound. Pictures and videos go on a layer above the main track, at the playhead." : "Choose a picture, video or sound. Pictures and videos go at the end of the main track."}
      />

      {/* The header: the story's name and Export */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border border-border/60 bg-card px-3 py-1">
        <span className="min-w-0 truncate text-xs text-muted-foreground">{story.title}</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => setExportOpen(true)} disabled={total === 0 && exporting === null} className="h-7 gap-1.5 text-xs">
          {exporting !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exporting !== null ? `Exporting ${Math.round(exporting * 100)}%` : "Export"}
        </Button>
      </div>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
<div className="text-xs font-semibold text-foreground">Shape and size</div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    Picture shape
                    <Select value={aspectOf(project).id} onValueChange={(v) => commit(setAspect(project, v as Aspect))}>
                      <SelectTrigger aria-label="Picture shape" className="h-8 rounded-md bg-secondary px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASPECTS.map((a) => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      Size
                      <Select value={String(exportRes)} onValueChange={(v) => setExportRes(Number(v))}>
                        <SelectTrigger aria-label="Export size" className="h-8 rounded-md bg-secondary px-2 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[480, 720, 1080].map((r) => (
                            <SelectItem key={r} value={String(r)} className="text-xs">
                              {r}p
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      Frames
                      <Select value={String(exportFps)} onValueChange={(v) => setExportFps(Number(v))}>
                        <SelectTrigger aria-label="Frames a second" className="h-8 rounded-md bg-secondary px-2 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[24, 30, 60].map((r) => (
                            <SelectItem key={r} value={String(r)} className="text-xs">
                              {r} fps
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1 text-xs text-muted-foreground">
                      From (s)
                      <Input type="number" min={0} step={0.1} placeholder="start" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="h-8 text-xs" />
                    </label>
                    <label className="block space-y-1 text-xs text-muted-foreground">
                      To (s)
                      <Input type="number" min={0} step={0.1} placeholder="end" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="h-8 text-xs" />
                    </label>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    Engine
                    <Select value={exportEngine} onValueChange={(v) => setExportEngine(v as "fast" | "live")}>
                      <SelectTrigger aria-label="Export engine" className="h-8 rounded-md bg-secondary px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fast" className="text-xs">
                          Fast (MP4, faster than playing)
                        </SelectItem>
                        <SelectItem value="live" className="text-xs">
                          Real time (records as it plays)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="secondary" size="sm" disabled={exporting !== null || total === 0} onClick={() => void exportCut()} className="h-8 w-full gap-1.5 text-xs">
                    {exporting !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {exporting !== null ? `Exporting ${Math.round(exporting * 100)}%` : "Export"}
                  </Button>
                  {exporting !== null && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => exportAbort.current?.abort()} className="h-8 w-full text-xs">
                      Stop
                    </Button>
                  )}
                  <div className="space-y-1.5 border-t border-border/60 pt-2">
                    <div className="text-xs font-semibold text-foreground">Queue</div>
                    <p className="text-xs text-muted-foreground">Add the settings above, change them, add again (for example wide and tall), then run them one after another.</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={queueRunning || total === 0}
                      onClick={() => {
                        try {
                          setExportQueue((q) => [...q, currentJob()])
                        } catch (e) {
                          showNotice(e instanceof Error ? e.message : String(e))
                        }
                      }}
                      className="h-8 w-full gap-1.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to queue
                    </Button>
                    {exportQueue.map((job) => (
                      <div key={job.id} className="flex items-center justify-between gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-foreground">
                        <span className="min-w-0 flex-1 truncate">{queueNow === job.id ? `Now: ${job.label}` : job.label}</span>
                        <Button type="button" variant="ghost" size="icon" disabled={queueNow === job.id} aria-label={`Remove ${job.label} from the queue`} onClick={() => setExportQueue((q) => q.filter((x) => x.id !== job.id))} className="h-5 w-5 flex-shrink-0">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {exportQueue.length > 0 && (
                      <Button type="button" variant="secondary" size="sm" disabled={queueRunning || exporting !== null} onClick={() => void runQueue()} className="h-8 w-full text-xs">
                        {queueRunning ? "Running the queue..." : `Run ${exportQueue.length} ${exportQueue.length === 1 ? "export" : "exports"}`}
                      </Button>
                    )}
                  </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* The top: the tool tabs and their panel on the left, the screen in the middle, the options on the right */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-0.5">
        <div className="relative flex flex-shrink-0 flex-col border border-border/60 bg-card" style={{ width: `${layout.left}px` }}>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to make this panel wider or narrower"
            title="Drag to resize · Double-click to reset"
            onMouseDown={startResize("left")}
            onDoubleClick={() => resetSize("left")}
            className="absolute inset-y-0 -right-1 z-40 w-1.5 cursor-col-resize hover:bg-foreground/20"
          />
          <div className="group relative flex flex-shrink-0 items-center border-b border-border/60">
            <div ref={tabsRow} className="flex min-w-0 flex-1 items-center overflow-x-auto no-scrollbar">
              {TOOLS.map(({ id, label, Icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPanelQuery(""); setSearchOpen(false); setTool(id) }}
                  aria-pressed={tool === id}
                  className={cn("h-9 flex-shrink-0 gap-1.5 rounded-none border-b-2 px-2.5 text-xs", tool === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Scroll tabs left" onClick={() => tabsRow.current?.scrollBy({ left: -120, behavior: "smooth" })} className="absolute left-0 top-0 z-10 hidden h-9 w-6 rounded-none bg-card/90 group-hover:flex">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Scroll tabs right" onClick={() => tabsRow.current?.scrollBy({ left: 120, behavior: "smooth" })} className="absolute right-9 top-0 z-10 hidden h-9 w-6 rounded-none bg-card/90 group-hover:flex">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {SEARCHABLE.includes(tool) && (
              <Button type="button" variant="ghost" size="icon" aria-label="Search" aria-pressed={searchOpen} onClick={() => { setSearchOpen((v) => !v); setPanelQuery("") }} className={cn("h-9 w-9 flex-shrink-0 rounded-none border-l border-border/60", searchOpen ? "text-foreground" : "text-muted-foreground")}>
                <Search className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {tool !== null && (
            <div className="flex min-h-0 flex-1 flex-col">
              {searchOpen && SEARCHABLE.includes(tool) && (
                <div className="flex-shrink-0 border-b border-border/60 p-2">
                  <Input autoFocus value={panelQuery} onChange={(e) => setPanelQuery(e.target.value)} placeholder="Search" aria-label="Search this panel" className="h-8 text-xs" />
                </div>
              )}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 no-scrollbar">
              {tool === "scene" && (
                <ScenePanel
                  story={story}
                  project={project}
                  shots={shots}
                  selectedShotId={selectedClip?.shotId ?? selectedOverlay?.shotId}
                  onAdd={(shot) => commit(addShotClip(project, shot))}
                  onAddMissing={() => commit(syncWithShots(project, story))}
                  onFind={(shotId) => {
                    const i = project.clips.findIndex((c) => c.shotId === shotId)
                    if (i >= 0) {
                      setSelected({ kind: "clip", id: project.clips[i]!.id })
                      seek(starts[i]!)
                      return
                    }
                    const o = overlaysOf(project).find((x) => x.shotId === shotId)
                    if (o) {
                      setSelected({ kind: "overlay", id: o.id })
                      seek(o.start)
                    } else showNotice("That beat is not in the cut yet. Click + to add it.")
                  }}
                />
              )}

              {tool === "layer" && (
                <LayerPanel
                  project={project}
                  onTrack={(id, patch) => commit(setTrack(project, id, patch))}
                  onSwap={(kind, x, y) => commit(swapLayers(project, kind, x, y))}
                  onAddVideoLayer={() => commit(addVideoLayer(project))}
                  onAddAudioLane={() => commit(addAudioLane(project))}
                />
              )}

              {tool === "text" && (
                <TextPanel
                  onAdd={({ text, duration, rich, name }) => {
                    if (trackOf(project, "captions").lock) return showNotice("That layer is locked. Unlock it to change it.")
                    const made = addText(project, text, round(timeRef.current), duration, rich)
                    commit(made.project)
                    setSelected({ kind: "caption", id: made.id })
                    showNotice(`${name} added at the playhead. Change it on the right, or drag it in the picture.`)
                  }}
                />
              )}

              {tool === "media" && (
                <MediaPanel
                  tiles={[
                    ...uploads.map((u) => ({ id: u.id, title: u.title, type: u.type, url: u.url, thumbnailUrl: u.type === "image" ? u.url : "", source: "Upload" as const })),
                    ...(library?.assets ?? []).filter((a) => a.status === "completed").map((a) => ({ id: a.id, title: a.title, type: a.type, url: a.url, thumbnailUrl: a.thumbnailUrl || (a.type === "image" ? a.url : ""), duration: a.duration, source: "Created" as const })),
                  ]}
                  onPick={(t, onLayer) => void pickMedia({ id: t.id, title: t.title, type: t.type, url: t.url, thumbnailUrl: t.thumbnailUrl, category: t.source === "Upload" ? "uploads" : "created", duration: t.duration }, onLayer ? "layer" : "main")}
                />
              )}

              {tool === "elements" && <ElementsPanel />}

              {tool === "upload" && (
                <MediaPanel
                  heading="Upload"
                  onUpload={() => audioInput.current?.click()}
                  tiles={uploads.filter((u) => u.projectId === story.id).map((u) => ({ id: u.id, title: u.title, type: u.type, url: u.url, thumbnailUrl: u.type === "image" ? u.url : "", source: "Upload" as const }))}
                  onPick={(t, onLayer) => void pickMedia({ id: t.id, title: t.title, type: t.type, url: t.url, thumbnailUrl: t.thumbnailUrl, category: "uploads", duration: t.duration }, onLayer ? "layer" : "main")}
                />
              )}

              {tool === "effects" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {fxPresets.filter((x) => hit(x.label)).map((preset) => (
                      <EffectCard key={preset.id} preset={preset} media={samples[0]} onApply={() => applyPreset(preset.patch)} />
                    ))}
                  </div>
                  <Button type="button" variant="secondary" size="sm" disabled={!fxTarget} onClick={() => fxAll(null)} className="h-8 w-full text-xs">
                    Remove all effects
                  </Button>
                </div>
              )}

              {tool === "transition" && (
                <div className="space-y-2">
                  <label className="block space-y-1 text-xs text-muted-foreground">
                    Length (s)
                    <Input type="number" min={0.1} max={5} step={0.1} value={transitionLength} onChange={(e) => setTransitionLength(Number(e.target.value))} className="h-8 text-xs" />
                  </label>
                  <div className="text-xs font-semibold text-foreground">Between clips</div>
                  <div className="grid grid-cols-2 gap-2">
                    {shaderTransitions.filter((x) => hit(x.name)).map((item) => (
                      <ShaderTransitionCard
                        key={item.id}
                        item={item}
                        onApply={() => applyOverlap(item.id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(FX_MIME, JSON.stringify({ type: "overlap", id: item.id } satisfies FxDrag))
                          e.dataTransfer.effectAllowed = "copy"
                        }}
                      />
                    ))}
                  </div>
                  <Button type="button" variant="secondary" size="sm" disabled={!selectedClip?.transitionIn} onClick={() => selectedClip && commit(setTransitionIn(project, selectedClip.id, null))} className="h-8 w-full text-xs">
                    Remove the transition into this clip
                  </Button>
                  <div className="border-t border-border/60 pt-2 text-xs font-semibold text-foreground">Fades</div>
                  <div className="grid grid-cols-2 gap-2">
                    {transitions.filter((x) => hit(x.label)).map((t) => (
                      <TransitionCard key={t.id} id={t.id} label={t.label} hint={t.hint} media={samples[0]} mediaB={samples[1]} onApply={() => applyTransition(t.id)} />
                    ))}
                  </div>
                </div>
              )}

              {tool === "caption" && (
                <div className="space-y-2">
                  <Button type="button" variant="secondary" size="sm" onClick={doCaption} className="h-8 w-full gap-1.5 text-xs">
                    <Captions className="h-3.5 w-3.5" />
                    Add at the playhead
                  </Button>
                  <div className="text-xs font-semibold text-foreground">Styles</div>
                  <div className="grid grid-cols-2 gap-2">
                    {captionStyles.filter((x) => hit(x.label)).map((card) => (
                      <CaptionStyleCardView key={card.id} card={card} onApply={() => applyCaptionStyle(card.style)} />
                    ))}
                  </div>
                  <Button type="button" variant="secondary" size="sm" disabled={project.captions.length === 0} onClick={() => applyCaptionStyle(null)} className="h-8 w-full text-xs">
                    Reset style on every caption
                  </Button>
                  <div className="text-xs font-semibold text-foreground">Captions</div>
                  {project.captions.map((cap) => {
                    const isSel = selected?.kind === "caption" && selected.id === cap.id
                    return (
                      <Button
                        key={cap.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelected({ kind: "caption", id: cap.id })
                          seek(cap.start)
                        }}
                        aria-pressed={isSel}
                        className={cn("h-8 w-full justify-start px-2 text-xs", isSel && "bg-secondary")}
                      >
                        <span className="truncate">{cap.text}</span>
                      </Button>
                    )
                  })}
                </div>
              )}

              {tool === "ai" && (
                <div className="space-y-1.5">
                  {settings && (
                    <div>
                      <AiToolPanel
                        query={panelQuery}
                        noMedia={!toolMedia && (selectedClip || selectedOverlay) ? "This beat has no video yet. Make it, or add a video from Upload or Media, then select that clip." : undefined}
                        media={toolMedia}
                        kind={toolMedia?.kind ?? (selectedAudio ? "audio" : "video")}
                        surface="edit"
                        settings={settings}
                        projectId={story.id}
                        onCutTool={(offer) => ask(`${offer.spec.automation ?? offer.spec.name}\nThis is a one-click job: do it without proposing a plan.`)}
                        onOpenSettings={onOpenSettings}
                        onDone={(assets, offer) => {
                          for (const a of assets) {
                            if (a.type === "image" && a.type !== toolMedia?.kind) continue
                            void pickMedia({ id: a.id, title: a.title, type: a.type as "image" | "video" | "audio", url: a.url, thumbnailUrl: a.thumbnailUrl, category: "generated" as never }, offer.spec.id === "video-remove-background" ? "layer" : "main")
                          }
                          showNotice("Done. The result is in your cut; Ctrl+Z removes it.")
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              </div>
            </div>
          )}
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col border border-border/60 bg-card p-3">
          {approval && (
            <div role="alertdialog" aria-label="The agent asks to make something" className="absolute inset-x-3 bottom-3 z-30 space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg">
              {approval.kind === "plan" ? (
                <>
                  <div className="text-xs font-semibold text-foreground">The agent proposes a plan</div>
                  <p className="text-xs text-muted-foreground">{approval.prompt}</p>
                  <ol className="list-decimal space-y-0.5 pl-4 text-xs text-foreground">
                    {(approval.steps ?? []).map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold text-foreground">
                    The agent wants to make {approval.kind === "image" ? "a picture" : approval.kind === "video" ? "a video" : "a sound"}
                    <span className="ml-1 font-mono font-normal text-muted-foreground">{approval.usd === null ? "price unknown" : `about $${approval.usd < 0.01 ? approval.usd.toFixed(4) : approval.usd.toFixed(2)}`}</span>
                  </div>
                  <p className="line-clamp-3 text-xs text-muted-foreground">{approval.prompt}</p>
                  <p className="text-xs text-muted-foreground">${approval.remainingUsd.toFixed(2)} left of the budget.</p>
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => answerApproval(false)} className="h-8 text-xs">
                  Deny
                </Button>
                <Button type="button" size="sm" onClick={() => answerApproval(true)} className="h-8 text-xs">
                  Approve
                </Button>
              </div>
            </div>
          )}
          <div ref={previewRef} className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-background">
            <div ref={frameRef} onMouseDown={startTextDrag} className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-border/60 bg-background" style={{ height: "100%", aspectRatio: `${aspectOf(project).w} / ${aspectOf(project).h}` }}>
              {mounted.map((s) => {
                const shown = s.visible && !gpu
                const incoming = s.main && s.visible && mainNow.progress !== null && s.key === project.clips[mainNow.clips[mainNow.clips.length - 1]!.index]?.id
                const fx = incoming ? { ...(s.item.fx ?? {}), opacity: ((s.item.fx?.opacity ?? 100) * (mainNow.progress ?? 1)) } : s.item.fx
                const look = shown ? fxStyle(fx, s.into, s.item.duration, previewWidth) : undefined
                const hide = shown ? "" : " pointer-events-none opacity-0"
                return s.res.kind === "image" && s.res.url ? (
                  <img
                    key={s.key}
                    ref={(el) => {
                      if (el) imgEls.current.set(s.key, el)
                      else imgEls.current.delete(s.key)
                    }}
                    src={s.res.url}
                    alt=""
                    onLoad={() => setFrameTick((t) => t + 1)}
                    className={`absolute inset-0 h-full w-full object-contain${hide}`}
                    style={look}
                  />
                ) : s.res.kind === "video" && s.res.url ? (
                  <video
                    key={`${s.key}:${s.res.url}`}
                    ref={(el) => {
                      if (el) videoEls.current.set(s.key, el)
                      else videoEls.current.delete(s.key)
                    }}
                    src={s.res.url}
                    playsInline
                    preload="auto"
                    onSeeked={() => setFrameTick((t) => t + 1)}
                    onLoadedData={() => setFrameTick((t) => t + 1)}
                    className={`absolute inset-0 h-full w-full object-contain${hide}`}
                    style={look}
                  />
                ) : null
              })}
              <canvas ref={glCanvas} aria-label="The picture" className={cn("absolute inset-0 h-full w-full", (!gpu || !hasPicture) && "hidden")} data-frame-tick={frameTick} />
              {!stack.some((s) => s.res.kind !== "empty") && (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                  <Film className="h-6 w-6" />
                  <span className="text-xs">{project.clips.length === 0 && overlaysOf(project).length === 0 ? "Nothing on the timeline yet" : stack.length > 0 ? "This beat has not been made yet" : "Nothing under the playhead"}</span>
                </div>
              )}
              {!trackOf(project, "captions").mute &&
                activeCaptions.map((c) => {
                  const look = captionLook(c.style, shownTime - c.start, c.duration)
                  const scale = Math.min(previewWidth, previewHeight) / 720
                  return (
                    <div key={c.id} className="pointer-events-none absolute inset-x-4 flex justify-center" style={{ top: `${look.y * 100}%`, fontSize: `${Math.max(9, look.size * scale)}px`, opacity: look.alpha, transform: `translateY(calc(-50% - ${look.rise * scale}px)) scale(${look.scale})` }}>
                      <span
                        className="px-2 py-0.5 text-center font-bold"
                        style={captionCss(look)}
                      >
                        {look.typed >= 1 ? c.text : c.text.slice(0, Math.ceil(c.text.length * look.typed))}
                      </span>
                    </div>
                  )
                })}
              <canvas ref={textCanvas} aria-label="Text layers" className="pointer-events-none absolute inset-0 h-full w-full" />
              {hover !== null && !playing && !drag && <span className="absolute left-2 top-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{clock(hover)}</span>}
            </div>
          </div>
        </div>

        <div className="relative flex-shrink-0" style={{ width: `${layout.right}px` }}>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to make this panel wider or narrower"
          title="Drag to resize · Double-click to reset"
          onMouseDown={startResize("right")}
          onDoubleClick={() => resetSize("right")}
          className="absolute inset-y-0 -left-1 z-40 w-1.5 cursor-col-resize hover:bg-foreground/20"
        />
        <div className="h-full w-full space-y-3 overflow-y-auto border border-border/60 bg-card p-3 no-scrollbar">
          {selectedClip ? (
            <>
              <div className="text-xs font-semibold text-foreground">
                Clip {project.clips.findIndex((c) => c.id === selectedClip.id) + 1}
                <span className="ml-1 font-normal text-muted-foreground">{selectedClip.src ? selectedClip.src.name : `scene ${shots.get(selectedClip.shotId)?.sceneNumber} · beat ${shots.get(selectedClip.shotId)?.shotNumber}`}</span>
              </div>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Length (seconds)
                <Input type="number" min={0.2} step={0.1} value={selectedClip.duration} onChange={(e) => commit(setClipDuration(project, selectedClip.id, Number(e.target.value)))} className="h-8 text-xs" />
              </label>
              {(shots.get(selectedClip.shotId)?.takes.length ?? 0) > 1 && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  Take
                  <Select value={String(selectedClip.take)} onValueChange={(v) => commit(setClipTake(project, selectedClip.id, Number(v)))}>
                    <SelectTrigger aria-label="Take" className="h-8 rounded-md bg-secondary px-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {shots.get(selectedClip.shotId)!.takes.map((u, i) => (
                        <SelectItem key={i} value={String(i)} disabled={!u} className="text-xs">
                          Take {i + 1}
                          {u ? "" : " (empty)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {videoCount > 1 && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  Layer
                  <Select
                    value="1"
                    onValueChange={(v) => {
                      if (Number(v) > 1) {
                        commit(clipToLayer(project, selectedClip.id, Number(v)))
                        setSelected(null)
                      }
                    }}
                  >
                    <SelectTrigger aria-label="Layer" className="h-8 rounded-md bg-secondary px-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {layerOptions.map((k) => (
                        <SelectItem key={k} value={String(k)} className="text-xs">
                          {k === 1 ? "V1 (main)" : `V${k}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedClip.transitionIn && (
                <div className="space-y-1.5 rounded-lg border border-border bg-secondary p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">Transition in</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => commit(setTransitionIn(project, selectedClip.id, null))} className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
                      Remove
                    </Button>
                  </div>
                  <div className="truncate text-muted-foreground">{getItems("transition").find((i) => i.id === selectedClip.transitionIn!.id)?.name ?? selectedClip.transitionIn.id}</div>
                  <label className="block space-y-1 text-muted-foreground">
                    Length (seconds)
                    <Input type="number" min={0.1} max={5} step={0.1} value={selectedClip.transitionIn.duration} onChange={(e) => commit(setTransitionIn(project, selectedClip.id, { id: selectedClip.transitionIn!.id, duration: Number(e.target.value) }))} className="h-8 text-xs" />
                  </label>
                </div>
              )}
              {resolveShot(selectedClip.shotId, selectedClip.take, selectedClip.src).kind === "video" && (
                <Button type="button" variant="secondary" size="sm" onClick={() => void detachSound(selectedClip.id)} className="h-8 w-full gap-1.5 text-xs">
                  <Music className="h-3.5 w-3.5" />
                  Detach sound to its own lane
                </Button>
              )}
              <div className="flex items-center gap-1">
                {iconButton("Move earlier", ArrowLeft, () => commit(moveClip(project, selectedClip.id, project.clips.findIndex((c) => c.id === selectedClip.id) - 1)))}
                {iconButton("Move later", ArrowRight, () => commit(moveClip(project, selectedClip.id, project.clips.findIndex((c) => c.id === selectedClip.id) + 1)))}
              </div>
              <LayerInspector
                fx={selectedClip.fx}
                into={intoOf(starts[project.clips.findIndex((c) => c.id === selectedClip.id)] ?? 0, selectedClip.duration)}
                still={resolveShot(selectedClip.shotId, selectedClip.take, selectedClip.src).kind !== "video"}
                onChange={(patch) => commit(setFx(project, "clip", selectedClip.id, patch))}
                onReset={() => commit(setFx(project, "clip", selectedClip.id, null))}
                onCopy={() => setCopiedLook({ fx: selectedClip.fx })}
                onPaste={() => copiedLook && commit(setFxAll(project, "clip", selectedClip.id, copiedLook.fx))}
                canPaste={copiedLook !== null}
              />
            </>
          ) : selectedOverlay ? (
            <>
              <div className="text-xs font-semibold text-foreground">
                V{selectedOverlay.layer}
                <span className="ml-1 font-normal text-muted-foreground">{selectedOverlay.src ? selectedOverlay.src.name : `scene ${shots.get(selectedOverlay.shotId)?.sceneNumber} · beat ${shots.get(selectedOverlay.shotId)?.shotNumber}`}</span>
              </div>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Starts at (seconds)
                <Input type="number" min={0} step={0.1} value={selectedOverlay.start} onChange={(e) => commit(updateOverlay(project, selectedOverlay.id, { start: Number(e.target.value) }))} className="h-8 text-xs" />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Length (seconds)
                <Input type="number" min={0.2} step={0.1} value={selectedOverlay.duration} onChange={(e) => commit(updateOverlay(project, selectedOverlay.id, { duration: Number(e.target.value) }))} className="h-8 text-xs" />
              </label>
              <div className="space-y-1 text-xs text-muted-foreground">
                Layer
                <Select
                  value={String(selectedOverlay.layer)}
                  onValueChange={(v) => {
                    if (v === "1") commit(overlayToMain(project, selectedOverlay.id))
                    else commit(updateOverlay(project, selectedOverlay.id, { layer: Number(v) }))
                    setSelected(null)
                  }}
                >
                  <SelectTrigger aria-label="Layer" className="h-8 rounded-md bg-secondary px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {layerOptions.map((k) => (
                      <SelectItem key={k} value={String(k)} className="text-xs">
                        {k === 1 ? "V1 (main)" : `V${k}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <LayerInspector
                fx={selectedOverlay.fx}
                into={intoOf(selectedOverlay.start, selectedOverlay.duration)}
                still={resolveShot(selectedOverlay.shotId, selectedOverlay.take, selectedOverlay.src).kind !== "video"}
                onChange={(patch) => commit(setFx(project, "overlay", selectedOverlay.id, patch))}
                onReset={() => commit(setFx(project, "overlay", selectedOverlay.id, null))}
                onCopy={() => setCopiedLook({ fx: selectedOverlay.fx })}
                onPaste={() => copiedLook && commit(setFxAll(project, "overlay", selectedOverlay.id, copiedLook.fx))}
                canPaste={copiedLook !== null}
              />
            </>
          ) : selectedCaption ? (
            <>
              {selectedCaption.rich ? (
                <TextInspector cap={selectedCaption as typeof selectedCaption & { rich: NonNullable<typeof selectedCaption.rich> }} onChange={(patch) => commit(updateCaption(project, selectedCaption.id, patch))} />
              ) : (
                <>
              <div className="text-xs font-semibold text-foreground">Caption</div>
              <Textarea value={selectedCaption.text} onChange={(e) => commit(updateCaption(project, selectedCaption.id, { text: e.target.value }))} rows={3} aria-label="Caption text" className="resize-none rounded-lg border border-border/60 bg-background text-xs" />
              {(
                [
                  { key: "size", label: "Size", options: [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Title"]], def: "m" },
                  { key: "position", label: "Position", options: [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]], def: "bottom" },
                  { key: "animation", label: "Animation", options: [["none", "None"], ["fade", "Fade"], ["rise", "Rise"], ["slide", "Slide up"], ["pop", "Pop"], ["bounce", "Bounce"], ["zoom", "Zoom in"], ["typewriter", "Typewriter"]], def: "none" },
                  { key: "font", label: "Font", options: [["sans", "Sans"], ["rounded", "Rounded"], ["condensed", "Condensed"], ["serif", "Serif"], ["mono", "Mono"], ["display", "Display"], ["script", "Script"]], def: "sans" },
                  { key: "color", label: "Colour", options: [["white", "White"], ["yellow", "Yellow"], ["orange", "Orange"], ["red", "Red"], ["pink", "Pink"], ["blue", "Blue"], ["cyan", "Cyan"], ["green", "Green"], ["lime", "Lime"], ["black", "Black"]], def: "white" },
                  { key: "look", label: "Letters", options: [["outline", "Outline"], ["stroke", "Thick edge"], ["shadow", "Shadow"], ["glow", "Glow"], ["neon", "Neon"], ["box", "Dark box"], ["boxlight", "Light box"], ["boxcolor", "Colour box"], ["none", "Plain"]], def: "outline" },
                  { key: "case", label: "Capitals", options: [["none", "As typed"], ["upper", "ALL CAPS"]], def: "none" },
                  { key: "spacing", label: "Letter spacing", options: [["tight", "Tight"], ["normal", "Normal"], ["wide", "Wide"]], def: "normal" },
                ] as const
              ).map((f) => (
                <div key={f.key} className="space-y-1 text-xs text-muted-foreground">
                  {f.label}
                  <Select
                    value={(selectedCaption.style as Record<string, string | undefined> | undefined)?.[f.key] ?? f.def}
                    onValueChange={(v) => commit(updateCaption(project, selectedCaption.id, { style: { ...selectedCaption.style, [f.key]: v === f.def ? undefined : v } as CaptionStyle }))}
                  >
                    <SelectTrigger aria-label={f.label} className="h-8 rounded-md bg-secondary px-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options.map(([id, label]) => (
                        <SelectItem key={id} value={id} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Starts at
                  <Input type="number" min={0} step={0.1} value={selectedCaption.start} onChange={(e) => commit(updateCaption(project, selectedCaption.id, { start: Number(e.target.value) }))} className="h-8 text-xs" />
                </label>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Lasts
                  <Input type="number" min={0.2} step={0.1} value={selectedCaption.duration} onChange={(e) => commit(updateCaption(project, selectedCaption.id, { duration: Number(e.target.value) }))} className="h-8 text-xs" />
                </label>
              </div>
            </>
          ) : selectedAudio ? (
            <>
              <div className="truncate text-xs font-semibold text-foreground">{selectedAudio.name}</div>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Starts at (seconds)
                <Input type="number" min={0} step={0.1} value={selectedAudio.start} onChange={(e) => commit(updateAudio(project, selectedAudio.id, { start: Number(e.target.value) }))} className="h-8 text-xs" />
              </label>
              {laneCount > 1 && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  Lane
                  <Select value={String(selectedAudio.lane ?? 1)} onValueChange={(v) => commit(setAudioLane(project, selectedAudio.id, Number(v)))}>
                    <SelectTrigger aria-label="Audio lane" className="h-8 rounded-md bg-secondary px-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {laneOptions.map((k) => (
                        <SelectItem key={k} value={String(k)} className="text-xs">
                          A{k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1 text-xs text-muted-foreground">
                Volume
                <Slider value={[selectedAudio.volume]} min={0} max={1} step={0.05} onValueChange={(v) => commit(updateAudio(project, selectedAudio.id, { volume: v[0] ?? 1 }))} aria-label="Volume" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Fade in (s)
                  <Input type="number" min={0} max={10} step={0.1} value={selectedAudio.fadeIn ?? 0} onChange={(e) => commit(updateAudio(project, selectedAudio.id, { fadeIn: Math.max(0, Number(e.target.value)) || undefined }))} className="h-8 text-xs" />
                </label>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Fade out (s)
                  <Input type="number" min={0} max={10} step={0.1} value={selectedAudio.fadeOut ?? 0} onChange={(e) => commit(updateAudio(project, selectedAudio.id, { fadeOut: Math.max(0, Number(e.target.value)) || undefined }))} className="h-8 text-xs" />
                </label>
              </div>
              {!uploadUrl(selectedAudio.uploadId) && <p className="text-xs text-destructive">This file is no longer in the Library, so it will not play.</p>}
            </>
          ) : (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Cutting</p>
              <p>Drag a clip's edges to trim it, or the clip itself to move it. C is the blade: click a clip to cut there. N is the rolling edit. Right-click anything for its options.</p>
              <p>Move over the timeline to see that frame. Ctrl and the wheel zoom.</p>
              <p>Space plays, Down arrow next clip, F forward 5 seconds, S splits at the playhead, arrows step, Delete removes.</p>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* The cutting tools in a column at the left, and beside it the timeline with a slim bar above it */}
      <div ref={timelineBox} className="relative flex min-h-0 flex-shrink-0 border border-border/60 bg-card" style={layout.bottom ? { height: `${layout.bottom}px` } : { maxHeight: "65%" }}>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to make the timeline taller or shorter"
          title="Drag to resize · Double-click to reset"
          onMouseDown={startResize("bottom")}
          onDoubleClick={() => resetSize("bottom")}
          className="absolute inset-x-0 -top-1 z-40 h-1.5 cursor-row-resize hover:bg-foreground/20"
        />
        <div className="flex w-10 flex-shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/60 bg-card py-2">
          {iconButton("Select (V)", MousePointer2, () => { setBlade(false); setMode("select") }, { active: !blade && mode === "select" })}
          {iconButton("Track select: click a clip to choose it and every clip after it (A)", TrackSelectIcon, () => { setBlade(false); setMode("track") }, { active: !blade && mode === "track" })}
          {iconButton("Rolling edit: drag a clip's edge to move the cut between two clips (N)", RollingEditIcon, () => { setBlade(false); setMode("roll") }, { active: !blade && mode === "roll" })}
          <div className="my-1 h-px w-5 flex-shrink-0 bg-border/60" />
          {iconButton("Razor: click a clip to cut there (C)", RazorIcon, () => { setBlade(true); setMode("select") }, { active: blade })}
          {iconButton("Text: click the timeline to add a caption there (T)", Type, () => { setBlade(false); setMode("text") }, { active: !blade && mode === "text" })}
          <div className="my-1 h-px w-5 flex-shrink-0 bg-border/60" />
          {iconButton("Hand: drag the timeline to move around it (H)", Hand, () => { setBlade(false); setMode("hand") }, { active: !blade && mode === "hand" })}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-shrink-0 flex-wrap items-center gap-1 px-2 py-1">
        {iconButton("Undo (Ctrl+Z)", Undo2, undo, { disabled: undoStack.current.length === 0 })}
        {iconButton("Redo (Ctrl+Shift+Z)", Redo2, redo, { disabled: redoStack.current.length === 0 })}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Timeline settings" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <Wrench className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Timeline settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={fit} className="text-xs">Fit the whole cut in view</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMagnet((m) => !m)} className="text-xs">{magnet ? "Turn snapping off" : "Turn snapping on"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => commit(syncWithShots(project, story))} className="text-xs">Bring the cut in line with the beats</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="sm" onClick={() => commit(syncWithShots(project, story))} className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{missing > 0 ? `Add ${missing} new ${missing === 1 ? "beat" : "beats"}` : "Sync beats"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Bring the cut in line with the beats. Your edits are kept.</TooltipContent>
        </Tooltip>
        <div className="mx-auto flex items-center gap-1">
          {iconButton("Back to the start (Home)", SkipBack, () => seek(0))}
          {iconButton(playing ? "Pause (Space)" : "Play (Space)", playing ? Pause : Play, togglePlay, { disabled: total === 0 })}
          {iconButton("Next clip (Down arrow)", SkipForward, nextClip, { disabled: total === 0 })}
          {iconButton("Forward 5 seconds (F)", FastForward, forward, { disabled: total === 0 })}
          <span className="mx-1 font-mono text-xs text-muted-foreground">{clock(total)}</span>
          {iconButton(fullscreen ? "Leave full screen" : "Full screen", fullscreen ? Minimize : Maximize, toggleFullscreen)}
        </div>

        <div className="flex items-center gap-1">
          <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
          <Slider value={[pps]} min={8} max={240} step={2} onValueChange={(v) => setPps(v[0] ?? 56)} aria-label="Zoom" className="w-20" />
          <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
          <Button type="button" variant="ghost" size="sm" onClick={fit} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
            Fit
          </Button>
        </div>
      </div>

      {/* The timeline, at the bottom: video layers above the main track, captions, then audio lanes */}
      <div
        ref={scroller}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(MEDIA_MIME)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(MEDIA_MIME)
          if (!raw) return
          e.preventDefault()
          try {
            const t = JSON.parse(raw) as { id: string; title: string; type: "image" | "video" | "audio"; url: string; thumbnailUrl: string; duration?: number }
            const at = round(timeFromClientX(e.clientX))
            void (async () => {
              // A sound goes on its lane where it is dropped; a picture or video goes on a layer there with Shift held, otherwise at the end of the main track
              if (t.type === "audio") {
                const have = uploads.find((u) => u.id === t.id)
                if (have) await placeAudio(have, t.duration, at)
                else showNotice("That sound is not in the Library yet.")
              } else if (e.shiftKey) {
                const length = t.type === "video" ? (t.duration ?? (await probeLength(t.url, "video", 5))) : 5
                const p = projectRef.current
                const withLayer = videoLayerCount(p) > 1 ? p : addVideoLayer(p)
                commit(addOverlay(withLayer, "", 0, videoLayerCount(withLayer), at, length, 0, { src: { url: t.url, type: t.type, name: t.title } }))
              } else await pickMedia({ ...t, category: "uploads" }, "main")
            })()
          } catch {
            showNotice("That could not be added.")
          }
        }}
        className={cn("min-h-0 flex-1 overflow-auto border-t border-border/60 select-none", mode === "hand" && "cursor-grab")}
        onMouseDownCapture={(e) => {
          const box = scroller.current
          if (!box || e.button !== 0 || (mode !== "hand" && mode !== "text")) return
          // The header cells at the left are not the timeline
          if ((e.target as HTMLElement).closest("[data-track-header]")) return
          e.preventDefault()
          e.stopPropagation()
          if (mode === "text") {
            const at = round(Math.max(0, timeFromClientX(e.clientX)))
            const next = addCaption(project, "Caption", at, 2)
            commit(next)
            const made = next.captions.find((c) => c.start === at && c.text === "Caption")
            if (made) setSelected({ kind: "caption", id: made.id })
            setMode("select")
            return
          }
          const start = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop }
          const move = (ev: MouseEvent) => {
            box.scrollLeft = start.left - (ev.clientX - start.x)
            box.scrollTop = start.top - (ev.clientY - start.y)
          }
          const up = () => {
            window.removeEventListener("mousemove", move)
            window.removeEventListener("mouseup", up)
          }
          window.addEventListener("mousemove", move)
          window.addEventListener("mouseup", up)
        }}
      >
        <div className="relative min-h-full" style={{ width: `${LABEL_WIDTH + timelineWidth}px` }}>
          {/* Ruler: click or drag to place the playhead */}
          <div className="flex h-8 border-b border-border/60">
            <div className="sticky left-0 z-30 flex flex-shrink-0 items-center gap-0.5 border-r border-border/60 bg-background px-1" style={{ width: `${LABEL_WIDTH}px` }}>
              <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Add a layer, music or media" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Add a layer, music or media</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => commit(addVideoLayer(project))} className="gap-2 text-xs">
              <Layers className="h-3.5 w-3.5" />
              Video layer
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => commit(addAudioLane(project))} className="gap-2 text-xs">
              <Music className="h-3.5 w-3.5" />
              Audio lane
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setPickTarget("layer")} className="gap-2 text-xs">
              <ImageIcon className="h-3.5 w-3.5" />
              Picture or video on a layer
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => audioInput.current?.click()} className="gap-2 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Upload video, picture or sound
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={doCaption} className="gap-2 text-xs">
              <Captions className="h-3.5 w-3.5" />
              Caption at the playhead
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
              {iconButton(magnet ? "Snapping is on" : "Snapping is off", Magnet, () => setMagnet((m) => !m), { active: magnet, small: true })}
              {iconButton("Add a marker at the playhead (M)", MarkerIcon, () => commit(addMarker(project, timeRef.current)), { small: true })}
              <span className="ml-auto pr-1 font-mono text-xs text-primary" aria-label="Playhead time">{clock(time)}</span>
            </div>
            <div
              className="relative flex-1 cursor-pointer"
              {...trackHover}
              onMouseDown={(e) => {
                const s = snap(timeFromClientX(e.clientX))
                seek(s.t)
                setPointerX(e.clientX)
                setDrag({ kind: "scrub" })
              }}
            >
              {Array.from({ length: minorCount + 1 }, (_, i) => {
                const t = i * minor
                const isMajor = i % 5 === 0
                return (
                  <span key={i} className={cn("pointer-events-none absolute bottom-0 border-l border-border/60", isMajor ? "h-full" : "h-2")} style={{ left: `${t * pps}px` }}>
                    {isMajor && <span className="pl-1 font-mono text-xs text-muted-foreground">{mark(t, major < 1)}</span>}
                  </span>
                )
              })}
              {(project.markers ?? []).map((m) => (
                <Tooltip key={m.id}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Marker at ${clock(m.time)}. Click to go there, right-click to remove.`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => seek(m.time)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        commit(deleteMarker(project, m.id))
                      }}
                      className="absolute top-0 z-20 h-4 w-4 -translate-x-1/2 p-0 text-primary hover:bg-transparent"
                      style={{ left: `${m.time * pps}px` }}
                    >
                      <MarkerIcon className="h-3.5 w-3.5 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{m.label || `Marker ${clock(m.time)}`} · right-click removes</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Captions */}
          <div className="flex border-b border-border/60" style={{ height: `${heightOf("captions", "captions")}px` }} {...trackHover}>
            {rowHeader("captions", "Captions", Captions, "captions")}
            <div className="relative flex-1" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); seek(timeFromClientX(e.clientX)) } }} onContextMenu={trackMenu("captions")}>
              {project.captions.map((cap) => {
                const isSel = selected?.kind === "caption" && selected.id === cap.id
                return (
                  <div
                    key={cap.id}
                    onContextMenu={(e) => openMenu(e, { kind: "item", target: { kind: "caption", id: cap.id } })}
                    role="button"
                    tabIndex={0}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setSelected({ kind: "caption", id: cap.id })
                      setDrag({ kind: "caption-move", id: cap.id, x: e.clientX, base: projectRef.current })
                    }}
                    className={cn("group absolute bottom-0 top-0 cursor-grab overflow-hidden border-r border-background bg-muted px-2 text-xs leading-7 text-foreground", isSel && "ring-1 ring-inset ring-foreground")}
                    style={{ left: `${cap.start * pps}px`, width: `${Math.max(6, cap.duration * pps)}px` }}
                  >
                    <div className={cn("pointer-events-none absolute inset-0", cap.rich ? TEXT_TINT : CAPTION_TINT)} />
                    <span className="relative block truncate">{cap.text}</span>
                    <div
                      className="absolute left-0 top-0 h-full w-2 cursor-col-resize bg-foreground/30 opacity-0 hover:bg-foreground/60 group-hover:opacity-100"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setSelected({ kind: "caption", id: cap.id })
                        setDrag({ kind: "caption-start", id: cap.id, x: e.clientX, base: projectRef.current })
                      }}
                      aria-hidden="true"
                    />
                    <div
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-foreground/30 opacity-0 hover:bg-foreground/60 group-hover:opacity-100"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setSelected({ kind: "caption", id: cap.id })
                        setDrag({ kind: "caption-end", id: cap.id, x: e.clientX, base: projectRef.current })
                      }}
                      aria-hidden="true"
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Video layers, the highest first: V2 and up are overlays, V1 is the main track */}
          {Array.from({ length: videoCount }, (_, j) => videoCount - j).map((layer) => {
            const id = `v${layer}`
            const h = heightOf(id, "video")
            return (
              <div key={id} className="flex border-b border-border/60" style={{ height: `${h}px` }} {...trackHover}>
                {rowHeader(id, layer === 1 ? "Video 1" : `Video ${layer}`, Film, "video")}
                <div className="relative flex-1" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); seek(timeFromClientX(e.clientX)) } }} onContextMenu={trackMenu(id)}>
                  {layer === 1 &&
                    project.clips.map((clip, i) => {
                      const r = resolveShot(clip.shotId, clip.take, clip.src)
                      const isSel = (selected?.kind === "clip" && selected.id === clip.id) || (multi.length > 1 && multi.includes(clip.id))
                      const width = Math.max(6, clip.duration * pps)
                      const dragging = drag?.kind === "clip-move" && drag.moved && drag.id === clip.id
                      return (
                        <div
                          key={clip.id}
                          onContextMenu={(e) => openMenu(e, { kind: "item", target: { kind: "clip", id: clip.id } })}
                          role="button"
                          tabIndex={0}
                          {...dropProps({ kind: "clip", id: clip.id })}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return
                            const t = timeFromClientX(e.clientX)
                            if (blade) {
                              if (trackOf(projectRef.current, "v1").lock) return showNotice("That layer is locked. Unlock it to change it.")
                              const next = splitClip(projectRef.current, clip.id, t)
                              if (next !== projectRef.current) commit(next)
                              return
                            }
                            // Track select: this clip and every clip after it
                            if (mode === "track") {
                              const ids = projectRef.current.clips.slice(i).map((c) => c.id)
                              setMulti(ids)
                              setSelected({ kind: "clip", id: clip.id })
                              return
                            }
                            // Shift or Ctrl and a click adds the clip to the ones chosen, or takes it out again
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                              const base = multi.length > 0 ? multi : selected?.kind === "clip" ? [selected.id] : []
                              const next = base.includes(clip.id) ? base.filter((id) => id !== clip.id) : [...base, clip.id]
                              setMulti(next)
                              setSelected(next.length > 0 ? { kind: "clip", id: next.includes(clip.id) ? clip.id : next[next.length - 1]! } : null)
                              return
                            }
                            setMulti([])
                            setSelected({ kind: "clip", id: clip.id })
                            seek(t)
                            setPointerX(e.clientX)
                            setDrag({ kind: "clip-move", id: clip.id, x: e.clientX, base: projectRef.current, moved: false })
                          }}
                          className={cn("group absolute bottom-0 top-0 overflow-hidden border-r border-background bg-muted", blade ? "cursor-crosshair" : "cursor-grab", isSel && "ring-1 ring-inset ring-foreground", dragging && "opacity-30", dropOver === clip.id && "ring-2 ring-inset ring-primary")}
                          style={{ left: `${starts[i]! * pps}px`, width: `${width}px` }}
                        >
                          {r.kind !== "empty" && <Filmstrip url={r.url} video={r.kind === "video"} trimIn={clip.trimIn} duration={clip.duration} width={width} height={h} />}
                          {r.kind === "empty" && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">not made yet</div>}
                          <div className={cn("pointer-events-none absolute inset-0", videoTint(clip.id))} />
                          {overlapOf(project.clips, i) > 0 && (
                            <div
                              className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center border-r border-foreground/70 bg-foreground/30"
                              style={{ width: `${overlapOf(project.clips, i) * pps}px` }}
                              title={`Transition: ${getItems("transition").find((t) => t.id === clip.transitionIn?.id)?.name ?? clip.transitionIn?.id}`}
                            >
                              <ArrowRightLeft className="h-3 w-3 text-foreground" />
                            </div>
                          )}
                          {clip.fx && Object.keys(clip.fx).length > 0 && <span className="pointer-events-none absolute right-1 top-0 font-serif text-xs italic text-foreground/80">fx</span>}
                          <span className="pointer-events-none absolute left-3 top-0 max-w-[calc(100%-1.5rem)] truncate bg-background/80 px-1 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                            {i + 1} · {nameOf(clip, r)} · {clip.duration}s
                          </span>
                          {!blade && (
                            <>
                              <div
                                className="absolute left-0 top-0 flex h-full w-3 cursor-col-resize items-center justify-center bg-foreground/30 opacity-0 hover:bg-foreground/60 group-hover:opacity-100"
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                  setSelected({ kind: "clip", id: clip.id })
                                  setDrag({ kind: "clip-start", id: clip.id, x: e.clientX, base: projectRef.current, still: r.kind !== "video" })
                                }}
                                aria-hidden="true"
                              >
                                <span className="h-5 w-0.5 rounded bg-background" />
                              </div>
                              <div
                                className="absolute right-0 top-0 flex h-full w-3 cursor-col-resize items-center justify-center bg-foreground/30 opacity-0 hover:bg-foreground/60 group-hover:opacity-100"
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                  setSelected({ kind: "clip", id: clip.id })
                                  setDrag({ kind: "clip-end", id: clip.id, x: e.clientX, base: projectRef.current, limit: Infinity })
                                }}
                                aria-hidden="true"
                              >
                                <span className="h-5 w-0.5 rounded bg-background" />
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  {layer === 1 && draggedClip && (
                    <div className="pointer-events-none absolute bottom-0 top-0 z-20 border border-select/60 bg-select/10" style={{ left: `${timeFromClientX(pointerX) * pps - (draggedClip.duration * pps) / 2}px`, width: `${Math.max(10, draggedClip.duration * pps - 2)}px` }} />
                  )}
                  {layer === 1 && dropTime !== null && <div className="pointer-events-none absolute -top-1 bottom-0 z-20 w-1 rounded bg-primary" style={{ left: `${dropTime * pps - 2}px` }} />}
                  {layer > 1 &&
                    overlayRows(layer).map((o) => {
                      const r = resolveShot(o.shotId, o.take, o.src)
                      const isSel = selected?.kind === "overlay" && selected.id === o.id
                      const width = Math.max(6, o.duration * pps)
                      return (
                        <div
                          key={o.id}
                          onContextMenu={(e) => openMenu(e, { kind: "item", target: { kind: "overlay", id: o.id } })}
                          role="button"
                          tabIndex={0}
                          {...dropProps({ kind: "overlay", id: o.id })}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return
                            e.stopPropagation()
                            setSelected({ kind: "overlay", id: o.id })
                            setDrag({ kind: "overlay-move", id: o.id, x: e.clientX, base: projectRef.current })
                          }}
                          className={cn("group absolute bottom-0 top-0 cursor-grab overflow-hidden border-r border-background bg-muted", isSel && "ring-1 ring-inset ring-foreground", dropOver === o.id && "ring-2 ring-inset ring-primary")}
                          style={{ left: `${o.start * pps}px`, width: `${width}px` }}
                        >
                          {r.kind !== "empty" && <Filmstrip url={r.url} video={r.kind === "video"} trimIn={o.trimIn} duration={o.duration} width={width} height={h} />}
                          {r.kind === "empty" && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">not made yet</div>}
                          <div className={cn("pointer-events-none absolute inset-0", videoTint(o.id))} />
                          {o.fx && Object.keys(o.fx).length > 0 && <span className="pointer-events-none absolute right-1 top-0 font-serif text-xs italic text-foreground/80">fx</span>}
                          <span className="pointer-events-none absolute left-3 top-0 max-w-[calc(100%-1.5rem)] truncate bg-background/80 px-1 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                            V{o.layer} · {nameOf(o, r)} · {o.duration}s
                          </span>
                          <div
                            className="absolute right-0 top-0 flex h-full w-3 cursor-col-resize items-center justify-center bg-foreground/30 opacity-0 hover:bg-foreground/60 group-hover:opacity-100"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setSelected({ kind: "overlay", id: o.id })
                              setDrag({ kind: "overlay-end", id: o.id, x: e.clientX, base: projectRef.current })
                            }}
                            aria-hidden="true"
                          >
                            <span className="h-5 w-0.5 rounded bg-background" />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )
          })}

          {/* Audio lanes */}
          {Array.from({ length: laneCount }, (_, j) => j + 1).map((lane) => {
            const id = `a${lane}`
            const h = heightOf(id, "audio")
            return (
              <div key={id} className="flex border-b border-border/60" style={{ height: `${h}px` }} {...trackHover}>
                {rowHeader(id, `Audio ${lane}`, Music, "audio")}
                <div className="relative flex-1" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); seek(timeFromClientX(e.clientX)) } }} onContextMenu={trackMenu(id)}>
                  {project.audio
                    .filter((a) => (a.lane ?? 1) === lane)
                    .map((a) => {
                      const isSel = selected?.kind === "audio" && selected.id === a.id
                      const url = uploadUrl(a.uploadId)
                      return (
                        <div
                          key={a.id}
                          onContextMenu={(e) => openMenu(e, { kind: "item", target: { kind: "audio", id: a.id } })}
                          role="button"
                          tabIndex={0}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            setSelected({ kind: "audio", id: a.id })
                            setDrag({ kind: "audio-move", id: a.id, x: e.clientX, base: projectRef.current })
                          }}
                          className={cn("group absolute bottom-0 top-0 cursor-grab overflow-hidden border-r border-background px-2 text-xs leading-7", url ? "bg-muted text-foreground" : "bg-destructive/10 text-destructive", isSel && "ring-1 ring-inset ring-foreground")}
                          style={{ left: `${a.start * pps}px`, width: `${Math.max(6, a.duration * pps)}px` }}
                        >
                          {url && <div className={cn("pointer-events-none absolute inset-0", AUDIO_TINT)} />}
                          <Waveform url={url} height={h} />
                          <span className="relative block truncate opacity-0 transition-opacity group-hover:opacity-100">{a.name}</span>
                          {url && <audio ref={(el) => { if (el) audioEls.current.set(a.id, el); else audioEls.current.delete(a.id) }} src={url} preload="auto" />}
                          <div
                            className="absolute left-0 top-0 h-full w-2 cursor-col-resize bg-foreground/30 opacity-0 hover:bg-foreground/60 group-hover:opacity-100"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setSelected({ kind: "audio", id: a.id })
                              setDrag({ kind: "audio-start", id: a.id, x: e.clientX, base: projectRef.current })
                            }}
                            aria-hidden="true"
                          />
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-foreground/30 opacity-0 hover:bg-foreground/60 group-hover:opacity-100"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setSelected({ kind: "audio", id: a.id })
                              setDrag({ kind: "audio-end", id: a.id, x: e.clientX, base: projectRef.current })
                            }}
                            aria-hidden="true"
                          />
                        </div>
                      )
                    })}
                </div>
              </div>
            )
          })}

          {/* The line under the cursor, the snap line, and the playhead */}
          {hover !== null && !drag && !playing && <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-muted-foreground/60" style={{ left: `${LABEL_WIDTH + hover * pps}px` }} />}
          {snapLine !== null && <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-emerald-500" style={{ left: `${LABEL_WIDTH + snapLine * pps}px` }} />}
          <div className="pointer-events-none absolute top-0 z-20 h-full w-px bg-primary" style={{ left: `${LABEL_WIDTH + time * pps}px` }}>
            <span className="absolute -left-1.5 top-0 h-3 w-3 rounded-sm bg-primary" />
          </div>
        </div>
      </div>
        </div>
      </div>

      {menu && (
        <DropdownMenu open onOpenChange={(open) => { if (!open) setMenu(null) }}>
          <DropdownMenuTrigger asChild>
            <span aria-hidden="true" className="pointer-events-none fixed h-0 w-0" style={{ left: `${menu.x}px`, top: `${menu.y}px` }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" sideOffset={0} className="w-60" onCloseAutoFocus={(e) => e.preventDefault()}>
            {menu.for.kind === "item" ? (
              (() => {
                const target = menu.for.target
                const isClip = target.kind === "clip"
                const row = (label: string, hint: string, run: () => void, disabled = false) => (
                  <DropdownMenuItem key={label} disabled={disabled} onSelect={run} className="gap-2 text-xs">
                    {label}
                    {hint && <span className="ml-auto text-muted-foreground">{hint}</span>}
                  </DropdownMenuItem>
                )
                return (
                  <>
                    {row("Copy", "Ctrl+C", () => copyItem(target))}
                    {row("Cut", "Ctrl+X", () => { copyItem(target); doDelete(false, target) })}
                    {row("Paste", "Ctrl+V", () => pasteAt(timeRef.current), clipboard === null)}
                    {row("Duplicate", "D", () => duplicateItem(target))}
                    <DropdownMenuSeparator />
                    {isClip && row("Split at the playhead", "S", doSplit, !currentClip)}
                    {isClip && row("Copy effects", "", () => selectedClip && setCopiedLook({ fx: selectedClip.fx }))}
                    {isClip && row("Paste effects", "", () => copiedLook && commit(setFxAll(project, "clip", target.id, copiedLook.fx)), copiedLook === null)}
                    {target.kind === "overlay" && row("Move to the main track", "", () => commit(overlayToMain(project, target.id)))}
                    {isClip && <DropdownMenuSeparator />}
                    {row("Delete", "Del", () => doDelete(false, target))}
                    {isClip && row("Ripple delete", "Shift+Del", () => doDelete(true, target))}
                  </>
                )
              })()
            ) : (
              (() => {
                const at = menu.for.time
                const track = menu.for.track
                const state = trackOf(project, track)
                return (
                  <>
                    <DropdownMenuItem disabled={clipboard === null} onSelect={() => pasteAt(at, track)} className="gap-2 text-xs">
                      Paste here
                      <span className="ml-auto text-muted-foreground">Ctrl+V</span>
                    </DropdownMenuItem>
                    {track === "captions" && (
                      <DropdownMenuItem onSelect={() => { const next = addCaption(project, "Caption", at, 2); commit(next) }} className="gap-2 text-xs">
                        Add a caption here
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => commit(addMarker(project, at))} className="gap-2 text-xs">
                      Add a marker here
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => commit(addVideoLayer(project))} className="gap-2 text-xs">
                      Add a video layer
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => commit(addAudioLane(project))} className="gap-2 text-xs">
                      Add an audio lane
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => commit(setTrack(project, track, { mute: !state.mute }))} className="gap-2 text-xs">
                      {track.startsWith("a") ? (state.mute ? "Unmute this layer" : "Mute this layer") : state.mute ? "Show this layer" : "Hide this layer"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => commit(setTrack(project, track, { lock: !state.lock }))} className="gap-2 text-xs">
                      {state.lock ? "Unlock this layer" : "Lock this layer"}
                    </DropdownMenuItem>
                  </>
                )
              })()
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
})

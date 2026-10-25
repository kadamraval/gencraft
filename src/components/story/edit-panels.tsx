import * as React from "react"
import { Captions, Check, Eye, EyeOff, GripVertical, Image as ImageIcon, Layers, Lock, Music, Plus, Shapes, Unlock, Upload, Video, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { usePackItems } from "@/lib/packs/store"
import type { PackItem } from "@/lib/packs/types"
import { DEFAULT_RICH, audioLaneCount, overlaysOf, trackOf, videoLayerCount } from "./edit-model"
import type { EditProject, RichText, ShotRef } from "./edit-model"
import { ensureFont } from "@/lib/brand/fonts"
import { drawRichText } from "./text-render"
import type { StoryItem } from "./types"

/**
 * The panels at the left of the editor that are more than a card grid: Scene (the beats the story's scene AI made), Layer (the
 * layers of the cut), Text, Media and Elements. Each is a plain component with what it needs passed in, so video-editor.tsx keeps
 * the cut and these only show it and ask for changes.
 */

const heading = "text-xs font-semibold text-foreground"
const hint = "text-xs text-muted-foreground"

const IMAGE_URL = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)|^data:image/i
function Thumb({ url, mode, className }: { url?: string; mode: "video" | "image"; className?: string }) {
  if (!url) return <div className={cn("flex items-center justify-center bg-secondary text-xs text-muted-foreground", className)}>Not made yet</div>
  if (mode === "video" && !IMAGE_URL.test(url)) return <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className={cn("object-cover", className)} />
  return <img src={url} alt="" draggable={false} className={cn("object-cover", className)} />
}

// ---------------------------------------------------------------- Scene

/** The beats of the story, by scene, as the scene AI made them. A beat on the timeline shows how many times; click one to find it. */
export function ScenePanel({ story, project, shots, selectedShotId, onAdd, onAddMissing, onFind }: {
  story: StoryItem
  project: EditProject
  shots: Map<string, ShotRef>
  selectedShotId?: string
  onAdd: (shot: ShotRef) => void
  onAddMissing: () => void
  onFind: (shotId: string) => void
}) {
  const used = new Map<string, number>()
  for (const c of project.clips) used.set(c.shotId, (used.get(c.shotId) ?? 0) + 1)
  for (const o of overlaysOf(project)) used.set(o.shotId, (used.get(o.shotId) ?? 0) + 1)
  const missing = [...shots.values()].filter((s) => !used.has(s.shotId)).length
  return (
    <div className="space-y-3">
      <div className={heading}>Scene</div>
      <p className={hint}>The beats your scenes made. Click one to find it in the cut, or add it to the end.</p>
      {missing > 0 && (
        <Button type="button" variant="secondary" size="sm" onClick={onAddMissing} className="h-8 w-full gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add {missing} beat{missing === 1 ? "" : "s"} not in the cut
        </Button>
      )}
      {story.scenes.length === 0 && <p className={hint}>This story has no scenes yet. Make them on the Scene page.</p>}
      {story.scenes.map((sc) => (
        <div key={sc.id} className="space-y-1.5">
          <div className="truncate text-xs font-semibold text-foreground">
            Scene {sc.sceneNumber}
            {sc.title ? ` · ${sc.title}` : ""}
          </div>
          {sc.shots.map((sh) => {
            const ref = shots.get(sh.id)
            if (!ref) return null
            const times = used.get(sh.id) ?? 0
            const first = ref.takes.find(Boolean)
            return (
              <div key={sh.id} className={cn("group flex gap-2 rounded-lg border border-border bg-card p-1.5", selectedShotId === sh.id && "border-select")}>
                <Button type="button" variant="ghost" onClick={() => onFind(sh.id)} aria-label={`Find beat ${ref.shotNumber} in the cut`} className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded-md p-0">
                  <Thumb url={first} mode={ref.mode} className="h-full w-full" />
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-foreground">
                    S{ref.sceneNumber}.{ref.shotNumber} · {ref.mode === "video" ? "Video" : "Image"} · {ref.seconds}s
                  </div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{sh.prompt || "No prompt yet"}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {times > 0 ? (
                      <>
                        <Check className="h-3 w-3" /> In the cut{times > 1 ? ` ×${times}` : ""}
                      </>
                    ) : (
                      "Not in the cut"
                    )}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Add beat ${ref.shotNumber} to the end of the cut`} title="Add to the end of the cut" onClick={() => onAdd(ref)} className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Layer

type LayerRow = { id: string; kind: "captions" | "video" | "audio"; label: string; count: number; movable: boolean }

/** Every layer of the cut, top to bottom as on the timeline: captions, picture layers, then audio lanes. Drag a grip to reorder. */
export function LayerPanel({ project, onTrack, onSwap, onAddVideoLayer, onAddAudioLane }: {
  project: EditProject
  onTrack: (id: string, patch: { mute?: boolean; lock?: boolean; solo?: boolean; gain?: number }) => void
  onSwap: (kind: "video" | "audio", a: number, b: number) => void
  onAddVideoLayer: () => void
  onAddAudioLane: () => void
}) {
  const v = videoLayerCount(project)
  const a = audioLaneCount(project)
  const over = overlaysOf(project)
  const rows: LayerRow[] = [
    { id: "captions", kind: "captions", label: "Captions", count: project.captions.length, movable: false },
    ...Array.from({ length: v }, (_, j) => v - j).map((n) => ({ id: `v${n}`, kind: "video" as const, label: n === 1 ? "Video 1 (main)" : `Video ${n}`, count: n === 1 ? project.clips.length : over.filter((o) => o.layer === n).length, movable: n > 1 })),
    ...Array.from({ length: a }, (_, j) => j + 1).map((n) => ({ id: `a${n}`, kind: "audio" as const, label: `Audio ${n}`, count: project.audio.filter((x) => (x.lane ?? 1) === n).length, movable: true })),
  ]
  const [dragOver, setDragOver] = React.useState<string | null>(null)
  return (
    <div className="space-y-2">
      <div className={heading}>Layers</div>
      <p className={hint}>Hide, lock or solo a layer, set an audio level, or drag the grip to move a layer up or down.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onAddVideoLayer} className="h-8 gap-1.5 text-xs">
          <Layers className="h-3.5 w-3.5" />
          Video layer
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onAddAudioLane} className="h-8 gap-1.5 text-xs">
          <Music className="h-3.5 w-3.5" />
          Audio lane
        </Button>
      </div>
      {rows.map((row) => {
        const state = trackOf(project, row.id)
        const Off = row.kind === "audio" ? (state.mute ? VolumeX : Volume2) : state.mute ? EyeOff : Eye
        const level = Math.round((state.gain ?? 1) * 100)
        return (
          <div
            key={row.id}
            onDragOver={(e) => {
              if (row.movable && e.dataTransfer.types.includes("text/layer")) {
                e.preventDefault()
                setDragOver(row.id)
              }
            }}
            onDragLeave={() => setDragOver((d) => (d === row.id ? null : d))}
            onDrop={(e) => {
              const from = e.dataTransfer.getData("text/layer")
              setDragOver(null)
              if (!row.movable || from === row.id || from.charAt(0) !== row.id.charAt(0)) return
              e.preventDefault()
              onSwap(row.kind === "audio" ? "audio" : "video", Number(from.slice(1)), Number(row.id.slice(1)))
            }}
            className={cn("space-y-1.5 rounded-lg border border-border bg-card p-2", dragOver === row.id && "border-select")}
          >
            <div className="flex items-center gap-1">
              {row.movable ? (
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/layer", row.id)
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  title="Drag onto another layer to move this one up or down"
                  aria-label={`Move ${row.label} up or down`}
                  className="flex-shrink-0 cursor-grab text-muted-foreground hover:text-foreground"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span className="w-3.5 flex-shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{row.label}</span>
              <span className="flex-shrink-0 font-mono text-xs text-muted-foreground">{row.count}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={row.kind === "audio" ? (state.mute ? `Unmute ${row.label}` : `Mute ${row.label}`) : state.mute ? `Show ${row.label}` : `Hide ${row.label}`} aria-pressed={state.mute === true} onClick={() => onTrack(row.id, { mute: !state.mute })} className={cn("h-6 w-6", state.mute ? "text-foreground" : "text-muted-foreground")}>
                <Off className="h-3.5 w-3.5" />
              </Button>
              {row.kind !== "captions" && (
                <Button type="button" variant="ghost" size="icon" aria-label={state.solo ? `Stop soloing ${row.label}` : `Solo ${row.label}`} aria-pressed={state.solo === true} onClick={() => onTrack(row.id, { solo: !state.solo })} className={cn("h-6 w-6 text-xs font-semibold", state.solo ? "bg-secondary text-foreground" : "text-muted-foreground")}>
                  S
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label={state.lock ? `Unlock ${row.label}` : `Lock ${row.label}`} aria-pressed={state.lock === true} onClick={() => onTrack(row.id, { lock: !state.lock })} className={cn("h-6 w-6", state.lock ? "text-foreground" : "text-muted-foreground")}>
                {state.lock ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {row.kind === "audio" && (
              <div className="flex items-center gap-2 pl-5">
                <Slider value={[level]} min={0} max={100} step={1} onValueChange={(val) => onTrack(row.id, { gain: (val[0] ?? 100) / 100 })} aria-label={`Level of ${row.label}`} className="flex-1" />
                <span className="w-9 text-right font-mono text-xs text-muted-foreground">{level}%</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Text

const PW = 384
const PH = 216
const BACKDROP: [string, string] = ["#3b4252", "#1f2430"] // allow-color

/** Text layers from the content packs, each drawn in its own font with the same code the cut uses. Hover to see it come in. */
export function TextPanel({ onAdd }: { onAdd: (item: { text: string; duration: number; rich: Partial<RichText>; name: string }) => void }) {
  const items = usePackItems("text-style").filter((i) => i.data.rich !== undefined)
  return (
    <div className="space-y-2">
      <div className={heading}>Text</div>
      <p className={hint}>Click a style to put a title at the playhead, then change its words, font and look on the right. You can drag it in the picture.</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => onAdd({ text: "Your text", duration: 3, rich: {}, name: "Text" })} className="h-8 w-full gap-1.5 text-xs">
        <Plus className="h-3.5 w-3.5" />
        Add plain text
      </Button>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <TextLayerCard key={it.id} item={it} onClick={() => onAdd({ text: String(it.data.text ?? "Your text"), duration: Number(it.data.duration ?? 3), rich: it.data.rich as Partial<RichText>, name: it.name })} />
        ))}
      </div>
      {items.length === 0 && <p className={hint}>No text styles are installed. They arrive with the editor content pack.</p>}
    </div>
  )
}

function TextLayerCard({ item, onClick }: { item: PackItem; onClick: () => void }) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = React.useState(false)
  const rich = React.useMemo(() => ({ ...DEFAULT_RICH, ...(item.data.rich as Partial<RichText>) }), [item])
  const duration = Number(item.data.duration ?? 3)
  const sample = String(item.data.text ?? item.name)
  React.useEffect(() => {
    let alive = true
    let raf = 0
    const paint = (t: number, animated: boolean) => {
      const cv = canvas.current
      const g = cv?.getContext("2d")
      if (!cv || !g) return
      const bg = g.createLinearGradient(0, 0, PW, PH)
      bg.addColorStop(0, BACKDROP[0])
      bg.addColorStop(1, BACKDROP[1])
      g.fillStyle = bg
      g.fillRect(0, 0, PW, PH)
      // The card shows the style at the middle of the frame and a little smaller, so long lines and plates fit
      const shown: RichText = { ...rich, x: 50, y: 50, align: "center", size: rich.size * 0.55, width: 92, animIn: animated ? rich.animIn : undefined, animOut: animated ? rich.animOut : undefined }
      drawRichText(g, { id: "p", text: sample, start: 0, duration: animated ? duration : 10, rich: shown }, animated ? t : 5, PW, PH)
    }
    paint(0, false)
    void ensureFont(rich.family, rich.weight, rich.italic).then(() => alive && !hover && paint(0, false))
    if (hover) {
      const start = performance.now()
      const run = (now: number) => {
        paint(((now - start) / 1000) % (duration + 0.6), true)
        raf = requestAnimationFrame(run)
      }
      raf = requestAnimationFrame(run)
    }
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [rich, sample, duration, hover])
  return (
    <Button type="button" variant="ghost" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={item.description} aria-label={`${item.name}: ${item.description ?? "add at the playhead"}`} className="group h-auto w-full flex-col items-stretch justify-start gap-0 overflow-hidden rounded-lg border border-border bg-card p-0 text-left font-normal transition-colors hover:border-select focus-visible:border-select">
      <canvas ref={canvas} width={PW} height={PH} className="aspect-video w-full" />
      <div className="truncate px-2 py-1 text-xs text-foreground">{item.name}</div>
    </Button>
  )
}

// ---------------------------------------------------------------- Media

export interface MediaTile {
  id: string
  title: string
  type: "image" | "video" | "audio"
  url: string
  thumbnailUrl: string
  duration?: number
  source: "Upload" | "Created"
}

/** Pictures, videos and sounds from the Library, by kind. More sources (stock sites) are added here as they are connected. */
/** What a media card carries when it is dragged onto the timeline */
export const MEDIA_MIME = "application/x-gencraft-media"

export function MediaPanel({ tiles, onPick, heading: title = "Media", onUpload }: { tiles: MediaTile[]; onPick: (tile: MediaTile, onLayer: boolean) => void; heading?: string; onUpload?: () => void }) {
  const [kind, setKind] = React.useState<"image" | "video" | "audio">("video")
  const [layer, setLayer] = React.useState(false)
  const shown = tiles.filter((t) => t.type === kind)
  const KINDS = [
    { id: "image" as const, label: "Image", Icon: ImageIcon },
    { id: "video" as const, label: "Video", Icon: Video },
    { id: "audio" as const, label: "Audio", Icon: Music },
  ]
  return (
    <div className="space-y-2">
      {onUpload && (
        <Button type="button" variant="secondary" size="sm" onClick={onUpload} className="h-8 w-full gap-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" />
          Upload files
        </Button>
      )}
      {!onUpload && <div className={heading}>{title}</div>}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
        {KINDS.map(({ id, label, Icon }) => (
          <Button key={id} type="button" variant="ghost" size="sm" aria-pressed={kind === id} onClick={() => setKind(id)} className={cn("h-7 gap-1 px-1 text-xs", kind === id ? "bg-background text-foreground" : "text-muted-foreground")}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>
      {kind !== "audio" && (
        <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Put it on a layer above
          <Switch checked={layer} onCheckedChange={setLayer} aria-label="Put it on a layer above the main track" />
        </label>
      )}
      
      {shown.length === 0 && <p className={hint}>{onUpload ? `No ${kind === "image" ? "pictures" : kind === "video" ? "videos" : "sounds"} uploaded yet.` : `No ${kind === "image" ? "pictures" : kind === "video" ? "videos" : "sounds"} in the Library yet. Add some on the Upload tab.`}</p>}
      <div className="grid grid-cols-2 gap-2">
        {shown.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant="ghost"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(MEDIA_MIME, JSON.stringify({ id: t.id, title: t.title, type: t.type, url: t.url, thumbnailUrl: t.thumbnailUrl, duration: t.duration }))
              e.dataTransfer.effectAllowed = "copy"
            }}
            onClick={() => onPick(t, layer)}
            title={`${t.title}. Click to add, or drag onto the timeline.`} aria-label={`Add ${t.title}`} className="group h-auto w-full flex-col items-stretch justify-start gap-0 overflow-hidden rounded-lg border border-border bg-card p-0 text-left font-normal transition-colors hover:border-select focus-visible:border-select">
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-secondary">
              {t.type === "audio" ? <Music className="h-5 w-5 text-muted-foreground" /> : <Thumb url={t.thumbnailUrl || t.url} mode={t.type === "video" && !t.thumbnailUrl ? "video" : "image"} className="h-full w-full" />}
              <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-xs text-muted-foreground">{t.source}</span>
            </div>
            <div className="truncate px-2 py-1 text-xs text-foreground">{t.title}</div>
          </Button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Elements

/** Graphics from the library content pack (stickers, shapes, frames, lower thirds). None are installed until that pack is published. */
export function ElementsPanel() {
  const items = usePackItems("element")
  return (
    <div className="space-y-2">
      <div className={heading}>Elements</div>
      <p className={hint}>Stickers, shapes, frames and graphics to put on a layer.</p>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-4 text-center">
          <Shapes className="h-5 w-5 text-muted-foreground" />
          <p className={hint}>No graphics are installed yet. They arrive with the library content pack: Settings, General, Content packs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((it) => (
            <div key={it.id} className="truncate rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground">
              <Captions className="mr-1 inline h-3 w-3" />
              {it.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


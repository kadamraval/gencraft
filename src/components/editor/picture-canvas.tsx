import { ArrowRightLeft, ArrowUp, Brush, ChevronDown, Columns2, Eraser, MapPin, Plus, Redo2, Trash2, Undo2, Wand2, X } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ProcessingOverlay } from "@/components/ui/processing-overlay"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ModelPickerButton } from "@/components/models/model-picker"
import { SettingSlider } from "@/components/ui/setting-field"
import type { Stroke } from "@/lib/media/image-fx"
import { cn } from "@/lib/utils"
import type { EditSession } from "./media-editor"

/**
 * The middle of the picture popup: the versions down the left (the original on top, each edit below it), the picture with zoom by scroll,
 * and one bar below: the size, the prompt, and compare and zoom. Compare shows the picture against the original, split by a handle you
 * drag, or toggled.
 */

const STEP = 1.25
const MIN = 0.1
const MAX = 16

const box = (w: number, h: number, x = 0, y = 0, extra = ""): React.CSSProperties => ({ width: w, height: h, transform: `translate(${x}px, ${y}px) ${extra}` })
const cameraView = (c: { rotate: number; vertical: number; zoom: number }) => `perspective(900px) rotateY(${c.rotate}deg) rotateX(${-c.vertical}deg) scale(${1 + c.zoom / 100})`
const place = (b: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` })
const lightAt = (x: number, y: number, colour: string | undefined, strength: number): React.CSSProperties => ({ left: `${x}%`, top: `${y}%`, backgroundColor: colour, opacity: strength })
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_CROP = 0.05
const HANDLES: Array<[string, string]> = [
  ["nw", "left-0 top-0 cursor-nwse-resize"],
  ["n", "left-1/2 top-0 cursor-ns-resize"],
  ["ne", "left-full top-0 cursor-nesw-resize"],
  ["w", "left-0 top-1/2 cursor-ew-resize"],
  ["e", "left-full top-1/2 cursor-ew-resize"],
  ["sw", "left-0 top-full cursor-nesw-resize"],
  ["s", "left-1/2 top-full cursor-ns-resize"],
  ["se", "left-full top-full cursor-nwse-resize"],
]

/** The frame drawn on the picture while Resize is on Crop: drag it to move, drag a handle to resize; what is outside is dimmed */
function CropFrame({ box: b, onChange }: { box: { x: number; y: number; w: number; h: number }; onChange: (b: { x: number; y: number; w: number; h: number }) => void }) {
  const area = React.useRef<HTMLDivElement>(null)
  const start = (mode: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const rect = area.current!.getBoundingClientRect()
    const from = { ...b }
    const x0 = e.clientX
    const y0 = e.clientY
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / rect.width
      const dy = (ev.clientY - y0) / rect.height
      let { x, y, w, h } = from
      if (mode === "move") {
        x = clamp(from.x + dx, 0, 1 - w)
        y = clamp(from.y + dy, 0, 1 - h)
      } else {
        if (mode.includes("w")) {
          x = clamp(from.x + dx, 0, from.x + from.w - MIN_CROP)
          w = from.x + from.w - x
        }
        if (mode.includes("e")) w = clamp(from.w + dx, MIN_CROP, 1 - from.x)
        if (mode.includes("n")) {
          y = clamp(from.y + dy, 0, from.y + from.h - MIN_CROP)
          h = from.y + from.h - y
        }
        if (mode.includes("s")) h = clamp(from.h + dy, MIN_CROP, 1 - from.y)
      }
      onChange({ x, y, w, h })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  return (
    <div ref={area} className="absolute inset-0">
      <div className="absolute inset-x-0 top-0 bg-background/60" style={place({ x: 0, y: 0, w: 1, h: b.y })} />
      <div className="absolute inset-x-0 bottom-0 bg-background/60" style={place({ x: 0, y: b.y + b.h, w: 1, h: 1 - b.y - b.h })} />
      <div className="absolute bg-background/60" style={place({ x: 0, y: b.y, w: b.x, h: b.h })} />
      <div className="absolute bg-background/60" style={place({ x: b.x + b.w, y: b.y, w: 1 - b.x - b.w, h: b.h })} />
      <div onPointerDown={start("move")} style={place(b)} className="absolute cursor-move touch-none border-2 border-primary">
        {HANDLES.map(([mode, where]) => (
          <span key={mode} onPointerDown={start(mode)} className={cn("absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-sm border border-primary bg-background", where)} />
        ))}
      </div>
    </div>
  )
}
const clipLeft = (pct: number): React.CSSProperties => ({ clipPath: `inset(0 ${100 - pct}% 0 0)` })
const MARK_TEXT = { primary: "text-primary", destructive: "text-destructive", foreground: "text-foreground" } as const
const MARK_DOT = { primary: "bg-primary", destructive: "bg-destructive", foreground: "bg-foreground" } as const
const handleAt = (pct: number): React.CSSProperties => ({ left: `${pct}%` })

export function PictureCanvas({ session, title, onEdit }: { session: EditSession; title: string; /** Clicking the prompt bar goes to the Edit tab */ onEdit?: () => void }) {
  const { versions, current, size, preview, prompt, setPrompt, send, busy, marks, marking, tool, pen, brush, markColour } = session
  const overlay = React.useRef<SVGSVGElement>(null)
  const [live, setLive] = React.useState<Stroke | null>(null)
  const [draft, setDraft] = React.useState<Array<[number, number]>>([])
  const pinR = Math.max(14, Math.min(size.w, size.h) * 0.03)
  // Where the light sits on the picture: round the picture is the angle, up and down is how high
  const lightRot = session.light ? (session.light.rotate > 180 ? session.light.rotate - 360 : session.light.rotate) : 0
  const lx = 50 + (lightRot / 360) * 100
  const ly = 50 - ((session.light?.elevation ?? 0) / 180) * 100
  const moveLight = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    const dx = (e.clientX - r.left) / r.width - 0.5
    const dy = (e.clientY - r.top) / r.height - 0.5
    session.setLightAt(Math.round((dx * 360 + 360) % 360), clamp(Math.round(-dy * 180), -90, 90))
  }
  const penSize = Math.max(4, (brush / 100) * 0.1 * Math.max(size.w, size.h))
  const stage = React.useRef<HTMLDivElement>(null)
  const [room, setRoom] = React.useState({ w: 0, h: 0 })
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const drag = React.useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const [compare, setCompare] = React.useState(false)
  const [mode, setMode] = React.useState<"split" | "toggle">("split")
  const [split, setSplit] = React.useState(50)
  const [comparedId, setComparedId] = React.useState("original")
  const [swapped, setSwapped] = React.useState(false)
  const [toggled, setToggled] = React.useState(false)
  const splitting = React.useRef(false)
  const frame = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // What fills the room at zoom 1, and the zoom shown as a percentage of the picture's own size
  const fit = size.w > 0 && room.w > 0 ? Math.min(1, (room.w - 24) / size.w, (room.h - 24) / size.h) : 1
  const percent = Math.round(fit * zoom * 100)
  const w = size.w * fit * zoom
  const h = size.h * fit * zoom

  const zoomTo = React.useCallback((next: number) => {
    const z = Math.min(MAX, Math.max(MIN, next))
    setZoom(z)
    if (z <= 1) setPan({ x: 0, y: 0 })
  }, [])

  // Zoom by scroll
  React.useEffect(() => {
    const el = stage.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    el.addEventListener("wheel", wheel, { passive: false })
    return () => el.removeEventListener("wheel", wheel)
  }, [zoom, zoomTo])

  // Keys: zoom in, out, 100%, fit
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")
      if (typing) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === "=" || e.key === "+")) (e.preventDefault(), zoomTo(zoom * STEP))
      else if (mod && e.key === "-") (e.preventDefault(), zoomTo(zoom / STEP))
      else if (mod && e.key === "0") (e.preventDefault(), zoomTo(1 / fit))
      else if (!mod && e.key.toLowerCase() === "d") zoomTo(1)
      else if (!mod && session.marking) {
        const k = e.key.toLowerCase()
        if (k === "m") session.setTool("retouch")
        else if (k === "x") session.setTool("erase")
        else if (k === "n") session.setTool("annotate")
        else if (k === "s") session.setPen("select")
        else if (k === "b") session.setPen("brush")
        else if (k === "l") session.setPen(session.pen === "polygon" ? "freehand" : "polygon")
        else if (k === "enter") closeDraft()
        else if (k === "escape") setDraft([])
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [zoom, fit, zoomTo, session, closeDraft])

  const pointOf = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const r = overlay.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h]
  }
  function closeDraft() {
    setDraft((d) => {
      if (d.length >= 3) session.addMark({ kind: "area", size: 0, pts: d })
      return []
    })
  }
  const markDown = (e: React.PointerEvent) => {
    if (!marking) return
    e.stopPropagation()
    const p = pointOf(e)
    if (tool === "annotate") {
      session.addMark({ kind: "pin", size: 0, pts: [p], n: marks.filter((m) => m.kind === "pin").length + 1 })
      return
    }
    if (pen === "select") {
      void session.selectAt(p[0], p[1])
      return
    }
    if (pen === "polygon") {
      const near = draft.length >= 3 && Math.hypot(p[0] - draft[0]![0], p[1] - draft[0]![1]) < 14 / Math.max(0.05, fit * zoom)
      if (near) closeDraft()
      else setDraft((d) => [...d, p])
      return
    }
    setLive({ kind: pen === "brush" ? "brush" : "area", size: penSize, pts: [p] })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  const markMove = (e: React.PointerEvent) => {
    if (live) setLive({ ...live, pts: [...live.pts, pointOf(e)] })
  }
  const markUp = () => {
    if (live && (live.kind === "brush" || live.pts.length >= 3)) session.addMark(live)
    setLive(null)
  }

  const startDrag = (e: React.PointerEvent) => {
    if (compare || zoom <= 1) return
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (splitting.current) {
      const r = (frame.current ?? e.currentTarget).getBoundingClientRect()
      setSplit(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
    } else if (drag.current) setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })
  }
  const endDrag = () => {
    drag.current = null
    splitting.current = false
  }

  /** The colour the marks have on screen, so the marked picture sent to a model shows the same */
  const markColourCss = () => (overlay.current ? getComputedStyle(overlay.current).color : undefined)

  const compared = versions.find((v) => v.id === comparedId) ?? versions[0]!
  const left = swapped ? compared : current
  const right = swapped ? current : compared
  // The picture the compare shows now, when toggling
  const showing = toggled ? right : left

  const pick = (id: string) => (compare ? setComparedId(id) : session.setCurrentId(id))

  return (
    <div className="relative flex h-full w-full flex-col gap-3">
      <div className="pointer-events-none absolute left-0 top-0 z-30 rounded-xl border border-border/60 bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-xs">{title}</div>

      {/* The versions: the original first, every edit after it */}
      <div className="absolute left-0 top-1/2 z-30 flex max-h-[70%] -translate-y-1/2 flex-col gap-2 overflow-y-auto no-scrollbar">
        {versions.map((v) => {
          const on = compare ? v.id === comparedId : v.id === current.id
          return (
            <Button key={v.id} type="button" variant="ghost" aria-label={v.label} aria-pressed={on} onClick={() => pick(v.id)} className={cn("relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border p-0", on ? "border-foreground" : "border-border")}>
              <img src={v.url} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-0.5 text-center text-xs">{v.label}</span>
            </Button>
          )
        })}
      </div>

      <div
        ref={stage}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className={cn("relative flex min-h-0 flex-1 items-center justify-center overflow-hidden pl-[4.5rem]", zoom > 1 && !compare && "cursor-grab")}
      >
        {compare ? (
          <div ref={frame} className="relative flex-shrink-0 overflow-hidden" style={box(w, h)}>
            {mode === "split" ? (
              <>
                <img src={right.url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
                <img src={left.url} alt="" draggable={false} style={clipLeft(split)} className="absolute inset-0 h-full w-full object-contain" />
                <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground" style={handleAt(split)} />
                <Button
                  type="button"
                  variant="secondary"
                  aria-label="Drag to compare"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    splitting.current = true
                    stage.current?.setPointerCapture(e.pointerId)
                  }}
                  style={handleAt(split)}
                  className="absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full p-0"
                >
                  <Columns2 className="h-4 w-4" />
                </Button>
                <span className="absolute left-3 top-1/2 rounded-md bg-card/80 px-2 py-1 text-xs text-foreground">{left === current ? "Current" : "Compared"}</span>
                <span className="absolute right-3 top-1/2 rounded-md bg-card/80 px-2 py-1 text-xs text-foreground">{right === current ? "Current" : "Compared"}</span>
              </>
            ) : (
              <>
                <img src={showing.url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" onClick={() => setToggled((t) => !t)} />
                <span className="absolute left-3 top-3 rounded-md bg-card/80 px-2 py-1 text-xs text-foreground">{showing === current ? "Current" : "Compared"}</span>
              </>
            )}
          </div>
        ) : (
          <div style={box(w, h, pan.x, pan.y, session.camera ? cameraView(session.camera) : "")} className="relative max-w-none flex-shrink-0 transition-[width,height] duration-150 ease-out">
            <img src={preview ?? current.url} alt={title} draggable={false} className="h-full w-full select-none object-contain" />
            {busy && <ProcessingOverlay label={session.busyLabel ? `${session.busyLabel}…` : "Working…"} />}
            {size.w > 0 && (
              <svg
                ref={overlay}
                viewBox={`0 0 ${size.w} ${size.h}`}
                preserveAspectRatio="none"
                onPointerDown={markDown}
                onPointerMove={markMove}
                onPointerUp={markUp}
                onDoubleClick={closeDraft}
                className={cn("absolute inset-0 h-full w-full touch-none", MARK_TEXT[markColour], marking ? "cursor-crosshair" : "pointer-events-none")}
              >
                <g className="opacity-60">
                  {[...marks, ...(live ? [live] : [])].map((m, i) =>
                    m.kind === "pin" ? (
                      <g key={i}>
                        <circle cx={m.pts[0]![0]} cy={m.pts[0]![1]} r={pinR} fill="currentColor" />
                        <text x={m.pts[0]![0]} y={m.pts[0]![1]} textAnchor="middle" dominantBaseline="central" fontSize={pinR * 1.2} className="fill-background font-bold">
                          {m.n}
                        </text>
                      </g>
                    ) : m.kind === "mask" ? (
                      <g key={i}>
                        <mask id={`mark-${i}`}>
                          <image href={m.mask} width={size.w} height={size.h} preserveAspectRatio="none" />
                        </mask>
                        <rect width={size.w} height={size.h} fill="currentColor" mask={`url(#mark-${i})`} />
                      </g>
                    ) : m.kind === "brush" ? (
                      <polyline key={i} points={m.pts.map((q) => q.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth={m.size} strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <polygon key={i} points={m.pts.map((q) => q.join(",")).join(" ")} fill="currentColor" />
                    ),
                  )}
                </g>
                {draft.length > 0 && (
                  <>
                    <polyline points={draft.map((q) => q.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth={Math.max(2, penSize / 8)} />
                    {draft.map((q, i) => (
                      <circle key={i} cx={q[0]} cy={q[1]} r={Math.max(3, penSize / 5)} fill="currentColor" />
                    ))}
                  </>
                )}
              </svg>
            )}
            {session.cropping && <CropFrame box={session.cropBox} onChange={session.setCropBox} />}
            {session.light && (
              <div
                className="absolute inset-0 touch-none overflow-hidden"
                onPointerDown={(e) => {
                  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                  moveLight(e)
                }}
                onPointerMove={(e) => e.buttons === 1 && moveLight(e)}
              >
                <div className="absolute h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={lightAt(lx, ly, session.lightCss, 0.15 + session.light.intensity / 14)} />
                <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-foreground bg-background" style={lightAt(lx, ly, undefined, 1)} />
              </div>
            )}
          </div>
        )}
      </div>


      <div className="grid flex-shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-3">
        <div className="flex h-10 items-center justify-self-start whitespace-nowrap rounded-xl bg-card px-3 text-xs text-muted-foreground">
          <span className="font-mono">{size.w > 0 ? `${size.w}x${size.h} px` : "…"}</span>
        </div>

        <div className="mx-auto w-full min-w-0 max-w-3xl">
        {compare ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              {[left, right].map((v, i) => (
                <img key={`${v.id}-${i}`} src={v.url} alt={i === 0 ? "Current" : "Compared"} className="h-12 w-12 rounded-lg border border-border object-cover" />
              ))}
              <Button type="button" variant="ghost" size="icon" aria-label="Swap sides" className="h-7 w-7" onClick={() => setSwapped((s) => !s)}>
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1">
              <Button type="button" size="sm" variant={mode === "split" ? "secondary" : "ghost"} className="gap-1.5" onClick={() => setMode("split")}>
                <Columns2 className="h-3.5 w-3.5" />
                Split
              </Button>
              <Button type="button" size="sm" variant={mode === "toggle" ? "secondary" : "ghost"} className="gap-1.5" onClick={() => setMode("toggle")}>
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Toggle
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Close compare" className="h-8 w-8" onClick={() => setCompare(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          session.open ? (
            <div className="mx-auto flex w-full max-w-sm animate-fade-in items-center justify-between gap-3 rounded-2xl bg-card py-2.5 pl-4 pr-2.5">
              <span className="text-sm font-medium">{session.openName}</span>
              <Button type="button" variant="secondary" size="sm" className="h-8 rounded-lg px-3" onClick={session.closeOption}>
                Close
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-3 transition-shadow focus-within:ring-1 focus-within:ring-border">
              {marks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2">
                  {marks.map((m, i) => (
                    <span key={i} className="flex animate-fade-in items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-0.5 pr-1.5 text-xs">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">{i + 1}</span>
                      {m.kind === "pin" ? `Pin ${m.n}` : m.kind === "mask" ? "Selection" : m.kind === "area" ? "Area" : "Brush"}
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove this mark" onClick={() => session.removeMark(i)} className="h-4 w-4 rounded-full p-0 text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </Button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => {
                    session.setMarking(true)
                    onEdit?.()
                  }}
                  onKeyDown={(e) => e.key === "Enter" && send(markColourCss())}
                  placeholder={marks.length > 0 ? "Describe what to change in this area" : "Write your changes or select an area on the image to start"}
                  aria-label="Write your changes or select an area on the image to start"
                  className="h-9 border-0 bg-transparent px-1 text-sm shadow-none hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
                />
                {!marking && (
                  <Button type="button" size="icon" aria-label="Send" disabled={busy || !prompt.trim()} onClick={() => send(markColourCss())} className="h-8 w-8 flex-shrink-0 rounded-full">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {marking && (
                <div className="flex min-w-0 animate-fade-in flex-wrap items-center gap-y-1 gap-x-0.5 pt-2">
                  {session.refUrl ? (
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove the reference picture" onClick={() => session.setRefUrl(null)} className="h-8 w-8 overflow-hidden rounded-lg p-0">
                      <img src={session.refUrl} alt="" className="h-full w-full object-cover" />
                    </Button>
                  ) : (
                    <label title={session.canRef ? "Add a reference picture" : "No model you can use takes a second picture yet"} className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors", session.canRef ? "cursor-pointer hover:bg-secondary hover:text-foreground" : "opacity-50")}>
                      <Plus className="h-4 w-4" />
                      <Input type="file" accept="image/*" disabled={!session.canRef} className="sr-only" aria-label="Add a reference picture" onChange={(e) => e.target.files?.[0] && session.setRefUrl(URL.createObjectURL(e.target.files[0]))} />
                    </label>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg px-2 text-xs font-medium">
                        {tool === "erase" ? <Eraser className="h-3.5 w-3.5" /> : tool === "annotate" ? <MapPin className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
                        {tool === "erase" ? "Erase" : tool === "annotate" ? "Annotate" : "Retouch"}
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-44">
                      <DropdownMenuItem onSelect={() => session.setTool("retouch")} className="justify-between">
                        Retouch <span className="text-xs text-muted-foreground">M</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => session.setTool("erase")} className="justify-between">
                        Erase <span className="text-xs text-muted-foreground">X</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => session.setTool("annotate")} className="justify-between">
                        Annotate <span className="text-xs text-muted-foreground">N</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg px-2 text-xs font-medium">
                        <Brush className="h-3.5 w-3.5" />
                        {pen === "brush" ? "Brush" : pen === "select" ? "Select" : pen === "polygon" ? "Polygonal lasso" : "Freehand lasso"}
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-52">
                      <DropdownMenuItem onSelect={() => session.setPen("brush")} className="justify-between">
                        Brush <span className="text-xs text-muted-foreground">B</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => session.setPen("select")} className="justify-between">
                        Select <span className="text-xs text-muted-foreground">S</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => session.setPen("polygon")} className="justify-between">
                        Polygonal lasso <span className="text-xs text-muted-foreground">L</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => session.setPen("freehand")} className="justify-between">
                        Freehand lasso <span className="text-xs text-muted-foreground">L</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="Mark colour and brush size" className="h-8 w-8 rounded-lg">
                        <span className={cn("h-4 w-4 rounded-full", MARK_DOT[markColour])} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" className="w-56 space-y-4">
                      <div className="flex items-center gap-2">
                        {(Object.keys(MARK_DOT) as Array<keyof typeof MARK_DOT>).map((c) => (
                          <Button key={c} type="button" variant="ghost" size="icon" aria-label={c} aria-pressed={markColour === c} onClick={() => session.setMarkColour(c)} className={cn("h-7 w-7 rounded-full p-0 ring-offset-2 ring-offset-popover", markColour === c && "ring-2 ring-ring")}>
                            <span className={cn("h-5 w-5 rounded-full", MARK_DOT[c])} />
                          </Button>
                        ))}
                      </div>
                      <SettingSlider label="Brush size" info="How wide the brush is." value={brush} min={2} max={100} onChange={session.setBrush} />
                    </PopoverContent>
                  </Popover>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <Button type="button" variant="ghost" size="icon" aria-label="Undo" disabled={marks.length === 0} onClick={session.undo} className="h-8 w-8 rounded-lg">
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Redo" disabled={session.undone === 0} onClick={session.redo} className="h-8 w-8 rounded-lg">
                    <Redo2 className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Delete the marks" disabled={marks.length === 0} onClick={session.clearMarks} className="h-8 w-8 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <span className="flex-1" />
                  {session.barModels.length > 0 && <ModelPickerButton ordered side="top" records={session.barModels} value={session.barModel} onChange={session.setBarModel} className="h-8 w-auto max-w-40 bg-transparent hover:bg-secondary" />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground">
                        {session.precise ? "Precision" : "Creative"}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top">
                      <DropdownMenuItem onSelect={() => session.setPrecise(false)}>Creative</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => session.setPrecise(true)}>Precision</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button type="button" size="icon" aria-label="Send" disabled={busy || (marks.length === 0 ? !prompt.trim() : (tool === "retouch" || tool === "annotate") && !prompt.trim())} onClick={() => send(markColourCss())} className="ml-1 h-9 w-9 flex-shrink-0 rounded-full">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close the tools"
                    onClick={() => {
                      session.setMarking(false)
                      setDraft([])
                    }}
                    className="h-8 w-8 rounded-lg text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )
        )}
        </div>

        <div className="flex h-10 items-center gap-1 justify-self-end rounded-xl bg-card px-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Compare with the original"
            aria-pressed={compare}
            disabled={versions.length < 2}
            onClick={() => {
              setCompare((on) => !on)
              setComparedId("original")
              setSwapped(false)
              setToggled(false)
            }}
            className="h-8 w-8"
          >
            <Columns2 className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 font-mono">
                {`${percent}%`}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52">
              <DropdownMenuItem onSelect={() => zoomTo(zoom * STEP)} className="justify-between">
                Zoom in <span className="text-xs text-muted-foreground">⌘ +</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => zoomTo(zoom / STEP)} className="justify-between">
                Zoom out <span className="text-xs text-muted-foreground">⌘ -</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => zoomTo(1 / fit)} className="justify-between">
                Zoom 100% <span className="text-xs text-muted-foreground">⌘ 0</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => zoomTo(1)} className="justify-between">
                Zoom to fit <span className="text-xs text-muted-foreground">D</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

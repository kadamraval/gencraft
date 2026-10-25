import { FileText, ImagePlus, Music, Plus, X } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { DropZone } from "@/components/ui/drop-zone"
import { layoutInputs } from "@/lib/apps/layout"
import type { AppInput, InputValue } from "@/lib/apps/types"
import { cn } from "@/lib/utils"
import { InputField } from "./app-inputs"
import { appIcon } from "./icons"

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`))
    reader.readAsDataURL(file)
  })

/** Opens the studio's own picture picker (upload, Created, Element, Liked). The screen that owns the picker supplies this. */
export interface PickRequest {
  label: string
  /** What the block takes. The picker shows only this kind. */
  kind: "image" | "video" | "audio"
  multiple: boolean
  limit: number
  /** The pictures already chosen */
  selected: string[]
  onPick: (urls: string[]) => void
}
export type Pick = (request: PickRequest) => void

const COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" } as const
const HELP: Record<string, string> = { image: "Select a PNG or JPG from your device", pdf: "Select a PDF from your device", video: "Choose a video clip", audio: "Choose a sound or a voice" }
const ACCEPT: Record<string, string> = { image: "image/*", pdf: "application/pdf,.pdf", video: "video/*", audio: "audio/*" }

/**
 * An upload as a block: a dashed card with its icon, its name, one line of help and an "Optional" mark. Drop a file on it or
 * click it. Once filled, a picture fills the block and a PDF shows its name; the cross takes it away.
 */
function UploadBlock({ input, value, onChange, pick }: { input: AppInput; value: InputValue; onChange: (v: InputValue) => void; pick?: Pick }) {
  const compact = input.compact === true
  const Icon = appIcon(input.icon ?? (input.type === "pdf" ? "file-text" : input.type === "video" ? "video" : input.type === "audio" ? "music" : "image"))
  const [note, setNote] = React.useState("")
  const filled = input.type === "pdf" ? value instanceof File : typeof value === "string" && value.length > 0

  const take = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    if (input.type === "pdf") return onChange(f)
    try {
      setNote("")
      onChange(await readAsDataUrl(f))
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That picture could not be opened.")
    }
  }

  return (
    <div className="flex h-full flex-col gap-1">
      <div className="relative flex-1">
        {filled ? (
          <div className={cn("group relative flex h-full items-center justify-center overflow-hidden rounded-2xl bg-secondary", compact ? "aspect-square" : "aspect-[4/3]")}>
            {input.type === "pdf" ? (
              <div className="flex flex-col items-center gap-1.5 px-3 text-center">
                <FileText className="size-6 text-muted-foreground" />
                <span className="line-clamp-2 text-xs text-foreground">{(value as File).name}</span>
              </div>
            ) : input.type === "video" ? (
              <video src={String(value)} muted className="h-full w-full object-cover" />
            ) : input.type === "audio" ? (
              <div className="flex flex-col items-center gap-1.5 px-3 text-center">
                <Music className="size-6 text-muted-foreground" />
                <audio src={String(value)} controls className="h-8 w-full" />
              </div>
            ) : (
              <img src={String(value)} alt={input.label} className="h-full w-full object-cover" />
            )}
            <Button type="button" variant="ghost" size="iconSm" aria-label={`Remove ${input.label}`} onClick={() => onChange(undefined)} className="absolute right-1.5 top-1.5 h-6 w-6 rounded-md bg-background/80 p-0 backdrop-blur hover:bg-background">
              <X className="size-3" />
            </Button>
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-medium text-foreground backdrop-blur">{input.label}</span>
          </div>
        ) : (
          <DropZone accept={ACCEPT[input.type] ?? "image/*"} label={input.label} onFiles={(files) => void take(files)} onOpen={pick && input.type !== "pdf" ? () => pick({ label: input.label, kind: input.type === "video" ? "video" : input.type === "audio" ? "audio" : "image", multiple: false, limit: 1, selected: [], onPick: (urls) => onChange(urls[0]) }) : undefined} className={cn("h-full gap-2 rounded-2xl", compact ? "px-2 py-4" : "px-4 py-6")}>
            <span className={cn("flex items-center justify-center rounded-full bg-secondary text-foreground", compact ? "size-8" : "size-10")}>
              <Icon className={compact ? "size-4" : "size-5"} />
            </span>
            <span className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>{input.label}</span>
            {!compact && <span className="px-2 text-xs text-muted-foreground">{input.hint ?? HELP[input.type]}</span>}
          </DropZone>
        )}
        {!input.required && !filled && <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Optional</span>}
      </div>
      {note && <p className="text-xs text-destructive">{note}</p>}
    </div>
  )
}

/** "Add several pictures": one row of small pictures and a plus, with a drop area around it */
function MediaStrip({ input, value, onChange, pick }: { input: AppInput; value: InputValue; onChange: (v: InputValue) => void; pick?: Pick }) {
  const urls = Array.isArray(value) ? value : []
  const [note, setNote] = React.useState("")
  const add = async (files: File[]) => {
    try {
      setNote("")
      const added = await Promise.all(files.slice(0, 6).map(readAsDataUrl))
      onChange([...urls, ...added].slice(0, 6))
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That picture could not be opened.")
    }
  }
  const Icon = appIcon(input.icon ?? "images")
  return (
    <div className="space-y-1">
      <DropZone accept="image/*" multiple label={input.label} onFiles={(files) => void add(files)} onOpen={pick ? () => pick({ label: input.label, kind: "image", multiple: true, limit: 6, selected: urls, onPick: (next) => onChange(next) }) : undefined} className="flex-row justify-start gap-2 rounded-2xl px-3 py-3 text-left">
        {urls.map((u, i) => (
          <span key={i} className="group relative size-9 flex-shrink-0 overflow-hidden rounded-full bg-secondary">
            <img src={u} alt="" className="h-full w-full object-cover" />
            <Button type="button" variant="ghost" size="iconSm" aria-label="Remove" onClick={(e) => (e.stopPropagation(), onChange(urls.filter((_, j) => j !== i)))} className="absolute inset-0 h-9 w-9 rounded-full bg-background/70 p-0 opacity-0 transition-opacity group-hover:opacity-100">
              <X className="size-3" />
            </Button>
          </span>
        ))}
        <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">{urls.length === 0 ? <Icon className="size-4" /> : <Plus className="size-4" />}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{input.label}</span>
        {!input.required && urls.length === 0 && <span className="flex-shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Optional</span>}
      </DropZone>
      {note && <p className="text-xs text-destructive">{note}</p>}
      {input.hint && <p className="text-xs text-muted-foreground">{input.hint}</p>}
    </div>
  )
}

/** All of an app's inputs, laid out by the one rule in lib/apps/layout.ts, so every app looks the same */
export function AppInputs({ inputs, values, onChange, pick, fill }: { inputs: AppInput[]; values: Record<string, InputValue>; onChange: (id: string, v: InputValue) => void; pick?: Pick; /** Fit the layout to the height of the box this sits in (the sidebar), so it is full */ fill?: boolean }) {
  const root = React.useRef<HTMLDivElement>(null)
  const [room, setRoom] = React.useState<{ width: number; height: number } | undefined>()
  React.useLayoutEffect(() => {
    const box = root.current?.parentElement
    if (!fill || !box) return
    // The box has 16px of padding at its sides and bottom
    const read = () => setRoom({ width: box.clientWidth - 32, height: box.clientHeight - 16 })
    read()
    const watcher = new ResizeObserver(read)
    watcher.observe(box)
    return () => watcher.disconnect()
  }, [fill])
  return (
    // The cards share all the height the fields and slots leave, so the sidebar has no gap above its fixed bottom bar
    <div ref={root} className="flex min-h-full flex-col gap-3">
      {layoutInputs(inputs, room).map((row, i) => {
        if (row.kind === "blocks") {
          return (
            <div key={i} className={cn("grid gap-2", COLS[row.cols], row.items[0]?.compact ? "" : "min-h-28 flex-1")}>
              {row.items.map((input) => (
                <UploadBlock key={input.id} input={input} value={values[input.id]} onChange={(v) => onChange(input.id, v)} pick={pick} />
              ))}
            </div>
          )
        }
        if (row.kind === "strip") return <MediaStrip key={row.item.id} input={row.item} value={values[row.item.id]} onChange={(v) => onChange(row.item.id, v)} pick={pick} />
        return <InputField key={row.item.id} input={row.item} value={values[row.item.id]} onChange={(v) => onChange(row.item.id, v)} />
      })}
    </div>
  )
}

export { ImagePlus }

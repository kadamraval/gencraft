import { downloadMedia } from "@/lib/library/download"
import { ratioOf } from "@/components/library/layout-classes"
import { raiseChip } from "@/lib/ui/chips"
import * as React from "react"
import { limited } from "@/lib/notice"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Check, Download, FolderPlus, Play, Plus, Repeat2, ScrollText, Trash2, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorBadge } from "@/components/ui/error-notice"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createFolder, setItemInFolder, useFolders } from "@/lib/library/folders-store"
import type { FriendlyError } from "@/lib/errors/explain"
import { cn } from "@/lib/utils"

export interface TileItem {
  id: string
  title: string
  type: "image" | "video" | "audio"
  url: string
  thumbnailUrl: string
  prompt?: string
  /** A failed run has no file: it shows its reason, and Log opens the details */
  status?: "completed" | "generating" | "failed"
  error?: string
  errorInfo?: FriendlyError
}

interface TileProps {
  item: TileItem
  /** Tailwind classes that size the tile (aspect ratio) */
  className?: string
  /** square: every tile a square, the picture cropped. natural: the picture's own shape, never cropped. */
  fit?: "square" | "natural"
  /** What the tile expects before the picture has loaded, like "16:9" */
  ratioHint?: string
  onOpen: () => void
  /** Puts the image or clip and its prompt back in the composer. Not offered for uploads. */
  onReuse?: () => void
  onDelete: () => void
  /** Opens what happened in a failed run */
  onLog?: () => void
}

/** Saves the file and says where it went (the save folder in the desktop app, the browser's Downloads in a browser) */
function download(item: TileItem) {
  void downloadMedia({ id: item.id, url: item.url, title: item.title, type: item.type }).then((r) => raiseChip({ key: "download", level: "info", kind: "note", title: "Downloaded", message: r.message, ttl: 9000 }))
}

function IconAction({ label, onClick, children, className }: { label: string; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation()
            onClick?.()
          }}
          className={cn("h-6 w-6 rounded-md bg-background/80 p-0 text-foreground backdrop-blur-xs hover:bg-background", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * One generated or uploaded file. Hovering shows icon-only actions at the top right: add to a folder,
 * download, delete, and reuse (back into the composer with its prompt).
 */
export function MediaTile({ item, className, fit = "natural", ratioHint, onOpen, onReuse, onDelete, onLog }: TileProps) {
  const { folders, members } = useFolders()
  const [newName, setNewName] = React.useState("")
  const videoRef = React.useRef<HTMLVideoElement>(null)
  // The picture's real shape, once it has loaded, so a wide picture is never cut into a square
  const [seen, setSeen] = React.useState<number | undefined>()
  const ratio = fit === "natural" ? (seen ?? ratioOf(ratioHint)) : undefined
  const seenFrom = (w: number, h: number) => (w > 0 && h > 0 ? setSeen(w / h) : undefined)

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => item.type === "video" && void videoRef.current?.play().catch(() => undefined)}
      onMouseLeave={() => {
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.currentTime = 0
        }
      }}
      className={cn("group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg", fit === "square" && "aspect-square", className)}
      style={ratio && item.status !== "failed" ? { aspectRatio: String(ratio) } : undefined}
      title={item.title}
    >
      {item.status === "failed" && (
        <div className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 bg-secondary/30 p-3 text-center">
          <ErrorBadge kind={item.errorInfo?.kind} className="h-8 w-8" />
          <span className="line-clamp-2 text-xs font-medium text-foreground">{item.errorInfo?.title ?? "Did not generate"}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{item.errorInfo?.message ?? item.error}</span>
        </div>
      )}
      {item.status !== "failed" && item.type === "image" && <img src={item.thumbnailUrl || item.url} alt={item.title} onLoad={(e) => seenFrom(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} className={cn("w-full object-cover transition-transform duration-300 group-hover:scale-105", ratio || fit === "square" ? "h-full" : "h-auto")} />}
      {item.status !== "failed" && item.type === "video" && <video ref={videoRef} src={item.url} poster={item.thumbnailUrl || undefined} muted loop playsInline preload="metadata" onLoadedMetadata={(e) => seenFrom(e.currentTarget.videoWidth, e.currentTarget.videoHeight)} className={cn("w-full object-cover", ratio || fit === "square" ? "h-full" : "h-auto")} />}
      {item.status !== "failed" && item.type === "audio" && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-secondary/50 p-2 text-center">
          <Volume2 className="h-6 w-6 text-muted-foreground" />
          <span className="line-clamp-2 text-xs font-medium text-foreground">{item.title}</span>
        </div>
      )}

      <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-background/80 text-foreground opacity-75 backdrop-blur-xs">
        {item.type === "video" ? <Play className="ml-0.5 h-2.5 w-2.5 fill-current" /> : item.type === "audio" ? <Volume2 className="h-2.5 w-2.5" /> : null}
      </div>

      <div className="absolute inset-x-1.5 top-1.5 flex flex-wrap justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {item.status === "failed" && onLog && (
          <IconAction label="Log" onClick={onLog}>
            <ScrollText className="h-3.5 w-3.5" />
          </IconAction>
        )}
        {item.status !== "failed" && (
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="iconSm" aria-label="Add to folder" onClick={(e) => e.stopPropagation()} className="h-6 w-6 rounded-md bg-background/80 p-0 text-foreground backdrop-blur-xs hover:bg-background">
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Add to folder</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-56 space-y-1 p-2" onClick={(e) => e.stopPropagation()}>
            <div className="px-1 pb-1 text-xs font-semibold uppercase text-muted-foreground">Folders</div>
            {folders.length === 0 && <p className="px-1 pb-1 text-xs text-muted-foreground">Everything is in Default. Make a folder to group items.</p>}
            {folders.map((f) => {
              const inside = (members[f.id] ?? []).includes(item.id)
              return (
                <Button key={f.id} type="button" variant="ghost" size="sm" onClick={() => setItemInFolder(f.id, item.id, !inside)} className="h-7 w-full justify-between px-2 text-xs">
                  <span className="truncate">{f.title}</span>
                  {inside && <Check className="h-3 w-3" />}
                </Button>
              )
            })}
            <form
              className="flex items-center gap-1 pt-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newName.trim()) return
                const folder = limited(() => createFolder(newName))
                if (!folder) return
                setItemInFolder(folder.id, item.id, true)
                setNewName("")
              }}
            >
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New folder" className="h-7 text-xs" />
              <Button type="submit" size="iconSm" variant="secondary" aria-label="Create folder and add" disabled={!newName.trim()} className="h-7 w-7 p-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </form>
          </PopoverContent>
        </Popover>
        )}
        {item.status !== "failed" && (
          <IconAction label="Download" onClick={() => download(item)}>
            <Download className="h-3.5 w-3.5" />
          </IconAction>
        )}
        {onReuse && (
          <IconAction label={item.status === "failed" ? "Try again" : "Reuse in the composer"} onClick={onReuse}>
            <Repeat2 className="h-3.5 w-3.5" />
          </IconAction>
        )}
        <IconAction label="Delete" onClick={onDelete} className="hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </IconAction>
      </div>
    </div>
  )
}

/** The warning shown before anything is deleted from the Library. */
export function ConfirmDeleteMedia({ items, onCancel, onConfirm }: { items: TileItem[]; onCancel: () => void; onConfirm: () => void }) {
  const count = items.length
  return (
    <ConfirmDialog
      open={count > 0}
      title={count === 1 ? `Delete "${items[0]?.title}"?` : `Delete ${count} items?`}
      description={`${count === 1 ? "It is" : "They are"} removed from this device and from every folder, and cannot be recovered. A chat that used ${count === 1 ? "it" : "them"} may stop showing ${count === 1 ? "it" : "them"}.`}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

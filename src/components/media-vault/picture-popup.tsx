import { ChevronDown, Copy, Download, FolderInput, Heart, Minus, SlidersHorizontal, Square, Trash2, Video, X } from "lucide-react"
import * as React from "react"
import { useToolHost } from "@/components/ai-tools/tool-host"
import { PictureCanvas } from "@/components/editor/picture-canvas"
import type { EditSession } from "@/components/editor/media-editor"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BUILTIN_CARDS } from "@/lib/apps/builtin-cards"
import { DEFAULT_FOLDER_ID, setItemInFolder, useFolders } from "@/lib/library/folders-store"
import { exportAs } from "@/lib/media/image-ops"
import { closeWindow, inDesktopApp, minimizeWindow, toggleMaximizeWindow } from "@/lib/window"
import { cn } from "@/lib/utils"
import type { DetailMediaItem } from "./media-detail-modal"

/**
 * The popup for a picture. It covers the whole window: the picture with its versions on the left (the original first), and on the right
 * Details (what the picture is, and what to do with it) or Edit (the edit options). The window behind is blurred like glass and the panel
 * floats on it with room on every side.
 */

interface Props {
  item: DetailMediaItem
  session: EditSession
  tab: "details" | "edit"
  onTab: (tab: "details" | "edit") => void
  onClose: () => void
  onTurnToVideo?: (item: DetailMediaItem) => void
  onRecreate?: (item: DetailMediaItem) => void
  onUseAsReference?: (item: DetailMediaItem) => void
  onDelete?: (item: DetailMediaItem) => void
}

type Format = "png" | "jpg" | "webp"
const FORMATS: Array<[Format, string, string]> = [
  ["png", "PNG", "Keeps high quality and transparent backgrounds"],
  ["jpg", "JPG", "Smaller files, a white page behind transparent parts"],
  ["webp", "WebP", "Small files that keep transparency"],
]

/** The apps a picture can start (the image cards of the Apps page); Image Edit is the Edit tab itself */
const PICTURE_APPS = BUILTIN_CARDS.filter((c) => c.category === "image" && c.id !== "image-edit")

/** A prompt with its @names marked, so a character or place reads as a tag */
function PromptText({ text }: { text: string }) {
  return (
    <p className="text-sm leading-relaxed text-foreground">
      {text.split(/(@[\w-]+)/g).map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="rounded bg-select/20 px-1 py-0.5 text-foreground">
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  )
}

export function PicturePopup({ item, session, tab, onTab, onClose, onTurnToVideo, onRecreate, onUseAsReference, onDelete }: Props) {
  const host = useToolHost()
  const { folders, members } = useFolders()
  const [liked, setLiked] = React.useState(item.activity === "liked")
  const [note, setNote] = React.useState<string | null>(null)
  const [format, setFormat] = React.useState<Format>("png")
  const [detailsOpen, setDetailsOpen] = React.useState(true)
  const say = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(null), 4000)
  }

  const download = async () => {
    try {
      const blob = await exportAs(session.current.url, format)
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `${item.title.replace(/[^\w.-]+/g, "-") || "picture"}.${format}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
      say(`Saved as ${format.toUpperCase()}.`)
    } catch (e) {
      say(e instanceof Error ? e.message : "That did not work.")
    }
  }

  const copyImage = async () => {
    try {
      const blob = await exportAs(session.current.url, "png")
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      say("Picture copied.")
    } catch {
      say("This browser cannot copy pictures.")
    }
  }

  // Moving a picture takes it out of the folders it was in and puts it in the chosen one (Default means no folder)
  const moveTo = (folderId: string, title: string) => {
    for (const f of folders) if (members[f.id]?.includes(item.id)) setItemInFolder(f.id, item.id, false)
    if (folderId !== DEFAULT_FOLDER_ID) setItemInFolder(folderId, item.id, true)
    say(`Moved to ${title}.`)
  }
  const inFolder = folders.find((f) => members[f.id]?.includes(item.id))
  const folderMenu = (
    <DropdownMenuContent align="end" side="top" className="w-56">
      <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => moveTo(DEFAULT_FOLDER_ID, "Default")}>Default</DropdownMenuItem>
      {folders.map((f) => (
        <DropdownMenuItem key={f.id} onSelect={() => moveTo(f.id, f.title)}>
          {f.title}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  )

  const rows: Array<[string, string | undefined]> = [
    ["Model", item.model],
    ["Provider", item.provider],
    ["Quality", item.quality],
    ["Size", session.size.w > 0 ? `${session.size.w}×${session.size.h}` : undefined],
    ["Shape", item.aspectRatio],
    ["Cost", item.cost],
    ["Created", item.createdAt],
    ["Saved in", inFolder ? inFolder.title : "Your Library"],
  ]
  const file = { url: session.current.url, name: item.title }
  const square = "h-9 w-9 flex-shrink-0 rounded-lg"

  return (
    <div className="fixed inset-0 z-[60] flex h-screen w-screen overflow-hidden bg-background/70 text-foreground backdrop-blur-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-50 flex h-8 items-center justify-end gap-1 px-2">
        {inDesktopApp() && (
          <div className="flex items-center gap-0.5">
            <Button type="button" variant="ghost" onClick={minimizeWindow} className="h-6 w-6 p-0 text-muted-foreground" title="Minimize" aria-label="Minimize">
              <Minus className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" onClick={toggleMaximizeWindow} className="h-6 w-6 p-0 text-muted-foreground" title="Maximize" aria-label="Maximize">
              <Square className="h-2.5 w-2.5" />
            </Button>
            <Button type="button" variant="ghost" onClick={closeWindow} className="h-6 w-6 p-0 text-muted-foreground" title="Close the app" aria-label="Close the app">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 p-4 pt-10 md:p-6 md:pt-10">
        <PictureCanvas session={session} title={item.title} onEdit={() => onTab("edit")} />
      </div>

      <aside className="my-3 mr-3 mt-9 flex w-[25rem] flex-shrink-0 flex-col rounded-2xl border border-border/60 bg-card/70 p-4 shadow-lg backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => onTab(v as "details" | "edit")} className="min-w-0 flex-1">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1 text-xs">Details</TabsTrigger>
              <TabsTrigger value="edit" className="flex-1 text-xs">Edit</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button type="button" variant="secondary" onClick={onClose} className={square} title="Close" aria-label="Close popup">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div key={tab} className="mt-3 min-h-0 flex-1 animate-fade-in space-y-3 overflow-y-auto pb-3 no-scrollbar">
          {tab === "details" ? (
            <>
              {item.prompt && (
                <div className="space-y-2 rounded-xl bg-secondary/50 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Prompt
                    </h3>
                    <Button type="button" variant="secondary" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => (void navigator.clipboard.writeText(item.prompt), say("Prompt copied."))}>
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <PromptText text={item.prompt} />
                </div>
              )}

              <div className="rounded-xl bg-secondary/50 p-3">
                <Button type="button" variant="ghost" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((o) => !o)} className="h-auto w-full justify-between p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground">
                  Details
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", detailsOpen && "rotate-180")} />
                </Button>
                {detailsOpen && (
                  <div className="mt-3 animate-fade-in space-y-2.5">
                    {rows.filter((r): r is [string, string] => Boolean(r[1])).map(([label, value]) => (
                      <DetailRow key={label} label={label} value={value} />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            session.optionsView
          )}
        </div>

        {note && <p className="pb-2 text-center text-xs text-muted-foreground">{note}</p>}

        {/* The row of actions for this picture, the same on both tabs: a wide download, then a square for each action */}
        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="secondary" className="h-9 min-w-0 flex-1 justify-between gap-2 rounded-lg px-3 text-sm">
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  {format.toUpperCase()}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-72 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Export Options</h3>
              <div className="space-y-1.5" role="radiogroup" aria-label="Format">
                {FORMATS.map(([id, label]) => (
                  <Button key={id} type="button" variant="ghost" role="radio" aria-checked={format === id} onClick={() => setFormat(id)} className="h-auto w-full justify-start gap-2 px-2 py-1.5">
                    <span className={cn("h-3.5 w-3.5 flex-shrink-0 rounded-full border", format === id ? "border-primary bg-primary" : "border-muted-foreground")} />
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{FORMATS.find(([id]) => id === format)![2]}</p>
              <Button type="button" className="w-full gap-1.5" onClick={() => void download()}>
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => (onTab("edit"), session.setOpen("upscale"))}>
                Upscale
              </Button>
            </PopoverContent>
          </Popover>
          <Button type="button" variant="secondary" aria-label={liked ? "Remove like" : "Like"} aria-pressed={liked} className={cn(square, liked && "text-destructive")} onClick={() => setLiked((l) => !l)}>
            <Heart className={cn("h-4 w-4", liked && "fill-current")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" aria-label="Move to folder" className={square}>
                <FolderInput className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            {folderMenu}
          </DropdownMenu>
          <Button type="button" variant="secondary" aria-label="Copy image" className={square} onClick={() => void copyImage()}>
            <Copy className="h-4 w-4" />
          </Button>
          {onDelete && (
            <Button type="button" variant="secondary" aria-label="Delete" className={cn(square, "hover:text-destructive")} onClick={() => onDelete(item)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {tab === "details" && (
          <div className="space-y-2 pt-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" className="h-10 w-full justify-between rounded-xl">
                  Use Image
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="max-h-96 w-80 overflow-y-auto">
                <DropdownMenuLabel>Start From This</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => (onRecreate?.(item), onClose())}>Recreate</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => (onUseAsReference?.(item), say("Set as a reference."))}>Use as reference</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Apps</DropdownMenuLabel>
                {PICTURE_APPS.map((c) => (
                  <DropdownMenuItem key={c.id} disabled={c.opens.kind === "soon"} className="justify-between" onSelect={() => host?.onUseInApp?.(c.id, file)}>
                    {c.name}
                    {c.opens.kind === "soon" && <span className="text-xs text-muted-foreground">Soon</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" className="h-10 w-full justify-start gap-2 rounded-xl" onClick={() => (onTurnToVideo?.(item), onClose())}>
              <Video className="h-4 w-4" />
              Create Video
            </Button>
          </div>
        )}
      </aside>
    </div>
  )
}

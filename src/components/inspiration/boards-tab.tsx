import * as React from "react"
import { ExternalLink, Film, ImageDown, ImagePlus, Images } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ErrorNotice } from "@/components/ui/error-notice"
import { listBoardPins, listBoards, searchMyPins } from "@/lib/integrations/pinterest"
import type { Pin, PinBoard } from "@/lib/integrations/pinterest"
import { addPinsToLibrary } from "@/lib/inspiration/to-library"
import { openExternal } from "@/lib/registry/net"
import { cn } from "@/lib/utils"
import { PinGrid, Skeletons, useLoad } from "./shared"
import type { ViewProps } from "./shared"

export interface UseRequest {
  prompt: string
  id: string
  name: string
  /** Pictures to attach as references in Create */
  images: Array<{ id: string; name: string; url: string }>
}

interface Props {
  apiKey: string
  view: ViewProps
  projectId: string
  /** Search of your own pins, already submitted */
  search: string
  onUse: (req: UseRequest) => void
  onSaved: (message: string) => void
}

/** Pinterest's own search page, for finding pins that are not yours yet. */
export const pinterestSearchUrl = (q: string) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`

const asReference = (p: Pin) => ({ id: `pinterest-${p.id}`, name: p.title, url: p.image ?? p.thumb ?? "" })

/** A picture and nothing else. Touching it lifts it a little; clicking opens it. */
function ImageTile({ pin, layoutMode, onOpen }: { pin: Pin; layoutMode: ViewProps["layoutMode"]; onOpen: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={pin.title}
      onClick={onOpen}
      className={cn(
        "group relative block h-auto w-full overflow-hidden rounded-xl border border-border bg-secondary/50 p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
        layoutMode === "masonry" && "mb-2.5 break-inside-avoid",
      )}
    >
      <div className={cn(layoutMode === "square" && "aspect-square")}>
        {pin.thumb ? <img src={pin.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn("w-full object-cover transition-transform duration-300 group-hover:scale-105", layoutMode === "square" ? "h-full" : "h-auto min-h-24")} /> : <div className="h-24" />}
      </div>
      {pin.isVideo && (
        <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
          <Film className="h-3 w-3" />
        </span>
      )}
    </Button>
  )
}

/** The picture large, with the two things to do with it. */
function Preview({ pin, onClose, onUse, onLibrary }: { pin: Pin | null; onClose: () => void; onUse: (p: Pin) => void; onLibrary: (p: Pin) => void }) {
  return (
    <Dialog open={pin !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl gap-3 p-4">
        <DialogTitle className="sr-only">{pin?.title ?? "Pin"}</DialogTitle>
        <DialogDescription className="sr-only">A pin from your Pinterest board.</DialogDescription>
        {pin && (
          <>
            <div className="flex max-h-[68vh] items-center justify-center overflow-hidden rounded-xl bg-secondary/50">
              <img src={pin.image ?? pin.thumb} alt="" referrerPolicy="no-referrer" className="max-h-[68vh] w-auto max-w-full object-contain" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {pin.link && (
                <Button type="button" variant="ghost" size="iconSm" aria-label="Open the pin on Pinterest" onClick={() => void openExternal(pin.link!)} className="mr-auto h-8 w-8">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onLibrary(pin)}>
                <ImageDown className="h-3.5 w-3.5" />
                Add to Library
              </Button>
              <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onUse(pin)}>
                <ImagePlus className="h-3.5 w-3.5" />
                Use as reference
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The row of boards, below the pictures, in the same style as the Library's folder row. */
function BoardBar({ boards, selectedId, onSelect }: { boards: PinBoard[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex h-24 shrink-0 items-center gap-3 overflow-x-auto px-8 py-2 select-none">
      {boards.map((b) => {
        const selected = b.id === selectedId
        return (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(b.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(b.id)}
            title={b.name}
            className={cn(
              "group flex h-20 w-20 shrink-0 cursor-pointer flex-col justify-between rounded-xl border bg-card p-1 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-lg",
              selected ? "border-select/60 bg-select/10 shadow-md ring-1 ring-select/20" : "border-border",
            )}
          >
            <div className="grid w-full flex-1 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg bg-secondary/40">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="relative h-full w-full overflow-hidden bg-secondary/60">
                  {b.thumbs[i] && <img src={b.thumbs[i]} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between truncate px-0.5 pt-1 text-xs font-medium text-foreground">
              <span className="truncate">{b.name}</span>
              {b.pinCount !== undefined && <span className="ml-1 shrink-0 font-mono text-xs text-muted-foreground">{b.pinCount}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Your Pinterest boards, Library style: the pictures of the chosen board above, the row of boards below. A
 * picture opens large, and from there it goes to the Library or into Create as a reference.
 */
export function BoardsTab({ apiKey, view, projectId, search, onUse, onSaved }: Props) {
  const boards = useLoad(() => listBoards(apiKey), [apiKey])
  const [boardId, setBoardId] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState<{ pins: Pin[]; bookmark?: string } | null>(null)
  const [open, setOpen] = React.useState<Pin | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)

  const all = boards.data?.boards ?? []
  const board = all.find((b) => b.id === boardId) ?? all[0] ?? null

  const first = useLoad(search ? () => searchMyPins(apiKey, search).then((pins) => ({ pins, bookmark: undefined as string | undefined })) : board ? () => listBoardPins(apiKey, board.id) : null, [apiKey, board?.id, search])
  React.useEffect(() => setPages(first.data ?? null), [first.data])
  const pins = pages?.pins ?? []

  const run = async (name: string, job: () => Promise<void>) => {
    setBusy(name)
    setProblem(null)
    try {
      await job()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  // The whole board, up to 100 pictures, into a Library folder of its name
  const addBoard = () =>
    run("board", async () => {
      if (!board) return
      let list = pins
      let bookmark = pages?.bookmark
      while (bookmark && list.length < 100) {
        const next = await listBoardPins(apiKey, board.id, bookmark)
        list = [...list, ...next.pins]
        bookmark = next.bookmark
      }
      const r = await addPinsToLibrary(list.slice(0, 100), { projectId, folderName: board.name, onProgress: (d, t) => setBusy(`board ${d}/${t}`) })
      onSaved(`${r.added} image${r.added === 1 ? "" : "s"} added to your Library in the folder "${r.folder}"${r.failed ? `, ${r.failed} could not be read` : ""}`)
    })

  const loadMore = () =>
    run("more", async () => {
      if (!board || !pages?.bookmark) return
      const next = await listBoardPins(apiKey, board.id, pages.bookmark)
      setPages({ pins: [...pages.pins, ...next.pins], bookmark: next.bookmark })
    })

  const addOne = (p: Pin) =>
    void addPinsToLibrary([p], { projectId }).then((r) => {
      onSaved(r.added ? "Image added to your Library" : "That image could not be read. Open the pin and save it from Pinterest.")
      setOpen(null)
    })

  const useOne = (p: Pin) => {
    const ref = asReference(p)
    if (ref.url) onUse({ prompt: "", id: ref.id, name: p.title, images: [ref] })
    setOpen(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-2">
        {search && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>The app can search your own pins. For pins that are not yours yet:</span>
            <Button type="button" variant="secondary" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => void openExternal(pinterestSearchUrl(search))}>
              <ExternalLink className="h-3 w-3" />
              Search "{search}" on Pinterest
            </Button>
          </div>
        )}
        {!search && board && pins.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {board.name} · {pins.length}
              {pages?.bookmark ? "+" : ""} pins
            </span>
            <Button type="button" variant="secondary" size="sm" className="h-7 gap-1.5 text-xs" disabled={busy !== null} onClick={() => void addBoard()}>
              <Images className="h-3 w-3" />
              {busy?.startsWith("board") ? `Adding ${busy.replace("board", "").trim()}` : "Add board to Library"}
            </Button>
          </div>
        )}
        {(boards.loading || first.loading) && <Skeletons />}
        {boards.error && <ErrorNotice bare fallbackTitle="Could not read your boards" message={boards.error} />}
        {first.error && <ErrorNotice bare fallbackTitle="Could not read the pins" message={first.error} />}
        {boards.data && all.length === 0 && !search && <p className="text-xs text-muted-foreground">No boards on this Pinterest account yet.</p>}
        {!first.loading && !first.error && board && pins.length === 0 && !search && <p className="text-xs text-muted-foreground">This board has no pins yet.</p>}
        {!first.loading && !first.error && search && pins.length === 0 && <p className="text-xs text-muted-foreground">None of your pins match.</p>}
        {pins.length > 0 && (
          <PinGrid view={view}>
            {pins.map((p) => (
              <ImageTile key={p.id} pin={p} layoutMode={view.layoutMode} onOpen={() => setOpen(p)} />
            ))}
          </PinGrid>
        )}
        {problem && <ErrorNotice bare fallbackTitle="Could not finish" message={problem} />}
        {!search && board && pages?.bookmark && (
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" disabled={busy !== null} onClick={() => void loadMore()}>
              {busy === "more" ? "Loading" : "Load more"}
            </Button>
          </div>
        )}
      </div>
      {all.length > 0 && <BoardBar boards={all} selectedId={board?.id ?? null} onSelect={setBoardId} />}
      <Preview pin={open} onClose={() => setOpen(null)} onUse={useOne} onLibrary={addOne} />
    </div>
  )
}

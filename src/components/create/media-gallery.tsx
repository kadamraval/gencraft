import * as React from "react"
import { AlertTriangle, Clock, Film, Image as ImageIcon, Music, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { MediaDetailModal, type DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import { ConfirmDeleteMedia, MediaTile } from "@/components/library/media-tile"
import { FolderMenu } from "./folder-menu"
import { BlankState } from "@/components/ui/blank-state"
import { MODE_INTRO } from "./mode-intro"
import { RunLogDialog } from "@/components/library/run-log-dialog"
import { aspectClassFor, gridClass, masonryClass, toDetailItem } from "@/components/library/layout-classes"
import { DEFAULT_FOLDER_ID, itemsInFolder, useFolders } from "@/lib/library/folders-store"
import { cancelQueued, describePlace, useQueuePosition } from "@/lib/run-queue"
import type { CardSizeStep, GenerationJob, LayoutMode, MediaAsset } from "@/types"
import { applyFilters } from "@/lib/library/filters"
import type { Filters } from "@/lib/library/filters"
import { useDownloaded, useLikes } from "@/lib/library/library-store"
import type { EditAction } from "@/lib/registry/edit-actions"
import { cn } from "@/lib/utils"
import { FEED_BOTTOM_PAD } from "@/lib/ui/composer-dock"

export interface PendingRun {
  id: string
  job: GenerationJob
  prompt: string
}

interface Props {
  kind: "image" | "video" | "audio"
  assets: MediaAsset[]
  pending: PendingRun[]
  layoutMode: LayoutMode
  cardSizeStep: CardSizeStep
  onReuse: (item: DetailMediaItem) => void
  /** From the opened picture: make it a video, or use it as a reference. Reuse and Recreate only bring the prompt back. */
  onTurnToVideo?: (item: DetailMediaItem) => void
  onUseAsReference?: (item: DetailMediaItem) => void
  /** What a switched-on model can do with an opened video, and starting one */
  editActions?: EditAction[]
  onEdit?: (item: DetailMediaItem, action: EditAction) => void
  onDelete: (ids: string[]) => void
  onDismiss: (id: string) => void
  /** Shown in place of the mode's own blank screen when there is nothing yet (an app has its own words for it) */
  empty?: React.ReactNode
  /** No Library folder row: the gallery is showing one app's results */
  hideFolders?: boolean
  /** The header's filters: by model, by whether it worked, and failed ones hidden */
  filters?: Filters
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

function ratioOf(aspect: string | undefined, kind: Props["kind"]): number {
  const m = aspect?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (m) return Number(m[1]) / Number(m[2])
  return kind === "video" ? 16 / 9 : 1
}

/**
 * A result that is still being made. A ring fills toward the time this model usually takes (from your own
 * earlier runs) or just turns until the first run teaches us; the clock shows time so far.
 */
function PendingTile({ run, kind }: { run: PendingRun; kind: Props["kind"] }) {
  const { job } = run
  const place = useQueuePosition(run.id)
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (job.status !== "running") return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [job.status])

  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Film : Music
  const ratio = ratioOf(job.aspectRatio, kind)

  if (job.status === "queued") {
    return (
      <div className="relative flex min-h-24 break-inside-avoid flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-border/70 bg-secondary/30 p-3 text-center" style={{ aspectRatio: String(ratio) }}>
        <Clock className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Waiting · {describePlace(place)}</p>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => cancelQueued(run.id)}>
          Cancel
        </Button>
      </div>
    )
  }

  if (job.status === "failed") {
    return (
      <div title={job.error} className="relative flex min-h-24 break-inside-avoid flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-center" style={{ aspectRatio: String(ratio) }}>
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="line-clamp-5 text-xs text-muted-foreground">{job.error}</p>
      </div>
    )
  }

  const elapsed = Math.max(0, (now - job.startedAt) / 1000)
  const expected = job.expected ? job.expected.seconds * (kind === "video" ? job.count : 1) : undefined
  const fill = expected ? Math.min(0.96, elapsed / expected) : undefined
  const radius = 18
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative flex break-inside-avoid items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-secondary/40" style={{ aspectRatio: String(ratio) }}>
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-foreground/5 via-transparent to-foreground/10" />
      <div className="relative flex flex-col items-center gap-2">
        <div className="relative h-12 w-12">
          <svg viewBox="0 0 44 44" className={cn("h-12 w-12 -rotate-90", fill === undefined && "animate-spin")}>
            <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="3" className="stroke-border" />
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              className="stroke-foreground transition-all duration-300"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - (fill ?? 0.25))}
            />
          </svg>
          <Icon className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-center font-mono text-xs text-muted-foreground">
          <div>{clock(elapsed)}</div>
          <div>{expected ? `about ${clock(expected)}` : "first run, timing next time"}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * The page for Image, Video and Audio: what you made of that kind, in the layout chosen in the view options,
 * newest first, with the run in progress as the first tile. Folders work as in the Library; Default shows all.
 */
export function MediaGallery({ kind, assets, pending, layoutMode, cardSizeStep, onReuse, onTurnToVideo, onUseAsReference, editActions, onEdit, onDelete, onDismiss, empty, hideFolders, filters }: Props) {
  const { folders, members } = useFolders()
  const [folderId, setFolderId] = React.useState(DEFAULT_FOLDER_ID)
  const [selected, setSelected] = React.useState<DetailMediaItem | null>(null)
  const [doomed, setDoomed] = React.useState<DetailMediaItem | null>(null)
  const [logItem, setLogItem] = React.useState<DetailMediaItem | null>(null)
  const activeId = folders.some((f) => f.id === folderId) ? folderId : DEFAULT_FOLDER_ID

  const liked = useLikes()
  const downloaded = useDownloaded()
  const mine = React.useMemo(
    () => applyFilters(assets.filter((a) => a.type === kind && a.source !== "uploaded" && (a.status === "completed" || a.status === "failed")).map(toDetailItem), filters ?? {}, { liked, downloaded }),
    [assets, kind, filters, liked, downloaded],
  )
  const shown = itemsInFolder(activeId, mine, members)
  const running = pending.filter((p) => p.job.kind === kind)

  const tile = (item: DetailMediaItem, extra = "") => (
    <MediaTile key={item.id} item={item} fit={layoutMode === "square" ? "square" : "natural"} ratioHint={item.aspectRatio} className={cn(aspectClassFor(layoutMode, item.aspectRatio), extra)} onOpen={() => (item.status === "failed" ? setLogItem(item) : setSelected(item))} onReuse={() => onReuse(item)} onDelete={() => setDoomed(item)} onLog={() => setLogItem(item)} />
  )
  const pendingTile = (run: PendingRun, extra = "") => (
    <div key={run.id} className={cn("group relative", extra)}>
      <PendingTile run={run} kind={kind} />
      {run.job.status === "failed" && (
        <Button type="button" variant="ghost" size="iconSm" aria-label="Dismiss" onClick={() => onDismiss(run.id)} className="absolute right-1.5 top-1.5 h-6 w-6 rounded-md bg-background/80 p-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <MediaDetailModal
        item={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onRecreate={(it) => onReuse(it)}
        onTurnToVideo={(it) => (onTurnToVideo ?? onReuse)(it)}
        onUseAsReference={(it) => (onUseAsReference ?? onReuse)(it)}
        editActions={editActions}
        onEdit={onEdit}
      />
      <RunLogDialog item={logItem} onClose={() => setLogItem(null)} onRetry={(it) => { setLogItem(null); onReuse(it) }} />
      <ConfirmDeleteMedia
        items={doomed ? [{ id: doomed.id, title: doomed.title, type: doomed.type, url: doomed.url, thumbnailUrl: doomed.thumbnailUrl }] : []}
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          if (doomed) onDelete([doomed.id])
          setDoomed(null)
        }}
      />

      {!hideFolders && (
        <div className="flex-shrink-0 px-4 pt-3">
          <FolderMenu selectedId={activeId} onSelect={setFolderId} countOf={(id) => itemsInFolder(id, mine, members).length} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-3 no-scrollbar" style={FEED_BOTTOM_PAD}>
        {shown.length === 0 && running.length === 0 && activeId === DEFAULT_FOLDER_ID ? (
          (empty ?? <BlankState {...MODE_INTRO[kind]} />)
        ) : shown.length === 0 && running.length === 0 ? (
          <EmptyState
            icon={kind === "image" ? ImageIcon : kind === "video" ? Film : Music}
            title="Nothing here yet"
            hint={activeId === DEFAULT_FOLDER_ID ? `Describe what you want below. Your ${kind}s appear here and in the Library.` : "Add items to this folder with the folder icon on any item."}
          />
        ) : layoutMode === "masonry" ? (
          <div className={masonryClass(cardSizeStep)}>
            {running.map((r) => pendingTile(r, "mb-2.5 break-inside-avoid"))}
            {shown.map((item) => tile(item, "break-inside-avoid mb-2.5"))}
          </div>
        ) : (
          <div className={cn("grid items-start", gridClass(cardSizeStep))}>
            {running.map((r) => pendingTile(r))}
            {shown.map((item) => tile(item))}
          </div>
        )}
      </div>
    </div>
  )
}

import { applyFilters } from "@/lib/library/filters"
import { useDownloaded, useLikes } from "@/lib/library/library-store"
import * as React from "react"
import { limited } from "@/lib/notice"
import { Image as ImageIcon } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { BlankState } from "@/components/ui/blank-state"
import { LIBRARY_INTRO } from "@/components/create/mode-intro"
import { Project, MediaTypeFilter, MediaStatusFilter, MediaActivityFilter, DateRangeFilter, LayoutMode, CardSizeStep, MediaAsset } from "@/types"
import { MediaDetailModal, DetailMediaItem } from "./media-detail-modal"
import type { EditAction } from "@/lib/registry/edit-actions"
import { FolderBar, type FolderCard } from "@/components/library/folder-bar"
import { ConfirmDeleteMedia, MediaTile } from "@/components/library/media-tile"
import { RunLogDialog } from "@/components/library/run-log-dialog"
import { aspectClassFor, gridClass, masonryClass, toDetailItem } from "@/components/library/layout-classes"
import { DEFAULT_FOLDER_ID, createFolder, deleteFolder, itemsInFolder, useFolders } from "@/lib/library/folders-store"

interface MediaVaultViewProps {
  type: "library" | "inspiration"
  activeProject?: Project
  onNavigateToChat: (prompt?: string) => void
  layoutMode?: LayoutMode
  cardSizeStep?: CardSizeStep
  typeFilter?: MediaTypeFilter
  modelFilter?: string
  statusFilter?: MediaStatusFilter
  hideFailed?: boolean
  activityFilter?: MediaActivityFilter
  dateRangeFilter?: DateRangeFilter
  searchQuery?: string
  /** Everything made or uploaded: the Library shows all of it in Default */
  studioAssets?: MediaAsset[]
  /** Deletes items from the device and from every folder */
  onDeleteItems?: (ids: string[]) => void
  /** Sends a generated item and its prompt back to the composer */
  onReuse?: (item: DetailMediaItem) => void
  /** What a switched-on model can do with an opened video, and starting one */
  editActions?: EditAction[]
  onEdit?: (item: DetailMediaItem, action: EditAction) => void
}

export function MediaVaultView({
  type,
  onNavigateToChat,
  layoutMode = "masonry",
  cardSizeStep = 1,
  typeFilter = "all",
  modelFilter = "all",
  statusFilter = "all",
  hideFailed = false,
  activityFilter = "all",
  dateRangeFilter = "all",
  searchQuery = "",
  studioAssets = [],
  onDeleteItems,
  onReuse,
  editActions,
  onEdit,
}: MediaVaultViewProps) {
  // Inspiration has no source yet, so it starts empty. The Library shows everything that was made or uploaded.
  const items = React.useMemo<DetailMediaItem[]>(() => (type === "library" ? studioAssets.map(toDetailItem) : []), [type, studioAssets])

  const { folders: userFolders, members } = useFolders()
  const [selectedId, setSelectedId] = React.useState(DEFAULT_FOLDER_ID)
  const activeId = userFolders.some((f) => f.id === selectedId) ? selectedId : DEFAULT_FOLDER_ID

  // Default always exists, even when empty; then the user's own folders
  const folderCards = React.useMemo<FolderCard[]>(() => {
    const card = (id: string, title: string, removable: boolean): FolderCard => {
      const mine = itemsInFolder(id, items, members)
      return { id, title, removable, count: mine.length, previews: mine.slice(0, 4).map((i) => i.thumbnailUrl).filter(Boolean) }
    }
    return [card(DEFAULT_FOLDER_ID, "Default", false), ...userFolders.map((f) => card(f.id, f.title, true))]
  }, [items, userFolders, members])

  const [selectedItem, setSelectedItem] = React.useState<DetailMediaItem | null>(null)
  const [doomed, setDoomed] = React.useState<DetailMediaItem | null>(null)
  const [logItem, setLogItem] = React.useState<DetailMediaItem | null>(null)

  const rawItems = React.useMemo(() => itemsInFolder(activeId, items, members), [activeId, items, members])

  const liked = useLikes()
  const downloaded = useDownloaded()
  const displayedItems = React.useMemo(
    () => applyFilters(rawItems, { search: searchQuery, type: typeFilter, model: modelFilter, status: statusFilter, hideFailed, activity: activityFilter, date: dateRangeFilter }, { liked, downloaded }),
    [rawItems, searchQuery, typeFilter, modelFilter, statusFilter, hideFailed, activityFilter, dateRangeFilter, liked, downloaded],
  )

  const squareGridClass = gridClass(cardSizeStep)
  const masonryColumnsClass = masonryClass(cardSizeStep)
  const aspectClass = (item: DetailMediaItem) => aspectClassFor(layoutMode, item.aspectRatio)

  const tile = (item: DetailMediaItem, extra = "") => (
    <MediaTile
      key={item.id}
      item={item}
      fit={layoutMode === "square" ? "square" : "natural"}
      ratioHint={item.aspectRatio}
      className={`${aspectClass(item)} ${extra}`}
      onOpen={() => (item.status === "failed" ? setLogItem(item) : setSelectedItem(item))}
      onLog={() => setLogItem(item)}
      onReuse={item.activity === "uploaded" || !onReuse ? undefined : () => onReuse(item)}
      onDelete={() => setDoomed(item)}
    />
  )

  return (
    <div className="relative h-full w-full flex flex-col justify-between overflow-hidden select-none">
      <MediaDetailModal
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onTurnToVideo={(it) => onNavigateToChat(`Turn into a video: ${it.prompt}`)}
        onRecreate={(it) => onNavigateToChat(it.prompt)}
        onUseAsReference={(it) => onNavigateToChat(it.prompt)}
        editActions={editActions}
        onEdit={onEdit}
      />

      <RunLogDialog item={logItem} onClose={() => setLogItem(null)} onRetry={onReuse ? (it) => { setLogItem(null); onReuse(it) } : undefined} />
      <ConfirmDeleteMedia
        items={doomed ? [{ id: doomed.id, title: doomed.title, type: doomed.type, url: doomed.url, thumbnailUrl: doomed.thumbnailUrl }] : []}
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          if (doomed) onDeleteItems?.([doomed.id])
          setDoomed(null)
        }}
      />

      {/* Upper area: the selected folder, in the chosen layout */}
      <div className="flex-1 w-full overflow-y-auto px-8 py-5 min-h-0">
        {displayedItems.length === 0 && items.length === 0 ? (
          <BlankState {...LIBRARY_INTRO} />
        ) : displayedItems.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title={items.length === 0 ? "Nothing here yet" : "No media found"}
            hint={items.length === 0 ? "Everything you generate or upload is saved here." : activeId === DEFAULT_FOLDER_ID ? "Try adjusting your filters." : "Add items to this folder with the folder icon on any item."}
          />
        ) : layoutMode === "masonry" ? (
          <div className={masonryColumnsClass}>{displayedItems.map((item) => tile(item, "break-inside-avoid mb-2.5"))}</div>
        ) : (
          <div className={`grid ${squareGridClass} items-start`}>{displayedItems.map((item) => tile(item))}</div>
        )}
      </div>

      {/* Bottom: New, then the folders. Default is always there. */}
      <FolderBar
        folders={folderCards}
        selectedId={activeId}
        onSelect={setSelectedId}
        onCreate={(title) => {
          const made = limited(() => createFolder(title))
          if (made) setSelectedId(made.id)
        }}
        onDelete={(id) => {
          deleteFolder(id)
          if (selectedId === id) setSelectedId(DEFAULT_FOLDER_ID)
        }}
      />
    </div>
  )
}

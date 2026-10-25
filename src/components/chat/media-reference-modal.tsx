import * as React from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  X,
  UploadCloud,
  Check,
  Video,
  Music,
  UserCheck,
  Search,
  Heart,
  ListFilter,
  ArrowDownUp,
  Trash2,
  Upload,
  Sparkles,
  Shapes,
  LayoutTemplate,
  Plus,
  CheckSquare,
} from "lucide-react"
import { CharacterReference, MediaAsset, Project } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { addUpload, removeUpload, toggleLike, useLikes, useUploads } from "@/lib/library/library-store"
import { noteDuplicate } from "@/lib/library/duplicate-notice"
import { createPortal } from "react-dom"
import { useFolders } from "@/lib/library/folders-store"
import { ElementBuilder } from "@/components/elements/element-builder"
import { removeElement, useElements } from "@/lib/elements/store"
import { CATEGORY_LABEL, REFERENCE_CATEGORIES, STYLE_CATEGORIES, isReferenceCategory } from "@/lib/elements/types"
import type { ElementCategory, ElementItem } from "@/lib/elements/types"
import type { SettingsState } from "@/types"
import { cn } from "@/lib/utils"

/** The five places a reference can come from. */
export type MediaModalTab = "uploads" | "created" | "elements" | "templates" | "liked"

/** Older sample data used these names; they map onto the tabs above. */
type LegacyCategory = "influencer" | "presets" | "generations"

export interface ReferenceMediaItem {
  id: string
  title: string
  type: "image" | "video" | "audio"
  url: string
  thumbnailUrl: string
  category: MediaModalTab | LegacyCategory
  duration?: number
  author?: string
  isLiked?: boolean
  characterData?: CharacterReference
}

interface MediaReferenceModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: MediaModalTab
  /** With the Element tab: the kind it opens on */
  initialCategory?: ElementCategory
  onSelectReference: (item: ReferenceMediaItem) => void
  onSelectCharacter?: (character: CharacterReference) => void
  selectedReferenceIds?: string[]
  activeCharacterId?: string
  /** What the project has made, and which projects exist. Items from the active project show first. */
  assets?: MediaAsset[]
  projects?: Project[]
  activeProjectId?: string
  /** Elements: choosing one adds it to the composer */
  onSelectElement?: (item: ElementItem) => void
  selectedElementIds?: string[]
  /** Keys decide which vision models can describe an example */
  settings?: SettingsState
  onOpenSettings?: (tab?: string) => void
  /** What the chosen model takes as references, shown above the items */
  referenceNote?: string
  /** The model takes no reference images: files stay visible but cannot be added */
  referencesLocked?: boolean
  /** Kinds of file the model cannot take, with the reason: their items show muted and cannot be added */
  unsupportedTypes?: Partial<Record<"image" | "video" | "audio", string>>
  /** Chat and Agent do not use elements */
  elementsLocked?: boolean
  /** A single slot (start frame, end frame, video, audio) takes one file, so only the first dropped file is chosen */
  singlePick?: boolean
  /** Called after uploads or elements are deleted, so the composer can drop them */
  onDeleted?: (ids: string[]) => void
  /** Above the composer when it is at the bottom; in the middle of the screen when it is docked at a side, where there is no room above it */
  placement?: "above" | "center"
}

const TABS: Array<{ id: MediaModalTab; label: string; icon: React.ElementType }> = [
  { id: "uploads", label: "Upload", icon: Upload },
  { id: "created", label: "Created", icon: Sparkles },
  { id: "elements", label: "Element", icon: Shapes },
  { id: "templates", label: "Template", icon: LayoutTemplate },
  { id: "liked", label: "Liked", icon: Heart },
]

type TypeFilter = "all" | "image" | "video" | "audio"
type SortKey = "newest" | "name"

const ALL_PROJECTS = "__all__"

export function MediaReferenceModal({
  isOpen,
  onClose,
  initialTab = "uploads",
  initialCategory,
  onSelectReference,
  onSelectCharacter,
  selectedReferenceIds = [],
  activeCharacterId,
  assets = [],
  projects = [],
  activeProjectId,
  onSelectElement,
  selectedElementIds = [],
  settings,
  onOpenSettings,
  referenceNote,
  referencesLocked,
  unsupportedTypes,
  elementsLocked,
  singlePick,
  onDeleted,
  placement = "above",
}: MediaReferenceModalProps) {
  const [tab, setTab] = React.useState<MediaModalTab>(initialTab)
  const [query, setQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")
  const [sort, setSort] = React.useState<SortKey>("newest")
  const [scope, setScope] = React.useState<string>(activeProjectId ?? ALL_PROJECTS)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const uploads = useUploads()
  const likes = useLikes()
  const { folders, members } = useFolders()
  // A Library folder (for example a Pinterest board) narrows the Upload tab to its pictures
  const [folder, setFolder] = React.useState("all")
  const allElements = useElements()
  const [category, setCategory] = React.useState<ElementCategory>("character")
  const [building, setBuilding] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [selecting, setSelecting] = React.useState(false)
  const [marked, setMarked] = React.useState<Set<string>>(new Set())
  const [confirm, setConfirm] = React.useState<{ ids: string[]; kind: "upload" | "element" } | null>(null)

  // A picture, video or sound copied anywhere (a screenshot, a file in the explorer, an image from a web page) is uploaded by pasting
  const uploadRef = React.useRef<((files: File[]) => void) | null>(null)
  React.useEffect(() => {
    if (!isOpen) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => /^(image|video|audio)\//.test(f.type))
      if (files.length === 0) return
      e.preventDefault()
      uploadRef.current?.(files)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [isOpen])

  // A click anywhere outside the gallery closes it. The buttons that open it, menus drawn over it and the
  // delete warning count as inside.
  React.useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || rootRef.current?.contains(target)) return
      if (target.closest("[data-media-trigger], [data-radix-popper-content-wrapper], [role='dialog'], [role='alertdialog'], [role='listbox']")) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirm) onClose()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [isOpen, onClose, confirm])

  React.useEffect(() => {
    setSelecting(false)
    setMarked(new Set())
  }, [tab, category, isOpen])

  React.useEffect(() => {
    if (isOpen) {
      setTab(initialTab)
      if (initialCategory) {
        setCategory(initialCategory)
        setBuilding(false)
      }
      setScope(activeProjectId ?? ALL_PROJECTS)
    }
  }, [isOpen, initialTab, initialCategory, activeProjectId])

  const inScope = React.useCallback((projectId: string | undefined) => scope === ALL_PROJECTS || !projectId || projectId === scope, [scope])

  const byTab = React.useMemo(() => {
    const uploaded: ReferenceMediaItem[] = uploads
      .filter((u) => inScope(u.projectId))
      .map((u) => ({ id: u.id, title: u.title, type: u.type, url: u.url, thumbnailUrl: u.url, category: "uploads" as const }))
    const created: ReferenceMediaItem[] = assets
      .filter((a) => a.status === "completed" && inScope(a.projectId))
      .map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        url: a.url,
        thumbnailUrl: a.thumbnailUrl || (a.type === "image" ? a.url : ""),
        category: "created" as const,
        duration: a.duration,
      }))
    // Elements (saved characters, products, places) and templates have no source yet, so they are empty rather than invented
    const elements: ReferenceMediaItem[] = allElements
      .filter((e) => e.origin !== "preset")
      .map((e) => ({ id: e.id, title: e.name, type: "image" as const, url: e.imageUrls[0] ?? "", thumbnailUrl: e.imageUrls[0] ?? "", category: "elements" as const }))
    const templates: ReferenceMediaItem[] = []
    const everything = [...uploaded, ...created, ...elements, ...templates]
    return {
      uploads: uploaded,
      created,
      elements,
      templates,
      liked: everything.filter((i) => likes.has(i.id)),
    } satisfies Record<MediaModalTab, ReferenceMediaItem[]>
  }, [uploads, assets, inScope, likes, allElements])

  if (!isOpen) return null

  /** Saves every dropped or chosen file to the library, then picks them (only the first for a single slot). */
  const uploadFiles = async (files: File[]) => {
    const usable = files.filter((f) => /^(image|video|audio)\//.test(f.type))
    if (usable.length === 0) return
    setTab("uploads")
    for (const [i, file] of usable.entries()) {
      const saved = await addUpload(file, activeProjectId ?? "none")
      noteDuplicate(saved)
      if (referencesLocked || unsupportedTypes?.[saved.type] || (singlePick && i > 0)) continue
      onSelectReference({ id: saved.id, title: saved.title, type: saved.type, url: saved.url, thumbnailUrl: saved.url, category: "uploads" })
    }
  }

  uploadRef.current = (files) => void uploadFiles(files)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Read the files before the input is cleared
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    void uploadFiles(files)
  }

  const toggleMark = (id: string) =>
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const deletable = tab === "elements" ? allElements.filter((e) => e.category === category && e.origin !== "preset").map((e) => e.id) : byTab.uploads.map((i) => i.id)

  const runDelete = async () => {
    if (!confirm) return
    for (const id of confirm.ids) {
      if (confirm.kind === "upload") await removeUpload(id)
      else await removeElement(id)
    }
    onDeleted?.(confirm.ids)
    setConfirm(null)
    setMarked(new Set())
    setSelecting(false)
  }

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const items = byTab[tab]
    .filter((i) => typeFilter === "all" || i.type === typeFilter)
    .filter((i) => tab !== "uploads" || folder === "all" || (members[folder] ?? []).includes(i.id))
    .filter((i) => tokens.every((t) => i.title.toLowerCase().includes(t)))
    .sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : 0))

  const otherProject = scope !== ALL_PROJECTS && scope !== activeProjectId

  const panel = (
    <div
      ref={rootRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void uploadFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn(placement === "center" ? "relative z-[71] flex h-[min(34rem,82vh)] w-[min(60rem,94vw)]" : "absolute bottom-full left-4 right-4 z-50 mb-3 flex h-96", "overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150")}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-select/50 bg-card/90">
          <UploadCloud className="h-6 w-6 text-foreground" />
          <span className="text-xs font-medium text-foreground">{singlePick ? "Drop a file to use it" : "Drop images, video or audio to upload"}</span>
        </div>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={`Delete ${confirm?.ids.length} ${confirm?.kind === "element" ? "element" : "upload"}${confirm && confirm.ids.length > 1 ? "s" : ""}?`}
        description="They are removed from this device and cannot be recovered. Anything that used them may stop showing them."
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runDelete()}
      />
      {/* Left: where the reference comes from */}
      <div className="flex w-40 flex-shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/70 bg-secondary/20 p-2 no-scrollbar">
        {TABS.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant={tab === t.id ? "secondary" : "ghost"}
            onClick={() => setTab(t.id)}
            className={cn("h-9 w-full justify-between px-2.5", tab === t.id && "text-foreground")}
          >
            <span className="flex items-center gap-2">
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{byTab[t.id].length}</span>
          </Button>
        ))}
        {tab === "elements" && (
          <div className="mt-1 flex flex-col gap-0.5 border-t border-border/50 pt-1.5">
            {[...REFERENCE_CATEGORIES, ...STYLE_CATEGORIES].map((c) => (
              <Button
                key={c}
                type="button"
                variant="ghost"
                onClick={() => {
                  setCategory(c)
                  setBuilding(false)
                }}
                className={cn("h-7 w-full justify-between px-2.5 text-xs", category === c ? "bg-secondary text-foreground" : "text-muted-foreground")}
              >
                {CATEGORY_LABEL[c]}
                <span className="font-mono">{allElements.filter((e) => e.category === c).length}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Right: search, filter, sort, items */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-border/70 p-2">
          {tab !== "elements" && (
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger aria-label="Project" className="h-8 w-40 flex-shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeProjectId && (
                <SelectItem value={activeProjectId} className="text-xs">
                  This project
                </SelectItem>
              )}
              {projects
                .filter((p) => p.id !== activeProjectId)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.title}
                  </SelectItem>
                ))}
              <SelectItem value={ALL_PROJECTS} className="text-xs">
                All projects
              </SelectItem>
            </SelectContent>
          </Select>
          )}

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-8 pl-8 text-xs" />
          </div>

          {tab !== "elements" && (
            <>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" variant={typeFilter !== "all" ? "secondary" : "ghost"} size="icon" aria-label="Filter">
                    <ListFilter className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Filter by type</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-40 p-1">
              {(["all", "image", "video", "audio"] as const).map((t) => (
                <Button key={t} type="button" variant="ghost" size="sm" onClick={() => setTypeFilter(t)} className={cn("h-8 w-full justify-between capitalize", typeFilter === t && "bg-secondary text-foreground")}>
                  {t === "all" ? "All types" : `${t}s`}
                  {typeFilter === t && <Check className="h-3.5 w-3.5" />}
                </Button>
              ))}
            </PopoverContent>
          </Popover>

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Sort">
                    <ArrowDownUp className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Sort</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-40 p-1">
              {([
                ["newest", "Newest"],
                ["name", "Name A to Z"],
              ] as const).map(([key, label]) => (
                <Button key={key} type="button" variant="ghost" size="sm" onClick={() => setSort(key)} className={cn("h-8 w-full justify-between", sort === key && "bg-secondary text-foreground")}>
                  {label}
                  {sort === key && <Check className="h-3.5 w-3.5" />}
                </Button>
              ))}
            </PopoverContent>
          </Popover>
            </>
          )}

          {(tab === "uploads" || (tab === "elements" && !building)) && deletable.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={selecting ? "secondary" : "ghost"}
                  size="icon"
                  aria-label="Select to delete"
                  onClick={() => {
                    setSelecting((v) => !v)
                    setMarked(new Set())
                  }}
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select several to delete</TooltipContent>
            </Tooltip>
          )}
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {referenceNote && <p className="border-b border-border/50 px-3 py-1 text-xs text-muted-foreground">{referenceNote}</p>}
        {otherProject && <p className="border-b border-border/50 px-3 py-1 text-xs text-muted-foreground">Showing items from another project.</p>}
        {tab === "uploads" && folders.some((f) => byTab.uploads.some((i) => (members[f.id] ?? []).includes(i.id))) && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-border/50 px-3 py-1.5 no-scrollbar">
            {[{ id: "all", title: "All uploads", count: byTab.uploads.length }, ...folders.map((f) => ({ id: f.id, title: f.title, count: byTab.uploads.filter((i) => (members[f.id] ?? []).includes(i.id)).length })).filter((f) => f.count > 0)].map((f) => (
              <Button
                key={f.id}
                type="button"
                variant="ghost"
                onClick={() => setFolder(f.id)}
                className={cn("h-7 flex-shrink-0 rounded-full border px-2.5 text-xs font-normal", folder === f.id ? "border-select/60 bg-select/15 text-foreground hover:bg-select/20" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {f.title} <span className="ml-1 opacity-60">{f.count}</span>
              </Button>
            ))}
          </div>
        )}

        {tab === "elements" ? (
          building ? (
            <ElementBuilder
              category={category}
              settings={settings}
              onOpenSettings={onOpenSettings}
              onCancel={() => setBuilding(false)}
              onSaved={(item) => {
                setBuilding(false)
                onSelectElement?.(item)
              }}
            />
          ) : (
            <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-y-auto p-2 no-scrollbar md:grid-cols-4 lg:grid-cols-5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setBuilding(true)}
                className="aspect-[4/3] h-auto flex-col gap-1.5 rounded-xl border border-dashed border-border/80 bg-secondary/20"
              >
                <Plus className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">New {CATEGORY_LABEL[category].toLowerCase()}</span>
              </Button>
              {allElements
                .filter((e) => e.category === category)
                .filter((e) => tokens.every((t) => `${e.name} ${e.text}`.toLowerCase().includes(t)))
                .map((e) => {
                  const picked = selectedElementIds.includes(e.id)
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (selecting) {
                          if (e.origin !== "preset") toggleMark(e.id)
                          return
                        }
                        if (!elementsLocked) onSelectElement?.(e)
                      }}
                      onKeyDown={(ev) => ev.key === "Enter" && !elementsLocked && onSelectElement?.(e)}
                      className={cn(
                        "group relative aspect-[4/3] select-none overflow-hidden rounded-xl border bg-secondary/40 transition-all",
                        elementsLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        picked ? "border-select/60 bg-select/10 ring-1 ring-select/30" : "border-border/50 hover:border-border",
                      )}
                    >
                      {isReferenceCategory(e.category) ? (
                        <img src={e.imageUrls[0]} alt={e.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full flex-col justify-between p-2">
                          <span className="text-xs font-semibold text-foreground">{e.name}</span>
                          <span className="line-clamp-4 text-xs leading-snug text-muted-foreground">{e.text}</span>
                        </div>
                      )}
                      {isReferenceCategory(e.category) && (
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-background/90 to-transparent p-1.5">
                          <span className="truncate text-xs font-medium text-foreground">{e.name}</span>
                          {e.imageUrls.length > 1 && <span className="font-mono text-xs text-muted-foreground">{e.imageUrls.length}</span>}
                        </div>
                      )}
                      {selecting && e.origin !== "preset" && (
                        <div className={cn("absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border", marked.has(e.id) ? "border-select bg-select text-background" : "border-select/60 bg-background/70")}>
                          {marked.has(e.id) && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                        </div>
                      )}
                      {!selecting && picked && (
                        <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shadow-md">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      )}
                      {e.origin !== "preset" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          aria-label="Delete element"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setConfirm({ ids: [e.id], kind: "element" })
                          }}
                          className="absolute bottom-1 right-1 h-5 w-5 p-0 opacity-0 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        ) : (
        <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-y-auto p-2 no-scrollbar md:grid-cols-4 lg:grid-cols-5">
          {tab === "uploads" && (
            <Button
              type="button"
              variant="ghost"
              disabled={referencesLocked}
              onClick={() => fileInputRef.current?.click()}
              className="aspect-[4/3] h-auto flex-col gap-1.5 rounded-xl border border-dashed border-border/80 bg-secondary/20"
            >
              <UploadCloud className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Upload</span>
              <span className="text-xs text-muted-foreground">or paste</span>
              <input ref={fileInputRef} type="file" hidden multiple accept="image/*,video/*,audio/*" onChange={handleFile} />
            </Button>
          )}

          {items.length === 0 && tab !== "uploads" && (
            <p className="col-span-full py-12 text-center text-xs text-muted-foreground">
              {tab === "created"
                ? "Nothing created in this project yet."
                : tab === "liked"
                  ? "Heart an item to keep it here."
                  : "No templates yet."}
            </p>
          )}

          {items.map((item) => {
            const selected = selectedReferenceIds.includes(item.id)
            const characterActive = activeCharacterId && item.characterData && activeCharacterId === item.characterData.id
            const liked = likes.has(item.id)
            // A kind the model cannot take is muted, with the reason on hover
            const mutedReason = unsupportedTypes?.[item.type as "image" | "video" | "audio"]
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                title={mutedReason ? `${item.type === "video" ? "Video" : item.type === "audio" ? "Audio" : "Image"}: ${mutedReason}` : undefined}
                aria-disabled={Boolean(mutedReason) || undefined}
                onClick={() => {
                  if (selecting) {
                    if (item.category === "uploads") toggleMark(item.id)
                    return
                  }
                  if (referencesLocked || mutedReason) return
                  if (item.characterData && onSelectCharacter) onSelectCharacter(item.characterData)
                  onSelectReference(item)
                }}
                onKeyDown={(e) => e.key === "Enter" && !mutedReason && onSelectReference(item)}
                className={cn(
                  "group relative aspect-[4/3] select-none overflow-hidden rounded-xl border bg-secondary/40 transition-all",
                  referencesLocked || mutedReason ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                  selected || characterActive ? "border-select/60 bg-select/10 ring-1 ring-select/30" : "border-border/50 hover:border-border",
                )}
              >
                {item.type === "audio" || !(item.thumbnailUrl || item.url) ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-secondary/60 p-2 text-center">
                    {item.type === "video" ? <Video className="h-6 w-6 opacity-80" /> : <Music className="h-6 w-6 opacity-80" />}
                    <span className="max-w-full truncate text-xs font-medium text-foreground">{item.title}</span>
                  </div>
                ) : item.type === "video" && !item.thumbnailUrl ? (
                  <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  <img src={item.thumbnailUrl || item.url} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                )}

                {item.type === "video" && (
                  <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded border border-border/50 bg-background/80 px-1.5 py-0.5 font-mono text-xs backdrop-blur-sm">
                    <Video className="h-2.5 w-2.5" />
                    {item.duration ? `${item.duration}s` : ""}
                  </div>
                )}
                {item.characterData && (
                  <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded border border-border/50 bg-background/80 px-1.5 py-0.5 text-xs font-medium backdrop-blur-sm">
                    <UserCheck className="h-2.5 w-2.5" />@{item.characterData.name}
                  </div>
                )}
                {selecting && item.category === "uploads" && (
                  <div className={cn("absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border", marked.has(item.id) ? "border-select bg-select text-background" : "border-select/60 bg-background/70")}>
                    {marked.has(item.id) && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </div>
                )}
                {!selecting && (selected || characterActive) && (
                  <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shadow-md">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-background/90 via-background/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="truncate text-xs font-medium leading-tight text-foreground">{item.title}</span>
                  <span className="flex flex-shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      aria-label={liked ? "Remove from liked" : "Like"}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLike(item.id)
                      }}
                      className="h-5 w-5 p-0"
                    >
                      <Heart className={cn("h-3 w-3", liked && "fill-current")} />
                    </Button>
                    {item.category === "uploads" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        aria-label="Delete upload"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirm({ ids: [item.id], kind: "upload" })
                        }}
                        className="h-5 w-5 p-0 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        )}

        {selecting && (
          <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">{marked.size} selected</span>
            <span className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setMarked(new Set(deletable))}>
                Select all
              </Button>
              <Button type="button" variant="secondary" size="sm" className="text-destructive" disabled={marked.size === 0} onClick={() => setConfirm({ ids: [...marked], kind: tab === "elements" ? "element" : "upload" })}>
                Delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelecting(false)
                  setMarked(new Set())
                }}
              >
                Done
              </Button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
  if (placement !== "center") return panel
  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/60 p-4 backdrop-blur-[2px]">{panel}</div>, document.body)
}

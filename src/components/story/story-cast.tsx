import * as React from "react"
import { Box, ImagePlus, MapPin, Package, Pencil, Plus, Star, Tag, Trash2, User, X, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { askYesNo, showNotice } from "@/lib/notice"
import { cn } from "@/lib/utils"
import type { CastItem, StoryItem } from "./types"

/** The groups every story starts with. "+" adds more (Product, or any name). */
export const CAST_GROUPS = ["Character", "Location", "Props"]

const GROUP_ICON: Record<string, LucideIcon> = { Character: User, Location: MapPin, Props: Box, Product: Package }
const iconFor = (group: string): LucideIcon => GROUP_ICON[group] ?? Tag

const CAST_COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#F43F5E", "#06B6D4"] // allow-color

/** A picture from the computer, made small (512 pixels, JPEG) so the story stays small on this device */
function shrinkPicture(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("The picture could not be read."))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("That file is not a picture."))
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("The picture could not be made smaller."))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg", 0.86))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

interface Draft {
  name: string
  color: string
  role: string
  describe: string
}

/** The popup for a new cast item, or for editing one: name, colour, role and a description */
function CastDialog({ group, initial, onClose, onSave }: { group: string; initial?: CastItem; onClose: () => void; onSave: (draft: Draft) => void }) {
  const [draft, setDraft] = React.useState<Draft>(() => ({
    name: initial?.name ?? "",
    color: initial?.color ?? CAST_COLORS[0]!,
    role: initial?.role ?? "",
    describe: initial?.describe ?? "",
  }))
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const noun = group.toLowerCase()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
          <DialogDescription>Name it, pick a colour, and say what it is in this story.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim(), role: draft.role.trim(), describe: draft.describe.trim() })
          }}
          className="space-y-3"
        >
          <Input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name" aria-label="Name" className="h-8 text-xs font-semibold" />
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Colour</span>
            <div className="flex items-center gap-2">
              {CAST_COLORS.map((col) => (
                <Button
                  key={col}
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => set({ color: col })}
                  aria-label={`Colour ${col}`}
                  aria-pressed={draft.color === col}
                  className={cn("h-6 w-6 rounded-full border p-0 transition-all", draft.color === col ? "scale-110 border-select" : "border-border/60")}
                  style={{ background: col }}
                />
              ))}
            </div>
          </div>
          <Input value={draft.role} onChange={(e) => set({ role: e.target.value })} placeholder={group === "Character" ? "Role, e.g. Lead, Villain, Background" : "Role in the story"} aria-label="Role" className="h-8 text-xs" />
          <Textarea value={draft.describe} onChange={(e) => set({ describe: e.target.value })} rows={4} placeholder="Describe it: how it looks, what it is like, what it wants." aria-label="Describe" className="resize-none text-xs leading-relaxed" />
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!draft.name.trim()} className="h-7 px-3 text-xs font-semibold">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The "+" beside the groups: Product, or a name of the user's own */
function AddGroup({ existing, onAdd }: { existing: string[]; onAdd: (name: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const add = (value: string) => {
    const clean = value.trim()
    if (!clean) return
    onAdd(clean)
    setName("")
    setOpen(false)
  }
  const usual = ["Product"].filter((g) => !existing.includes(g))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="Add another kind of cast" className="h-8 w-8 rounded-full">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64 space-y-2 p-2">
        {usual.map((g) => {
          const Icon = iconFor(g)
          return (
            <Button key={g} type="button" variant="ghost" size="sm" onClick={() => add(g)} className="h-8 w-full justify-start gap-2 px-2 text-xs">
              <Icon className="h-3.5 w-3.5" />
              {g}
            </Button>
          )
        })}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add(name)
          }}
          className="flex gap-1.5"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Or your own, e.g. Vehicles" aria-label="Your own kind of cast" className="h-8 text-xs" />
          <Button type="submit" size="sm" disabled={!name.trim()} className="h-8 text-xs">
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** One cast item as a row: colour dot, name and role on top; its pictures in a square strip below */
function CastRow({
  item,
  takes,
  onEdit,
  onRemove,
  onFinal,
  onPictures,
}: {
  item: CastItem
  takes: string[]
  onEdit: () => void
  onRemove: () => void
  onFinal: () => void
  onPictures: (urls: string[]) => void
}) {
  const file = React.useRef<HTMLInputElement>(null)

  const upload = async (picked: File | undefined) => {
    if (!picked) return
    try {
      onPictures([...item.images, await shrinkPicture(picked)])
    } catch (e) {
      showNotice(e instanceof Error ? e.message : "The picture could not be added.")
    } finally {
      if (file.current) file.current.value = ""
    }
  }

  return (
    <section className="group rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: item.color }} aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">{item.name}</span>
        {item.role && <span className="truncate text-xs text-muted-foreground">{item.role}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onFinal}
            aria-pressed={Boolean(item.final)}
            aria-label={item.final ? `${item.name} is on the overview. Take it off` : `Show ${item.name} on the overview`}
            className={cn("h-7 gap-1 px-2 text-xs", item.final ? "text-foreground" : "text-muted-foreground")}
          >
            <Star className={cn("h-3.5 w-3.5", item.final && "fill-current")} />
            <span>{item.final ? "On overview" : "Overview"}</span>
          </Button>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${item.name}`} className="h-7 w-7 text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${item.name}`} className="h-7 w-7 text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
      {item.describe && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.describe}</p>}

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {item.images.map((src, i) => (
          <div key={`${item.id}-${i}`} className="group/pic relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-border/60 bg-secondary/30">
            <img src={src} alt={`${item.name}, picture ${i + 1}`} className="h-full w-full object-cover" />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => onPictures(item.images.filter((_, k) => k !== i))}
              aria-label="Remove this picture"
              className="absolute right-1 top-1 h-6 w-6 p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/pic:opacity-100"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" aria-label="Add a picture" className="h-24 w-24 flex-shrink-0 flex-col gap-1 rounded-xl border border-dashed border-border/70 p-0 text-muted-foreground">
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs">Picture</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2 p-2">
            <Button variant="secondary" size="sm" onClick={() => file.current?.click()} className="h-8 w-full justify-start gap-2 text-xs">
              <ImagePlus className="h-3.5 w-3.5" />
              Upload a picture
            </Button>
            {takes.length > 0 && (
              <>
                <p className="px-1 text-xs text-muted-foreground">Or a picture made in a beat</p>
                <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
                  {takes.slice(0, 24).map((url) => (
                    <Button key={url} variant="ghost" onClick={() => onPictures([...item.images, url])} className="aspect-square h-auto w-full overflow-hidden rounded-md border border-border/60 p-0">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </Button>
                  ))}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
        <Input ref={file} type="file" accept="image/*" aria-label="Upload a picture" onChange={(e) => void upload(e.target.files?.[0])} className="hidden" />
      </div>
    </section>
  )
}

interface Props {
  story: StoryItem
  onUpdate: (patch: Partial<StoryItem>) => void
  /** Pictures made in the beats, offered as pictures for the cast */
  takes: string[]
}

/**
 * The Cast page: the characters, places and props of the story. The kinds are at the top centre (with "+" for a
 * product or a name of the user's own); under them, one row for each item with its colour, role, description and
 * pictures.
 */
export function StoryCast({ story, onUpdate, takes }: Props) {
  const groups = story.castGroups ?? CAST_GROUPS
  const cast = story.cast ?? []
  const [picked, setPicked] = React.useState(groups[0]!)
  const group = groups.includes(picked) ? picked : groups[0]!
  const [dialog, setDialog] = React.useState<{ item?: CastItem } | null>(null)
  const items = cast.filter((c) => c.group === group)

  const saveCast = (next: CastItem[]) => onUpdate({ cast: next })

  const addGroup = (name: string) => {
    const same = groups.find((g) => g.toLowerCase() === name.toLowerCase())
    if (same) {
      setPicked(same)
      return
    }
    onUpdate({ castGroups: [...groups, name] })
    setPicked(name)
  }

  const save = (draft: Draft) => {
    if (dialog?.item) {
      const id = dialog.item.id
      saveCast(cast.map((c) => (c.id === id ? { ...c, ...draft } : c)))
    } else {
      saveCast([...cast, { id: `cast-${Date.now().toString(36)}`, group, images: [], ...draft }])
    }
    setDialog(null)
  }

  const remove = async (item: CastItem) => {
    if (!(await askYesNo(`Remove ${item.name}?`, "It is taken out of the cast. Its pictures are removed with it."))) return
    saveCast(cast.filter((c) => c.id !== item.id))
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar animate-fade-in">
      <div className="mx-auto max-w-3xl space-y-5 px-6 pb-16 pt-6">
        {/* The kinds of cast, at the top centre */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {groups.map((g) => {
            const Icon = iconFor(g)
            const active = g === group
            const count = cast.filter((c) => c.group === g).length
            return (
              <Button
                key={g}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPicked(g)}
                aria-pressed={active}
                className={cn(
                  "h-8 gap-1.5 rounded-full border px-3 text-xs",
                  active ? "border-select/60 bg-select/10 font-semibold text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{g}</span>
                <span className="font-mono text-muted-foreground">{count}</span>
              </Button>
            )
          })}
          <AddGroup existing={groups} onAdd={addGroup} />
        </div>

        {/* The items of that kind: one row each */}
        <div className="space-y-3">
          {items.length === 0 && <p className="text-center text-xs text-muted-foreground">No {group.toLowerCase()} yet.</p>}
          {items.map((item) => (
            <CastRow
              key={item.id}
              item={item}
              takes={takes}
              onEdit={() => setDialog({ item })}
              onRemove={() => void remove(item)}
              onFinal={() => saveCast(cast.map((c) => (c.id === item.id ? { ...c, final: !c.final } : c)))}
              onPictures={(urls) => saveCast(cast.map((c) => (c.id === item.id ? { ...c, images: urls } : c)))}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDialog({})}
            className="h-12 w-full gap-2 rounded-2xl border border-dashed border-border/70 text-xs font-semibold text-muted-foreground"
          >
            <Plus className="h-4 w-4" />
            Add {group.toLowerCase()}
          </Button>
        </div>
      </div>

      {dialog && <CastDialog group={group} initial={dialog.item} onClose={() => setDialog(null)} onSave={save} />}
    </div>
  )
}

import * as React from "react"
import { Clapperboard, Film, Layers, PenLine, Plus, Trash2 } from "lucide-react"
import { BlankState } from "@/components/ui/blank-state"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { askYesNo } from "@/lib/notice"
import { cn } from "@/lib/utils"
import { DEFAULT_STORY_ICON, STORY_ICONS, storyIcon } from "./story-icons"
import type { StoryItem } from "./types"

export interface NewStory {
  title: string
  icon: string
  genre: string
  logline: string
}

interface Props {
  stories: StoryItem[]
  onOpen: (id: string) => void
  onCreate: (story: NewStory) => void
  onDelete: (id: string) => void
}

const INTRO = {
  art: { image: "08_story.png" },
  title: "Story",
  line: "Turn an idea into scenes, beats and a finished film.",
  steps: [
    { icon: PenLine, title: "Name your story", text: "Pick a logo and a name. A one-line premise helps the agent." },
    { icon: Layers, title: "Plan scenes and beats", text: "Each beat has its own prompt, references, camera and light." },
    { icon: Film, title: "Make it and cut it", text: "Generate every beat, then put them together in Edit." },
  ],
} as const

/** The window that asks for a logo and a name (and, if wanted, a genre and a premise). */
function NewStoryDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (s: NewStory) => void }) {
  const [title, setTitle] = React.useState("")
  const [icon, setIcon] = React.useState(DEFAULT_STORY_ICON)
  const [genre, setGenre] = React.useState("")
  const [logline, setLogline] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setTitle("")
      setIcon(DEFAULT_STORY_ICON)
      setGenre("")
      setLogline("")
    }
  }, [open])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onCreate({ title: title.trim(), icon, genre: genre.trim(), logline: logline.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New story</DialogTitle>
          <DialogDescription>Pick a logo and give it a name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Logo">
            {Object.entries(STORY_ICONS).map(([key, Icon]) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                role="radio"
                aria-checked={icon === key}
                aria-label={key}
                onClick={() => setIcon(key)}
                className={cn("h-9 w-full rounded-lg border p-0", icon === key ? "border-select/60 bg-select/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground")}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Story name" aria-label="Story name" className="h-9 text-sm font-semibold" />
          <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Genre (optional)" aria-label="Genre" className="h-8 text-xs" />
          <Textarea value={logline} onChange={(e) => setLogline(e.target.value)} placeholder="One-line premise (optional)" aria-label="Premise" rows={2} className="resize-none text-xs" />
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim()} className="h-8 px-4 text-xs font-semibold">
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const shotCount = (s: StoryItem) => s.scenes.reduce((n, sc) => n + sc.shots.length, 0)
const coverOf = (s: StoryItem): string | undefined => s.scenes.flatMap((sc) => sc.shots).flatMap((sh) => sh.generatedSlots).find((slot) => slot.url)?.url
const ago = (t: number) => {
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} d ago`
}

/**
 * The Story page before a story is opened. With no story it is the shared blank state and one Add new button.
 * Once there are stories it is laid out like the Library: a grid of cards, newest first.
 */
export function StoryLibrary({ stories, onOpen, onCreate, onDelete }: Props) {
  const [creating, setCreating] = React.useState(false)

  const create = (s: NewStory) => {
    onCreate(s)
    setCreating(false)
  }

  const remove = async (s: StoryItem) => {
    const yes = await askYesNo("Delete this story?", `"${s.title}" and all its scenes and beats will be removed from this device.`)
    if (yes) onDelete(s.id)
  }

  const addButton = (
    <Button type="button" onClick={() => setCreating(true)} className="h-9 gap-2 rounded-xl px-5 text-xs font-semibold">
      <Plus className="h-4 w-4" />
      Add new
    </Button>
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full w-full flex-col overflow-y-auto px-8 pb-24 pt-4 no-scrollbar">
        <NewStoryDialog open={creating} onClose={() => setCreating(false)} onCreate={create} />

        {stories.length === 0 ? (
          <div className="flex flex-1 items-center">
            <BlankState {...INTRO} art={INTRO.art} steps={[...INTRO.steps]} action={addButton} />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-foreground">Stories</h2>
                <span className="font-mono text-xs text-muted-foreground">{stories.length}</span>
              </div>
              {addButton}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {stories.map((s) => {
                const Icon = storyIcon(s.icon)
                const cover = coverOf(s)
                return (
                  <div key={s.id} className="group relative">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onOpen(s.id)}
                      className="flex h-auto w-full flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-2xl border border-border/70 bg-card p-0 text-left font-normal transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-lg"
                    >
                      <span className="relative flex aspect-video items-center justify-center bg-secondary/40">
                        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Clapperboard className="h-8 w-8 text-muted-foreground/40" />}
                        <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm">
                          <Icon className="h-4 w-4" />
                        </span>
                      </span>
                      <span className="block space-y-0.5 p-3">
                        <span className="block truncate text-xs font-semibold text-foreground">{s.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.genre || "No genre"}</span>
                        <span className="block font-mono text-xs text-muted-foreground/70">
                          {s.scenes.length} {s.scenes.length === 1 ? "scene" : "scenes"} · {shotCount(s)} {shotCount(s) === 1 ? "beat" : "beats"} · {ago(s.updatedAt)}
                        </span>
                      </span>
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${s.title}`}
                          onClick={() => void remove(s)}
                          className="absolute right-2 top-2 h-7 w-7 rounded-lg bg-background/80 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Delete</TooltipContent>
                    </Tooltip>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

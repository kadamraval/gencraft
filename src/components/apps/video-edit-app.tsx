import { ArrowLeft, Plus } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { VideoEditor } from "@/components/story/video-editor"
import { EMPTY_PROJECT, type EditProject } from "@/components/story/edit-model"
import { loadStories, saveStories } from "@/components/story/story-storage"
import type { StoryItem } from "@/components/story/types"
import type { AgentRuntime } from "@/lib/agent/chat"
import type { MediaAsset, Project, SettingsState } from "@/types"
import { cn } from "@/lib/utils"

/**
 * Video Edit: the Story timeline editor on its own page, with no story sidebar. A cut made here is kept with the stories (a story with no
 * script or shots, only its edit), so it also opens in Story, and a story's cut opens here.
 */

export interface VideoEditDeps {
  library: { assets: MediaAsset[]; projects: Project[]; activeProjectId?: string }
  settings: SettingsState
  onOpenSettings?: (tab?: string) => void
  onGenerateText?: (prompt: string) => Promise<string>
  getAgentRuntime?: () => AgentRuntime
}

/** A cut with no script: a story that holds only its edit, starting with the given clip when there is one */
export function newEditOnlyStory(clip?: { url: string; name: string; seconds?: number }): StoryItem {
  const now = Date.now()
  const edit: EditProject = clip
    ? { ...EMPTY_PROJECT, clips: [{ id: `clip-${now}`, shotId: "", take: 0, duration: Math.max(1, clip.seconds ?? 5), trimIn: 0, src: { url: clip.url, type: "video", name: clip.name } }] }
    : { ...EMPTY_PROJECT }
  return { id: `edit-${now}`, title: clip ? clip.name : `Video edit ${new Date(now).toLocaleDateString()}`, icon: "film", genre: "", logline: "", screenplay: "", scenes: [], edit, createdAt: now, updatedAt: now }
}

/** Keeps a new cut with the stories and returns its id */
export function saveNewCut(story: StoryItem): string {
  saveStories([story, ...loadStories()])
  return story.id
}

const hasCut = (s: StoryItem) => (s.edit?.clips.length ?? 0) > 0 || (s.edit?.audio.length ?? 0) > 0

export function VideoEditApp({ deps, openId, onBack }: { deps: VideoEditDeps; openId?: string; onBack: () => void }) {
  const [stories, setStories] = React.useState<StoryItem[]>(loadStories)
  const [activeId, setActiveId] = React.useState<string | undefined>(openId)
  const active = stories.find((s) => s.id === activeId)

  // Each change is kept right away, so Story sees the same cut
  const update = (id: string, edit: EditProject) =>
    setStories((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, edit, updatedAt: Date.now() } : s))
      saveStories(next)
      return next
    })

  const startNew = () => {
    const story = newEditOnlyStory()
    saveNewCut(story)
    setStories(loadStories())
    setActiveId(story.id)
  }

  if (active) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 px-4 pb-1 pt-3">
          <Button type="button" variant="ghost" size="icon" aria-label="Back" onClick={() => (openId ? onBack() : setActiveId(undefined))} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Video Edit</span>
        </div>
        <div className="min-h-0 flex-1">
          <VideoEditor
            key={active.id}
            story={active}
            onChange={(edit) => update(active.id, edit)}
            onGenerateText={deps.onGenerateText}
            library={deps.library}
            settings={deps.settings}
            onOpenSettings={deps.onOpenSettings}
            getAgentRuntime={deps.getAgentRuntime}
          />
        </div>
      </div>
    )
  }

  const cuts = stories.filter(hasCut)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-6 pb-2 pt-5">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" aria-label="Back to apps" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold text-foreground">Video Edit</h1>
        </div>
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={startNew}>
          <Plus className="h-3.5 w-3.5" /> New cut
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 no-scrollbar">
        {cuts.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-foreground">No cuts yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">Start a new cut, then add clips from your Library. Cuts from your stories show here too.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {cuts.map((s) => (
              <Button key={s.id} type="button" variant="ghost" onClick={() => setActiveId(s.id)} className={cn("h-auto flex-col items-stretch gap-2 whitespace-normal rounded-2xl p-1.5 hover:bg-secondary")}>
                <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-secondary/60">
                  {s.cover ? <img src={s.cover} alt="" className="h-full w-full object-cover" /> : <span className="line-clamp-2 px-3 text-center text-xs text-muted-foreground">{s.title}</span>}
                </span>
                <span className="line-clamp-1 w-full px-1 text-left text-xs font-medium text-foreground">{s.title}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

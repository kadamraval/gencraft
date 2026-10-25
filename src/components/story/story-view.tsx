import { AgentAside, AgentDivider } from "@/components/layout/agent-aside"
import * as React from "react"
import {
  Plus,
  Film,
  Image as ImageIcon,
  Sparkles,
  Check,
  FileText,
  Scissors,
  Camera,
  Sun,
  User,
  MapPin,
  Box,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  LayoutGrid,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { CharacterReference, GenerationMode, VideoSceneBeat } from "@/types"
import { DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChatInput } from "@/components/chat/chat-input"
import { ComposerSlot } from "@/components/chat/composer-slot"
import { useComposerDock } from "@/lib/ui/composer-dock"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useListedModels } from "@/lib/registry/store"
import { StoryLibrary, type NewStory } from "./story-library"
import { loadStories, saveStories } from "./story-storage"
import { storyIcon } from "./story-icons"
import type { ScriptEditorHandle } from "./script-editor"
import { ScriptTab } from "./script-view"
import { StoryOverview } from "./story-overview"
import { StoryCast } from "./story-cast"
import { VideoEditor, type VideoEditorHandle } from "./video-editor"
import type { ScriptScene } from "./fountain"
import { storyBrandContext } from "@/lib/brand/story-brand"
import { showNotice } from "@/lib/notice"
import type { SceneItem, ShotItem, StoryItem } from "./types"

interface StoryViewProps {
  onPlayFullStory?: (scenes: VideoSceneBeat[]) => void
  onPlayScene?: (scene: VideoSceneBeat) => void
  onOpenDetail?: (item: DetailMediaItem) => void
  onSendMessage?: (params: {
    prompt: string
    mode: GenerationMode
    targetDuration: number
    batchCount: number
    aspectRatio: string
    characterRef?: CharacterReference
    modelId: string
  }) => void
  isGenerating?: boolean
  activeModelId?: string
  onModelChange?: (modelId: string) => void
  activeCharacterRef?: CharacterReference
  onSelectCharacterRef?: (ref: CharacterReference | undefined) => void
  onOpenSettings?: (tab?: string) => void
  /** What the editing agent runs on: its chat model (throws when none can run it) and how to make media and what that may cost */
  getAgentRuntime?: () => import("@/lib/agent/chat").AgentRuntime
  /** Asks the chat model for text, for the script agent. Missing when none is ready. */
  onGenerateText?: (prompt: string) => Promise<string>
  /** What Create gives its composer (settings, uploads and project assets), so the composer here is the same one */
  composer?: Pick<React.ComponentProps<typeof ChatInput>, "settings" | "onSettingsChange" | "library">
}

const SCENE_COLOR_PALETTE = [
  "#10B981", // Emerald // allow-color
  "#3B82F6", // Cobalt // allow-color
  "#8B5CF6", // Violet // allow-color
  "#F59E0B", // Amber // allow-color
  "#F43F5E", // Crimson // allow-color
  "#06B6D4", // Cyan // allow-color
]

const ASPECT_OPTIONS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
const RESOLUTION_OPTIONS = ["480p", "720p", "1080p", "2K", "4K"]
const DURATION_OPTIONS = ["3s", "5s", "8s", "10s", "15s", "30s"]

/** A small dropdown for one shot setting. The current value is always in the list, even when it is not a usual one. */
function ShotSelect({ label, value, options, onChange, width }: { label: string; value: string; options: string[]; onChange: (v: string) => void; width: string }) {
  const all = options.includes(value) ? options : [value, ...options]
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={`h-7 ${width} rounded-md bg-secondary px-2 text-xs`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function StoryView(props: StoryViewProps = {}) {
  // Stories collection & active story
  const [stories, setStories] = React.useState<StoryItem[]>(loadStories)
  const listedModels = useListedModels()
  const scriptRef = React.useRef<ScriptEditorHandle>(null)
  const editRef = React.useRef<VideoEditorHandle>(null)
  // No story is open at first: the page shows the blank state, or the stories laid out like the Library
  const [activeStoryId, setActiveStoryId] = React.useState<string | null>(null)

  // Stories are kept on this device shortly after every change
  const [saveState, setSaveState] = React.useState<{ status: "saved" | "saving" | "failed"; at: number }>({ status: "saved", at: Date.now() })
  const saveNow = () => setSaveState({ status: saveStories(stories) ? "saved" : "failed", at: Date.now() })
  React.useEffect(() => {
    setSaveState((prev) => ({ ...prev, status: "saving" }))
    const timer = window.setTimeout(() => setSaveState({ status: saveStories(stories) ? "saved" : "failed", at: Date.now() }), 500)
    return () => window.clearTimeout(timer)
  }, [stories])

  // Current active story
  const activeStory = stories.find((st) => st.id === activeStoryId) || null

  // Master Tabs: "overview" | "script" | "scene" | "edit"
  const [activeTab, setActiveTab] = React.useState<"overview" | "cast" | "script" | "scene" | "edit">("scene")
  // Scenes open their beats in the sidebar unless closed
  const [sceneOpen, setSceneOpen] = React.useState<Record<string, boolean>>({})

  // Current active scene (when on Scene tab)
  const [activeSceneId, setActiveSceneId] = React.useState<string>(
    activeStory?.scenes[0]?.id || ""
  )
  const activeScene =
    activeStory?.scenes.find((s) => s.id === activeSceneId) || activeStory?.scenes[0]

  // Modals state

  const [newSceneModalOpen, setNewSceneModalOpen] = React.useState(false)
  const [newSceneName, setNewSceneName] = React.useState("")
  const [newSceneColor, setNewSceneColor] = React.useState(SCENE_COLOR_PALETTE[0]!)

  // -------------------------------------------------------------------------
  // 3-COLUMN RESIZABLE LAYOUT (12% / 66% / 22% default proportions)
  // -------------------------------------------------------------------------
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = React.useState(12) // in percentage
  // The composer's dock side and the right dock's width are one setting shared with Create, saved on this device
  const composerDock = useComposerDock()
  const rightWidth = composerDock.width // in percentage
  const setRightWidth = composerDock.setWidth
  // Either side can fold away to a narrow strip of icons
  const [leftOpen, setLeftOpen] = React.useState(true)
  const [rightOpen, setRightOpen] = React.useState(true)
  const [isDraggingLeft, setIsDraggingLeft] = React.useState(false)
  const [isDraggingRight, setIsDraggingRight] = React.useState(false)

  // Where the composer sits: the same choice as in Create
  const chatDockPosition = composerDock.side
  const setChatDockPosition = composerDock.setSide

  // Reset to the default proportions on double click
  const handleResetProportions = () => {
    setLeftWidth(12)
    composerDock.reset()
  }

  // Handle column divider drag
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const totalWidth = rect.width
      if (totalWidth <= 0) return

      if (isDraggingLeft) {
        const newLeftPx = e.clientX - rect.left
        const newLeftPct = Math.min(Math.max((newLeftPx / totalWidth) * 100, 9), 36)
        setLeftWidth(newLeftPct)
      } else if (isDraggingRight) {
        const newRightPx = rect.right - e.clientX
        const newRightPct = Math.min(Math.max((newRightPx / totalWidth) * 100, 17), 45)
        setRightWidth(newRightPct)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingLeft(false)
      setIsDraggingRight(false)
    }

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDraggingLeft, isDraggingRight])

  // Chat agent state
  const [internalModelId, setInternalModelId] = React.useState<string>("kling-1.5-pro")
  const [internalCharRef, setInternalCharRef] = React.useState<CharacterReference | undefined>()
  const [internalIsGenerating, setInternalIsGenerating] = React.useState(false)
  const [agentActivityLogs, setAgentActivityLogs] = React.useState<Array<{ id: string; role: "user" | "agent"; text: string }>>([
    {
      id: "log-1",
      role: "agent",
      text: "Agent ready. On Script it writes and rewrites; on Edit it cuts and adds captions; on Scene it directs a beat.",
    },
  ])

  const activeModelId = props.activeModelId || internalModelId
  const handleModelChange = props.onModelChange || setInternalModelId
  const activeCharacterRef = props.activeCharacterRef || internalCharRef
  const handleSelectCharacterRef = props.onSelectCharacterRef || setInternalCharRef
  const isGenerating = props.isGenerating ?? internalIsGenerating

  // Update active story helper
  const updateActiveStory = (updater: (prev: StoryItem) => StoryItem) => {
    if (!activeStory) return
    setStories((prev) =>
      prev.map((s) => (s.id === activeStory.id ? { ...updater(s), updatedAt: Date.now() } : s))
    )
  }

  // Update active scene helper
  const updateActiveScene = (updater: (prev: SceneItem) => SceneItem) => {
    if (!activeStory || !activeScene) return
    updateActiveStory((st) => ({
      ...st,
      scenes: st.scenes.map((sc) => (sc.id === activeScene.id ? updater(sc) : sc)),
    }))
  }

  // Create a story from the new-story window. The page stays on the stories, with the new one first.
  const handleCreateNewStory = (data: NewStory) => {
    const now = Date.now()
    const newStory: StoryItem = {
      id: `story-${now}`,
      title: data.title,
      icon: data.icon,
      genre: data.genre,
      logline: data.logline,
      screenplay: "",
      createdAt: now,
      updatedAt: now,
      scenes: [
        {
          id: `scene-${now}`,
          sceneNumber: 1,
          title: "Opening Scene",
          color: SCENE_COLOR_PALETTE[0]!,
          intro: "",
          environment: "",
          lightingKey: "",
          characters: [],
          shots: [
            {
              id: `shot-${now}-1`,
              shotNumber: 1,
              mode: "video",
              prompt: "",
              generatedSlots: [
                { id: "s-1", status: "empty" },
                { id: "s-2", status: "empty" },
              ],
              contextItems: [],
              cameraPreset: "Slow Push-In",
              lightingPreset: "Natural Diffused",
              model: "Kling 1.5 Pro",
              aspectRatio: "16:9",
              resolution: "1080p",
              duration: "5s",
              multiShot: true,
            },
          ],
        },
      ],
    }
    setStories((prev) => [newStory, ...prev])
  }

  const openStory = (id: string) => {
    const story = stories.find((st) => st.id === id)
    if (!story) return
    setActiveStoryId(id)
    setActiveSceneId(story.scenes[0]?.id ?? "")
    setActiveTab("scene")
  }

  const deleteStory = (id: string) => {
    setStories((prev) => prev.filter((st) => st.id !== id))
    if (activeStoryId === id) setActiveStoryId(null)
  }

  // Create New Scene inside active story
  const handleCreateNewScene = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!activeStory || !newSceneName.trim()) return

    const nextSceneNumber = activeStory.scenes.length + 1
    const newScene: SceneItem = {
      id: `scene-${Date.now()}`,
      sceneNumber: nextSceneNumber,
      title: newSceneName.trim(),
      color: newSceneColor,
      intro: "Describe narrative scene premise...",
      environment: "Location, atmosphere, lighting conditions...",
      lightingKey: "Dramatic Rembrandt · Directional Key",
      characters: ["Main Subject"],
      shots: [
        {
          id: `shot-${Date.now()}-1`,
          shotNumber: 1,
          mode: "video",
          prompt: "Cinematic opening beat for this scene...",
          generatedSlots: [
            { id: "s-new-1", status: "empty" },
            { id: "s-new-2", status: "empty" },
          ],
          contextItems: [
            { id: "ctx-new-1", type: "character", name: "Subject" },
          ],
          cameraPreset: "35mm Push-In",
          lightingPreset: "Rembrandt Split",
          model: "Kling 1.5 Pro",
          aspectRatio: "16:9",
          resolution: "1080p",
          duration: "5s",
          multiShot: true,
        },
      ],
    }

    updateActiveStory((st) => ({
      ...st,
      scenes: [...st.scenes, newScene],
    }))
    setActiveSceneId(newScene.id)
    setNewSceneName("")
    setNewSceneModalOpen(false)
  }

  // Make a scene for each heading in the script that the story does not have yet, with a shot for each action
  const breakIntoScenes = (found: ScriptScene[]) => {
    if (!activeStory) return
    if (found.length === 0) {
      showNotice("The script has no scene headings yet. A heading starts with INT. or EXT.")
      return
    }
    const taken = new Set(activeStory.scenes.map((sc) => sc.title.trim().toLowerCase()))
    const fresh = found.filter((f) => !taken.has(f.heading.trim().toLowerCase()))
    if (fresh.length === 0) {
      showNotice("Every scene in the script is already in the story.")
      return
    }
    // A brand new story still has its empty starting scene: the script's scenes replace it
    const first = activeStory.scenes[0]
    const untouched = activeStory.scenes.length === 1 && first !== undefined && !first.intro && first.shots.every((sh) => !sh.prompt)
    const kept = untouched ? [] : activeStory.scenes
    const stamp = Date.now()
    const made: SceneItem[] = fresh.map((f, n) => {
      const prompts = f.actions.slice(0, 6)
      return {
        id: `scene-${stamp}-${n}`,
        sceneNumber: kept.length + n + 1,
        title: f.heading,
        color: SCENE_COLOR_PALETTE[(kept.length + n) % SCENE_COLOR_PALETTE.length]!,
        intro: f.summary,
        environment: f.heading,
        lightingKey: "",
        characters: f.characters,
        shots: (prompts.length ? prompts : [""]).map((prompt, k) => ({
          id: `shot-${stamp}-${n}-${k}`,
          shotNumber: k + 1,
          mode: "video" as const,
          prompt,
          generatedSlots: [
            { id: `slot-${stamp}-${n}-${k}-1`, status: "empty" as const },
            { id: `slot-${stamp}-${n}-${k}-2`, status: "empty" as const },
          ],
          contextItems: f.characters.map((name, c) => ({ id: `ctx-${stamp}-${n}-${k}-${c}`, type: "character" as const, name })),
          cameraPreset: "Slow Push-In",
          lightingPreset: "Natural Diffused",
          model: "Kling 1.5 Pro",
          aspectRatio: "16:9",
          resolution: "1080p",
          duration: "5s",
          multiShot: true,
        })),
      }
    })
    updateActiveStory((st) => ({ ...st, scenes: [...kept, ...made] }))
    setActiveSceneId(made[0]!.id)
    showNotice(`Made ${made.length} ${made.length === 1 ? "scene" : "scenes"} from the script.`)
  }

  // Add a beat (a shot in the cut) to a scene, and open that scene
  const handleAddBeat = (sceneId: string) => {
    if (!activeStory) return
    const sc = activeStory.scenes.find((s) => s.id === sceneId)
    if (!sc) return
    const stamp = Date.now()
    const beat: ShotItem = {
      id: `shot-${stamp}`,
      shotNumber: sc.shots.length + 1,
      mode: "video",
      prompt: "The next beat in this scene...",
      generatedSlots: [
        { id: `slot-${stamp}-1`, status: "empty" },
        { id: `slot-${stamp}-2`, status: "empty" },
      ],
      contextItems: [{ id: `ctx-${stamp}-1`, type: "character", name: "Subject" }],
      cameraPreset: "Medium Orbit",
      lightingPreset: "Ambient Fill",
      model: "Kling 1.5 Pro",
      aspectRatio: "16:9",
      resolution: "1080p",
      duration: "5s",
      multiShot: true,
    }
    updateActiveStory((st) => ({
      ...st,
      scenes: st.scenes.map((s) => (s.id === sceneId ? { ...s, shots: [...s.shots, beat] } : s)),
    }))
    setSceneOpen((open) => ({ ...open, [sceneId]: true }))
    setActiveSceneId(sceneId)
    setActiveTab("scene")
  }

  // Chat message send handler connecting exact ChatInput form
  const handleChatSendMessage = (params: {
    prompt: string
    mode: GenerationMode
    targetDuration: number
    batchCount: number
    aspectRatio: string
    characterRef?: CharacterReference
    modelId: string
  }) => {
    // The agent does not work on the cast yet
    if (activeTab === "cast") {
      showNotice("The agent does not work on the cast yet. Use Script, Scene or Edit.")
      return
    }
    // On the Script and Edit pages the agent works on the script or the cut, not on a beat
    if (activeTab === "script" || activeTab === "edit") {
      const stamp = Date.now()
      setAgentActivityLogs((prev) => [...prev, { id: `msg-${stamp}`, role: "user", text: params.prompt }])
      const worker = activeTab === "script" ? scriptRef.current : editRef.current
      void (worker ? worker.ask(params.prompt) : Promise.reject(new Error("Open the page first."))).then(
        (done) => setAgentActivityLogs((prev) => [...prev, { id: `msg-agent-${stamp}`, role: "agent", text: done }]),
        (e: unknown) => setAgentActivityLogs((prev) => [...prev, { id: `msg-agent-${stamp}`, role: "agent", text: e instanceof Error ? e.message : String(e) }]),
      )
      return
    }

    if (props.onSendMessage) {
      props.onSendMessage(params)
    }

    // Append to agent activity thread
    setAgentActivityLogs((prev) => [
      ...prev,
      { id: `msg-${Date.now()}`, role: "user", text: params.prompt },
    ])

    // Direct scene or first shot with agent prompt
    if (activeScene) {
      setInternalIsGenerating(true)
      setTimeout(() => {
        updateActiveScene((sc) => {
          const updatedShots = sc.shots.map((sh, idx) => {
            if (idx === 0) {
              return {
                ...sh,
                prompt: params.prompt,
                model: params.modelId === "kling-1.5-pro" ? "Kling 1.5 Pro" : params.modelId,
                aspectRatio: params.aspectRatio,
                duration: `${params.targetDuration}s`,
              }
            }
            return sh
          })
          return {
            ...sc,
            intro: params.prompt,
            shots: updatedShots,
          }
        })
        setAgentActivityLogs((prev) => [
          ...prev,
          {
            id: `msg-agent-${Date.now()}`,
            role: "agent",
            text: `Directed Scene ${activeScene.sceneNumber}: "${params.prompt}". Updated Beat 1 parameters.`,
          },
        ])
        setInternalIsGenerating(false)
      }, 700)
    }
  }

  // -------------------------------------------------------------
  // 1. NO STORY OPEN: blank state at first, then the stories like the Library
  // -------------------------------------------------------------
  if (!activeStory) {
    return <StoryLibrary stories={stories} onOpen={openStory} onCreate={handleCreateNewStory} onDelete={deleteStory} />
  }

  // Count total shots in active story
  const totalShots = activeStory.scenes.reduce((acc, sc) => acc + sc.shots.length, 0)
  // Every picture made in a beat, offered as a picture for the cast
  const takePictures = activeStory.scenes
    .flatMap((sc) => sc.shots)
    .flatMap((sh) => sh.generatedSlots)
    .map((slot) => slot.url)
    .filter((url): url is string => Boolean(url))
  // The Cast page always has the composer at the bottom; the other pages keep the choice made in Create
  const dockBottom = chatDockPosition === "bottom" || activeTab === "cast"

  // -------------------------------------------------------------
  // 2. ACTIVE STORY WORKSPACE (3-COLUMN RESIZABLE LAYOUT)
  // -------------------------------------------------------------
  return (
    <TooltipProvider delayDuration={120}>
      <div
        ref={containerRef}
        className="w-full h-full flex flex-row bg-transparent text-foreground select-none overflow-hidden relative"
      >
        {/* ========================================================= */}
        {/* COLUMN 1: LEFT SIDEBAR (12% DEFAULT, RESIZABLE)           */}
        {/* ========================================================= */}
        <aside
          style={leftOpen ? { width: `${leftWidth}%` } : undefined}
          className={`h-full border-r border-border/40 flex flex-col bg-background/30 shrink-0 overflow-hidden relative group/side ${leftOpen ? "" : "w-11 items-center"}`}
        >
          {!leftOpen ? (
            <div className="flex flex-col items-center gap-1 py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setLeftOpen(true)} className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground p-0" aria-label="Open sidebar">
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Open sidebar</TooltipContent>
              </Tooltip>
              <div className="h-px w-5 bg-border/40 my-1" />
              {([
                { id: "overview", label: "Overview", Icon: Sparkles },
                { id: "script", label: "Script", Icon: FileText },
                { id: "cast", label: "Cast", Icon: Users },
                { id: "scene", label: "Scene", Icon: Film },
                { id: "edit", label: "Edit", Icon: Scissors },
              ] as const).map(({ id, label, Icon }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActiveTab(id)}
                      className={`h-7 w-7 rounded-md p-0 ${activeTab === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          ) : (
          <>
          {/* Top: the story's logo and name only */}
          <div className="p-3.5 border-b border-border/40 flex items-center gap-2 shrink-0">
            <div className="h-6 w-6 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
              {React.createElement(storyIcon(activeStory.icon), { className: "h-3.5 w-3.5 text-foreground" })}
            </div>
            <div className="text-xs font-bold text-foreground truncate">{activeStory.title}</div>
          </div>

          {/* Navigation Links: Home/Overview, Script, Scene, Edit */}
          <div className="p-2 space-y-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("overview")}
              className={`w-full justify-start h-7 px-2.5 text-xs rounded-lg transition-all gap-2 ${
                activeTab === "overview"
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Overview</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("script")}
              className={`w-full justify-start h-7 px-2.5 text-xs rounded-lg transition-all gap-2 ${
                activeTab === "script"
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Script</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("cast")}
              className={`w-full justify-start h-7 px-2.5 text-xs rounded-lg transition-all gap-2 ${
                activeTab === "cast"
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Cast</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("scene")}
              className={`w-full justify-start h-7 px-2.5 text-xs rounded-lg transition-all gap-2 ${
                activeTab === "scene"
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              <span>Scene</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("edit")}
              className={`w-full justify-start h-7 px-2.5 text-xs rounded-lg transition-all gap-2 ${
                activeTab === "edit"
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Scissors className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>
          </div>

          {/* Divider */}
          <div className="h-px bg-border/40 mx-2 my-1 shrink-0" />

          {/* Beats, by scene: each scene opens to its beats, and a button under them adds one */}
          <div className="flex-1 overflow-y-auto no-scrollbar group-hover/side:overflow-y-auto p-2 space-y-3">
            <div className="flex items-center justify-between px-2 text-xs font-semibold text-muted-foreground">
              <span>Beats</span>
              <span className="font-mono text-xs">{totalShots}</span>
            </div>

            <div className="space-y-2">
              {activeStory.scenes.map((sc) => {
                const open = sceneOpen[sc.id] ?? true
                return (
                  <div key={sc.id} className="space-y-0.5">
                    {/* Scene header: the arrow opens and closes its beats, the name opens the scene */}
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSceneOpen((o) => ({ ...o, [sc.id]: !open }))}
                        aria-label={open ? `Hide the beats of scene ${sc.sceneNumber}` : `Show the beats of scene ${sc.sceneNumber}`}
                        aria-expanded={open}
                        className="h-6 w-5 flex-shrink-0 rounded-md p-0 text-muted-foreground hover:text-foreground"
                      >
                        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActiveSceneId(sc.id)
                          setActiveTab("scene")
                        }}
                        className={`min-w-0 flex-1 justify-start h-6 px-2 text-xs font-semibold rounded-md gap-1.5 ${
                          activeScene?.id === sc.id && activeTab === "scene"
                            ? "text-foreground font-bold bg-secondary/50"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: sc.color }} />
                        <span className="truncate flex-1 text-left">
                          S{sc.sceneNumber} · {sc.title}
                        </span>
                      </Button>
                    </div>

                    {open && (
                      <div className="pl-5 space-y-0.5">
                        {sc.shots.map((sh) => (
                          <Button
                            key={sh.id}
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveSceneId(sc.id)
                              setActiveTab("scene")
                              setTimeout(() => {
                                const el = document.getElementById(`shot-card-${sh.id}`)
                                el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
                              }, 50)
                            }}
                            className="w-full justify-between h-5 px-2 text-xs text-muted-foreground hover:text-foreground font-mono rounded"
                          >
                            <span className="truncate">Beat {sh.shotNumber}</span>
                            <span className="text-xs uppercase text-muted-foreground/60">{sh.mode}</span>
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddBeat(sc.id)}
                          className="w-full justify-start h-5 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add beat</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom: status, save, story select, new scene, fold away */}
          <div className="p-2 border-t border-border/40 shrink-0 space-y-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isGenerating ? "bg-amber-500 animate-pulse" : saveState.status === "failed" ? "bg-destructive" : saveState.status === "saving" ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <span className="truncate">{isGenerating ? "Generating" : saveState.status === "failed" ? "Not saved" : saveState.status === "saving" ? "Saving" : "Saved"}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {saveState.status === "failed" ? "The browser would not keep this story" : `Kept on this device at ${new Date(saveState.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </TooltipContent>
            </Tooltip>
            <div className="flex items-center justify-between">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={saveNow} className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground p-0" aria-label="Save">
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Save now</TooltipContent>
              </Tooltip>

              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground p-0" aria-label="Stories">
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Stories</TooltipContent>
                </Tooltip>
                <PopoverContent side="top" align="start" className="w-56 p-1">
                  {stories.map((st) => (
                    <Button key={st.id} variant="ghost" size="sm" onClick={() => openStory(st.id)} className="h-8 w-full justify-start gap-2 px-2 text-xs">
                      {React.createElement(storyIcon(st.icon), { className: "h-3.5 w-3.5 shrink-0" })}
                      <span className="flex-1 truncate text-left">{st.title}</span>
                      {st.id === activeStory.id && <Check className="h-3 w-3 shrink-0" />}
                    </Button>
                  ))}
                  <div className="my-1 h-px bg-border/60" />
                  <Button variant="ghost" size="sm" onClick={() => setActiveStoryId(null)} className="h-8 w-full justify-start gap-2 px-2 text-xs">
                    <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                    <span>All stories</span>
                  </Button>
                </PopoverContent>
              </Popover>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setNewSceneModalOpen(true)} className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground p-0" aria-label="New scene">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">New scene</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setLeftOpen(false)} className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground p-0" aria-label="Collapse sidebar">
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Collapse sidebar</TooltipContent>
              </Tooltip>
            </div>
          </div>
          </>
          )}
        </aside>

        {/* --------------------------------------------------------- */}
        {/* RESIZER 1 (Between Left Sidebar & Center Workspace)        */}
        {/* Double-click resets to original proportions (12% / 66% / 22%) */}
        {/* --------------------------------------------------------- */}
        {leftOpen && (
          <div
            onMouseDown={(e) => {
              e.preventDefault()
              setIsDraggingLeft(true)
            }}
            onDoubleClick={handleResetProportions}
            title="Drag to resize · Double-click to reset (12%)"
            className="w-1 hover:w-1.5 bg-border/30 hover:bg-foreground/40 transition-all cursor-col-resize shrink-0 z-20"
          />
        )}

        {/* ========================================================= */}
        {/* COLUMN 2: CENTER CONTEXTUAL WORKSPACE (66% or 88%)        */}
        {/* ========================================================= */}
        <main
          className="h-full min-w-0 flex-1 flex flex-col bg-transparent overflow-hidden relative"
        >
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <StoryOverview
              story={activeStory}
              onUpdate={(patch) => updateActiveStory((st) => ({ ...st, ...patch }))}
              onOpenTab={setActiveTab}
            />
          )}

          {/* TAB CAST: the characters, locations, props and products, with their pictures */}
          {activeTab === "cast" && (
            <StoryCast story={activeStory} onUpdate={(patch) => updateActiveStory((st) => ({ ...st, ...patch }))} takes={takePictures} />
          )}

          {/* TAB 2: SCRIPT */}
          {activeTab === "script" && (
            <ScriptTab
              ref={scriptRef}
              key={activeStory.id}
              value={activeStory.screenplay}
              onChange={(text) => updateActiveStory((st) => ({ ...st, screenplay: text }))}
              draft={activeStory.draft ?? []}
              onDraftChange={(draft) => updateActiveStory((st) => ({ ...st, draft }))}
              settings={props.composer?.settings}
              title={activeStory.title}
              logline={activeStory.logline}
              onGenerateText={
                props.onGenerateText
                  ? (prompt) => {
                      const brandWords = storyBrandContext(activeStory.brandId)
                      return props.onGenerateText!(brandWords ? `${prompt}

${brandWords}` : prompt)
                    }
                  : undefined
              }
              onBreakIntoScenes={breakIntoScenes}
            />
          )}

          {/* TAB 3: SCENE DECK (VISUAL MULTI-SHOT WORKSPACE) */}
          {activeTab === "scene" && activeScene && (
            <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
              {/* Horizontally Expanding Deck (Left-aligned) */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-6 flex flex-col gap-4">
                {/* ----------------------------------------------------- */}
                {/* CARD A: GENERAL SCENE (LEFT CARD, FIXED HEIGHT & BG)  */}
                {/* ----------------------------------------------------- */}
                <div className="w-full shrink-0 rounded-2xl border border-border/80 bg-card p-4 flex flex-col gap-3 shadow-sm">
                  {/* Top Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-border/40 shrink-0">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: activeScene.color }}
                      />
                      <span className="text-xs font-bold text-foreground">General Scene</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      S{activeScene.sceneNumber}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="grid grid-cols-1 gap-3 py-2 md:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground block">
                        Scene Intro
                      </label>
                      <Textarea
                        value={activeScene.intro}
                        onChange={(e) => {
                          const text = e.target.value
                          updateActiveScene((s) => ({ ...s, intro: text }))
                        }}
                        rows={3}
                        placeholder="Narrative premise and action summary..."
                        className="text-xs bg-secondary/30 border-border/50 resize-none leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground block">
                        Environment
                      </label>
                      <Textarea
                        value={activeScene.environment}
                        onChange={(e) => {
                          const text = e.target.value
                          updateActiveScene((s) => ({ ...s, environment: text }))
                        }}
                        rows={3}
                        placeholder="Location, physical setting, atmosphere..."
                        className="text-xs bg-secondary/30 border-border/50 resize-none leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground block">
                        Lighting Key
                      </label>
                      <Textarea
                        value={activeScene.lightingKey}
                        onChange={(e) => {
                          const l = e.target.value
                          updateActiveScene((s) => ({ ...s, lightingKey: l }))
                        }}
                        rows={3}
                        placeholder="Light direction, colour and mood..."
                        className="text-xs bg-secondary/30 border-border/50 resize-none leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground shrink-0">
                    <span className="font-mono text-xs">{activeScene.title}</span>
                    <span className="text-xs font-mono">{activeScene.shots.length} {activeScene.shots.length === 1 ? "beat" : "beats"}</span>
                  </div>
                </div>

                {/* ----------------------------------------------------- */}
                {/* CARDS B: MULTI-SHOT CARDS (FIXED HEIGHT, BG & LAYOUT)  */}
                {/* ----------------------------------------------------- */}
                {activeScene.shots.map((shot) => {
                  const patch = (p: Partial<ShotItem>) =>
                    updateActiveScene((sc) => ({ ...sc, shots: sc.shots.map((st) => (st.id === shot.id ? { ...st, ...p } : st)) }))
                  const modelNames = [...new Set([...listedModels.filter((m) => m.modality === shot.mode).map((m) => m.name), shot.model])]
                  return (
                    <div
                      key={shot.id}
                      id={`shot-card-${shot.id}`}
                      className="w-full shrink-0 grid overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm"
                      style={{ gridTemplateColumns: "minmax(2.5rem,3%) minmax(7rem,15%) minmax(2.75rem,4%) minmax(0,1fr)" }}
                    >
                      {/* 1. Shot number, with the Image and Video switch stacked below it */}
                      <div className="flex flex-col items-center gap-2 p-2.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-mono text-xs font-bold text-foreground">B{shot.shotNumber}</span>
                          </TooltipTrigger>
                          <TooltipContent side="right">Beat {shot.shotNumber}</TooltipContent>
                        </Tooltip>
                        {(
                          [
                            { mode: "image", label: "Image", Icon: ImageIcon },
                            { mode: "video", label: "Video", Icon: Film },
                          ] as const
                        ).map(({ mode, label, Icon }) => (
                          <Tooltip key={mode}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => patch({ mode })}
                                aria-label={label}
                                aria-pressed={shot.mode === mode}
                                className={`h-7 w-7 rounded-lg p-0 ${shot.mode === mode ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">{label}</TooltipContent>
                          </Tooltip>
                        ))}
                      </div>

                      {/* 2. What was made: four take cards in two columns. Hover a picture to see it large. */}
                      <div className="grid grid-cols-2 content-start gap-1.5 border-l border-border/60 p-2.5">
                        {Array.from({ length: Math.max(4, shot.generatedSlots.length) }, (_, i) => shot.generatedSlots[i] ?? { id: `empty-${shot.id}-${i}`, status: "empty" as const, url: undefined }).map((slot, sIdx) => (
                          <HoverCard key={slot.id || sIdx} openDelay={120} closeDelay={60}>
                            <HoverCardTrigger asChild>
                              <div className="aspect-square rounded-md bg-secondary/30 border border-border/70 flex items-center justify-center overflow-hidden transition-colors cursor-pointer group">
                                {slot.url ? (
                                  <img src={slot.url} alt={`Take ${sIdx + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                                ) : (
                                  <span className="text-xs font-mono text-muted-foreground/40">T{sIdx + 1}</span>
                                )}
                              </div>
                            </HoverCardTrigger>
                            {slot.url && (
                              <HoverCardContent side="right" align="start" className="w-80 p-1.5">
                                <img src={slot.url} alt={`Take ${sIdx + 1}, large`} className="w-full rounded-lg object-contain" />
                              </HoverCardContent>
                            )}
                          </HoverCard>
                        ))}
                      </div>

                      {/* 3. References and elements: icons only, one under the other. The name shows on hover. */}
                      <div className="flex flex-col items-center content-start gap-1.5 border-l border-border/60 p-2.5">
                        {shot.contextItems.map((ctx) => (
                          <Tooltip key={ctx.id}>
                            <TooltipTrigger asChild>
                              <div className="h-8 w-8 rounded-lg border border-border/70 bg-secondary/40 shrink-0 flex items-center justify-center overflow-hidden cursor-pointer">
                                {ctx.thumbnailUrl ? (
                                  <img src={ctx.thumbnailUrl} alt={ctx.name} className="h-full w-full object-cover" />
                                ) : ctx.type === "character" ? (
                                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : ctx.type === "location" ? (
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : ctx.type === "prop" ? (
                                  <Box className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <span className="capitalize">{ctx.type}: </span>
                              <span className="font-semibold">{ctx.name}</span>
                            </TooltipContent>
                          </Tooltip>
                        ))}

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-8 w-8 rounded-lg border border-border/70 bg-secondary/40 shrink-0 flex items-center justify-center overflow-hidden cursor-pointer">
                              {shot.cameraThumbnailUrl ? <img src={shot.cameraThumbnailUrl} alt={shot.cameraPreset} className="h-full w-full object-cover" /> : <Camera className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <span>Camera: </span>
                            <span className="font-semibold">{shot.cameraPreset}</span>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-8 w-8 rounded-lg border border-border/70 bg-secondary/40 shrink-0 flex items-center justify-center overflow-hidden cursor-pointer">
                              {shot.lightingThumbnailUrl ? <img src={shot.lightingThumbnailUrl} alt={shot.lightingPreset} className="h-full w-full object-cover" /> : <Sun className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <span>Lighting: </span>
                            <span className="font-semibold">{shot.lightingPreset}</span>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg border border-dashed border-border/70 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="Add reference or element"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">Add an image, video, audio, character, element or style reference</TooltipContent>
                        </Tooltip>
                      </div>

                      {/* 4. Prompt, then the parameters to choose */}
                      <div className="flex min-w-0 flex-col gap-2 border-l border-border/60 p-2.5">
                        <Textarea
                          value={shot.prompt}
                          onChange={(e) => patch({ prompt: e.target.value })}
                          rows={3}
                          placeholder="Describe this beat..."
                          aria-label="Prompt"
                          className="text-xs bg-secondary/30 border-border/50 resize-none leading-relaxed h-24"
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ShotSelect label="Model" value={shot.model} options={modelNames} onChange={(v) => patch({ model: v })} width="w-40" />
                          <ShotSelect label="Aspect ratio" value={shot.aspectRatio} options={ASPECT_OPTIONS} onChange={(v) => patch({ aspectRatio: v })} width="w-20" />
                          <ShotSelect label="Resolution" value={shot.resolution} options={RESOLUTION_OPTIONS} onChange={(v) => patch({ resolution: v })} width="w-20" />
                          {shot.mode === "video" && <ShotSelect label="Duration" value={shot.duration} options={DURATION_OPTIONS} onChange={(v) => patch({ duration: v })} width="w-20" />}
                          <Button
                            variant={shot.multiShot ? "default" : "secondary"}
                            size="sm"
                            onClick={() => patch({ multiShot: !shot.multiShot })}
                            className="h-7 px-2 text-xs rounded-md gap-1"
                          >
                            <span>Multi</span>
                            <Check className={`h-2.5 w-2.5 ${shot.multiShot ? "opacity-100" : "opacity-0"}`} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* [+ Shot] Card at the end of deck */}
                <div className="shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleAddBeat(activeScene.id)}
                    className="h-12 w-full rounded-2xl border border-dashed border-border/70 flex flex-row items-center justify-center gap-2 transition-all p-0"
                  >
                    <Plus className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground">Beat</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EDIT */}
          {activeTab === "edit" && (
            <VideoEditor
              ref={editRef}
              key={activeStory.id}
              story={activeStory}
              onChange={(edit) => updateActiveStory((st) => ({ ...st, edit }))}
              onGenerateText={props.onGenerateText}
              library={props.composer?.library}
              settings={props.composer?.settings}
              onOpenSettings={props.onOpenSettings}
              getAgentRuntime={props.getAgentRuntime}
            />
          )}

          {/* DOCKED AT BOTTOM (IF USER TOGGLES DOCK POSITION TO BOTTOM) */}
          {dockBottom && (
            <div className="w-full shrink-0 px-4 pb-3 pt-2 z-20">
              <ComposerSlot side="bottom">
                <ChatInput
                  onSendMessage={handleChatSendMessage}
                  isGenerating={isGenerating}
                  activeModelId={activeModelId}
                  onModelChange={handleModelChange}
                  activeCharacterRef={activeCharacterRef}
                  onSelectCharacterRef={handleSelectCharacterRef}
                  onOpenSettings={props.onOpenSettings}
                  onToggleDock={activeTab === "cast" ? undefined : () => setChatDockPosition("right")}
                  {...props.composer}
                />
              </ComposerSlot>
            </div>
          )}
        </main>

        {/* The Agent column is shared with Brand: same width, same options */}
        {!dockBottom && rightOpen && <AgentDivider onStartDrag={() => setIsDraggingRight(true)} onReset={handleResetProportions} />}
        {!dockBottom && (
          <AgentAside
            open={rightOpen}
            width={rightWidth}
            onOpen={setRightOpen}
            onClear={() => setAgentActivityLogs([{ id: `log-${Date.now()}`, role: "agent", text: "Activity thread refreshed." }])}
            onDockBottom={() => setChatDockPosition("bottom")}
            footer={
              <ChatInput
                onSendMessage={handleChatSendMessage}
                isGenerating={isGenerating}
                activeModelId={activeModelId}
                onModelChange={handleModelChange}
                activeCharacterRef={activeCharacterRef}
                onSelectCharacterRef={handleSelectCharacterRef}
                onOpenSettings={props.onOpenSettings}
                {...props.composer}
              />
            }
          >
            {agentActivityLogs.map((log) => (
              <div
                key={log.id}
                className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
                  log.role === "agent" ? "bg-secondary/40 border-border/50 text-foreground" : "bg-primary/10 border-primary/20 text-foreground font-medium"
                }`}
              >
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono mb-1">
                  {log.role === "agent" ? (
                    <>
                      <Wand2 className="h-2.5 w-2.5 text-primary" />
                      <span>Agent</span>
                    </>
                  ) : (
                    <>
                      <User className="h-2.5 w-2.5" />
                      <span>You</span>
                    </>
                  )}
                </div>
                <div>{log.text}</div>
              </div>
            ))}
          </AgentAside>
        )}

        {/* MODAL: CREATE NEW SCENE */}
        {newSceneModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 space-y-3.5 shadow-2xl animate-fade-in">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-foreground">Create New Scene</h4>
                <p className="text-xs text-muted-foreground">
                  Name the scene and choose an accent color.
                </p>
              </div>

              <form onSubmit={handleCreateNewScene} className="space-y-3">
                <Input
                  type="text"
                  placeholder="e.g. Rooftop Infiltration"
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  className="h-8 text-xs font-semibold"
                />

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    {SCENE_COLOR_PALETTE.map((col) => (
                      <Button
                        key={col}
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setNewSceneColor(col)}
                        className={`h-6 w-6 rounded-full border transition-all p-0 ${
                          newSceneColor === col ? "border-select scale-110" : "border-border/60"
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewSceneModalOpen(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newSceneName.trim()}
                    className="h-7 text-xs font-semibold px-3"
                  >
                    Add Scene
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

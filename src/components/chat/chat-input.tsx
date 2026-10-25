import * as React from "react"
import { FilterBadge } from "@/components/ui/filter-badge"
import {
  Plus,
  Mic,
  MicOff,
  Video,
  Image as ImageIcon,
  Volume2,
  VolumeX,
  Wand2,
  X,
  Loader2,
  Coins,
  Check,
  MessageSquare,
  SlidersHorizontal,
  RectangleHorizontal,
  Diamond,
  Clock,
  Sliders,
  ArrowUp,
  Minus,
  AudioLines,
  Sparkles,
  ArrowRightToLine,
  ArrowDownToLine,
  ChevronDown,
  KeyRound,
  PersonStanding,
  FastForward,
  Scissors,
  MessageCircle,
  ArrowLeftRight,
  Undo2,
  Clapperboard,
  Lightbulb,
  Pencil,
  UploadCloud,
} from "lucide-react"
import { CharacterReference, GenerationMode, MediaAsset, Project, SettingsState } from "@/types"
import { calculateGenerationPrice } from "@/lib/pricing/pricing-calculator"
import { ensureSchema, getFamily, getFeatures, resolveAIModel, useKeyedProviders, useListedModels, useRegistry, useSchemaStatus } from "@/lib/registry/store"
import { enabledSet } from "@/lib/registry/enabled"
import { isBookmarked } from "@/lib/registry/bookmarks"
import { GROUP_LABEL, GROUP_MODALITIES, resolveGroups } from "@/lib/registry/groups"
import { estimateRun } from "@/lib/registry/price"
import { makerRank } from "@/lib/registry/logo-rules"
import type { ModelRecord, ParamProperty, RegistryModality } from "@/lib/registry/types"
import { MAX_REPEAT, REPEAT_KEY, aspectOf, countOf, repeatOf, rowOptions, secondsOf } from "@/lib/registry/param-logic"
import { getProviderApiKey, isLiveProviderReady } from "@/lib/providers/live-connectors"
import { resolveModelCapabilities } from "@/lib/providers/model-capabilities"
import { ModelLogo } from "@/components/ui/model-logo"
import { useMoney } from "@/lib/currency/currency"
import { AUDIO_SWITCH_KEYS, audioSwitchKey } from "@/lib/registry/canonical"
import { SchemaForm, PINNED_PARAMS, byTier, clampToSchema, defaultsFor, isEditable, labelOf, type ParamValues } from "@/components/composer/schema-form"
import { useDictation } from "@/components/composer/use-dictation"
import { useRecordedSpeech } from "@/components/composer/use-recorded-speech"
import { polishSpoken, speechAudio, sttModel, transcribe, ttsModel } from "@/lib/voice/speech"
import { BorderGlow } from "@/components/ui/border-glow"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input"
import { MediaReferenceModal, ReferenceMediaItem } from "./media-reference-modal"
import { ModelSelectorPopover } from "./model-selector-popover"
import { MentionPopover, MentionReferenceItem } from "./mention-popover"
import { PromptHistory, mentionBeforeCaret } from "@/lib/composer/mentions"
import { noteDuplicate } from "@/lib/library/duplicate-notice"
import { addUpload, useUploads } from "@/lib/library/library-store"
import { composePrompt } from "@/lib/elements/compose"
import { loadBrands } from "@/lib/brand/brand-storage"
import { brandBrief } from "@/lib/brand/brand-ops"
import { pickLogo, useIsDark } from "@/lib/brand/logos"
import { nativeShotsKey, shotsSwitch } from "@/lib/registry/shots"
import { sameModelElsewhere } from "@/lib/registry/cross-host"
import { ReferenceBox } from "./reference-box"
import { ShotStrip } from "./shot-strip"
import { readDocxText, readPdfText, readXlsxText } from "@/lib/chat/documents"
import { HistoryButton, HistoryList, type HistoryProps } from "./history-panel"
import { ScrollRow } from "@/components/composer/scroll-row"
import { useComposerDock } from "@/lib/ui/composer-dock"
import { ErrorChips } from "./error-chips"
import { clearChips, raiseChip } from "@/lib/ui/chips"
import { ButtonGroup } from "@/components/ui/button-group"
import type { SlotIcon } from "./reference-box"
import { useElements } from "@/lib/elements/store"
import { CATEGORY_LABEL, isReferenceCategory } from "@/lib/elements/types"
import type { ElementCategory, ElementItem } from "@/lib/elements/types"
import { KIND_STYLE, kindOf } from "@/components/elements/kind-colors"
import type { MentionKind } from "@/components/elements/kind-colors"
import { refCapability, referenceImageLimit } from "@/lib/registry/slots"
import { featureOfEndpoint } from "@/lib/registry/features"
import { plainValue } from "@/lib/registry/plain-names"
import { NO_ENHANCE_KEY, shapeRun, TASK_KEY } from "@/lib/models/apply"
import { profileFor } from "@/lib/models/profile"
import type { EndpointFeature } from "@/lib/registry/features"
import { agentSkills, useSkills } from "@/lib/skills/store"
import { LIMITS } from "@/lib/skills/limits"
import type { Skill } from "@/lib/skills/types"

interface ChatInputProps {
  onSendMessage: (params: {
    prompt: string
    mode: GenerationMode
    targetDuration: number
    batchCount: number
    aspectRatio: string
    characterRef?: CharacterReference
    referenceItem?: MentionReferenceItem | null
    startFrameUrl?: string
    endFrameUrl?: string
    cameraMotion?: string
    modelId: string
    modelParams?: Record<string, unknown>
    /** The prompt with Elements added. The chat shows `prompt`; the model receives this. */
    generationPrompt?: string
    /** Reference images to send, in order, and the same images grouped by what they show */
    referenceUrls?: string[]
    referenceGroups?: string[][]
    /** A video or audio file the model works on (motion source, voice) */
    sourceVideoUrl?: string
    sourceAudioUrl?: string
  }) => void
  isGenerating: boolean
  activeModelId: string
  onModelChange: (modelId: string) => void
  activeCharacterRef?: CharacterReference
  onSelectCharacterRef: (ref: CharacterReference | undefined) => void
  onOpenSettings?: (tab?: string) => void
  settings?: SettingsState
  /** Lets the / skills list switch skills on and off */
  onSettingsChange?: (settings: SettingsState) => void
  /** Last assistant reply, spoken aloud while Talk is on */
  lastAssistantText?: string
  /** Shows a small dock button in the top right corner of the card */
  onToggleDock?: () => void
  /** Chat history (Chat and Agent only): icon in the top right cluster, list behind the composer */
  history?: HistoryProps
  /** Tells the page which mode the composer is in, so the header can offer History or Library */
  onModeChange?: (mode: GenerationMode) => void
  /** A finished result sent back to be made again: its prompt, and the image itself as a reference */
  reuse?: { nonce: number; mode: GenerationMode; prompt: string; id: string; name: string; imageUrl?: string; /** Several pictures at once, for example a Pinterest board */ images?: Array<{ id: string; name: string; url: string }>
    /** An opened video sent to be edited, extended or lip-synced: the video, the model that does it, and the task inside the model when it is one */
    edit?: { videoUrl: string; videoName?: string; modelId: string; task?: "edit" | "extend" }
  }
  /** What the + popup shows: this project's creations, and the other projects to pick from */
  library?: { assets: MediaAsset[]; projects: Project[]; activeProjectId?: string }
}

interface ModeDef {
  id: GenerationMode
  label: string
  icon: React.ElementType
  modality: RegistryModality
  cta: string
  placeholder: string
}

const MODES: ModeDef[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, modality: "text", cta: "Send", placeholder: "Ask anything, edit prompts, or brainstorm" },
  { id: "image", label: "Image", icon: ImageIcon, modality: "image", cta: "Generate", placeholder: "Describe the image you want" },
  { id: "video", label: "Video", icon: Video, modality: "video", cta: "Generate", placeholder: "Describe the video you want" },
  { id: "audio", label: "Audio", icon: Volume2, modality: "audio", cta: "Generate", placeholder: "Describe the sound, music or voiceover" },
  { id: "plan", label: "Agent", icon: Wand2, modality: "text", cta: "Direct", placeholder: "Describe a story and the agent plans every beat" },
]

const PARAM_ICON: Record<string, React.ElementType> = {
  aspect_ratio: RectangleHorizontal,
  image_size: RectangleHorizontal,
  resolution: Diamond,
  quality: Diamond,
  duration: Clock,
  camera_motion: Video,
}

const NARROW_BELOW_PX = 520

const PROVIDER_NAME: Record<string, string> = { fal: "fal", replicate: "Replicate", openai: "OpenAI", gemini: "Gemini", openrouter: "OpenRouter", runway: "Runway", kling: "Kling" }
const providerName = (provider?: string) => (provider ? (PROVIDER_NAME[provider] ?? provider) : "this provider")

function pillValue(key: string, value: unknown): string {
  // A length of -1 (or 0) is how some models say "you decide"
  if (key === "duration") return typeof value === "number" && value <= 0 ? "Auto" : `${value}s`
  return plainValue(key, value) ?? String(value ?? "")
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState(640)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 640))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** A parameter that is either an enum or the image count; both render as a control in the row. */
export const COUNT_KEYS = ["num_images", "n", "num_outputs", "sample_count", "series_amount"]

export function isRowParam(key: string, prop: ParamProperty): boolean {
  // Advanced and technical fields (seed, negative prompt, steps, output format) always live under More
  if (!isEditable(prop) || (AUDIO_SWITCH_KEYS as readonly string[]).includes(key) || prop.tier === "advanced" || prop.tier === "technical") return false
  if (prop.enum?.length) return true
  // A yes/no setting the model has (loop, fixed camera) is a switch in the row
  if (prop.type === "boolean") return prop.tier === "common" || prop.tier === "unique"
  if (prop.minimum === undefined || prop.maximum === undefined) return false
  return COUNT_KEYS.includes(key) || ((prop.tier === "common" || prop.tier === "unique") && (prop.type === "integer" || prop.type === "number"))
}

/** The choices for a row control, including the model's own default and the value now chosen */
export function withOptions(prop: ParamProperty, current?: unknown): ParamProperty {
  const options = rowOptions(prop, current)
  return options ? { ...prop, enum: options } : prop
}

export function ParamPill({ name, prop, value, onChange, locked, allowed, why }: { name: string; prop: ParamProperty; value: unknown; onChange: (v: unknown) => void; locked?: string; allowed?: unknown[]; why?: string }) {
  const Icon = PARAM_ICON[name] ?? Sliders
  const label = labelOf(name, prop)
  const options = allowed && prop.enum ? prop.enum.filter((o) => allowed.some((a) => String(a).toLowerCase() === String(o).toLowerCase())) : prop.enum
  // The maker fixes this setting: it shows what it is and why, and does not open
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-8 flex-shrink-0 cursor-default items-center gap-1.5 rounded-full border border-dashed border-border/50 px-3 text-xs font-medium text-muted-foreground">
            <Icon className="h-3 w-3" />
            <span>{pillValue(name, value)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}: {locked}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="pill" size="chip" className="flex-shrink-0 text-foreground">
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span>{pillValue(name, value)}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="max-h-72 w-40 overflow-y-auto border border-border bg-popover p-1 text-popover-foreground shadow-xl">
        <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
        {prop.untested && <div className="px-2 pb-1 text-xs text-amber-600 dark:text-amber-400">Untested on this provider</div>}
        {why && <div className="px-2 pb-1 text-xs text-muted-foreground">{why}</div>}
        {options?.map((opt) => (
          <Button
            key={String(opt)}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(opt)}
            className={`h-7 w-full justify-between rounded px-2.5 py-1.5 text-xs transition-colors ${
              opt === value ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            <span>{pillValue(name, opt)}</span>
            {opt === value && <Check className="h-3 w-3" />}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** A yes/no setting of the model (loop, fixed camera) as a switch in the row. */
export function ToggleParam({ name, prop, value, onChange, locked }: { name: string; prop: ParamProperty; value: unknown; onChange: (v: boolean) => void; locked?: string }) {
  const Icon = PARAM_ICON[name] ?? Sliders
  const label = labelOf(name, prop)
  const on = value === true
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="pill" size="chip" aria-pressed={on} disabled={Boolean(locked)} onClick={() => onChange(!on)} className="flex-shrink-0">
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}: {on ? "On" : "Off"}
        {locked ? ` (${locked})` : prop.untested ? " (untested)" : ""}
      </TooltipContent>
    </Tooltip>
  )
}

/** Image count as a small stepper, like 1/4. The ceiling comes from the model. */
export function CountStepper({ prop, value, onChange }: { prop: ParamProperty; value: unknown; onChange: (v: number) => void }) {
  const options = prop.enum?.length
    ? prop.enum.map(Number)
    : Array.from({ length: Math.min((prop.maximum ?? 1) - (prop.minimum ?? 1) + 1, 8) }, (_, i) => (prop.minimum ?? 1) + i)
  const current = Number(value ?? options[0])
  const idx = Math.max(0, options.indexOf(current))
  const max = options[options.length - 1]
  return (
    <div className="inline-flex h-8 flex-shrink-0 items-center rounded-full border border-border/50 bg-secondary/60 text-xs font-medium text-foreground">
      <Button type="button" variant="ghost" size="iconSm" aria-label="Fewer" disabled={idx === 0} onClick={() => onChange(options[idx - 1]!)} className="h-8 w-7 rounded-l-full rounded-r-none">
        <Minus className="h-3 w-3" />
      </Button>
      <span className="min-w-8 text-center font-mono">
        {current}/{max}
      </span>
      <Button type="button" variant="ghost" size="iconSm" aria-label="More" disabled={idx === options.length - 1} onClick={() => onChange(options[idx + 1]!)} className="h-8 w-7 rounded-l-none rounded-r-full">
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}

/** What the video slot is called while a feature is chosen */
function clipLabel(feature?: string | null): { label: string } {
  if (feature === "motion-transfer") return { label: "Motion clip" }
  if (feature === "extend") return { label: "Video to extend" }
  if (feature === "edit") return { label: "Video to edit" }
  if (feature === "lip-sync") return { label: "Video to lip-sync" }
  return { label: "Reference video" }
}

/** Features that make something new from what you give them. Edit, extend and lip-sync work on a finished video, so they start from the opened video. */
const CREATE_FEATURES: string[] = ["motion-transfer", "transition", "effects"]

const FEATURE_ICON: Record<EndpointFeature, SlotIcon> = {
  "motion-transfer": PersonStanding,
  extend: FastForward,
  edit: Scissors,
  "lip-sync": MessageCircle,
  transition: ArrowLeftRight,
  effects: Sparkles,
}

/** A feature the model has, in a creator's words. Choosing it switches to the version of the model that does it. */
function FeatureTile({ label, hint, icon: Icon, active, onClick }: { label: string; hint?: string; icon: SlotIcon; active?: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={`h-7 w-7 flex-shrink-0 rounded-full p-0 transition-colors hover:bg-accent hover:text-foreground ${active ? "bg-accent text-foreground" : "bg-secondary text-muted-foreground"}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{hint ? `${label}: ${hint}` : label}</TooltipContent>
    </Tooltip>
  )
}

/** Splits text so every known @mention can be highlighted behind the textarea. */
function mentionSegments(text: string, names: string[], kindFor: (name: string) => MentionKind): Array<{ text: string; mention: boolean; kind?: MentionKind }> {
  if (names.length === 0 || !text.includes("@")) return [{ text, mention: false }]
  const escaped = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const re = new RegExp(`@(?:${escaped.join("|")})(?=$|[\\s.,!?;:])`, "gi")
  const out: Array<{ text: string; mention: boolean; kind?: MentionKind }> = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > last) out.push({ text: text.slice(last, start), mention: false })
    out.push({ text: m[0], mention: true, kind: kindFor(m[0].slice(1)) })
    last = start + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false })
  return out
}

/**
 * The settings that do not fit a row control: advanced and technical fields. A click opens a panel with the names on the left and
 * the controls on the right; the provider's low-level ones fold away.
 */
export function MoreMenu({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="pill" size="chipIcon" aria-label="Settings" className="flex-shrink-0">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" side="top" className="max-h-96 w-80 overflow-y-auto border border-border bg-popover p-3 text-popover-foreground shadow-xl no-scrollbar">
        {children}
      </PopoverContent>
    </Popover>
  )
}

export function ChatInput({
  onSendMessage,
  isGenerating,
  activeModelId,
  onModelChange,
  activeCharacterRef,
  onSelectCharacterRef,
  onOpenSettings,
  settings,
  onSettingsChange,
  lastAssistantText,
  onToggleDock,
  history,
  library,
  onModeChange,
  reuse,
}: ChatInputProps) {
  const records = useRegistry()
  const dockSide = useComposerDock().side
  const listed = useListedModels()
  const money = useMoney()
  const keyedProviders = useKeyedProviders()
  const uploads = useUploads()
  const libraryElements = useElements()
  // @ offers what the user really has: their uploads and what this project has made
  const mentionItems = React.useMemo<MentionReferenceItem[]>(
    () => [
      ...uploads.filter((u) => u.type === "image").map((u) => ({ id: u.id, name: u.title, imageUrl: u.url })),
      ...(library?.assets ?? []).filter((a) => a.type === "image" && a.status === "completed").map((a) => ({ id: a.id, name: a.title, imageUrl: a.url })),
      ...libraryElements.filter((e) => isReferenceCategory(e.category) && e.imageUrls.length > 0).map((e) => ({ id: e.id, name: e.name, imageUrl: e.imageUrls[0]!, category: CATEGORY_LABEL[e.category], kind: e.category })),
    ],
    [uploads, library?.assets, libraryElements],
  )
  const mentionKinds = React.useMemo(() => new Map(mentionItems.map((i) => [i.name.toLowerCase(), i.kind ?? "reference"])), [mentionItems])
  const [prompt, setPrompt] = React.useState("")
  // The mode survives docking and undocking, which mounts a fresh composer
  const [mode, setMode] = React.useState<GenerationMode>(() => {
    try {
      const stored = localStorage.getItem("gencraft_composer_mode")
      return MODES.some((m) => m.id === stored) ? (stored as GenerationMode) : "chat"
    } catch {
      return "chat"
    }
  })
  React.useEffect(() => onModeChange?.(mode), [mode]) // eslint-disable-line react-hooks/exhaustive-deps
  const [isFocused, setIsFocused] = React.useState(false)
  const [modeOpen, setModeOpen] = React.useState(false)
  const [slashOpen, setSlashOpen] = React.useState(false)
  const [activeSkills, setActiveSkills] = React.useState<Skill[]>([])
  const allSkills = useSkills()
  const [slashIndex, setSlashIndex] = React.useState(0)

  // Images attached by hand, and the Elements chosen from the library. Neither is written into the prompt.
  const [refs, setRefs] = React.useState<Array<{ id: string; name: string; url: string }>>([])
  const [elements, setElements] = React.useState<ElementItem[]>([])
  // A chosen brand kit: its logo goes in as a reference picture and its colors, fonts and rules are added to the prompt
  const isDark = useIsDark()
  const [brandId, setBrandId] = React.useState<string | null>(null)
  const brandKits = React.useMemo(() => loadBrands(), [isFocused])
  const brandKit = brandKits.find((k) => k.id === brandId)
  const brandLogo = brandKit ? pickLogo(brandKit, isDark)?.url : undefined
  const [sourceVideo, setSourceVideo] = React.useState<{ url: string; name?: string } | null>(null)
  const [sourceAudio, setSourceAudio] = React.useState<{ url: string; name?: string } | null>(null)
  const [startFrame, setStartFrame] = React.useState<{ url: string; name?: string } | null>(null)
  const [endFrame, setEndFrame] = React.useState<{ url: string; name?: string } | null>(null)
  const [pickTarget, setPickTarget] = React.useState<"start" | "end" | "general" | "video" | "audio">("general")

  const [isMediaModalOpen, setIsMediaModalOpen] = React.useState(false)
  const [isModelSelectorOpen, setIsModelSelectorOpen] = React.useState(false)
  const [isMentionOpen, setIsMentionOpen] = React.useState(false)
  const [mentionQuery, setMentionQuery] = React.useState("")
  const [pickedNames, setPickedNames] = React.useState<string[]>([])
  // The picture under the pointer when it rests on an @mention
  const [hoverMention, setHoverMention] = React.useState<{ name: string; url: string; left: number; top: number } | null>(null)
  // Undo and redo follow every change of the prompt, including the ones the app makes itself (picking a mention, removing one, clearing)
  const promptHistory = React.useRef(new PromptHistory(""))
  const fromHistory = React.useRef(false)
  const backdropRef = React.useRef<HTMLDivElement>(null)

  // Parameters come from the active model's own schema, so only real options are shown
  const [values, setValues] = React.useState<ParamValues>({})
  const [promptHeight, setPromptHeight] = React.useState<number | null>(null)
  const [talk, setTalk] = React.useState(false)

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const talkRef = React.useRef(false)
  const lastSpoken = React.useRef<string | undefined>(lastAssistantText)
  const cardWidth = useElementWidth(containerRef)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  React.useEffect(() => {
    if (!historyOpen) return
    const away = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setHistoryOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setHistoryOpen(false)
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("pointerdown", away)
      document.removeEventListener("keydown", esc)
    }
  }, [historyOpen])
  const narrow = cardWidth < NARROW_BELOW_PX

  const modeDef = MODES.find((m) => m.id === mode)!
  const modality = modeDef.modality
  const isMedia = mode === "image" || mode === "video" || mode === "audio"
  const isText = !isMedia

  // The active model must belong to the active mode
  // A model the composer switched to by itself (the image-to-video version of the model you chose) stays valid even when it is not switched on in Settings
  const autoPicked = React.useRef<string | null>(null)
  const onSet = React.useMemo(() => enabledSet(listed, settings?.aiEngine.enabledChatModelIds), [listed, settings?.aiEngine.enabledChatModelIds])
  const record: ModelRecord | undefined = React.useMemo(() => {
    const found = records.find((r) => r.id === activeModelId)
    // A model switched off in Settings, superseded, or retired is no longer offered: another one is chosen
    return found && found.modality === modality && (onSet.has(found.id) || autoPicked.current === found.id) ? found : undefined
  }, [records, activeModelId, modality, onSet])

  const pickModelFor = React.useCallback(
    (target: RegistryModality) => {
      // Every current, runnable model is a candidate; a bookmarked one wins
      const on = enabledSet(listed, settings?.aiEngine.enabledChatModelIds)
      const pool = listed.filter((r) => r.modality === target && on.has(r.id))
      let stored: string | null = null
      try {
        stored = localStorage.getItem(`gencraft_mode_model_${target}`)
      } catch {
        stored = null
      }
      const keyed = (r: ModelRecord) => Number(settings ? isLiveProviderReady(r.provider, settings) : false)
      // Prompt-only models first: they work the moment the user types
      const needsInput = (r: ModelRecord) => Number(Boolean(r.task) && !r.task!.startsWith("text-to"))
      const next =
        pool.find((r) => r.id === stored) ??
        [...pool]
          .sort(
            (a, b) =>
              keyed(b) - keyed(a) ||
              Number(isBookmarked(b.id)) - Number(isBookmarked(a.id)) ||
              needsInput(a) - needsInput(b) ||
              makerRank({ name: a.name, endpoint: a.endpoint, family: a.family }, target) - makerRank({ name: b.name, endpoint: b.endpoint, family: b.family }, target) ||
              (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
          )[0] ??
        pool[0]
      if (next) onModelChange(next.id)
    },
    [listed, settings, onModelChange],
  )

  React.useEffect(() => {
    if (!record) pickModelFor(modality)
  }, [record, modality, pickModelFor])

  // Parameters follow the model: keep what is still valid, reset the rest
  React.useEffect(() => {
    if (record) setValues((prev) => clampToSchema(record.params, Object.keys(prev).length ? prev : defaultsFor(record.params)))
  }, [record])

  const falKey = settings ? getProviderApiKey("fal", settings) : undefined
  React.useEffect(() => {
    if (record) void ensureSchema(record.id, falKey)
  }, [record?.id, falKey]) // the schema loads once per model; the key only raises rate limits
  const schemaStatus = useSchemaStatus(record?.id)

  const activeModel = React.useMemo(() => (record ? resolveAIModel(record.id) : undefined), [record])
  const caps = React.useMemo(() => (activeModel ? resolveModelCapabilities(activeModel) : undefined), [activeModel])

  const supportsReference = isMedia && Boolean(record?.inputs.includes("image"))
  // Live models are judged by their own schema only. The name-based guess applies to bundled legacy entries.
  const isLegacy = record ? record.endpoint === record.id : false
  // What this model takes as input, read from the provider's own schema
  const cap = React.useMemo(() => (record && isMedia && !isLegacy ? refCapability(record) : undefined), [record, isMedia, isLegacy])
  // The model's versions at this provider (text, image and reference versions): what the model takes is what they take together,
  // and attaching a file switches to the version that takes it
  const family = React.useMemo(() => (record && isMedia && !isLegacy ? getFamily(record) : []), [record, isMedia, isLegacy, listed])
  const famCap = React.useMemo(() => {
    const all = family.map((r) => refCapability(r))
    const most = (pick: (c: ReturnType<typeof refCapability>) => { max: number } | undefined) => Math.max(0, ...all.map((c) => pick(c)?.max ?? 0))
    return {
      start: all.some((c) => c.start),
      end: all.some((c) => c.end),
      images: Math.max(most((c) => c.images), most((c) => c.elements)),
      videos: all.some((c) => c.videos || c.sourceVideo),
      audios: all.some((c) => c.audios || c.sourceAudio),
    }
  }, [family])
  // What the model can do besides making a clip from words (motion transfer, extend, lip-sync): other endpoints of the same model
  const features = React.useMemo(() => (record && mode === "video" && !isLegacy ? getFeatures(record) : []), [record, mode, isLegacy, listed])
  // The version the person came from, so a feature can be left again
  const [featureFrom, setFeatureFrom] = React.useState<string | null>(null)
  const activeFeature = record ? featureOfEndpoint(record.endpoint) : undefined
  // What the maker lets this one model do with a video you give it (edit, extend), when it has no endpoint of its own for it
  const tasks = React.useMemo(() => (record && mode === "video" && !isLegacy ? (profileFor(record)?.tasks ?? []) : []), [record, mode, isLegacy])
  const [task, setTask] = React.useState<string | null>(null)
  // A task chosen with the video (edit, extend) waits for the model it belongs to; any other change of model ends a task
  const pendingTask = React.useRef<{ modelId: string; task: string } | null>(null)
  React.useEffect(() => {
    const wait = pendingTask.current
    if (wait && record?.id === wait.modelId) {
      pendingTask.current = null
      setTask(wait.task)
    } else if (!wait) setTask(null)
  }, [record?.id])
  // Several shots in one clip: the provider's own switch, or the storyboard control that writes them into the prompt
  const shotsDef = record && mode === "video" ? shotsSwitch(record) : undefined
  const shotsKey = shotsDef?.key
  const shotsOn = Boolean(shotsKey && values[shotsKey] === true)
  // What the model itself offers for cutting shots (Kling: manual or automatic), shown at the right of the strip
  const shotModeProp = record && shotsKey ? record.params.properties.shot_type : undefined
  const shotOption =
    shotModeProp?.enum?.length && record
      ? {
          label: "Shot mode",
          value: String(values.shot_type ?? shotModeProp.default ?? shotModeProp.enum[0]),
          choices: shotModeProp.enum.map((v) => ({ value: String(v), label: plainValue("shot_type", v) ?? String(v) })),
          onChange: (v: string) => setValues((prev) => ({ ...prev, shot_type: v })),
        }
      : undefined
  // A chat model that can see pictures takes a few with the message
  const chatVision = mode === "chat" && Boolean(record?.inputs.includes("image"))
  const referenceLimit = chatVision ? 4 : !isMedia || !record ? 0 : isLegacy ? (supportsReference ? 1 : 0) : Math.max(cap ? referenceImageLimit(cap) : 0, famCap.images)
  const hasStart = mode === "video" && (isLegacy ? supportsReference : Boolean(cap?.start) || famCap.start)
  const hasEnd = mode === "video" && (isLegacy ? Boolean(caps?.supportsDualKeyframe) : Boolean(cap?.end) || famCap.end)
  // What this model takes as a video or a sound to work from
  const videoOk = Boolean(cap?.sourceVideo || cap?.videos || famCap.videos)
  const audioOk = Boolean(cap?.sourceAudio || cap?.audios || famCap.audios)
  // In the + popup, a kind the model cannot take is muted, with the reason. A single slot (start, end, video, audio) takes only its own kind.
  const unsupportedTypes: Partial<Record<"image" | "video" | "audio", string>> =
    pickTarget === "general"
      ? { ...(referenceLimit === 0 ? { image: "no reference images" } : {}), ...(videoOk ? {} : { video: "not supported" }), ...(audioOk ? {} : { audio: "not supported" }) }
      : {
          ...(pickTarget === "video" || pickTarget === "audio" ? { image: "not for this slot" } : {}),
          ...(pickTarget === "video" ? {} : { video: "not for this slot" }),
          ...(pickTarget === "audio" ? {} : { audio: "not for this slot" }),
        }

  // What is really sent: the prompt with Elements added, and the reference images that fit this model
  const composed = React.useMemo(
    () => {
      const base = composePrompt({ prompt, elements, references: brandLogo ? [...refs, { id: "brand-logo", name: `${brandKit?.name ?? "Brand"} logo`, url: brandLogo }] : refs, referenceLimit, skillPhrases: activeSkills.map((k) => k.phrase), multiShot: shotsOn, imageTag: record ? profileFor(record)?.imageTag : undefined })
      return brandKit ? { ...base, prompt: `${base.prompt}

${brandBrief(brandKit)}` } : base
    },
    [prompt, elements, refs, referenceLimit, activeSkills, record, shotsOn, brandKit, brandLogo],
  )
  const elementImageCount = elements.reduce((n, e) => n + (isReferenceCategory(e.category) ? e.imageUrls.length : 0), 0)

  // Something was attached that this version of the model cannot take: switch to the version of the same model that can
  // (Wan text-to-video becomes Wan image-to-video for a start frame, or reference-to-video for reference images). When the
  // version takes a start frame but no reference list, the first image becomes the start frame.
  React.useEffect(() => {
    if (!record || !isMedia || isLegacy || (modality !== "video" && modality !== "image")) return
    const images = [...refs.map((r) => ({ name: r.name, url: r.url })), ...elements.flatMap((e) => (isReferenceCategory(e.category) ? e.imageUrls.map((u) => ({ name: e.name, url: u })) : []))]
    const need = { start: Boolean(startFrame), end: Boolean(endFrame), refs: images.length, video: Boolean(sourceVideo), audio: Boolean(sourceAudio) }
    if (!need.start && !need.end && need.refs === 0 && !need.video && !need.audio) return
    const covers = (r: ModelRecord) => {
      const c = refCapability(r)
      const takesImages = Boolean(c.images || c.elements)
      return (
        (!need.start || Boolean(c.start)) &&
        (!need.end || Boolean(c.end)) &&
        // One image can also be the start frame; several need a reference list
        (need.refs === 0 || takesImages || (need.refs === 1 && Boolean(c.start))) &&
        (!need.video || Boolean(c.videos || c.sourceVideo)) &&
        (!need.audio || Boolean(c.audios || c.sourceAudio))
      )
    }
    if (covers(record)) return
    // A single image prefers a start frame, several prefer a reference list; the plainest name wins after that
    const score = (r: ModelRecord) => (need.refs > 1 ? Number(Boolean(refCapability(r).images)) : Number(Boolean(refCapability(r).start)))
    const target = family
      .filter((r) => r.id !== record.id && covers(r))
      .sort((a, b) => score(b) - score(a) || a.endpoint.length - b.endpoint.length)[0]
    if (!target) return
    const next = refCapability(target)
    autoPicked.current = target.id
    if (!next.images && next.start && !startFrame && refs[0]) {
      setStartFrame({ url: refs[0].url, name: refs[0].name })
      setRefs((prev) => prev.slice(1))
    }
    onModelChange(target.id)
  }, [record?.id, refs.length, elements.length, startFrame, endFrame, sourceVideo, sourceAudio, family]) // eslint-disable-line react-hooks/exhaustive-deps

  // The maker's rules, defaults and prompt shape for what is chosen and attached: the same call the run makes
  const shape = React.useMemo(
    () =>
      record && isMedia && !isLegacy
        ? shapeRun(
            record,
            composed.prompt,
            values,
            { start: hasStart && Boolean(startFrame), end: hasEnd && Boolean(endFrame), images: composed.imageUrls.length, videos: sourceVideo && videoOk ? 1 : 0, audios: sourceAudio && audioOk ? 1 : 0, sourceVideo: Boolean(sourceVideo && videoOk), sourceAudio: Boolean(sourceAudio && audioOk) },
            activeFeature?.id ?? task ?? undefined,
          )
        : null,
    [record, isMedia, isLegacy, composed.prompt, values, hasStart, hasEnd, startFrame, endFrame, composed.imageUrls.length, sourceVideo, sourceAudio, videoOk, audioOk, activeFeature?.id, task],
  )
  // Ways of giving files that exclude each other (Seedance: start image, start and end image, references): the others dim, with the reason
  const blockedSlot = (slot: "start" | "end" | "ref"): string | undefined => {
    const modes = shape?.modes
    if (!modes?.length) return undefined
    const attached = new Set<string>()
    if (startFrame) attached.add(endFrame ? "first-last" : "first")
    else if (endFrame) attached.add("first-last")
    if (refs.length + elementImageCount > 0) attached.add("references")
    const own = slot === "ref" ? ["references"] : slot === "start" ? ["first", "first-last"] : ["first-last"]
    for (const id of attached) {
      if (own.includes(id)) continue
      const mode = modes.find((m) => m.id === id)
      if (mode?.excludes?.some((x) => own.includes(x))) {
        return slot === "ref" ? "Reference images cannot be used with a start or end image on this model." : "A start or end image cannot be used with reference images on this model."
      }
    }
    return undefined
  }
  // What the controls show: the person's choices with the maker's rules applied
  const shown = shape?.profiled ? shape.params : values

  // Row controls: every general and unique setting the model has, most useful first, one row that wraps. Only advanced and technical
  // settings (seed, negative prompt, steps) are under More.
  const { rowKeys, moreKeys } = React.useMemo(() => {
    if (!record || !isMedia) return { rowKeys: [] as string[], moreKeys: [] as string[] }
    const props = record.params.properties
    const strip = (k: string) => (shotsKey && k === "shot_type") || COUNT_KEYS.includes(k)
    // Narrow: everything but the count goes in the settings panel, Multi-shot and Audio included
    if (narrow) {
      const all = Object.keys(props).filter((k) => isEditable(props[k]!) && !strip(k))
      return { rowKeys: Object.keys(props).filter((k) => COUNT_KEYS.includes(k) && isRowParam(k, props[k]!)), moreKeys: all.sort(byTier(props)) }
    }
    const inRow = Object.keys(props).filter((k) => k !== shotsKey && !(shotsKey && k === "shot_type") && isRowParam(k, props[k]!))
    const ordered = [...PINNED_PARAMS.filter((k) => inRow.includes(k)), ...inRow.filter((k) => !(PINNED_PARAMS as readonly string[]).includes(k))]
    const rest = Object.keys(props).filter((k) => k !== shotsKey && !(shotsKey && k === "shot_type") && isEditable(props[k]!) && !ordered.includes(k) && !(AUDIO_SWITCH_KEYS as readonly string[]).includes(k))
    return { rowKeys: ordered, moreKeys: rest.sort(byTier(props)) }
  }, [record, isMedia, shotsKey, narrow])

  // Inputs the model cannot run without, for example image-to-video needs a start image
  const missingInput = React.useMemo(() => {
    if (!record || !isMedia) return null
    if (isLegacy) {
      for (const key of record.params.required ?? []) {
        const prop = record.params.properties[key]
        if (prop?.format === "image" && !(refs.length > 0 || startFrame)) return "image input"
      }
      return null
    }
    for (const need of cap?.needs ?? []) {
      if (need === "start" && !startFrame) return "start image input"
      if (need === "reference" && composed.imageUrls.length === 0 && !startFrame) return "reference image"
      if (need === "video" && !sourceVideo) return "video input"
      if (need === "audio" && !sourceAudio) return "audio input"
    }
    // A required setting the app cannot fill in (no default, not a control it shows): say so before sending
    const blocked = record.params.request?.blockers[0]
    if (blocked) return `"${blocked}" setting that is not supported yet`
    // A required file field this build cannot classify still blocks the run honestly
    for (const key of record.params.required ?? []) {
      const prop = record.params.properties[key]
      if (prop?.format && !prop.slot) return prop.format
    }
    return null
  }, [record, isMedia, isLegacy, cap, startFrame, sourceVideo, sourceAudio, refs.length, composed.imageUrls.length])

  // Images and videos can be made several at a time. A model with a count field of its own uses it; one without is run that many times.
  const ownCount = record ? rowKeys.some((k) => COUNT_KEYS.includes(k)) || Object.keys(record.params.properties).some((k) => COUNT_KEYS.includes(k) && isEditable(record.params.properties[k]!)) : false
  // Elements this model cannot use at all (no room, no pictures, and no words to stand in): shown muted in the strip
  const mutedElements = React.useMemo(() => new Set(Object.entries(composed.reads).filter(([, why]) => why.startsWith("Left out")).map(([id]) => id)), [composed.reads])
  // What the strip shows: an element made of pictures only is gone while the model takes no pictures (it is still saved, and comes back
  // with a model that takes them). One with words of its own still works as text, so it stays, muted.
  const visibleElements = React.useMemo(
    () => elements.filter((e) => !isReferenceCategory(e.category) || referenceLimit > 0 || e.text.trim().length > 0),
    [elements, referenceLimit],
  )
  const strippedMuted = React.useMemo(() => new Set([...mutedElements, ...visibleElements.filter((e) => isReferenceCategory(e.category) && referenceLimit === 0).map((e) => e.id)]), [mutedElements, visibleElements, referenceLimit])
  const repeatable = isMedia && (mode === "image" || mode === "video") && Boolean(record) && !ownCount
  const repeat = repeatable ? repeatOf(values) : 1
  // The same model on other providers: a setting only they have stays in place, muted
  const elsewhere = React.useMemo(() => (record && isMedia && !isLegacy ? sameModelElsewhere(record, listed) : []), [record, isMedia, isLegacy, listed])
  const audioElsewhere = elsewhere.find((r) => audioSwitchKey(r.params.properties))
  const shotsElsewhere = elsewhere.find((r) => nativeShotsKey(r))
  const audioKey = record ? audioSwitchKey(record.params.properties) : undefined
  const hasAudioParam = Boolean(audioKey)

  const priceDisplay = React.useMemo(() => {
    if (!record) return "—"
    if (record.endpoint === record.id && record.price.source === "estimate" && activeModel) {
      const legacy = calculateGenerationPrice({
        model: activeModel,
        mode,
        duration: secondsOf(values),
        batchCount: countOf(values),
        resolution: typeof values.resolution === "string" ? values.resolution : undefined,
      })
      return `~${money.format(legacy.costUsd)}`
    }
    const est = estimateRun(record, values, { sourceVideo: Boolean(sourceVideo && videoOk), promptChars: prompt.length > 0 ? prompt.length : undefined })
    // The words say how sure the number is: "from" when the settings leave the tier open, "up to" when the model picks the length, "~" for a projection
    return est.usd === null ? "—" : `${est.upTo ? "up to " : ""}${est.from ? "from " : ""}${est.approximate || repeat > 1 ? "~" : ""}${money.format(est.usd * repeat)}`
  }, [record, activeModel, mode, values, money, sourceVideo, prompt.length, repeat])

  // How the number is worked out, for the hover on Generate ("5 s × $0.28/s")
  const priceWorking = React.useMemo(() => (record && !(record.endpoint === record.id) ? estimateRun(record, values, { sourceVideo: Boolean(sourceVideo && videoOk), promptChars: prompt.length > 0 ? prompt.length : undefined }).breakdown : undefined), [record, values, sourceVideo, videoOk, prompt.length])

  const send = React.useCallback(
    (textOverride?: string) => {
      const text = (textOverride ?? prompt).trim()
      if (!text) return
      // Blocked: say why, only now that a send was tried (never while typing)
      if (!record) {
        const nothingOn = listed.filter((r) => r.modality === modality).length === 0
        raiseChip({ key: "input:no-model", level: "warning", kind: "input", title: nothingOn ? "Add API key" : "Choose a model", message: nothingOn ? `No ${modeDef.label.toLowerCase()} model is on yet. Add a provider key and switch a model on.` : "Pick a model to generate with.", actions: nothingOn ? ["settings"] : [], settingsTab: "providers" })
        return
      }
      if (missingInput) {
        raiseChip({ key: "input:missing", level: "warning", kind: "input", title: `Needs ${missingInput}`, message: `${record.name} cannot run without a ${missingInput}. Add it from the strip above the prompt.`, actions: [] })
        return
      }
      // Shots on their own lines are written in the maker's syntax where the run is built (models/apply.ts), so a fallback or the Agent gets the same
      const shaped = composed.prompt
      onSendMessage({
        prompt: text,
        mode,
        targetDuration: secondsOf(values),
        batchCount: countOf(values),
        aspectRatio: aspectOf(values),
        characterRef: activeCharacterRef,
        referenceItem: isLegacy && refs[0] ? { id: refs[0].id, name: refs[0].name, imageUrl: refs[0].url } : null,
        startFrameUrl: hasStart ? startFrame?.url : undefined,
        endFrameUrl: hasEnd ? endFrame?.url : undefined,
        generationPrompt: isMedia
          ? shaped
          : activeSkills.some((k) => k.method.trim())
            ? `Work this way:\n${activeSkills.filter((k) => k.method.trim()).map((k) => `- ${k.name}: ${k.method.trim()}`).join("\n")}\n\nRequest: ${text}`
            : undefined,
        referenceUrls: (isMedia && !isLegacy) || chatVision ? composed.imageUrls : undefined,
        referenceGroups: isMedia && !isLegacy ? composed.groups : undefined,
        // Only what this model takes is sent: a video or sound it cannot use stays saved but unused
        sourceVideoUrl: isMedia && videoOk ? sourceVideo?.url : undefined,
        sourceAudioUrl: isMedia && audioOk ? sourceAudio?.url : undefined,
        cameraMotion: typeof values.camera_motion === "string" ? values.camera_motion : undefined,
        modelId: record.id,
        modelParams: isMedia ? { ...values, ...(task ? { [TASK_KEY]: task } : {}), ...(settings?.aiEngine.improvePrompts === false ? { [NO_ENHANCE_KEY]: true } : {}) } : undefined,
      })
      // What was written to make a picture, a video or a sound stays, to be changed and made again. A chat message or the agent's goal is sent and cleared.
      if (!isMedia) setPrompt("")
      // Pictures that went with a chat message belong to that message
      if (chatVision) setRefs([])
      setIsFocused(false)
      setIsMentionOpen(false)
      setIsModelSelectorOpen(false)
      setSlashOpen(false)
    },
    [prompt, record, missingInput, onSendMessage, mode, values, activeCharacterRef, isLegacy, refs, hasStart, hasEnd, startFrame, endFrame, isMedia, composed, sourceVideo, sourceAudio, activeSkills, task, chatVision, settings?.aiEngine.improvePrompts, videoOk, audioOk, listed, modality, modeDef.label],
  )

  // Speech: plain dictation fills the prompt; Talk sends each phrase and speaks the reply
  const sendRef = React.useRef(send)
  sendRef.current = send
  const [voiceNote, setVoiceNote] = React.useState<string | null>(null)
  // What was said: in Talk it is sent; in dictation it is put in the prompt, cleaned up first when that is switched on
  const onSpoken = React.useCallback(async (text: string) => {
    setVoiceNote(null)
    if (talkRef.current) {
      dictationStopRef.current()
      sendRef.current(text)
      return
    }
    const clean = settings?.aiEngine.polishSpoken && isMedia ? await polishSpoken(text, mode, settings) : text
    setPrompt((p) => (p ? `${p} ${clean}` : clean))
  }, [settings, isMedia, mode])
  const browserSpeech = useDictation(onSpoken, settings?.aiEngine.speechLanguage)
  const modelChosen = Boolean(settings && sttModel(settings))
  const recorded = useRecordedSpeech({
    enabled: modelChosen,
    transcribe: (audio) => (settings ? transcribe(audio, settings) : Promise.resolve("")),
    onText: onSpoken,
    onError: setVoiceNote,
    continuous: () => talkRef.current,
  })
  const dictation = modelChosen
    ? { supported: recorded.supported, listening: recorded.listening || recorded.busy, start: () => void recorded.start(), stop: recorded.stop, toggle: () => (recorded.listening ? recorded.stop() : void recorded.start()) }
    : browserSpeech
  const dictationStopRef = React.useRef(dictation.stop)
  dictationStopRef.current = dictation.stop

  React.useEffect(() => {
    talkRef.current = talk
  }, [talk])

  React.useEffect(() => {
    if (!isText && talk) {
      setTalk(false)
      dictationStopRef.current()
      window.speechSynthesis?.cancel()
    }
  }, [isText, talk])

  const dictationStartRef = React.useRef(dictation.start)
  dictationStartRef.current = dictation.start

  React.useEffect(() => {
    if (!talk || isGenerating || !lastAssistantText || lastSpoken.current === lastAssistantText) return
    lastSpoken.current = lastAssistantText
    const text = lastAssistantText.replace(/[*_`#>]/g, "").slice(0, 1200)
    const resume = () => {
      if (talkRef.current) dictationStartRef.current()
    }
    const inBrowser = () => {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = resume
      synth.speak(utterance)
    }
    if (settings && ttsModel(settings)) {
      void speechAudio(text, settings).then(
        (blob) => {
          if (!blob) return inBrowser()
          const audio = new Audio(URL.createObjectURL(blob))
          audio.onended = resume
          void audio.play().catch(inBrowser)
        },
        (e: unknown) => {
          setVoiceNote(e instanceof Error ? e.message : String(e))
          inBrowser()
        },
      )
    } else inBrowser()
  }, [talk, isGenerating, lastAssistantText]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTalk = () => {
    if (talk) {
      setTalk(false)
      dictation.stop()
      window.speechSynthesis?.cancel()
    } else {
      setTalk(true)
      dictation.start()
    }
  }

  // Auto-resize, or honor the height the user dragged to
  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${promptHeight ?? Math.min(Math.max(el.scrollHeight, 36), 120)}px`
  }, [prompt, isFocused, promptHeight])

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const startY = e.clientY
    const startHeight = textareaRef.current?.offsetHeight ?? 36
    const move = (ev: PointerEvent) => setPromptHeight(Math.round(Math.min(Math.max(startHeight + (startY - ev.clientY), 36), window.innerHeight * 0.6)))
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!prompt.trim()) setIsFocused(false)
        setIsMentionOpen(false)
        setIsModelSelectorOpen(false)
        setSlashOpen(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [prompt])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setPrompt(val)
    setSlashOpen(mode === "plan" && val.startsWith("/") && !val.includes(" "))
    if (val.startsWith("/")) setSlashIndex(0)
    const before = val.slice(0, e.target.selectionStart || val.length)
    // The list is open only while a name is being typed: after a finished @name and a space it closes
    const at = before.match(/(?:^|\s)@([^\n@]*)$/)
    const typed = at?.[1] ?? ""
    const open = Boolean(at) && (!/\s/.test(typed) || mentionItems.some((i) => i.name.toLowerCase().startsWith(typed.toLowerCase())))
    setMentionQuery(open ? typed : "")
    setIsMentionOpen(open)
  }

  const addReference = (item: { id: string; name: string; url: string }) =>
    setRefs((prev) => (prev.some((r) => r.id === item.id) ? prev : [...prev, item]))

  const toggleElement = (item: ElementItem) =>
    setElements((prev) => {
      if (prev.some((e) => e.id === item.id)) return prev.filter((e) => e.id !== item.id)
      // One camera, one light, one style, one effect: a second of the same kind replaces the first
      return [...prev.filter((e) => isReferenceCategory(item.category) || e.category !== item.category), item]
    })

  // Choosing something with @: it becomes an element or a reference, wherever it was typed
  const registerMention = (item: MentionReferenceItem) => {
    const element = libraryElements.find((e) => e.id === item.id)
    if (element) setElements((prev) => (prev.some((e) => e.id === element.id) ? prev : [...prev, element]))
    else addReference({ id: item.id, name: item.name, url: item.imageUrl })
    setPickedNames((n) => (n.includes(item.name) ? n : [...n, item.name]))
  }

  const handleSelectMention = (item: MentionReferenceItem) => {
    registerMention(item)
    const cursor = textareaRef.current?.selectionStart || prompt.length
    const before = prompt.slice(0, cursor)
    const after = prompt.slice(cursor)
    const atIndex = before.lastIndexOf("@")
    setPrompt(atIndex === -1 ? `${prompt} @${item.name} ` : `${before.slice(0, atIndex)}@${item.name} ${after}`)
    setIsMentionOpen(false)
    textareaRef.current?.focus()
  }

  const handleSelectMedia = (item: ReferenceMediaItem) => {
    const file = { url: item.url, name: item.title }
    if (pickTarget === "start") setStartFrame(file)
    else if (pickTarget === "end") setEndFrame(file)
    else if (pickTarget === "video") setSourceVideo(file)
    else if (pickTarget === "audio") setSourceAudio(file)
    else {
      // A video or a sound picked from the list goes to its own slot, if the model has one
      if (item.type === "video") {
        if (videoOk) setSourceVideo(file)
        return
      }
      if (item.type === "audio") {
        if (audioOk) setSourceAudio(file)
        return
      }
      // Several can be added in one visit: choosing a picked one again takes it off
      if (refs.some((r) => r.id === item.id)) setRefs((prev) => prev.filter((r) => r.id !== item.id))
      else if (referenceLimit > 0 && refs.length + elementImageCount < referenceLimit) addReference({ id: item.id, name: item.title, url: item.url })
      if (item.category === "influencer" && item.characterData) onSelectCharacterRef(item.characterData)
      return
    }
    setIsMediaModalOpen(false)
    textareaRef.current?.focus()
  }

  // "Reuse" on a result: switch to its mode, put its prompt back, and attach the image as a reference
  React.useEffect(() => {
    if (!reuse) return
    if (reuse.mode !== mode) switchMode(reuse.mode)
    setPrompt(reuse.prompt)
    if (reuse.imageUrl) addReference({ id: reuse.id, name: reuse.name, url: reuse.imageUrl })
    reuse.images?.forEach(addReference)
    // An opened video to work on: the video goes in its slot and the model that does the job is chosen
    if (reuse.edit) {
      setSourceVideo({ url: reuse.edit.videoUrl, name: reuse.edit.videoName })
      if (reuse.edit.task) pendingTask.current = { modelId: reuse.edit.modelId, task: reuse.edit.task }
      if (reuse.edit.modelId !== activeModelId) onModelChange(reuse.edit.modelId)
      else if (reuse.edit.task) {
        pendingTask.current = null
        setTask(reuse.edit.task)
      }
    }
    textareaRef.current?.focus()
  }, [reuse?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const [modalTab, setModalTab] = React.useState<"uploads" | "elements">("uploads")
  const [modalCategory, setModalCategory] = React.useState<ElementCategory | undefined>()
  // Files dropped on the composer or pasted into it: pictures, video and sound go where this model takes them
  const [dropping, setDropping] = React.useState(false)
  const addFiles = async (all: File[]) => {
    // Something that could not be added says so as a chip that goes away by itself
    const refuse = (title: string, message: string) => raiseChip({ key: "input:file", level: "warning", kind: "file", title, message, ttl: 6000 })
    // In chat a text file (notes, a CSV, code, a saved page) is read and written into the message as a quoted block
    let files = all
    if (isText) {
      const readable = (f: File) => /^text\//.test(f.type) || /\.(txt|md|markdown|csv|tsv|json|xml|html?|ya?ml|log|js|jsx|ts|tsx|py|css|sql|srt|vtt)$/i.test(f.name)
      const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)
      const docs = all.filter(readable)
      const isOffice = (f: File) => /\.(docx|xlsx)$/i.test(f.name)
      const pdfs = all.filter(isPdf)
      const office = all.filter(isOffice)
      files = all.filter((f) => !readable(f) && !isPdf(f) && !isOffice(f))
      for (const doc of office) {
        if (doc.size > 20_000_000) {
          refuse("File too large", `${doc.name} is over 20 MB. Send the part you need.`)
          continue
        }
        try {
          const text = /\.docx$/i.test(doc.name) ? await readDocxText(doc) : await readXlsxText(doc)
          const cut = text.length > 30_000
          setPrompt((p) => `${p.trim() ? `${p.trimEnd()}\n\n` : ""}[File: ${doc.name}]\n\`\`\`\n${cut ? text.slice(0, 30_000) : text}\n\`\`\`${cut ? "\n(The file is longer; only the first 30,000 characters are included.)" : ""}\n`)
        } catch (e) {
          refuse("File not read", e instanceof Error ? e.message : `${doc.name} could not be read.`)
        }
      }
      for (const pdf of pdfs) {
        if (pdf.size > 20_000_000) {
          refuse("File too large", `${pdf.name} is over 20 MB. Send the pages you need.`)
          continue
        }
        try {
          const { text, pages, cutAtPage } = await readPdfText(pdf)
          const cut = text.length > 30_000
          const note = cut ? "\n(The PDF is longer; only the first 30,000 characters are included.)" : cutAtPage ? `\n(The PDF has ${pages} pages; only the first ${cutAtPage} were read.)` : ""
          setPrompt((p) => `${p.trim() ? `${p.trimEnd()}\n\n` : ""}[File: ${pdf.name}, ${pages} page${pages === 1 ? "" : "s"}]\n\`\`\`\n${cut ? text.slice(0, 30_000) : text}\n\`\`\`${note}\n`)
        } catch (e) {
          refuse("PDF not read", e instanceof Error ? e.message : `${pdf.name} could not be read.`)
        }
      }
      for (const doc of docs) {
        if (doc.size > 400_000) {
          refuse("File too large", `${doc.name} is over 400 KB. Paste the part you need instead.`)
          continue
        }
        const body = (await doc.text()).trim()
        if (!body) continue
        const cut = body.length > 30_000
        setPrompt((p) => `${p.trim() ? `${p.trimEnd()}\n\n` : ""}[File: ${doc.name}]\n\`\`\`\n${cut ? body.slice(0, 30_000) : body}\n\`\`\`${cut ? "\n(The file is longer; only the first 30,000 characters are included.)" : ""}\n`)
      }
      setIsFocused(true)
    }
    if (!isMedia && !chatVision) {
      if (files.length > 0) refuse("File not supported", "This chat reads text, PDF, Word and Excel files. For pictures, pick a model that can see them.")
      return
    }
    for (const file of files) {
      if (!/^(image|video|audio)\//.test(file.type)) {
        refuse("File not supported", `${file.name} is not a picture, a video or a sound.`)
        continue
      }
      let saved: Awaited<ReturnType<typeof addUpload>>
      try {
        saved = await addUpload(file, library?.activeProjectId ?? "none")
        noteDuplicate(saved)
      } catch (e) {
        raiseChip({ key: "input:file", level: "error", kind: "file", title: "Upload failed", message: `${file.name} could not be saved.`, raw: e instanceof Error ? e.message : String(e), ttl: 8000 })
        continue
      }
      const asFile = { url: saved.url, name: saved.title }
      if (saved.type === "image") {
        if (referenceLimit > 0 && refs.length + elementImageCount < referenceLimit) addReference({ id: saved.id, name: saved.title, url: saved.url })
        else if (hasStart && !startFrame) setStartFrame(asFile)
        else refuse("Image not added", referenceLimit === 0 ? `${record?.name ?? "This model"} takes no reference images.` : `${record?.name ?? "This model"} takes ${referenceLimit} reference image${referenceLimit === 1 ? "" : "s"} and they are all used.`)
      } else if (saved.type === "video") {
        if (videoOk) setSourceVideo(asFile)
        else refuse("Video not added", `${record?.name ?? "This model"} does not take a video.`)
      } else if (audioOk) setSourceAudio(asFile)
      else refuse("Audio not added", `${record?.name ?? "This model"} does not take audio.`)
    }
  }

  const openMedia = (target: "start" | "end" | "general" | "video" | "audio") => {
    setPickTarget(target)
    setModalTab("uploads")
    setModalCategory(undefined)
    setIsMediaModalOpen(true)
  }
  // The Element picker, opened on one kind (characters, places and things, looks)
  const openElements = (category: ElementCategory) => {
    setPickTarget("general")
    setModalTab("elements")
    setModalCategory(category)
    setIsMediaModalOpen(true)
  }

  const switchMode = (next: GenerationMode) => {
    const def = MODES.find((m) => m.id === next)!
    setMode(next)
    try {
      localStorage.setItem("gencraft_composer_mode", next)
    } catch {
      // storage unavailable: the mode just will not persist
    }
    setModeOpen(false)
    if (def.modality !== modality) pickModelFor(def.modality)
  }

  // Skills offered for this mode, narrowed by what was typed after the slash
  // Skills belong to the Agent: Create and Edit have none
  const skillChoices = React.useMemo(() => {
    if (mode !== "plan") return []
    const q = prompt.startsWith("/") ? prompt.slice(1).trim().toLowerCase() : ""
    return agentSkills(allSkills).filter((k) => !q || `${k.name} ${k.description}`.toLowerCase().includes(q))
  }, [allSkills, mode, prompt])
  React.useEffect(() => {
    if (mode !== "plan") setActiveSkills((prev) => (prev.length ? [] : prev))
  }, [mode])

  // A skill that fits what is being typed, offered but never applied on its own
  const pickSkill = (skill: Skill) => {
    // At most two skills at once; a third replaces the oldest
    setActiveSkills((prev) => (prev.some((k) => k.id === skill.id) ? prev.filter((k) => k.id !== skill.id) : [...prev, skill].slice(-LIMITS.active)))
    setPrompt("")
    setSlashOpen(false)
    textareaRef.current?.focus()
  }

  React.useEffect(() => {
    if (fromHistory.current) {
      fromHistory.current = false
      return
    }
    promptHistory.current.record(prompt, textareaRef.current?.selectionStart ?? prompt.length)
  }, [prompt])

  const stepHistory = (way: "undo" | "redo") => {
    const snap = promptHistory.current[way]()
    if (!snap) return
    fromHistory.current = true
    setPrompt(snap.value)
    setIsMentionOpen(false)
    window.requestAnimationFrame(() => textareaRef.current?.setSelectionRange(snap.caret, snap.caret))
  }

  const mentionNames = React.useMemo(() => [...new Set([...pickedNames, ...mentionItems.map((r) => r.name)])], [pickedNames, mentionItems])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && !e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault()
      stepHistory(e.shiftKey ? "redo" : "undo")
      return
    }
    if (mod && !e.altKey && e.key.toLowerCase() === "y") {
      e.preventDefault()
      stepHistory("redo")
      return
    }
    // A picked @mention is one thing: with the caret right after it, one Backspace removes all of it
    if (e.key === "Backspace" && !mod && !e.altKey && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
      const hit = mentionBeforeCaret(prompt, e.currentTarget.selectionStart, mentionNames)
      if (hit) {
        e.preventDefault()
        setPrompt(prompt.slice(0, hit.start) + prompt.slice(hit.end))
        setIsMentionOpen(false)
        setHoverMention(null)
        window.requestAnimationFrame(() => textareaRef.current?.setSelectionRange(hit.start, hit.start))
        return
      }
    }
    if (slashOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        if (skillChoices.length > 0) setSlashIndex((i) => (i + (e.key === "ArrowDown" ? 1 : skillChoices.length - 1)) % skillChoices.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        if (skillChoices[slashIndex]) pickSkill(skillChoices[slashIndex]!)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setSlashOpen(false)
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const ModeIcon = modeDef.icon
  const showRefs = (isMedia || chatVision || features.some((o) => CREATE_FEATURES.includes(o.def.id)) || Boolean(task) || Boolean(activeFeature && featureFrom) || hasStart || hasEnd || referenceLimit > 0 || refs.length > 0 || elements.length > 0 || activeSkills.length > 0 || Boolean(cap?.sourceVideo) || Boolean(cap?.sourceAudio) || Boolean(cap?.videos) || Boolean(cap?.audios))

  // Agent mode chooses a group (Low, Medium, High, or the user's own) instead of a single model
  const groups = React.useMemo(() => resolveGroups(settings?.aiEngine.groups, listed), [settings?.aiEngine.groups, listed])
  const activeGroupId = settings?.aiEngine.activeGroupId ?? groups[Math.min(1, groups.length - 1)]?.id
  const selectGroup = (id: string) => {
    if (settings && onSettingsChange) onSettingsChange({ ...settings, aiEngine: { ...settings.aiEngine, activeGroupId: id } })
  }
  const groupHint = (group: (typeof groups)[number]) =>
    GROUP_MODALITIES.map((m) => {
      const id = group.models[m]?.modelId
      return `${GROUP_LABEL[m]}: ${(id && records.find((r) => r.id === id)?.name) || "not set"}`
    }).join("\n")

  const groupControl = narrow ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="pill" size="chip" className="flex-shrink-0">
          <Wand2 className="h-3 w-3 text-muted-foreground" />
          {groups.find((g) => g.id === activeGroupId)?.name ?? "Group"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-44 p-1">
        {groups.map((g) => (
          <Button key={g.id} type="button" variant="ghost" size="sm" onClick={() => selectGroup(g.id)} className={`h-8 w-full justify-between ${g.id === activeGroupId ? "bg-secondary text-foreground" : ""}`}>
            {g.name}
            {g.id === activeGroupId && <Check className="h-3.5 w-3.5" />}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  ) : (
    <div className="flex flex-shrink-0 items-center gap-1">
      {groups.map((g) => (
        <Tooltip key={g.id}>
          <TooltipTrigger asChild>
            <Button type="button" variant="pill" size="chip" aria-pressed={g.id === activeGroupId} onClick={() => selectGroup(g.id)}>
              {g.name}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="whitespace-pre-line">{groupHint(g)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )

  // Nothing to choose until a provider has a key. The pill says so and takes the user to the place to add one.
  const noModels = !record && listed.filter((r) => r.modality === modality).length === 0

  // A chip belongs to the situation it was raised in. Change the model, the mode or anything attached and the old ones go: nothing
  // from the last model or the last run is left on screen. (A model's settings chip, "schema:", looks after itself.)
  React.useEffect(() => {
    clearChips(/^(input|error|limit):/)
  }, [record?.id, mode, startFrame, endFrame, sourceVideo, sourceAudio, refs.length, elements.length])

  // What is behind the composer is never hidden: the feeds above it leave room for its real height, strip and chips included
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const root = document.documentElement
    const apply = () => root.style.setProperty("--composer-h", dockSide === "bottom" ? `${Math.round(el.getBoundingClientRect().height)}px` : "0px")
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty("--composer-h")
    }
  }, [dockSide])

  // What is only true while this composer is on screen goes with it
  React.useEffect(() => () => clearChips(/^(input|schema):/), [])

  // A model's settings that failed to load: say so, with a retry
  React.useEffect(() => {
    if (!record || !isMedia) return
    const key = `schema:${record.id}`
    if (schemaStatus.state === "error") {
      raiseChip({
        key,
        level: "error",
        kind: "provider-fault",
        title: "Settings not loaded",
        message: `The settings for ${record.name} could not be loaded.`,
        raw: schemaStatus.error,
        actions: ["retry"],
        retry: () => void ensureSchema(record.id, falKey),
      })
    } else clearChips(key)
  }, [record?.id, isMedia, schemaStatus.state]) // eslint-disable-line react-hooks/exhaustive-deps
  const addKeyPill = (
    <Button type="button" variant="pill" size="chip" onClick={() => onOpenSettings?.("providers")} className="flex-shrink-0 border-dashed text-foreground">
      <KeyRound className="h-3 w-3" />
      {!narrow && (keyedProviders.length === 0 ? "Add API key" : `No ${modeDef.label.toLowerCase()} models on`)}
    </Button>
  )

  const modelPill = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="pill" size="chip" aria-pressed={isModelSelectorOpen} onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)} className="flex-shrink-0 text-foreground">
          {record && <ModelLogo name={record.name} endpoint={record.endpoint} family={record.family} provider={record.provider} size={14} />}
          {!narrow && <span className="max-w-40 truncate">{record?.name ?? "Choose model"}</span>}
          {record && <FilterBadge model={record} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{record?.name ?? "Choose model"}</TooltipContent>
    </Tooltip>
  )

  const rowControls = (
    <>
      {record &&
        rowKeys.map((key) => {
          const prop = record.params.properties[key]!
          const set = (v: unknown) => setValues((prev) => ({ ...prev, [key]: v }))
          return COUNT_KEYS.includes(key) ? (
            <CountStepper key={key} prop={prop} value={shown[key]} onChange={set} />
          ) : prop.type === "boolean" ? (
            <ToggleParam key={key} name={key} prop={prop} value={shown[key]} onChange={set} locked={shape?.locked[key]} />
          ) : (
            <ParamPill
              key={key}
              name={key}
              prop={withOptions(prop, shown[key])}
              value={shown[key]}
              onChange={set}
              locked={shape?.locked[key]}
              allowed={shape?.narrowed[key]?.allowed}
              why={shape?.narrowed[key]?.reason}
            />
          )
        })}
      {repeatable && (
        <CountStepper
          prop={{ type: "integer", minimum: 1, maximum: MAX_REPEAT }}
          value={repeat}
          onChange={(v) => setValues((prev) => ({ ...prev, [REPEAT_KEY]: v }))}
        />
      )}
      {!narrow && !shotsKey && shotsElsewhere && mode === "video" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button type="button" variant="pill" size="chip" disabled aria-label="Multi-shot" className="flex-shrink-0 opacity-40">
                <Clapperboard className="h-3 w-3" />
                <span>Multi-shot</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Multi-shot: not on {providerName(record?.provider)}</TooltipContent>
        </Tooltip>
      )}
      {!narrow && shotsKey && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="pill" size="chip" aria-pressed={shotsOn} aria-label="Multi-shot" onClick={() => setValues((prev) => ({ ...prev, [shotsKey]: !prev[shotsKey] }))} className="flex-shrink-0">
              <Clapperboard className="h-3 w-3" />
              <span>Multi-shot</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Multi-shot</TooltipContent>
        </Tooltip>
      )}
      {!narrow && !hasAudioParam && audioElsewhere && mode === "video" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button type="button" variant="pill" size="chip" disabled aria-label="Audio" className="flex-shrink-0 opacity-40">
                <VolumeX className="h-3 w-3" />
                <span>Audio</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Audio: not on {providerName(record?.provider)}</TooltipContent>
        </Tooltip>
      )}
      {!narrow && hasAudioParam && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="pill" size="chip" aria-pressed={Boolean(values[audioKey!])} aria-label="Generate audio" onClick={() => setValues((prev) => ({ ...prev, [audioKey!]: !prev[audioKey!] }))} className="flex-shrink-0">
              {values[audioKey!] ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              <span>Audio</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Audio</TooltipContent>
        </Tooltip>
      )}
      {isMedia && schemaStatus.state === "loading" && (
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" aria-label="Loading parameters" />
      )}
      {isMedia && schemaStatus.state === "error" && record && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="pill" size="chipIcon" aria-label="Retry loading parameters" onClick={() => void ensureSchema(record.id, falKey)} className="flex-shrink-0">
              <SlidersHorizontal className="h-3 w-3 text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Parameters failed to load. Click to retry. {schemaStatus.error}</TooltipContent>
        </Tooltip>
      )}
    </>
  )

  // Top right cluster: History (Chat/Agent), Dictate, Talk, then Dock; the prompt keeps clear of it
  const showHistory = Boolean(history) && (mode === "chat" || mode === "plan")
  const showDictate = dictation.supported && !talk && mode !== "audio"
  const showTalk = dictation.supported && isText
  const clusterCount = (showHistory ? 1 : 0) + (showDictate ? 1 : 0) + (showTalk ? 1 : 0) + (onToggleDock ? 1 : 0)
  // In a narrow composer (docked at a side) they sit in a row above the prompt, so the words use the whole width
  const clusterPad = clusterCount > 0 && !narrow ? clusterCount * 26 + 8 : 0

  return (
    <TooltipProvider delayDuration={150}>
      <div
        ref={containerRef}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDropping(false)
          void addFiles(Array.from(e.dataTransfer.files))
        }}
        className="relative mx-auto w-full max-w-4xl select-none px-4 pb-4"
      >
        {dropping && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 top-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-select/50 bg-card/80 animate-in fade-in duration-100">
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <MediaReferenceModal
          isOpen={isMediaModalOpen}
          onClose={() => setIsMediaModalOpen(false)}
          initialTab={modalTab}
          initialCategory={modalCategory}
          onSelectReference={handleSelectMedia}
          selectedReferenceIds={refs.map((r) => r.id)}
          onSelectElement={toggleElement}
          selectedElementIds={elements.map((e) => e.id)}
          settings={settings}
          onOpenSettings={onOpenSettings}
          elementsLocked={!isMedia}
          placement={dockSide === "bottom" ? "above" : "center"}
          referenceNote={
            !isMedia && !chatVision
              ? "References and elements are used in Image, Video and Audio. Switch mode to use them."
              : pickTarget !== "general"
                ? undefined
                : referenceLimit === 0
                ? "This model takes no reference images. Camera, light, style and effects elements still work."
                : `This model takes ${referenceLimit} reference image${referenceLimit === 1 ? "" : "s"}${cap?.images && !cap.images.stated ? " (the provider does not state a limit)" : ""}. ${refs.length + elementImageCount} used.`
          }
          referencesLocked={!isMedia && !chatVision}
          unsupportedTypes={unsupportedTypes}
          singlePick={pickTarget !== "general"}
          onDeleted={(ids) => {
            setRefs((prev) => prev.filter((r) => !ids.includes(r.id)))
            setElements((prev) => prev.filter((e) => !ids.includes(e.id)))
          }}
          assets={library?.assets}
          projects={library?.projects}
          activeProjectId={library?.activeProjectId}
        />

        <MentionPopover
          isOpen={isMentionOpen}
          searchQuery={mentionQuery}
          items={mentionItems}
          onSelect={handleSelectMention}
          onClose={() => setIsMentionOpen(false)}
        />

        {isModelSelectorOpen && (
          <ModelSelectorPopover
            compact={narrow}
            activeModelId={activeModelId}
            modality={modality}
            onSelectModel={(newId) => {
              const picked = records.find((r) => r.id === newId)
              if (picked) {
                try {
                  localStorage.setItem(`gencraft_mode_model_${picked.modality}`, picked.id)
                } catch {
                  // storage unavailable: the choice just will not persist
                }
                setMode((prev) => (picked.modality === "text" ? (prev === "plan" ? "plan" : "chat") : (picked.modality as GenerationMode)))
              }
              autoPicked.current = null
              onModelChange(newId)
            }}
            needs={isMedia ? { start: Boolean(startFrame), end: Boolean(endFrame), images: refs.length + elementImageCount, video: Boolean(sourceVideo), audio: Boolean(sourceAudio) } : undefined}
            onClose={() => setIsModelSelectorOpen(false)}
            settings={settings}
            onOpenSettings={onOpenSettings}
          />
        )}

        {/* / opens the skills list: the user's own first, then the presets for this mode */}
        {slashOpen && (
          <div className="absolute bottom-full left-4 z-50 mb-2 max-h-72 w-80 overflow-y-auto rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-100 no-scrollbar">
            <div className="px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">Skills</div>
            {skillChoices.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No skills yet. Add one in Agents, Skills.
              </p>
            )}
            {skillChoices.map((skill, idx) => {
              const on = activeSkills.some((k) => k.id === skill.id)
              return (
                <Button
                  key={skill.id}
                  type="button"
                  variant="ghost"
                  onClick={() => pickSkill(skill)}
                  onMouseEnter={() => setSlashIndex(idx)}
                  className={`h-auto w-full justify-between gap-2 rounded-xl px-2.5 py-2 text-left ${idx === slashIndex ? "bg-secondary text-foreground" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{skill.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{skill.description}</span>
                    </span>
                  </span>
                  {on && <Check className="h-3.5 w-3.5 flex-shrink-0 text-foreground" />}
                </Button>
              )
            })}
          </div>
        )}

        {/* What went wrong, as chips just above the composer: never behind it */}
        <ErrorChips onOpenSettings={onOpenSettings} />

        {/* Start, End, Ref sit behind the card and rise above its top edge; only slots this model has */}
        {showRefs && (
          <div className="relative z-0 -mb-3 flex flex-wrap items-end gap-2 px-4">
            <ReferenceBox
              start={hasStart ? { frame: startFrame, blocked: blockedSlot("start"), onPick: () => openMedia("start"), onClear: () => setStartFrame(null) } : undefined}
              end={hasEnd ? { frame: endFrame, blocked: blockedSlot("end"), onPick: () => openMedia("end"), onClear: () => setEndFrame(null) } : undefined}
              video={cap?.sourceVideo || cap?.videos || famCap.videos ? { ...clipLabel(activeFeature?.id ?? task), frame: sourceVideo, onPick: () => openMedia("video"), onClear: () => setSourceVideo(null) } : undefined}
              audio={cap?.sourceAudio || cap?.audios || famCap.audios ? { frame: sourceAudio, onPick: () => openMedia("audio"), onClear: () => setSourceAudio(null) } : undefined}
              images={
                referenceLimit > 0
                  ? { items: refs, fromElements: elementImageCount, limit: referenceLimit, blocked: blockedSlot("ref"), onPick: () => openMedia("general"), onRemove: (id) => setRefs((prev) => prev.filter((x) => x.id !== id)) }
                  : undefined
              }
              brand={isMedia ? { kits: brandKits.map((k) => ({ id: k.id, name: k.name, logo: pickLogo(k, isDark)?.url })), selectedId: brandId ?? undefined, onSelect: setBrandId } : undefined}
              elements={visibleElements}
              onRemoveElement={(id) => setElements((prev) => prev.filter((x) => x.id !== id))}
              reads={composed.reads}
              onOpenElements={openElements}
              mutedElements={strippedMuted}
              picturesMuted={isMedia && referenceLimit === 0 ? "no reference images" : undefined}
              elementsLocked={!isMedia}
            />
            {activeFeature && featureFrom && (
              <FeatureTile
                label={`Leave ${activeFeature.label}`}
                hint="Go back to the model you came from."
                icon={Undo2}
                onClick={() => {
                  const back = featureFrom
                  setFeatureFrom(null)
                  onModelChange(back)
                }}
              />
            )}
            {features
              .filter((o) => CREATE_FEATURES.includes(o.def.id))
              .map((o) => (
                <FeatureTile
                  key={o.def.id}
                  label={o.def.label}
                  hint={o.def.hint}
                  icon={FEATURE_ICON[o.def.id]}
                  onClick={() => {
                    setFeatureFrom(record!.id)
                    onModelChange(o.record.id)
                  }}
                />
              ))}
            {task && <FeatureTile label={tasks.find((k) => k.id === task)?.label ?? task} hint="Click to stop" icon={Scissors} active onClick={() => setTask(null)} />}
            {activeSkills.map((k) => (
              <FeatureTile key={k.id} label={k.name} hint="Click to remove" icon={Sparkles} active onClick={() => setActiveSkills((prev) => prev.filter((x) => x.id !== k.id))} />
            ))}
          </div>
        )}

        {voiceNote && (
          <p className="mb-1 flex max-w-full items-center gap-2 px-4 text-xs text-destructive">
            <span>{voiceNote}</span>
            <Button type="button" variant="ghost" size="iconSm" aria-label="Dismiss" className="h-5 w-5" onClick={() => setVoiceNote(null)}>
              <X className="h-3 w-3" />
            </Button>
          </p>
        )}
        <div className="relative">
        {showHistory && historyOpen && history && (
          <div className="absolute inset-x-0 bottom-full z-0 -mb-3">
            <HistoryList {...history} onClose={() => setHistoryOpen(false)} />
          </div>
        )}
        <BorderGlow active={isFocused || prompt.length > 0} className="relative z-10 rounded-2xl">
          <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-2xl">
            {clusterCount > 0 && (
              <div className={narrow ? "z-20 -mb-1 flex items-center justify-end gap-0.5 pt-1" : "absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5"}>
                {showHistory && <HistoryButton open={historyOpen} onToggle={() => setHistoryOpen((v) => !v)} />}
                {showDictate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="iconSm" aria-pressed={dictation.listening} onClick={dictation.toggle} className="h-6 w-6 rounded-md p-0 text-muted-foreground hover:text-foreground" aria-label="Dictate">
                        {dictation.listening ? <MicOff className="h-3 w-3 animate-pulse" /> : <Mic className="h-3 w-3" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Dictate</TooltipContent>
                  </Tooltip>
                )}
                {showTalk && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="iconSm" aria-pressed={talk} onClick={toggleTalk} className="h-6 w-6 rounded-md p-0 text-muted-foreground hover:text-foreground" aria-label="Talk">
                        <AudioLines className={`h-3 w-3 ${talk ? "animate-pulse" : ""}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Talk</TooltipContent>
                  </Tooltip>
                )}
                {onToggleDock && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        aria-label={dockSide === "right" ? "Dock bottom" : "Dock right"}
                        onClick={onToggleDock}
                        className="h-6 w-6 rounded-md p-0 text-muted-foreground hover:text-foreground"
                      >
                        {dockSide === "right" ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowRightToLine className="h-3 w-3" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{dockSide === "right" ? "Dock bottom" : "Dock right"}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            {/* Drag up to make the prompt bigger, double-click to reset */}
            <div
              role="separator"
              aria-label="Drag to resize the prompt"
              onPointerDown={startResize}
              onDoubleClick={() => setPromptHeight(null)}
              className="absolute inset-x-0 top-0 flex h-3 cursor-ns-resize items-center justify-center"
            >
              <span className="h-1 w-8 rounded-full bg-border" />
            </div>

            <PromptInput onSubmit={() => send()} className="flex flex-col gap-2" groupClassName="h-auto flex-col items-stretch gap-2 overflow-visible rounded-none border-0 bg-transparent shadow-none ring-0 dark:bg-transparent has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0">
            {shotsOn && shotsKey ? (
              <div style={{ paddingRight: clusterPad }}>
                <ShotStrip
                  value={prompt}
                  onChange={(next) => {
                    setPrompt(next)
                    setIsFocused(true)
                  }}
                  withLength={Boolean(shotsDef?.virtual)}
                  totalSeconds={secondsOf(values)}
                  option={shotOption}
                  onSubmit={() => send()}
                  mentionItems={mentionItems}
                  onMention={registerMention}
                />
              </div>
            ) : (
            <div
              className="relative px-0.5 pt-2"
              style={{ paddingRight: clusterPad || undefined }}
              onMouseMove={(e) => {
                const host = e.currentTarget.getBoundingClientRect()
                for (const mark of backdropRef.current?.querySelectorAll("mark") ?? []) {
                  for (const r of mark.getClientRects()) {
                    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue
                    const name = (mark.textContent ?? "").replace(/^@/, "").trim().toLowerCase()
                    const item = mentionItems.find((i) => i.name.toLowerCase() === name)
                    if (!item) return setHoverMention(null)
                    return setHoverMention((h) => (h?.name === item.name ? h : { name: item.name, url: item.imageUrl, left: r.left - host.left + r.width / 2, top: r.top - host.top }))
                  }
                }
                setHoverMention((h) => (h ? null : h))
              }}
              onMouseLeave={() => setHoverMention(null)}
            >
              {hoverMention && (
                <div className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full pb-2 animate-in fade-in zoom-in-95 duration-100" style={{ left: hoverMention.left, top: hoverMention.top }}>
                  <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
                    <img src={hoverMention.url} alt="" className="h-28 w-28 object-cover" />
                  </div>
                </div>
              )}
              {/* Highlight layer: same text and metrics as the textarea, only @mentions are painted */}
              <div
                ref={backdropRef}
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-0.5 top-2 overflow-hidden whitespace-pre-wrap break-words text-sm leading-relaxed text-transparent"
                style={{ right: clusterPad || 2 }}
              >
                {mentionSegments(prompt, [...pickedNames, ...mentionItems.map((r) => r.name)], (name) => kindOf(mentionKinds.get(name.toLowerCase()))).map((seg, i) =>
                  seg.mention ? (
                    <mark key={i} className={`rounded-sm text-transparent ring-1 ring-inset [box-decoration-break:clone] ${KIND_STYLE[seg.kind ?? "reference"].pill}`}>
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
                {"\u200b"}
              </div>
              <PromptInputTextarea
                ref={textareaRef}
                rows={1}
                value={prompt}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onScroll={(e) => {
                  if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
                }}
                onFocus={() => setIsFocused(true)}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData?.files ?? [])
                  if (files.length === 0) return
                  e.preventDefault()
                  void addFiles(files)
                }}
                placeholder={shotsOn ? "One shot per line, e.g. 4s A knight rides  ·  @ assets" : `${modeDef.placeholder}  ·  @ assets${mode === "plan" ? "  ·  / skills" : ""}`}
                className="relative max-h-none min-h-0 w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
              />
            </div>
            )}

            <PromptInputFooter className="gap-3 border-t border-border/30 p-0 pt-1.5">
              <ScrollRow>
                {/* Mode: Chat by default, other modes in a small icon popup */}
                <Popover open={modeOpen} onOpenChange={setModeOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="pill" size="chipIcon" aria-label={`Mode: ${modeDef.label}`} className="flex-shrink-0 text-foreground">
                          <ModeIcon className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{modeDef.label}</TooltipContent>
                  </Tooltip>
                  <PopoverContent align="start" side="top" className="flex w-auto gap-1 border border-border bg-popover p-1 text-popover-foreground shadow-xl">
                    {MODES.map((m) => (
                      <Tooltip key={m.id}>
                        <TooltipTrigger asChild>
                          <Button type="button" variant={m.id === mode ? "secondary" : "ghost"} size="icon" aria-label={m.label} onClick={() => switchMode(m.id)}>
                            <m.icon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{m.label}</TooltipContent>
                      </Tooltip>
                    ))}
                  </PopoverContent>
                </Popover>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="pill" size="chipIcon" onClick={() => openMedia("general")} className="flex-shrink-0" aria-label="Add reference" data-media-trigger>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Attach</TooltipContent>
                </Tooltip>

                {noModels ? addKeyPill : mode === "plan" ? groupControl : modelPill}
                {rowControls}

                {record && moreKeys.length > 0 && (
                  <MoreMenu>
                    <SchemaForm
                      schema={record.params}
                      values={shown}
                      onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
                      only={moreKeys}
                      layout="rows"
                      locked={shape?.locked}
                      narrowed={shape?.narrowed}
                    />
                  </MoreMenu>
                )}
                {shape && shape.tips.length > 0 && (
                  <Popover>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="pill" size="chipIcon" aria-label="Tips for this model" className="flex-shrink-0">
                            <Lightbulb className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Tips</TooltipContent>
                    </Tooltip>
                    <PopoverContent align="start" className="w-72 border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
                      <p className="mb-1.5 font-semibold">Getting a good result</p>
                      <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                        {shape.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
              </ScrollRow>

              <div className="flex flex-shrink-0 items-center gap-2">
                {dictation.supported && mode === "audio" && (
                  <ButtonGroup aria-label="Give the text by writing or by talking" data-testid="write-or-talk">
                    <Button type="button" variant="pill" size="chip" aria-pressed={!dictation.listening} onClick={() => dictation.listening && dictation.toggle()}>
                      <Pencil className="h-3 w-3" />
                      Write
                    </Button>
                    <Button type="button" variant="pill" size="chip" aria-pressed={dictation.listening} onClick={() => !dictation.listening && dictation.toggle()}>
                      <Mic className="h-3 w-3" />
                      Talk
                    </Button>
                  </ButtonGroup>
                )}

                {narrow ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PromptInputSubmit disabled={!prompt.trim() || !record || Boolean(missingInput)} className="h-9 w-9 flex-shrink-0 rounded-full p-0" aria-label={modeDef.cta}>
                        <ArrowUp className="h-4 w-4" />
                      </PromptInputSubmit>
                    </TooltipTrigger>
                    <TooltipContent>{missingInput ? `This model needs a ${missingInput}` : `${modeDef.cta} · ${priceDisplay}${priceWorking ? ` (${priceWorking})` : ""}${shape && shape.warnings.length > 0 ? `. ${shape.warnings.join(" ")}` : ""}`}</TooltipContent>
                  </Tooltip>
                ) : (
                  <PromptInputSubmit
                    disabled={!prompt.trim() || !record || Boolean(missingInput)}
                    title={missingInput ? `This model needs a ${missingInput}` : shape && shape.warnings.length > 0 ? shape.warnings.join(" ") : undefined}
                    className="group flex h-12 min-w-28 flex-shrink-0 select-none flex-col items-center justify-center gap-0 rounded-xl bg-primary px-4 text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                    aria-label={modeDef.cta}
                  >
                    <span className="text-xs font-bold uppercase leading-tight tracking-wider">{modeDef.cta}</span>
                    {mode !== "chat" && mode !== "plan" && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs font-medium leading-none opacity-90">
                        <Coins className="h-2.5 w-2.5" />
                        <span className="font-semibold">{priceDisplay}</span>
                      </div>
                    )}
                  </PromptInputSubmit>
                )}
              </div>
            </PromptInputFooter>
            </PromptInput>
          </div>
        </BorderGlow>
        </div>
      </div>
    </TooltipProvider>
  )
}

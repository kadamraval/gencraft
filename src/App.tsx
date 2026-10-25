import { toolContextOf } from "@/components/ai-tools/use-tool-context"
import type { AgentToolEnv } from "@/lib/ai-tools/agent-env"
import { toolById } from "@/lib/ai-tools/catalog"
import { statusOf } from "@/lib/ai-tools/match"
import { paramsFor, priceOf, runTool } from "@/lib/ai-tools/run"
import type { ToolMedia } from "@/lib/ai-tools/run"
import { getToolRecords } from "@/lib/registry/store"
import { ToolHostProvider } from "@/components/ai-tools/tool-host"
import { usageLedger } from "@/lib/ledger/usage-store"
import * as React from "react"
import { askYesNo, limited } from "@/lib/notice"
import { loadProjects, saveProjects } from "@/lib/projects/saved"
import { NoticeToast } from "@/components/ui/notice-toast"
import { setAppearance, useAppearance } from "@/lib/appearance"
import { syncNewAssets } from "@/lib/integrations/cloud-sync"
import { saveResultsToFolder, setProjectNames, startBackupScheduler, startFolderMirror } from "@/lib/backup/service"
import { InspirationView } from "@/components/inspiration/inspiration-view"
import {
  MainNavTab,
  MediaTypeFilter,
  MediaStatusFilter,
  DateRangeFilter,
  MediaActivityFilter,
  LayoutMode,
  CardSizeStep,
  ChatMessage,
  MediaAsset,
  VideoSceneBeat,
  CharacterReference,
  SettingsState,
  GenerationMode,
  Project,
  ProviderType,
} from "@/types"
import { MasterPasswordGate } from "@/components/auth/master-password-gate"
import { hasPassword, markUnlocked, startsLocked } from "@/lib/auth/lock"
import { TitleBar } from "@/components/layout/title-bar"
import { ChatView } from "@/components/chat/chat-view"
import { ChatInput } from "@/components/chat/chat-input"
import { ComposerSlot } from "@/components/chat/composer-slot"
import { useComposerDock } from "@/lib/ui/composer-dock"
import { StoryView } from "@/components/story/story-view"
import { SettingsModal } from "@/components/settings/settings-modal"
import { ProjectModal } from "@/components/projects/project-modal"
import { VideoStitcherPlayer } from "@/components/player/video-stitcher-player"
import { DotField } from "@/components/ui/dot-field"
import { AppsView } from "@/components/apps/apps-view"
import { HomeView, type HomeTarget } from "@/components/home/home-view"
import { DocsView } from "@/components/help/docs-view"
import { SupportView } from "@/components/help/support-view"
import { TutorialsView } from "@/components/help/tutorials-view"
import { loadBrands } from "@/lib/brand/brand-storage"
import { pickLogo } from "@/lib/brand/logos"
import { BrandStudioView } from "@/components/brand/brand-studio-view"
import { BrandKit } from "@/types/brand"
import { MediaVaultView } from "@/components/media-vault/media-vault-view"
import { MediaDetailModal, DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import { executeWithFallback } from "@/lib/agent/fallback-router"
import type { ResolvedModelInfo } from "@/lib/agent/fallback-router"
import { dispatchLiveProviderRequest, getProviderApiKey } from "@/lib/providers/live-connectors"
import { adaptGenerationPackage } from "@/lib/providers/model-capabilities"
import { MODEL_CATALOG } from "@/lib/providers/catalog"
import { startPackScheduler } from "@/lib/packs/store"
import { startKnowledgeScheduler } from "@/lib/knowledge/store"
import { startAppUpdateScheduler } from "@/lib/updates/app-update"
import { getListedModels, getRecord, resolveAIModel, setPriceOverrides, setProviderKeys, startRegistryScheduler, useListedModels } from "@/lib/registry/store"
import { computeDefaultEnabled, enabledSet } from "@/lib/registry/enabled"
import { listBookmarks, seedBookmarks } from "@/lib/registry/bookmarks"
import { liveRegistry } from "@/lib/apps/runtime"
import { recordTextEstimate, withUsage } from "@/lib/ledger/text-usage"
import { reconcileFalUsage } from "@/lib/ledger/fal-usage"
import type { Meter } from "@/lib/ledger/text-usage"
import { saveApp } from "@/lib/apps/store"
import type { AppMeta } from "@/lib/apps/app-types"
import type { Brief as AppBrief } from "@/lib/apps/blocks"
import type { AppSpec } from "@/lib/apps/types"
import { editActionsFor } from "@/lib/registry/edit-actions"
import { chipFromError, clearChips, raiseChip } from "@/lib/ui/chips"
import { repeatOf } from "@/lib/registry/param-logic"
import type { EditAction } from "@/lib/registry/edit-actions"
import { expectedRun, recordRunTime } from "@/lib/ledger/run-times"
import { explainError } from "@/lib/errors/explain"
import { AgentWorkspace } from "@pro/agent/agent-sections"
import { UpgradeCard } from "@/components/license/upgrade-card"
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"
import { shouldShowSetup } from "@/lib/home/onboarding"
import { FEATURE_NAMES, assertCanAdd, useFeature } from "@/lib/license"
import { ChatWorkspace } from "@/components/chat/chat-workspace"
import { agentBridge, chatBridge } from "@/lib/agent/bridge"
import { legacyToUi } from "@/lib/chat/stream"
import type { StreamDeps } from "@/lib/chat/stream"
import { generateText, isStepCount } from "ai"
import type { LanguageModel, UIMessage } from "ai"
import { agentTitle } from "@/lib/agent/chat"
import type { AgentRuntime, StudioUIMessage } from "@/lib/agent/chat"
import { toInlineUrl } from "@/lib/registry/connectors"
import { canRunAgent, canSearchWeb, chatModelFor, studioModel } from "@/lib/agent/model"
import type { ProviderId } from "@/lib/ledger/usage-store"
import type { GenerateArgs, GenerateKind } from "@/lib/agent/types"
import { agentSkills, getSkillsSnapshot } from "@/lib/skills/store"
import { clampToSchema, defaultsFor } from "@/components/composer/schema-form"
import { defaultModelFor } from "@/lib/registry/enabled"
import { estimateRun } from "@/lib/registry/price"
import { loadConversation, removeOlderThan, saveConversation, titleOf } from "@/lib/chat/history-store"
import type { ConversationKind } from "@/lib/chat/history-store"
import { listResults, onResultsChanged, removeOldFailed, removeResults, saveResult } from "@/lib/library/results-store"
import { useLibrarySizeWarning } from "@/lib/library/size"
import { requestSlot, setRunLimit, type RunSlot } from "@/lib/run-queue"
import { MediaGallery } from "@/components/create/media-gallery"
import { forgetItems } from "@/lib/library/folders-store"
import { removeUpload, useUploads } from "@/lib/library/library-store"
import { PROVIDERS } from "@/lib/registry/providers"
import { activeGroup, applyGroup, groupModelForTool, resolveGroups } from "@/lib/registry/groups"
import type { ModelRecord } from "@/lib/registry/types"
import { migrateModelSettings } from "@/lib/registry/migrate"
import { withLinkedPages } from "@/lib/chat/links"
import { agentAutoApproveUsd, askOverUsd } from "@/lib/spend"
import { buildSystem } from "@/lib/brain/prompt"
import { failoverModel } from "@/lib/brain/failover"
import { sharedTools } from "@/lib/brain/tools"
import { registryReady } from "@/lib/registry/store"
import { MentionReferenceItem } from "@/components/chat/mention-popover"
import { ArrowDownToLine, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const DEFAULT_SETTINGS: SettingsState = {
  general: {
    masterPasswordHash: "cinematic",
    isPasswordConfigured: true,
    autoLockMinutes: 15,
    exportPath: "C:\\Users\\Kadam Raval\\Videos\\Gencraft",
    reducedMotion: false,
    autoLogoutOnClose: true,
    profileName: "Kadam Raval",
    profileEmail: "",
    profileAvatarUrl: "",
    serverRegion: "auto",
  },
  skills: {
    storyboardSkill: true,
    characterConsistencyInjector: true,
    terminalFrameBridging: true,
    cinematicPromptEnhancer: true,
    defaultCameraPreset: "35mm Cinematic Push",
  },
  prompt: {
    systemInstruction: "You are the Gencraft Cinematic Director Agent. Decompose narrative concepts into strict 10s visual beats with camera directions.",
    negativePrompt: "blurry, deformed limbs, extra fingers, cartoonish, oversaturated, morphing, artifacts",
    qualityBoosters: "35mm anamorphic lens, Arri Alexa sensor, photorealistic 8k, natural film grain, volumetric atmosphere",
    customStoryRules: "Every 10-second beat must have a clear subject action, distinct camera movement, and lighting continuity.",
  },
  brand: {
    brandName: "Gencraft",
    watermarkEnabled: false,
    accentColor: "#0d9488",
    signatureTag: "Master Director Cut",
  },
  aiEngine: {
    geminiApiKey: "",
    openaiApiKey: "",
    falApiKey: "",
    replicateApiKey: "",
    openrouterApiKey: "",
    runwayApiKey: "",
    klingApiKey: "",
    comfyuiEndpoint: "http://127.0.0.1:8188",
    activeTextModelId: "",
    activeImageModelId: "",
    activeVideoModelId: "",
    activeAudioModelId: "",
    activeSpeechModelId: "",
    activeEmbeddingModelId: "",
    activeMultimodalModelId: "",
    autoLockModels: true,
    bypassSafetyChecker: false, // Default: the provider safety checker stays on; the user can turn it off in Settings
    fallbackModels: {},
  },
  integrations: {
    googleDrive: {
      connected: false,
      folder: "",
      autoSync: false,
    },
    dropbox: {
      connected: false,
      path: "/Dropbox/Gencraft_Exports/",
      autoSync: false,
    },
    cloudflare: {
      connected: false,
      accountId: "",
      bucket: "",
      customDomain: "",
    },
  },
  cost: {
    monthlyBudget: 50.0,
    totalSpent: 0,
    currency: "USD",
    autoStopOnBudget: true,
  },
}

/** What the composer hands over to be made */
interface SendParams {
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
  generationPrompt?: string
  referenceUrls?: string[]
  referenceGroups?: string[][]
  sourceVideoUrl?: string
  sourceAudioUrl?: string
}

export function App() {
  // The lock: the app starts locked when a password has been set (Settings, General, Profile) and not yet entered
  // in this run of the app. With no password there is nothing to lock.
  const [isLocked, setIsLocked] = React.useState(startsLocked)

  // Dark or light, kept on this device. The skin of light mode is chosen in Settings.
  const { dark: isDark } = useAppearance()

  const handleUnlockStudio = () => {
    markUnlocked(true)
    setIsLocked(false)
  }

  const handleLockStudio = () => {
    if (!hasPassword()) return
    markUnlocked(false)
    setIsLocked(true)
  }

  // Projects State
  const [projects, setProjects] = React.useState<Project[]>(loadProjects)
  const [activeProject, setActiveProject] = React.useState<Project | undefined>(() => projects[0])
  const [projectModalOpen, setProjectModalOpen] = React.useState(false)

  const handleSelectProject = (project: Project) => {
    setActiveProject(project)
    setProjectModalOpen(false)
    setMainTab("chat")
  }

  const handleCreateProject = (params: {
    title: string
    description: string
    defaultMode: GenerationMode
    aspectRatio: string
  }) => {
    if (!limited(() => (assertCanAdd("projects", projects.length), true))) return
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      title: params.title,
      description: params.description,
      createdAt: "Just now",
      updatedAt: "Just now",
      defaultMode: params.defaultMode,
      aspectRatio: params.aspectRatio,
      scenesCount: 0,
      assetsCount: 0,
    }
    setProjects((prev) => [newProj, ...prev])
    setActiveProject(newProj)
    setProjectModalOpen(false)
    setMainTab("chat")
  }

  // Navigation: Primary Left Tab ('chat' | 'story' | 'projects')
  const [mainTab, setMainTab] = React.useState<MainNavTab>("home")
  const [tutorialsTarget, setTutorialsTarget] = React.useState<{ course?: string; video?: string } | undefined>()

  // Layout & Card size states (Matching user's View reference)
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>("masonry")
  const [cardSizeStep, setCardSizeStep] = React.useState<CardSizeStep>(1) // Default small size!

  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<MediaTypeFilter>("all")
  const [modelFilter, setModelFilter] = React.useState<string>("all")
  const [dateRangeFilter, setDateRangeFilter] = React.useState<DateRangeFilter>("all")
  const [statusFilter, setStatusFilter] = React.useState<MediaStatusFilter>("all")
  const [hideFailed, setHideFailed] = React.useState<boolean>(false)
  const [activityFilter, setActivityFilter] = React.useState<MediaActivityFilter>("all")

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [initialSettingsTab, setInitialSettingsTab] = React.useState<
    "general" | "providers" | "usage" | "integrations"
  >("general")
  const [settings, setSettings] = React.useState<SettingsState>(() => {
    try {
      const saved = localStorage.getItem("gencraft_studio_settings")
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          aiEngine: {
            ...DEFAULT_SETTINGS.aiEngine,
            ...(parsed.aiEngine || {}),
          },
          prompt: {
            ...DEFAULT_SETTINGS.prompt,
            ...(parsed.prompt || {}),
          },
          brand: {
            ...DEFAULT_SETTINGS.brand,
            ...(parsed.brand || {}),
          },
        }
      }
    } catch (e) {
      console.error("Failed to restore settings from localStorage:", e)
    }
    return DEFAULT_SETTINGS
  })

  // Saved model choices are checked once the saved catalog is loaded. Checking earlier would clear every model
  // that is not in the bundled catalog (Replicate), because it has not been read from storage yet.
  React.useEffect(() => {
    void registryReady.then(() => setSettings((s) => migrateModelSettings(s)))
  }, [])

  // Continuously sync settings to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem("gencraft_studio_settings", JSON.stringify(settings))
    } catch (e) {
      console.error("Failed to save settings to localStorage:", e)
    }
  }, [settings])

  // The model registry keeps itself current: weekly refresh from provider catalogs and official pages,
  // and retirement dates are re-checked every few hours even offline
  // A provider's models exist for the user only while that provider has a key
  React.useEffect(() => {
    setPriceOverrides(settings.aiEngine.priceOverrides)
    setProviderKeys(PROVIDERS.filter((p) => Boolean(getProviderApiKey(p.id, settings))).map((p) => p.id))
  }, [settings])

  const settingsRef = React.useRef(settings)
  settingsRef.current = settings
  // Content packs (effects, transitions, caption styles, elements, templates): checked for updates in the background
  React.useEffect(() => startPackScheduler(), [])
  React.useEffect(() => startKnowledgeScheduler(), [])
  React.useEffect(() => startAppUpdateScheduler(), [])
  React.useEffect(() => startRegistryScheduler(() => ({ fal: getProviderApiKey("fal", settingsRef.current), replicate: getProviderApiKey("replicate", settingsRef.current) })), [])
  React.useEffect(() => startBackupScheduler(() => settingsRef.current.aiEngine.composioApiKey ?? ""), [])
  React.useEffect(() => startFolderMirror(), [])
  React.useEffect(() => setProjectNames(projects), [projects])
  React.useEffect(() => saveProjects(projects), [projects])

  const [, setActiveBrandKit] = React.useState<BrandKit | undefined>(undefined)
  const [brandSubTab, setBrandSubTab] = React.useState<"brand" | "elements">("brand")

  // Chat Studio Dual Docking State ("bottom" default, toggles to "right")
  // The dock (bottom or right) and the right dock's width are one setting shared with Story, saved on this device
  const composerDock = useComposerDock()
  const chatPageDockPosition = composerDock.side
  const setChatPageDockPosition = composerDock.setSide
  const chatLeftWidth = 100 - composerDock.width // Percentage left for the feed in right-dock mode
  const [isDraggingChatSplit, setIsDraggingChatSplit] = React.useState(false)
  const chatContainerRef = React.useRef<HTMLDivElement>(null)

  const handleResetChatProportions = composerDock.reset

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!chatContainerRef.current || !isDraggingChatSplit) return
      const rect = chatContainerRef.current.getBoundingClientRect()
      const totalWidth = rect.width
      if (totalWidth <= 0) return
      const newLeftPx = e.clientX - rect.left
      const newLeftPct = Math.min(Math.max((newLeftPx / totalWidth) * 100, 35), 80)
      composerDock.setWidth(100 - newLeftPct)
    }

    const handleMouseUp = () => {
      setIsDraggingChatSplit(false)
    }

    if (isDraggingChatSplit) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDraggingChatSplit])

  const handleOpenSettings = (tab?: string) => {
    if (tab === "brand") {
      setMainTab("brand")
      return
    }
    if (tab === "usage") {
      setInitialSettingsTab("usage")
    } else if (tab === "aiEngine" || tab === "providers") {
      setInitialSettingsTab("providers")
    } else if (tab === "integrations") {
      setInitialSettingsTab("integrations")
    } else if (tab && ["general", "usage"].includes(tab)) {
      setInitialSettingsTab(tab as "general" | "usage")
    } else {
      setInitialSettingsTab("general")
    }
    setSettingsOpen(true)
  }

  // Media Library state
  const [assets, setAssets] = React.useState<MediaAsset[]>([])

  // Chat conversation
  // Chat and agent keep a conversation. Image, video and audio runs keep only what is running or failed: the results live in the gallery.
  const [messages, setChatMessages] = React.useState<ChatMessage[]>([])
  const setMessages = setChatMessages
  const [mediaMessages, setMediaMessages] = React.useState<ChatMessage[]>([])
  const [reuseRequest, setReuseRequest] = React.useState<{ nonce: number; mode: GenerationMode; prompt: string; id: string; name: string; imageUrl?: string; images?: Array<{ id: string; name: string; url: string }>; edit?: { videoUrl: string; videoName?: string; modelId: string; task?: "edit" | "extend" } } | undefined>()
  const uploads = useUploads()
  const canUseAgent = useFeature("agent")
  const canUseConnectors = useFeature("connectors")
  // A new install opens on the first-run setup (Free or Paid, then a guided setup); an existing one never does
  const [setupOpen, setSetupOpen] = React.useState(shouldShowSetup)

  // The conversation on screen is saved as it grows; the header offers History in Chat and Agent, Library in the media modes
  const [composerMode, setComposerMode] = React.useState<GenerationMode>(() => {
    try {
      const stored = localStorage.getItem("gencraft_composer_mode")
      return stored === "image" || stored === "video" || stored === "audio" || stored === "plan" ? stored : "chat"
    } catch {
      return "chat"
    }
  })
  const newConversationId = () => `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const [conversationId, setConversationId] = React.useState(newConversationId)
  // An app being built with the agent (Apps, Create new): the same agent, told which app it is making. The draft lives here so it survives each turn.
  const [appBuilding, setAppBuilding] = React.useState<{ meta: AppMeta; existing?: AppSpec } | undefined>()
  const appDraftRef = React.useRef<AppSpec | undefined>(undefined)
  const appBriefRef = React.useRef<AppBrief | undefined>(undefined)
  const [appToOpen, setAppToOpen] = React.useState<AppSpec | undefined>()
  // fal does not say what a run cost, so its runs are corrected from fal's own billing data when it can be read: at start, then every half hour
  const falKeyNow = getProviderApiKey("fal", settings)
  React.useEffect(() => {
    if (!falKeyNow) return
    void reconcileFalUsage(falKeyNow)
    const timer = window.setInterval(() => void reconcileFalUsage(falKeyNow), 30 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [falKeyNow])
  const conversationMeta = React.useRef<{ kind: ConversationKind; createdAt: number }>({ kind: "chat", createdAt: Date.now() })
  const [resultsVersion, setResultsVersion] = React.useState(0)
  // The agent's conversation: the messages it opened with, the latest saved copy, and whether a turn is running
  const [uiMessages, setUiMessages] = React.useState<UIMessage[]>([])
  // True from the first send of a new chat until it is saved, so its conversation is on screen to receive the text
  const [chatStarted, setChatStarted] = React.useState(false)
  // The latest saved copy of the open conversation's messages, for the spoken reply
  const [uiLatest, setUiLatest] = React.useState<UIMessage[]>([])
  const uiMessagesRef = React.useRef<UIMessage[]>([])
  const [uiBusy, setUiBusy] = React.useState(false)

  // Stored results come back on launch, and every new result is saved to the device as soon as it exists
  const savedResultIds = React.useRef(new Set<string>())
  React.useEffect(() => {
    void listResults().then((rows) => {
      rows.forEach((r) => savedResultIds.current.add(r.id))
      setAssets((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))])
    })
    return onResultsChanged(() => setResultsVersion((v) => v + 1))
  }, [])
  React.useEffect(() => {
    const fresh: MediaAsset[] = []
    for (const a of assets) {
      if (savedResultIds.current.has(a.id) || a.source === "uploaded") continue
      if (a.status === "failed" ? false : a.status !== "completed" || !a.url) continue
      savedResultIds.current.add(a.id)
      void saveResult(a)
      if (a.status === "completed") fresh.push(a)
    }
    // A result made now is also copied to Google Drive or Dropbox when the person switched that on
    if (fresh.length > 0) {
      syncNewAssets(settings.aiEngine.composioApiKey ?? "", fresh.map((a) => ({ id: a.id, title: a.title, url: a.url, type: a.type })))
      // ...and into the save folder when that is switched on in Settings, General, Backup
      void saveResultsToFolder(fresh.map((a) => ({ id: a.id, title: a.title, url: a.url, projectId: a.projectId })))
    }
  }, [assets]) // eslint-disable-line react-hooks/exhaustive-deps

  // How many runs go at once (Settings, General, Spending & limits)
  React.useEffect(() => setRunLimit(settings.aiEngine.limits?.maxConcurrent), [settings.aiEngine.limits?.maxConcurrent])

  // One warning when the Library grows past the size set in Settings, General, Spending & limits
  useLibrarySizeWarning(settings.aiEngine.limits?.librarySizeWarnGb)

  // Housekeeping the person asked for in Settings, General, Spending & limits: old failed runs and old chats are deleted at launch
  React.useEffect(() => {
    const limits = settings.aiEngine.limits
    if (limits?.deleteFailedDays) void removeOldFailed(limits.deleteFailedDays)
    if (limits?.keepHistoryDays) void removeOlderThan(limits.keepHistoryDays)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Save the conversation shortly after it changes. It is saved again once its files are stored, so the
  // saved copy points at the files on this device and not at provider links that can expire.
  React.useEffect(() => {
    if (messages.length === 0) return
    const timer = window.setTimeout(() => {
      void saveConversation({
        id: conversationId,
        kind: conversationMeta.current.kind,
        title: titleOf(messages),
        messages,
        projectId: activeProject?.id,
        createdAt: conversationMeta.current.createdAt,
        updatedAt: Date.now(),
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [messages, conversationId, resultsVersion, activeProject?.id])

  const startConversation = () => {
    if (isGenerating) return
    setMessages([])
    setUiMessages([])
    setUiLatest([])
    setChatStarted(false)
    uiMessagesRef.current = []
    setConversationId(newConversationId())
    conversationMeta.current = { kind: "chat", createdAt: Date.now() }
    setAppBuilding(undefined)
    appDraftRef.current = undefined
    appBriefRef.current = undefined
  }
  const startAppBuild = (meta: AppMeta, existing?: AppSpec) => {
    if (isGenerating) return
    startConversation()
    appDraftRef.current = existing
    appBriefRef.current = undefined
    setAppBuilding({ meta, existing })
    setComposerMode("plan")
    setReuseRequest({ nonce: Date.now(), mode: "plan", prompt: "", id: "app", name: "" })
    setMainTab("chat")
  }
  // The chat and the agent each keep their own conversations: changing between them starts a new one
  React.useEffect(() => {
    const want = composerMode === "plan" ? "agent" : composerMode === "chat" ? "chat" : null
    if (want && uiMessages.length > 0 && conversationMeta.current.kind !== want) startConversation()
  }, [composerMode]) // eslint-disable-line react-hooks/exhaustive-deps
  const openConversation = async (id: string) => {
    if (isGenerating) return
    const saved = await loadConversation(id)
    if (!saved) return
    conversationMeta.current = { kind: saved.kind, createdAt: saved.createdAt }
    // A chat saved before it streamed carries over when it is plain text; one with results or steps is shown as it was
    const carried = saved.kind === "chat" && !saved.ui ? legacyToUi(saved.messages) : null
    const ui = (saved.ui ?? carried ?? []) as UIMessage[]
    uiMessagesRef.current = ui
    setUiMessages(ui)
    setUiLatest(ui)
    setChatStarted(ui.length > 0)
    // An agent conversation opens in agent mode. One saved before the chat-based agent shows its steps list as it was.
    setAppBuilding(undefined)
    appDraftRef.current = undefined
    appBriefRef.current = undefined
    if (saved.kind === "agent") setComposerMode("plan")
    else if (ui.length > 0) setComposerMode("chat")
    setConversationId(saved.id)
    setMessages(carried ? [] : saved.messages)
    setMainTab("chat")
  }
  const lastAssistantText = React.useMemo(() => {
    const spoken = [...uiLatest].reverse().find((m) => m.role === "assistant")
    if (spoken) {
      const text = spoken.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("")
      if (text) return text
    }
    return [...messages].reverse().find((m) => m.role === "assistant")?.content
  }, [messages, uiLatest])
  // How many sends are in progress, running or waiting for a free place. Sending is never blocked by this.
  const [activeRuns, setActiveRuns] = React.useState(0)
  const isGenerating = activeRuns > 0 || uiBusy


  // Active generation engine & character reference
  const [activeModelId, setActiveModelId] = React.useState<string>("fal-kling-1.5-pro")
  const [activeCharacterRef, setActiveCharacterRef] = React.useState<CharacterReference | undefined>()

  // Player state
  const [playerOpen, setPlayerOpen] = React.useState(false)
  const [playerScenes, setPlayerScenes] = React.useState<VideoSceneBeat[] | undefined>()
  const [playerSingleAsset, setPlayerSingleAsset] = React.useState<MediaAsset | undefined>()

  // Inactivity Auto-Lock
  React.useEffect(() => {
    if (isLocked || settings.general.autoLockMinutes === 0) return

    let timeoutId: number
    const resetTimer = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        handleLockStudio()
      }, settings.general.autoLockMinutes * 60 * 1000)
    }

    window.addEventListener("mousemove", resetTimer)
    window.addEventListener("keydown", resetTimer)
    resetTimer()

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener("mousemove", resetTimer)
      window.removeEventListener("keydown", resetTimer)
    }
  }, [isLocked, settings.general.autoLockMinutes])

  // What the agent works with each time it is asked to continue: the chat model from the group chosen in the composer, and
  // the way to make media with that group's models. Read fresh each turn, so a change in Settings applies at once.
  const assetsRef = React.useRef(assets)
  assetsRef.current = assets
  const conversationIdRef = React.useRef(conversationId)
  conversationIdRef.current = conversationId
  const agentSettingKey = { image: "activeImageModelId", video: "activeVideoModelId", audio: "activeAudioModelId" } as const

  // The settings the composer would show for this kind of output, with the group's defaults and what the agent asked for
  const agentValuesFor = (kind: GenerateKind, a: GenerateArgs) => {
    const grouped = applyGroup(settings, activeGroup(settings, getListedModels()))
    const rec = getRecord(grouped.settings.aiEngine[agentSettingKey[kind]] ?? "")
    if (!rec) return { grouped, rec, values: {} as Record<string, unknown> }
    const values: Record<string, unknown> = { ...defaultsFor(rec.params), ...(grouped.params[kind] ?? {}) }
    const ratio = rec.params.properties.aspect_ratio
    if (a.aspectRatio && ratio?.enum?.map(String).includes(a.aspectRatio)) values.aspect_ratio = a.aspectRatio
    const dur = rec.params.properties.duration
    if (a.seconds && dur) {
      const options = dur.enum?.map(Number).filter(Number.isFinite)
      values.duration = options?.length ? options.reduce((best, o) => (Math.abs(o - a.seconds!) < Math.abs(best - a.seconds!) ? o : best), options[0]!) : a.seconds
    }
    return { grouped, rec, values: clampToSchema(rec.params, values) }
  }

  const agentEstimate = (kind: GenerateKind, a: GenerateArgs): number | null => {
    const { rec, values } = agentValuesFor(kind, a)
    return rec ? estimateRun(rec, values).usd : null
  }

  /** The chat model the agent and the app builder think with: the Chat & Agent row of Settings, each model with a key standing behind the one before */
  const thinkingModelFor = (s: SettingsState, meter?: Meter): LanguageModel => {
    // The Chat & Agent row of Settings: its first model, then its fallbacks. The agent needs tool calling, so it takes the
    // first one in that order that can run it and has a key.
    const listedNow = getListedModels()
    const candidates = [s.aiEngine.activeTextModelId, ...(s.aiEngine.fallbackModels?.text ?? [])]
      .map((id) => getRecord(id ?? ""))
      .concat(defaultModelFor("text", listedNow))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
    if (candidates.length === 0) throw new Error("No chat model is available. Add a provider key and switch on a chat model in Settings.")
    const textRecord = candidates.find((r) => canRunAgent(r.provider) && getProviderApiKey(r.provider as ProviderId, s))
    if (!textRecord) {
      const first = candidates[0]!
      throw new Error(
        canRunAgent(first.provider)
          ? `No ${first.provider} key is set, so nothing was generated. Add one in Settings, Providers.`
          : `${first.name} is not a chat model this app can run. Pick another in Settings, Models.`,
      )
    }
    // Every model in the Chat & Agent row that can run the agent and has a key stands behind the first: if one refuses
    // in the middle of a run (rejected key, blocked project, quota, outage) the next takes over
    const thinkers = candidates
      .filter((r) => canRunAgent(r.provider) && getProviderApiKey(r.provider as ProviderId, s))
      .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    return failoverModel(
      thinkers.map((r) => ({ label: r.name, model: withUsage(studioModel(r, getProviderApiKey(r.provider as ProviderId, s)), r, { label: "Agent", meter }) })),
      { onSwitch: (from, to, reason) => raiseChip({ key: "agent:switch", level: "info", kind: "note", title: `Switched to ${to}`, message: `${from} could not continue, so the agent carried on with ${to}. ${explainError(reason, { model: from }).message}`, raw: reason, ttl: 12000 }) },
    )
  }

  /** The AI tools for an agent: what can run now, the media an id names, and a run that saves its result to the Library */
  const agentToolEnv = (surface: "agent" | "edit"): AgentToolEnv => {
    const media = (id: string): ToolMedia => {
      const a = assetsRef.current.find((x) => x.id === id)
      if (!a?.url) throw new Error(`There is no result or file with id ${id}. Call list_results.`)
      return { url: a.url, kind: a.type, name: a.title }
    }
    // The level the person chose picks the model of each tool: Low the cheapest that does it, High the best; a tool set by hand keeps its model
    const group = resolveGroups(settings.aiEngine.groups, getListedModels()).find((g) => g.id === settings.aiEngine.activeGroupId) ?? activeGroup(settings, getListedModels())
    const choose = (toolId: string, candidates: ModelRecord[]) => groupModelForTool(group, toolId, candidates, new Set(listBookmarks()))
    return {
      surface,
      context: () => toolContextOf(getListedModels(), settings.aiEngine.enabledChatModelIds),
      choose,
      media,
      estimate: (toolId, mediaId, options) => {
        const spec = toolById(toolId)
        const offer = spec ? statusOf(spec, toolContextOf(getListedModels(), settings.aiEngine.enabledChatModelIds)) : undefined
        const rec = offer ? choose(toolId, offer.candidates) : undefined
        if (!spec || !rec) return null
        try {
          return priceOf(rec, paramsFor(spec, rec, options).params, media(mediaId))
        } catch {
          return null
        }
      },
      run: async (toolId, endpoint, from, input) => {
        const spec = toolById(toolId)
        const rec = getToolRecords().find((r) => r.endpoint === endpoint) ?? getListedModels().find((r) => r.endpoint === endpoint)
        if (!spec || !rec) throw new Error("That tool is not available.")
        const done = await runTool(spec, rec, { media: from, prompt: input.prompt, options: input.options }, { settings, projectId: activeProject?.id })
        setAssets((prev) => [...done.assets, ...prev])
        return done
      },
    }
  }

  const agentRuntime = (): AgentRuntime => {
    const grouped = applyGroup(settings, activeGroup(settings, getListedModels()))
    const generate = async (kind: GenerateKind, a: GenerateArgs) => {
      const { grouped: g, rec, values } = agentValuesFor(kind, a)
      const refUrls = (a.referenceIds ?? []).map((id) => assetsRef.current.find((x) => x.id === id)?.url).filter((u): u is string => Boolean(u))
      const brandKit = a.brandId ? loadBrands().find((k) => k.id === a.brandId) : undefined
      const brandLogo = brandKit ? pickLogo(brandKit, isDark)?.url : undefined
      if (brandLogo) refUrls.push(brandLogo)
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      const run = await executeWithFallback({
        modality: kind,
        settings: g.settings,
        primaryModelId: rec?.id,
        actionName: `Agent ${kind}`,
        costMultiplier: 1,
        onDiagnosticLog: () => undefined,
        cost: { values },
        execute: async (model, _attempt, report) => {
          const live = await dispatchLiveProviderRequest({
            onActualCost: report,
            model,
            modality: kind,
            prompt: a.prompt,
            settings: g.settings,
            params: values,
            references: { images: refUrls },
            imageParams: { batchCount: a.count, aspectRatio: a.aspectRatio },
            videoParams: { duration: a.seconds, aspectRatio: a.aspectRatio },
            audioParams: { duration: a.seconds },
            onLog: () => undefined,
          })
          const urls = kind === "image" ? (live.imageUrls ?? []) : kind === "video" ? (live.videoUrl ? [live.videoUrl] : []) : live.audioUrl ? [live.audioUrl] : []
          if (urls.length === 0) throw new Error(`The provider finished but returned no ${kind} file`)
          return urls.map<MediaAsset>((url, i) => ({
            id: `agent-${kind}-${Date.now()}-${i}`,
            type: kind,
            title: `${kind === "image" ? "Image" : kind === "video" ? "Video" : "Audio"} from the agent`,
            prompt: a.prompt,
            url,
            thumbnailUrl: kind === "image" ? url : "",
            aspectRatio: a.aspectRatio ?? "16:9",
            model: model.name,
            provider: model.provider as ProviderType,
            createdAt: timestamp,
            batchId: conversationIdRef.current,
            projectId: activeProject?.id,
            cost: "",
            status: "completed",
          }))
        },
      })
      setAssets((prev) => [...run.result, ...prev])
      return {
        assetIds: run.result.map((x) => x.id),
        costUsd: rec ? (estimateRun(rec, values).usd ?? 0) : 0,
        assets: run.result.map((x) => ({ id: x.id, url: x.url, title: x.title, type: kind })),
      }
    }

    // What this turn's text calls cost (the agent's steps, its research and its picture check), summed so the reply carries it
    const meter: Meter = { usd: 0, tokens: 0 }
    const thinking = thinkingModelFor(grouped.settings, meter)
    // A short research pass with its own reading and searching: only the answer returns to the plan, never whole pages
    const research = async (question: string) => {
      const { text } = await generateText({
        model: thinking,
        system: buildSystem({ mode: "agent", tools: true, memory: settings.aiEngine.memoryEnabled !== false }) + "\nYou are researching one question for a creative director. Read what you need, then answer in under 200 words with the facts that matter for making images, video or audio, and name the pages you used. If you cannot find it, say so.",
        prompt: question,
        tools: sharedTools({ providerSearch: false, memory: settings.aiEngine.memoryEnabled !== false }),
        stopWhen: isStepCount(8),
      })
      return text || "Nothing useful was found."
    }

    // Looks at a finished picture (or a video's first frame) against its brief, with the thinking model if it can see
    const check = async (resultId: string, brief: string) => {
      const asset = assetsRef.current.find((x) => x.id === resultId)
      if (!asset) return { checked: false, note: "There is no result with that id." }
      const src = asset.type === "image" ? asset.url : asset.type === "video" ? asset.thumbnailUrl : ""
      if (!src) return { checked: false, note: asset.type === "audio" ? "A sound cannot be looked at." : "There is no picture of this result to look at." }
      const data = await toInlineUrl(src)
      if (!data) return { checked: false, note: "The picture could not be opened." }
      const { text } = await generateText({
        model: thinking,
        messages: [{ role: "user", content: [{ type: "text", text: `This was asked for: ${brief}\nLook at the result. Reply with JSON only: {"matches": true or false, "issues": "what is wrong or missing, empty when nothing"}` }, { type: "image", image: data }] }],
      })
      const json = /\{[\s\S]*\}/.exec(text)?.[0]
      if (!json) return { checked: false, note: "The model gave no clear answer." }
      const parsed = JSON.parse(json) as { matches?: boolean; issues?: string }
      return { checked: true, matches: parsed.matches === true, issues: parsed.issues ?? "" }
    }

    return {
      meter,
      model: thinking,
      env: {
        check,
        about: settings.aiEngine.chatInstructions,
        memory: settings.aiEngine.memoryEnabled !== false,
        research,
        generate,
        estimate: agentEstimate,
        skills: agentSkills(getSkillsSnapshot()).map((k) => ({ id: k.id, name: k.name, description: k.description, method: k.method })),
        limits: { budgetUsd: settings.aiEngine.agentBudgetUsd ?? 2, autoApproveUsd: agentAutoApproveUsd(settings.aiEngine), maxGenerations: 6 },
        requirePlanApproval: settings.aiEngine.agentApprovePlan !== false,
        aiTools: agentToolEnv("agent"),
        apps: appBuilding
          ? {
              meta: appBuilding.meta,
              existing: appBuilding.existing,
              registry: liveRegistry,
              models: () => {
                const listed = getListedModels()
                const rank = new Map(computeDefaultEnabled(listed).map((id, i) => [id, i]))
                return [...listed].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999))
              },
              draft: () => appDraftRef.current,
              setDraft: (spec) => {
                appDraftRef.current = spec
              },
              save: saveApp,
              brief: () => appBriefRef.current,
              setBrief: (brief) => {
                appBriefRef.current = brief
              },
            }
          : undefined,
      },
    }
  }

  // The agent's conversation is saved when a turn ends; its messages are kept as the chat's own parts
  const saveUiMessages = (kind: ConversationKind, ui: UIMessage[]) => {
    uiMessagesRef.current = ui
    setUiLatest(ui)
    if (ui.length === 0) return
    conversationMeta.current.kind = kind
    void saveConversation({
      id: conversationId,
      kind,
      title: agentTitle(ui),
      messages: [],
      ui,
      projectId: activeProject?.id,
      createdAt: conversationMeta.current.createdAt,
      updatedAt: Date.now(),
    })
  }

  // The chat's models in the order the fallback list gives, and how to talk to each. A model the AI SDK has a provider for
  // streams; any other answers in one piece through the older connector.
  const chatDeps = (modelId?: string): StreamDeps<ResolvedModelInfo> => {
    // The AI SDK model of a candidate, with the provider's web search when the person switched that on
    const made = new Map<string, ReturnType<typeof chatModelFor> | null>()
    const built = (model: ResolvedModelInfo) => {
      if (!made.has(model.id)) {
        const rec = getRecord(model.id)
        const key = rec && canRunAgent(rec.provider) ? getProviderApiKey(rec.provider as ProviderId, settings) : ""
        const built = rec && key ? chatModelFor(rec, key, settings.aiEngine.chatWebSearch === true && canSearchWeb(rec.provider)) : null
        made.set(model.id, built && rec ? { ...built, model: withUsage(built.model, rec, { label: "Chat" }) } : null)
      }
      return made.get(model.id) ?? null
    }
    return {
    chain: async (execute) =>
      (
        await executeWithFallback({
          modality: "text",
          settings,
          primaryModelId: modelId,
          actionName: "Chat",
          onDiagnosticLog: () => undefined,
          execute,
        })
      ).result,
    system: (model) => {
      const made = built(model)
      return buildSystem({ mode: "chat", about: settings.aiEngine.chatInstructions, tools: Boolean(made), memory: settings.aiEngine.memoryEnabled !== false, providerSearch: Boolean(made?.tools) })
    },
    label: (model) => model.name,
    price: (model) => {
      const p = getRecord(model.id)?.price
      return p && p.unit === "per_1m_tokens" && p.amount !== null ? { in: p.amount, out: p.outputAmount ?? p.amount } : null
    },
    languageModel: (model) => built(model)?.model ?? null,
    tools: (model) => {
      const made = built(model)
      return made ? { ...made.tools, ...sharedTools({ providerSearch: Boolean(made.tools), memory: settings.aiEngine.memoryEnabled !== false }) } : undefined
    },
    plain: async (model, prompt) => {
      const live = await dispatchLiveProviderRequest({ model, modality: "text", prompt, settings, onLog: () => undefined })
      if (!live.textResponse) throw new Error("The model returned no text")
      recordTextEstimate(getRecord(model.id), prompt, live.textResponse, "Chat")
      return live.textResponse
    },
    }
  }

  // Orchestrate generation message
  const handleSendMessage = async (params: SendParams) => {
    // The chat is a conversation too: it streams, and every turn carries the ones before
    if (params.mode === "chat" && !params.prompt.startsWith("/agent")) {
      const text = params.generationPrompt ?? params.prompt
      if (!text.trim()) return
      conversationMeta.current.kind = "chat"
      // A chat saved before it streamed that could not be carried over is left as it was; this starts a new one beside it
      if (messages.length > 0) {
        setMessages([])
        setUiMessages([])
        setUiLatest([])
        uiMessagesRef.current = []
        setConversationId(newConversationId())
        conversationMeta.current = { kind: "chat", createdAt: Date.now() }
      }
      setChatStarted(true)
      // Pictures attached to the message are sent inside it
      const files = (
        await Promise.all(
          (params.referenceUrls ?? []).map(async (u) => {
            const data = await toInlineUrl(u)
            return data ? { url: data, mediaType: /^data:([^;,]+)/.exec(data)?.[1] ?? "image/png" } : null
          }),
        )
      ).filter((f): f is { url: string; mediaType: string } => f !== null)
      // Links in the message are opened here and their text goes with the question, so the model answers from the page, not from guessing
      const linked = await withLinkedPages(text)
      chatBridge.send({ text: linked.text, shown: params.prompt, modelId: params.modelId, files })
      return
    }
    // The agent is a conversation of its own: what was typed goes to it, and it keeps the earlier turns
    if (params.mode === "plan" || params.prompt.startsWith("/agent")) {
      const goal = (params.generationPrompt ?? params.prompt).replace("/agent", "").trim()
      if (!goal) return
      conversationMeta.current.kind = "agent"
      // An agent conversation saved before the chat-based agent is left as it was; this starts a fresh one beside it
      if (messages.length > 0) {
        setMessages([])
        setUiMessages([])
        uiMessagesRef.current = []
        setConversationId(newConversationId())
        conversationMeta.current = { kind: "agent", createdAt: Date.now() }
      }
      setComposerMode("plan")
      agentBridge.send(goal)
      return
    }
    // A new run starts clean: the errors of the last one have been seen
    clearChips(/^(error|limit):/)
    // Limits the person set: how much one run may make, how long a video may be, what the month may cost
    const limits = settings.aiEngine.limits
    if (limits) {
      if (limits.maxResults && params.batchCount > limits.maxResults) {
        params = { ...params, batchCount: limits.maxResults }
        raiseChip({ key: "limit:results", level: "info", kind: "limit", title: "Results capped", message: `Making ${limits.maxResults} results, the most one run may make (Settings, General, Spending & limits).`, actions: ["settings"], settingsTab: "general", ttl: 8000 })
      }
      if (params.mode === "video" && limits.maxVideoSeconds) {
        const asked = typeof params.modelParams?.duration === "number" ? params.modelParams.duration : params.targetDuration
        if (asked > limits.maxVideoSeconds) {
          params = { ...params, targetDuration: limits.maxVideoSeconds, modelParams: params.modelParams ? { ...params.modelParams, ...(typeof params.modelParams.duration === "number" ? { duration: limits.maxVideoSeconds } : {}) } : params.modelParams }
          raiseChip({ key: "limit:seconds", level: "info", kind: "limit", title: "Video shortened", message: `The video is cut to ${limits.maxVideoSeconds} seconds, the longest one run may make.`, actions: ["settings"], settingsTab: "general", ttl: 8000 })
        }
      }
      const media = params.mode === "image" || params.mode === "video" || params.mode === "audio"
      const askOver = askOverUsd(settings.aiEngine)
      if (media && (limits.monthlyBudgetUsd || askOver)) {
        const spent = usageLedger.getSpendOverview("monthly").totalCostUsd
        const record = getRecord(params.modelId)
        // A model without a count field of its own is run several times: the cost is every run's
        const estimated = record ? estimateRun(record, params.modelParams ?? {}).usd : null
        const cost = estimated === null ? null : estimated * repeatOf(params.modelParams)
        if (limits.monthlyBudgetUsd && spent >= limits.monthlyBudgetUsd) {
          raiseChip({ key: "limit:budget", level: "error", kind: "limit", title: "Budget used up", message: `This month's budget is used up (${spent.toFixed(2)} of ${limits.monthlyBudgetUsd}). Raise it in Settings, General, Spending & limits to keep going.`, actions: ["settings"], settingsTab: "general" })
          return
        }
        if (askOver && cost !== null && cost > askOver) {
          const yes = await askYesNo("This run costs more than your limit", `It is estimated at about $${cost.toFixed(2)}. You asked to be asked before anything over $${askOver}.`)
          if (!yes) return
        }
        if (limits.monthlyBudgetUsd && spent >= limits.monthlyBudgetUsd * 0.8) raiseChip({ key: "limit:budget-near", level: "warning", kind: "limit", title: "Budget nearly used", message: `You have used ${Math.round((spent / limits.monthlyBudgetUsd) * 100)}% of this month's budget.`, actions: ["settings"], settingsTab: "general", ttl: 10000 })
      }
    }
    // A few runs go at once (Settings, General, Spending & limits); the rest show as waiting and start in order.
    // A model with no count field of its own is run once for each result asked for.
    const asked = params.mode === "image" || params.mode === "video" ? repeatOf(params.modelParams) : 1
    const times = limits?.maxResults ? Math.min(asked, limits.maxResults) : asked
    const stamp = Date.now()
    await Promise.all(
      Array.from({ length: times }, async (_, i) => {
        const assistantMsgId = `assistant-msg-${stamp}-${i}`
        const slot = requestSlot(assistantMsgId)
        setActiveRuns((n) => n + 1)
        try {
          await sendOne(params, assistantMsgId, slot)
        } finally {
          slot.release()
          setActiveRuns((n) => Math.max(0, n - 1))
        }
      }),
    )
  }

  /** One send, after the limits passed. Its message is on screen at once; it waits for a place before it starts. */
  const sendOne = async (params: SendParams, assistantMsgId: string, slot: RunSlot) => {
    const setMessages = params.mode === "image" || params.mode === "video" || params.mode === "audio" ? setMediaMessages : setChatMessages
    if (params.mode === "plan" || params.prompt.startsWith("/agent")) conversationMeta.current.kind = "agent"
    // What the model receives: the user's words with the chosen Elements added, and the reference files that fit
    const sentPrompt = params.generationPrompt ?? params.prompt
    const references = {
      images: params.referenceUrls ?? [],
      groups: params.referenceGroups,
      sourceVideoUrl: params.sourceVideoUrl,
      sourceAudioUrl: params.sourceAudioUrl,
    }
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

    // Resolve active model and dynamically adapt generation package according to model capabilities
    const activeModel =
      resolveAIModel(params.modelId) ||
      MODEL_CATALOG.find((m) => m.type === params.mode) ||
      MODEL_CATALOG[0]!

    // A model from the registry gets exactly the prompt the user wrote (plus chosen Elements). The older
    // capability adapter rewrites prompts with bracketed notes, which is only for the bundled legacy models.
    const registryRecord = getRecord(params.modelId)
    const exact = Boolean(registryRecord && registryRecord.endpoint !== registryRecord.id)
    const job = (kind: "chat" | "image" | "video" | "audio", count: number) => ({
      kind,
      status: (slot.waited ? "queued" : "running") as "queued" | "running",
      startedAt: Date.now(),
      count,
      expected: expectedRun(params.modelId),
      modelName: registryRecord?.name,
      aspectRatio: params.aspectRatio,
    })
    const fail = (id: string, raw: string, kind: "chat" | "image" | "video" | "audio", log: string[] = []) => {
      const errorContext = { provider: registryRecord?.provider, model: registryRecord?.name, hasSafetySwitch: Boolean(registryRecord?.params.safety) }
      const info = explainError(raw, errorContext)
      const message = info.message
      // Also a chip just above the composer, so the failure is never out of sight behind it
      raiseChip(chipFromError(raw, errorContext, { retry: () => void handleSendMessage(params) }))
      if (kind !== "chat") {
        // A failed image, video or audio is kept like any other result, with its reason and log
        const failed: MediaAsset = {
          id: `failed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: kind,
          title: `Failed ${kind}`,
          prompt: sentPrompt,
          url: "",
          thumbnailUrl: "",
          aspectRatio: params.aspectRatio,
          model: registryRecord?.name ?? params.modelId,
          provider: (registryRecord?.provider ?? "fal") as ProviderType,
          createdAt: timestamp,
          batchId: id,
          projectId: activeProject?.id,
          cost: "",
          status: "failed",
          error: message,
          errorInfo: info,
          log: [...log, `❌ ${raw}`],
          params: params.modelParams,
        }
        setMediaMessages((prev) => prev.filter((m) => m.id !== id))
        setAssets((prev) => [failed, ...prev])
        return
      }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: "", job: { ...job(kind, 1), status: "failed" as const, error: message, errorInfo: info } } : m)))
    }

    // The message is on screen already. Wait for a free place, then switch it to running (and start its clock).
    const begin = async (kind: "chat" | "image" | "video" | "audio"): Promise<boolean> => {
      if (!(await slot.ready)) {
        setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: "Cancelled before it started.", job: undefined } : m)))
        return false
      }
      if (!slot.waited) return true
      const budget = settings.aiEngine.limits?.monthlyBudgetUsd
      if (kind !== "chat" && budget && usageLedger.getSpendOverview("monthly").totalCostUsd >= budget) {
        fail(assistantMsgId, `This month's budget was used up while this run was waiting (${budget}). Raise it in Settings, General, Spending & limits.`, kind)
        return false
      }
      setMessages((prev) => prev.map((m) => (m.id === assistantMsgId && m.job ? { ...m, job: { ...m.job, status: "running" as const, startedAt: Date.now() } } : m)))
      return true
    }

    const adaptedPackage = adaptGenerationPackage({
      rawPrompt: sentPrompt,
      activeModel,
      settings,
      characterRef: params.characterRef,
      mentionItems: params.referenceItem ? [params.referenceItem] : [],
      startFrameUrl: params.startFrameUrl,
      endFrameUrl: params.endFrameUrl,
      cameraMotion: params.cameraMotion,
      aspectRatio: params.aspectRatio,
    })

    // 1. Append user message
    const userMsg: ChatMessage = {
      id: `user-msg-${Date.now()}`,
      role: "user",
      content: params.prompt,
      createdAt: timestamp,
      projectId: activeProject?.id,
      characterRef: params.characterRef,
    }
    setMessages((prev) => [...prev, userMsg])

    // 2. Prepare Assistant message

    if (params.mode === "video") {
      const stepLogs: string[] = []
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", createdAt: timestamp, projectId: activeProject?.id, plain: true, job: job("video", 1) },
      ])
      if (!(await begin("video"))) return
      const startedAt = Date.now()

      try {
        const result = await executeWithFallback({
          modality: "video",
          settings,
          primaryModelId: params.modelId,
          actionName: "Video",
          // The ledger records what this run costs with the settings chosen, not the model's default
          cost: { values: { ...(params.modelParams ?? {}), duration: params.modelParams?.duration ?? params.targetDuration }, context: { sourceVideo: Boolean(params.sourceVideoUrl) } },
          onDiagnosticLog: (log) => stepLogs.push(log),
          execute: async (model, _attempt, report) => {
            const live = await dispatchLiveProviderRequest({
              onActualCost: report,
              model,
              modality: "video",
              prompt: exact ? sentPrompt : adaptedPackage.adaptedPrompt,
              settings,
              params: params.modelParams,
              references,
              videoParams: {
                duration: params.targetDuration,
                aspectRatio: params.aspectRatio,
                referenceImageUrl: adaptedPackage.referenceImageUrl,
                referenceVideoUrl: adaptedPackage.referenceVideoUrl,
                startFrameUrl: adaptedPackage.startFrameUrl,
                endFrameUrl: adaptedPackage.endFrameUrl,
                cameraMotion: adaptedPackage.cameraMotion,
                characterSignature: adaptedPackage.characterSignature,
              },
              onLog: (l) => stepLogs.push(l),
            })
            if (!live.videoUrl) throw new Error("The provider finished but returned no video file")
            const clip: MediaAsset = {
              id: `video-asset-${Date.now()}`,
              type: "video",
              title: `Video (${model.name})`,
              prompt: params.prompt,
              url: live.videoUrl,
              thumbnailUrl: live.thumbnailUrl ?? "",
              duration: params.targetDuration,
              aspectRatio: params.aspectRatio,
              model: model.name,
              provider: model.provider as ProviderType,
              createdAt: timestamp,
              batchId: assistantMsgId,
              projectId: activeProject?.id,
              cost: model.costDisplay,
              status: "completed",
            }
            return clip
          },
        })
        recordRunTime(result.executedModel.id, (Date.now() - startedAt) / 1000)
        setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, job: undefined, stepLogs } : m)))
        setAssets((prev) => [result.result, ...prev])
      } catch (err: unknown) {
        fail(assistantMsgId, err instanceof Error ? err.message : String(err), "video", stepLogs)
      }
    } else if (params.mode === "image") {
      const stepLogs: string[] = []

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: timestamp,
        projectId: activeProject?.id,
        plain: true,
        job: job("image", params.batchCount),
      }
      setMessages((prev) => [...prev, assistantMsg])
      if (!(await begin("image"))) return
      const startedAt = Date.now()

      try {
        const result = await executeWithFallback({
          modality: "image",
          settings,
          primaryModelId: params.modelId,
          actionName: `${params.batchCount}x Image Render Batch`,
          costMultiplier: params.batchCount,
          cost: { values: { ...(params.modelParams ?? {}) }, context: {} },
          onDiagnosticLog: (log) => {
            stepLogs.push(log)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, stepLogs: [...stepLogs] } : m
              )
            )
          },
          execute: async (model, _attempt, report) => {
            const liveResult = await dispatchLiveProviderRequest({
              onActualCost: report,
              model,
              modality: "image",
              prompt: exact ? sentPrompt : adaptedPackage.adaptedPrompt,
              settings,
              params: params.modelParams,
              references,
              imageParams: {
                batchCount: params.batchCount,
                aspectRatio: params.aspectRatio,
                referenceImageUrl: adaptedPackage.referenceImageUrl,
              },
              onLog: (l) => {
                stepLogs.push(l)
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, stepLogs: [...stepLogs] } : m
                  )
                )
              },
            })

            const imageAssets: MediaAsset[] = (liveResult.imageUrls || []).map((url, idx) => ({
              id: `img-asset-${Date.now()}-${idx}`,
              type: "image",
              title: `Shot #${idx + 1} (${model.name})`,
              prompt: params.prompt,
              url,
              thumbnailUrl: url,
              aspectRatio: params.aspectRatio,
              model: model.name,
              provider: model.provider as ProviderType,
              createdAt: timestamp,
              characterRefId: params.characterRef?.id,
              batchId: assistantMsgId,
              cost: model.costDisplay,
              status: "completed",
            }))

            return imageAssets
          },
        })

        recordRunTime(result.executedModel.id, (Date.now() - startedAt) / 1000)
        setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: "", images: result.result, job: undefined, stepLogs } : m)))

        setAssets((prev) => [...result.result, ...prev])
      } catch (err: unknown) {
        fail(assistantMsgId, err instanceof Error ? err.message : String(err), "image", stepLogs)
      }
    } else if (params.mode === "audio") {
      const stepLogs: string[] = []

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: timestamp,
        projectId: activeProject?.id,
        plain: true,
        job: job("audio", 1),
      }
      setMessages((prev) => [...prev, assistantMsg])
      if (!(await begin("audio"))) return
      const startedAt = Date.now()

      try {
        const result = await executeWithFallback({
          modality: "audio",
          settings,
          primaryModelId: params.modelId,
          actionName: "Soundtrack & Foley Track",
          costMultiplier: 1,
          cost: { values: { ...(params.modelParams ?? {}) }, context: { promptChars: sentPrompt.length } },
          onDiagnosticLog: (log) => {
            stepLogs.push(log)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, stepLogs: [...stepLogs] } : m
              )
            )
          },
          execute: async (model, _attempt, report) => {
            const liveResult = await dispatchLiveProviderRequest({
              onActualCost: report,
              model,
              modality: "audio",
              prompt: sentPrompt,
              settings,
              params: params.modelParams,
              references,
              audioParams: { duration: 30 },
              onLog: (l) => {
                stepLogs.push(l)
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, stepLogs: [...stepLogs] } : m
                  )
                )
              },
            })

            if (!liveResult.audioUrl) throw new Error("The provider finished but returned no audio file")
            const audioAsset: MediaAsset = {
              id: `asset-audio-${Date.now()}`,
              type: "audio",
              title: `Soundtrack — ${params.prompt.slice(0, 36)}`,
              prompt: params.prompt,
              url: liveResult.audioUrl ?? "",
              thumbnailUrl: "",
              duration: 30,
              aspectRatio: "audio",
              model: model.name,
              provider: model.provider as ProviderType,
              createdAt: timestamp,
              batchId: assistantMsgId,
              projectId: activeProject?.id,
              cost: model.costDisplay,
              status: "completed",
            }
            return audioAsset
          },
        })

        recordRunTime(result.executedModel.id, (Date.now() - startedAt) / 1000)
        setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: "", audio: result.result, job: undefined, stepLogs } : m)))
        setAssets((prev) => [result.result, ...prev])
      } catch (err: unknown) {
        fail(assistantMsgId, err instanceof Error ? err.message : String(err), "audio", stepLogs)
      }
    }
  }

  // Text for the Story page's script agent, from the chat model chosen in Settings
  const generateStoryText = async (prompt: string): Promise<string> => {
    const run = await executeWithFallback({
      modality: "text",
      settings,
      primaryModelId: settings.aiEngine.activeTextModelId,
      actionName: "Story script",
      onDiagnosticLog: () => undefined,
      execute: async (model) => {
        const live = await dispatchLiveProviderRequest({ model, modality: "text", prompt, settings, onLog: () => undefined })
        if (!live.textResponse) throw new Error("The model returned no text")
        recordTextEstimate(getRecord(model.id), prompt, live.textResponse, "Story script")
        return live.textResponse
      },
    })
    return run.result
  }

  const handlePlayFullStory = (scenes: VideoSceneBeat[]) => {
    setPlayerScenes(scenes)
    setPlayerSingleAsset(undefined)
    setPlayerOpen(true)
  }

  const handlePlayScene = (scene: VideoSceneBeat) => {
    setPlayerScenes(undefined)
    setPlayerSingleAsset({
      id: scene.id,
      type: "video",
      title: `Beat #${scene.sceneNumber} (${scene.timeRange})`,
      prompt: scene.injectedConsistentPrompt,
      url: scene.videoUrl || "",
      thumbnailUrl: scene.thumbnailUrl || "",
      duration: 10,
      aspectRatio: "16:9",
      model: activeModelId,
      provider: "fal",
      createdAt: "",
      batchId: "",
      cost: scene.cost,
      status: "completed",
    })
    setPlayerOpen(true)
  }

  // Lightbox Modal for any created asset or preview
  const [detailModalItem, setDetailModalItem] = React.useState<DetailMediaItem | null>(null)
  const [detailModalOpen, setDetailModalOpen] = React.useState(false)

  // Everything made or uploaded, newest first: what the Library shows
  const libraryAssets = React.useMemo<MediaAsset[]>(() => {
    const uploaded: MediaAsset[] = uploads.map((u) => ({
      id: u.id,
      type: u.type,
      title: u.title,
      prompt: "",
      url: u.url,
      thumbnailUrl: u.type === "image" ? u.url : "",
      aspectRatio: "",
      model: "Uploaded",
      provider: "fal" as ProviderType,
      createdAt: new Date(u.createdAt).toLocaleDateString(),
      batchId: "upload",
      cost: "",
      status: "completed" as const,
      source: "uploaded" as const,
    }))
    return [...assets, ...uploaded]
  }, [assets, uploads])

  // Delete from the device, from every folder, and from the lists on screen
  const deleteItems = (ids: string[]) => {
    const uploadIds = new Set(uploads.map((u) => u.id))
    for (const id of ids) if (uploadIds.has(id)) void removeUpload(id)
    void removeResults(ids.filter((id) => !uploadIds.has(id)))
    forgetItems(ids)
    savedResultIds.current = new Set([...savedResultIds.current].filter((id) => !ids.includes(id)))
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)))
  }

  // Reuse: back to the composer in the result's own mode, with its prompt. The picture is not added as a reference: that is what
  // "Use as reference" and "Turn into video" are for.
  const reuseResult = (item: DetailMediaItem) => {
    setMainTab("chat")
    setReuseRequest({ nonce: Date.now(), mode: item.type, prompt: item.prompt, id: item.id, name: item.title })
  }

  // Try again after a failed reply: send the last thing the user wrote, in the same mode
  const retryLast = () => {
    const last = [...messages].reverse().find((m) => m.role === "user")
    if (!last || isGenerating) return
    setMessages((prev) => prev.slice(0, prev.lastIndexOf(last)))
    handleSendMessage({ prompt: last.content, mode: composerMode === "plan" ? "plan" : "chat", targetDuration: 30, batchCount: 1, aspectRatio: "16:9", modelId: activeModelId })
  }

  // History: the icon sits in the composer's top right; its list slides out from behind the composer
  const historyProps = {
    activeId: conversationId,
    kind: (composerMode === "plan" ? "agent" : "chat") as "chat" | "agent",
    busy: isGenerating,
    onOpen: (id: string) => void openConversation(id),
    onNew: startConversation,
    onDeleted: (ids: string[]) => {
      if (ids.includes(conversationId)) startConversation()
    },
  }

  // The header's filters as Create's galleries use them (the kind is the mode, so Type does not apply)
  const mediaFilters = React.useMemo(() => ({ model: modelFilter, status: statusFilter, hideFailed, activity: activityFilter, date: dateRangeFilter }), [modelFilter, statusFilter, hideFailed, activityFilter, dateRangeFilter])
  const isMediaMode = composerMode === "image" || composerMode === "video" || composerMode === "audio"
  const renderFeed = (docked: boolean) =>
    isMediaMode ? (
      <MediaGallery
        kind={composerMode as "image" | "video" | "audio"}
        assets={assets}
        pending={mediaMessages.filter((m) => m.job?.status === "running" || m.job?.status === "queued").map((m) => ({ id: m.id, job: m.job!, prompt: m.content }))}
        layoutMode={layoutMode}
        cardSizeStep={cardSizeStep}
        onReuse={reuseResult}
        editActions={editActions}
        onEdit={handleEditVideo}
        onDelete={deleteItems}
        onDismiss={(id) => setMediaMessages((prev) => prev.filter((m) => m.id !== id))}
        filters={mediaFilters}
      />
    ) : (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {composerMode === "chat" && messages.length === 0 && (chatStarted || uiMessages.length > 0) ? (
        <ChatWorkspace
          key={conversationId}
          conversationId={conversationId}
          initialMessages={uiMessages}
          deps={chatDeps}
          context={() => {
            const rec = getRecord(activeModelId)
            return { provider: rec?.provider, model: rec?.name }
          }}
          onMessages={(ui) => saveUiMessages("chat", ui)}
          onBusy={setUiBusy}
          onOpenSettings={() => handleOpenSettings("providers")}
          contextTokens={getRecord(activeModelId)?.summary?.contextTokens}
          modelId={getRecord(activeModelId)?.endpoint}
        />
      ) : composerMode === "plan" && messages.length === 0 && !canUseAgent ? (
        <UpgradeCard feature={FEATURE_NAMES.agent} />
      ) : composerMode === "plan" && messages.length === 0 ? (
        <AgentWorkspace
          key={conversationId}
          conversationId={conversationId}
          initialMessages={uiMessages as StudioUIMessage[]}
          runtime={agentRuntime}
          budgetUsd={settings.aiEngine.agentBudgetUsd ?? 2}
          assets={assets}
          estimate={agentEstimate}
          onOpenAsset={(a) => handleOpenDetailModal({ id: a.id, title: a.title, type: a.type, url: a.url, thumbnailUrl: a.thumbnailUrl, prompt: a.prompt, model: a.model, aspectRatio: a.aspectRatio, status: "completed", activity: "generated", authorName: "You", createdAt: a.createdAt })}
          onMessages={(ui) => saveUiMessages("agent", ui)}
          info={{ model: getRecord(settings.aiEngine.activeTextModelId ?? "")?.name ?? "Chat model", modelId: getRecord(settings.aiEngine.activeTextModelId ?? "")?.endpoint, contextTokens: getRecord(settings.aiEngine.activeTextModelId ?? "")?.summary?.contextTokens, autoApproveUsd: agentAutoApproveUsd(settings.aiEngine), planApproval: settings.aiEngine.agentApprovePlan !== false }}
          onBusy={setUiBusy}
          app={appBuilding?.meta}
          onOpenApp={(spec) => {
            setAppToOpen(spec)
            setMainTab("apps")
          }}
        />
      ) : (
      <ChatView
        isDark={isDark}
        messages={messages}
        onSelectSuggestion={(sugPrompt, sugMode) => {
          handleSendMessage({
            prompt: sugPrompt,
            mode: sugMode || "video",
            targetDuration: 30,
            batchCount: 4,
            aspectRatio: "16:9",
            characterRef: activeCharacterRef,
            modelId: activeModelId,
          })
        }}
        onOpenDetail={handleOpenDetailModal}
        onOpenSettings={handleOpenSettings}
        onRetry={retryLast}
        isRightDocked={docked}
        kind={composerMode === "plan" ? "agent" : "chat"}
      />
      )}
      </div>
    )

  const handleOpenDetailModal = (item: DetailMediaItem) => {
    setDetailModalItem(item)
    setDetailModalOpen(true)
  }

  // An image made into a video: the composer opens in video mode with the image attached (it becomes the start frame
  // on a model that takes one, a reference on one that takes those)
  const handleTurnToVideo = (item: DetailMediaItem) => {
    setDetailModalOpen(false)
    setMainTab("chat")
    setReuseRequest({ nonce: Date.now(), mode: "video", prompt: item.prompt, id: item.id, name: item.title, imageUrl: item.type === "image" ? item.url : item.thumbnailUrl })
  }

  const handleRecreate = (item: DetailMediaItem) => {
    setDetailModalOpen(false)
    reuseResult(item)
  }

  const handleUseAsReference = (item: DetailMediaItem) => {
    setDetailModalOpen(false)
    setMainTab("chat")
    setReuseRequest({ nonce: Date.now(), mode: item.type === "video" ? "video" : "image", prompt: "", id: item.id, name: item.title, imageUrl: item.type === "image" ? item.url : item.thumbnailUrl })
  }

  // What the switched-on models can really do with a finished video, offered from the opened video
  const listedModels = useListedModels()
  // Bookmarks start from what the person had switched on, or the best of each kind
  React.useEffect(() => {
    seedBookmarks(listedModels, settings.aiEngine.enabledChatModelIds)
  }, [listedModels, settings.aiEngine.enabledChatModelIds])
  // A model slot in Settings left empty (a new key, or a saved model that was retired) is filled with the strongest model
  // the keys can run, so Chat and the agent always have one assigned and Settings shows it
  React.useEffect(() => {
    const slots = [
      ["activeTextModelId", "text"],
      ["activeImageModelId", "image"],
      ["activeVideoModelId", "video"],
      ["activeAudioModelId", "audio"],
    ] as const
    setSettings((s) => {
      let next = s
      for (const [key, modality] of slots) {
        if (next.aiEngine[key] && listedModels.some((m) => m.id === next.aiEngine[key])) continue
        const pick = defaultModelFor(modality, listedModels)
        if (pick) next = { ...next, aiEngine: { ...next.aiEngine, [key]: pick.id } }
      }
      return next
    })
  }, [listedModels])
  const editActions = React.useMemo(() => editActionsFor(listedModels, enabledSet(listedModels, settings.aiEngine.enabledChatModelIds)), [listedModels, settings.aiEngine.enabledChatModelIds])

  // Edit, extend, lip-sync: the opened video goes to the composer with the model that does it, and the person says what to change
  const handleEditVideo = (item: DetailMediaItem, action: EditAction) => {
    setDetailModalOpen(false)
    setMainTab("chat")
    setReuseRequest({
      nonce: Date.now(),
      mode: "video",
      prompt: "",
      id: item.id,
      name: item.title,
      edit: { videoUrl: item.url, videoName: item.title, modelId: action.record.id, task: action.task },
    })
  }

  return (
    <TooltipProvider delayDuration={150}>
    <ToolHostProvider value={{ settings, projectId: activeProject?.id, onAssets: (added) => setAssets((prev) => [...added, ...prev]), onOpenSettings: () => handleOpenSettings("providers") }}>
      <div className="app-root relative h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      {/* 1. MASTER PASSWORD GATE: Strictly locked until authenticated */}
      <MasterPasswordGate
        isLocked={isLocked}
        onUnlock={handleUnlockStudio}
      />

      {setupOpen && !isLocked && (
        <OnboardingFlow
          settings={settings}
          onSaveSettings={setSettings}
          onFinish={() => {
            setSetupOpen(false)
            setMainTab("chat")
          }}
        />
      )}

      {/* 1. TOP HEADER: Sits in Layer 1 Outer Background */}
      <TitleBar
        activeTab={mainTab}
        onTabChange={(tab) => {
          if (tab === "projects") {
            setProjectModalOpen(true)
          } else {
            if (tab === "tutorials") setTutorialsTarget(undefined)
            setMainTab(tab)
          }
        }}
        activeProject={activeProject}
        onOpenProjects={() => setProjectModalOpen(true)}
        isDark={isDark}
        onToggleTheme={() => setAppearance({ dark: !isDark })}
        onOpenSettings={handleOpenSettings}
        onOpenUsage={() => handleOpenSettings("usage")}
        showMediaTools={mainTab === "chat" && (composerMode === "image" || composerMode === "video" || composerMode === "audio")}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        cardSizeStep={cardSizeStep}
        onCardSizeStepChange={setCardSizeStep}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        modelFilter={modelFilter}
        onModelFilterChange={setModelFilter}
        dateRangeFilter={dateRangeFilter}
        onDateRangeFilterChange={setDateRangeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        hideFailed={hideFailed}
        onHideFailedChange={setHideFailed}
        activityFilter={activityFilter}
        onActivityFilterChange={setActivityFilter}
        onLockApp={handleLockStudio}
      />

      {/* 2. INNER 2ND LAYER BACKGROUND: Left, right, top padding, NO padding in bottom */}
      <div className="flex-1 px-3 pt-2 pb-0 overflow-hidden flex flex-col relative z-10">
        <div className="relative flex-1 w-full h-full rounded-t-2xl border-t border-x border-border/40 bg-background/50 overflow-clip flex flex-col backdrop-blur-xs">
          {/* Background Dot Field with cursor hover bulge & glow inside Layer 2 */}
          <div className="absolute inset-0 pointer-events-none ambient-top-light z-0" />
          <div className="absolute bottom-0 left-0 right-0 h-3/4 pointer-events-none ambient-bottom-center-gradient animate-bottom-rise z-0" />
          <DotField
            dotRadius={1.0}
            dotSpacing={32}
            baseAlpha={isDark ? 0.06 : 0.05}
            cursorRadius={350}
            bulgeStrength={48}
            glowRadius={150}
            isDark={isDark}
            className="z-[1]"
          />

          {/* Active Workspace View inside Layer 2 (No pl-20 offsets) */}
          <div className="relative z-10 flex-1 flex flex-col h-full overflow-hidden">
            {mainTab === "home" ? (
              <main className="flex-1 relative overflow-hidden">
                <HomeView
                  settings={settings}
                  onNavigate={(t: HomeTarget) => {
                    if (t.brandTab) setBrandSubTab(t.brandTab)
                    if (t.tab === "tutorials") setTutorialsTarget(t.course ? { course: t.course, video: t.video } : undefined)
                    setMainTab(t.tab)
                  }}
                  onOpenSettings={handleOpenSettings}
                />
              </main>
            ) : mainTab === "docs" ? (
              <main className="flex-1 relative overflow-hidden">
                <DocsView />
              </main>
            ) : mainTab === "support" ? (
              <main className="flex-1 relative overflow-hidden">
                <SupportView
                  settings={settings}
                  onNavigate={(tab) => {
                    if (tab === "tutorials") setTutorialsTarget(undefined)
                    setMainTab(tab)
                  }}
                />
              </main>
            ) : mainTab === "tutorials" ? (
              <main className="flex-1 relative overflow-hidden">
                <TutorialsView initial={tutorialsTarget} />
              </main>
            ) : mainTab === "chat" ? (
              /* Main Studio Chat Generator with Dual Docking (Bottom ↔ Right) */
              <main ref={chatContainerRef} className="flex-1 relative overflow-hidden flex">
                {chatPageDockPosition === "bottom" ? (
                  /* DEFAULT BOTTOM DOCK MODE */
                  <div className="relative h-full w-full flex flex-col justify-between overflow-hidden">
                    {renderFeed(false)}

                    {/* Chat Input Bar with BorderGlow + Dock to Right Button */}
                    <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center items-end pointer-events-none pb-0">
                      <ComposerSlot side="bottom">
                        <ChatInput
                        onModeChange={setComposerMode}
                        reuse={reuseRequest}
                          onSendMessage={handleSendMessage}
                          isGenerating={isGenerating}
                          activeModelId={activeModelId}
                          onModelChange={setActiveModelId}
                          activeCharacterRef={activeCharacterRef}
                          onSelectCharacterRef={setActiveCharacterRef}
                          onOpenSettings={handleOpenSettings}
                          settings={settings}
                          onSettingsChange={setSettings}
                          lastAssistantText={lastAssistantText}
                          library={{ assets, projects, activeProjectId: activeProject?.id }}
                          onToggleDock={() => setChatPageDockPosition("right")}
                          history={historyProps}
                        />
                      </ComposerSlot>
                    </div>
                  </div>
                ) : (
                  /* RIGHT DOCKED MODE */
                  <div className="relative h-full w-full flex overflow-hidden">
                    {/* Left Message Feed taking ~70% (resizable) */}
                    <div
                      style={{ width: `${chatLeftWidth}%` }}
                      className="h-full flex flex-col overflow-hidden relative"
                    >
                      {renderFeed(true)}
                    </div>

                    {/* Resizable Divider (Double-click resets to 70% / 30%) */}
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setIsDraggingChatSplit(true)
                      }}
                      onDoubleClick={handleResetChatProportions}
                      title="Drag to resize · Double-click to reset (70% / 30%)"
                      className="w-1 hover:w-1.5 bg-border/30 hover:bg-select/40 transition-all cursor-col-resize shrink-0 z-20"
                    />

                    {/* Right Docked Agent Panel (takes 30%) */}
                    <aside
                      style={{ width: `${100 - chatLeftWidth}%` }}
                      className="h-full border-l border-border/40 flex flex-col bg-background/40 shrink-0 overflow-hidden relative"
                    >
                      {/* Header */}
                      <div className="h-10 border-b border-border/40 px-3.5 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-bold text-foreground">Chat Director Agent</span>
                        </div>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setChatPageDockPosition("bottom")}
                              className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground p-0"
                              aria-label="Dock to Bottom Bar"
                            >
                              <ArrowDownToLine className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Dock to Bottom Bar</TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Panel Quick Status */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar text-xs">
                        <div className="p-3 rounded-xl bg-card/60 border border-border/40 space-y-1.5">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-primary" />
                            <span>Autonomous Director Active</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Generate storyboard beats, inject character references, or compose camera angles directly from this side-docked terminal.
                          </p>
                        </div>
                      </div>

                      {/* Docked Chat Input */}
                      <ComposerSlot side="right">
                        <ChatInput
                        onModeChange={setComposerMode}
                        reuse={reuseRequest}
                          onSendMessage={handleSendMessage}
                          isGenerating={isGenerating}
                          activeModelId={activeModelId}
                          onModelChange={setActiveModelId}
                          activeCharacterRef={activeCharacterRef}
                          onSelectCharacterRef={setActiveCharacterRef}
                          onOpenSettings={handleOpenSettings}
                          settings={settings}
                          onSettingsChange={setSettings}
                          lastAssistantText={lastAssistantText}
                          library={{ assets, projects, activeProjectId: activeProject?.id }}
                          onToggleDock={() => setChatPageDockPosition("bottom")}
                          history={historyProps}
                        />
                      </ComposerSlot>
                    </aside>
                  </div>
                )}
              </main>
            ) : mainTab === "story" ? (
              /* STORY VIEW (Agent beat decomposition & approval workflow) */
              <main className="flex-1 relative overflow-hidden">
                <StoryView
                  onPlayFullStory={handlePlayFullStory}
                  onPlayScene={handlePlayScene}
                  onOpenDetail={handleOpenDetailModal}
                  onSendMessage={handleSendMessage}
                  isGenerating={isGenerating}
                  activeModelId={activeModelId}
                  onModelChange={setActiveModelId}
                  activeCharacterRef={activeCharacterRef}
                  onSelectCharacterRef={setActiveCharacterRef}
                  onOpenSettings={handleOpenSettings}
                  onGenerateText={generateStoryText}
                  getAgentRuntime={agentRuntime}
                  composer={{ settings, onSettingsChange: setSettings, library: { assets, projects, activeProjectId: activeProject?.id } }}
                />
              </main>
            ) : mainTab === "inspiration" ? (
              <main className="flex-1 relative overflow-hidden">
                {!canUseConnectors ? (
                  <UpgradeCard feature={FEATURE_NAMES.connectors} />
                ) : (
                <InspirationView
                  layoutMode={layoutMode}
                  cardSizeStep={cardSizeStep}
                  projectId={activeProject?.id ?? "default"}
                  settings={settings}
                  onOpenSettings={handleOpenSettings}
                  onUse={(req) => {
                    setMainTab("chat")
                    setReuseRequest({ nonce: Date.now(), mode: "image", prompt: req.prompt, id: req.id, name: req.name, imageUrl: req.imageUrl, images: req.images })
                  }}
                />
                )}
              </main>
            ) : mainTab === "library" ? (
              /* PURE GRID WORKSPACE */
              <main className="flex-1 relative overflow-hidden">
                <MediaVaultView
                  type={mainTab}
                  activeProject={activeProject}
                  onNavigateToChat={() => {
                    setMainTab("chat")
                  }}
                  layoutMode={layoutMode}
                  cardSizeStep={cardSizeStep}
                  typeFilter={typeFilter}
                  modelFilter={modelFilter}
                  statusFilter={statusFilter}
                  hideFailed={hideFailed}
                  activityFilter={activityFilter}
                  dateRangeFilter={dateRangeFilter}
                  searchQuery={searchQuery}
                  studioAssets={libraryAssets}
                  onDeleteItems={deleteItems}
                  onReuse={reuseResult}
                  editActions={editActions}
                  onEdit={handleEditVideo}
                />
              </main>
            ) : mainTab === "brand" ? (
              /* BRAND STUDIO VIEW */
              <main className="flex-1 relative overflow-hidden">
                <BrandStudioView
                  settings={settings}
                  onOpenSettings={handleOpenSettings}
                  onGenerateText={generateStoryText}
                  activeSubTab={brandSubTab}
                  onSubTabChange={setBrandSubTab}
                  onSelectActiveBrand={(brand) => {
                    setActiveBrandKit(brand)
                    setSettings((prev) => ({
                      ...prev,
                      brand: {
                        ...prev.brand,
                        brandName: brand.name,
                        signatureTag: brand.tagline || brand.name,
                      },
                    }))
                  }}
                />
              </main>
            ) : (
              /* APPS: small tools that make things, built by the agent or shipped with the studio */
              <main className="flex-1 relative overflow-hidden">
                <AppsView
                  settings={settings}
                  assets={assets}
                  projectId={activeProject?.id}
                  onBuild={startAppBuild}
                  openRequest={appToOpen}
                  onOpenHandled={() => setAppToOpen(undefined)}
                  layoutMode={layoutMode}
                  cardSizeStep={cardSizeStep}
                  onReuse={reuseResult}
                  onTurnToVideo={handleTurnToVideo}
                  onUseAsReference={handleUseAsReference}
                  onDelete={deleteItems}
                  editActions={editActions}
                  onEditMedia={handleEditVideo}
                  onOpenSettings={handleOpenSettings}
                  onAssets={(added) => setAssets((prev) => [...added, ...prev])}
                  onOpenAsset={(a) => handleOpenDetailModal({ id: a.id, title: a.title, type: a.type, url: a.url, thumbnailUrl: a.thumbnailUrl, prompt: a.prompt, model: a.model, aspectRatio: a.aspectRatio, status: "completed", activity: "generated", authorName: "You", createdAt: a.createdAt })}
                />
              </main>
            )}
          </div>
        </div>
      </div>

      {/* 5. PROJECTS MODAL (Hub to select/create project) */}
      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
      />

      {/* 6. SETTINGS MODAL (Top left title, icon-only tabs, AI Engine split view) */}
      <NoticeToast />
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSaveSettings={setSettings}
        initialTab={initialSettingsTab}
      />

      {/* 7. VIDEO STITCHER & PLAYER */}
      <VideoStitcherPlayer
        open={playerOpen}
        onOpenChange={setPlayerOpen}
        scenes={playerScenes}
        singleAsset={playerSingleAsset}
      />

      {/* 8. MEDIA DETAIL LIGHTBOX MODAL */}
      <MediaDetailModal
        item={detailModalItem}
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onTurnToVideo={handleTurnToVideo}
        onRecreate={handleRecreate}
        onUseAsReference={handleUseAsReference}
        editActions={editActions}
        onEdit={handleEditVideo}
      />
    </div>
    </ToolHostProvider>
    </TooltipProvider>
  )
}

export default App
